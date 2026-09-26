import type { BranchSummary, RevisionDto, RevisionItemDto } from "@epic-lore-webui/api-types";
import { assignLanes, type GraphNode, type LaneAssignmentResult } from "./lane-assignment.js";

/**
 * v1 task 2 (revision history + multi-lane branch graph). Turns the BFF's
 * DTOs into the `GraphNode[]` `assignLanes` (./lane-assignment.ts)
 * consumes.
 *
 * **Gap this works around (docs/design/api-contract.md section 1, feature
 * 2):** there is no cross-branch DAG RPC. This assembles one from
 * `BranchList` (`BranchSummary.stack` -- the fork-point ancestry) plus a
 * `RevisionList` walk per branch of interest, exactly as the design doc
 * describes -- with one addition the design doc didn't anticipate: a
 * bounded, per-branch-*tip* `RevisionInfo` call to detect merges, since
 * `RevisionItemDto` (RevisionList's row projection) carries no parent field
 * at all -- see packages/api-types/src/revision.ts's doc comment. This
 * keeps the extra calls at O(branches shown), not O(revisions), matching
 * the gap note's own "fine for a handful of branches" framing.
 */

/** One branch's currently-loaded window: its own summary, its loaded revisions (newest-first), and its tip's full record (for merge detection). */
export interface BranchWindow {
  branch: BranchSummary;
  /** Newest-to-oldest, however much of this branch's history is currently loaded (all flattened `useInfiniteQuery` pages for the focus branch; a single first page for side branches). */
  revisions: RevisionItemDto[];
  /** The branch's tip, full record (`ThinClientService.RevisionInfo`) -- `null` while still loading. Used only to read `parentOther`. */
  tip: RevisionDto | null;
}

function nodeId(branchId: string, number: string): string {
  return `${branchId}:${number}`;
}

/** Finds the loaded revision on `branch` whose signature matches `signature` (a `BranchPoint.revisionSignature` or a `Revision.Parent.signature`), if it's within the currently-loaded window. */
function findBySignature(branch: BranchWindow, signature: string): RevisionItemDto | undefined {
  return branch.revisions.find((item) => item.signature === signature);
}

/**
 * Builds the graph's node list from a set of branch windows (the focus
 * branch plus whatever other branches are relevant to it -- see
 * `selectRelevantBranches` below) and runs lane assignment over it.
 *
 * Node order (newest-first overall): branches are emitted one at a time,
 * newest-to-oldest within each, in the order `branchWindows` is given.
 * This is a valid render order for `assignLanes` (every node before
 * everything it primary-chains back to) regardless of which order the
 * branches themselves are listed in -- interleaving affects only how early
 * a branch-point/merge's *other* side starts rendering, not correctness.
 */
export function assembleRevisionGraph(branchWindows: BranchWindow[]): LaneAssignmentResult & { nodes: GraphNode[] } {
  const byBranchId = new Map(branchWindows.map((window) => [window.branch.id, window]));
  const nodes: GraphNode[] = [];

  for (const window of branchWindows) {
    const { branch, revisions, tip } = window;
    for (let i = 0; i < revisions.length; i++) {
      const item = revisions[i]!;
      const isOldestLoaded = i === revisions.length - 1;
      const isTip = i === 0;

      const primaryParentId = isOldestLoaded ? undefined : nodeId(branch.id, revisions[i + 1]!.number);

      let crossBranchParentId: string | undefined;
      if (isOldestLoaded && branch.stack.length > 0) {
        // This branch's own root: its cross-branch parent is its fork
        // point on the branch it forked from, if that ancestor branch is
        // also loaded and the fork revision itself is within its window.
        const forkPoint = branch.stack[0]!;
        const parentBranch = byBranchId.get(forkPoint.branchId);
        const forkRevision = parentBranch && findBySignature(parentBranch, forkPoint.revisionSignature);
        if (forkRevision) {
          crossBranchParentId = nodeId(forkPoint.branchId, forkRevision.number);
        }
      } else if (isTip && tip?.parentOther) {
        // A merge: the tip's second parent is on another branch. Unlike
        // the fork-point case above, `parentOther` already resolves to a
        // concrete (branchId, number) -- no signature lookup needed.
        crossBranchParentId = nodeId(tip.parentOther.branchId, tip.parentOther.number);
      }

      nodes.push({ id: nodeId(branch.id, item.number), branchId: branch.id, primaryParentId, crossBranchParentId });
    }
  }

  return { ...assignLanes(nodes), nodes };
}

/**
 * Which other branches (besides `focus`) are worth fetching and rendering
 * as extra lanes: branches that fork *from* `focus`, the branch `focus`
 * itself forked from (if any), and -- once known -- whatever branch
 * `focus`'s tip merged in from. Bounded by the repository's own branch
 * count (a "handful", per the gap note), not by revision count.
 */
export function selectRelevantBranches(
  focus: BranchSummary,
  allBranches: BranchSummary[],
  focusTip: RevisionDto | null,
): BranchSummary[] {
  const relevant = new Map<string, BranchSummary>();
  for (const candidate of allBranches) {
    if (candidate.id === focus.id) {
      continue;
    }
    const forksFromFocus = candidate.stack[0]?.branchId === focus.id;
    const focusForksFromCandidate = focus.stack[0]?.branchId === candidate.id;
    if (forksFromFocus || focusForksFromCandidate) {
      relevant.set(candidate.id, candidate);
    }
  }
  if (focusTip?.parentOther) {
    const mergedFrom = allBranches.find((candidate) => candidate.id === focusTip.parentOther!.branchId);
    if (mergedFrom) {
      relevant.set(mergedFrom.id, mergedFrom);
    }
  }
  return [...relevant.values()];
}
