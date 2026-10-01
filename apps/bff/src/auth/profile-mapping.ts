import type { DefaultProfileDto } from "@epic-lore-webui/api-types";

/**
 * v1 task 11 extension (group-membership default profile). Pure group-name
 * -> default-profile resolution -- no I/O, no JWT/session knowledge (that's
 * ./jwt-claims.ts and ../routes/auth.ts's job), so this is directly
 * vitest-testable in isolation, matching this repo's existing
 * pure-module convention (../../../web/src/graph/lane-assignment.ts,
 * ../../../web/src/locks/group-locks.ts, etc.).
 *
 * Resolution rule (per this task's brief, stated precisely):
 * - in a configured developer group -> `"developer"`
 * - in a configured artist group (and NOT a developer group) -> `"artist"`
 * - in both -> `"developer"` wins (the more-capable default)
 * - in neither, or no groups at all -> `null` (no server default -- the web
 *   app's own three-state logic, apps/web/src/profile/resolve-profile.ts,
 *   then falls through to an explicit user choice or today's plain
 *   fallback; `null` here must never be treated as an error).
 *
 * Group-name matching is case-sensitive, exact string match against
 * whatever `PROFILE_GROUPS_ARTIST`/`PROFILE_GROUPS_DEVELOPER`
 * (../config.ts) list -- this module makes no normalization assumption
 * about how an IdP/authz names its groups.
 */
export function resolveDefaultProfile(
  groups: readonly string[],
  artistGroups: readonly string[],
  developerGroups: readonly string[],
): DefaultProfileDto {
  const isDeveloper = groups.some((group) => developerGroups.includes(group));
  if (isDeveloper) {
    return "developer";
  }
  const isArtist = groups.some((group) => artistGroups.includes(group));
  if (isArtist) {
    return "artist";
  }
  return null;
}
