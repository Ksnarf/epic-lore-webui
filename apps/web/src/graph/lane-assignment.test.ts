import { describe, expect, it } from "vitest";
import { assignLanes, type GraphNode } from "./lane-assignment.js";

describe("assignLanes", () => {
  it("keeps a linear chain (single branch, no forks) on one lane", () => {
    // Newest-first: c5 <- c4 <- c3 <- c2 <- c1 (root).
    const nodes: GraphNode[] = [
      { id: "c5", branchId: "main", primaryParentId: "c4" },
      { id: "c4", branchId: "main", primaryParentId: "c3" },
      { id: "c3", branchId: "main", primaryParentId: "c2" },
      { id: "c2", branchId: "main", primaryParentId: "c1" },
      { id: "c1", branchId: "main", primaryParentId: undefined },
    ];

    const result = assignLanes(nodes);

    expect(result.laneCount).toBe(1);
    for (const row of result.rows) {
      expect(row.lane).toBe(0);
      expect(row.activeLanes).toEqual([]);
    }
  });

  it("gives a forked branch its own lane without disturbing the parent branch's lane", () => {
    // main: m1 (newest) <- m2 <- m3 <- m4 <- m5 (root)
    // feature forks from m3: f1 (newest) <- f2 (root, cross-branch parent m3)
    // Render order (newest-first, feature interleaved between m2 and m3):
    const nodes: GraphNode[] = [
      { id: "m1", branchId: "main", primaryParentId: "m2" },
      { id: "m2", branchId: "main", primaryParentId: "m3" },
      { id: "f1", branchId: "feature", primaryParentId: "f2" },
      { id: "f2", branchId: "feature", primaryParentId: undefined, crossBranchParentId: "m3" },
      { id: "m3", branchId: "main", primaryParentId: "m4" },
      { id: "m4", branchId: "main", primaryParentId: "m5" },
      { id: "m5", branchId: "main", primaryParentId: undefined },
    ];

    const result = assignLanes(nodes);
    const laneOf = (id: string) => result.laneByNodeId.get(id);

    // main keeps exactly one lane across every one of its own rows.
    const mainLane = laneOf("m1");
    for (const id of ["m1", "m2", "m3", "m4", "m5"]) {
      expect(laneOf(id)).toBe(mainLane);
    }

    // feature gets a *different* lane for the span it's alive.
    const featureLane = laneOf("f1");
    expect(featureLane).not.toBe(mainLane);
    expect(laneOf("f2")).toBe(featureLane);

    // While both are open, each row shows the other as a pass-through line
    // (no collision, both visible) -- this is the "parallel lanes" property.
    const f1Row = result.rows.find((row) => row.nodeId === "f1")!;
    expect(f1Row.activeLanes).toContain(mainLane);

    // feature's lane frees once its root (f2) is processed: a later,
    // unrelated single-node branch reuses a freed lane instead of growing
    // the graph past what was ever concurrently in use.
    const withReuseCheck = assignLanes([
      ...nodes,
      { id: "g1", branchId: "third", primaryParentId: undefined },
    ]);
    expect(withReuseCheck.laneByNodeId.get("g1")).toBeLessThan(2);
    expect(withReuseCheck.laneCount).toBe(2);
  });

  it("resolves a merge's cross-branch connector to the correct (distinct) lane, then frees both lanes for reuse", () => {
    // main: m25 (tip, MERGE -- crossBranchParentId f6) <- m24 <- m_root (root)
    // feature: f6 (tip) <- f5 <- f4 <- f3 <- f2 <- f1 (root, forked from m_root)
    const nodes: GraphNode[] = [
      { id: "m25", branchId: "main", primaryParentId: "m24", crossBranchParentId: "f6" },
      { id: "f6", branchId: "feature", primaryParentId: "f5" },
      { id: "f5", branchId: "feature", primaryParentId: "f4" },
      { id: "f4", branchId: "feature", primaryParentId: "f3" },
      { id: "f3", branchId: "feature", primaryParentId: "f2" },
      { id: "f2", branchId: "feature", primaryParentId: "f1" },
      { id: "f1", branchId: "feature", primaryParentId: undefined, crossBranchParentId: "m_root" },
      { id: "m24", branchId: "main", primaryParentId: "m_root" },
      { id: "m_root", branchId: "main", primaryParentId: undefined },
      { id: "third1", branchId: "third", primaryParentId: undefined },
    ];

    const result = assignLanes(nodes);
    const laneOf = (id: string) => result.laneByNodeId.get(id);

    const mainLane = laneOf("m25");
    const featureLane = laneOf("f6");
    expect(featureLane).not.toBe(mainLane);
    // Every feature row shares f6's lane; every main row shares m25's lane.
    for (const id of ["f6", "f5", "f4", "f3", "f2", "f1"]) {
      expect(laneOf(id)).toBe(featureLane);
    }
    for (const id of ["m25", "m24", "m_root"]) {
      expect(laneOf(id)).toBe(mainLane);
    }

    // The merge connector (m25 -> f6, m25's crossBranchParentId) spans two
    // distinct, correctly-resolved lanes -- a real diagonal line, not a
    // same-lane no-op.
    expect(laneOf("m25")).not.toBe(laneOf("f6"));

    // Both branches eventually close (root reached); a later independent
    // branch reuses a freed lane rather than growing the lane count past 2.
    expect(result.laneCount).toBe(2);
    expect(laneOf("third1")).toBeLessThan(2);
  });
});
