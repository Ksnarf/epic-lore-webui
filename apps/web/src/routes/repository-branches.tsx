import { Link, useParams } from "react-router";
import { PageShell } from "../components/page-shell.js";
import { useBranchesQuery, useRepositoryQuery } from "../queries/lore.js";

/** Task 1, step 2: branch list within a repository. Route: `/repositories/:repositoryId`. */
export function RepositoryBranchesRoute() {
  const { repositoryId } = useParams<{ repositoryId: string }>();
  const repositoryQuery = useRepositoryQuery(repositoryId ?? "");
  const branchesQuery = useBranchesQuery(repositoryId ?? "");

  if (!repositoryId) {
    return null;
  }

  return (
    <PageShell
      title={repositoryQuery.data?.repository.name ?? repositoryId}
      backTo="/"
      backLabel="All repositories"
    >
      {branchesQuery.isLoading && <p className="text-sm text-slate-400">Loading branches...</p>}
      {branchesQuery.error && (
        <p className="text-sm text-red-400">
          Failed to load branches: {(branchesQuery.error as Error).message}
        </p>
      )}
      <ul className="divide-y divide-slate-800 rounded border border-slate-800">
        {branchesQuery.data?.branches.map((branch) => (
          <li key={branch.id}>
            <Link
              to={`/repositories/${repositoryId}/branches/${branch.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-slate-900"
            >
              <span>
                {branch.name}
                {branch.isDefault && <span className="ml-2 text-xs text-slate-500">default</span>}
              </span>
              <span className="text-xs text-slate-500">{branch.creator}</span>
            </Link>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
