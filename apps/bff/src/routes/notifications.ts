import type { FastifyInstance } from "fastify";
import { NotFoundError } from "../backend/errors.js";
import type { LoreBackend } from "../backend/types.js";
import { toNotificationEventDto } from "../dto/lore.js";
import { handleRouteError, parseHexId } from "./repositories.js";

/** How often an SSE comment line (`:`-prefixed, ignored by `EventSource`) is written while a subscription is otherwise idle -- keeps any intermediary proxy/load balancer from timing out a connection that has no real event to send for a while. Short enough that a 30s-class proxy idle-timeout never fires, long enough not to spam the connection. */
const HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * v1 task 10 (live notifications), `lore.notification.NotificationService.Subscribe`.
 * One SSE connection per call: `GET
 * /api/repositories/:repositoryId/notifications/stream` opens a server-side
 * gRPC `Subscribe` stream (`backend.subscribeToNotifications`, scoped to
 * this repository) and relays each event to the browser as an SSE frame
 * (`event: notification`, `data:` a JSON `NotificationEventDto`).
 *
 * **Auth:** no new code here -- ../server.ts's existing `onRequest` hook
 * already 401s every unauthenticated `/api/*` request in `grpc` mode before
 * this handler ever runs (this route matches `/api/*`, nothing exempts it),
 * and already decorates `request.auth` with the session/repository-token
 * helpers every other repository-scoped route uses.
 *
 * **Client disconnect:** `request.raw`'s `close` event (fired when the
 * browser's `EventSource`/the underlying TCP connection goes away) aborts
 * `controller`, whose `signal` is threaded straight into
 * `backend.subscribeToNotifications` -- the `grpc` backend passes it to the
 * underlying stream call, so the server-side gRPC stream is actually torn
 * down, not left running after the browser has gone; the fixture backend's
 * scripted sequence stops its own delay timer the same way. No subscription
 * registry/multiplexing is kept here: each call is independent and
 * stateless, so a browser reconnect (native `EventSource` retry, or a fresh
 * page load) just opens a new one -- nothing to resume or replay.
 *
 * **Stream end/error:** a real server ending the call, or the fixture's
 * finite scripted sequence finishing, writes one `event: stream-end` frame;
 * an error that isn't just the client's own disconnect (`signal.aborted`)
 * writes one `event: stream-error` frame with the error message. Either way
 * the HTTP response is then cleanly ended -- the browser's `EventSource`
 * sees the connection close and retries on its own (this task's brief:
 * "browser-native reconnect is fine").
 */
export function registerNotificationRoutes(app: FastifyInstance, backend: LoreBackend): void {
  app.get<{ Params: { repositoryId: string } }>(
    "/api/repositories/:repositoryId/notifications/stream",
    async (request, reply) => {
      let repositoryId: Uint8Array;
      try {
        repositoryId = parseHexId(request.params.repositoryId, "repositoryId");
        const repository = await backend.getRepository(repositoryId, request.auth?.sessionToken);
        if (!repository) {
          throw new NotFoundError(`repository not found: ${request.params.repositoryId}`);
        }
      } catch (err) {
        // Nothing has been written to the real response yet (no `writeHead`,
        // no `hijack()`) -- a plain JSON error response works exactly like
        // every other route in this file.
        return handleRouteError(err, reply);
      }

      const authToken = await request.auth?.repositoryToken(repositoryId);

      // From here on, this handler owns `reply.raw` directly -- Fastify
      // will not attempt to send its own response once `hijack()` is
      // called (its own docs: "the response will not be sent by Fastify").
      reply.raw.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        // Disables response buffering for this one connection on an
        // nginx-class reverse proxy sitting in front -- harmless where none
        // does (e.g. this repo's own demo-stack validation), necessary where
        // one does (events would otherwise wait for a buffer to fill before
        // ever reaching the browser).
        "x-accel-buffering": "no",
      });
      reply.hijack();

      const controller = new AbortController();
      const onClose = () => controller.abort();
      request.raw.on("close", onClose);

      const heartbeat = setInterval(() => {
        reply.raw.write(": heartbeat\n\n");
      }, HEARTBEAT_INTERVAL_MS);

      try {
        for await (const event of backend.subscribeToNotifications({ repositoryId }, controller.signal, authToken)) {
          const dto = toNotificationEventDto(event);
          reply.raw.write(`event: notification\ndata: ${JSON.stringify(dto)}\n\n`);
        }
        reply.raw.write("event: stream-end\ndata: {}\n\n");
      } catch (err) {
        if (!controller.signal.aborted) {
          const message = err instanceof Error ? err.message : "notification stream error";
          reply.raw.write(`event: stream-error\ndata: ${JSON.stringify({ error: message })}\n\n`);
        }
      } finally {
        clearInterval(heartbeat);
        request.raw.off("close", onClose);
        reply.raw.end();
      }
    },
  );
}
