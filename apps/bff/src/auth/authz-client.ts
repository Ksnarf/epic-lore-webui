import { createClient } from "@connectrpc/connect";
import { createLoreTransport } from "@epic-lore-webui/lore-client";
import { UrcAuthApi } from "@epic-lore-webui/lore-client/gen/auth_api_pb";
import type { UserToken } from "@epic-lore-webui/lore-client/gen/auth_api_pb";
import { encodeHexBytes } from "@epic-lore-webui/api-types";

/**
 * v1 task 8 (Okta auth), api-contract.md Option A. Talks to
 * `epic-lore-authz`'s EXISTING, unmodified `UrcAuthApi` gRPC service -- the
 * same three RPCs the `lore` CLI already uses for a device-code-shaped
 * browser login (`docs/architecture.md`, "Human login flow (OIDC), end to
 * end"): this BFF plays the CLI's role (calls `StartAuthSession` itself,
 * polls `GetAuthSession`) instead of a real CLI process. No `epic-lore-authz`
 * change of any kind -- see ../routes/auth.ts for the browser-facing side of
 * this.
 */
export interface AuthzClient {
  /** `UrcAuthApi.StartAuthSession` -- mints a fresh `session_code`/`login_url` pair. */
  startAuthSession(clientState: string): Promise<{ sessionCode: string; loginUrl: string }>;
  /**
   * `UrcAuthApi.GetAuthSession` -- polls once. Returns `undefined` while the
   * session is still pending (an empty response is a normal, non-error
   * outcome for an unresolved session -- confirmed live against the demo
   * stack: an unauthenticated, wrong-`client_state`, and unknown-
   * `session_code` call all return `{}`, never an RPC error). Callers
   * distinguish "still pending" from "expired" themselves via their own
   * wall-clock deadline (`LOGIN_WINDOW_MS`, ./session.ts) -- `GetAuthSession`
   * has no expiry signal of its own to read.
   */
  getAuthSession(sessionCode: string, clientState: string): Promise<UserToken | undefined>;
  /**
   * `UrcAuthApi.ExchangeUserTokenForMultiresourceToken`, scoped to exactly
   * one repository's `urc-<hex repository id>` resource id -- the AuthZ
   * token every repository-scoped `lore-server` RPC needs on the wire
   * (`docs/architecture.md` steps 12-13; confirmed live against the demo
   * stack: the resulting token's `resources` claim is what `lore-server`
   * actually checks, and an unrecognized/ungranted resource id still mints a
   * token, just with an empty `resources` claim -- `lore-server` itself is
   * what then returns `PermissionDenied`, not this exchange). Cached
   * per-`(userId, resourceId)` and refreshed once within `refreshSkewMs` of
   * expiry -- session-level (the AuthN token in the cookie), not
   * request-level, so concurrent requests for the same repository share one
   * exchange instead of one each.
   */
  exchangeForRepositoryToken(sessionUserToken: string, sessionUserId: string, repositoryId: Uint8Array): Promise<string>;
  /**
   * v1 task 9 (permissions view). `UrcAuthApi.LookupUserPermissions`,
   * resolving the caller from `sessionUserToken` (the session's own AuthN
   * token -- confirmed live this needs no per-repository AuthZ exchange,
   * same as `RepositoryList`/`RepositoryGet`). `resourceFilter` empty
   * matches every resource id the caller holds a grant on at all (direct,
   * group, or wildcard) -- "list everything I can do" -- which is exactly
   * what the self-service "my permissions" view needs. Paginates internally
   * via `next_page_token`, capped at `MAX_LOOKUP_PAGES` so a pathological
   * number of grants cannot turn one request into an unbounded loop
   * (mirrors `epic-lore-authz`'s own `admin::LIST_LIMIT` "bounded, not
   * silently partial" convention) -- logs a warning if the cap is hit
   * rather than silently truncating.
   */
  lookupUserPermissions(sessionUserToken: string): Promise<ResourcePermissionSummary[]>;
  /**
   * v1 task 9. `UrcAuthApi.CheckUserPermission` for a specific set of
   * resource ids, resolving the caller from `sessionUserToken` (no
   * `target_user` -- this BFF has no legitimate way to obtain another
   * user's own token, per api-contract.md section 4). Used by the
   * admin-proxy gate (../routes/admin.ts) to check whether the caller holds
   * `admin` on the `urc-*` wildcard resource -- this UI's own convention
   * for "may administer other users' grants", since `epic-lore-authz` has
   * no per-user admin role of its own (api-contract.md section 4, "the
   * gap").
   */
  checkUserPermission(
    sessionUserToken: string,
    resourceIds: string[],
  ): Promise<{ allowed: ResourcePermissionSummary[]; denied: ResourcePermissionSummary[] }>;
}

