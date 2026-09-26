import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// apps/web is a static SPA (no server runtime of its own) -- the build
// output is served same-origin by apps/bff via @fastify/static.
// docs/design/stack-decision.md, "Build tooling: Vite, SPA, static output".
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
  },
  server: {
    proxy: {
      // Local dev only: forwards API calls to the BFF dev server so the
      // SPA can be developed against a real backend without CORS. Both
      // are served same-origin in production (single deploy container).
      "/api": "http://localhost:3000",
      "/healthz": "http://localhost:3000",
    },
  },
});
