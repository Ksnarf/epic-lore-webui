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
}

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

const REFRESH_SKEW_MS = 15_000;

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
  };
}
