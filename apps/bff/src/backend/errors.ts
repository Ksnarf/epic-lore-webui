/** Maps to `404 Not Found` at the route layer (routes/repositories.ts). */
export class NotFoundError extends Error {}

/** Maps to `400 Bad Request` at the route layer (routes/repositories.ts). */
export class BadRequestError extends Error {}

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
