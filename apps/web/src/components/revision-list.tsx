import type { RevisionItemDto } from "@epic-lore-webui/api-types";
import { Link } from "react-router";
import { GRAPH_ROW_HEIGHT } from "../graph/layout.js";

interface RevisionListProps {
  items: RevisionItemDto[];
  repositoryId: string;
  branchId: string;
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
  hasNextPage: boolean | undefined;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

/**
 * v1 task 2's cursor-paginated revision list (the textual half of the
 * history view, `RevisionGraph` is the graphical half). Each row is
 * exactly `GRAPH_ROW_HEIGHT` tall so row *n* here lines up pixel-for-pixel
 * with row *n* of the graph beside it (../graph/layout.ts) -- both are
 * built from the same flattened `useInfiniteQuery` pages
 * (../graph/use-revision-graph.ts), in the same newest-first order.
 */
export function RevisionList({
  items,
  repositoryId,
  branchId,
  selectedNodeId,
  onSelect,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: RevisionListProps) {
  return (
    <div className="min-w-0 flex-1">
      <ul className="divide-y divide-slate-800 rounded border border-slate-800 font-mono text-sm">
        {items.map((item) => {
          const nodeId = `${branchId}:${item.number}`;
          const isSelected = nodeId === selectedNodeId;
          // v1 task 3: "diff vs previous" links every revision except #1 --
          // a branch root's real parent is on a different branch (the fork
          // point) whose revision number isn't resolvable without an extra
          // RevisionInfo-by-signature call this task deliberately doesn't
          // make. See routes/revision-diff.tsx's top comment.
          const previousNumber = String(BigInt(item.number) - 1n);
          const canDiffVsPrevious = item.number !== "1";
          return (
            <li key={item.number} style={{ height: GRAPH_ROW_HEIGHT }} className="flex items-stretch">
              <button
                type="button"
                onClick={() => onSelect(nodeId)}
                className={`flex h-full flex-1 items-center gap-3 px-3 text-left ${
                  isSelected ? "bg-slate-800" : "hover:bg-slate-900"
                }`}
              >
                <span className="text-slate-500">#{item.number}</span>
                <span className="truncate text-slate-300">{item.signature.slice(0, 12)}</span>
              </button>
              {canDiffVsPrevious && (
                <Link
                  to={`/repositories/${repositoryId}/branches/${branchId}/diff/${previousNumber}/${item.number}`}
                  className="flex shrink-0 items-center px-3 text-xs text-slate-500 hover:bg-slate-900 hover:text-slate-300"
                  title={`Diff revision ${previousNumber} vs ${item.number}`}
                >
                  diff
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {hasNextPage && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isFetchingNextPage}
          className="mt-2 rounded border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:bg-slate-900 disabled:opacity-50"
        >
          {isFetchingNextPage ? "Loading..." : "Load older revisions"}
        </button>
      )}
    </div>
  );
}
