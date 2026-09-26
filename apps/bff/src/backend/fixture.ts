import { create } from "@bufbuild/protobuf";
import {
  AddressSchema,
  BranchPointSchema,
  BranchSchema,
  RepositorySchema,
  RevisionIdentifierSchema,
  type Branch,
  type Repository,
} from "@epic-lore-webui/lore-client/gen/lore/model/v1/model_pb";
import {
  FileMode,
  NodeType,
  TreeNodeSchema,
  type TreeNode,
} from "@epic-lore-webui/lore-client/gen/lore/thin_client/v1/model_pb";
import { RevisionTreeHeaderSchema } from "@epic-lore-webui/lore-client/gen/lore/thin_client/v1/thin_client_pb";
import { bytesEqual, filterBranchesForRepository } from "./branch-scope.js";
import { NotFoundError } from "./errors.js";
import { queryFixtureTree } from "./tree-query.js";
import type { LoreBackend, RevisionTreeParams, RevisionTreeResult } from "./types.js";

/**
 * Fixture backend for v1 task 1 (repo browse + file tree). Selected when
 * `LORE_BACKEND=fixture` (the default, see ../config.ts) -- lets the UI be
 * fully exercised with no `lore-server` reachable at all.
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

/** Deterministic 32-byte signature/hash, same scheme as fixtureId but wider (matches a real content-hash length). */
function fixtureHash(seed: number): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes[31] = seed;
  return bytes;
}

const REPO_LORE_ID = fixtureId(1);
const REPO_WEBUI_ID = fixtureId(2);

const BRANCH_LORE_MAIN_ID = fixtureId(11);
const BRANCH_LORE_FEATURE_ID = fixtureId(12);
const BRANCH_LORE_RELEASE_ID = fixtureId(13);
const BRANCH_WEBUI_MAIN_ID = fixtureId(21);
const BRANCH_WEBUI_FEATURE_ID = fixtureId(22);

const REVISION_LORE_MAIN_SIGNATURE = fixtureHash(101);
const REVISION_WEBUI_MAIN_SIGNATURE = fixtureHash(102);

const FIXTURE_CREATED_MS = 1_735_689_600_000n; // 2025-01-01T00:00:00Z, arbitrary fixed fixture timestamp

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
    latest: REVISION_LORE_MAIN_SIGNATURE,
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
    latest: REVISION_LORE_MAIN_SIGNATURE,
    deleted: false,
    metadata: new Uint8Array(0),
    stack: [
      create(BranchPointSchema, {
        branchId: BRANCH_LORE_MAIN_ID,
        revisionSignature: REVISION_LORE_MAIN_SIGNATURE,
      }),
    ],
  }),
  create(BranchSchema, {
    id: BRANCH_LORE_RELEASE_ID,
    name: "release/1.0",
    creator: "fixture-seed",
    category: "",
    created: FIXTURE_CREATED_MS,
    latest: REVISION_LORE_MAIN_SIGNATURE,
    deleted: false,
    metadata: new Uint8Array(0),
    stack: [
      create(BranchPointSchema, {
        branchId: BRANCH_LORE_MAIN_ID,
        revisionSignature: REVISION_LORE_MAIN_SIGNATURE,
      }),
    ],
  }),
  create(BranchSchema, {
    id: BRANCH_WEBUI_MAIN_ID,
    name: "main",
    creator: "fixture-seed",
    category: "",
    created: FIXTURE_CREATED_MS,
    latest: REVISION_WEBUI_MAIN_SIGNATURE,
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
    latest: REVISION_WEBUI_MAIN_SIGNATURE,
    deleted: false,
    metadata: new Uint8Array(0),
    stack: [
      create(BranchPointSchema, {
        branchId: BRANCH_WEBUI_MAIN_ID,
        revisionSignature: REVISION_WEBUI_MAIN_SIGNATURE,
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
  };
}
