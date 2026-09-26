import { useEffect } from "react";
import { useParams } from "react-router";
import { FileTree } from "../components/file-tree.js";
import { PageShell } from "../components/page-shell.js";
import { useUiStore } from "../store/ui-store.js";

/**
 * Task 1, step 3: the lazily-loaded file tree. Route:
 * `/repositories/:repositoryId/branches/:branchId/*` -- the splat carries
 * the currently-selected path, so repository -> branch -> path is fully
 * deep-linkable (docs/design/stack-decision.md, "Routing").
 */
export function BranchTreeRoute() {
  const params = useParams<{ repositoryId: string; branchId: string; "*": string }>();
  const { repositoryId, branchId } = params;
  const selectedPath = params["*"] ?? "";
  const setSelectedTreePath = useUiStore((state) => state.setSelectedTreePath);

  useEffect(() => {
    setSelectedTreePath(selectedPath || null);
    return () => setSelectedTreePath(null);
  }, [selectedPath, setSelectedTreePath]);

  if (!repositoryId || !branchId) {
    return null;
  }

  return (
    <PageShell title="File tree" backTo={`/repositories/${repositoryId}`} backLabel="Branches">
      <FileTree repositoryId={repositoryId} branchId={branchId} selectedPath={selectedPath} />
    </PageShell>
  );
}
