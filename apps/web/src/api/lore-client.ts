import type {
  AdminUserGrantsResponseBody,
  AdminUsersResponseBody,
  AuthStatusResponseBody,
  BranchListResponseBody,
  ContentDiffResponseBody,
  LockAcquireRequestBody,
  LockAcquireResponseBody,
  LockListResponseBody,
  LockReleaseRequestBody,
  LockReleaseResponseBody,
  MyPermissionsResponseBody,
  RepositoryGetResponseBody,
  RepositoryListResponseBody,
  RevisionDiffResponseBody,
  RevisionInfoResponseBody,
  RevisionListResponseBody,
  RevisionTreeResponseBody,
} from "@epic-lore-webui/api-types";

/**
 * Thin fetch wrapper around the BFF's `/api/repositories/*` JSON routes
 * (apps/bff/src/routes/repositories.ts). This is the browser's only
 * contract with the backend -- plain JSON over `fetch`, typed against
 * `@epic-lore-webui/api-types` only. Never imports `@epic-lore-webui/lore-client`
 * (enforced by the root ESLint `no-restricted-imports` boundary rule): the
 * browser never speaks gRPC, per docs/design/stack-decision.md.
 */

/**
 * Exported (unlike before v1 task 9) so a route can render a specific
 * status honestly -- the admin permissions page (../routes/admin-permissions.tsx)
 * distinguishes a `404` ("admin proxy not enabled on this deployment",
 * `ADMIN_API_TOKEN` unset -- apps/bff/src/server.ts never registers the
 * routes at all) from a `403` ("you don't hold the admin grant") instead of
 * both rendering as the same generic failure.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { accept: "application/json" } });
  return readJsonOrThrow<T>(path, response);
}

/** Shared by `acquireLock`/`releaseLock` (v1 task 5) -- both send a JSON body and expect a JSON response, differing only in HTTP method. */
async function sendJson<T>(path: string, method: "POST" | "DELETE", body: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJsonOrThrow<T>(path, response);
}

/**
 * v1 task 8 (Okta auth). A `401` from any `/api/*` route means the BFF's own
 * session cookie is missing/expired -- the `grpc`-backend-only auth gate in
 * apps/bff/src/server.ts. Redirecting straight to `/sign-in` here (instead
 * of just throwing an `ApiError`) is what satisfies "401 -> redirect to
 * login" without every single call site needing its own 401 handling; the
 * one legitimate case that must NOT redirect -- `GET /api/auth/status`
 * itself, which always answers `200` with `{authenticated: false}`, never
 * `401` -- calls `fetch` directly (`fetchAuthStatus` below), not through
 * this helper.
 */
