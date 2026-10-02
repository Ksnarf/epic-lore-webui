import type { NotificationEventDto } from "@epic-lore-webui/api-types";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { queryKeysForNotificationEvent } from "./query-invalidation.js";

export type NotificationConnectionState = "connecting" | "open" | "closed";

/**
 * v1 task 10 (live notifications). Opens one `EventSource` against
 * `GET /api/repositories/:repositoryId/notifications/stream`
 * (`apps/bff/src/routes/notifications.ts`) for as long as this hook is
 * mounted with a non-empty `repositoryId`, and invalidates the TanStack
 * Query caches `../queries/lore.ts`'s hooks already use
 * (`./query-invalidation.ts`) whenever a matching event arrives. Returns the
 * connection state so a mounting component can render a subtle indicator
 * (`../components/page-shell.tsx`'s `NotificationIndicator`).
 *
 * **Reconnection** is the browser's own `EventSource` behavior (per this
 * task's brief: "browser-native reconnect is fine") -- this hook implements
 * no backoff/retry of its own. The BFF route is stateless per connection
 * (`../../apps/bff/src/routes/notifications.ts`'s doc comment: "nothing to
 * resume or replay"), so a fresh reconnect after any drop just re-subscribes
 * cleanly from whatever the server's current state is.
 *
 * **Teardown**: unmounting (navigating away from a repository-scoped view,
 * or `repositoryId` changing) closes the `EventSource` via this effect's
 * cleanup -- the route's own client-disconnect handling (`request.raw`'s
 * `close` event) then tears down the server-side gRPC stream, so no
 * subscription is left running after the browser has navigated away.
 */
export function useRepositoryNotifications(repositoryId: string | undefined): NotificationConnectionState {
  const queryClient = useQueryClient();
  const [state, setState] = useState<NotificationConnectionState>("connecting");

  useEffect(() => {
    if (!repositoryId) {
      return;
    }
    setState("connecting");
    const source = new EventSource(`/api/repositories/${encodeURIComponent(repositoryId)}/notifications/stream`);

    source.addEventListener("open", () => setState("open"));
    // `EventSource`'s own `error` event fires both on a genuine failure and
    // on every drop it's about to auto-retry -- there is no way to tell
    // those apart from this event alone, and the brief says native retry is
    // fine, so this just reflects "not currently open" rather than treating
    // it as a terminal failure.
    source.addEventListener("error", () => setState("connecting"));
    source.addEventListener("notification", (rawEvent) => {
      const messageEvent = rawEvent as MessageEvent<string>;
      let event: NotificationEventDto;
      try {
        event = JSON.parse(messageEvent.data) as NotificationEventDto;
      } catch {
        return; // malformed frame -- ignored, not crashed on.
      }
      for (const queryKey of queryKeysForNotificationEvent(event, repositoryId)) {
        void queryClient.invalidateQueries({ queryKey });
      }
    });
    // `stream-end`/`stream-error` (the route's own clean-close/error frames)
    // need no listener here beyond what already happens: the server ending
    // its side of the HTTP response is itself what fires `EventSource`'s
    // native reconnect, same as any other connection drop.

    return () => {
      source.close();
      setState("closed");
    };
  }, [repositoryId, queryClient]);

  return state;
}
