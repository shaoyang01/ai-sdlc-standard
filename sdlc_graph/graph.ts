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
  { id: "solution-challenge",    label: "Solution Challenge",    order: 2 },
  { id: "review",                label: "Review",                order: 3 },
  { id: "implementation",        label: "Implementation",        order: 4 },
  { id: "validation",            label: "Validation",            order: 5 },
];

export const SDLC_EDGES: GraphEdge[] = [
  { from: "requirement-summary", to: "tech-design" },
  { from: "tech-design",           to: "solution-challenge" },
  // Solution-challenge: READY_FOR_GATE → review, NEEDS_REVISION → tech-design
  { from: "solution-challenge",    to: "review",              condition: "PASS" },
  { from: "solution-challenge",    to: "tech-design",         condition: "FAIL" },
  // Review: PASS → implementation, FAIL → tech-design (feedback loop)
  { from: "review",                to: "implementation",      condition: "PASS" },
  { from: "review",                to: "tech-design",         condition: "FAIL" },
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
