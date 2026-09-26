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
import { filterBranchesForRepository } from "./branch-scope.js";
import { NotFoundError } from "./errors.js";
import type {
  LoreBackend,
  RevisionInfoParams,
  RevisionListParams,
  RevisionListResult,
  RevisionTreeParams,
  RevisionTreeResult,
} from "./types.js";

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
      for await (const response of revisionClient.branchList({})) {
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
        for await (const response of thinClient.revisionTree(request)) {
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
        const response = await revisionClient.revisionList(request);
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
        const response = await thinClient.revisionInfo(request);
        return response.revision ?? null;
      } catch (err) {
        if (isNotFound(err)) {
          return null;
        }
        throw err;
      }
    },
  };
}

function isNotFound(err: unknown): boolean {
  return err instanceof ConnectError && err.code === Code.NotFound;
}
