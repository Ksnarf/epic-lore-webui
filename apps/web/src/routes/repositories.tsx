import { Link } from "react-router";
import { PageShell } from "../components/page-shell.js";
import { useRepositoriesQuery } from "../queries/lore.js";

/** Task 1, step 1: repository list. Route: `/`. */
export function RepositoriesRoute() {
  const { data, isLoading, error } = useRepositoriesQuery();

  return (
    <PageShell title="Repositories">
      {isLoading && <p className="text-sm text-slate-400">Loading repositories...</p>}
      {error && (
        <p className="text-sm text-red-400">Failed to load repositories: {(error as Error).message}</p>
      )}
      {data && data.repositories.length === 0 && (
        <p className="text-sm text-slate-400">No repositories.</p>
      )}
      <ul className="divide-y divide-slate-800 rounded border border-slate-800">
        {data?.repositories.map((repository) => (
          <li key={repository.id}>
            <Link
              to={`/repositories/${repository.id}`}
              className="block px-4 py-3 hover:bg-slate-900"
            >
              <div className="font-medium">{repository.name}</div>
              {repository.description && (
                <div className="text-sm text-slate-400">{repository.description}</div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
