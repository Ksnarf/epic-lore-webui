import type { Profile } from "../store/ui-store.js";
import { useUiStore } from "../store/ui-store.js";

const OPTIONS: Array<{ value: Profile; label: string; hint: string }> = [
  { value: "developer", label: "Developer", hint: "Hashes, revision numbers, full branch graph" },
  { value: "artist", label: "Artist", hint: "Friendly labels, locks front and center, technical detail hidden" },
];

/**
 * v1 task 11 (dual profile). The Developer/Artist switcher, mounted once in
 * `page-shell.tsx` so it's present on every browse/history/diff/locks
 * route without each one wiring it in separately. Persisted (not just
 * in-memory) via `../store/ui-store.ts`'s `zustand/persist` wrapper.
 *
 * Deep links work identically in both profiles by construction: this
 * control only calls `setProfile`, never touches the router -- profile is
 * purely a rendering concern (docs/design/stack-decision.md, "Dual profile
 * ... is a capability-flag plus layout layer ... not a fork of the UI").
 */
export function ProfileToggle() {
  const profile = useUiStore((state) => state.profile);
  const setProfile = useUiStore((state) => state.setProfile);

  return (
    <div
      role="radiogroup"
      aria-label="View profile"
      className="inline-flex shrink-0 rounded-md border border-slate-700 bg-slate-900 p-0.5 text-xs"
    >
      {OPTIONS.map((option) => {
        const isActive = option.value === profile;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            title={option.hint}
            onClick={() => setProfile(option.value)}
            className={`rounded px-2.5 py-1 font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 ${
              isActive ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
