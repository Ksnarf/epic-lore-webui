import type { Profile } from "../profile/format.js";

/**
 * v1 task 9 (permissions view). Pure display-formatting logic for the
 * self-service "my permissions" page (../routes/permissions.tsx), same
 * "no React/DOM/store import, directly vitest-testable" convention as
 * ../profile/format.ts/../locks/group-locks.ts.
 *
 * A `ResourcePermissionDto.resourceId` (`@epic-lore-webui/api-types`) is an
 * `epic-lore-authz` resource id -- `"urc-<hex repository id>"` for a
 * repository, or the `"urc-*"` wildcard this UI's own admin convention uses
 * (../../bff/src/auth/admin-gate.ts). Neither is something a non-technical
 * user should have to read as hex; this module maps a resource id back to
 * a real repository name wherever the caller already has one (from `GET
 * /api/repositories`), and only ever falls back to an honest "unknown/all
 * resources" label -- never a fabricated name -- when it doesn't.
 */

/** `"urc-<hex>"` -> the hex part, or `null` if the id isn't that shape (e.g. the `"urc-*"` wildcard, or some other resource namespace this UI doesn't know about). */
export function repositoryIdFromResourceId(resourceId: string): string | null {
  const match = /^urc-([0-9a-f]+)$/.exec(resourceId);
  return match?.[1] ?? null;
}

export function isWildcardResourceId(resourceId: string): boolean {
  return resourceId === "urc-*";
}

/**
 * The resource id as a human-readable label. Developer: the raw resource
 * id, UNLESS it resolves to a known repository (then the name, same
 * "friendlier when we genuinely have the data" rule ../profile/format.ts
 * already uses for e.g. `revisionLabel`) -- Developer profile still
 * benefits from not having to mentally map hex to a repo name when the
 * join is free. Artist: the repository name if known, `"All
 * repositories"` for the wildcard, or `"Other resource"` for anything else
 * unrecognized -- never the raw hex.
 */
export function resourceDisplayName(
  resourceId: string,
  repoNameByHexId: ReadonlyMap<string, string>,
  profile: Profile,
): string {
  const repositoryHexId = repositoryIdFromResourceId(resourceId);
  const repoName = repositoryHexId ? repoNameByHexId.get(repositoryHexId) : undefined;
  if (repoName) {
    return repoName;
  }
  if (profile === "developer") {
    return resourceId;
  }
  return isWildcardResourceId(resourceId) ? "All repositories" : "Other resource";
}

/**
 * A single `permission` string (`"read"`/`"write"`/`"admin"` -- the three
 * seeded `epic-lore-authz` roles' permissions, confirmed live against the
 * demo stack's `GET /admin/v1/roles`) as a friendly label. Developer still
 * uses this (not the raw string) -- unlike a resource id, there's no
 * "already have better data" case to prefer, and the raw strings are not
 * self-explanatory outside this project's own admin tooling either.
 * Anything outside the three known strings is passed through unchanged
 * rather than guessed at, so a future permission string this UI doesn't
 * know about still renders as SOMETHING, not a blank.
 */
export function friendlyPermissionLabel(permission: string): string {
  switch (permission) {
    case "admin":
      return "Full control";
    case "write":
      return "Can edit";
    case "read":
      return "Can view";
    default:
      return permission;
  }
}
