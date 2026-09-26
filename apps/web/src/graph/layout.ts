/**
 * Shared pixel row height between `RevisionGraph` (SVG) and `RevisionList`
 * (plain rows) -- v1 task 2's "rows should align with the revision list
 * beside it" requirement. Both components import this same constant
 * rather than each hardcoding their own, so they can't silently drift.
 */
export const GRAPH_ROW_HEIGHT = 28;
