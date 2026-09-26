import type { HexBytes } from "./hex-bytes.js";

/**
 * v1 task 2 (revision history + multi-lane branch graph). API contract
 * study (docs/design/api-contract.md section 1, feature 2) and stack
 * decision doc: `RevisionList` is per-branch and cursor-paginated
 * (`signature_forward`/`signature_backward`); there is no single RPC
 * returning a cross-branch DAG, so the graph is assembled client-side
 * (see apps/web/src/graph/*) from `BranchList` (branch.ts's `stack`) plus a
 * `RevisionList` walk per branch of interest.
 */

/**
 * Mirrors `lore.model.v1.RevisionItem` -- the lean list-row projection
 * `RevisionList` returns. `number` (proto `uint64`) is a decimal string for
 * the same reason `RepositorySummary.created` is (see repository.ts).
 *
 * **Real-proto finding (found implementing this route, not anticipated by
 * docs/design/api-contract.md or stack-decision.md):** `RevisionItem`
 * carries no parent/ancestry field at all -- not even for merges. Only the
 * *full* `lore.thin_client.v1.Revision` record (`RevisionInfoResponseBody`
 * below, fetched via `ThinClientService.RevisionInfo`) carries
 * `parent_self`/`parent_other`, and `parent_other` is the *only* wire
 * signal that a revision is a merge. A `RevisionList` walk alone can
 * reconstruct a branch's own linear chain (`number - 1` is always the
 * previous revision on the same branch) and, combined with `Branch.stack`,
 * where a branch forked from -- but it can never reveal a merge. See
 * `apps/web/src/graph/assemble-revision-graph.ts` for how this repo works
 * around that gap (a bounded, per-branch-tip `RevisionInfo` call), and
 * tasks.md task 2 for why that's a scoped compromise, not a complete
 * solution.
 */
export interface RevisionItemDto {
  number: string;
  signature: HexBytes;
  metadata: HexBytes;
  state: HexBytes;
}

/**
 * Contract for `GET
 * /api/repositories/:repositoryId/branches/:branchId/revisions?cursor=`.
 * Cursor pagination per `lore.revision.v1.RevisionListResponse`
 * (revision.proto:204-219): omitting `cursor` resolves to the branch tip
 * (`RevisionIdentifier.number == 0`); passing a prior response's
 * `signatureBackward` back as `cursor` fetches the next page of older
 * revisions, `signatureForward` the next page of newer ones. Either is
 * `null` when no further page exists in that direction.
 *
 * **Real-proto wrinkle, not implemented faithfully by the fixture backend:**
 * `RevisionListResponse`'s own doc comment says the anchor revision "is
 * guaranteed to appear somewhere in the page, but is not necessarily
 * items[0] -- the server may align the page on a wider boundary... and
 * return items both newer and older than the anchor." The fixture backend
 * (apps/bff/src/backend/fixture.ts) instead always anchors the page at
 * `items[0]` and returns a strictly-older page after it, so repeatedly
 * following `signatureBackward` yields disjoint, non-overlapping pages.
 * This is a deliberate simplification for a controllable fixture, not a
 * proven real-server behavior: a real `lore-server` may return overlapping
 * windows, which would require the web client to de-duplicate by
 * `signature` across pages. Unproven either way -- see tasks.md task 2.
 */
export interface RevisionListResponseBody {
  items: RevisionItemDto[];
  signatureForward: HexBytes | null;
  signatureBackward: HexBytes | null;
}

/** Mirrors `lore.thin_client.v1.Revision.Parent`. */
export interface RevisionParentDto {
  signature: HexBytes;
  branchId: HexBytes;
  number: string;
}

/**
 * Mirrors `lore.thin_client.v1.Revision` (the full record, as opposed to
 * `RevisionItemDto`'s lean list-row projection above). `parentSelf` is the
 * predecessor on this revision's own branch (unset only on a branch root);
 * `parentOther` is set only on merge commits -- see `RevisionItemDto`'s doc
 * comment for why this is the only place merge parentage is visible on the
 * wire at all.
 */
export interface RevisionDto {
  signature: HexBytes;
  branchId: HexBytes;
  number: string;
  commitMessage: string;
  timestamp: string;
  createdBy: string;
  committedBy: string;
  parentSelf: RevisionParentDto | null;
  parentOther: RevisionParentDto | null;
}

/**
 * Contract for `GET
 * /api/repositories/:repositoryId/branches/:branchId/revisions/:number`
 * (`:number` a decimal string; `0` resolves to the branch tip, matching
 * `RevisionIdentifier`'s own convention). Used sparingly by the web app's
 * graph assembly -- see `RevisionItemDto`'s doc comment -- not for every
 * revision in a list.
 */
export interface RevisionInfoResponseBody {
  revision: RevisionDto;
}
