import { create } from "@bufbuild/protobuf";
import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import { LockSchema, ResourceSchema, type Lock, type Resource } from "@epic-lore-webui/lore-client/gen/lock_pb";
import {
  AddressSchema,
  BranchPointSchema,
  BranchSchema,
  RepositorySchema,
  RevisionIdentifierSchema,
  RevisionItemSchema,
  type Branch,
  type RevisionItem,
  type Repository,
} from "@epic-lore-webui/lore-client/gen/lore/model/v1/model_pb";
import {
  Action,
  ContentDiffHeaderSchema,
  DiffChangeSchema,
  FileMode,
  NodeType,
  Revision_ParentSchema,
  RevisionSchema,
  TreeNodeSchema,
  type ContentDiffHeader,
  type DiffChange,
  type Revision,
  type TreeNode,
} from "@epic-lore-webui/lore-client/gen/lore/thin_client/v1/model_pb";
import {
  RevisionDiffHeaderSchema,
  RevisionTreeHeaderSchema,
} from "@epic-lore-webui/lore-client/gen/lore/thin_client/v1/thin_client_pb";
import { bytesEqual, filterBranchesForRepository } from "./branch-scope.js";
import { ConflictError, NotFoundError } from "./errors.js";
import { queryFixtureTree } from "./tree-query.js";
import type {
  ContentDiffParams,
  ContentDiffResult,
  LockMutationParams,
  LoreBackend,
  QueryLocksParams,
  RevisionDiffParams,
  RevisionDiffResult,
  RevisionInfoParams,
  RevisionListParams,
  RevisionListResult,
  RevisionTreeParams,
  RevisionTreeResult,
} from "./types.js";

/**
 * Fixture backend for v1 tasks 1 (repo browse + file tree) and 2 (revision
 * history + multi-lane branch graph). Selected when `LORE_BACKEND=fixture`
 * (the default, see ../config.ts) -- lets the UI be fully exercised with no
 * `lore-server` reachable at all.
 *
 * Every fixture record is built with the real generated proto message
 * constructors (`create(FooSchema, {...})`) against the vendored protos in
 * `proto/vendor/lore`, not invented ad hoc object literals -- so the shape
 * this backend returns is exactly the shape `grpc.ts` returns, checked by
 * the TypeScript compiler, not just by convention.
 */

/** Deterministic 16-byte id: all-zero except the last byte, so hex output reads as "...0001", "...0002", etc. */
function fixtureId(seed: number): Uint8Array {
  const bytes = new Uint8Array(16);
  bytes[15] = seed;
  return bytes;
}

/**
 * Deterministic 32-byte signature/hash, same scheme as fixtureId but wider
 * (matches a real content-hash length). Encodes `seed` big-endian across
 * the last two bytes (not just one) -- v1 task 2's revision chains use
 * seeds above 255 (e.g. `1000 + revisionNumber`), and a single truncated
 * byte would silently collide across chains (`bytes[31] = seed` wraps
 * mod 256, so seed 1000 and seed 1256 would produce the same "unique"
 * signature). Backward-compatible with every existing seed < 256 (task 1's
 * tree fixtures): `seed >> 8` is 0 for those, so `bytes[30]` stays 0 same
 * as before.
 */
function fixtureHash(seed: number): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes[30] = (seed >> 8) & 0xff;
  bytes[31] = seed & 0xff;
  return bytes;
}

const REPO_LORE_ID = fixtureId(1);
const REPO_WEBUI_ID = fixtureId(2);

const BRANCH_LORE_MAIN_ID = fixtureId(11);
const BRANCH_LORE_FEATURE_ID = fixtureId(12);
const BRANCH_LORE_RELEASE_ID = fixtureId(13);
const BRANCH_WEBUI_MAIN_ID = fixtureId(21);
const BRANCH_WEBUI_FEATURE_ID = fixtureId(22);

const FIXTURE_CREATED_MS = 1_735_689_600_000n; // 2025-01-01T00:00:00Z, arbitrary fixed fixture timestamp

