import type { ReactNode } from "react";
import { useEffect } from "react";
import { Link } from "react-router";
import { ProfileToggle } from "./profile-toggle.js";
import { useRepositoryNotifications } from "../notifications/use-notifications.js";
import { useAuthStatusQuery } from "../queries/lore.js";
import { useUiStore } from "../store/ui-store.js";

interface PageShellProps {
  title: string;
  backTo?: string;
  backLabel?: string;
  /**
   * v1 task 10 (live notifications). When given, mounts a live-updates
   * subscription (`NotificationIndicator` below) scoped to this repository.
   * Omitted entirely for routes with no repository context (`/`,
   * `/sign-in`, `/permissions`, `/admin/permissions`) -- there is nothing
   * for a repository-scoped notification stream to subscribe to there.
   */
  repositoryId?: string;
  children: ReactNode;
}

/**
 * v1 task 8 (Okta auth). Signed-in indicator + logout, shown whenever a
 * session exists. Deliberately shows nothing (not a "Sign in" prompt) when
 * unauthenticated: `fixture` mode has no auth concept and is never signed
 * in, so a permanent "Sign in" link in the shell would be misleading there;
 * `grpc` mode's own `/api/*` 401s already redirect to `/sign-in` (see
 * ../api/lore-client.ts's `readJsonOrThrow`) the moment any real data is
 * requested.
 */
function AuthIndicator() {
  const { data } = useAuthStatusQuery();
  if (!data?.authenticated) {
    return null;
  }
  return (
    <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
      <span>Signed in as {data.userName ?? data.userId}</span>
      <a href="/logout" className="text-slate-400 underline hover:text-slate-200">
        Sign out
      </a>
    </div>
  );
}

/**
 * v1 task 11 extension (group-membership default profile, built
 * path-agnostically). Mounted once alongside `AuthIndicator` (same
 * "present on every `PageShell`-based route, zero per-route wiring"
 * convention `ProfileToggle` already uses). Renders nothing -- its only
 * job is pushing `useAuthStatusQuery`'s `defaultProfile` into
 * `../store/ui-store.ts`'s `applyServerDefaultProfile` whenever it
 * changes, so the three-state resolution there
 * (`../profile/resolve-profile.ts`) always has the latest server value to
 * weigh against any explicit user choice. `applyServerDefaultProfile`
 * itself no-ops when the value hasn't actually changed (see ui-store.ts),
 * so this effect re-running on every 30s poll is harmless.
 */
function ProfileDefaultSync() {
  const { data } = useAuthStatusQuery();
  const applyServerDefaultProfile = useUiStore((state) => state.applyServerDefaultProfile);

  useEffect(() => {
    if (data) {
      applyServerDefaultProfile(data.defaultProfile ?? null);
    }
  }, [data, applyServerDefaultProfile]);

  return null;
}

/**
 * v1 task 9 (permissions view). "My permissions" is always shown --
 * self-service, no `ADMIN_API_TOKEN`/admin-grant gate (api-contract.md
 * section 4). "Admin" is Developer-profile only, same "a technical/ops
 * feature, not something Artist's simplification should soften" framing
 * task 11 already uses for e.g. the raw-hash lock-acquire form -- it's
 * still just a link either way; whether the admin proxy is actually
 * enabled/reachable on this deployment is the destination route's own
 * concern (../routes/admin-permissions.tsx renders the 404/403 honestly),
 * not something the shell needs to know ahead of time.
 */
function PermissionsNav() {
  const profile = useUiStore((state) => state.profile);
  return (
    <nav className="flex items-center gap-3 text-xs text-slate-400">
      <Link to="/permissions" className="hover:text-slate-200">
        My permissions
      </Link>
      {profile === "developer" && (
        <Link to="/admin/permissions" className="hover:text-slate-200">
          Admin
        </Link>
      )}
    </nav>
  );
}

/**
 * v1 task 10 (live notifications). A subtle presence-only indicator -- a
 * small colored dot, no visible label -- reflecting
 * `useRepositoryNotifications`'s connection state; the full explanation is a
 * `title` tooltip plus an `sr-only` span for assistive tech, not inline
 * text, so it never competes visually with the actual page content. The
 * wording is deliberately the SAME in both profiles: unlike e.g. a revision
 * signature or a raw content hash, "connecting/live/disconnected" carries no
 * technical detail either profile's own convention (`../profile/format.ts`)
 * calls for hiding.
 */
function NotificationIndicator({ repositoryId }: { repositoryId: string }) {
  const state = useRepositoryNotifications(repositoryId);
  const dotColor =
    state === "open" ? "bg-emerald-500" : state === "connecting" ? "bg-amber-500" : "bg-slate-600";
  const label =
    state === "open"
      ? "Live updates connected"
      : state === "connecting"
        ? "Connecting to live updates..."
        : "Live updates disconnected";
  return (
    <span className="flex items-center gap-1.5" title={label}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Shared chrome for the browse views (task 1): a back link plus a heading. */
export function PageShell({ title, backTo, backLabel, repositoryId, children }: PageShellProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <ProfileDefaultSync />
      <header className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-4">
        <div className="min-w-0">
          {backTo && (
            <Link to={backTo} className="mb-1 block text-sm text-slate-400 hover:text-slate-200">
              &larr; {backLabel ?? "Back"}
            </Link>
          )}
          <h1 className="text-xl font-semibold">{title}</h1>
          <AuthIndicator />
        </div>
        <div className="flex items-center gap-4">
          {repositoryId && <NotificationIndicator repositoryId={repositoryId} />}
          <PermissionsNav />
          <ProfileToggle />
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
