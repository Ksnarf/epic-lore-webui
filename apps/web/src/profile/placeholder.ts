/**
 * v1 task 11 (dual profile). Honest visual placeholders for the Artist
 * profile's "visual emphasis" ask, where no real asset data exists yet
 * (task 4, asset preview via presigned URLs, is unbuilt -- see tasks.md).
 * These are deliberately NOT thumbnails: there is no image/content bytes
 * behind either function below, only a deterministic derivation from
 * already-real strings (a repository/file name) -- same "no fake data"
 * rule the rest of this repo's fixtures follow. Pure, no React/DOM, so
 * it's directly vitest-testable (same convention as `./format.ts`).
 */

/**
 * The same fixed, accessible color set `../components/revision-graph.tsx`
 * already uses for lane coloring (`LANE_COLORS`) -- reused here rather than
 * inventing a second palette, so an Artist-profile placeholder swatch and
 * the Developer-profile branch graph read as one system
 * (docs/design/stack-decision.md's cross-app "UI Branding" framing).
 */
const SWATCH_COLORS = [
  "#38bdf8", // sky-400
  "#34d399", // emerald-400
  "#fbbf24", // amber-400
  "#e879f9", // fuchsia-400
  "#fb7185", // rose-400
  "#a78bfa", // violet-400
  "#22d3ee", // cyan-400
  "#a3e635", // lime-400
] as const;

/**
 * Deterministically maps a label (repository name, file path, ...) to one
 * of `SWATCH_COLORS`. Same input always yields the same color -- a stable
 * per-item visual identity, not a guarantee of collision-free uniqueness
 * (there are only 8 colors; two different labels can and will share one).
 */
export function colorForLabel(label: string): string {
  let hash = 0;
  for (let index = 0; index < label.length; index += 1) {
    hash = (hash * 31 + label.charCodeAt(index)) | 0;
  }
  const paletteIndex = Math.abs(hash) % SWATCH_COLORS.length;
  return SWATCH_COLORS[paletteIndex]!;
}

/**
 * A short (<=4 char) uppercase label for a file's extension, for the file
 * tree's Artist-profile swatch (`../components/file-tree.tsx`). Falls back
 * to `"FILE"` for an extension-less name or a dotfile (leading dot only,
 * e.g. `.gitignore`) rather than guessing at a file type nothing on the
 * wire actually tells us.
 */
export function fileExtensionLabel(path: string): string {
  const name = path.split("/").pop() ?? path;
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === name.length - 1) {
    return "FILE";
  }
  return name.slice(dotIndex + 1).toUpperCase().slice(0, 4);
}
