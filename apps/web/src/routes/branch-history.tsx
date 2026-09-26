import { useNavigate, useParams } from "react-router";
import { PageShell } from "../components/page-shell.js";
import { RevisionGraph } from "../components/revision-graph.js";
import { RevisionList } from "../components/revision-list.js";
import { useRevisionGraph } from "../graph/use-revision-graph.js";

/**
 * v1 task 2 (revision history + multi-lane branch graph). Route:
 * `/repositories/:repositoryId/branches/:branchId/history/*` -- the splat
 * carries the currently-selected revision number (empty when none is
 * selected), the same deep-linkable-selection pattern task 1's
 * `branch-tree.tsx` uses for its selected path
 * (docs/design/stack-decision.md, "Routing").
 *
 * Clicking a node in the graph or a row in the list that belongs to a
 * *different* branch than the one currently focused (a fork/merge
 * neighbor shown as extra graph context) navigates to that branch's own
 * history route, switching focus -- rather than trying to show two
 * "selected" branches in one view.
 */
export function BranchHistoryRoute() {
  const params = useParams<{ repositoryId: string; branchId: string; "*": string }>();
  const { repositoryId, branchId } = params;
  const selectedNumber = params["*"] || null;
  const navigate = useNavigate();

  const { isLoading, error, graph, focusBranch, focusRevisionsQuery } = useRevisionGraph(
    repositoryId ?? "",
    branchId ?? "",
  );

  if (!repositoryId || !branchId) {
    return null;
  }

  const selectedNodeId = selectedNumber ? `${branchId}:${selectedNumber}` : null;

  const handleSelectNode = (nodeId: string) => {
    const separatorIndex = nodeId.indexOf(":");
    if (separatorIndex === -1) {
      return;
    }
    const selectedBranchId = nodeId.slice(0, separatorIndex);
    const number = nodeId.slice(separatorIndex + 1);
    navigate(`/repositories/${repositoryId}/branches/${selectedBranchId}/history/${number}`);
  };

  const focusItems = (focusRevisionsQuery.data?.pages ?? []).flatMap((page) => page.items);

  return (
    <PageShell
      title={focusBranch ? `${focusBranch.name} — History` : "History"}
      backTo={`/repositories/${repositoryId}/branches/${branchId}`}
      backLabel="File tree"
    >
      {isLoading && !graph && <p className="text-sm text-slate-400">Loading history...</p>}
      {error && <p className="text-sm text-red-400">Failed to load history: {(error as Error).message}</p>}
      {graph && (
        <div className="flex items-start gap-6">
          <RevisionList
            items={focusItems}
            branchId={branchId}
            selectedNodeId={selectedNodeId}
            onSelect={handleSelectNode}
            hasNextPage={focusRevisionsQuery.hasNextPage}
            isFetchingNextPage={focusRevisionsQuery.isFetchingNextPage}
            onLoadMore={() => void focusRevisionsQuery.fetchNextPage()}
          />
          <div className="overflow-x-auto">
            <RevisionGraph graph={graph} selectedNodeId={selectedNodeId} onSelectNode={handleSelectNode} />
          </div>
        </div>
      )}
    </PageShell>
  );
}
