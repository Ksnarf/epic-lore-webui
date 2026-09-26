import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import * as api from "../api/lore-client.js";
import { useBranchesQuery, useRevisionInfoQuery, useRevisionsInfiniteQuery } from "../queries/lore.js";
import {
  assembleRevisionGraph,
  selectRelevantBranches,
  type BranchWindow,
} from "./assemble-revision-graph.js";

/**
 * v1 task 2: composes the branch graph for one "focus" branch (the one the
 * history route is looking at) out of many small, independently-cacheable
 * queries (docs/design/stack-decision.md, "State management" -- exactly
 * the shape this was designed for): `BranchList` once, the focus branch's
 * revisions via `useInfiniteQuery` (paged, user-driven "load more"), and,
 * for each *other* branch relevant to it (see `selectRelevantBranches`), a
 * single first-page revision fetch plus a tip `RevisionInfo` fetch -- both
 * O(branches shown), never O(revisions).
 *
 * The graph only ever reflects what's currently loaded: a side branch's
 * lane simply runs off the bottom of the loaded window if its own history
 * exceeds one page, and a branch point whose fork revision hasn't been
 * paged in on the focus branch yet has no connector drawn until it is --
 * both correct, honest behaviors per lane-assignment.ts's own doc comment,
 * not bugs.
 */
export function useRevisionGraph(repositoryId: string, focusBranchId: string) {
  const branchesQuery = useBranchesQuery(repositoryId);
  const focusRevisionsQuery = useRevisionsInfiniteQuery(repositoryId, focusBranchId);
  const focusTipQuery = useRevisionInfoQuery(repositoryId, focusBranchId, "0");

  const allBranches = useMemo(() => branchesQuery.data?.branches ?? [], [branchesQuery.data]);
  const focusBranch = allBranches.find((branch) => branch.id === focusBranchId);
  const focusTip = focusTipQuery.data?.revision ?? null;

  const relevantBranches = useMemo(
    () => (focusBranch ? selectRelevantBranches(focusBranch, allBranches, focusTip) : []),
    [focusBranch, allBranches, focusTip],
  );

  const otherRevisionsQueries = useQueries({
    queries: relevantBranches.map((branch) => ({
      queryKey: ["revisions", repositoryId, branch.id, "first-page"],
      queryFn: () => api.fetchRevisions(repositoryId, branch.id),
      enabled: repositoryId.length > 0,
    })),
  });
  const otherTipQueries = useQueries({
    queries: relevantBranches.map((branch) => ({
      queryKey: ["revision-info", repositoryId, branch.id, "0"],
      queryFn: () => api.fetchRevisionInfo(repositoryId, branch.id, "0"),
      enabled: repositoryId.length > 0,
    })),
  });

  const otherQueriesLoading = otherRevisionsQueries.some((q) => q.isLoading) || otherTipQueries.some((q) => q.isLoading);

  const graph = useMemo(() => {
    if (!focusBranch) {
      return null;
    }
    const branchWindows: BranchWindow[] = [
      {
        branch: focusBranch,
        revisions: (focusRevisionsQuery.data?.pages ?? []).flatMap((page) => page.items),
        tip: focusTip,
      },
      ...relevantBranches.map((branch, i) => ({
        branch,
        revisions: otherRevisionsQueries[i]?.data?.items ?? [],
        tip: otherTipQueries[i]?.data?.revision ?? null,
      })),
    ];
    return assembleRevisionGraph(branchWindows);
  }, [focusBranch, focusRevisionsQuery.data, focusTip, relevantBranches, otherRevisionsQueries, otherTipQueries]);

  return {
    isLoading: branchesQuery.isLoading || focusRevisionsQuery.isLoading || otherQueriesLoading,
    error: branchesQuery.error ?? focusRevisionsQuery.error ?? null,
    graph,
    allBranches,
    focusBranch,
    focusRevisionsQuery,
  };
}
