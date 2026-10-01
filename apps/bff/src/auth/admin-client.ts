/**
 * v1 task 9 (permissions view), admin view. Thin wrapper over
 * `epic-lore-authz`'s raw REST admin surface (`/admin/v1/**`,
 * `lore-authz-server/src/admin/api.rs`), gated entirely on
 * `ADMIN_API_TOKEN` -- never anything this UI invents. Confirmed live
 * against the running demo stack (read-only `GET`s, `authorization: Bearer
 * <ADMIN_API_TOKEN>` against `http://localhost:18080`, the demo's
 * `DEMO_AUTHZ_HTTP_PORT`): `GET /admin/v1/principals` and
 * `GET /admin/v1/grants` both returned real data for the real logged-in
 * demo user.
 *
 * This module only ever issues the two `GET`s task 9's "view other users'
 * grants" needs -- no principal/group/resource/grant CREATE, no
 * `POST`/`DELETE` of any kind. `/admin/v1/grants` has no server-side filter
 * (confirmed against `lore-authz-server/src/admin/mod.rs`'s route table:
 * `list_grants` takes no query extractor) -- filtering to one user's grants
 * happens here, client-side, after fetching the full (bounded,
 * `admin::LIST_LIMIT`-capped) list.
 */
export interface AdminUserSummary {
  id: string;
  displayName: string;
  preferredUsername: string;
  email?: string;
  isServiceAccount: boolean;
  status: string;
}

export interface AdminGrantSummary {
  roleName: string;
  resourcePattern: string;
}

export interface AdminClient {
  listUsers(): Promise<AdminUserSummary[]>;
  listGrantsForUser(userId: string): Promise<AdminGrantSummary[]>;
}

/** Wire shape of `admin::api::PrincipalView` -- see that module's own doc comment for why `status` is lowercase. */
interface PrincipalWire {
  id: string;
  display_name: string;
  preferred_username: string;
  email: string | null;
  is_service_account: boolean;
  status: string;
}

/** Wire shape of `admin::api::GrantView`. */
interface GrantWire {
  role_name: string;
  resource_pattern: string;
  principal_id: string;
}

interface ListResponseWire<T> {
  items: T[];
  truncated: boolean;
}

export function createAuthzAdminClient(httpAddr: string, adminApiToken: string): AdminClient {
  const baseUrl = `http://${httpAddr}`;

  async function adminGet<T>(path: string): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { authorization: `Bearer ${adminApiToken}` },
    });
    if (!response.ok) {
      throw new Error(`epic-lore-authz admin API ${path}: HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  }

  return {
    async listUsers() {
      const { items, truncated } = await adminGet<ListResponseWire<PrincipalWire>>("/admin/v1/principals");
      if (truncated) {
        console.warn("GET /admin/v1/principals returned a truncated list (admin::LIST_LIMIT) -- not every principal is shown");
      }
      return items.map((principal) => ({
        id: principal.id,
        displayName: principal.display_name,
        preferredUsername: principal.preferred_username,
        email: principal.email ?? undefined,
        isServiceAccount: principal.is_service_account,
        status: principal.status,
      }));
    },

    async listGrantsForUser(userId: string) {
      const { items, truncated } = await adminGet<ListResponseWire<GrantWire>>("/admin/v1/grants");
      if (truncated) {
        console.warn("GET /admin/v1/grants returned a truncated list (admin::LIST_LIMIT) -- the filter below may be missing grants");
      }
      return items
        .filter((grant) => grant.principal_id === userId)
        .map((grant) => ({ roleName: grant.role_name, resourcePattern: grant.resource_pattern }));
    },
  };
}

/**
 * Fixture resource ids/principal id are made up outright (fixture mode has
 * no real `epic-lore-authz` principal at all) but the GRANT resource ids
 * deliberately match ../permissions-client.ts's fixture repository resource
 * ids, so the admin view's grants table is demonstrably about the same two
 * fixture repositories the rest of the fixture-mode app shows.
 */
const FIXTURE_USER: AdminUserSummary = {
  id: "fixture-user",
  displayName: "Fixture User",
  preferredUsername: "fixture-user",
  isServiceAccount: false,
  status: "active",
};

const FIXTURE_GRANTS: AdminGrantSummary[] = [
  { roleName: "admin", resourcePattern: "urc-00000000000000000000000000000001" },
  { roleName: "writer", resourcePattern: "urc-00000000000000000000000000000002" },
];

export function createFixtureAdminClient(): AdminClient {
  return {
    async listUsers() {
      return [FIXTURE_USER];
    },
    async listGrantsForUser(userId: string) {
      return userId === FIXTURE_USER.id ? FIXTURE_GRANTS : [];
    },
  };
}
