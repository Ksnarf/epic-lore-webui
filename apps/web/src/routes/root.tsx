import { useUiStore } from "../store/ui-store.js";

/**
 * Placeholder route shell -- proves the app renders and boots. Real views
 * (file tree, branch graph, diff pane, etc.) land per tasks.md v1 tasks 1-11,
 * not here.
 */
export function RootRoute() {
  const profile = useUiStore((state) => state.profile);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold">epic-lore-webui</h1>
        <p className="text-slate-400">Scaffold is alive. Active profile: {profile}</p>
      </div>
    </main>
  );
}
