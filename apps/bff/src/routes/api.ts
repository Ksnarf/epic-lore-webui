import type { FastifyInstance } from "fastify";

/**
 * Placeholder `/api/*` router. Scaffold only -- no real feature routes yet.
 *
 * Real routes to add here per tasks.md's v1 scope, all server-side gRPC
 * calls via packages/lore-client, converted at this boundary using
 * packages/api-types' hex-bytes helpers (encodeHexBytes/decodeHexBytes) for
 * every `bytes` field:
 *   - task 1: repo browse + file tree (RevisionTree)
 *   - task 2: revision history + branch graph (RevisionList, BranchList)
 *   - task 3: diffs (RevisionDiff, ContentDiff)
 *   - task 4: asset preview presign (BFF-minted, service-account credential)
 *   - task 5: lock management (urc.lock)
 *   - task 6: change-request review flow
 *   - task 7: branch management (read-only conflict display)
 *   - task 9: /api/admin/* proxy (see server.ts TODO)
 *   - task 10: SSE notifications (see server.ts TODO)
 */
export function registerApiRoutes(app: FastifyInstance): void {
  app.get("/api/", async () => {
    return { status: "ok", message: "epic-lore-webui BFF API placeholder" };
  });
}
