// SDLC Graph Kernel — Pure Declarative Graph
// ===========================================
// PURE DATA ONLY. No execution logic. No flow decisions.
// Nodes and edges are the single source of truth for graph structure.
// Transition logic lives in transitions.ts (separate layer).

import { NodeType, GraphNode, GraphEdge } from "./types";

// ─── Graph Definition (DATA ONLY) ────────────────────

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

// ─── Pure Data Getters (NO logic, NO decisions) ──────

export function getNode(id: NodeType): GraphNode | undefined {
  return SDLC_NODES.find((n) => n.id === id);
}

export function getAllNodes(): GraphNode[] {
  return [...SDLC_NODES];
}

export function getEdge(from: NodeType): GraphEdge | undefined {
  return SDLC_EDGES.find((e) => e.from === from);
}
