/**
 * v1 task 11 (dual profile: Developer vs. Artist view). Pure, proto-agnostic
 * display-formatting logic shared by every profile-aware view -- no
 * React/DOM/store import here, same convention as
 * `../graph/lane-assignment.ts`/`../locks/group-locks.ts`/
 * `../diff/unified-diff.ts` (kept pure so it's directly vitest-testable).
 *
 * `docs/design/stack-decision.md`, "Components": "Dual profile ... is a
 * capability-flag plus layout layer over the one component set ... which
 * panels are shown, what density and defaults apply -- not a fork of the
 * UI." This module is that layer's formatting half: components call these
 * functions with the active `Profile` and render whatever comes back,
 * rather than branching on `profile` ad hoc inside JSX everywhere.
 *
 * Design intent (per this task's brief): Developer keeps today's
 * information-dense presentation (hashes, revision numbers, raw
 * timestamps). Artist gets friendly labels over hex/ids and lower
 * cognitive load -- hiding or demoting technical chrome this module's
 * functions never *fabricate* a friendlier value when no real one exists
 * (e.g. there is no human display name for a lock's `owner` field on the
 * wire, so it is passed through unchanged in both profiles -- only ever
 * reformatted, never replaced with invented data).
 */

export type Profile = "developer" | "artist";

/** Truncates a hex string for display, matching the `.slice(0, 12)` convention `revision-list.tsx` used before this task. Never throws on a short/empty string. */
export function shortHex(hex: string, visibleChars = 10): string {
  if (hex.length <= visibleChars) {
    return hex;
  }
  return `${hex.slice(0, visibleChars)}…`; // trailing ellipsis
}

/**
 * Revision label for a `RevisionItemDto` row (`number` + `signature`).
 * Developer: `#12 a1b2c3d4e5…` (today's presentation, unchanged).
 * Artist: `Revision 12` -- no signature at all. The signature is a content
 * hash, not an identity a non-technical user needs; omitting it (not just
 * shortening it) is the actual cognitive-load reduction this task asks for.
 */
export function revisionLabel(
  revision: { number: string; signature: string },
  profile: Profile,
): string {
  if (profile === "developer") {
    return `#${revision.number} ${shortHex(revision.signature, 12)}`;
  }
  return `Revision ${revision.number}`;
}

/**
 * Whether a raw technical identifier (content hash/address, cursor token,
 * etc.) should be rendered at all in the given profile. Centralizes the
 * "hidden or demoted" rule from this task's brief so call sites don't each
 * re-decide it -- callers that need a fallback string when hidden should
 * use `hiddenTechnicalDetailNote`, not invent their own wording.
 */
export function showsTechnicalDetail(profile: Profile): boolean {
  return profile === "developer";
}

/** Shared copy for the "a technical value is hidden here" case (Artist profile only), so every call site reads identically instead of each inventing its own phrasing. */
export const HIDDEN_TECHNICAL_DETAIL_NOTE = "technical reference hidden in Artist view";

/**
 * File/content size. Developer keeps the exact byte count (today's
 * presentation, `${size}B`). Artist gets a human-scaled unit -- real data
 * either way, just a different, lower-precision rendering of the same
 * number.
 */
export function formatByteSize(bytesDecimal: string, profile: Profile): string {
  const bytes = Number(bytesDecimal);
  if (profile === "developer" || !Number.isFinite(bytes)) {
    return `${bytesDecimal}B`;
  }
  return humanByteSize(bytes);
}

const BYTE_UNITS = ["KB", "MB", "GB", "TB"] as const;

function humanByteSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1);
  const rounded = value < 10 ? value.toFixed(1) : Math.round(value).toString();
  return `${rounded} ${BYTE_UNITS[unitIndex]}`;
}

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** `[divisor to reach the next unit, that unit's Intl.RelativeTimeFormat name]`, walked in order -- the standard MDN relative-time-formatting ladder (seconds -> minutes -> hours -> days -> weeks -> months -> years). */
const RELATIVE_TIME_DIVISIONS: Array<[number, Intl.RelativeTimeFormatUnit]> = [
  [60, "seconds"],
  [60, "minutes"],
  [24, "hours"],
  [7, "days"],
  [4.34524, "weeks"],
  [12, "months"],
  [Number.POSITIVE_INFINITY, "years"],
];

/**
 * A ms-epoch instant as relative time ("3 hours ago"), given an explicit
 * `nowMs` so this stays pure/deterministic for tests -- callers pass
 * `Date.now()` at render time.
 */
export function relativeTimeFromNow(thenMs: number, nowMs: number): string {
  let duration = (thenMs - nowMs) / 1000;
  for (const [amount, unit] of RELATIVE_TIME_DIVISIONS) {
    if (Math.abs(duration) < amount) {
      return RELATIVE_TIME_FORMATTER.format(Math.round(duration), unit);
    }
    duration /= amount;
  }
  // Unreachable (the final division's amount is +Infinity, which always
  // satisfies `Math.abs(duration) < amount`) -- kept only so this function
  // has a total, non-`undefined` return type.
  return RELATIVE_TIME_FORMATTER.format(Math.round(duration), "years");
}

/**
 * A lock's `lockedAt` (decimal-string ms-epoch, `packages/api-types/src/lock.ts`).
 * Developer: exact ISO instant (today's presentation in
 * `repository-locks.tsx`, unchanged). Artist: relative time -- "who locked
 * this and roughly when" matters more than a precise instant for the
 * "who's working on what" framing this task's brief asks Artist to put
 * front and center.
 */
export function formatLockTimestamp(lockedAtMs: string, profile: Profile, nowMs: number = Date.now()): string {
  if (profile === "developer") {
    return new Date(Number(lockedAtMs)).toISOString();
  }
  return relativeTimeFromNow(Number(lockedAtMs), nowMs);
}
