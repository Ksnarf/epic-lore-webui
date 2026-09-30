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
}
