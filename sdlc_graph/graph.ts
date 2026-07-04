// SDLC Graph Kernel — Pure Declarative Graph
// ===========================================
// Defines the static SDLC workflow graph.
// Does NOT execute anything. Does NOT replace runtime.
// Purely declarative — nodes, edges, transitions only.

import { NodeType, GraphNode, GraphEdge } from "./types";
import { getNextNode } from "./transitions";

// ─── Graph Definition ────────────────────────────────

export const SDLC_NODES: GraphNode[] = [
  { id: "requirement-summary", label: "Requirement Summary", order: 0 },
  { id: "tech-design",           label: "Tech Design",           order: 1 },
  { id: "review",                label: "Review",                order: 2 },
  { id: "implementation",        label: "Implementation",        order: 3 },
  { id: "validation",            label: "Validation",            order: 4 },
];

export const SDLC_EDGES: GraphEdge[] = [
  { from: "requirement-summary", to: "tech-design" },
  { from: "tech-design",           to: "review" },
  { from: "review",                to: "implementation" },
  { from: "implementation",        to: "validation" },
];

// ─── Graph Queries (read-only) ─────────────────────────

export function getNode(id: NodeType): GraphNode | undefined {
  return SDLC_NODES.find((n) => n.id === id);
}

export function getAllNodes(): GraphNode[] {
  return [...SDLC_NODES];
}

export function getEdge(from: NodeType): GraphEdge | undefined {
  return SDLC_EDGES.find((e) => e.from === from);
}

export function isTerminal(node: NodeType): boolean {
  return getNextNode(node) === null;
}
