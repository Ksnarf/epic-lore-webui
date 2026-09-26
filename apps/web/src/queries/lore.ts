import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
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
