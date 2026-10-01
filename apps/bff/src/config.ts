import { randomBytes } from "node:crypto";

export type LoreBackendKind = "fixture" | "grpc";

export interface BffConfig {
  port: number;
  host: string;
  /**
   * Which `LoreBackend` implementation (./backend/types.ts) the BFF talks
   * to. Default `"fixture"` so the app runs with no `lore-server` reachable
   * at all; set `LORE_BACKEND=grpc` to dial a real server at
   * `loreServerAddr`.
   */
  loreBackend: LoreBackendKind;
  /**
   * `host:port` the `"grpc"` backend dials (./backend/grpc.ts). Default
   * `localhost:41337` matches the `epic-lore-authz` docker-compose demo
   * stack's patched `lore-server` gRPC port.
   */
  loreServerAddr: string;
  /**
   * v1 task 8 (Okta auth). `host:port` of `epic-lore-authz`'s native gRPC
   * listener (`UrcAuthApi`) -- `StartAuthSession`/`GetAuthSession`/
   * `ExchangeUserTokenForMultiresourceToken`. Default `localhost:8443`
   * matches the `epic-lore-authz` docker-compose demo stack's
   * `DEMO_AUTHZ_GRPC_PORT` default. Read unconditionally (not gated on
   * `LORE_BACKEND`): the login flow talks to `epic-lore-authz` regardless of
   * which `LoreBackend` serves `/api/*`, so fixture-mode dev can still
   * exercise a real login against a real `epic-lore-authz` if one happens
   * to be reachable -- see ../server.ts's auth-gate hook for why fixture
   * mode itself never *requires* a session.
   */
  authzServerAddr: string;
  /**
   * v1 task 8. Symmetric key material for the encrypted session cookie
   * (./auth/crypto.ts) -- an operator-provided high-entropy string (e.g.
   * `openssl rand -base64 32`), name only, never a value, in any doc or log
   * this repo writes. Required when `LORE_BACKEND=grpc` (a real login has to
   * actually protect the token it stores) and throws at startup if unset.
   * In `fixture` mode, an unset `SESSION_SECRET` is tolerated: a random key
   * is generated at boot (logged as a warning) so fixture-mode dev needs no
   * new env var and simply gets a session that doesn't survive a restart --
   * fixture mode has no auth concept for `/api/*` to protect either way (see
   * ../server.ts).
   */
  sessionSecret: string;
  /**
   * v1 task 8. Whether the session/login-attempt cookies carry the `Secure`
   * attribute (HTTPS-only). Defaults `true` (safe default for any real
   * deployment); the local docker-compose demo stack (plain HTTP) must set
   * `COOKIE_SECURE=false` explicitly to exercise a real browser login,
   * documented here rather than defaulting to `false` and risking a
   * real deployment forgetting to turn it on.
   */
  cookieSecure: boolean;
  /**
   * v1 task 11 extension (group-membership default profile, built
   * path-agnostically -- see apps/bff/src/auth/jwt-claims.ts's doc comment).
   * The claim name read off the session's `UserToken` JWT payload. Default
   * `"groups"`. Configurable because neither path this BFF must support
   * (a future authz-minted claim, or a native Okta/OIDC token) is
   * guaranteed to use that exact name.
   */
  groupsClaim: string;
  /**
   * v1 task 11 extension. Group names (comma-separated, trimmed, empty
   * entries dropped) that resolve to the "artist" default profile
   * (apps/bff/src/auth/profile-mapping.ts). Names only, never secrets --
   * see ./auth/profile-mapping.ts for the resolution rule (developer wins
   * if a user is in both lists). Default empty: no mapping configured means
   * no group ever resolves to a default, matching this task's "groups are
   * optional everywhere" constraint.
   */
  profileGroupsArtist: string[];
  /** v1 task 11 extension. See `profileGroupsArtist` -- same shape, resolves to "developer". */
  profileGroupsDeveloper: string[];
  /**
   * v1 task 9 (permissions view), admin view. `epic-lore-authz`'s shared
   * secret gating its ENTIRE `/admin/v1/**` surface
   * (`lore-authz-server/src/admin/auth.rs`) -- read from environment only,
   * never hardcoded, never sent to the browser (only ../auth/admin-client.ts
   * ever presents it, server-side). **Unset by default, and that is the
   * fail-closed posture this task's brief requires**: `undefined` means
   * ../server.ts never calls `registerAdminRoutes` at all, so
   * `/api/admin/*` does not exist (a real 404), not a route that exists but
   * denies. Set this only alongside `ADMIN_AUTHZ_HTTP_ADDR` below.
   */
  adminApiToken: string | undefined;
  /**
   * v1 task 9, admin view. `host:port` of `epic-lore-authz`'s raw HTTP
   * listener (`/admin/v1/**`, `/.well-known/jwks.json`, ...) -- a DIFFERENT
   * port than `authzServerAddr` above, which is that same service's gRPC
   * listener. Default `localhost:18080` matches the `epic-lore-authz` demo
   * docker-compose stack's `DEMO_AUTHZ_HTTP_PORT` default (confirmed live
   * this session: `GET http://localhost:18080/admin/v1/principals` with the
   * demo's `ADMIN_API_TOKEN` returned real principal data). Only read when
   * `adminApiToken` is set.
   */
  adminAuthzHttpAddr: string;
  /**
   * v1 task 11 extension. Comma-separated fake group names the FIXTURE auth
   * path (../routes/auth.ts) reports for its synthetic signed-in user, so
   * the whole claim-extraction -> mapping -> `defaultProfile` chain is
   * testable with zero real IdP/authz reachable. Only takes effect when
   * `loreBackend` is `"fixture"` AND this is non-empty -- an unset/empty
   * value leaves fixture mode's `/api/auth/status` exactly as it behaved
   * before this task (`{authenticated:false}` with no cookies), so this is
   * opt-in, not a behavior change for existing fixture-mode use. Default
   * empty.
   */
  fixtureGroups: string[];
}

