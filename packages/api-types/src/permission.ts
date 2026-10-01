/**
 * v1 task 9 (permissions view). API contract study
 * (docs/design/api-contract.md section 4): permissions are NOT a
 * `lore-server` concept -- they come entirely from `epic-lore-authz`'s
 * `UrcAuthApi` (`CheckUserPermission`/`LookupUserPermissions`), via
 * apps/bff/src/auth/authz-client.ts, not `LoreBackend`. These DTOs mirror
 * that RPC's own `ResourcePermission` shape (`resource_id` + repeated
 * `permission` strings, e.g. `["read","write","admin"]` for an `admin`
 * grant) rather than inventing a different one at the JSON boundary.
 */
export interface ResourcePermissionDto {
  /** e.g. `"urc-<hex repository id>"`, or `"urc-*"` for a wildcard grant. */
  resourceId: string;
  /** e.g. `["read","write","admin"]`. Never empty for an entry that's present at all. */
  permission: string[];
}

/** Contract for `GET /api/permissions/me` -- the logged-in user's own grants, self-service, via `LookupUserPermissions`. */
export interface MyPermissionsResponseBody {
  permissions: ResourcePermissionDto[];
}

/**
 * v1 task 9, admin view. Mirrors `epic-lore-authz`'s own
 * `admin::api::PrincipalView` (`lore-authz-server/src/admin/api.rs`) at the
 * fields this UI actually uses -- `subject`/`external_id`/`source`/`idp` are
 * left off since nothing here needs them.
 */
export interface AdminUserDto {
  id: string;
  displayName: string;
  preferredUsername: string;
  email?: string;
  isServiceAccount: boolean;
  status: string;
}

/** Contract for `GET /api/admin/users` (admin-proxy, gated -- see apps/bff/src/routes/admin.ts). */
export interface AdminUsersResponseBody {
  users: AdminUserDto[];
}

/** Mirrors `epic-lore-authz`'s `admin::api::GrantView`, at the fields this UI uses (drops `id`/`role_id`/`principal_kind`/`principal_id` -- already scoped to one user by the route). */
export interface AdminGrantDto {
  roleName: string;
  resourcePattern: string;
}

/** Contract for `GET /api/admin/users/:userId/grants` (admin-proxy, gated). */
export interface AdminUserGrantsResponseBody {
  userId: string;
  grants: AdminGrantDto[];
}
