import { isHexBytes, type LockDto } from "@epic-lore-webui/api-types";
import { useState, type FormEvent } from "react";
import { useParams } from "react-router";
import { PageShell } from "../components/page-shell.js";
import { groupLocksByBranch } from "../locks/group-locks.js";
import {
  useAcquireLockMutation,
  useBranchesQuery,
  useLocksQuery,
  useReleaseLockMutation,
} from "../queries/lore.js";

/**
 * v1 task 5 (lock management across all branches). Route:
 * `/repositories/:repositoryId/locks`. Lists every lock in the repository,
 * grouped by branch (`../locks/group-locks.ts`), with a form to acquire a
 * new lock and a release button per existing lock.
 *
 * **Write-path honesty note (per this task's brief):** without task 8's
 * auth built, a real `LORE_BACKEND=grpc` server may reject acquire/release
 * with an authentication/permission error. That error is rendered as-is
 * below (`mutation.error`'s message), never swallowed or guessed into a
 * friendlier-sounding failure.
 */
export function RepositoryLocksRoute() {
  const { repositoryId } = useParams<{ repositoryId: string }>();
  const branchesQuery = useBranchesQuery(repositoryId ?? "");
  const locksQuery = useLocksQuery(repositoryId ?? "");
  const acquireMutation = useAcquireLockMutation(repositoryId ?? "");
  const releaseMutation = useReleaseLockMutation(repositoryId ?? "");

  const [branchId, setBranchId] = useState<string>("");
  const [hash, setHash] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

  if (!repositoryId) {
    return null;
  }

  const branches = branchesQuery.data?.branches ?? [];
  const groups = groupLocksByBranch(locksQuery.data?.locks ?? [], branches);

  function handleAcquire(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!isHexBytes(hash)) {
      setFormError("hash must be lowercase hex bytes (e.g. content address from the file tree)");
      return;
    }
    if (!isHexBytes(branchId)) {
      setFormError("select a branch");
      return;
    }
    if (description.trim().length === 0) {
      setFormError("description is required (typically a file path)");
      return;
    }
    acquireMutation.mutate(
      { branchId, hash, description },
      {
        onSuccess: () => {
          setHash("");
          setDescription("");
        },
      },
    );
  }

  function handleRelease(lock: LockDto) {
    releaseMutation.mutate({
      branchId: lock.resource.branchId,
      hash: lock.resource.hash,
      description: lock.resource.description,
    });
  }

  return (
    <PageShell title="Locks" backTo={`/repositories/${repositoryId}`} backLabel="Branches">
      <form onSubmit={handleAcquire} className="mb-6 flex flex-wrap items-end gap-3 rounded border border-slate-800 p-4">
        <label className="flex flex-col text-xs text-slate-400">
          Branch
          <select
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
            className="mt-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100"
          >
            <option value="">Select branch...</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-slate-400">
          Description (path)
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="crates/lore-server/src/main.rs"
            className="mt-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100"
          />
        </label>
        <label className="flex flex-col text-xs text-slate-400">
          Hash (hex)
          <input
            value={hash}
            onChange={(event) => setHash(event.target.value)}
            placeholder="content address, hex"
            className="mt-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100"
          />
        </label>
        <button
          type="submit"
          disabled={acquireMutation.isPending}
          className="rounded bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-900 disabled:opacity-50"
        >
          {acquireMutation.isPending ? "Locking..." : "Acquire lock"}
        </button>
      </form>
      {formError && <p className="mb-4 text-sm text-red-400">{formError}</p>}
      {acquireMutation.isError && (
        <p className="mb-4 text-sm text-red-400">Acquire failed: {(acquireMutation.error as Error).message}</p>
      )}
      {releaseMutation.isError && (
        <p className="mb-4 text-sm text-red-400">Release failed: {(releaseMutation.error as Error).message}</p>
      )}

      {locksQuery.isLoading && <p className="text-sm text-slate-400">Loading locks...</p>}
      {locksQuery.error && (
        <p className="text-sm text-red-400">Failed to load locks: {(locksQuery.error as Error).message}</p>
      )}
      {locksQuery.data && groups.length === 0 && (
        <p className="text-sm text-slate-500">No locks held anywhere in this repository.</p>
      )}

      {groups.map((group) => (
        <div key={group.branchId} className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-slate-300">{group.branchName}</h2>
          <ul className="divide-y divide-slate-800 rounded border border-slate-800">
            {group.locks.map((lock) => (
              <li
                key={`${lock.resource.branchId}:${lock.resource.hash}`}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <div className="text-sm text-slate-100">{lock.resource.description}</div>
                  <div className="text-xs text-slate-500">
                    locked by {lock.owner} &middot; {new Date(Number(lock.lockedAt)).toISOString()}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRelease(lock)}
                  disabled={releaseMutation.isPending}
                  className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-900 disabled:opacity-50"
                >
                  Release
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </PageShell>
  );
}
