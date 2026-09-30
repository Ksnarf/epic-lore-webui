import "fastify";
import type { AuthzClient } from "./authz-client.js";
import type { SessionPayload } from "./session.js";

/**
 * v1 task 8. The per-request auth surface route handlers (../routes/*.ts)
 * are written against, decorated onto every `FastifyRequest` by
 * ../server.ts's auth hook. Two different kinds of bearer token on purpose
 * (see ./authz-client.ts's doc comment for why they're not
 * interchangeable):
 *
 * - `sessionToken`: the session's own AuthN token, straight from the cookie.
 *   Correct for `RepositoryService.RepositoryList`/`RepositoryGet` --
 *   confirmed live these need no resource scoping.
 * - `repositoryToken(id)`: mints (and caches) the AuthZ token scoped to one
 *   repository's `urc-<hex id>` resource, for every `RevisionService`/
 *   `ThinClientService`/`LockService` call -- these are `PermissionDenied`
 *   with the plain session token, confirmed live.
 *
 * Both are `undefined`/no-ops when there is no session (fixture mode, or an
 * unauthenticated request that the auth-gate hook let through because
 * `LORE_BACKEND=fixture` -- see ../server.ts). The `grpc` backend's own
 * methods already treat a missing token as "call without an authorization
 * header", so this composes correctly with fixture mode without either side
 * needing to know which mode is active.
 */
export interface RequestAuthContext {
  sessionToken?: string;
  repositoryToken(repositoryId: Uint8Array): Promise<string | undefined>;
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: RequestAuthContext;
  }
}

export function buildAuthContext(authz: AuthzClient, session: SessionPayload | undefined): RequestAuthContext {
  return {
    sessionToken: session?.userToken,
    async repositoryToken(repositoryId: Uint8Array): Promise<string | undefined> {
      if (!session) {
        return undefined;
      }
      return authz.exchangeForRepositoryToken(session.userToken, session.userId, repositoryId);
    },
  };
}
