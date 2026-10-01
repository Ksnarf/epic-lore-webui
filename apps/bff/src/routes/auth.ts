import { randomUUID } from "node:crypto";
import type { AuthStatusResponseBody, DefaultProfileDto } from "@epic-lore-webui/api-types";
import type { FastifyInstance } from "fastify";
import type { LoreBackendKind } from "../config.js";
import type { AuthzClient } from "../auth/authz-client.js";
import { extractGroupsClaim } from "../auth/jwt-claims.js";
import { resolveDefaultProfile } from "../auth/profile-mapping.js";
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
 *
 * **v1 task 11 extension (group-membership default profile), added here
 * without touching the shape above:** the moment `GetAuthSession` resolves
 * a real `UserToken` (both the first successful poll and, for symmetry,
 * every subsequent poll of an already-established session), this route
 * decodes an optional group-membership claim off that token's JWT payload
 * (`../auth/jwt-claims.ts`, decode-only -- see its doc comment for the
 * trust boundary) and resolves it to a default profile
 * (`../auth/profile-mapping.ts`). The raw group list is stored in the
 * encrypted session (`../auth/session.ts`) so the mapping can be
 * recomputed on every poll (a `PROFILE_GROUPS_*` config change takes effect
 * without forcing a re-login) but is DELIBERATELY NEVER sent to the
 * browser -- only the resolved `defaultProfile` is. A group list is
 * organizational metadata about the user, not something this DTO's
 * existing fields (`userId`/`userName`) already expose, and the browser
 * has no legitimate use for the raw list once the server has resolved it.
 *
 * **Fixture auth path**, also added here: `FIXTURE_GROUPS` (../config.ts)
 * lets this whole chain -- claim decode, mapping, `defaultProfile` -- be
 * exercised with zero real IdP/authz reachable. It only engages when
 * `LORE_BACKEND=fixture` AND `FIXTURE_GROUPS` is actually set (both
 * conditions), and only when there is no real session or in-flight login
 * attempt cookie -- so it never shadows a real login-in-progress even in
 * fixture mode, and leaves fixture mode's behavior completely unchanged
 * (`{authenticated:false}` with no cookies) when `FIXTURE_GROUPS` is unset,
 * matching this task's "groups are optional everywhere, feature silently
 * inert" constraint for the one env var that is itself optional-by-design.
 */
export function registerAuthRoutes(
  app: FastifyInstance,
  authz: AuthzClient,
  sessionSecret: string,
  cookieSecure: boolean,
  profileConfig: {
    groupsClaim: string;
    profileGroupsArtist: string[];
    profileGroupsDeveloper: string[];
    loreBackend: LoreBackendKind;
    fixtureGroups: string[];
  },
): void {
  const { groupsClaim, profileGroupsArtist, profileGroupsDeveloper, loreBackend, fixtureGroups } = profileConfig;

  function defaultProfileFor(groups: string[] | undefined): DefaultProfileDto {
    return resolveDefaultProfile(groups ?? [], profileGroupsArtist, profileGroupsDeveloper);
  }

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
      return {
        authenticated: true,
        userId: session.userId,
        userName: session.userName,
        defaultProfile: defaultProfileFor(session.groups),
      };
    }

    const attempt = readLoginAttemptCookie(request, sessionSecret);
    if (!attempt) {
      // v1 task 11 extension: the fixture auth path. Only when there is no
      // real session AND no real login attempt in flight (see this
      // function's doc comment) -- so a real login started in fixture mode
      // is never shadowed by this synthetic branch.
      if (loreBackend === "fixture" && fixtureGroups.length > 0) {
        return {
          authenticated: true,
          userId: "fixture-user",
          userName: "Fixture User",
          defaultProfile: defaultProfileFor(fixtureGroups),
        };
      }
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

    const groups = extractGroupsClaim(userToken.userToken, groupsClaim);
    setSessionCookie(reply, sessionSecret, cookieSecure, {
      userToken: userToken.userToken,
      userId: userToken.userId,
      userName: userToken.userName,
      expiresAt: Number(userToken.expiresAt),
      groups,
    });
    clearLoginAttemptCookie(reply, cookieSecure);
    return {
      authenticated: true,
      userId: userToken.userId,
      userName: userToken.userName,
      defaultProfile: defaultProfileFor(groups),
    };
  });
}
