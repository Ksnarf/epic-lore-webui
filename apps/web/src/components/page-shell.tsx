import type { ReactNode } from "react";
import { useEffect } from "react";
import { Link } from "react-router";
import { ProfileToggle } from "./profile-toggle.js";
import { useAuthStatusQuery } from "../queries/lore.js";
import { useUiStore } from "../store/ui-store.js";

interface PageShellProps {
  title: string;
  backTo?: string;
  backLabel?: string;
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

/** Shared chrome for the browse views (task 1): a back link plus a heading. */
export function PageShell({ title, backTo, backLabel, children }: PageShellProps) {
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
        <ProfileToggle />
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
