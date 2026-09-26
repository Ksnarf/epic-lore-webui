import { fileURLToPath } from "node:url";
import path from "node:path";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyCsrf from "@fastify/csrf-protection";
import fastifyStatic from "@fastify/static";
import { createFixtureBackend } from "./backend/fixture.js";
import { createGrpcBackend } from "./backend/grpc.js";
import { loadConfig } from "./config.js";
import { registerHealthzRoute } from "./routes/healthz.js";
import { registerApiRoutes } from "./routes/api.js";
import { registerRepositoryRoutes } from "./routes/repositories.js";

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

  // TODO(task 8, Okta auth): once the BFF holds a real encrypted session
  // cookie (docs/design/stack-decision.md, "Auth (v1 shape)"), csrf
  // protection needs a cookie-backed secret store wired here, not the
  // in-memory default. Stubbed for scaffold only.
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
  registerApiRoutes(app);

  // TODO(task 8): OIDC/PKCE login + callback routes against Okta, per
  // docs/design/stack-decision.md "Auth (v1 shape)". Blocked upstream on
  // epic-lore-authz Phase 1b (see stack-decision.md, "Upstream
  // dependencies" item 1) -- do not implement against a fake token
  // exchange; leave unbuilt until the real endpoint exists.

  // TODO(task 9): /api/admin/* proxy routes, gated per-route by
  // CheckUserPermission, ADMIN_API_TOKEN read from env only, 404 when
  // unset (fail-closed). See stack-decision.md, "Admin proxy (task 9)".

  // TODO(task 10): SSE route multiplexing lore.notification.NotificationService
  // subscriptions onto one channel per session. See stack-decision.md,
  // "Streaming (task 10)".

  return app;
}

async function main() {
  const app = await buildServer();
  const config = loadConfig();
  await app.listen({ port: config.port, host: config.host });
}

// Only run when executed directly (not when imported, e.g. by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
