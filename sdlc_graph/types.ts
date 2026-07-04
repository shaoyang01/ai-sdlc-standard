// SDLC Graph Types — Declarative
// ===============================
// Pure type definitions. No logic.

export type NodeType =
  | "requirement-summary"
  | "tech-design"
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