/** Comma-separated env var -> trimmed, non-empty group-name list. Shared by `PROFILE_GROUPS_ARTIST`/`PROFILE_GROUPS_DEVELOPER`/`FIXTURE_GROUPS` below. */
function parseGroupList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

const VALID_BACKENDS: readonly LoreBackendKind[] = ["fixture", "grpc"];

function isLoreBackendKind(value: string): value is LoreBackendKind {
  return (VALID_BACKENDS as readonly string[]).includes(value);
}

/**
 * BFF runtime configuration, entirely from environment variables (no config
 * file, no hardcoded defaults baked into behavior beyond what's documented
 * here).
 *
 * | Env var             | Default            | Meaning                                   |
 * |----------------------|--------------------|--------------------------------------------|
 * | `PORT`               | `3000`             | HTTP port the BFF listens on                |
 * | `HOST`               | `0.0.0.0`          | HTTP host the BFF binds                     |
 * | `LORE_BACKEND`       | `fixture`          | `fixture` \| `grpc` -- see LoreBackend       |
 * | `LORE_SERVER_ADDR`   | `localhost:41337`  | `host:port` dialed when `LORE_BACKEND=grpc` |
 * | `AUTHZ_SERVER_ADDR`  | `localhost:8443`   | `epic-lore-authz` gRPC `host:port` (task 8)  |
 * | `SESSION_SECRET`     | (required, `grpc`) | session-cookie encryption key (name only)    |
 * | `COOKIE_SECURE`      | `true`             | `Secure` attribute on auth cookies (task 8)  |
 * | `GROUPS_CLAIM`       | `groups`           | JWT claim name read for group membership (task 11 ext) |
 * | `PROFILE_GROUPS_ARTIST`    | (empty)      | comma-separated group names -> "artist" default (task 11 ext) |
 * | `PROFILE_GROUPS_DEVELOPER` | (empty)      | comma-separated group names -> "developer" default (task 11 ext) |
 * | `FIXTURE_GROUPS`     | (empty)            | comma-separated fake groups for the fixture auth path (task 11 ext) |
 * | `ADMIN_API_TOKEN`    | (unset)            | `epic-lore-authz` admin-surface bearer secret -- unset disables `/api/admin/*` entirely (task 9) |
 * | `ADMIN_AUTHZ_HTTP_ADDR` | `localhost:18080` | `epic-lore-authz`'s raw HTTP (admin) listener, only read when `ADMIN_API_TOKEN` is set (task 9) |
 */
export function loadConfig(): BffConfig {
  const rawBackend = process.env.LORE_BACKEND ?? "fixture";
  if (!isLoreBackendKind(rawBackend)) {
    throw new Error(`Invalid LORE_BACKEND: "${rawBackend}" (expected "fixture" or "grpc")`);
  }
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret && rawBackend === "grpc") {
    throw new Error(
      "SESSION_SECRET is required when LORE_BACKEND=grpc (v1 task 8: encrypts the session cookie holding the user's auth token). Set it to a high-entropy value, e.g. `openssl rand -base64 32`.",
    );
  }
  if (!sessionSecret) {
    // config loading runs before the Fastify logger exists; this is the
    // only place in the BFF that logs via console directly, and only for
    // this one fixture-mode fallback.
    console.warn(
      "SESSION_SECRET not set -- generating an ephemeral one for this process (fixture mode only; sessions will not survive a restart). Set SESSION_SECRET to persist sessions, and it is required once LORE_BACKEND=grpc.",
    );
  }
  return {
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? "0.0.0.0",
    loreBackend: rawBackend,
    loreServerAddr: process.env.LORE_SERVER_ADDR ?? "localhost:41337",
    authzServerAddr: process.env.AUTHZ_SERVER_ADDR ?? "localhost:8443",
    // Fixture-mode fallback only (see BffConfig.sessionSecret's doc comment)
    // -- randomBytes here, not a hardcoded string, so it's still real key
    // material, just ephemeral and never logged.
    sessionSecret: sessionSecret ?? randomBytes(32).toString("base64url"),
    cookieSecure: process.env.COOKIE_SECURE !== "false",
    groupsClaim: process.env.GROUPS_CLAIM || "groups",
    profileGroupsArtist: parseGroupList(process.env.PROFILE_GROUPS_ARTIST),
    profileGroupsDeveloper: parseGroupList(process.env.PROFILE_GROUPS_DEVELOPER),
    fixtureGroups: parseGroupList(process.env.FIXTURE_GROUPS),
    adminApiToken: process.env.ADMIN_API_TOKEN || undefined,
    adminAuthzHttpAddr: process.env.ADMIN_AUTHZ_HTTP_ADDR ?? "localhost:18080",
  };
}
