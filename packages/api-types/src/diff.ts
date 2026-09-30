import type { HexBytes } from "./hex-bytes.js";
import type { TreeNodeType } from "./tree.js";

/**
 * v1 task 3 (side-by-side text diff + binary-aware diff), via
 * `lore.thin_client.v1.ThinClientService.RevisionDiff` / `ContentDiff`.
 *
 * **Scope decision, recorded here per tasks.md task 3's brief:** the proto
 * lets `RevisionDiffRequest`'s "from" and "to" sides each name an
 * independent `(branchId, number)` pair (or a bare signature) -- diffing
 * across two entirely different branches is wire-legal. This repo's route
 * and `LoreBackend.getRevisionDiff` deliberately narrow that to **one shared
 * `branchId` with a `fromNumber`/`toNumber` pair**, matching the only case
 * the web UI actually needs (a revision vs. its own-branch predecessor, from
 * the history view) -- not a proto limitation, a surgical scope reduction.
 * See `apps/web/src/routes/revision-diff.tsx`'s top comment for why revision
 * number 1 (a branch root, whose real parent lives on a different branch via
 * `Branch.stack`) is excluded rather than guessed at.
 *
 * **Scope decision, 3-way conflicts:** `docs/design/api-contract.md`
 * (section 1, features 3 and 7) draws its own line here -- feature 3 is
 * text/binary diff display, feature 7 (branch management + merge/conflict
 * UI) owns `DiffConflict` rendering. When the server picks 3-way mode (a
 * merge revision), `conflicts` below is still populated (never silently
 * dropped) but the web UI does not render dedicated conflict-resolution UI
 * for it -- see `RevisionDiffResponseBody`'s doc comment.
 */

/** Mirrors `lore.thin_client.v1.Action`. */
export type DiffActionDto = "KEEP" | "ADD" | "DELETE" | "MOVE" | "COPY";

/**
 * Mirrors `lore.thin_client.v1.DiffChange`. **Interpretation call, not
 * confirmed live** (the demo stack's seeded branches have no revision
 * content to diff -- see tasks.md task 2's note on why -- so this couldn't
 * be checked against a real multi-file diff): `Action.KEEP`'s own proto
 * comment says "No change at this path," but `DiffChange` still carries
 * distinct `contentFrom`/`contentTo` fields alongside it. Read as: `KEEP`
 * means no *structural* change (no add/delete/move/copy) -- the path itself
 * is unchanged -- while `contentFrom !== contentTo` on a `KEEP` entry is
 * this diff's representation of an in-place content modification (a
 * "modify," in the vocabulary most VCS UIs use). The fixture backend
 * (`apps/bff/src/backend/fixture.ts`) is built on this reading.
 */
export interface DiffChangeDto {
  /** Destination path (the "to" side); for DELETE, this is also the removed path (there is no "to" side to move it from). */
  path: string;
  /** Source path for MOVE/COPY; empty string otherwise. */
  pathFrom: string;
  action: DiffActionDto;
  nodeType: TreeNodeType;
  /** Empty-string `HexBytes` means "no content on this side" (ADD has no `contentFrom`; DELETE has no `contentTo`). */
  contentFrom: HexBytes;
  contentTo: HexBytes;
  automerged: boolean;
  /**
   * `0` = this repository; non-zero means the content for this path lives in
   * a linked repository (`partitions` below), which this task does not fetch
   * content-diffs for -- see `RevisionDiffResponseBody`'s doc comment.
   */
  linkRepositoryIndex: number;
  tracking: boolean;
}

/** One `(branchId, number)` coordinate, as embedded in `RevisionDiffHeaderDto`. */
export interface RevisionRefDto {
  branchId: HexBytes;
  number: string;
}

/**
 * Mirrors `lore.thin_client.v1.RevisionDiffHeader`. `*Base` fields are
 * non-null only when the server picked 3-way mode.
 */
