import type { TreeNodeDto } from "@epic-lore-webui/api-types";
import { Link } from "react-router";
import { useRevisionTreeQuery } from "../queries/lore.js";
import { useUiStore } from "../store/ui-store.js";

interface FileTreeProps {
  repositoryId: string;
  branchId: string;
  selectedPath: string;
}

/**
 * Lazy file tree (task 1): loads only the root's direct children up front,
 * then re-queries the BFF's tree route with `path` set to a directory's own
 * path when it's expanded (docs/design/stack-decision.md, "File tree" --
 * "expanding a directory triggers a scoped server request rather than the
 * client holding... a repository's entire tree at once"). Each directory's
 * children are their own TanStack Query cache entry, so re-collapsing and
 * re-expanding the same directory is free.
 */
export function FileTree({ repositoryId, branchId, selectedPath }: FileTreeProps) {
  const rootQuery = useRevisionTreeQuery(repositoryId, branchId, "");

  if (rootQuery.isLoading) {
    return <p className="text-sm text-slate-400">Loading tree...</p>;
  }
  if (rootQuery.error) {
    return (
      <p className="text-sm text-red-400">Failed to load tree: {(rootQuery.error as Error).message}</p>
    );
  }

  return (
    <ul className="font-mono text-sm">
      {rootQuery.data?.nodes.map((node) => (
        <TreeEntry
          key={node.path}
          node={node}
          repositoryId={repositoryId}
          branchId={branchId}
          depth={0}
          selectedPath={selectedPath}
        />
      ))}
    </ul>
  );
}

function TreeEntry({
  node,
  repositoryId,
  branchId,
  depth,
  selectedPath,
}: {
  node: TreeNodeDto;
  repositoryId: string;
  branchId: string;
  depth: number;
  selectedPath: string;
}) {
  const expanded = useUiStore((state) => state.expandedTreePaths.has(node.path));
  const toggleTreePath = useUiStore((state) => state.toggleTreePath);
  const isDirectory = node.nodeType === "DIRECTORY";
  const isSelected = node.path === selectedPath;

  const childrenQuery = useRevisionTreeQuery(repositoryId, branchId, node.path, {
    enabled: isDirectory && expanded,
  });

  const name = node.path.split("/").pop() ?? node.path;

  return (
    <li>
      <div
        className={`flex items-center gap-1 rounded px-1 ${isSelected ? "bg-slate-800" : "hover:bg-slate-900"}`}
        style={{ paddingLeft: `${depth}rem` }}
      >
        {isDirectory ? (
          <button
            type="button"
            onClick={() => toggleTreePath(node.path)}
            className="w-4 shrink-0 text-slate-400"
            aria-label={expanded ? `Collapse ${name}` : `Expand ${name}`}
          >
            {expanded ? "−" : "+"}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <Link
          to={`/repositories/${repositoryId}/branches/${branchId}/${node.path}`}
          className="truncate"
        >
          {name}
        </Link>
        {!isDirectory && <span className="ml-auto shrink-0 pl-2 text-xs text-slate-500">{node.size}B</span>}
      </div>
      {isDirectory && expanded && (
        <ul>
          {childrenQuery.isLoading && (
            <li className="pl-4 text-xs text-slate-500" style={{ paddingLeft: `${depth + 1}rem` }}>
              Loading...
            </li>
          )}
          {childrenQuery.error && (
            <li className="text-xs text-red-400" style={{ paddingLeft: `${depth + 1}rem` }}>
              Failed to load: {(childrenQuery.error as Error).message}
            </li>
          )}
          {childrenQuery.data?.nodes
            // The BFF echoes the expanded directory itself as the first
            // entry (RevisionTreeRequest.path_prefix semantics -- see
            // packages/api-types/src/tree.ts); don't render it as its own child.
            .filter((child) => child.path !== node.path)
            .map((child) => (
              <TreeEntry
                key={child.path}
                node={child}
                repositoryId={repositoryId}
                branchId={branchId}
                depth={depth + 1}
                selectedPath={selectedPath}
              />
            ))}
        </ul>
      )}
    </li>
  );
}
