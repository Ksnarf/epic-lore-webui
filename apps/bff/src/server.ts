import { fileURLToPath } from "node:url";
import path from "node:path";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyCsrf from "@fastify/csrf-protection";
import fastifyStatic from "@fastify/static";
import { registerHealthzRoute } from "./routes/healthz.js";
import { registerApiRoutes } from "./routes/api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// apps/web's Vite build output, copied same-origin into this image at
// deploy time (docs/design/stack-decision.md, "Monorepo" -- "Deploy":
// "the web build's static output is copied into the BFF's image and served
// via @fastify/static"). In this scaffold, points at the sibling workspace's
// dist/ for local dev; production images should copy it in at the same
// relative path.
const WEB_DIST_DIR = path.resolve(__dirname, "../../web/dist");

export async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(fastifyCookie);

  // TODO(task 8, Okta auth): once the BFF holds a real encrypted session
  // cookie (docs/design/stack-decision.md, "Auth (v1 shape)"), csrf
  // protection needs a cookie-backed secret store wired here, not the
  // in-memory default. Stubbed for scaffold only.
  await app.register(fastifyCsrf, { cookieOpts: { signed: false } });

  await app.register(fastifyStatic, {
    root: WEB_DIST_DIR,
    // SPA fallback (React Router v7 library-mode client routing) is wired
    // when apps/web has real routes to fall back to -- see task 1.
    wildcard: false,
  });

  registerHealthzRoute(app);
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
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";
  await app.listen({ port, host });
}

// Only run when executed directly (not when imported, e.g. by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
