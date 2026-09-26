import type {
  BranchListResponseBody,
  RepositoryGetResponseBody,
  RepositoryListResponseBody,
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

class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { accept: "application/json" } });
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
    throw new ApiError(response.status, body?.error ?? `${path}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
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