// --- v1 task 2 fixture revision chains ------------------------------------
//
// Real revision graphs (`lore.thin_client.v1.Revision`, `create(RevisionSchema,
// {...})` -- not invented object literals, same convention as the rest of
// this file), built so the multi-lane branch graph has a genuinely
// interesting topology to render: a branch point (twice), parallel lanes
// (feature/release both open concurrently), and one real two-parent merge.
//
// **Real-proto finding (task 2):** `lore.model.v1.RevisionItem` -- the lean
// list-row projection `RevisionList` returns -- carries no parent/ancestry
// field at all. Only the full `Revision` record (`ThinClientService.RevisionInfo`)
// carries `parent_self`/`parent_other`, and `parent_other` is the *only*
// wire signal that a revision is a merge. This backend therefore keeps one
// canonical `Revision[]` per branch (`revisionsByBranchId` below) and
// derives `RevisionItem`s from it for `listRevisions`, exactly mirroring
// what a real server does per `RevisionItem`'s own doc comment ("Lean
// projection of a revision used in list responses").
function makeParent(parent: { branchId: Uint8Array; signature: Uint8Array; number: bigint }) {
  return create(Revision_ParentSchema, {
    signature: parent.signature,
    identifier: create(RevisionIdentifierSchema, { branchId: parent.branchId, number: parent.number }),
  });
}

/**
 * Builds `count` revisions (numbers 1..count) on `branchId`. Revision 1's
 * `parent_self` is `forkPoint` when given (unset for a repository's own
 * root branch); every other revision's `parent_self` is simply its
 * predecessor on this same branch (`number - 1`). Returns newest-first
 * (index 0 = tip), matching `RevisionListResponse`'s own ordering.
 */
function buildLinearChain(params: {
  branchId: Uint8Array;
  count: number;
  hashSeedBase: number;
  label: string;
  forkPoint?: { branchId: Uint8Array; signature: Uint8Array; number: bigint } | undefined;
}): Revision[] {
  const { branchId, count, hashSeedBase, label, forkPoint } = params;
  const oldestFirst: Revision[] = [];
  for (let i = 1; i <= count; i++) {
    const number = BigInt(i);
    const previous = oldestFirst[i - 2];
    const parentSelf =
      previous !== undefined
        ? makeParent({ branchId, signature: previous.signature, number: BigInt(i - 1) })
        : forkPoint
          ? makeParent(forkPoint)
          : undefined;
    oldestFirst.push(
      create(RevisionSchema, {
        signature: fixtureHash(hashSeedBase + i),
        identifier: create(RevisionIdentifierSchema, { branchId, number }),
        commitMessage: `${label} revision ${i}`,
        timestamp: FIXTURE_CREATED_MS + BigInt(i) * 3_600_000n,
        createdBy: "fixture-seed",
        committedBy: "fixture-seed",
        metadata: [],
        parentSelf,
        parentOther: undefined,
        number,
      }),
    );
  }
  return [...oldestFirst].reverse();
}

// epic-lore/main: 24 plain revisions, then a 25th (built separately below)
// that merges feature/lazy-tree-loading back in via a real second parent --
// not a fast-forward -- so it exercises Revision.parent_other.
const loreMainBase = buildLinearChain({
  branchId: BRANCH_LORE_MAIN_ID,
  count: 24,
  hashSeedBase: 1000,
  label: "lore/main",
});
const loreMainRev12 = loreMainBase.find((revision) => revision.number === 12n)!; // feature's branch point
const loreMainRev18 = loreMainBase.find((revision) => revision.number === 18n)!; // release's branch point
const loreMainRev24 = loreMainBase[0]!; // newest of the 24-chain; the merge revision's parent_self

const loreFeatureChain = buildLinearChain({
  branchId: BRANCH_LORE_FEATURE_ID,
  count: 6,
  hashSeedBase: 2000,
  label: "lore/feature",
  forkPoint: { branchId: BRANCH_LORE_MAIN_ID, signature: loreMainRev12.signature, number: 12n },
});
const loreFeatureTip = loreFeatureChain[0]!;

const loreReleaseChain = buildLinearChain({
  branchId: BRANCH_LORE_RELEASE_ID,
  count: 4,
  hashSeedBase: 3000,
  label: "lore/release",
  forkPoint: { branchId: BRANCH_LORE_MAIN_ID, signature: loreMainRev18.signature, number: 18n },
});