async function readJsonOrThrow<T>(path: string, response: Response): Promise<T> {
  if (response.status === 401) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/sign-in?next=${next}`);
    // The navigation above is async; throw so callers' `.then`/`await`
    // chains don't proceed as if they had real data while it happens.
    throw new ApiError(401, "unauthenticated -- redirecting to sign-in");
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
    throw new ApiError(response.status, body?.error ?? `${path}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

/**
 * v1 task 8. Never redirects on `401` (see `readJsonOrThrow`'s doc comment)
 * -- this IS the endpoint the sign-in screen (../routes/sign-in.tsx) polls
 * to find out whether it's authenticated yet, so it always resolves with a
 * body, including `{authenticated: false}`.
 */
export async function fetchAuthStatus(): Promise<AuthStatusResponseBody> {
  const response = await fetch("/api/auth/status", { headers: { accept: "application/json" } });
  return (await response.json()) as AuthStatusResponseBody;
}

export function fetchRepositories(): Promise<RepositoryListResponseBody> {
  return getJson("/api/repositories");
}

export function fetchRepository(repositoryId: string): Promise<RepositoryGetResponseBody> {
  return getJson(`/api/repositories/${encodeURIComponent(repositoryId)}`);
}

export function fetchBranches(repositoryId: string): Promise<BranchListResponseBody> {
  return getJson(`/api/repositories/${encodeURIComponent(repositoryId)}/branches`);
}

export function fetchRevisionTree(
  repositoryId: string,
  branchId: string,
  path: string,
  depth = 1,
): Promise<RevisionTreeResponseBody> {
  const params = new URLSearchParams();
  if (path) {
    params.set("path", path);
  }
  params.set("depth", String(depth));
  return getJson(
    `/api/repositories/${encodeURIComponent(repositoryId)}/branches/${encodeURIComponent(branchId)}/tree?${params.toString()}`,
  );
}

/**
 * One page of a branch's revision history (v1 task 2). `cursor` omitted
 * resolves to the branch tip; pass a prior response's `signatureBackward`
 * to fetch the next (older) page -- see `useRevisionsInfiniteQuery`
 * (../queries/lore.ts), which drives this via TanStack Query's
 * `useInfiniteQuery`.
 */
export function fetchRevisions(
  repositoryId: string,
  branchId: string,
  cursor?: string,
): Promise<RevisionListResponseBody> {
  const params = new URLSearchParams();
  if (cursor) {
    params.set("cursor", cursor);
  }
  const query = params.toString();
  return getJson(
    `/api/repositories/${encodeURIComponent(repositoryId)}/branches/${encodeURIComponent(branchId)}/revisions${query ? `?${query}` : ""}`,
  );
}

/**
 * The full record for one revision, including ancestry (`parentSelf`/
 * `parentOther`) -- `number` "0" resolves to the branch tip. Used sparingly
 * by the graph assembly (../graph/assemble-revision-graph.ts) to detect
 * merges, since `RevisionItemDto` (the list-row projection above) carries
 * no parent field at all.
 */
export function fetchRevisionInfo(
  repositoryId: string,
  branchId: string,
  number: string,
): Promise<RevisionInfoResponseBody> {
  return getJson(
    `/api/repositories/${encodeURIComponent(repositoryId)}/branches/${encodeURIComponent(branchId)}/revisions/${encodeURIComponent(number)}`,
  );
}

/**
 * v1 task 5 (lock management across all branches). Omitting `branchId`
 * queries every branch of the repository -- see `LockListResponseBody`'s
 * doc comment.
 */
export function fetchLocks(repositoryId: string, branchId?: string): Promise<LockListResponseBody> {
  const params = new URLSearchParams();
  if (branchId) {
    params.set("branchId", branchId);
  }
  const query = params.toString();
  return getJson(`/api/repositories/${encodeURIComponent(repositoryId)}/locks${query ? `?${query}` : ""}`);
}

/** `urc.lock.LockService.Lock` via the BFF -- errors (rejects) if the resource is already locked. */
export function acquireLock(repositoryId: string, body: LockAcquireRequestBody): Promise<LockAcquireResponseBody> {
  return sendJson(`/api/repositories/${encodeURIComponent(repositoryId)}/locks`, "POST", body);
}

/** `urc.lock.LockService.Unlock` via the BFF -- no-ops if no lock exists for the resource. */
export function releaseLock(repositoryId: string, body: LockReleaseRequestBody): Promise<LockReleaseResponseBody> {
  return sendJson(`/api/repositories/${encodeURIComponent(repositoryId)}/locks`, "DELETE", body);
}

/**
 * v1 task 3 (side-by-side text diff). `from`/`to` are decimal revision
 * numbers on the same branch -- see `RevisionDiffResponseBody`'s doc
 * comment (packages/api-types/src/diff.ts) for the same-branch scope
 * decision.
 */
export function fetchRevisionDiff(
  repositoryId: string,
  branchId: string,
  from: string,
  to: string,
): Promise<RevisionDiffResponseBody> {
  return getJson(
    `/api/repositories/${encodeURIComponent(repositoryId)}/branches/${encodeURIComponent(branchId)}/diff/${encodeURIComponent(from)}/${encodeURIComponent(to)}`,
  );
}

/**
 * v1 task 3. `from`/`to` are hex-encoded CAS addresses; an empty string
 * means "no content on this side" (`ContentDiffRequest.address_from`/
 * `address_to`'s own doc comment -- e.g. an ADD or DELETE change).
 */
export function fetchContentDiff(repositoryId: string, from: string, to: string): Promise<ContentDiffResponseBody> {
  const params = new URLSearchParams({ from, to });
  return getJson(`/api/repositories/${encodeURIComponent(repositoryId)}/content-diff?${params.toString()}`);
}

/**
 * v1 task 9 (permissions view), self-service half. Always reachable --
 * `apps/bff/src/routes/permissions.ts` has no `ADMIN_API_TOKEN` gate.
 */
export function fetchMyPermissions(): Promise<MyPermissionsResponseBody> {
  return getJson("/api/permissions/me");
}

/**
 * v1 task 9, admin view. May 404 (admin proxy disabled on this deployment)
 * or 403 (caller lacks the admin grant) -- both real, distinguishable
 * `ApiError.status` values the admin permissions route renders honestly
 * rather than treating as the same generic failure.
 */
export function fetchAdminUsers(): Promise<AdminUsersResponseBody> {
  return getJson("/api/admin/users");
}

/** v1 task 9, admin view. Same 404/403 possibilities as `fetchAdminUsers`. */
export function fetchAdminUserGrants(userId: string): Promise<AdminUserGrantsResponseBody> {
  return getJson(`/api/admin/users/${encodeURIComponent(userId)}/grants`);
}
