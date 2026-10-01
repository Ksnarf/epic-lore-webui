import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Profile } from "../profile/format.js";
import { resolveEffectiveProfile } from "../profile/resolve-profile.js";

export type { Profile } from "../profile/format.js";

/** Unchanged from before task 11's group-membership extension: the plain default when neither an explicit user choice nor a server default applies. */
const FALLBACK_PROFILE: Profile = "developer";

/**
 * Zustand store for cross-cutting UI state that has no server
 * representation (docs/design/stack-decision.md, "State management"):
 * active profile (Developer vs. Artist, task 11), file-tree expansion and
 * selection (task 1), diff view mode, toast queue, etc. Server/RPC data
 * belongs in TanStack Query instead, never here.
 *
 * v1 task 11 extension (group-membership default profile, built
 * path-agnostically): `profile` is now a three-state resolution
 * (`../profile/resolve-profile.ts`), not a single persisted value --
 *
 * - `explicitProfile`: set ONLY by a real user toggle action
 *   (`setProfile`, called from `../components/profile-toggle.tsx`'s click
 *   handler). This is the one piece that's actually persisted
 *   (`zustand/persist`, localStorage) -- a per-browser user preference, not
 *   tied to one visit or one server session, and the thing a server
 *   default must never be allowed to overwrite.
 * - `serverDefaultProfile`: set ONLY by `applyServerDefaultProfile`, called
 *   from `../components/page-shell.tsx` whenever `GET /api/auth/status`
 *   resolves (`defaultProfile`, possibly `null` -- see
 *   `../profile/resolve-profile.ts`'s doc comment). Deliberately NOT
 *   persisted: it is re-derived from the server on every session, not a
 *   user preference.
 * - `profile`: the resolved, effective value every existing component
 *   already reads (`revision-list.tsx`, `file-tree.tsx`, etc.) --
 *   recomputed by both setters above via `resolveEffectiveProfile`, so no
 *   consumer needed to change.
 *
 * `partialize` persists *only* `explicitProfile` (not the resolved
 * `profile`, and not `serverDefaultProfile`); `onRehydrateStorage`
 * recomputes `profile` from the rehydrated `explicitProfile` once storage
 * loads (`serverDefaultProfile` is still `null` at that point -- it arrives
 * later via `applyServerDefaultProfile`, which recomputes `profile` again
 * once it does). `expandedTreePaths`/`selectedTreePath` stay
 * unpersisted/in-memory, unchanged from task 1.
 *
 * **Migration from the pre-this-task persisted shape** (`{ profile: ... }`,
 * no `explicitProfile` field): that old value cannot be trusted as "the
 * user explicitly chose this" -- `zustand/persist` writes on every state
 * change, including the very first render, so a browser that never
 * touched the toggle may still have a persisted `profile` value that was
 * only ever today's unchanged fallback, echoed back. Per this task's own
 * constraint ("the explicit-choice flag must only be set by a real user
 * toggle action"), `migrate` below treats any pre-task-11-extension
 * persisted state as NOT explicit (`explicitProfile: null`) rather than
 * guessing -- a user who genuinely wants Artist can re-toggle once, which
 * is a one-time, honest cost of this migration, not a silent data loss (no
 * group-based default existed before this task either way).
 */
interface UiState {
  profile: Profile;
  /** Set only by a real user toggle action (`setProfile`) -- see this file's top doc comment. */
  explicitProfile: Profile | null;
  /** Set only by `applyServerDefaultProfile`, from `GET /api/auth/status`'s `defaultProfile` -- see this file's top doc comment. */
  serverDefaultProfile: Profile | null;
  /** The real user-toggle action (`../components/profile-toggle.tsx`). Always wins once set -- see `../profile/resolve-profile.ts`. */
  setProfile: (profile: Profile) => void;
  /**
   * Applies (or clears, via `null`) the server-resolved default profile
   * (`../components/page-shell.tsx`, wired to `useAuthStatusQuery`). Never
   * sets `explicitProfile` -- this is the one action this task's brief
   * requires NOT count as an explicit user choice.
   */
  applyServerDefaultProfile: (defaultProfile: Profile | null) => void;

