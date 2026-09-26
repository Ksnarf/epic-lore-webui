import { decodeHexBytes, encodeHexBytes } from "@epic-lore-webui/api-types";
import type {
  BranchListResponseBody,
  RepositoryGetResponseBody,
  RepositoryListResponseBody,
  RevisionTreeResponseBody,
} from "@epic-lore-webui/api-types";
import type { FastifyInstance } from "fastify";
import { BadRequestError, NotFoundError } from "../backend/errors.js";
import type { LoreBackend } from "../backend/types.js";
import { toBranchSummary, toRepositorySummary, toTreeNodeDto } from "../dto/lore.js";

/** Shared with routes/revisions.ts (v1 task 2) -- same hex-id parsing convention, one place. */
export function parseHexId(value: string, label: string): Uint8Array {
  try {
    return decodeHexBytes(value);
  } catch {
    throw new BadRequestError(`invalid ${label}: not hex-encoded bytes: ${value}`);
  }
}

function parseDepth(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const depth = Number(value);
  if (!Number.isInteger(depth) || depth < 0) {
    throw new BadRequestError(`invalid depth: expected a non-negative integer, got: ${value}`);
  }
  return depth;
}

/**
 * v1 task 1 (repo browse + file tree) routes. Strictly browsing: repository
 * list, branch list within a repository, and a lazily-loaded file tree
 * (RevisionTree's `path`/`depth` query params map onto
 * `path_prefix`/`max_depth` -- see packages/api-types/src/tree.ts). No
 * diffs, history, locks, or auth here -- those are other v1 tasks.
 *
 * Every route talks to `backend` (LoreBackend, ../backend/types.ts) only --
 * it never knows whether that's the fixture or a real gRPC backend.
 */
export function registerRepositoryRoutes(app: FastifyInstance, backend: LoreBackend): void {
  app.get("/api/repositories", async (): Promise<RepositoryListResponseBody> => {
    const repositories = await backend.listRepositories();
    return { repositories: repositories.map(toRepositorySummary) };
  });

  app.get<{ Params: { repositoryId: string } }>(
    "/api/repositories/:repositoryId",
    async (request, reply) => {
      try {
        const repositoryId = parseHexId(request.params.repositoryId, "repositoryId");
        const repository = await backend.getRepository(repositoryId);
        if (!repository) {
          throw new NotFoundError(`repository not found: ${request.params.repositoryId}`);
        }
        const body: RepositoryGetResponseBody = { repository: toRepositorySummary(repository) };
        return body;
      } catch (err) {
        return handleRouteError(err, reply);
      }
    },
  );

  app.get<{ Params: { repositoryId: string } }>(
    "/api/repositories/:repositoryId/branches",
    async (request, reply) => {
      try {
        const repositoryId = parseHexId(request.params.repositoryId, "repositoryId");
        const repository = await backend.getRepository(repositoryId);
        if (!repository) {
          throw new NotFoundError(`repository not found: ${request.params.repositoryId}`);
        }
        const branches = await backend.listBranchesForRepository(repository);
        const body: BranchListResponseBody = {
          branches: branches.map((branch) => toBranchSummary(branch, repository)),
        };
        return body;
      } catch (err) {
        return handleRouteError(err, reply);
      }
    },
  );

  app.get<{
    Params: { repositoryId: string; branchId: string };
    Querystring: { path?: string; depth?: string };
  }>("/api/repositories/:repositoryId/branches/:branchId/tree", async (request, reply) => {
    try {
      const repositoryId = parseHexId(request.params.repositoryId, "repositoryId");
      const branchId = parseHexId(request.params.branchId, "branchId");
      const maxDepth = parseDepth(request.query.depth);

      const repository = await backend.getRepository(repositoryId);
      if (!repository) {
        throw new NotFoundError(`repository not found: ${request.params.repositoryId}`);
      }

      const { header, nodes } = await backend.getRevisionTree({
        branchId,
        pathPrefix: request.query.path,
        maxDepth,
      });

      const body: RevisionTreeResponseBody = {
        branchId: encodeHexBytes(header.identifier?.branchId ?? branchId),
        revisionNumber: String(header.identifier?.number ?? 0n),
        signature: encodeHexBytes(header.signature),
        nodes: nodes.map(toTreeNodeDto),
      };
      return body;
    } catch (err) {
      return handleRouteError(err, reply);
    }
  });
}

/** Shared with routes/revisions.ts (v1 task 2) -- same BadRequestError/NotFoundError -> HTTP status mapping, one place. */
export function handleRouteError(err: unknown, reply: import("fastify").FastifyReply) {
  if (err instanceof BadRequestError) {
    return reply.code(400).send({ error: err.message });
  }
  if (err instanceof NotFoundError) {
    return reply.code(404).send({ error: err.message });
  }
  throw err;
}
