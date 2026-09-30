import { randomUUID } from "node:crypto";
import type { AuthStatusResponseBody } from "@epic-lore-webui/api-types";
import type { FastifyInstance } from "fastify";
import type { AuthzClient } from "../auth/authz-client.js";
import {
  clearLoginAttemptCookie,
  clearSessionCookie,
  LOGIN_WINDOW_MS,
  readLoginAttemptCookie,
  readSessionCookie,
  setLoginAttemptCookie,
  setSessionCookie,
} from "../auth/session.js";

/**
 * v1 task 8 (Okta auth), api-contract.md Option A. Three routes, all
 * talking to the EXISTING, unmodified `epic-lore-authz` (../auth/authz-client.ts)
 * -- no new server-side surface on that project at all.
 *
 * **The login-completion UX problem, and why this shape:** `epic-lore-authz`'s
 * browser-facing flow was built for a CLI (`docs/architecture.md`, "Human
 * login flow"): the browser's OWN last stop is a static "you are signed in,
 * you may close this tab" page (`lore-authz-server/src/http.rs`'s
 * `login_done`) -- there is no redirect back into whatever app initiated the
 * login, and this task must not add one to `epic-lore-authz`. A same-tab
 * `GET /login` redirect therefore genuinely cannot return control to this
 * app's own UI: the tab that followed `login_url` ends up parked on
 * `epic-lore-authz`'s page, permanently, with no JS of ours running there to
 * redirect it back.
 *
 * The only honest fix that needs no `epic-lore-authz` change: `GET /login`
 * is meant to be opened in a SEPARATE tab/window (apps/web's sign-in screen
 * does this via `window.open`), leaving the ORIGINAL tab on this app's own
 * "waiting for sign-in" screen, which polls `GET /api/auth/status`. This
 * route plays the CLI's polling role server-side -- each poll calls
 * `GetAuthSession` once (cheap; the login window's browser leg is unaffected
 * either way) -- and mints the session cookie the moment it resolves. The
 * separate tab/window that dead-ends on `epic-lore-authz`'s "close this tab"
 * page is exactly what that page already tells the user to do; this is not
 * a workaround so much as accepting the flow's own CLI-shaped assumption
 * (a human has two surfaces open: the thing driving the login, and the
 * browser tab completing it) and mapping "the thing driving the login" onto
 * this app's own tab instead of a terminal.
 *
 * **Proven live end-to-end before this route was written** (grpcurl against
 * the real demo stack, no BFF code involved yet): `StartAuthSession` ->
 * following `login_url` through the real Dex mock connector -> `GetAuthSession`
 * returning a real signed `UserToken` -- see log.log for the exact commands
 * and responses. This route is that same sequence, in code, plus the cookie
 * plumbing.
 */
export function registerAuthRoutes(
  app: FastifyInstance,
  authz: AuthzClient,
  sessionSecret: string,
  cookieSecure: boolean,
): void {
  app.get("/login", async (_request, reply) => {
    const clientState = randomUUID();
    const { sessionCode, loginUrl } = await authz.startAuthSession(clientState);
    setLoginAttemptCookie(reply, sessionSecret, cookieSecure, {
      sessionCode,
      clientState,
      createdAt: Date.now(),
    });
    return reply.redirect(loginUrl);
  });

  app.get("/logout", async (_request, reply) => {
    clearSessionCookie(reply, cookieSecure);
    clearLoginAttemptCookie(reply, cookieSecure);
    return reply.redirect("/");
  });

  app.get("/api/auth/status", async (request, reply): Promise<AuthStatusResponseBody> => {
    const session = readSessionCookie(request, sessionSecret);
    if (session) {
      return { authenticated: true, userId: session.userId, userName: session.userName };
    }

    const attempt = readLoginAttemptCookie(request, sessionSecret);
    if (!attempt) {
      return { authenticated: false };
    }

    if (Date.now() - attempt.createdAt > LOGIN_WINDOW_MS) {
      clearLoginAttemptCookie(reply, cookieSecure);
      return { authenticated: false, expired: true };
    }

    let userToken;
    try {
      userToken = await authz.getAuthSession(attempt.sessionCode, attempt.clientState);
    } catch (err) {
      request.log.warn({ err }, "GetAuthSession poll failed");
      return { authenticated: false, pending: true };
    }

    if (!userToken) {
      return { authenticated: false, pending: true };
    }

    setSessionCookie(reply, sessionSecret, cookieSecure, {
      userToken: userToken.userToken,
      userId: userToken.userId,
      userName: userToken.userName,
      expiresAt: Number(userToken.expiresAt),
    });
    clearLoginAttemptCookie(reply, cookieSecure);
    return { authenticated: true, userId: userToken.userId, userName: userToken.userName };
  });
}
