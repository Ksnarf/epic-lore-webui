import type { Branch } from "@epic-lore-webui/lore-client/gen/lore/model/v1/model_pb";

/** Byte-for-byte equality for `bytes` proto fields (ids, signatures, addresses). */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/**
 * A branch's ultimate ancestor: its own id if it has no `stack` (a
 * repository's own default/root branch), else the branch id at the tail of
 * `stack` (parent-first, root-last -- `lore.model.v1.Branch.stack`'s own
 * doc comment: "stack[0] is the immediate parent... stack[N-1] is the
 * ultimate root").
 */
export function rootBranchId(branch: Branch): Uint8Array {
  if (branch.stack.length === 0) {
    return branch.id;
  }
  // Safe: length checked above, so `.at(-1)` cannot be undefined here.
  const root = branch.stack.at(-1);
  return root!.branchId;
}

/**
 * Filters a global branch list down to the branches belonging to one
 * repository.
 *
 * **Why this exists (a real gap found building this route, not anticipated
 * by docs/design/api-contract.md or stack-decision.md):**
 * `lore.revision.v1.RevisionService.BranchList` has no repository-scoping
 * filter -- it streams every branch the server knows about -- and
 * `lore.model.v1.Branch` carries no `repository_id` field at all. The only
 * repository-membership signal the wire format carries is ancestry: a
 * branch belongs to `repository` iff its root ancestor (see `rootBranchId`
 * above) equals `repository.defaultBranchId`. Every repository's own
 * default/root branch has an empty `stack` and satisfies this trivially
 * (its root is itself).
 */
export function filterBranchesForRepository(
  branches: Branch[],
  repository: { defaultBranchId: Uint8Array },
): Branch[] {
  return branches.filter((branch) => bytesEqual(rootBranchId(branch), repository.defaultBranchId));
}
