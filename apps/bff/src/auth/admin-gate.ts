import type { ResourcePermissionSummary } from "./authz-client.js";

/**
 * v1 task 9 (permissions view), admin-proxy gate. `epic-lore-authz` has no
 * per-user "may administer other users' grants" permission of its own
 * (api-contract.md section 4, "the gap this closes" -- `role_bindings`
 * grant access to `urc-*` REPOSITORIES, not to the admin surface itself).
 * This is this UI's own convention, exactly as api-contract.md section 4's
 * recommended "option 1" names it: a caller who holds `admin` on the
 * literal `urc-*` wildcard resource id may reach the BFF's `/api/admin/*`
 * proxy routes (../routes/admin.ts). A real deployment provisions this via
 * one `admin::api::create_grant` call (`principal_kind: "user"`,
 * `resource_pattern: "urc-*"`, `role: "admin"`) against the SAME admin API
 * the proxy itself calls through -- no new `epic-lore-authz` capability.
 */
export const ADMIN_WILDCARD_RESOURCE_ID = "urc-*";
export const ADMIN_PERMISSION = "admin";

/**
 * `allowed` is `CheckUserPermission`'s own `allowedResourcePermission` list
 * (via ../auth/authz-client.ts's `checkUserPermission`), already resolved
 * against the caller's own session token. Pure and synchronous on purpose --
 * the RPC call (and its caching/error-mapping) lives in ../routes/admin.ts,
 * this is only the yes/no decision over its result.
 */
export function hasAdminGrant(allowed: ResourcePermissionSummary[]): boolean {
  return allowed.some(
    (entry) => entry.resourceId === ADMIN_WILDCARD_RESOURCE_ID && entry.permission.includes(ADMIN_PERMISSION),
  );
}
