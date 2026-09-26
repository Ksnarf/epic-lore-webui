import { useQuery } from "@tanstack/react-query";
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
