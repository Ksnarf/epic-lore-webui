import type { HexBytes } from "./hex-bytes.js";

/**
 * v1 task 5 (lock management across all branches). Mirrors `urc.lock`
 * (`proto/vendor/lore/lock.proto`) -- note the package: this is the legacy
 * `urc.lock` namespace, not a `lore.*`-prefixed one (there is no
 * `lore.lock`; tasks.md's task 5 title itself names `urc.lock`). All five
 * `LockService` RPCs are plain unary, no streaming.
 *
 * **Real-proto finding:** `urc.lock.Resource` (what is being locked) has no
 * `repository_id` field at all -- just `branch` (bytes), `hash` (bytes, the
 * resource's content address), and `description` (string, typically a file
 * path). Repository scoping therefore works the same way task 1/2 found for
 * `RevisionService`/`ThinClientService`: the BFF attaches the target
 * repository's id as gRPC metadata (`grpc.ts`'s `repositoryHeaders`), not as
 * a request field. See `apps/bff/src/backend/grpc.ts`'s lock methods for
 * the live-verification status of this assumption (recorded in tasks.md
 * task 5, since it was not confirmed for `LockService` specifically by the
 * task 1 investigation, only for `RevisionService`/`ThinClientService`).
 */

/** Mirrors `urc.lock.Resource`. */
export interface LockResourceDto {
  branchId: HexBytes;
  hash: HexBytes;
  description: string;
}

/**
 * Mirrors `urc.lock.Lock`. `lockedAt` is a decimal-string ms-epoch,
 * converted from `google.protobuf.Timestamp` (this repo's first field of
 * that wire type -- see `apps/bff/src/dto/lore.ts`'s `toLockDto`, which uses
 * `@bufbuild/protobuf/wkt`'s `timestampMs`), matching the ms-epoch-string
 * convention already used for `RepositorySummary.created` and
 * `RevisionDto.timestamp`.
 */
export interface LockDto {
  resource: LockResourceDto;
  owner: string;
  lockedAt: string;
}

/**
 * Contract for `GET
 * /api/repositories/:repositoryId/locks?branchId=&owner=&description=`.
 * "Across all branches": `branchId` is optional -- omitting it returns
 * locks across every branch in the repository (`urc.lock.QueryRequest.branch`
 * is itself `optional`, per lock.proto), which is exactly this task's ask.
 * `owner`/`description` are optional narrowing filters, mirroring
 * `QueryRequest`'s other two optional fields.
 */
export interface LockListResponseBody {
  locks: LockDto[];
}

/**
 * Request body for `POST /api/repositories/:repositoryId/locks` (acquire,
 * `urc.lock.LockService.Lock`). One resource per request -- the UI locks one
 * file at a time; `LockRequest.resources` on the wire is a repeated field,
 * but nothing in this task's surgical scope needs batch locking.
 */
export interface LockAcquireRequestBody {
  branchId: HexBytes;
  hash: HexBytes;
  description: string;
}

export interface LockAcquireResponseBody {
  locks: LockDto[];
}

/**
 * Request body for `DELETE /api/repositories/:repositoryId/locks` (release,
 * `urc.lock.LockService.Unlock`). Same resource shape as acquire -- a lock
 * is identified by its resource (branch + hash), not a separate lock id.
 */
export interface LockReleaseRequestBody {
  branchId: HexBytes;
  hash: HexBytes;
  description: string;
}

/**
 * `urc.lock.UnlockResponse` is a no-op (empty `resources`) when no lock
 * existed for the given resource -- see `lock.proto`'s own doc comment on
 * `Unlock` ("no-ops if no lock exists").
 */
export interface LockReleaseResponseBody {
  resources: LockResourceDto[];
}
