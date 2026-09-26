import type { Branch, Repository } from "@epic-lore-webui/lore-client/gen/lore/model/v1/model_pb";
import type { RevisionTreeHeader } from "@epic-lore-webui/lore-client/gen/lore/thin_client/v1/thin_client_pb";
import type { TreeNode } from "@epic-lore-webui/lore-client/gen/lore/thin_client/v1/model_pb";

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
}