/** Plain-object mirror of `epic_urc.ResourcePermission` (`resource_id` + `permission[]`) -- what `../routes/permissions.ts`/`../routes/admin.ts` actually consume, independent of the generated proto type. */
export interface ResourcePermissionSummary {
  resourceId: string;
  permission: string[];
}

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

const REFRESH_SKEW_MS = 15_000;

/** See `lookupUserPermissions`'s doc comment. */
const MAX_LOOKUP_PAGES = 50;
const LOOKUP_PAGE_SIZE = 200;

export function createAuthzClient(addr: string): AuthzClient {
  const transport = createLoreTransport({ baseUrl: `http://${addr}` });
  const client = createClient(UrcAuthApi, transport);
  const repoTokenCache = new Map<string, CachedToken>();

  return {
    async startAuthSession(clientState: string) {
      const response = await client.startAuthSession({ clientState });
      return { sessionCode: response.sessionCode, loginUrl: response.loginUrl };
    },

    async getAuthSession(sessionCode: string, clientState: string) {
      const response = await client.getAuthSession({ sessionCode, clientState });
      return response.userToken;
    },

    async exchangeForRepositoryToken(sessionUserToken: string, sessionUserId: string, repositoryId: Uint8Array) {
      const resourceId = `urc-${encodeHexBytes(repositoryId)}`;
      const cacheKey = `${sessionUserId}:${resourceId}`;
      const cached = repoTokenCache.get(cacheKey);
      if (cached && cached.expiresAtMs - REFRESH_SKEW_MS > Date.now()) {
        return cached.token;
      }

      const headers = new Headers();
      headers.set("authorization", `Bearer ${sessionUserToken}`);
      const response = await client.exchangeUserTokenForMultiresourceToken(
        { resourceId: [resourceId] },
        { headers },
      );
      const token = response.token;
      if (!token) {
        throw new Error("ExchangeUserTokenForMultiresourceToken returned no token");
      }
      repoTokenCache.set(cacheKey, { token: token.userToken, expiresAtMs: Number(token.expiresAt) });
      return token.userToken;
    },

    async lookupUserPermissions(sessionUserToken: string) {
      const headers = new Headers();
      headers.set("authorization", `Bearer ${sessionUserToken}`);
      const results: ResourcePermissionSummary[] = [];
      let pageToken: string | undefined;
      for (let page = 0; page < MAX_LOOKUP_PAGES; page++) {
        const response = await client.lookupUserPermissions(
          { resourceFilter: "", pageSize: LOOKUP_PAGE_SIZE, pageToken },
          { headers },
        );
        for (const entry of response.resourcePermission) {
          results.push({ resourceId: entry.resourceId, permission: entry.permission });
        }
        if (!response.nextPageToken) {
          return results;
        }
        pageToken = response.nextPageToken;
      }
      console.warn(
        `lookupUserPermissions: hit MAX_LOOKUP_PAGES (${MAX_LOOKUP_PAGES}) without exhausting next_page_token -- result is a bounded prefix, not the complete list`,
      );
      return results;
    },

    async checkUserPermission(sessionUserToken: string, resourceIds: string[]) {
      const headers = new Headers();
      headers.set("authorization", `Bearer ${sessionUserToken}`);
      const response = await client.checkUserPermission({ resourceId: resourceIds }, { headers });
      return {
        allowed: response.allowedResourcePermission.map((entry) => ({
          resourceId: entry.resourceId,
          permission: entry.permission,
        })),
        denied: response.deniedResourcePermission.map((entry) => ({
          resourceId: entry.resourceId,
          permission: entry.permission,
        })),
      };
    },
  };
}
