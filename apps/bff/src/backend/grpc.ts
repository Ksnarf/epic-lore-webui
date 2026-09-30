import { create } from "@bufbuild/protobuf";
import { Code, ConnectError, createClient } from "@connectrpc/connect";
import { createLoreTransport } from "@epic-lore-webui/lore-client";
import type { Branch, Repository } from "@epic-lore-webui/lore-client/gen/lore/model/v1/model_pb";
import { RevisionIdentifierSchema } from "@epic-lore-webui/lore-client/gen/lore/model/v1/model_pb";
import { RepositoryService } from "@epic-lore-webui/lore-client/gen/lore/repository/v1/repository_pb";
import { RevisionListRequestSchema, RevisionService } from "@epic-lore-webui/lore-client/gen/lore/revision/v1/revision_pb";
import {
  RevisionInfoRequestSchema,
  RevisionTreeRequestSchema,
  ThinClientService,
} from "@epic-lore-webui/lore-client/gen/lore/thin_client/v1/thin_client_pb";
import type { Revision } from "@epic-lore-webui/lore-client/gen/lore/thin_client/v1/model_pb";
import {
  LockRequestSchema,
  LockService,
  QueryRequestSchema,
  ResourceSchema,
  UnlockRequestSchema,
  type Lock,
  type Resource,
} from "@epic-lore-webui/lore-client/gen/lock_pb";
import { filterBranchesForRepository } from "./branch-scope.js";
import { NotFoundError } from "./errors.js";
import type {
  LockMutationParams,
  LoreBackend,
  QueryLocksParams,
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
 */
function repositoryHeaders(repositoryId: Uint8Array): Headers {
  const value = Buffer.from(repositoryId).toString("base64");
  const headers = new Headers();
  headers.set("urc-repository-id-bin", value);
  headers.set("lore-partition-bin", value);
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

  return {
    async listRepositories(): Promise<Repository[]> {
      const out: Repository[] = [];
      for await (const response of repositoryClient.repositoryList({})) {
        if (response.repository) {
          out.push(response.repository);
        }
      }
      return out;
    },

    async getRepository(id: Uint8Array): Promise<Repository | null> {
      try {
        const response = await repositoryClient.repositoryGet({ query: { case: "id", value: id } });
        return response.repository ?? null;
      } catch (err) {
        if (isNotFound(err)) {
          return null;
        }
        throw err;
      }
    },

    async listBranchesForRepository(repository: Repository): Promise<Branch[]> {
      const all: Branch[] = [];
      for await (const response of revisionClient.branchList(
        {},
        { headers: repositoryHeaders(repository.id) },
      )) {
        if (response.branch) {
          all.push(response.branch);
        }
      }
      return filterBranchesForRepository(all, repository);
    },

    async getRevisionTree(params: RevisionTreeParams): Promise<RevisionTreeResult> {
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
          headers: repositoryHeaders(params.repositoryId),
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
        throw err;
      }
      if (!header) {
        throw new NotFoundError("RevisionTree stream produced no header (branch or revision not found)");
      }
      return { header, nodes };
    },

    async listRevisions(params: RevisionListParams): Promise<RevisionListResult> {
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
          headers: repositoryHeaders(params.repositoryId),
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
        throw err;
      }
    },

    async getRevisionInfo(params: RevisionInfoParams): Promise<Revision | null> {
      const request = create(RevisionInfoRequestSchema, {
        query: {
          case: "identifier",
          value: create(RevisionIdentifierSchema, { branchId: params.branchId, number: params.number }),
        },
      });
      try {
        const response = await thinClient.revisionInfo(request, {
          headers: repositoryHeaders(params.repositoryId),
        });
        return response.revision ?? null;
      } catch (err) {
        if (isNotFound(err)) {
          return null;
        }
        throw err;
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
    async queryLocks(params: QueryLocksParams): Promise<Lock[]> {
      const request = create(QueryRequestSchema, {
        branch: params.branchId,
        owner: params.owner,
        description: params.description,
      });
      const response = await lockClient.query(request, { headers: repositoryHeaders(params.repositoryId) });
      return response.result;
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
    async acquireLock(params: LockMutationParams): Promise<Lock[]> {
      const request = create(LockRequestSchema, {
        resources: [
          create(ResourceSchema, {
            branch: params.resource.branchId,
            hash: params.resource.hash,
            description: params.resource.description,
          }),
        ],
      });
      const response = await lockClient.lock(request, { headers: repositoryHeaders(params.repositoryId) });
      return response.locks;
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
    async releaseLock(params: LockMutationParams): Promise<Resource[]> {
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
        const response = await lockClient.unlock(request, { headers: repositoryHeaders(params.repositoryId) });
        return response.resources;
      } catch (err) {
        if (isNotFound(err)) {
          return [];
        }
        throw err;
      }
    },
  };
}

function isNotFound(err: unknown): boolean {
  return err instanceof ConnectError && err.code === Code.NotFound;
}
