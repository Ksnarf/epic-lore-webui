import { createGrpcTransport } from "@connectrpc/connect-node";
import type { GrpcTransportOptions } from "@connectrpc/connect-node";
import type { Transport } from "@connectrpc/connect";

/**
 * Thin transport factory for the buf-generated `lore`/`urc`/`epic_urc`
 * clients under `./gen`. Server-side only (docs/design/stack-decision.md,
 * "Monorepo" -- this package is BFF-only; `apps/web` must never import it,
 * enforced by the ESLint `no-restricted-imports` boundary rule at the repo
 * root). Uses Node's `http2` module under the hood (connect-node's native
 * gRPC transport), matching `lore-server`/`epic-lore-authz`'s native gRPC
 * endpoints -- no grpc-web involved anywhere in the BFF.
 *
 * Deliberately thin: this file does not hand-write any client or service
 * logic -- callers pass a generated `GenService` (from `./gen/...`) plus
 * this transport into `@connectrpc/connect`'s `createClient`.
 */
export type LoreTransportOptions = GrpcTransportOptions;

export function createLoreTransport(options: LoreTransportOptions): Transport {
  return createGrpcTransport(options);
}
