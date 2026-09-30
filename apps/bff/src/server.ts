import { fileURLToPath } from "node:url";
import path from "node:path";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyCsrf from "@fastify/csrf-protection";
import fastifyStatic from "@fastify/static";
import { createAuthzClient } from "./auth/authz-client.js";
import { buildAuthContext } from "./auth/request-context.js";
import { readSessionCookie } from "./auth/session.js";
import { createFixtureBackend } from "./backend/fixture.js";
import { createGrpcBackend } from "./backend/grpc.js";
import { loadConfig } from "./config.js";
import { registerHealthzRoute } from "./routes/healthz.js";
import { registerApiRoutes } from "./routes/api.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerDiffRoutes } from "./routes/diff.js";
import { registerLockRoutes } from "./routes/locks.js";
import { registerRepositoryRoutes } from "./routes/repositories.js";
import { registerRevisionRoutes } from "./routes/revisions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// apps/web's Vite build output, copied same-origin into this image at
// deploy time (docs/design/stack-decision.md, "Monorepo" -- "Deploy":
// "the web build's static output is copied into the BFF's image and served
// via @fastify/static"). In this scaffold, points at the sibling workspace's
// dist/ for local dev; production images should copy it in at the same
// relative path.
const WEB_DIST_DIR = path.resolve(__dirname, "../../web/dist");

export async function buildServer() {
  const config = loadConfig();
  const app = Fastify({ logger: true });

  await app.register(fastifyCookie);

  // Not wired to any route yet (v1 task 8 built session auth, not a
  // state-changing form/route that needs CSRF tokens -- /login and /logout
  // are simple GETs, and every mutating /api/* route is same-origin JSON
  // fetch, not a browser form post). Left registered, unused, as scaffolded;
  // revisit if a future task adds a route this plugin should actually guard.
  await app.register(fastifyCsrf, { cookieOpts: { signed: false } });

  await app.register(fastifyStatic, {
    root: WEB_DIST_DIR,
    wildcard: true,
  });

  // SPA fallback: task 1's routes (repository -> branch -> path) are
  // client-side React Router routes (docs/design/stack-decision.md,
  // "Routing"). `@fastify/static`'s `wildcard: true` only serves files that
  // actually exist under WEB_DIST_DIR and otherwise calls
  // `reply.callNotFound()` (verified against its source -- its own docs'
  // wording ("adds a wildcard route to serve files") reads like Express's
  // history-API-fallback but isn't); it does not itself fall back to
  // index.html. This handler is what actually makes a direct/reloaded deep
  // link (e.g. `/repositories/<id>/branches/<id>/some/path`) work: any GET
  // that isn't `/api/*` and didn't match a real static asset gets
  // index.html, and the client-side router takes over from there. A
  // missed `/api/*` route still 404s as JSON, not HTML.
  app.setNotFoundHandler((request, reply) => {
    if (request.method === "GET" && !request.url.startsWith("/api/")) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ error: "not found" });
  });

  registerHealthzRoute(app);

  // v1 task 8 (Okta auth), api-contract.md Option A. AuthzClient talks to
  // epic-lore-authz's UNMODIFIED UrcAuthApi (StartAuthSession/GetAuthSession/
  // ExchangeUserTokenForMultiresourceToken) -- built unconditionally, not
  // gated on LORE_BACKEND, so a real login can be exercised in fixture mode
  // too (see ./config.ts's authzServerAddr doc comment).
  const authz = createAuthzClient(config.authzServerAddr);
  registerAuthRoutes(app, authz, config.sessionSecret, config.cookieSecure);

  // Auth gate + per-request auth context, both in one hook: every request
  // gets `request.auth` (../auth/request-context.ts) built from whatever
  // session cookie it presents (possibly none). In `grpc` mode, `/api/*`
  // additionally requires a real session -- lore-server rejects every
  // repository-scoped RPC without one anyway (confirmed live, see
  // apps/bff/src/backend/grpc.ts's repositoryHeaders doc comment), so this
  // is a clean, honest 401 instead of letting an unauthenticated call reach
  // the backend and fail with a raw gRPC error. `fixture` mode has no auth
  // concept at all (a deliberate v1 scope decision -- fixture mode exists so
  // the whole app runs with zero external dependencies, including
  // epic-lore-authz) and stays fully open regardless of session state.
  // `/api/auth/*` is exempt either way -- the status endpoint IS how an
  // unauthenticated browser finds out it's unauthenticated.
  app.addHook("onRequest", async (request, reply) => {
    const session = readSessionCookie(request, config.sessionSecret);
    if (
      config.loreBackend === "grpc" &&
      !session &&
      request.url.startsWith("/api/") &&
      !request.url.startsWith("/api/auth/")
    ) {
      return reply.code(401).send({ error: "unauthenticated" });
    }
    request.auth = buildAuthContext(authz, session);
  });

  // LORE_BACKEND selects the data source for v1 task 1 (repo browse + file
  // tree); default "fixture" so the app runs with no lore-server reachable
  // at all. See ./config.ts for the full env var contract.
  const backend =
    config.loreBackend === "grpc" ? createGrpcBackend(config.loreServerAddr) : createFixtureBackend();
  app.log.info(
    { loreBackend: config.loreBackend, loreServerAddr: config.loreServerAddr },
    "lore backend selected",
  );
  registerRepositoryRoutes(app, backend);
  registerRevisionRoutes(app, backend);
  registerLockRoutes(app, backend);
  registerDiffRoutes(app, backend);
  registerApiRoutes(app);

  // TODO(task 9): /api/admin/* proxy routes, gated per-route by
  // CheckUserPermission, ADMIN_API_TOKEN read from env only, 404 when
  // unset (fail-closed). See stack-decision.md, "Admin proxy (task 9)".

  // TODO(task 10): SSE route multiplexing lore.notification.NotificationService
  // subscriptions onto one channel per session. See stack-decision.md,
  // "Streaming (task 10)".

  return { app, config };
}

async function main() {
  const { app, config } = await buildServer();
  await app.listen({ port: config.port, host: config.host });
}

// Only run when executed directly (not when imported, e.g. by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
