import { create } from "@bufbuild/protobuf";
import { Code, ConnectError, createClient } from "@connectrpc/connect";
import { createLoreTransport } from "@epic-lore-webui/lore-client";
import type { Branch, Repository } from "@epic-lore-webui/lore-client/gen/lore/model/v1/model_pb";
import { RevisionIdentifierSchema } from "@epic-lore-webui/lore-client/gen/lore/model/v1/model_pb";
import { RepositoryService } from "@epic-lore-webui/lore-client/gen/lore/repository/v1/repository_pb";
import { RevisionListRequestSchema, RevisionService } from "@epic-lore-webui/lore-client/gen/lore/revision/v1/revision_pb";
import {
  RevisionDiffRequestSchema,
  RevisionInfoRequestSchema,
  RevisionTreeRequestSchema,
  ThinClientService,
} from "@epic-lore-webui/lore-client/gen/lore/thin_client/v1/thin_client_pb";
import { ContentDiffRequestSchema } from "@epic-lore-webui/lore-client/gen/lore/thin_client/v1/model_pb";
import type {
  ContentDiffHeader,
  DiffChange,
  DiffConflict,
  DiffPartition,
  Revision,
} from "@epic-lore-webui/lore-client/gen/lore/thin_client/v1/model_pb";
import {
  LockRequestSchema,
  LockService,
  QueryRequestSchema,
  ResourceSchema,
  UnlockRequestSchema,
  type Lock,
  type Resource,
} from "@epic-lore-webui/lore-client/gen/lock_pb";
import {
  NotificationService,
  SubscribeRequestSchema,
  type Event,
} from "@epic-lore-webui/lore-client/gen/lore_notification_pb";
import { filterBranchesForRepository } from "./branch-scope.js";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "./errors.js";
import type {
  ContentDiffParams,
  ContentDiffResult,
  LockMutationParams,
  LoreBackend,
  NotificationSubscribeParams,
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
 * gRPC metadata keys `lore-transport` (the reference client, see
 * `lore-transport/src/grpc/mod.rs`'s `inject_repository`) attaches to every
 * repository-scoped call: `PARTITION_ID_KEY = "lore-partition-bin"` and
 * `REPOSITORY_ID_KEY = "urc-repository-id-bin"`, both set to the target
 * repository's raw id bytes. **Confirmed against a live `lore-server`**
 * (docker-compose demo stack, 2026-09-29): `BranchList`/`RevisionList`/
 * `RevisionInfo`/`RevisionTree` all return `PermissionDenied: Unauthorized`
 * with a valid bearer token but no such metadata, and succeed once it is
 * attached -- this is required regardless of how the bearer token itself is
 * sourced (task 8's concern, not this one). Binary (`-bin`-suffixed) gRPC
 * metadata is base64 over the wire; neither `@connectrpc/connect` nor
 * `@connectrpc/connect-node` encode this for you, so it's done here.
 *
 * Separately (also confirmed live): `BranchList` scoped by this metadata
 * actually filters its results to the named repository server-side --
 * contradicting `branch-scope.ts`'s doc comment, written before this was
 * known, which says `BranchList` streams every branch unfiltered. The
 * ancestry-root client-side filter in `filterBranchesForRepository` is
 * therefore redundant once this metadata is attached (not incorrect --
 * harmless double-filtering), kept as defense-in-depth in case a future
 * server build relaxes or changes this scoping.
 *
 * v1 task 8 adds `authToken`: the per-repository AuthZ token
 * (`ExchangeUserTokenForMultiresourceToken`, see ../auth/authz-client.ts),
 * attached as a plain `authorization: Bearer` header alongside the binary
 * repository-scoping metadata -- confirmed live both are required together
 * (see this file's `createGrpcBackend` doc comment for the end-to-end
 * finding). `undefined` (fixture-mode callers never reach this function;
 * an authenticated `grpc`-mode caller with no session was already rejected
 * by ../server.ts's auth-gate hook before reaching here) omits the header
 * entirely, which a real `lore-server` treats as `Unauthenticated` -- not
 * silently downgraded to an anonymous call.
 */
function repositoryHeaders(repositoryId: Uint8Array, authToken?: string): Headers {
  const value = Buffer.from(repositoryId).toString("base64");
  const headers = new Headers();
  headers.set("urc-repository-id-bin", value);
  headers.set("lore-partition-bin", value);
  if (authToken) {
    headers.set("authorization", `Bearer ${authToken}`);
  }
  return headers;
}

/**
 * v1 task 8. For the two `RepositoryService` calls (`listRepositories`/
 * `getRepository`) -- confirmed live these need only a plain bearer token,
 * no repository-scoping metadata and no per-repository AuthZ exchange (see
 * ../auth/request-context.ts's doc comment for the live finding).
 */
function bearerHeaders(authToken?: string): Headers | undefined {
  if (!authToken) {
    return undefined;
  }
  const headers = new Headers();
  headers.set("authorization", `Bearer ${authToken}`);
  return headers;
}

/**
 * Real backend for v1 task 1, dialing `lore-server`'s native gRPC surface.
 * Selected when `LORE_BACKEND=grpc` (see ../config.ts); `addr` is
 * `LORE_SERVER_ADDR` (default `localhost:41337`, the docker-compose demo
 * stack's grpc port). Uses `@connectrpc/connect-node`'s native gRPC
 * transport over plaintext HTTP/2 (h2c) -- no TLS config here, matching a
 * local/demo deployment; a production `LORE_SERVER_ADDR` pointed at a real
 * `https://` endpoint would need TLS options added to
 * `createLoreTransport` at that point.
 */
export function createGrpcBackend(addr: string): LoreBackend {
  const transport = createLoreTransport({ baseUrl: `http://${addr}` });
  const repositoryClient = createClient(RepositoryService, transport);
  const revisionClient = createClient(RevisionService, transport);
  const thinClient = createClient(ThinClientService, transport);
  const lockClient = createClient(LockService, transport);
  const notificationClient = createClient(NotificationService, transport);

  return {
    async listRepositories(authToken?: string): Promise<Repository[]> {
      const out: Repository[] = [];
      for await (const response of repositoryClient.repositoryList({}, { headers: bearerHeaders(authToken) })) {
        if (response.repository) {
          out.push(response.repository);
        }
      }
      return out;
    },

    async getRepository(id: Uint8Array, authToken?: string): Promise<Repository | null> {
      try {
        const response = await repositoryClient.repositoryGet(
          { query: { case: "id", value: id } },
          { headers: bearerHeaders(authToken) },
        );
        return response.repository ?? null;
      } catch (err) {
        if (isNotFound(err)) {
          return null;
        }
        throw mapAuthError(err);
      }
    },

    async listBranchesForRepository(repository: Repository, authToken?: string): Promise<Branch[]> {
      const all: Branch[] = [];
      try {
        for await (const response of revisionClient.branchList(
          {},
          { headers: repositoryHeaders(repository.id, authToken) },
        )) {
          if (response.branch) {
            all.push(response.branch);
          }
        }
      } catch (err) {
        throw mapAuthError(err);
      }
      return filterBranchesForRepository(all, repository);
    },

    async getRevisionTree(params: RevisionTreeParams, authToken?: string): Promise<RevisionTreeResult> {
      const request = create(RevisionTreeRequestSchema, {
        query: {
          case: "identifier",
          value: create(RevisionIdentifierSchema, { branchId: params.branchId, number: 0n }),
        },
        pathPrefix: params.pathPrefix,
        maxDepth: params.maxDepth,
      });

      let header: RevisionTreeResult["header"] | undefined;
      const nodes: RevisionTreeResult["nodes"] = [];
      try {
        for await (const response of thinClient.revisionTree(request, {
          headers: repositoryHeaders(params.repositoryId, authToken),
        })) {
          if (response.payload.case === "header") {
            header = response.payload.value;
          } else if (response.payload.case === "node") {
            nodes.push(response.payload.value);
          }
        }
      } catch (err) {
        if (isNotFound(err)) {
          throw new NotFoundError("branch or revision not found");
        }
        throw mapAuthError(err);
      }
      if (!header) {
        throw new NotFoundError("RevisionTree stream produced no header (branch or revision not found)");
      }
      return { header, nodes };
    },

    async listRevisions(params: RevisionListParams, authToken?: string): Promise<RevisionListResult> {
      const request = create(RevisionListRequestSchema, {
        start: params.cursor
          ? { case: "signature", value: params.cursor }
          : {
              case: "identifier",
              value: create(RevisionIdentifierSchema, { branchId: params.branchId, number: 0n }),
            },
      });
      try {
        const response = await revisionClient.revisionList(request, {
          headers: repositoryHeaders(params.repositoryId, authToken),
        });
        return {
          items: response.items,
          signatureForward: response.signatureForward,
          signatureBackward: response.signatureBackward,
        };
      } catch (err) {
        if (isNotFound(err)) {
          throw new NotFoundError("branch or revision cursor not found");
        }
        throw mapAuthError(err);
      }
    },

    async getRevisionInfo(params: RevisionInfoParams, authToken?: string): Promise<Revision | null> {
      const request = create(RevisionInfoRequestSchema, {
        query: {
          case: "identifier",
          value: create(RevisionIdentifierSchema, { branchId: params.branchId, number: params.number }),
        },
      });
      try {
        const response = await thinClient.revisionInfo(request, {
          headers: repositoryHeaders(params.repositoryId, authToken),
        });
        return response.revision ?? null;
      } catch (err) {
        if (isNotFound(err)) {
          return null;
        }
        throw mapAuthError(err);
      }
    },

    /**
     * v1 task 5. **Confirmed live** (docker-compose demo stack, 2026-09-30,
     * `grpcurl` against this repo's own vendored `lock.proto`): `LockService`
     * needs the same `repositoryHeaders()` metadata as `RevisionService`/
     * `ThinClientService` -- `Query` returned `PermissionDenied: Unauthorized`
     * with a valid bearer token but no such metadata, and succeeded (and
     * correctly scoped its results to the named repository) once attached.
     * `urc.lock.Resource` carries no repository id field at all, so this is
     * the only wire-level scoping mechanism, exactly as task 1 found for the
     * other services.
     */
    async queryLocks(params: QueryLocksParams, authToken?: string): Promise<Lock[]> {
      const request = create(QueryRequestSchema, {
        branch: params.branchId,
        owner: params.owner,
        description: params.description,
      });
      try {
        const response = await lockClient.query(request, {
          headers: repositoryHeaders(params.repositoryId, authToken),
        });
        return response.result;
      } catch (err) {
        throw mapAuthError(err);
      }
    },

    /**
     * **Real-server finding, contradicting `lock.proto`'s own doc comment**
     * ("errors if already locked"): confirmed live that calling `Lock` again
     * on an already-locked resource does **not** error -- it returns a
     * successful response with an empty `locks` array. Returned as-is
     * (whatever `locks` the server actually gives back, including empty) --
     * not translated into a thrown error here, since that would be inventing
     * behavior the real server doesn't have. The fixture backend's
     * `ConflictError`-on-relock behavior is therefore a deliberate fixture
     * simplification of what the proto *says*, not a proven real-server
     * behavior -- see tasks.md task 5.
     */
    async acquireLock(params: LockMutationParams, authToken?: string): Promise<Lock[]> {
      const request = create(LockRequestSchema, {
        resources: [
          create(ResourceSchema, {
            branch: params.resource.branchId,
            hash: params.resource.hash,
            description: params.resource.description,
          }),
        ],
      });
      try {
        const response = await lockClient.lock(request, {
          headers: repositoryHeaders(params.repositoryId, authToken),
        });
        return response.locks;
      } catch (err) {
        throw mapAuthError(err);
      }
    },

    /**
     * **Real-server finding, contradicting `lock.proto`'s own doc comment**
     * ("no-ops if no lock exists"): confirmed live that `Unlock` on a
     * resource with no existing lock returns a real `NotFound: lock does not
     * exist` error, not an empty-`resources` success. Caught here (the same
     * `isNotFound` helper this file already uses for `getRepository`/
     * `getRevisionInfo`) and translated to `[]` so this backend still honors
     * `LoreBackend.releaseLock`'s documented no-op contract -- consistent
     * with the fixture backend and with what the proto claims, even though
     * the real wire behavior differs.
     */
    async releaseLock(params: LockMutationParams, authToken?: string): Promise<Resource[]> {
      const request = create(UnlockRequestSchema, {
        resources: [
          create(ResourceSchema, {
            branch: params.resource.branchId,
            hash: params.resource.hash,
            description: params.resource.description,
          }),
        ],
      });
      try {
        const response = await lockClient.unlock(request, {
          headers: repositoryHeaders(params.repositoryId, authToken),
        });
        return response.resources;
      } catch (err) {
        if (isNotFound(err)) {
          return [];
        }
        throw mapAuthError(err);
      }
    },

    /**
     * v1 task 3. Not confirmed live before this task whether
     * `ThinClientService.RevisionDiff` needs `repositoryHeaders()` the same
     * way `RevisionTree`/`RevisionInfo` do (see task 1's finding, this
     * file's top comment) -- attached here on the same reasoning (same
     * service, same gRPC-metadata-scoping pattern found for every other RPC
     * on this service) but flagged in tasks.md task 3 as an assumption
     * until proven, since the demo stack's seeded branches have no revision
     * content to diff (see tasks.md task 2's note on why).
     */
    async getRevisionDiff(params: RevisionDiffParams, authToken?: string): Promise<RevisionDiffResult> {
      const request = create(RevisionDiffRequestSchema, {
        queryFrom: {
          case: "identifierFrom",
          value: create(RevisionIdentifierSchema, { branchId: params.branchId, number: params.fromNumber }),
        },
        queryTo: {
          case: "identifierTo",
          value: create(RevisionIdentifierSchema, { branchId: params.branchId, number: params.toNumber }),
        },
        autoresolve: params.autoresolve ?? false,
      });

      let header: RevisionDiffResult["header"] | undefined;
      const changes: DiffChange[] = [];
      const conflicts: DiffConflict[] = [];
      const partitions: DiffPartition[] = [];
      try {
        for await (const response of thinClient.revisionDiff(request, {
          headers: repositoryHeaders(params.repositoryId, authToken),
        })) {
          switch (response.payload.case) {
            case "header":
              header = response.payload.value;
              break;
            case "change":
              changes.push(response.payload.value);
              break;
            case "conflict":
              conflicts.push(response.payload.value);
              break;
            case "partition":
              partitions.push(response.payload.value);
              break;
          }
        }
      } catch (err) {
        if (isNotFound(err)) {
          throw new NotFoundError("branch or revision not found");
        }
        throw mapAuthError(err);
      }
      if (!header) {
        throw new NotFoundError("RevisionDiff stream produced no header (branch or revision not found)");
      }
      return { header, changes, conflicts, partitions };
    },

    /**
     * v1 task 3. Same `repositoryHeaders()` assumption/caveat as
     * `getRevisionDiff` above -- `ContentDiff` operates on bare CAS
     * addresses with no revision context, but is still a `ThinClientService`
     * RPC, so the same per-repository partition scoping is expected to
     * apply. Buffers the whole stream and concatenates every `chunk.diff`
     * before returning -- see `packages/api-types/src/diff.ts`'s doc
     * comment on why a chunk boundary must never be assumed to land on a
     * line boundary.
     */
    async getContentDiff(params: ContentDiffParams, authToken?: string): Promise<ContentDiffResult> {
      const request = create(ContentDiffRequestSchema, {
        addressFrom: params.addressFrom,
        addressTo: params.addressTo,
        contextLines: params.contextLines,
        ignoreWhitespaceEol: params.ignoreWhitespaceEol ?? false,
        ignoreWhitespaceInline: params.ignoreWhitespaceInline ?? false,
        maxDiffSize: params.maxDiffSize,
      });

      let header: ContentDiffHeader | undefined;
      let diff = "";
      try {
        for await (const response of thinClient.contentDiff(request, {
          headers: repositoryHeaders(params.repositoryId, authToken),
        })) {
          if (response.payload.case === "header") {
            header = response.payload.value;
          } else if (response.payload.case === "chunk") {
            diff += response.payload.value.diff;
          }
        }
      } catch (err) {
        throw mapAuthError(err);
      }
      if (!header) {
        throw new NotFoundError("ContentDiff stream produced no header");
      }
      return { header, diff };
    },

    /**
     * v1 task 10 (live notifications). `lore.notification.NotificationService.Subscribe`
     * is server-streaming and never completes on its own (confirmed against
     * `lore_notification.proto`'s own shape -- no page/cursor/limit field
     * anywhere on `SubscribeRequest`); the only ways this generator ever
     * stops are `signal` aborting (the route's client-disconnect teardown,
     * ../routes/notifications.ts) or the server itself ending/erroring the
     * call. Not yet separately confirmed live whether `NotificationService`
     * needs `repositoryHeaders()` the same way `RevisionService`/
     * `ThinClientService`/`LockService` do (see this file's top comment) --
     * attached here on the same reasoning (same gRPC-metadata-scoping
     * pattern found for every other repository-scoped RPC on this server)
     * but flagged in tasks.md task 10 as an assumption until proven live.
     */
    async *subscribeToNotifications(
      params: NotificationSubscribeParams,
      signal: AbortSignal,
      authToken?: string,
    ): AsyncIterable<Event> {
      const request = create(SubscribeRequestSchema, { repository: params.repositoryId });
      try {
        for await (const event of notificationClient.subscribe(request, {
          headers: repositoryHeaders(params.repositoryId, authToken),
          signal,
        })) {
          yield event;
        }
      } catch (err) {
        if (signal.aborted) {
          // Client disconnected -- the route already tore down its own side
          // of the HTTP response; this is a clean stop, not a real error to
          // report to a caller that is already gone.
          return;
        }
        throw mapAuthError(err);
      }
    },
  };
}

function isNotFound(err: unknown): boolean {
  return err instanceof ConnectError && err.code === Code.NotFound;
}

/**
 * v1 task 8. Translates the two auth-shaped `ConnectError` codes real
 * `lore-server`/`epic-lore-authz` calls can now return into this repo's own
 * error types (../backend/errors.ts), which ../routes/repositories.ts's
 * `handleRouteError` maps to clean HTTP statuses -- everything else passes
 * through unchanged (still a raw, honest 500 via Fastify's default error
 * handler, same as before this task).
 */
function mapAuthError(err: unknown): unknown {
  if (err instanceof ConnectError) {
    if (err.code === Code.Unauthenticated) {
      return new UnauthorizedError(err.message);
    }
    if (err.code === Code.PermissionDenied) {
      return new ForbiddenError(err.message);
    }
  }
  return err;
}
