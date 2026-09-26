import type { GraphNode, LaneAssignmentResult } from "../graph/lane-assignment.js";
import { GRAPH_ROW_HEIGHT } from "../graph/layout.js";

/**
 * v1 task 2's multi-lane branch graph: custom SVG, no charting library
 * (docs/design/stack-decision.md, "Components" -- "there is no off-the-shelf
 * component for this shape of data"). Purely a renderer: all graph
 * structure (lane numbers, which nodes connect to which) comes from
 * `graph`, built by `../graph/assemble-revision-graph.ts` +
 * `../graph/lane-assignment.ts`. This component only turns `(lane, row
 * index)` into pixels.
 *
 * Two edge kinds, drawn distinctly:
 * - **primary** (solid): a revision to its predecessor on the *same*
 *   branch -- always the same lane by construction (`lane-assignment.ts`),
 *   so this is always a plain vertical line.
 * - **cross-branch** (dashed): a branch's own root to its fork point on
 *   another branch, or a merge revision to the tip it merged in -- these
 *   connect *different* lanes, so they're drawn as a diagonal.
 */

const LANE_WIDTH = 20;
const LEFT_PADDING = 16;
const DOT_RADIUS = 5;

const LANE_COLORS = [
  "#38bdf8", // sky-400
  "#34d399", // emerald-400
  "#fbbf24", // amber-400
  "#e879f9", // fuchsia-400
  "#fb7185", // rose-400
  "#a78bfa", // violet-400
  "#22d3ee", // cyan-400
  "#a3e635", // lime-400
];

function laneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length]!;
}

interface RevisionGraphProps {
  graph: LaneAssignmentResult & { nodes: GraphNode[] };
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

export function RevisionGraph({ graph, selectedNodeId, onSelectNode }: RevisionGraphProps) {
  const { laneByNodeId, laneCount, nodes } = graph;
  const rowIndexById = new Map(nodes.map((node, index) => [node.id, index]));

  const x = (lane: number) => LEFT_PADDING + lane * LANE_WIDTH;
  const y = (rowIndex: number) => GRAPH_ROW_HEIGHT / 2 + rowIndex * GRAPH_ROW_HEIGHT;

  const width = LEFT_PADDING * 2 + Math.max(laneCount, 1) * LANE_WIDTH;
  const height = Math.max(nodes.length, 1) * GRAPH_ROW_HEIGHT;

  const edges = nodes.flatMap((node, index) => {
    const lane = laneByNodeId.get(node.id) ?? 0;
    const lines = [];

    if (node.primaryParentId) {
      const parentIndex = rowIndexById.get(node.primaryParentId);
      if (parentIndex !== undefined) {
        // Same lane by construction (lane-assignment.ts) -- a straight
        // vertical line, however many rows it spans.
        lines.push(
          <line
            key={`${node.id}-primary`}
            x1={x(lane)}
            y1={y(index)}
            x2={x(lane)}
            y2={y(parentIndex)}
            stroke={laneColor(lane)}
            strokeWidth={2}
          />,
        );
      }
    }

    if (node.crossBranchParentId) {
      const parentIndex = rowIndexById.get(node.crossBranchParentId);
      const parentLane = parentIndex !== undefined ? (laneByNodeId.get(node.crossBranchParentId) ?? lane) : undefined;
      if (parentIndex !== undefined && parentLane !== undefined) {
        lines.push(
          <line
            key={`${node.id}-cross`}
            x1={x(lane)}
            y1={y(index)}
            x2={x(parentLane)}
            y2={y(parentIndex)}
            stroke={laneColor(parentLane)}
            strokeWidth={2}
            strokeDasharray="4 3"
          />,
        );
      }
    }

    return lines;
  });

  const dots = nodes.map((node, index) => {
    const lane = laneByNodeId.get(node.id) ?? 0;
    const isSelected = node.id === selectedNodeId;
    return (
      <circle
        key={node.id}
        cx={x(lane)}
        cy={y(index)}
        r={isSelected ? DOT_RADIUS + 2 : DOT_RADIUS}
        fill={laneColor(lane)}
        stroke={isSelected ? "#f8fafc" : "none"}
        strokeWidth={isSelected ? 2 : 0}
        style={{ cursor: "pointer" }}
        onClick={() => onSelectNode(node.id)}
      >
        <title>{node.id}</title>
      </circle>
    );
  });

  return (
    <svg width={width} height={height} role="img" aria-label="Multi-lane branch graph">
      {edges}
      {dots}
    </svg>
  );
}
