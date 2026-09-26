import type { Branch, RevisionItem, Repository } from "@epic-lore-webui/lore-client/gen/lore/model/v1/model_pb";
import type { RevisionTreeHeader } from "@epic-lore-webui/lore-client/gen/lore/thin_client/v1/thin_client_pb";
import type { Revision, TreeNode } from "@epic-lore-webui/lore-client/gen/lore/thin_client/v1/model_pb";

export interface RevisionTreeParams {
  branchId: Uint8Array;
  /** `RevisionTreeRequest.path_prefix` -- unset/empty walks from the repository root. */
  pathPrefix?: string | undefined;
  /** `RevisionTreeRequest.max_depth` -- unset/0 means unbounded descent below the prefix root. */
  maxDepth?: number | undefined;
}

export interface RevisionTreeResult {
  header: RevisionTreeHeader;
  nodes: TreeNode[];
}

/**
 * v1 task 2 (revision history + multi-lane branch graph).
 * `lore.revision.v1.RevisionService.RevisionList` is unary (one page per
 * call), cursor-anchored via `RevisionListRequest.start`
 * (revision.proto:186-201).
 */
export interface RevisionListParams {
  branchId: Uint8Array;
  /**
   * Signature cursor to anchor the page at (a prior response's
   * `signatureForward`/`signatureBackward`). Unset resolves to the branch
   * tip (`RevisionIdentifier.number === 0`).
   */
  cursor?: Uint8Array | undefined;
}

export interface RevisionListResult {
  items: RevisionItem[];
  signatureForward?: Uint8Array | undefined;
  signatureBackward?: Uint8Array | undefined;
}

/**
 * `lore.thin_client.v1.ThinClientService.RevisionInfo` -- the only RPC
 * that returns a revision's ancestry (`parent_self`/`parent_other`).
 * See `RevisionItemDto`'s doc comment in packages/api-types/src/revision.ts
 * for why the web app calls this sparingly (per branch tip), not per
 * revision.
 */
export interface RevisionInfoParams {
  branchId: Uint8Array;
  /** `0` resolves to the branch tip, matching `RevisionIdentifier`'s own convention. */
  number: bigint;
}

/**
 * Internal data-source interface for v1 task 1 (repo browse + file tree).
 * `fixture.ts` and `grpc.ts` both implement this; route handlers
 * (../routes/repositories.ts) are written against this interface only and
 * never know which one is live. Selected once at boot by `LORE_BACKEND`
 * (see ../config.ts) -- default `fixture`, so the app runs with no
 * `lore-server` reachable at all.
 */
export interface LoreBackend {
  listRepositories(): Promise<Repository[]>;
  getRepository(id: Uint8Array): Promise<Repository | null>;
  /**
   * Branches belonging to `repository`, already filtered down from the
   * server's global branch list -- see branch-scope.ts for why that
   * filtering has to happen here rather than being a server-side query
   * parameter.
   */
  listBranchesForRepository(repository: Repository): Promise<Branch[]>;
  getRevisionTree(params: RevisionTreeParams): Promise<RevisionTreeResult>;
  /** A single page of a branch's revision history, newest-to-oldest. */
  listRevisions(params: RevisionListParams): Promise<RevisionListResult>;
  /** The full record (including ancestry) for one revision. `null` if not found. */
  getRevisionInfo(params: RevisionInfoParams): Promise<Revision | null>;
}
