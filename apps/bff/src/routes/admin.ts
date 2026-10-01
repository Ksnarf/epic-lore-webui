import type { AdminUserGrantsResponseBody, AdminUsersResponseBody } from "@epic-lore-webui/api-types";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AdminClient } from "../auth/admin-client.js";
import type { PermissionsClient } from "../auth/permissions-client.js";

/**
 * v1 task 9 (permissions view), admin view. api-contract.md section 4's
 * recommended "option 1": the BFF holds `ADMIN_API_TOKEN` server-side
 * (../auth/admin-client.ts, never shipped to the browser) and gates *who*
 * may reach its own admin-proxy routes using `epic-lore-authz`'s existing
 * `CheckUserPermission`, against this UI's own convention (`admin` on the
 * `urc-*` wildcard resource -- ../auth/admin-gate.ts).
 *
 * **Fail-closed by construction, not by a flag:** ../server.ts calls
 * `registerAdminRoutes` ONLY when `ADMIN_API_TOKEN` is configured. An unset
 * token means this function is never called at all -- these two routes do
 * not exist, so a request to either one falls through to the app's generic
 * `/api/*` 404 JSON handler, not a 401/403 that would at least confirm the
 * path is real. Per api-contract.md section 4 / docs/design/
 * stack-decision.md's "Admin proxy (task 9)": "an admin surface that
 * silently disables itself is safer than one that silently opens."
 *
 * **Every request re-checks the gate**, not just once at startup -- a
 * caller's admin grant can be revoked between requests (the whole point of
 * a real authorization check, vs. a one-time capability token), and this
 * proxy must notice on the very next call.
 */
export function registerAdminRoutes(
  app: FastifyInstance,
  adminClient: AdminClient,
  permissionsClient: PermissionsClient,
): void {
  async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    const isAdmin = await permissionsClient.checkAdminGrant(request.auth?.sessionToken);
    if (!isAdmin) {
      reply.code(403).send({ error: "forbidden: admin grant required (urc-* resource, admin permission)" });
      return false;
    }
    return true;
  }

  app.get("/api/admin/users", async (request, reply): Promise<AdminUsersResponseBody | undefined> => {
    if (!(await requireAdmin(request, reply))) {
      return undefined;
    }
    const users = await adminClient.listUsers();
    return { users };
  });

  app.get<{ Params: { userId: string } }>(
    "/api/admin/users/:userId/grants",
    async (request, reply): Promise<AdminUserGrantsResponseBody | undefined> => {
      if (!(await requireAdmin(request, reply))) {
        return undefined;
      }
      const grants = await adminClient.listGrantsForUser(request.params.userId);
      return { userId: request.params.userId, grants };
    },
  );
}
