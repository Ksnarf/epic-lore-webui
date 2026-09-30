/** Maps to `404 Not Found` at the route layer (routes/repositories.ts). */
export class NotFoundError extends Error {}

/** Maps to `400 Bad Request` at the route layer (routes/repositories.ts). */
export class BadRequestError extends Error {}

/**
 * Maps to `401 Unauthorized` at the route layer (routes/repositories.ts).
 * v1 task 8: the `grpc` backend throws this when `lore-server`/
 * `epic-lore-authz` itself rejects a bearer token as `Unauthenticated` --
 * distinct from the BFF's own session-cookie gate (../server.ts's `onRequest`
 * hook), which catches the common case (no session at all) before ever
 * reaching the backend. This covers the rarer case of a session that looked
 * valid to the BFF but the token itself is no longer accepted server-side
 * (e.g. a demo stack restart rotating its ephemeral signing key).
 */
export class UnauthorizedError extends Error {}

/**
 * Maps to `403 Forbidden` at the route layer (routes/repositories.ts).
 * v1 task 8: the `grpc` backend throws this when a real, valid session's
 * per-repository AuthZ token (../auth/authz-client.ts) is accepted but the
 * user has no grant on that repository -- confirmed live that
 * `ExchangeUserTokenForMultiresourceToken` itself never errors for an
 * ungranted resource id (it mints a token with an empty `resources` claim);
 * `lore-server` is what then returns `PermissionDenied` on the actual RPC.
 */
export class ForbiddenError extends Error {}

/**
 * Maps to `409 Conflict` at the route layer (routes/repositories.ts).
 * v1 task 5 (locks): the fixture backend raises this when acquiring a lock
 * on a resource that is already locked, mirroring `urc.lock.LockService.Lock`'s
 * own doc comment ("errors if already locked"). The real `grpc` backend does
 * not attempt this mapping -- its underlying `ConnectError` code for this
 * case was not confirmed live (see tasks.md task 5), so it is left
 * unmapped/rethrown rather than guessed at.
 */
export class ConflictError extends Error {}
