/** Maps to `404 Not Found` at the route layer (routes/repositories.ts). */
export class NotFoundError extends Error {}

/** Maps to `400 Bad Request` at the route layer (routes/repositories.ts). */
export class BadRequestError extends Error {}
