import { ADMIN_WILDCARD_RESOURCE_ID, hasAdminGrant } from "./admin-gate.js";
import type { AuthzClient, ResourcePermissionSummary } from "./authz-client.js";

/**
 * v1 task 9 (permissions view). Selected the same way `LoreBackend` already
 * is in ../server.ts (`config.loreBackend`: `"grpc"` -> the real
 * implementation below, `"fixture"` -> canned data, zero live stack
 * required) -- but this is deliberately NOT a `LoreBackend` method.
 * Permissions come from `epic-lore-authz`'s `UrcAuthApi`, not `lore-server`
 * (api-contract.md section 4), so fixture/real parity for this task lives
 * in the auth layer instead, alongside ../auth/authz-client.ts.
 */
export interface PermissionsClient {
  /** Self-service "my permissions" (../routes/permissions.ts): every resource the caller holds a grant on. */
  lookupMyPermissions(sessionToken: string | undefined): Promise<ResourcePermissionSummary[]>;
  /** Admin-proxy gate (../routes/admin.ts): does the caller hold `admin` on the `urc-*` convention (../auth/admin-gate.ts)? */
  checkAdminGrant(sessionToken: string | undefined): Promise<boolean>;
}

export function createAuthzPermissionsClient(authz: AuthzClient): PermissionsClient {
  return {
    async lookupMyPermissions(sessionToken) {
      if (!sessionToken) {
        // The `grpc`-mode auth gate (../server.ts's `onRequest` hook) 401s
        // every unauthenticated `/api/*` call before a route handler ever
        // reaches this -- this is a defensive no-op, not a path exercised
        // in practice.
        return [];
      }
      return authz.lookupUserPermissions(sessionToken);
    },
    async checkAdminGrant(sessionToken) {
      if (!sessionToken) {
        return false;
      }
      const { allowed } = await authz.checkUserPermission(sessionToken, [ADMIN_WILDCARD_RESOURCE_ID]);
      return hasAdminGrant(allowed);
    },
  };
}

/**
 * Fixture resource ids, deliberately matching ../backend/fixture.ts's
 * `REPO_LORE_ID`/`REPO_WEBUI_ID` (`fixtureId(1)`/`fixtureId(2)`: a 16-byte
 * all-zero id with the last byte set to the seed) -- not imported from
 * there (that module exports neither constant), so this pair MUST stay in
 * sync with it by hand. This is what lets the self-service permissions
 * view's resource-id -> repository-name join (apps/web/src/permissions/
 * format.ts) actually demonstrate working end to end in fixture mode too,
 * exactly as it would against real data: `GET /api/repositories` and
 * `GET /api/permissions/me` name the same two repositories.
 */
const FIXTURE_REPO_LORE_RESOURCE_ID = "urc-00000000000000000000000000000001";
const FIXTURE_REPO_WEBUI_RESOURCE_ID = "urc-00000000000000000000000000000002";

const FIXTURE_PERMISSIONS: ResourcePermissionSummary[] = [
  { resourceId: FIXTURE_REPO_LORE_RESOURCE_ID, permission: ["read", "write", "admin"] },
  { resourceId: FIXTURE_REPO_WEBUI_RESOURCE_ID, permission: ["read", "write"] },
];

/**
 * Fixture mode has no auth concept at all (task 8's own scope decision --
 * see ../server.ts's auth-gate doc comment), so `checkAdminGrant` always
 * answers `true`: the admin-proxy routes it gates are reached by anyone in
 * fixture mode, same as every other `/api/*` route already is. This makes
 * the whole admin-proxy flow testable with zero live stack (see
 * ../routes/admin.ts and this task's tasks.md entry for the live-stack
 * evidence this fixture path stands in for).
 */
export function createFixturePermissionsClient(): PermissionsClient {
  return {
    async lookupMyPermissions() {
      return FIXTURE_PERMISSIONS;
    },
    async checkAdminGrant() {
      return true;
    },
  };
}
