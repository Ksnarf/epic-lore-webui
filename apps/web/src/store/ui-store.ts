import { create } from "zustand";

/**
 * Zustand store for cross-cutting UI state that has no server
 * representation (docs/design/stack-decision.md, "State management"):
 * active profile (Developer vs. Artist, task 11), file-tree expansion and
 * selection (task 1), diff view mode, toast queue, etc. Server/RPC data
 * belongs in TanStack Query instead, never here.
 */
export type Profile = "developer" | "artist";

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

export const useUiStore = create<UiState>((set) => ({
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
}));
