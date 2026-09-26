import type { HexBytes } from "./hex-bytes.js";

/** Mirrors `lore.thin_client.v1.NodeType` (proto/vendor/lore/lore/thin_client/v1/model.proto). */
export type TreeNodeType = "DIRECTORY" | "FILE" | "LINK";

/** Mirrors `lore.thin_client.v1.FileMode`. */
export type TreeFileMode = "NONE" | "EXECUTABLE";

/** Mirrors `lore.model.v1.Address` (content hash + addressing context), hex-encoded. */
export interface TreeNodeAddress {
  hash: HexBytes;
  context: HexBytes;
}

/**
 * One entry from a `RevisionTree` stream (docs/design/api-contract.md
 * section 1, feature 1: `lore.thin_client.v1.ThinClientService.RevisionTree`).
 * `size` (proto `uint64`) is a decimal string for the same reason
 * `RepositorySummary.created` is -- see repository.ts.
 */
export interface TreeNodeDto {
  path: string;
  nodeType: TreeNodeType;
  address: TreeNodeAddress | null;
  size: string;
  mode: TreeFileMode;
  tracking: boolean;
}

/**
 * Contract for `GET /api/repositories/:repositoryId/branches/:branchId/tree`.
 * Lazy by construction: the route's `path`/`depth` query params map
 * directly onto `RevisionTreeRequest.path_prefix`/`max_depth`
 * (docs/design/stack-decision.md, "File tree") -- the caller re-requests
 * this endpoint with `path` set to a directory's own path to expand it,
 * rather than ever receiving a whole-repository tree in one response.
 */
export interface RevisionTreeResponseBody {
  branchId: HexBytes;
  revisionNumber: string;
  signature: HexBytes;
  nodes: TreeNodeDto[];
}
