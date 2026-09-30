import type { ContentDiffResponseBody, RevisionDiffResponseBody } from "@epic-lore-webui/api-types";
import type { FastifyInstance } from "fastify";
import { NotFoundError } from "../backend/errors.js";
import type { LoreBackend } from "../backend/types.js";
import {
  toContentDiffResponseBody,
  toDiffChangeDto,
  toDiffConflictSummaryDto,
  toDiffPartitionDto,
  toRevisionDiffHeaderDto,
} from "../dto/lore.js";
import { handleRouteError, parseHexId } from "./repositories.js";
import { parseRevisionNumber } from "./revisions.js";

/**
 * v1 task 3 (side-by-side text diff + binary-aware diff),
 * `lore.thin_client.v1.ThinClientService.RevisionDiff` / `ContentDiff`.
 * `backend` (LoreBackend, ../backend/types.ts) is the same instance every
 * other v1 route uses.
 *
 * **Scope, see `packages/api-types/src/diff.ts`'s top comment for the full
 * reasoning:** `RevisionDiff` here is fixed to one branch's own two
 * revision numbers (the web UI's only real need, "diff vs. previous
 * revision" from the history view); 3-way `DiffConflict` entries are
 * returned unfiltered but not the focus of this task's UI (task 7's
 * scope). `ContentDiff` is a bare CAS-address diff, no revision/branch
 * context in the request itself.
 */
export function registerDiffRoutes(app: FastifyInstance, backend: LoreBackend): void {
  app.get<{
    Params: { repositoryId: string; branchId: string; from: string; to: string };
  }>("/api/repositories/:repositoryId/branches/:branchId/diff/:from/:to", async (request, reply) => {
    try {
      const repositoryId = parseHexId(request.params.repositoryId, "repositoryId");
      const branchId = parseHexId(request.params.branchId, "branchId");
      const fromNumber = parseRevisionNumber(request.params.from);
      const toNumber = parseRevisionNumber(request.params.to);

      const repository = await backend.getRepository(repositoryId, request.auth?.sessionToken);
      if (!repository) {
        throw new NotFoundError(`repository not found: ${request.params.repositoryId}`);
      }

      const authToken = await request.auth?.repositoryToken(repositoryId);
      const { header, changes, conflicts, partitions } = await backend.getRevisionDiff(
        {
          repositoryId,
          branchId,
          fromNumber,
          toNumber,
        },
        authToken,
      );
      const body: RevisionDiffResponseBody = {
        header: toRevisionDiffHeaderDto(header),
        changes: changes.map(toDiffChangeDto),
        conflicts: conflicts.map(toDiffConflictSummaryDto),
        partitions: partitions.map(toDiffPartitionDto),
      };
      return body;
    } catch (err) {
      return handleRouteError(err, reply);
    }
  });

  app.get<{
    Params: { repositoryId: string };
    Querystring: { from?: string; to?: string };
  }>("/api/repositories/:repositoryId/content-diff", async (request, reply) => {
    try {
      const repositoryId = parseHexId(request.params.repositoryId, "repositoryId");
      // Empty string (omitted or explicit) means "no content on this side" --
      // `ContentDiffRequest.address_from`/`address_to`'s own doc comment.
      const addressFrom = parseHexId(request.query.from ?? "", "from");
      const addressTo = parseHexId(request.query.to ?? "", "to");

      const repository = await backend.getRepository(repositoryId, request.auth?.sessionToken);
      if (!repository) {
        throw new NotFoundError(`repository not found: ${request.params.repositoryId}`);
      }

      const authToken = await request.auth?.repositoryToken(repositoryId);
      const { header, diff } = await backend.getContentDiff({ repositoryId, addressFrom, addressTo }, authToken);
      const body: ContentDiffResponseBody = toContentDiffResponseBody(header, diff);
      return body;
    } catch (err) {
      return handleRouteError(err, reply);
    }
  });
}
