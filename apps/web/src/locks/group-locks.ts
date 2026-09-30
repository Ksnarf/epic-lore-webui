import type { BranchSummary, LockDto } from "@epic-lore-webui/api-types";

/**
 * v1 task 5 (lock management across all branches). `GET .../locks` returns
 * a flat list spanning every branch of a repository (the point of the
 * task); this module is the pure, proto-agnostic presentation logic that
 * turns that flat list into one group per branch, for a UI that shows
 * "which branches have locks, and what's locked on each" rather than one
 * undifferentiated table. No network/React/DOM here -- kept pure so it can
 * be unit-tested directly (vitest), same convention as
 * `../graph/lane-assignment.ts`.
 */
export interface LockGroup {
  branchId: string;
  /** Resolved from `branches` by `branchId`; falls back to a visibly-synthetic placeholder if the branch isn't in the given list (e.g. a stale/deleted branch a lock still references) -- never silently dropped. */
  branchName: string;
  /** Newest-locked-first (see `compareLockedAtDesc`), ties broken by `description` ascending for a stable, readable order. */
  locks: LockDto[];
}

/** Groups a flat lock list by branch and sorts both the groups (by branch name) and each group's locks (newest-first). */
export function groupLocksByBranch(locks: LockDto[], branches: BranchSummary[]): LockGroup[] {
  const nameByBranchId = new Map<string, string>(branches.map((branch) => [branch.id, branch.name]));

  const locksByBranchId = new Map<string, LockDto[]>();
  for (const lock of locks) {
    const branchId = lock.resource.branchId;
    const bucket = locksByBranchId.get(branchId);
    if (bucket) {
      bucket.push(lock);
    } else {
      locksByBranchId.set(branchId, [lock]);
    }
  }

  const groups: LockGroup[] = [];
  for (const [branchId, branchLocks] of locksByBranchId) {
    groups.push({
      branchId,
      branchName: nameByBranchId.get(branchId) ?? `(unknown branch ${branchId})`,
      locks: sortLocksNewestFirst(branchLocks),
    });
  }
  groups.sort((a, b) => a.branchName.localeCompare(b.branchName));
  return groups;
}

function sortLocksNewestFirst(locks: LockDto[]): LockDto[] {
  return [...locks].sort((a, b) => {
    const byTime = compareLockedAtDesc(a.lockedAt, b.lockedAt);
    return byTime !== 0 ? byTime : a.resource.description.localeCompare(b.resource.description);
  });
}

/**
 * `lockedAt` is a decimal-string ms-epoch (packages/api-types/src/lock.ts) --
 * compared as `BigInt` rather than `Number` so this doesn't silently lose
 * precision on a real far-future or malformed timestamp, matching this
 * repo's existing convention of treating these wire timestamps as opaque
 * decimal strings, not JS numbers, wherever precision matters.
 */
function compareLockedAtDesc(a: string, b: string): number {
  const diff = BigInt(b) - BigInt(a);
  if (diff > 0n) {
    return 1;
  }
  if (diff < 0n) {
    return -1;
  }
  return 0;
}