export interface RevisionDiffHeaderDto {
  identifierFrom: RevisionRefDto;
  signatureFrom: HexBytes;
  identifierTo: RevisionRefDto;
  signatureTo: HexBytes;
  identifierBase: RevisionRefDto | null;
  signatureBase: HexBytes | null;
}

/**
 * A 3-way merge conflict pair, named but not expanded: rendering the actual
 * conflicting content is task 7's scope (branch management + merge/conflict
 * UI), not this task's -- see this file's top comment. Carries only what's
 * needed to say "N conflicts exist, at these paths" honestly, without
 * inventing resolution UI here.
 */
export interface DiffConflictSummaryDto {
  changeFromPath: string;
  changeToPath: string;
}

/** Mirrors `lore.thin_client.v1.DiffPartition` -- a linked-repository announcement. */
export interface DiffPartitionDto {
  index: number;
  linkPartition: HexBytes;
}

/**
 * Contract for `GET
 * /api/repositories/:repositoryId/branches/:branchId/diff/:from/:to`
 * (`:from`/`:to` decimal revision numbers on the same branch; `0` resolves
 * to the branch tip, matching `RevisionIdentifier`'s convention elsewhere in
 * this repo). `changes` is the 2-way (or, for a merge revision, 3-way-mode)
 * per-path change list this task's UI renders; `conflicts`/`partitions` are
 * carried through unfiltered for honesty (see this file's top comment) but
 * are not the focus of this task's UI.
 */
export interface RevisionDiffResponseBody {
  header: RevisionDiffHeaderDto;
  changes: DiffChangeDto[];
  conflicts: DiffConflictSummaryDto[];
  partitions: DiffPartitionDto[];
}

/**
 * Contract for `GET /api/repositories/:repositoryId/content-diff?from=&to=`
 * (`from`/`to` hex-encoded CAS addresses; empty string means "no content on
 * this side," mirroring `ContentDiffRequest.address_from`/`address_to`'s own
 * doc comment). Mirrors `lore.thin_client.v1.ContentDiffHeader` plus the
 * concatenated chunk text.
 *
 * **Real-proto subtlety, load-bearing for this contract:**
 * `ContentDiffChunkResponse`'s own doc comment says the server "picks chunk
 * boundaries on UTF-8 character boundaries; clients MUST NOT assume line
 * alignment" -- a single line of diff text can be split across two chunks.
 * The BFF (`apps/bff/src/backend/grpc.ts`'s `getContentDiff`) therefore
 * buffers the *entire* stream and concatenates every `chunk.diff` before
 * this response is built; `diff` below is always a complete string, never a
 * partial chunk, so `apps/web/src/diff/unified-diff.ts`'s line-oriented
 * parser can safely assume it never sees a mid-line cut.
 *
 * `linesAdded`/`linesDeleted` (proto `uint64`) are **left as JS `number`,
 * not the decimal-string convention** used elsewhere in this package
 * (`RepositorySummary.created`, `RevisionDto.timestamp`, etc.): a diff's
 * added/deleted line count is bounded by the file's actual line count,
 * which cannot realistically approach `Number.MAX_SAFE_INTEGER` the way a
 * timestamp or a monotonic revision number's *signature* bytes could be
 * construed to -- this is a deliberate, narrower exception, not an
 * inconsistency.
 *
 * `binary`/`truncated` are mutually-informative, not mutually-exclusive
 * per the proto: when `binary` is true, stats are zero and `diff` is empty
 * (the file's content is never diffable as text); when `truncated` is true
 * (and `binary` is false), stats are still real but `diff` is empty because
 * the generated diff text exceeded the server's `max_diff_size`. The web UI
 * renders these as two distinct, honest cards -- see
 * `apps/web/src/components/diff-view.tsx`.
 */
export interface ContentDiffResponseBody {
  linesAdded: number;
  linesDeleted: number;
  binary: boolean;
  truncated: boolean;
  hasConflicts: boolean;
  conflictCount: number;
  /** Complete unified-diff text (all chunks concatenated); `""` when `binary` or `truncated`. */
  diff: string;
}
