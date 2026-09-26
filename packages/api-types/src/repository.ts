import type { HexBytes } from "./hex-bytes.js";

/**
 * A repository as seen at the BFF's JSON boundary (docs/design/api-contract.md
 * section 1, feature 1: `lore.repository.v1.RepositoryService.RepositoryList` /
 * `RepositoryGet`). `bytes` fields (`id`, `defaultBranchId`) are hex per the
 * hex-bytes convention (./hex-bytes.js); `created` (proto `uint64`, Unix epoch
 * milliseconds) is a decimal string, since JSON has no 64-bit integer type and
 * `JSON.stringify` throws on a raw `bigint`.
 */
export interface RepositorySummary {
  id: HexBytes;
  name: string;
  description: string;
  defaultBranchId: HexBytes;
  defaultBranchName: string;
  creator: string;
  created: string;
}

/** Contract for `GET /api/repositories`. */
export interface RepositoryListResponseBody {
  repositories: RepositorySummary[];
}

/** Contract for `GET /api/repositories/:repositoryId`. */
export interface RepositoryGetResponseBody {
  repository: RepositorySummary;
}
