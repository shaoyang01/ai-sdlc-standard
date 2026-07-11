// SDLC Graph Types — Declarative
// ===============================
// Pure type definitions. No logic.

export type NodeType =
  | "requirement-summary"
  | "tech-design"
  | "solution-challenge"
  | "review"
  | "implementation"
  | "validation";

export interface GraphNode {
  id: NodeType;
  label: string;
  order: number;
}

export interface GraphEdge {
  from: NodeType;
  to: NodeType;
  condition?: "PASS" | "FAIL";  // optional: only for conditional edges
}

export interface ConditionalEdge extends GraphEdge {
  condition: "PASS" | "FAIL";
}

export interface GraphContext {
  requirement_id: string;
  current_node: NodeType;
  payload: Record<string, unknown>;
  history: NodeRecord[];
}

export interface NodeRecord {
  node: NodeType;
  entered_at: string;
  completed_at: string;
  status: "pending" | "completed" | "failed";
}
