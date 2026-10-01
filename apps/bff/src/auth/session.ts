import type { FastifyReply, FastifyRequest } from "fastify";
import { decrypt, encrypt } from "./crypto.js";

/**
 * v1 task 8 (Okta auth). Two encrypted, `HttpOnly` cookies, both scoped to
 * this BFF's own origin and never readable by browser JS:
 *
 * - `SESSION_COOKIE`: set once login completes. Holds the user's
 *   `epic_urc.UserToken` (the AuthN token `GetAuthSession` returns) plus its
 *   own `expiresAt`/`userId`/`userName`. This is the token attached to
 *   repository-agnostic `RepositoryService` calls directly, and exchanged
 *   (../backend -- see ./authz-client.ts) for a per-repository AuthZ token
 *   on every repository-scoped call.
 * - `LOGIN_ATTEMPT_COOKIE`: set by `GET /login` (../routes/auth.ts) right
 *   after `StartAuthSession`, holding the `session_code`/`client_state`
 *   pair `GetAuthSession` needs to poll. Short-lived (`LOGIN_WINDOW_MS`,
 *   matching `epic-lore-authz`'s own documented CLI poll deadline --
 *   `docs/architecture.md`, "the CLI gives up after 150 seconds") and
 *   cleared as soon as login either succeeds or is confirmed expired.
 *
 * Both are encrypted (not merely signed) with the same `SESSION_SECRET`-
 * derived key (./crypto.ts) -- signing alone would stop tampering but would
 * still hand the raw `UserToken` to anyone who can read the browser's cookie
 * jar (e.g. via a device-level compromise, a proxy log, or a browser
 * extension with cookie-read permission); encrypting it is one more layer
 * given how sensitive this particular cookie is.
 */

export const SESSION_COOKIE = "lore_session";
export const LOGIN_ATTEMPT_COOKIE = "lore_login_attempt";

/** Matches `epic-lore-authz`'s own documented CLI poll deadline (`docs/architecture.md`, step 9). */
export const LOGIN_WINDOW_MS = 150_000;

export interface SessionPayload {
  userToken: string;
  userId: string;
  userName: string;
  /** `UserToken.expires_at`, epoch ms -- a session past this is treated as absent, not just "expiring soon". */
  expiresAt: number;
  /**
   * v1 task 11 extension (group-membership default profile). The group
   * names extracted from this session's `userToken` JWT payload at login
   * time (../auth/jwt-claims.ts's `extractGroupsClaim`), under whichever
   * claim name `GROUPS_CLAIM` (../config.ts) names. Optional and typically
   * absent/empty -- today's real authz tokens carry no such claim at all,
   * and that is the expected, inert case (groups are optional everywhere
   * per this task's brief), not a degraded one. Never sent to the browser
   * (see ../routes/auth.ts's doc comment) -- only used server-side to
   * resolve `AuthStatusResponseBody.defaultProfile` (../auth/profile-mapping.ts)
   * on each `/api/auth/status` call, so a mapping-config change
   * (`PROFILE_GROUPS_ARTIST`/`PROFILE_GROUPS_DEVELOPER`) takes effect
   * without forcing a re-login.
   */
  groups?: string[];
}

export interface LoginAttemptPayload {
  sessionCode: string;
  clientState: string;
  /** epoch ms this attempt was started -- compared against `LOGIN_WINDOW_MS` by the poller (../routes/auth.ts). */
  createdAt: number;
}

function cookieOptions(secure: boolean, maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function setSessionCookie(
  reply: FastifyReply,
  secret: string,
  secure: boolean,
  payload: SessionPayload,
): void {
  const maxAgeSeconds = Math.max(1, Math.floor((payload.expiresAt - Date.now()) / 1000));
  reply.setCookie(SESSION_COOKIE, encrypt(secret, JSON.stringify(payload)), cookieOptions(secure, maxAgeSeconds));
}

/**
 * Returns `undefined` for a missing cookie, an undecryptable/tampered one,
 * or one whose own `expiresAt` has already passed -- all three are "no
 * session" as far as any caller needs to know (see ../server.ts's auth-gate
 * hook and ../routes/auth.ts's status endpoint, the only two callers).
 */
export function readSessionCookie(request: FastifyRequest, secret: string): SessionPayload | undefined {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) {
    return undefined;
  }
  const plaintext = decrypt(secret, raw);
  if (!plaintext) {
    return undefined;
  }
  try {
    const payload = JSON.parse(plaintext) as SessionPayload;
    if (typeof payload.expiresAt !== "number" || payload.expiresAt <= Date.now()) {
      return undefined;
    }
    return payload;
  } catch {
    return undefined;
  }
}

export function clearSessionCookie(reply: FastifyReply, secure: boolean): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/", httpOnly: true, secure, sameSite: "lax" });
}

export function setLoginAttemptCookie(
  reply: FastifyReply,
  secret: string,
  secure: boolean,
  payload: LoginAttemptPayload,
): void {
  reply.setCookie(
    LOGIN_ATTEMPT_COOKIE,
    encrypt(secret, JSON.stringify(payload)),
    cookieOptions(secure, Math.ceil(LOGIN_WINDOW_MS / 1000) + 10),
  );
}

export function readLoginAttemptCookie(request: FastifyRequest, secret: string): LoginAttemptPayload | undefined {
  const raw = request.cookies[LOGIN_ATTEMPT_COOKIE];
  if (!raw) {
    return undefined;
  }
  const plaintext = decrypt(secret, raw);
  if (!plaintext) {
    return undefined;
  }
  try {
    return JSON.parse(plaintext) as LoginAttemptPayload;
  } catch {
    return undefined;
  }
}

export function clearLoginAttemptCookie(reply: FastifyReply, secure: boolean): void {
  reply.clearCookie(LOGIN_ATTEMPT_COOKIE, { path: "/", httpOnly: true, secure, sameSite: "lax" });
}