const loreMainMergeRevision: Revision = create(RevisionSchema, {
  signature: fixtureHash(1025),
  identifier: create(RevisionIdentifierSchema, { branchId: BRANCH_LORE_MAIN_ID, number: 25n }),
  commitMessage: "lore/main revision 25 (merge lore/feature)",
  timestamp: FIXTURE_CREATED_MS + 25n * 3_600_000n,
  createdBy: "fixture-seed",
  committedBy: "fixture-seed",
  metadata: [],
  parentSelf: makeParent({ branchId: BRANCH_LORE_MAIN_ID, signature: loreMainRev24.signature, number: 24n }),
  parentOther: makeParent({ branchId: BRANCH_LORE_FEATURE_ID, signature: loreFeatureTip.signature, number: 6n }),
  number: 25n,
});
const loreMainChain: Revision[] = [loreMainMergeRevision, ...loreMainBase]; // newest-first, 25 total

// epic-lore-webui: a smaller, plain (no-merge) topology -- one branch
// point, no merge, kept small since it isn't this task's fixture focus.
const webuiMainChain = buildLinearChain({
  branchId: BRANCH_WEBUI_MAIN_ID,
  count: 5,
  hashSeedBase: 4000,
  label: "webui/main",
});
const webuiMainRev3 = webuiMainChain.find((revision) => revision.number === 3n)!;
const webuiFeatureChain = buildLinearChain({
  branchId: BRANCH_WEBUI_FEATURE_ID,
  count: 3,
  hashSeedBase: 5000,
  label: "webui/feature",
  forkPoint: { branchId: BRANCH_WEBUI_MAIN_ID, signature: webuiMainRev3.signature, number: 3n },
});

/** Full revision records (newest-first), keyed by branch id -- see `hexKey` below. Backs `listRevisions`/`getRevisionInfo`. */
const revisionsByBranchId = new Map<string, Revision[]>([
  [hexKey(BRANCH_LORE_MAIN_ID), loreMainChain],
  [hexKey(BRANCH_LORE_FEATURE_ID), loreFeatureChain],
  [hexKey(BRANCH_LORE_RELEASE_ID), loreReleaseChain],
  [hexKey(BRANCH_WEBUI_MAIN_ID), webuiMainChain],
  [hexKey(BRANCH_WEBUI_FEATURE_ID), webuiFeatureChain],
]);

const repositories: Repository[] = [
  create(RepositorySchema, {
    id: REPO_LORE_ID,
    name: "epic-lore",
    description: "Core Lore version-control engine (fixture data, LORE_BACKEND=fixture).",
    defaultBranchId: BRANCH_LORE_MAIN_ID,
    defaultBranchName: "main",
    creator: "fixture-seed",
    created: FIXTURE_CREATED_MS,
    metadata: new Uint8Array(0),
  }),
  create(RepositorySchema, {
    id: REPO_WEBUI_ID,
    name: "epic-lore-webui",
    description: "This web UI, browsing itself (fixture data, LORE_BACKEND=fixture).",
    defaultBranchId: BRANCH_WEBUI_MAIN_ID,
    defaultBranchName: "main",
    creator: "fixture-seed",
    created: FIXTURE_CREATED_MS,
    metadata: new Uint8Array(0),
  }),
];

