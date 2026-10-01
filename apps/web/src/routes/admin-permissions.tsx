import { useState } from "react";
import { ApiError } from "../api/lore-client.js";
import { PageShell } from "../components/page-shell.js";
import { useAdminUserGrantsQuery, useAdminUsersQuery } from "../queries/lore.js";
import { useUiStore } from "../store/ui-store.js";

/**
 * v1 task 9 (permissions view), admin view. Route: `/admin/permissions`.
 * api-contract.md section 4's recommended "option 1": this page is purely
 * a thin client over the BFF's own `/api/admin/*` proxy
 * (apps/bff/src/routes/admin.ts) -- it never talks to `epic-lore-authz`
 * directly and never sees `ADMIN_API_TOKEN`.
 *
 * **Developer-profile only**, same "profile-gated panel, not a fork of the
 * component tree" pattern v1 task 11 established
 * (../routes/branch-history.tsx/../routes/repository-locks.tsx):
 * administering OTHER users' grants is an operations/technical task by
 * nature, not something task 11's Artist-profile simplification is meant
 * to soften -- Artist sees an honest note pointing at the toggle instead.
 *
 * **Two real, distinguishable failure cases**, rendered as what they
 * actually are rather than one generic error (../api/lore-client.ts's
 * exported `ApiError.status`):
 * - `404`: `ADMIN_API_TOKEN` is unset on this deployment -- the BFF never
 *   registered these routes at all (fail-closed by absence).
 * - `403`: the routes exist, but the logged-in caller does not hold
 *   `admin` on the `urc-*` convention (apps/bff/src/auth/admin-gate.ts).
 */
export function AdminPermissionsRoute() {
  const profile = useUiStore((state) => state.profile);
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  // `enabled: profile === "developer"` -- the queries don't even fire in
  // Artist profile (not just hidden after the fact), so switching into
  // Artist stops polling a feature this profile deliberately hides.
  const usersQuery = useAdminUsersQuery({ enabled: profile === "developer" });
  const grantsQuery = useAdminUserGrantsQuery(selectedUserId, { enabled: profile === "developer" });

  if (profile !== "developer") {
    return (
      <PageShell title="Admin: Permissions" backTo="/" backLabel="Repositories">
        <p className="rounded border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
          Administering other users&apos; permissions is a Developer-profile feature. Switch to Developer view (top
          right) to use it.
        </p>
      </PageShell>
    );
  }

  const disabledReason = adminUnavailableReason(usersQuery.error);

  return (
    <PageShell title="Admin: Permissions" backTo="/" backLabel="Repositories">
      {usersQuery.isLoading && <p className="text-sm text-slate-400">Loading users...</p>}
      {disabledReason && <p className="text-sm text-amber-400">{disabledReason}</p>}
      {usersQuery.error && !disabledReason && (
        <p className="text-sm text-red-400">Failed to load users: {(usersQuery.error as Error).message}</p>
      )}

      {usersQuery.data && (
        <label className="mb-6 flex max-w-xs flex-col text-xs text-slate-400">
          User
          <select
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
            className="mt-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100"
          >
            <option value="">Select user...</option>
            {usersQuery.data.users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName} ({user.preferredUsername})
                {user.isServiceAccount ? " [service account]" : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      {selectedUserId && grantsQuery.isLoading && <p className="text-sm text-slate-400">Loading grants...</p>}
      {selectedUserId && grantsQuery.error && (
        <p className="text-sm text-red-400">Failed to load grants: {(grantsQuery.error as Error).message}</p>
      )}
      {selectedUserId && grantsQuery.data && grantsQuery.data.grants.length === 0 && (
        <p className="text-sm text-slate-500">This user has no grants on any resource.</p>
      )}
      {selectedUserId && grantsQuery.data && grantsQuery.data.grants.length > 0 && (
        <ul className="divide-y divide-slate-800 rounded border border-slate-800">
          {grantsQuery.data.grants.map((grant) => (
            <li
              key={`${grant.roleName}:${grant.resourcePattern}`}
              className="flex items-center justify-between px-4 py-3"
            >
              <span className="text-sm text-slate-100">{grant.resourcePattern}</span>
              <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-slate-300">
                {grant.roleName}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}

/** `null` when `error` isn't the two known admin-proxy status codes -- see this file's top doc comment. */
function adminUnavailableReason(error: unknown): string | null {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return "The admin permissions proxy is not enabled on this deployment (ADMIN_API_TOKEN unset).";
    }
    if (error.status === 403) {
      return "You do not hold the admin grant needed to view other users' permissions.";
    }
  }
  return null;
}
