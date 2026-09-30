import type { DiffChangeDto } from "@epic-lore-webui/api-types";
import { useNavigate, useParams } from "react-router";
import { DiffView } from "../components/diff-view.js";
import { PageShell } from "../components/page-shell.js";
import { useContentDiffQuery, useRevisionDiffQuery } from "../queries/lore.js";

/**
 * v1 task 3 (side-by-side text diff + binary-aware diff). Route:
 * `/repositories/:repositoryId/branches/:branchId/diff/:from/:to/*` --
 * `:from`/`:to` are decimal revision numbers on the same branch (see
 * `packages/api-types/src/diff.ts`'s top comment for why this repo scopes
 * `RevisionDiff` to one branch's own two numbers, not the proto's more
 * general cross-branch shape); the splat carries the currently-selected
 * changed file's path, empty when none is explicitly chosen (the first
 * entry is shown by default without changing the URL), the same
 * deep-linkable-selection pattern task 1/2's routes use.
 *
 * **Why there's no "diff vs previous" link for revision number 1:** that
 * revision's real predecessor is on a *different* branch (the fork point,
 * `Branch.stack` -- see task 2's `BranchPointDto`), and `Branch.stack` only
 * carries that ancestor's *signature*, not its revision *number* --
 * resolving the number would need an extra `RevisionInfo`-by-signature call
 * this task deliberately doesn't make (the same "bounded compromise" this
 * repo already made in task 2's graph assembly, not an oversight). See
 * `../components/revision-list.tsx` for where that link is (or isn't)
 * rendered.
 */
export function RevisionDiffRoute() {
  const params = useParams<{ repositoryId: string; branchId: string; from: string; to: string; "*": string }>();
  const { repositoryId, branchId, from, to } = params;
  const selectedPath = params["*"] || "";
  const navigate = useNavigate();

  const diffQuery = useRevisionDiffQuery(repositoryId ?? "", branchId ?? "", from ?? "", to ?? "");

  const changes = diffQuery.data?.changes ?? [];
  const selectedChange: DiffChangeDto | undefined =
    changes.find((change) => change.path === selectedPath) ?? changes[0];

  // `useContentDiffQuery` must be called unconditionally (React's rules of
  // hooks) even though `selectedChange`/`repositoryId` may be missing on the
  // very first render before route params resolve -- `enabled` below (and
  // the `?? ""` fallbacks, matching every other query hook in this file's
  // sibling routes) is what actually gates the fetch.
  const contentDiffQuery = useContentDiffQuery(
    repositoryId ?? "",
    selectedChange?.contentFrom ?? "",
    selectedChange?.contentTo ?? "",
    { enabled: selectedChange !== undefined && selectedChange.linkRepositoryIndex === 0 },
  );

  if (!repositoryId || !branchId || !from || !to) {
    return null;
  }

  function handleSelect(path: string) {
    navigate(`/repositories/${repositoryId}/branches/${branchId}/diff/${from}/${to}/${path}`);
  }

  return (
    <PageShell
      title={`Diff: revision ${from} → ${to}`}
      backTo={`/repositories/${repositoryId}/branches/${branchId}/history`}
      backLabel="History"
    >
      {diffQuery.isLoading && <p className="text-sm text-slate-400">Loading diff...</p>}
      {diffQuery.error && (
        <p className="text-sm text-red-400">Failed to load diff: {(diffQuery.error as Error).message}</p>
      )}
      {diffQuery.data && (
        <>
          {diffQuery.data.conflicts.length > 0 && (
            <p className="mb-4 rounded border border-amber-900 bg-amber-950/40 p-3 text-sm text-amber-200">
              This diff has {diffQuery.data.conflicts.length} merge conflict(s) (3-way mode). Conflict
              resolution/display beyond this list is task 7's scope, not this view's -- see tasks.md.
            </p>
          )}
          {changes.length === 0 ? (
            <p className="text-sm text-slate-500">No changes between these two revisions.</p>
          ) : (
            <div className="flex items-start gap-6">
              <ul className="w-80 shrink-0 divide-y divide-slate-800 rounded border border-slate-800 text-sm">
                {changes.map((change) => (
                  <li key={`${change.action}:${change.path}`}>
                    <button
                      type="button"
                      onClick={() => handleSelect(change.path)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left ${
                        change.path === selectedChange?.path ? "bg-slate-800" : "hover:bg-slate-900"
                      }`}
                    >
                      <ActionBadge action={change.action} />
                      <span className="min-w-0 flex-1 truncate text-slate-200">{change.path}</span>
                    </button>
                    {change.action === "MOVE" && (
                      <div className="truncate px-3 pb-1 text-xs text-slate-500">from {change.pathFrom}</div>
                    )}
                  </li>
                ))}
              </ul>
              <div className="min-w-0 flex-1">
                {selectedChange && (
                  <DiffView
                    change={selectedChange}
                    contentDiff={contentDiffQuery.data}
                    isLoading={contentDiffQuery.isLoading}
                    error={contentDiffQuery.error}
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}

const ACTION_STYLES: Record<DiffChangeDto["action"], string> = {
  KEEP: "bg-blue-950 text-blue-300",
  ADD: "bg-emerald-950 text-emerald-300",
  DELETE: "bg-red-950 text-red-300",
  MOVE: "bg-purple-950 text-purple-300",
  COPY: "bg-purple-950 text-purple-300",
};

/** `KEEP` is displayed as "MODIFY" -- see `packages/api-types/src/diff.ts`'s doc comment on this interpretation of `Action.KEEP` plus differing content. */
const ACTION_LABELS: Record<DiffChangeDto["action"], string> = {
  KEEP: "MODIFY",
  ADD: "ADD",
  DELETE: "DELETE",
  MOVE: "MOVE",
  COPY: "COPY",
};

function ActionBadge({ action }: { action: DiffChangeDto["action"] }) {
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${ACTION_STYLES[action]}`}>
      {ACTION_LABELS[action]}
    </span>
  );
}
