import type { Branch, RevisionItem, Repository } from "@epic-lore-webui/lore-client/gen/lore/model/v1/model_pb";
import type { RevisionDiffHeader, RevisionTreeHeader } from "@epic-lore-webui/lore-client/gen/lore/thin_client/v1/thin_client_pb";
import type {
  ContentDiffHeader,
  DiffChange,
  DiffConflict,
  DiffPartition,
  Revision,
  TreeNode,
} from "@epic-lore-webui/lore-client/gen/lore/thin_client/v1/model_pb";
import type { Lock, Resource } from "@epic-lore-webui/lore-client/gen/lock_pb";

export interface RevisionTreeParams {
  /**
   * Repository this call is scoped to. Required by the real `grpc` backend
   * (see `grpc.ts`'s `repositoryHeaders`) -- confirmed against a live
   * `lore-server` (docker-compose demo stack) that every RevisionService/
   * ThinClientService RPC needs the target repository id as gRPC metadata
   * (`urc-repository-id-bin`/`lore-partition-bin`, matching
   * `lore-transport`'s own `inject_repository`) or the server rejects the
   * call `PermissionDenied` even with a valid bearer token -- this is not
   * carried by any request *message* field, so it has to be threaded
   * through here instead. Unused by `fixture.ts` (no auth concept).
   */
  repositoryId: Uint8Array;
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
  /** See `RevisionTreeParams.repositoryId`'s doc comment -- same real-server requirement. */
  repositoryId: Uint8Array;
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
  /** See `RevisionTreeParams.repositoryId`'s doc comment -- same real-server requirement. */
  repositoryId: Uint8Array;
  branchId: Uint8Array;
  /** `0` resolves to the branch tip, matching `RevisionIdentifier`'s own convention. */
  number: bigint;
}

/**
 * v1 task 5 (lock management across all branches, `urc.lock`). Identifies
 * the resource a lock is about -- see `LockResourceDto` in
 * packages/api-types/src/lock.ts for why `Resource` (`urc.lock.Resource`)
 * carries no repository id.
 */
export interface LockResourceParams {
  branchId: Uint8Array;
  hash: Uint8Array;
  description: string;
}

/**
 * `urc.lock.QueryRequest`'s three fields, all optional -- omitting
 * `branchId` is what makes a query span every branch of the repository
 * ("across all branches", this task's title).
 */
export interface QueryLocksParams {
  /** See `RevisionTreeParams.repositoryId`'s doc comment -- same gRPC-metadata-scoping pattern, applied here to `LockService` (see grpc.ts for this RPC's own live-verification status). */
  repositoryId: Uint8Array;
  branchId?: Uint8Array | undefined;
  owner?: string | undefined;
  description?: string | undefined;
}

/** Shared params for `acquireLock`/`releaseLock` -- both act on exactly one resource (see `LockAcquireRequestBody`'s doc comment on why this repo doesn't expose `urc.lock`'s batch-resource shape). */
export interface LockMutationParams {
  /** See `RevisionTreeParams.repositoryId`'s doc comment. */
  repositoryId: Uint8Array;
  resource: LockResourceParams;
}

/**
 * v1 task 3 (side-by-side text diff), `ThinClientService.RevisionDiff`.
 * **Scope decision** (see `packages/api-types/src/diff.ts`'s top comment):
 * unlike the proto's `RevisionDiffRequest` (which lets "from" and "to" name
 * independently-branched revisions), this repo's surface fixes both sides to
 * one `branchId` with a `fromNumber`/`toNumber` pair -- the only shape the
 * web UI's "diff vs. previous revision" flow needs.
 */
export interface RevisionDiffParams {
  /** See `RevisionTreeParams.repositoryId`'s doc comment -- same real-server requirement. */
  repositoryId: Uint8Array;
  branchId: Uint8Array;
  /** `0` resolves to the branch tip, matching `RevisionIdentifier`'s convention. */
  fromNumber: bigint;
  toNumber: bigint;
  /** `RevisionDiffRequest.autoresolve` -- silently ignored by the server outside 3-way mode. Not surfaced in the route today (no UI control needs it yet); defaults to `false`. */
  autoresolve?: boolean;
}

export interface RevisionDiffResult {
  header: RevisionDiffHeader;
  changes: DiffChange[];
  /** 3-way conflicts, carried through unfiltered -- see `packages/api-types/src/diff.ts`'s top comment on why this task's UI doesn't render them. */
  conflicts: DiffConflict[];
  partitions: DiffPartition[];
}

/**
 * v1 task 3, `ThinClientService.ContentDiff`. Operates purely on CAS
 * addresses (no revision/branch context) -- still needs `repositoryId` for
 * the same gRPC-metadata-scoping reason every other `ThinClientService` RPC
 * does (see `RevisionTreeParams.repositoryId`'s doc comment); not confirmed
 * live for this specific RPC before this task -- see `grpc.ts`'s
 * `getContentDiff` for the live-verification status.
 */
