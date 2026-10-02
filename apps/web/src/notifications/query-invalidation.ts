import type { NotificationEventDto } from "@epic-lore-webui/api-types";
import type { QueryKey } from "@tanstack/react-query";

/**
 * v1 task 10 (live notifications). Pure mapping from one SSE notification
 * event to the TanStack Query cache keys it should invalidate -- kept
 * separate from `./use-notifications.ts` (the actual `EventSource` wiring)
 * so this logic is unit-testable with no browser `EventSource`/DOM at all.
 *
 * **These are the SAME key arrays `../queries/lore.ts`'s hooks already use**
 * (`["locks", repositoryId]`, `["revisions", repositoryId, branchId]`,
 * `["branches", repositoryId]`) -- not a parallel convention. A key drifting
 * out of sync with that file would silently stop invalidating the right
 * cache entry, so if one of those hooks' key shapes ever changes, this file
 * has to change with it.
 *
 * **Scope decision (per this task's "surgical, no notification-center UI"
 * brief):** only the event kinds the brief names explicitly --
 * `resourceLocked`/`resourceUnlocked` ("locks list refetch on lock events")
 * and `branchPushed` ("revision list on push events") -- drive a real
 * invalidation. `branchCreated`/`branchDeleted` additionally invalidate the
 * branches list (the one view either could plausibly affect, and the most
 * directly-named cache for a branch-identity change), since that's a small,
 * clearly-justified extension of the same idea, not new UI. `obliterate`/
 * `other` invalidate nothing -- no view in this app renders anything keyed
 * to either (see `packages/api-types/src/notification.ts`'s top comment).
 */
export function queryKeysForNotificationEvent(event: NotificationEventDto, repositoryId: string): QueryKey[] {
  switch (event.kind) {
    case "resourceLocked":
    case "resourceUnlocked":
      return [["locks", repositoryId]];
    case "branchPushed":
      return event.branchId
        ? [
            ["revisions", repositoryId, event.branchId],
            ["branches", repositoryId],
          ]
        : [["branches", repositoryId]];
    case "branchCreated":
    case "branchDeleted":
      return [["branches", repositoryId]];
    case "obliterate":
    case "other":
      return [];
  }
}
