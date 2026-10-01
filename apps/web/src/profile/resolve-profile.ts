import type { Profile } from "./format.js";

/**
 * v1 task 11 extension (group-membership default profile, built
 * path-agnostically). Pure three-state resolution, no React/store import
 * here, same convention as every other module in this directory
 * (`./format.ts`/`./placeholder.ts`) and `../graph/lane-assignment.ts`/
 * `../locks/group-locks.ts`/`../diff/unified-diff.ts` -- directly
 * vitest-testable, called from `../store/ui-store.ts`.
 *
 * Precedence, stated precisely (per this task's brief):
 * 1. `explicit` -- a real user toggle action (`ProfileToggle`,
 *    `../store/ui-store.ts`'s `setProfile`) ALWAYS wins, regardless of
 *    what the server says. This is the three-state guarantee: a server
 *    default must never override a choice the user actually made.
 * 2. `serverDefault` -- `GET /api/auth/status`'s `defaultProfile`
 *    (apps/bff/src/routes/auth.ts), when the user has no explicit choice
 *    yet. `null` here (no groups, or groups matching no configured
 *    mapping) falls through to (3), same as if the field were absent --
 *    the feature degrades silently, per this task's "groups are optional
 *    everywhere" constraint.
 * 3. `fallback` -- today's plain default ("developer"), unchanged from
 *    before this task, used when neither of the above applies (no auth,
 *    fixture mode with no `FIXTURE_GROUPS`, or a real session with no
 *    group-based default).
 */
export interface ResolveProfileInput {
  explicit: Profile | null;
  serverDefault: Profile | null;
  fallback: Profile;
}

export function resolveEffectiveProfile({ explicit, serverDefault, fallback }: ResolveProfileInput): Profile {
  if (explicit !== null) {
    return explicit;
  }
  if (serverDefault !== null) {
    return serverDefault;
  }
  return fallback;
}
