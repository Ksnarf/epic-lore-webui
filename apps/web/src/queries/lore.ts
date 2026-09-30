import type { LockAcquireRequestBody, LockReleaseRequestBody } from "@epic-lore-webui/api-types";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/lore-client.js";

/**
 * TanStack Query owns all server/RPC data (docs/design/stack-decision.md,
 * "State management"). One hook per BFF route, keyed so that expanding a
 * different file-tree directory is just a new, independently-cacheable
 * query key rather than a bespoke fetch-and-merge.
 */

export function useRepositoriesQuery() {
  return useQuery({ queryKey: ["repositories"], queryFn: api.fetchRepositories });
}

export function useRepositoryQuery(repositoryId: string) {
  return useQuery({
    queryKey: ["repository", repositoryId],
    queryFn: () => api.fetchRepository(repositoryId),
    enabled: repositoryId.length > 0,
  });
}

export function useBranchesQuery(repositoryId: string) {
  return useQuery({
    queryKey: ["branches", repositoryId],
    queryFn: () => api.fetchBranches(repositoryId),
    enabled: repositoryId.length > 0,
  });
}

/**
 * v1 task 2 (revision history + multi-lane branch graph): cursor-paginated
 * revision history for one branch, via TanStack Query's `useInfiniteQuery`
 * (docs/design/stack-decision.md, "State management": "`RevisionList`
 * pagination maps directly onto `useInfiniteQuery`"). `getNextPageParam`
 * follows `signatureBackward` (older revisions); `getPreviousPageParam`
 * follows `signatureForward` (newer), so the same hook can page in either
 * direction from wherever it started (the branch tip, since the first
 * page's `pageParam` is `undefined`).
 */
export function useRevisionsInfiniteQuery(repositoryId: string, branchId: string) {
  return useInfiniteQuery({
    queryKey: ["revisions", repositoryId, branchId],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => api.fetchRevisions(repositoryId, branchId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.signatureBackward ?? undefined,
    getPreviousPageParam: (firstPage) => firstPage.signatureForward ?? undefined,
    enabled: repositoryId.length > 0 && branchId.length > 0,
  });
}

/**
 * The full record for one revision (ancestry included). `number` "0"
 * resolves to the branch tip -- used by the graph assembly to check each
 * displayed branch's tip for a merge (`parentOther`), since `RevisionItemDto`
 * (the list-row projection `useRevisionsInfiniteQuery` returns) carries no
 * parent field at all.
 */
export function useRevisionInfoQuery(
  repositoryId: string,
  branchId: string,
  number: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["revision-info", repositoryId, branchId, number],
    queryFn: () => api.fetchRevisionInfo(repositoryId, branchId, number),
    enabled: repositoryId.length > 0 && branchId.length > 0 && (options?.enabled ?? true),
  });
}

export function useRevisionTreeQuery(
  repositoryId: string,
  branchId: string,
  path: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["revision-tree", repositoryId, branchId, path],
    queryFn: () => api.fetchRevisionTree(repositoryId, branchId, path, 1),
    enabled: repositoryId.length > 0 && branchId.length > 0 && (options?.enabled ?? true),
  });
}

/**
 * v1 task 5 (lock management across all branches): all locks in one
 * repository, spanning every branch (omitting `branchId`, per
 * `LockListResponseBody`'s doc comment).
 */
export function useLocksQuery(repositoryId: string) {
  return useQuery({
    queryKey: ["locks", repositoryId],
    queryFn: () => api.fetchLocks(repositoryId),
    enabled: repositoryId.length > 0,
  });
}

/**
 * Acquire (`urc.lock.LockService.Lock`) via the BFF. Invalidates the locks
 * list on success so the new lock shows up without a manual refetch; on
 * failure the error is left on the mutation result for the caller to
 * render honestly (e.g. "already locked", or -- against a real,
 * auth-enabled `lore-server` without task 8's auth built -- an
 * unauthenticated/permission-denied error; neither is swallowed here).
 */
export function useAcquireLockMutation(repositoryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LockAcquireRequestBody) => api.acquireLock(repositoryId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["locks", repositoryId] });
    },
  });
}

/** Release (`urc.lock.LockService.Unlock`) via the BFF. Same invalidation/error-surfacing approach as `useAcquireLockMutation`. */
export function useReleaseLockMutation(repositoryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LockReleaseRequestBody) => api.releaseLock(repositoryId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["locks", repositoryId] });
    },
  });
}

/**
 * v1 task 3 (side-by-side text diff): the per-path change list between two
 * revisions on one branch (`from`/`to` decimal revision numbers).
 */
export function useRevisionDiffQuery(repositoryId: string, branchId: string, from: string, to: string) {
  return useQuery({
    queryKey: ["revision-diff", repositoryId, branchId, from, to],
    queryFn: () => api.fetchRevisionDiff(repositoryId, branchId, from, to),
    enabled: repositoryId.length > 0 && branchId.length > 0 && from.length > 0 && to.length > 0,
  });
}

/**
 * The actual text diff (or binary/truncated flag) for one changed file,
 * keyed by its two content addresses -- fetched only once a file is
 * selected in the diff view (`enabled` below), not for every changed path
 * up front.
 */
export function useContentDiffQuery(
  repositoryId: string,
  from: string,
  to: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["content-diff", repositoryId, from, to],
    queryFn: () => api.fetchContentDiff(repositoryId, from, to),
    enabled: repositoryId.length > 0 && (options?.enabled ?? true),
  });
}
