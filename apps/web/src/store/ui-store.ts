import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Profile } from "../profile/format.js";

export type { Profile } from "../profile/format.js";

/**
 * Zustand store for cross-cutting UI state that has no server
 * representation (docs/design/stack-decision.md, "State management"):
 * active profile (Developer vs. Artist, task 11), file-tree expansion and
 * selection (task 1), diff view mode, toast queue, etc. Server/RPC data
 * belongs in TanStack Query instead, never here.
 *
 * v1 task 11: `profile` is wrapped in `zustand/persist` (localStorage) so
 * the Developer/Artist choice survives a page reload -- a per-browser user
 * preference, not something tied to one visit or one server session.
 * `partialize` below persists *only* `profile`; `expandedTreePaths` /
 * `selectedTreePath` deliberately stay unpersisted/in-memory, matching
 * their existing task-1 behavior (tree expansion resets on reload today,
 * and this task doesn't change that).
 */
interface UiState {
  profile: Profile;
  setProfile: (profile: Profile) => void;

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
      profile: "developer",
      setProfile: (profile) => set({ profile }),

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
      partialize: (state) => ({ profile: state.profile }),
    },
  ),
);
