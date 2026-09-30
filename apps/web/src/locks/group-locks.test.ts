import type { BranchSummary, HexBytes, LockDto } from "@epic-lore-webui/api-types";
import { describe, expect, it } from "vitest";
import { groupLocksByBranch } from "./group-locks.js";

/** `HexBytes` is a branded string (packages/api-types/src/hex-bytes.ts) -- test fixtures assert the brand directly rather than round-tripping through `encodeHexBytes` for readable, hand-picked ids. */
function hex(value: string): HexBytes {
  return value as HexBytes;
}

function branch(id: string, name: string): BranchSummary {
  return {
    id: hex(id),
    name,
    creator: "test",
    category: "",
    created: "0",
    latest: hex("aa"),
    deleted: false,
    isDefault: false,
    stack: [],
  };
}

function lock(branchId: string, description: string, lockedAt: string, owner = "alice"): LockDto {
  return { resource: { branchId: hex(branchId), hash: hex("bb"), description }, owner, lockedAt };
}

describe("groupLocksByBranch", () => {
  it("groups locks by branch and sorts groups by branch name", () => {
    const branches = [branch("b-main", "main"), branch("b-feature", "feature/x")];
    const locks = [lock("b-main", "README.md", "100"), lock("b-feature", "src/lib.rs", "200")];

    const groups = groupLocksByBranch(locks, branches);

    expect(groups.map((g) => g.branchName)).toEqual(["feature/x", "main"]);
    expect(groups[0]!.locks).toHaveLength(1);
    expect(groups[1]!.locks).toHaveLength(1);
  });

  it("sorts locks within a branch newest-locked-first", () => {
    const branches = [branch("b-main", "main")];
    const locks = [
      lock("b-main", "old.txt", "100"),
      lock("b-main", "newest.txt", "300"),
      lock("b-main", "middle.txt", "200"),
    ];

    const groups = groupLocksByBranch(locks, branches);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.locks.map((l) => l.resource.description)).toEqual([
      "newest.txt",
      "middle.txt",
      "old.txt",
    ]);
  });

  it("breaks a lockedAt tie by description ascending, for a stable order", () => {
    const branches = [branch("b-main", "main")];
    const locks = [lock("b-main", "zebra.txt", "100"), lock("b-main", "apple.txt", "100")];

    const groups = groupLocksByBranch(locks, branches);

    expect(groups[0]!.locks.map((l) => l.resource.description)).toEqual(["apple.txt", "zebra.txt"]);
  });

  it("falls back to a visible placeholder name for a lock whose branch isn't in the given branch list, rather than dropping it", () => {
    const branches = [branch("b-main", "main")];
    const locks = [lock("b-stale", "orphaned.bin", "100")];

    const groups = groupLocksByBranch(locks, branches);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.branchName).toContain("b-stale");
    expect(groups[0]!.locks).toHaveLength(1);
  });

  it("returns no groups for an empty lock list", () => {
    expect(groupLocksByBranch([], [branch("b-main", "main")])).toEqual([]);
  });
});
