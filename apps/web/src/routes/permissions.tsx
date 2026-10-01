import { useMemo } from "react";
import { PageShell } from "../components/page-shell.js";
import { friendlyPermissionLabel, resourceDisplayName } from "../permissions/format.js";
import { useMyPermissionsQuery, useRepositoriesQuery } from "../queries/lore.js";
import { useUiStore } from "../store/ui-store.js";

/**
 * v1 task 9 (permissions view), self-service half. Route: `/permissions`.
 * API contract study (docs/design/api-contract.md section 4):
 * `LookupUserPermissions` already resolves the caller's own grants with no
 * `ADMIN_API_TOKEN` needed, so this page is reachable regardless of
 * profile or whether the admin proxy (../routes/admin-permissions.tsx) is
 * enabled on this deployment at all.
 *
 * Resource ids (`"urc-<hex repository id>"`) are joined against `GET
 * /api/repositories` (already-fetched data, no new BFF route) so a real
 * repository shows its actual name, not hex, in EITHER profile --
 * Developer falls back to the raw resource id when the join misses (an
 * ungranted/unknown resource, or the `"urc-*"` wildcard); Artist falls back
 * to an honest "All repositories"/"Other resource" label instead
 * (../permissions/format.ts's `resourceDisplayName`).
 */
export function PermissionsRoute() {
  const permissionsQuery = useMyPermissionsQuery();
  const repositoriesQuery = useRepositoriesQuery();
  const profile = useUiStore((state) => state.profile);

  const repoNameByHexId = useMemo(() => {
    const map = new Map<string, string>();
    for (const repo of repositoriesQuery.data?.repositories ?? []) {
      map.set(repo.id, repo.name);
    }
    return map;
  }, [repositoriesQuery.data]);

  const permissions = permissionsQuery.data?.permissions ?? [];

  return (
    <PageShell title="My Permissions" backTo="/" backLabel="Repositories">
      {permissionsQuery.isLoading && <p className="text-sm text-slate-400">Loading your permissions...</p>}
      {permissionsQuery.error && (
        <p className="text-sm text-red-400">Failed to load permissions: {(permissionsQuery.error as Error).message}</p>
      )}
      {permissionsQuery.data && permissions.length === 0 && (
        <p className="text-sm text-slate-500">You have no grants on any resource.</p>
      )}

      {permissions.length > 0 && (
        <ul className="divide-y divide-slate-800 rounded border border-slate-800">
          {permissions.map((entry) => (
            <li key={entry.resourceId} className="px-4 py-3">
              <div className="text-sm font-medium text-slate-100">
                {resourceDisplayName(entry.resourceId, repoNameByHexId, profile)}
              </div>
              {profile === "developer" && (
                <div className="text-xs text-slate-500">{entry.resourceId}</div>
              )}
              <div className="mt-1 flex flex-wrap gap-2">
                {entry.permission.map((permission) => (
                  <span
                    key={permission}
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-slate-300"
                    title={profile === "developer" ? permission : undefined}
                  >
                    {friendlyPermissionLabel(permission)}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
