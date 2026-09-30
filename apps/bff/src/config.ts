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
  };
}
