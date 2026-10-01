import { Link, useParams } from "react-router";
import { PageShell } from "../components/page-shell.js";
import { useBranchesQuery, useRepositoryQuery } from "../queries/lore.js";
import { useUiStore } from "../store/ui-store.js";

/** Task 1, step 2: branch list within a repository. Route: `/repositories/:repositoryId`. */
export function RepositoryBranchesRoute() {
  const { repositoryId } = useParams<{ repositoryId: string }>();
  const repositoryQuery = useRepositoryQuery(repositoryId ?? "");
  const branchesQuery = useBranchesQuery(repositoryId ?? "");
  const profile = useUiStore((state) => state.profile);

  if (!repositoryId) {
    return null;
  }

  return (
    <PageShell
      title={repositoryQuery.data?.repository.name ?? repositoryId}
      backTo="/"
      backLabel="All repositories"
    >
      {profile === "artist" ? (
        // "Locks ... front and center" (this task's brief): surfaced as a
        // bordered callout rather than a small text link, one step earlier
        // in the navigation flow than Developer's compact link below.
        <Link
          to={`/repositories/${repositoryId}/locks`}
          className="mb-4 block rounded border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-200 hover:border-slate-600 hover:bg-slate-900"
        >
          See who&rsquo;s working on what &rarr;
        </Link>
      ) : (
        <Link
          to={`/repositories/${repositoryId}/locks`}
          className="mb-4 inline-block text-sm text-slate-400 hover:text-slate-200"
        >
          View locks &rarr;
        </Link>
      )}
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
