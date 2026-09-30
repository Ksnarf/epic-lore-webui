import type { ContentDiffResponseBody, DiffChangeDto } from "@epic-lore-webui/api-types";
import { parseUnifiedDiff } from "../diff/unified-diff.js";

interface DiffViewProps {
  change: DiffChangeDto;
  contentDiff: ContentDiffResponseBody | undefined;
  isLoading: boolean;
  error: unknown;
}

/**
 * v1 task 3 (side-by-side text diff + binary-aware diff). Renders exactly
 * one changed file's content diff, given the already-fetched
 * `ContentDiffResponseBody` (`useContentDiffQuery`, ../queries/lore.ts).
 *
 * **Honest handling, per this task's brief:** `ContentDiff` only ever
 * flags `binary = true` -- there is no chunk-level binary diff RPC
 * (`docs/design/api-contract.md` section 1, feature 3). This component
 * therefore shows a plain "binary file changed" card with whatever the
 * wire actually reports (the two content addresses, truncated for
 * display) and nothing invented -- no thumbnail, no chunk-delta, since
 * neither exists server-side today. See tasks.md task 3 for the full
 * descope note.
 */
export function DiffView({ change, contentDiff, isLoading, error }: DiffViewProps) {
  if (change.linkRepositoryIndex !== 0) {
    return (
      <div className="rounded border border-amber-900 bg-amber-950/40 p-4 text-sm text-amber-200">
        This file's content lives in a linked repository (partition index {change.linkRepositoryIndex}). Diffing
        across a linked partition is not supported by this view -- see tasks.md task 3's descope note.
      </div>
    );
  }

  if (isLoading) {
    return <p className="text-sm text-slate-400">Loading diff...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-400">Failed to load diff: {(error as Error).message}</p>;
  }

  if (!contentDiff) {
    return null;
  }

  if (contentDiff.binary) {
    return (
      <div className="rounded border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
        <p className="font-medium text-slate-100">Binary file changed</p>
        <p className="mt-1 text-slate-400">
          `ContentDiff` reports this content as binary and emits no diff body (no thumbnail or chunk-level delta
          exists server-side today -- see tasks.md task 3).
        </p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs text-slate-500">
          <dt>from</dt>
          <dd className="truncate">{change.contentFrom || "(none)"}</dd>
          <dt>to</dt>
          <dd className="truncate">{change.contentTo || "(none)"}</dd>
        </dl>
      </div>
    );
  }

  if (contentDiff.truncated) {
    return (
      <div className="rounded border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
        <p className="font-medium text-slate-100">Diff too large to display</p>
        <p className="mt-1 text-slate-400">
          The server truncated this diff (it exceeded `max_diff_size`) but still reports summary stats: +
          {contentDiff.linesAdded} / -{contentDiff.linesDeleted} lines.
        </p>
      </div>
    );
  }

  const hunks = parseUnifiedDiff(contentDiff.diff);

  if (hunks.length === 0) {
    return (
      <div className="rounded border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
        No textual changes (content is byte-identical on both sides).
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-slate-800">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-400">
        <span>
          +{contentDiff.linesAdded} / -{contentDiff.linesDeleted}
        </span>
      </div>
      {hunks.map((hunk, hunkIndex) => (
        <div key={hunkIndex}>
          <div className="bg-slate-900/80 px-3 py-1 font-mono text-xs text-slate-500">{hunk.header}</div>
          <table className="w-full min-w-[640px] border-collapse font-mono text-xs">
            <tbody>
              {hunk.rows.map((row, rowIndex) => {
                // A row is unchanged context only when both sides are
                // present with identical text; anything else (a one-sided
                // row, or a paired row with different text) is a change --
                // colored red on the left (removed/old), green on the right
                // (added/new), matching the convention every mainstream
                // side-by-side diff view uses.
                const isContext = row.left !== null && row.right !== null && row.left.text === row.right.text;
                return (
                  <tr key={rowIndex}>
                    <DiffCell line={row.left} highlight={!isContext && row.left !== null ? "removed" : null} />
                    <DiffCell line={row.right} highlight={!isContext && row.right !== null ? "added" : null} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function DiffCell({
  line,
  highlight,
}: {
  line: { lineNumber: number; text: string } | null;
  highlight: "removed" | "added" | null;
}) {
  if (!line) {
    return <td className="w-1/2 border-t border-slate-800/60 bg-slate-950 px-2 py-0.5" />;
  }
  const bg = highlight === "removed" ? "bg-red-950/40" : highlight === "added" ? "bg-emerald-950/40" : "";
  return (
    <td className={`w-1/2 border-t border-slate-800/60 px-2 py-0.5 align-top ${bg}`}>
      <span className="mr-3 inline-block w-10 select-none text-right text-slate-600">{line.lineNumber}</span>
      <span className="whitespace-pre text-slate-200">{line.text}</span>
    </td>
  );
}