export interface ContentDiffParams {
  repositoryId: Uint8Array;
  /** Empty array means "no content on this side" (`ContentDiffRequest.address_from`'s own doc comment). */
  addressFrom: Uint8Array;
  addressTo: Uint8Array;
  contextLines?: number | undefined;
  ignoreWhitespaceEol?: boolean;
  ignoreWhitespaceInline?: boolean;
  maxDiffSize?: bigint | undefined;
}

export interface ContentDiffResult {
  header: ContentDiffHeader;
  /** Every `chunk.diff` from the stream, concatenated in arrival order -- see `packages/api-types/src/diff.ts`'s doc comment on why this must happen before any line-oriented parsing. `""` when the header reports `binary` or `truncated` (the server emits no chunks in either case). */
  diff: string;
}

/**
 * Internal data-source interface for v1 task 1 (repo browse + file tree).
 * `fixture.ts` and `grpc.ts` both implement this; route handlers
 * (../routes/repositories.ts) are written against this interface only and
 * never know which one is live. Selected once at boot by `LORE_BACKEND`
 * (see ../config.ts) -- default `fixture`, so the app runs with no
 * `lore-server` reachable at all.
 */
/**
 * v1 task 8 (Okta auth). Every `LoreBackend` method takes a trailing,
 * optional `authToken` -- the bearer token the `grpc` backend attaches to
 * that specific call (see grpc.ts's `bearerHeaders`/`repositoryHeaders`).
 * `fixture.ts` ignores it entirely (no auth concept -- see tasks.md task 8's
 * fixture-stays-auth-optional decision).
 *
 * Two DIFFERENT kinds of token, not interchangeable, depending on which
 * `lore-server`/`epic-lore-authz` service the method calls underneath (see
 * ../auth/authz-client.ts's doc comment for the live findings this is based
 * on) -- callers (../routes/*.ts) get both from `request.auth`
 * (../auth/request-context.ts):
 *
 * - **Session token** (`request.auth.sessionToken`): the plain AuthN token
 *   from the login session cookie. Correct for `listRepositories`/
 *   `getRepository` (`RepositoryService` -- confirmed live it needs no
 *   per-repository scoping).
 * - **Repository token** (`await request.auth.repositoryToken(repositoryId)`):
 *   a short-lived AuthZ token scoped to exactly that one repository's
 *   `urc-<hex id>` resource, minted via `ExchangeUserTokenForMultiresourceToken`.
 *   Required by every other method here (`RevisionService`/
 *   `ThinClientService`/`LockService` all returned `PermissionDenied` with
 *   the plain session token, confirmed live -- see grpc.ts's
 *   `repositoryHeaders` doc comment, task 1's original finding).
 */
export interface LoreBackend {
  listRepositories(authToken?: string): Promise<Repository[]>;
  getRepository(id: Uint8Array, authToken?: string): Promise<Repository | null>;
  /**
   * Branches belonging to `repository`, already filtered down from the
   * server's global branch list -- see branch-scope.ts for why that
   * filtering has to happen here rather than being a server-side query
   * parameter.
   */
  listBranchesForRepository(repository: Repository, authToken?: string): Promise<Branch[]>;
  getRevisionTree(params: RevisionTreeParams, authToken?: string): Promise<RevisionTreeResult>;
  /** A single page of a branch's revision history, newest-to-oldest. */
  listRevisions(params: RevisionListParams, authToken?: string): Promise<RevisionListResult>;
  /** The full record (including ancestry) for one revision. `null` if not found. */
  getRevisionInfo(params: RevisionInfoParams, authToken?: string): Promise<Revision | null>;

  /**
   * v1 task 5: locks matching the (optional) branch/owner/description
   * filters, scoped to one repository. Omitting `branchId` spans every
   * branch of the repository -- see `QueryLocksParams`'s doc comment.
   */
  queryLocks(params: QueryLocksParams, authToken?: string): Promise<Lock[]>;
  /** `urc.lock.LockService.Lock` -- errors (throws) if the resource is already locked, per the proto's own doc comment. */
  acquireLock(params: LockMutationParams, authToken?: string): Promise<Lock[]>;
  /** `urc.lock.LockService.Unlock` -- no-ops (returns an empty array) if no lock exists for the resource. */
  releaseLock(params: LockMutationParams, authToken?: string): Promise<Resource[]>;

  /**
   * v1 task 3: the per-path change list between two revisions on one
   * branch. See `RevisionDiffParams`'s doc comment for the same-branch
   * scope decision.
   */
  getRevisionDiff(params: RevisionDiffParams, authToken?: string): Promise<RevisionDiffResult>;
  /** v1 task 3: a unified text diff (or binary/truncated flag) between two CAS addresses. */
  getContentDiff(params: ContentDiffParams, authToken?: string): Promise<ContentDiffResult>;
}
