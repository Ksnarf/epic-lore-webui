/**
 * v1 task 3 (side-by-side text diff). Pure, proto-agnostic module that turns
 * a complete unified-diff text (the BFF's `ContentDiffResponseBody.diff` --
 * see `packages/api-types/src/diff.ts`'s doc comment for why the BFF
 * guarantees this string is never a partial chunk) into a line-aligned,
 * two-pane row structure a side-by-side diff view can render directly. No
 * network/React/DOM here -- kept pure so it can be unit-tested directly
 * (vitest), same convention as `../graph/lane-assignment.ts` and
 * `../locks/group-locks.ts`.
 *
 * **Assumption, not confirmed against a real `lore-server`:** this parser
 * assumes `ContentDiff`'s unified-diff text follows the standard GNU
 * unified-diff convention -- `@@ -<fromStart>[,<fromCount>]
 * +<toStart>[,<toCount>] @@` hunk headers, followed by lines prefixed ` `
 * (context), `-` (removed), `+` (added), or `\` (the "No newline at end of
 * file" marker) -- since `thin_client.proto` describes the format only as
 * "a unified diff" without a formal grammar. The demo stack has no revision
 * content to diff live (see tasks.md task 2's note on why), so this
 * assumption is untested against a real server response; see tasks.md task
 * 3 for the honest status.
 */

/** One line on one side of a diff row; `null` when that side has no line here (a pure addition or pure removal). */
export interface DiffLine {
  lineNumber: number;
  text: string;
}

/**
 * One aligned row of the side-by-side view. A "context" row (unchanged
 * line) always has both sides set to the same text; a "change" row from a
 * removed/added pair has both sides set to different text; a one-sided row
 * (more removals than additions, or vice versa, within one change group)
 * has the missing side `null` -- the view renders that side as a blank
 * filler cell so the two panes stay line-aligned.
 */
export interface DiffRow {
  left: DiffLine | null;
  right: DiffLine | null;
}

export interface DiffHunk {
  /** The raw `@@ ... @@` header line, kept for display (e.g. "@@ -1,3 +1,4 @@"). */
  header: string;
  rows: DiffRow[];
}

const HUNK_HEADER_PATTERN = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Parses a complete unified-diff text into aligned hunks. Returns `[]` for
 * an empty string (e.g. a rename with byte-identical content on both
 * sides -- a real, honest "no textual change" result, not an error).
 */
export function parseUnifiedDiff(diffText: string): DiffHunk[] {
  if (diffText.length === 0) {
    return [];
  }

  const lines = diffText.split("\n");
  const hunks: DiffHunk[] = [];

  let currentHeader: string | null = null;
  let currentBody: string[] = [];
  let fromStart = 1;
  let toStart = 1;

  function flushHunk() {
    if (currentHeader !== null) {
      hunks.push({ header: currentHeader, rows: buildRows(currentBody, fromStart, toStart) });
    }
    currentBody = [];
  }

  for (const line of lines) {
    const match = HUNK_HEADER_PATTERN.exec(line);
    if (match) {
      flushHunk();
      currentHeader = line;
      fromStart = Number(match[1]);
      toStart = Number(match[2]);
      continue;
    }
    if (currentHeader !== null) {
      // A trailing empty string from a final "\n" in the source text is not
      // a real diff line -- skip it rather than emitting a bogus context row.
      if (line.length === 0) {
        continue;
      }
      currentBody.push(line);
    }
    // Lines before the first "@@" header (e.g. a "---"/"+++" file-header
    // pair, which `ContentDiff` doesn't emit since it has no path context --
    // see thin_client.proto's own framing of this as a bare CAS-address
    // diff) are not part of any hunk; skipped rather than guessed at.
  }
  flushHunk();

  return hunks;
}

/**
 * Builds one hunk's aligned rows. Unified-diff convention groups all of a
 * change's removed lines contiguously immediately before its added lines
 * (never interleaved) -- so a single forward pass, batching contiguous
 * runs of `-`/`+` lines between context lines, correctly reconstructs each
 * change group without needing its own diff algorithm.
 */
function buildRows(bodyLines: string[], fromStart: number, toStart: number): DiffRow[] {
  const rows: DiffRow[] = [];
  let fromLine = fromStart;
  let toLine = toStart;
  let pendingRemoved: DiffLine[] = [];
  let pendingAdded: DiffLine[] = [];

  function flushChangeGroup() {
    const count = Math.max(pendingRemoved.length, pendingAdded.length);
    for (let i = 0; i < count; i++) {
      rows.push({ left: pendingRemoved[i] ?? null, right: pendingAdded[i] ?? null });
    }
    pendingRemoved = [];
    pendingAdded = [];
  }

  for (const line of bodyLines) {
    const marker = line[0];
    const text = line.slice(1);
    if (marker === " ") {
      flushChangeGroup();
      rows.push({ left: { lineNumber: fromLine, text }, right: { lineNumber: toLine, text } });
      fromLine++;
      toLine++;
    } else if (marker === "-") {
      pendingRemoved.push({ lineNumber: fromLine, text });
      fromLine++;
    } else if (marker === "+") {
      pendingAdded.push({ lineNumber: toLine, text });
      toLine++;
    }
    // `\` ("No newline at end of file") and any other unrecognized leading
    // character: informational only, doesn't advance either line counter or
    // produce a row -- skipped rather than throwing, since a display-layer
    // parser shouldn't fail a whole diff view over one marker line.
  }
  flushChangeGroup();

  return rows;
}
