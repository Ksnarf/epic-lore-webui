export type LoreBackendKind = "fixture" | "grpc";

export interface BffConfig {
  port: number;
  host: string;
  /**
   * Which `LoreBackend` implementation (./backend/types.ts) the BFF talks
   * to. Default `"fixture"` so the app runs with no `lore-server` reachable
   * at all; set `LORE_BACKEND=grpc` to dial a real server at
   * `loreServerAddr`.
   */
  loreBackend: LoreBackendKind;
  /**
   * `host:port` the `"grpc"` backend dials (./backend/grpc.ts). Default
   * `localhost:41337` matches the `epic-lore-authz` docker-compose demo
   * stack's patched `lore-server` gRPC port.
   */
  loreServerAddr: string;
}

const VALID_BACKENDS: readonly LoreBackendKind[] = ["fixture", "grpc"];

function isLoreBackendKind(value: string): value is LoreBackendKind {
  return (VALID_BACKENDS as readonly string[]).includes(value);
}

/**
 * BFF runtime configuration, entirely from environment variables (no config
 * file, no hardcoded defaults baked into behavior beyond what's documented
 * here).
 *
 * | Env var             | Default            | Meaning                                   |
 * |----------------------|--------------------|--------------------------------------------|
 * | `PORT`               | `3000`             | HTTP port the BFF listens on                |
 * | `HOST`               | `0.0.0.0`          | HTTP host the BFF binds                     |
 * | `LORE_BACKEND`       | `fixture`          | `fixture` \| `grpc` -- see LoreBackend       |
 * | `LORE_SERVER_ADDR`   | `localhost:41337`  | `host:port` dialed when `LORE_BACKEND=grpc` |
 */
export function loadConfig(): BffConfig {
  const rawBackend = process.env.LORE_BACKEND ?? "fixture";
  if (!isLoreBackendKind(rawBackend)) {
    throw new Error(`Invalid LORE_BACKEND: "${rawBackend}" (expected "fixture" or "grpc")`);
  }
  return {
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? "0.0.0.0",
    loreBackend: rawBackend,
    loreServerAddr: process.env.LORE_SERVER_ADDR ?? "localhost:41337",
  };
}
