import { create } from "@bufbuild/protobuf";
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
  FileMode,
  NodeType,
  Revision_ParentSchema,
  RevisionSchema,
  TreeNodeSchema,
  type Revision,
  type TreeNode,
} from "@epic-lore-webui/lore-client/gen/lore/thin_client/v1/model_pb";
import { RevisionTreeHeaderSchema } from "@epic-lore-webui/lore-client/gen/lore/thin_client/v1/thin_client_pb";
import { bytesEqual, filterBranchesForRepository } from "./branch-scope.js";
import { NotFoundError } from "./errors.js";
import { queryFixtureTree } from "./tree-query.js";
import type {
  LoreBackend,
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
  };
}
