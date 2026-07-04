// LOOP Types — Deterministic Workflow Engine
// ===========================================
// Pure data types. No intelligence, no inference.

export type DocFlowNode = "requirement-summary" | "tech-design" | "review" | "implementation" | "validation";

export type LoopAgent = "kimi" | "codex" | "hermes";

export type ExecutionMode = "direct" | "speckit";

export interface LoopContext {
  node: DocFlowNode;
  requirement_id: string;
  payload: Record<string, unknown>;
  execution_mode: ExecutionMode;
  history: LoopHistoryEntry[];
}

export interface LoopHistoryEntry {
  node: DocFlowNode;
  agent: LoopAgent;
  started_at: string;
  completed_at: string;
  status: "success" | "failure";
  error: string | null;
}

export interface LoopResult {
  next_node: DocFlowNode | null;
  agent: LoopAgent;
  payload: Record<string, unknown>;
}

// Static flow table entry
export interface FlowTableEntry {
  current: DocFlowNode;
  next: DocFlowNode | null; // null = terminal
}

// Agent mapping entry
export interface AgentMapEntry {
  node: DocFlowNode;
  agent: LoopAgent;
}
