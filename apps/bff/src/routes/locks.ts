import type {
  LockAcquireRequestBody,
  LockAcquireResponseBody,
  LockListResponseBody,
  LockReleaseRequestBody,
  LockReleaseResponseBody,
} from "@epic-lore-webui/api-types";
import type { FastifyInstance } from "fastify";
import { BadRequestError, NotFoundError } from "../backend/errors.js";
import type { LoreBackend } from "../backend/types.js";
import { toLockDto, toLockResourceDto } from "../dto/lore.js";
import { handleRouteError, parseHexId } from "./repositories.js";

/** Shared body-shape validation for both acquire (`POST`) and release (`DELETE`) -- both take the same `{branchId, hash, description}` resource shape (packages/api-types/src/lock.ts). */
function parseResourceBody(body: unknown): { branchId: Uint8Array; hash: Uint8Array; description: string } {
  if (typeof body !== "object" || body === null) {
    throw new BadRequestError("expected a JSON body with branchId, hash, description");
  }
  const { branchId, hash, description } = body as Record<string, unknown>;
  if (typeof branchId !== "string") {
    throw new BadRequestError("expected string field: branchId");
  }
  if (typeof hash !== "string") {
    throw new BadRequestError("expected string field: hash");
  }
  if (typeof description !== "string") {
    throw new BadRequestError("expected string field: description");
  }
  return {
    branchId: parseHexId(branchId, "branchId"),
    hash: parseHexId(hash, "hash"),
    description,
  };
}

/**
 * v1 task 5 (lock management across all branches) routes. `backend`
 * (LoreBackend, ../backend/types.ts) is the same instance tasks 1/2's routes
 * use -- one data source, selected once at boot by `LORE_BACKEND`.
 *
 * Scope: list + acquire + release only, per tasks.md task 5. `urc.lock.
 * LockService.Status`/`AdminLock` are not exposed here -- `Status` is
 * redundant with `Query` for this UI's purposes, and `AdminLock` (locking on
 * another user's behalf) raises an authorization-surfacing question the API
 * contract study flagged as unresolved (docs/design/api-contract.md section
 * 1, feature 5) and task 8 (auth) hasn't landed yet. No diffs, no auth here
 * -- those are other v1 tasks.
 */
export function registerLockRoutes(app: FastifyInstance, backend: LoreBackend): void {
  app.get<{
    Params: { repositoryId: string };
    Querystring: { branchId?: string; owner?: string; description?: string };
  }>("/api/repositories/:repositoryId/locks", async (request, reply) => {
    try {
      const repositoryId = parseHexId(request.params.repositoryId, "repositoryId");
      const branchId = request.query.branchId ? parseHexId(request.query.branchId, "branchId") : undefined;

      const repository = await backend.getRepository(repositoryId);
      if (!repository) {
        throw new NotFoundError(`repository not found: ${request.params.repositoryId}`);
      }

      const locks = await backend.queryLocks({
        repositoryId,
        branchId,
        owner: request.query.owner,
        description: request.query.description,
      });
      const body: LockListResponseBody = { locks: locks.map(toLockDto) };
      return body;
    } catch (err) {
      return handleRouteError(err, reply);
    }
  });

  app.post<{
    Params: { repositoryId: string };
    Body: LockAcquireRequestBody;
  }>("/api/repositories/:repositoryId/locks", async (request, reply) => {
    try {
      const repositoryId = parseHexId(request.params.repositoryId, "repositoryId");
      const resource = parseResourceBody(request.body);

      const repository = await backend.getRepository(repositoryId);
      if (!repository) {
        throw new NotFoundError(`repository not found: ${request.params.repositoryId}`);
      }

      const locks = await backend.acquireLock({ repositoryId, resource });
      const body: LockAcquireResponseBody = { locks: locks.map(toLockDto) };
      return reply.code(201).send(body);
    } catch (err) {
      return handleRouteError(err, reply);
    }
  });

  app.delete<{
    Params: { repositoryId: string };
    Body: LockReleaseRequestBody;
  }>("/api/repositories/:repositoryId/locks", async (request, reply) => {
    try {
      const repositoryId = parseHexId(request.params.repositoryId, "repositoryId");
      const resource = parseResourceBody(request.body);

      const repository = await backend.getRepository(repositoryId);
      if (!repository) {
        throw new NotFoundError(`repository not found: ${request.params.repositoryId}`);
      }

      const resources = await backend.releaseLock({ repositoryId, resource });
      const body: LockReleaseResponseBody = { resources: resources.map(toLockResourceDto) };
      return body;
    } catch (err) {
      return handleRouteError(err, reply);
    }
  });
}
