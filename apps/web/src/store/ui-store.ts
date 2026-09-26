import { create } from "zustand";

/**
 * Zustand store for cross-cutting UI state that has no server
 * representation (docs/design/stack-decision.md, "State management"):
 * active profile (Developer vs. Artist, task 11), file-tree expansion,
 * diff view mode, toast queue, etc. Server/RPC data belongs in TanStack
 * Query instead, never here.
 *
 * Scaffold stub: only the profile flag exists so far.
 */
export type Profile = "developer" | "artist";

interface UiState {
  profile: Profile;
  setProfile: (profile: Profile) => void;
}

export const useUiStore = create<UiState>((set) => ({
  profile: "developer",
  setProfile: (profile) => set({ profile }),
}));
