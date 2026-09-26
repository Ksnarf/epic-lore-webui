import { encodeHexBytes } from "@epic-lore-webui/api-types";
import type { RevisionInfoResponseBody, RevisionListResponseBody } from "@epic-lore-webui/api-types";
import type { FastifyInstance } from "fastify";
import { BadRequestError, NotFoundError } from "../backend/errors.js";
import type { LoreBackend } from "../backend/types.js";
import { toRevisionDto, toRevisionItemDto } from "../dto/lore.js";
import { handleRouteError, parseHexId } from "./repositories.js";

function parseRevisionNumber(value: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new BadRequestError(`invalid revision number: expected a non-negative integer, got: ${value}`);
  }
  return BigInt(value);
}

/**
 * v1 task 2 (revision history + multi-lane branch graph) routes. `backend`
 * (LoreBackend, ../backend/types.ts) is the same instance task 1's routes
 * use -- one data source, selected once at boot by `LORE_BACKEND`.
 *
 * No diffs, locks, or auth here -- those are other v1 tasks.
 */
export function registerRevisionRoutes(app: FastifyInstance, backend: LoreBackend): void {
  app.get<{
    Params: { repositoryId: string; branchId: string };
    Querystring: { cursor?: string };
  }>("/api/repositories/:repositoryId/branches/:branchId/revisions", async (request, reply) => {
    try {
      const repositoryId = parseHexId(request.params.repositoryId, "repositoryId");
      const branchId = parseHexId(request.params.branchId, "branchId");
      const cursor = request.query.cursor ? parseHexId(request.query.cursor, "cursor") : undefined;

      const repository = await backend.getRepository(repositoryId);
      if (!repository) {
        throw new NotFoundError(`repository not found: ${request.params.repositoryId}`);
      }

      const { items, signatureForward, signatureBackward } = await backend.listRevisions({ branchId, cursor });
      const body: RevisionListResponseBody = {
        items: items.map(toRevisionItemDto),
        signatureForward: signatureForward ? encodeHexBytes(signatureForward) : null,
        signatureBackward: signatureBackward ? encodeHexBytes(signatureBackward) : null,
      };
      return body;
    } catch (err) {
      return handleRouteError(err, reply);
    }
  });

  app.get<{
    Params: { repositoryId: string; branchId: string; number: string };
  }>("/api/repositories/:repositoryId/branches/:branchId/revisions/:number", async (request, reply) => {
    try {
      const repositoryId = parseHexId(request.params.repositoryId, "repositoryId");
      const branchId = parseHexId(request.params.branchId, "branchId");
      const number = parseRevisionNumber(request.params.number);

      const repository = await backend.getRepository(repositoryId);
      if (!repository) {
        throw new NotFoundError(`repository not found: ${request.params.repositoryId}`);
      }

      const revision = await backend.getRevisionInfo({ branchId, number });
      if (!revision) {
        throw new NotFoundError(`revision not found: branch ${request.params.branchId} number ${request.params.number}`);
      }
      const body: RevisionInfoResponseBody = { revision: toRevisionDto(revision) };
      return body;
    } catch (err) {
      return handleRouteError(err, reply);
    }
  });
}
