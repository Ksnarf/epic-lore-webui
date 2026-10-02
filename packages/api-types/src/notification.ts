import type { HexBytes } from "./hex-bytes.js";
import type { LockResourceDto } from "./lock.js";

/**
 * v1 task 10 (live notifications). Mirrors `lore.notification.NotificationService`
 * (`proto/vendor/lore/lore_notification.proto`) -- **not** the legacy
 * `urc.notification` package tasks.md/README originally named (correction
 * recorded in docs/design/api-contract.md section 1 feature 10 and
 * tasks.md's own task 10 line): `lore-server`'s live gRPC handler
 * (`lore-server/src/grpc/notification_service.rs`) implements the
 * `lore.notification` package.
 *
 * `Subscribe` is server-streaming, one call per repository
 * (`SubscribeRequest.repository`) -- relayed by the BFF over SSE, since
 * browsers cannot speak native gRPC (docs/design/stack-decision.md,
 * "Streaming (task 10)": "Server-Sent Events, not WebSocket"). See
 * `apps/bff/src/routes/notifications.ts` for the relay route and
 * `apps/web/src/notifications/*` for the browser-side `EventSource`
 * consumer. `Publish` (the other `NotificationService` RPC, and
 * `NotificationAdminService` entirely) are out of this task's scope --
 * this UI only ever subscribes, it never publishes or administers.
 */

/**
 * Mirrors `lore.notification.Event`'s `oneof event` discriminant, flattened
 * to one shape over the wire rather than a TypeScript discriminated union --
 * `apps/web/src/notifications/query-invalidation.ts` switches on this field.
 *
 * **Scope decision:** `obliterate` and `other` (`ExtensionEvent`) carry no
 * extra fields beyond the base ones below -- neither has a consuming UI
 * feature in this task's surgical scope (no obliterate/extension-aware view
 * exists anywhere in this app), so their richer wire payloads
 * (`Obliterate.address`, `ExtensionEvent.payload` -- an opaque
 * `google.protobuf.Any`) are deliberately not mapped here. A future task
 * adding such a view extends this type then, rather than this task guessing
 * at a shape nothing consumes today.
 */
export type NotificationEventKind =
  | "branchCreated"
  | "branchPushed"
  | "branchDeleted"
  | "resourceLocked"
  | "resourceUnlocked"
  | "obliterate"
  | "other";

/**
 * One frame of the `GET /api/repositories/:repositoryId/notifications/stream`
 * SSE stream (`event: notification`, `data:` this JSON object).
 */
export interface NotificationEventDto {
  /** `Event.id` -- a UUID, per the proto's own doc comment. */
  id: string;
  /**
   * `Event.time`, converted from `google.protobuf.Timestamp` to a ms-epoch
   * decimal string -- same convention as `LockDto.lockedAt`.
   */
  time: string;
  repositoryId: HexBytes;
  kind: NotificationEventKind;
  /** `branchCreated` / `branchPushed` / `branchDeleted` only. */
  branchId?: HexBytes;
  /** `branchPushed` only. */
  revisionNumber?: string;
  /** `branchPushed` / `resourceLocked` / `resourceUnlocked` only. */
  userId?: string;
  /** `resourceLocked` / `resourceUnlocked` only. */
  resources?: LockResourceDto[];
  /** `other` only (`ExtensionEvent.type`) -- see this file's top comment on why `payload` itself isn't mapped. */
  extensionType?: string;
}
