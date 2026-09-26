/**
 * v1 task 2 (revision history + multi-lane branch graph): the lane
 * (x-position) allocation algorithm for the custom SVG graph
 * (../components/revision-graph.tsx). Deliberately proto/DTO-agnostic --
 * see ./assemble-revision-graph.ts for the module that turns
 * `BranchSummary`/`RevisionItemDto`/`RevisionDto` into the `GraphNode[]`
 * this module consumes -- so this file is a pure, easily-unit-tested graph
 * algorithm (see ./lane-assignment.test.ts: linear chain, branch point,
 * merge).
 *
 * **Model: one lane per branch, not per commit.** A branch's lane opens the
 * first time one of its nodes appears in `nodes` (the caller's chosen
 * render order, newest-first) and closes the moment we process a node with
 * no `primaryParentId` -- either a true branch root, or simply the oldest
 * revision loaded so far for a branch whose earlier history hasn't been
 * paged in yet (this module can't tell the difference, and doesn't need
 * to: either way, nothing more on that branch continues within `nodes`, so
 * the lane is free for reuse). Cross-branch edges (`crossBranchParentId`
 * -- a branch's own root pointing at its fork point on another branch, or a
 * merge revision pointing at the tip of the branch it merged in) never
 * affect lane allocation, only connector rendering: they're resolved after
 * the fact via `laneByNodeId`, since by the time rendering happens every
 * loaded node's lane is known regardless of which order `assignLanes`
 * happened to visit them in.
 */

export interface GraphNode {
  /** Unique id across the whole graph, e.g. `${branchIdHex}:${number}`. */
  id: string;
  /** Id of the branch this revision belongs to -- lanes are keyed by this, not by node id. */
  branchId: string;
  /**
   * The previous revision on this SAME branch, or `undefined` if this is
   * the oldest revision of `branchId` currently loaded (a true branch root,
   * or just the edge of what's been paged in -- see the module doc above).
   */
  primaryParentId: string | undefined;
  /**
   * A same-graph node on a DIFFERENT branch that this node connects to for
   * display purposes only: either this node is a branch's own root and
   * `crossBranchParentId` is its fork point on the parent branch, or this
   * node is a merge revision and `crossBranchParentId` is the tip of the
   * branch it merged in. Never affects lane allocation.
   */
  crossBranchParentId?: string | undefined;
}

export interface LaneRow {
  nodeId: string;
  lane: number;
  /** Lanes with a pass-through vertical line at this row (every other currently-open branch lane; excludes this row's own `lane`). */
  activeLanes: readonly number[];
}

export interface LaneAssignmentResult {
  rows: LaneRow[];
  /** node id -> lane, for connector lookups (primary and cross-branch alike) once every loaded node's lane is known. */
  laneByNodeId: ReadonlyMap<string, number>;
  /** The number of distinct lanes actually used (the graph's max concurrent width) -- for sizing the SVG viewport. */
  laneCount: number;
}

/**
 * Assigns a lane to every node in `nodes`. `nodes` must already be in a
 * valid render order: every node before all nodes it (transitively)
 * descends from via `primaryParentId` -- in practice, "newest first" per
 * branch, with branches interleaved however the caller likes (interleave
 * order affects readability, e.g. whether a branch-point renders as a
 * short-lived side lane, but never correctness: lanes never collide
 * regardless of interleaving, since a lane is only ever handed out while
 * free).
 */
export function assignLanes(nodes: readonly GraphNode[]): LaneAssignmentResult {
  const branchLane = new Map<string, number>();
  const laneOwner: (string | null)[] = [];
  const laneByNodeId = new Map<string, number>();
  const rows: LaneRow[] = [];

  const allocateFreeLane = (branchId: string): number => {
    const free = laneOwner.indexOf(null);
    if (free !== -1) {
      laneOwner[free] = branchId;
      return free;
    }
    laneOwner.push(branchId);
    return laneOwner.length - 1;
  };

  for (const node of nodes) {
    let lane = branchLane.get(node.branchId);
    if (lane === undefined) {
      lane = allocateFreeLane(node.branchId);
      branchLane.set(node.branchId, lane);
    }
    laneByNodeId.set(node.id, lane);

    const activeLanes = [...branchLane.values()].filter((candidate) => candidate !== lane);
    rows.push({ nodeId: node.id, lane, activeLanes });

    if (node.primaryParentId === undefined) {
      branchLane.delete(node.branchId);
      laneOwner[lane] = null;
    }
  }

  return { rows, laneByNodeId, laneCount: laneOwner.length };
}
