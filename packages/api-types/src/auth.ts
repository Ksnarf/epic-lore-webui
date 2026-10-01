/**
 * v1 task 11 extension (group-membership default profile, built
 * path-agnostically -- works whether group names eventually arrive via a
 * future authz-minted `UserToken` claim or a native Okta/OIDC token
 * directly; see apps/bff/src/auth/jwt-claims.ts and ./profile-mapping.ts's
 * doc comments). `null` means "no group-based default" -- either the user
 * has no groups at all (today's real authz tokens), or their groups match
 * neither `PROFILE_GROUPS_ARTIST` nor `PROFILE_GROUPS_DEVELOPER`
 * (apps/bff/src/config.ts) -- and must be treated as inert, not an error,
 * by every consumer.
 */
export type DefaultProfileDto = "developer" | "artist" | null;

/**
 * v1 task 8 (Okta auth). `GET /api/auth/status` -- polled by the web app's
 * sign-in screen (see apps/web/src/routes/sign-in.tsx) while a login is in
 * flight in a separate browser tab/window (apps/bff/src/routes/auth.ts's
 * doc comment explains why a separate window, not a same-tab redirect, is
 * the only honest option given `epic-lore-authz`'s login flow ends on its
 * own static "close this tab" page with no redirect hook).
 */
export interface AuthStatusResponseBody {
  authenticated: boolean;
  userId?: string;
  userName?: string;
  /** A login attempt cookie exists and is still inside its time window -- keep polling. */
  pending?: boolean;
  /** A login attempt cookie existed but its time window elapsed -- stop polling, the user must retry. */
  expired?: boolean;
  /**
   * v1 task 11 extension. The user's server-resolved default profile, or
   * `null` if none applies. Deliberately the ONLY group-derived field
   * exposed to the browser -- the raw group list itself is never sent here
   * (see apps/bff/src/routes/auth.ts's doc comment for that choice).
   * Present whenever `authenticated` is `true`; absent (not `null`) when
   * `authenticated` is `false`, matching this DTO's existing
   * present-only-when-relevant convention for `userId`/`userName`.
   */
  defaultProfile?: DefaultProfileDto;
}
