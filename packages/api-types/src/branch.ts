import type { HexBytes } from "./hex-bytes.js";

/**
 * A branch as seen at the BFF's JSON boundary (docs/design/api-contract.md
 * section 1, feature 1: `lore.revision.v1.RevisionService.BranchList`).
 *
 * `isDefault` is BFF-computed, not a wire field -- see the note below on why
 * this route needed a BFF-side computation at all.
 *
 * **Real-proto finding (found implementing this route, not anticipated by
 * docs/design/stack-decision.md or api-contract.md):** `BranchListRequest`
 * has no repository-scoping filter, and `lore.model.v1.Branch` carries no
 * `repository_id` field anywhere -- verified against
 * `proto/vendor/lore/lore/revision/v1/revision.proto` and
 * `proto/vendor/lore/lore/model/v1/model.proto`. `BranchList` returns every
 * branch known to the server, full stop. The only repository-membership
 * signal the wire format carries is ancestry: `Branch.stack` is the
 * parent-first/root-last ancestry chain, so a branch's *root* ancestor is
 * either itself (a repository's own default/root branch) or, walking
 * `stack` to its last entry, the id of the branch it was ultimately forked
 * from. The BFF (apps/bff/src/backend/branch-scope.ts) filters the global
 * `BranchList` stream down to one repository by matching that root ancestor
 * against `Repository.default_branch_id`. This is a real gap in the RPC
 * surface, not a client-side convenience.
 */
export interface BranchSummary {
  id: HexBytes;
  name: string;
  creator: string;
  category: string;
  created: string;
  latest: HexBytes;
  deleted: boolean;
  isDefault: boolean;
}

/** Contract for `GET /api/repositories/:repositoryId/branches`. */
export interface BranchListResponseBody {
  branches: BranchSummary[];
}