  /**
   * Repository-relative paths of directories the file tree (task 1) has
   * expanded. UI-only -- not reflected in the URL, unlike `selectedTreePath`
   * below (docs/design/stack-decision.md, "State management": "file-tree
   * expansion state" is named explicitly as Zustand's job).
   */
  expandedTreePaths: Set<string>;
  toggleTreePath: (path: string) => void;

  /**
   * Mirror of the file tree's currently-selected path. The URL
   * (`/repositories/:repositoryId/branches/:branchId/*`) is the actual
   * source of truth -- deep-linkable per docs/design/stack-decision.md,
   * "Routing" -- this field is set from that URL param
   * (routes/branch-tree.tsx) so deeply-nested tree components can read the
   * current selection without prop-drilling it down from the route.
   */
  selectedTreePath: string | null;
  setSelectedTreePath: (path: string | null) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      profile: FALLBACK_PROFILE,
      explicitProfile: null,
      serverDefaultProfile: null,
      setProfile: (profile) => set({ explicitProfile: profile, profile }),
      applyServerDefaultProfile: (defaultProfile) =>
        set((state) => {
          if (state.serverDefaultProfile === defaultProfile) {
            // No-op: avoids an unnecessary store update (and persist write)
            // on every `useAuthStatusQuery` poll when the server default
            // hasn't actually changed since the last one.
            return state;
          }
          return {
            serverDefaultProfile: defaultProfile,
            profile: resolveEffectiveProfile({
              explicit: state.explicitProfile,
              serverDefault: defaultProfile,
              fallback: FALLBACK_PROFILE,
            }),
          };
        }),

      expandedTreePaths: new Set<string>(),
      toggleTreePath: (path) =>
        set((state) => {
          const next = new Set(state.expandedTreePaths);
          if (next.has(path)) {
            next.delete(path);
          } else {
            next.add(path);
          }
          return { expandedTreePaths: next };
        }),

      selectedTreePath: null,
      setSelectedTreePath: (path) => set({ selectedTreePath: path }),
    }),
    {
      name: "epic-lore-webui.ui-profile",
      // Only `explicitProfile` is persisted -- NOT the resolved `profile`
      // and NOT `serverDefaultProfile` (re-derived from the server every
      // session). See this file's top doc comment.
      partialize: (state) => ({ explicitProfile: state.explicitProfile }),
      version: 1,
      // Pre-task-11-extension persisted shape was `{ profile: Profile }`
      // under implicit version 0 (no `version` option existed yet) -- not
      // trustworthy as an explicit choice (see top doc comment), so any
      // mismatched/old version migrates to "no explicit choice recorded"
      // rather than guessing from the old `profile` value.
      migrate: (persistedState, version) => {
        if (
          version >= 1 &&
          persistedState !== null &&
          typeof persistedState === "object" &&
          "explicitProfile" in persistedState
        ) {
          return persistedState as { explicitProfile: Profile | null };
        }
        return { explicitProfile: null };
      },
      // Default `merge` only shallow-merges the persisted slice over the
      // initial state, which would restore `explicitProfile` but leave the
      // DERIVED `profile` field stuck at its initial fallback value until
      // some other action recomputed it. Recomputing `profile` here too
      // means a returning user with a real explicit choice sees it
      // immediately on load, not only after their next toggle/server poll.
      merge: (persistedState, currentState) => {
        const explicitProfile =
          (persistedState as { explicitProfile: Profile | null } | undefined)?.explicitProfile ?? null;
        return {
          ...currentState,
          explicitProfile,
          profile: resolveEffectiveProfile({
            explicit: explicitProfile,
            serverDefault: currentState.serverDefaultProfile,
            fallback: FALLBACK_PROFILE,
          }),
        };
      },
    },
  ),
);
