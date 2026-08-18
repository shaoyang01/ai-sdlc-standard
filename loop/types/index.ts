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

/**
 * @deprecated C01 WP-2 (Decision-020/023): static node->agent binding
 * conflicts with capability decoupling. Node selection must use
 * NodeCapabilityContract; choosing the executing agent is the binding
 * layer's job (WP-3). Kept only for legacy engine compatibility.
 */
// Agent mapping entry
export interface AgentMapEntry {
  node: DocFlowNode;
  agent: LoopAgent;
}

// ── Node Capability Contract (C01 WP-2) ──
// Agent-neutral capability surface. A node declares the capability it needs;
// the binding layer (WP-3) chooses which agent executes it. No agent name may
// appear in any capability contract field.

export type NodeCapabilityId =
  | "requirement-intake"
  | "tech-design"
  | "solution-challenge"
  | "solution-review"
  | "implementation"
  | "code-review"
  | "test-validation";

export const NODE_CAPABILITY_IDS: readonly NodeCapabilityId[] = [
  "requirement-intake",
  "tech-design",
  "solution-challenge",
  "solution-review",
  "implementation",
  "code-review",
  "test-validation",
] as const;

export interface NodeCapabilityContract {
  capability: NodeCapabilityId;
  title: string;
  inputArtifacts: readonly string[];
  outputArtifact: string;
  gate: string;
  sideEffectBoundary: string;
  prohibited: readonly string[];
}