const branches: Branch[] = [
  create(BranchSchema, {
    id: BRANCH_LORE_MAIN_ID,
    name: "main",
    creator: "fixture-seed",
    category: "",
    created: FIXTURE_CREATED_MS,
    latest: loreMainChain[0]!.signature,
    deleted: false,
    metadata: new Uint8Array(0),
    stack: [], // root branch: repository's own default branch
  }),
  create(BranchSchema, {
    id: BRANCH_LORE_FEATURE_ID,
    name: "feature/lazy-tree-loading",
    creator: "fixture-seed",
    category: "",
    created: FIXTURE_CREATED_MS,
    latest: loreFeatureChain[0]!.signature,
    deleted: false,
    metadata: new Uint8Array(0),
    stack: [
      create(BranchPointSchema, {
        branchId: BRANCH_LORE_MAIN_ID,
        revisionSignature: loreMainRev12.signature,
      }),
    ],
  }),
  create(BranchSchema, {
    id: BRANCH_LORE_RELEASE_ID,
    name: "release/1.0",
    creator: "fixture-seed",
    category: "",
    created: FIXTURE_CREATED_MS,
    latest: loreReleaseChain[0]!.signature,
    deleted: false,
    metadata: new Uint8Array(0),
    stack: [
      create(BranchPointSchema, {
        branchId: BRANCH_LORE_MAIN_ID,
        revisionSignature: loreMainRev18.signature,
      }),
    ],
  }),
  create(BranchSchema, {
    id: BRANCH_WEBUI_MAIN_ID,
    name: "main",
    creator: "fixture-seed",
    category: "",
    created: FIXTURE_CREATED_MS,
    latest: webuiMainChain[0]!.signature,
    deleted: false,
    metadata: new Uint8Array(0),
    stack: [],
  }),
  create(BranchSchema, {
    id: BRANCH_WEBUI_FEATURE_ID,
    name: "feature/file-tree-view",
    creator: "fixture-seed",
    category: "",
    created: FIXTURE_CREATED_MS,
    latest: webuiFeatureChain[0]!.signature,
    deleted: false,
    metadata: new Uint8Array(0),
    stack: [
      create(BranchPointSchema, {
        branchId: BRANCH_WEBUI_MAIN_ID,
        revisionSignature: webuiMainRev3.signature,
      }),
    ],
  }),
];

function fixtureFile(path: string, hashSeed: number, sizeBytes: number, mode: FileMode = FileMode.NONE): TreeNode {
  return create(TreeNodeSchema, {
    path,
    nodeType: NodeType.FILE,
    address: create(AddressSchema, { hash: fixtureHash(hashSeed), context: new Uint8Array(0) }),
    size: BigInt(sizeBytes),
    mode: BigInt(mode),
    tracking: false,
  });
}

function fixtureDir(path: string, cumulativeSizeBytes: number): TreeNode {
  return create(TreeNodeSchema, {
    path,
    nodeType: NodeType.DIRECTORY,
    address: undefined,
    size: BigInt(cumulativeSizeBytes),
    mode: 0n,
    tracking: false,
  });
}

// Every branch of a repository shares that repository's fixture tree here,
// keyed by branch id -- fine for browse-only fixture coverage; a real
// server would diverge per revision.
const treesByBranchId = new Map<string, TreeNode[]>();

const loreTree: TreeNode[] = [
  fixtureDir("crates", 4200),
  fixtureDir("crates/lore-revision", 2600),
  fixtureFile("crates/lore-revision/Cargo.toml", 201, 512),
  fixtureDir("crates/lore-revision/src", 2088),
  fixtureFile("crates/lore-revision/src/lib.rs", 202, 1024),
  fixtureFile("crates/lore-revision/src/metadata.rs", 203, 1064),
  fixtureDir("crates/lore-server", 1600),
  fixtureFile("crates/lore-server/Cargo.toml", 204, 480),
  fixtureDir("crates/lore-server/src", 1120),
  fixtureFile("crates/lore-server/src/main.rs", 205, 1120, FileMode.EXECUTABLE),
  fixtureFile("README.md", 206, 2048),
  fixtureFile("LICENSE", 207, 1071),
];

const webuiTree: TreeNode[] = [
  fixtureDir("apps", 3300),
  fixtureDir("apps/bff", 1800),
  fixtureFile("apps/bff/package.json", 301, 512),
  fixtureDir("apps/bff/src", 1288),
  fixtureFile("apps/bff/src/server.ts", 302, 1288),
  fixtureDir("apps/web", 1500),
  fixtureFile("apps/web/package.json", 303, 512),
  fixtureDir("apps/web/src", 988),
  fixtureFile("apps/web/src/app.tsx", 304, 988),
  fixtureFile("README.md", 305, 1536),
  fixtureFile("tasks.md", 306, 8192),
];

for (const branchId of [BRANCH_LORE_MAIN_ID, BRANCH_LORE_FEATURE_ID, BRANCH_LORE_RELEASE_ID]) {
  treesByBranchId.set(hexKey(branchId), loreTree);
}
for (const branchId of [BRANCH_WEBUI_MAIN_ID, BRANCH_WEBUI_FEATURE_ID]) {
  treesByBranchId.set(hexKey(branchId), webuiTree);
}

