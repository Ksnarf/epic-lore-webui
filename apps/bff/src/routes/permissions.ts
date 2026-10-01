import type { MyPermissionsResponseBody } from "@epic-lore-webui/api-types";
import type { FastifyInstance } from "fastify";
import type { PermissionsClient } from "../auth/permissions-client.js";

/**
 * v1 task 9 (permissions view), self-service half. API contract study
 * (docs/design/api-contract.md section 4): `LookupUserPermissions` already
 * resolves the caller from their own bearer token and needs no
 * `ADMIN_API_TOKEN` -- so this is a single, always-registered route (unlike
 * ../routes/admin.ts's admin-proxy routes, which only exist when
 * `ADMIN_API_TOKEN` is configured).
 *
 * `grpc` mode: ../server.ts's `onRequest` hook already 401s this route for
 * an unauthenticated caller before it's reached (same as every other
 * `/api/*` route) -- `request.auth?.sessionToken` is always present here.
 * `fixture` mode: no auth concept at all (task 8's scope decision), so
 * `permissionsClient` (../auth/permissions-client.ts) is the fixture
 * implementation, which ignores the (possibly `undefined`) token and
 * returns canned data -- testable with zero live stack.
 */
export function registerPermissionRoutes(app: FastifyInstance, permissionsClient: PermissionsClient): void {
  app.get("/api/permissions/me", async (request): Promise<MyPermissionsResponseBody> => {
    const permissions = await permissionsClient.lookupMyPermissions(request.auth?.sessionToken);
    return { permissions };
  });
}