function hexKey(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

// --- v1 task 5 fixture lock store ------------------------------------------
//
// `urc.lock.Resource` carries no repository id (see packages/api-types/src/
// lock.ts's top comment) -- a lock is identified only by its (branch, hash)
// pair. This in-memory store is mutable (acquire/release actually add/remove
// entries), unlike every other fixture collection above, which is static
// seed data -- locks are the first v1 feature this fixture backend lets a
// caller genuinely mutate.

/** Same (branch, hash) identity `urc.lock` itself uses to mean "the same lock" -- not a repository- or description-qualified key. */
function resourceKey(resource: Resource): string {
  return `${hexKey(resource.branch)}:${hexKey(resource.hash)}`;
}

/** Fixture stand-in for "the server stores the caller's own id from auth info" (`urc.lock.Lock.owner`'s own doc comment) -- no auth concept exists yet (task 8), so every fixture-acquired lock is attributed to this fixed name. */
const FIXTURE_LOCK_OWNER = "fixture-user";

/** One pre-seeded lock, so `GET .../locks` has something to show with zero UI interaction: `epic-lore`'s `release/1.0` branch holds a lock on a file description, as if someone were mid-edit preparing a release. */
const locks: Lock[] = [
  create(LockSchema, {
    resource: create(ResourceSchema, {
      branch: BRANCH_LORE_RELEASE_ID,
      hash: fixtureHash(9001),
      description: "crates/lore-server/src/main.rs",
    }),
    owner: "release-manager",
    lockedAt: timestampFromMs(Number(FIXTURE_CREATED_MS) + 20 * 3_600_000),
  }),
];

// --- v1 task 3 fixture revision/content diffs -----------------------------
//
// One realistic multi-file `RevisionDiff` (`lore/main` revision 11 -> 12,
// both real fixture revisions from the chain above) covering every `Action`
// this repo's DiffChangeDto models except COPY (not exercised by anything
// real `lore-server` handler this study read -- left untested rather than
// invented): a text MODIFY (KEEP with differing content, see
// packages/api-types/src/diff.ts's top comment on this reading), a text
// DELETE, a text ADD, a content-preserving rename (MOVE), and a binary
// MODIFY -- plus matching `ContentDiff` fixtures for each content-bearing
// pair, including one genuinely `binary = true` response (this task's
// honest binary handling) and one genuinely empty diff (the rename, whose
// content is byte-identical on both sides).

const DIFF_FROM_NUMBER = 11n;
const DIFF_TO_NUMBER = 12n;
const loreMainRev11 = loreMainBase.find((revision) => revision.number === DIFF_FROM_NUMBER)!;

// Text file, modified in place (same path, different content) -- reuses
// the tree fixture's own `metadata.rs` address (203) as the "from" side so
// this diff fixture and task 1's tree fixture agree on what that file's
// prior content address was.
const METADATA_RS_FROM = fixtureHash(203);
const METADATA_RS_TO = fixtureHash(9203);
// Text file, deleted -- reuses the tree fixture's `main.rs` address (205).
const MAIN_RS_FROM = fixtureHash(205);
// Text file, newly added.
const LIB_RS_TO = fixtureHash(9210);
// Text file, renamed with unchanged content -- reuses the tree fixture's
// `README.md` address (206) on both sides.
const README_UNCHANGED = fixtureHash(206);
// Binary asset, modified in place.
const LOGO_PNG_FROM = fixtureHash(9300);
const LOGO_PNG_TO = fixtureHash(9301);
const EMPTY_ADDRESS = new Uint8Array(0);

const diffChanges: DiffChange[] = [
  create(DiffChangeSchema, {
    path: "crates/lore-revision/src/metadata.rs",
    pathFrom: "",
    action: Action.KEEP,
    nodeType: NodeType.FILE,
    contentFrom: METADATA_RS_FROM,
    contentTo: METADATA_RS_TO,
    automerged: false,
    linkRepositoryIndex: 0,
    tracking: false,
  }),
  create(DiffChangeSchema, {
    path: "crates/lore-server/src/main.rs",
    pathFrom: "",
    action: Action.DELETE,
    nodeType: NodeType.FILE,
    contentFrom: MAIN_RS_FROM,
    contentTo: EMPTY_ADDRESS,
    automerged: false,
    linkRepositoryIndex: 0,
    tracking: false,
  }),
  create(DiffChangeSchema, {
    path: "crates/lore-server/src/lib.rs",
    pathFrom: "",
    action: Action.ADD,
    nodeType: NodeType.FILE,
    contentFrom: EMPTY_ADDRESS,
    contentTo: LIB_RS_TO,
    automerged: false,
    linkRepositoryIndex: 0,
    tracking: false,
  }),
  create(DiffChangeSchema, {
    path: "docs/README.md",
    pathFrom: "README.md",
    action: Action.MOVE,
    nodeType: NodeType.FILE,
    contentFrom: README_UNCHANGED,
    contentTo: README_UNCHANGED,
    automerged: false,
    linkRepositoryIndex: 0,
    tracking: false,
  }),
  create(DiffChangeSchema, {
    path: "assets/logo.png",
    pathFrom: "",
    action: Action.KEEP,
    nodeType: NodeType.FILE,
    contentFrom: LOGO_PNG_FROM,
    contentTo: LOGO_PNG_TO,
    automerged: false,
    linkRepositoryIndex: 0,
    tracking: false,
  }),
];

/** Keyed `${hexKey(branchId)}:${fromNumber}:${toNumber}` -- see `RevisionDiffParams`'s same-branch scope decision. */
const revisionDiffFixtures = new Map<string, RevisionDiffResult>([
  [
    `${hexKey(BRANCH_LORE_MAIN_ID)}:${DIFF_FROM_NUMBER}:${DIFF_TO_NUMBER}`,
    {
      header: create(RevisionDiffHeaderSchema, {
        identifierFrom: create(RevisionIdentifierSchema, { branchId: BRANCH_LORE_MAIN_ID, number: DIFF_FROM_NUMBER }),
        signatureFrom: loreMainRev11.signature,
        identifierTo: create(RevisionIdentifierSchema, { branchId: BRANCH_LORE_MAIN_ID, number: DIFF_TO_NUMBER }),
        signatureTo: loreMainRev12.signature,
        // 2-way mode: base fields unset.
        identifierBase: undefined,
        signatureBase: undefined,
      }),
      changes: diffChanges,
      conflicts: [],
      partitions: [],
    },
  ],
]);

function contentDiffHeader(fields: {
  linesAdded: bigint;
  linesDeleted: bigint;
  binary?: boolean;
  truncated?: boolean;
}): ContentDiffHeader {
  return create(ContentDiffHeaderSchema, {
    linesAdded: fields.linesAdded,
    linesDeleted: fields.linesDeleted,
    binary: fields.binary ?? false,
    truncated: fields.truncated ?? false,
    // 3-way-only fields; every fixture entry here is 2-way.
    hasConflicts: false,
    conflictCount: 0,
  });
}

/** Keyed `${hexKey(addressFrom)}:${hexKey(addressTo)}`. */
const contentDiffFixtures = new Map<string, ContentDiffResult>([
  [
    `${hexKey(METADATA_RS_FROM)}:${hexKey(METADATA_RS_TO)}`,
    {
      header: contentDiffHeader({ linesAdded: 2n, linesDeleted: 1n }),
      diff: [
        "@@ -1,3 +1,4 @@",
        ' pub const REVIEWED_BY: &str = "reviewed-by";',
        '-pub const MERGED_BY: &str = "merged-by";',
        '+pub const MERGED_BY: &str = "merged-by-user";',
        ' pub const CHANGE_REQUEST: &str = "change-request";',
        '+pub const CREATED_BY: &str = "created-by";',
        "",
      ].join("\n"),
    },
  ],
  [
    `${hexKey(MAIN_RS_FROM)}:${hexKey(EMPTY_ADDRESS)}`,
    {
      header: contentDiffHeader({ linesAdded: 0n, linesDeleted: 3n }),
      diff: [
        "@@ -1,3 +0,0 @@",
        "-fn main() {",
        '-    println!("lore-server starting");',
        "-}",
        "",
      ].join("\n"),
    },
  ],
  [
    `${hexKey(EMPTY_ADDRESS)}:${hexKey(LIB_RS_TO)}`,
    {
      header: contentDiffHeader({ linesAdded: 2n, linesDeleted: 0n }),
      diff: ["@@ -0,0 +1,2 @@", "+pub mod handlers;", "+pub mod grpc;", ""].join("\n"),
    },
  ],
  [
    // Rename with byte-identical content on both sides -- a real, honest
    // "no textual change" result, not a special-cased short-circuit.
    `${hexKey(README_UNCHANGED)}:${hexKey(README_UNCHANGED)}`,
    {
      header: contentDiffHeader({ linesAdded: 0n, linesDeleted: 0n }),
      diff: "",
    },
  ],
  [
    `${hexKey(LOGO_PNG_FROM)}:${hexKey(LOGO_PNG_TO)}`,
    {
      // Binary: stats are zero and no chunks are emitted, per
      // `ContentDiffHeader.binary`'s own doc comment -- this task's honest
      // binary handling has nothing more to show here.
      header: contentDiffHeader({ linesAdded: 0n, linesDeleted: 0n, binary: true }),
      diff: "",
    },
  ],
]);

/**
 * Server picks page size (`RevisionListResponse`'s own doc comment) --
 * fixture-only choice, kept small so a curl demonstration of pagination
 * (tasks.md task 2) stays readable. `lore/main`'s 25 fixture revisions
 * therefore span 3 pages (10/10/5).
 */
const PAGE_SIZE = 10;

/** Projects a full `Revision` down to `RevisionList`'s lean `RevisionItem` row -- see this file's top comment on why these are kept separate. */
function toRevisionItem(revision: Revision): RevisionItem {
  return create(RevisionItemSchema, {
    number: revision.number,
    signature: revision.signature,
    // No real per-revision metadata/state content exists in this fixture
    // (only `Revision.metadata`, the k/v list, is populated above, for the
    // few fields the full record actually needs) -- these two are opaque,
    // display-irrelevant fields on the wire type, left empty rather than
    // invented.
    metadata: new Uint8Array(0),
    state: new Uint8Array(0),
  });
}

/** Index of `cursor` within `itemsDesc` (newest-first), or the tip (index 0) when `cursor` is unset. Throws `NotFoundError` on an unresolvable cursor. */
function resolveAnchorIndex(itemsDesc: Revision[], cursor: Uint8Array | undefined): number {
  if (!cursor) {
    return 0;
  }
  const index = itemsDesc.findIndex((revision) => bytesEqual(revision.signature, cursor));
  if (index === -1) {
    throw new NotFoundError(`fixture: no revision for cursor ${hexKey(cursor)}`);
  }
  return index;
}

export function createFixtureBackend(): LoreBackend {
  return {
    async listRepositories(): Promise<Repository[]> {
      return repositories;
    },

    async getRepository(id: Uint8Array): Promise<Repository | null> {
      return repositories.find((repository) => bytesEqual(repository.id, id)) ?? null;
    },

    async listBranchesForRepository(repository: Repository): Promise<Branch[]> {
      return filterBranchesForRepository(branches, repository);
    },

    async getRevisionTree(params: RevisionTreeParams): Promise<RevisionTreeResult> {
      const branch = branches.find((candidate) => bytesEqual(candidate.id, params.branchId));
      if (!branch) {
        throw new NotFoundError(`fixture: no branch for id ${hexKey(params.branchId)}`);
      }
      const allNodes = treesByBranchId.get(hexKey(branch.id)) ?? [];
      const nodes = queryFixtureTree(allNodes, params.pathPrefix, params.maxDepth);
      const header = create(RevisionTreeHeaderSchema, {
        identifier: create(RevisionIdentifierSchema, { branchId: branch.id, number: 1n }),
        signature: branch.latest,
      });
      return { header, nodes };
    },

    async listRevisions(params: RevisionListParams): Promise<RevisionListResult> {
      const itemsDesc = revisionsByBranchId.get(hexKey(params.branchId));
      if (!itemsDesc) {
        throw new NotFoundError(`fixture: no branch for id ${hexKey(params.branchId)}`);
      }
      const anchor = resolveAnchorIndex(itemsDesc, params.cursor);
      const page = itemsDesc.slice(anchor, anchor + PAGE_SIZE);
      return {
        items: page.map(toRevisionItem),
        signatureForward: anchor > 0 ? itemsDesc[anchor - 1]!.signature : undefined,
        signatureBackward: anchor + PAGE_SIZE < itemsDesc.length ? itemsDesc[anchor + PAGE_SIZE]!.signature : undefined,
      };
    },

    async getRevisionInfo(params: RevisionInfoParams): Promise<Revision | null> {
      const itemsDesc = revisionsByBranchId.get(hexKey(params.branchId));
      if (!itemsDesc) {
        return null;
      }
      if (params.number === 0n) {
        return itemsDesc[0] ?? null;
      }
      return itemsDesc.find((revision) => revision.number === params.number) ?? null;
    },

    async queryLocks(params: QueryLocksParams): Promise<Lock[]> {
      const repository = repositories.find((candidate) => bytesEqual(candidate.id, params.repositoryId));
      if (!repository) {
        throw new NotFoundError(`fixture: no repository for id ${hexKey(params.repositoryId)}`);
      }
      const repoBranchIds = new Set(
        filterBranchesForRepository(branches, repository).map((branch) => hexKey(branch.id)),
      );
      return locks.filter((lock) => {
        if (!lock.resource || !repoBranchIds.has(hexKey(lock.resource.branch))) {
          return false;
        }
        if (params.branchId && !bytesEqual(lock.resource.branch, params.branchId)) {
          return false;
        }
        if (params.owner !== undefined && lock.owner !== params.owner) {
          return false;
        }
        if (params.description !== undefined && lock.resource.description !== params.description) {
          return false;
        }
        return true;
      });
    },

    async acquireLock(params: LockMutationParams): Promise<Lock[]> {
      const branch = branches.find((candidate) => bytesEqual(candidate.id, params.resource.branchId));
      if (!branch) {
        throw new NotFoundError(`fixture: no branch for id ${hexKey(params.resource.branchId)}`);
      }
      const resource = create(ResourceSchema, {
        branch: params.resource.branchId,
        hash: params.resource.hash,
        description: params.resource.description,
      });
      const key = resourceKey(resource);
      if (locks.some((lock) => lock.resource && resourceKey(lock.resource) === key)) {
        // Matches `urc.lock.LockService.Lock`'s own doc comment: "errors if already locked".
        throw new ConflictError(`fixture: resource already locked: ${params.resource.description}`);
      }
      const lock = create(LockSchema, {
        resource,
        owner: FIXTURE_LOCK_OWNER,
        lockedAt: timestampFromMs(Date.now()),
      });
      locks.push(lock);
      return [lock];
    },

    async releaseLock(params: LockMutationParams): Promise<Resource[]> {
      const resource = create(ResourceSchema, {
        branch: params.resource.branchId,
        hash: params.resource.hash,
        description: params.resource.description,
      });
      const key = resourceKey(resource);
      const index = locks.findIndex((lock) => lock.resource && resourceKey(lock.resource) === key);
      if (index === -1) {
        // Matches `urc.lock.LockService.Unlock`'s own doc comment: "no-ops if no lock exists".
        return [];
      }
      const [removed] = locks.splice(index, 1);
      return [removed!.resource!];
    },

    async getRevisionDiff(params: RevisionDiffParams): Promise<RevisionDiffResult> {
      const key = `${hexKey(params.branchId)}:${params.fromNumber}:${params.toNumber}`;
      const entry = revisionDiffFixtures.get(key);
      if (!entry) {
        throw new NotFoundError(
          `fixture: no revision diff for branch ${hexKey(params.branchId)} from ${params.fromNumber} to ${params.toNumber}`,
        );
      }
      return entry;
    },

    async getContentDiff(params: ContentDiffParams): Promise<ContentDiffResult> {
      const key = `${hexKey(params.addressFrom)}:${hexKey(params.addressTo)}`;
      const entry = contentDiffFixtures.get(key);
      if (!entry) {
        throw new NotFoundError(`fixture: no content diff for address pair ${key}`);
      }
      return entry;
    },
  };
}
