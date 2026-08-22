// LOOP Types — Deterministic Workflow Engine
// ===========================================
// Pure data types. No intelligence, no inference.

export type DocFlowNode = "requirement-summary" | "tech-design" | "review" | "implementation" | "validation";

export type LoopAgent = "kimi" | "codex" | "hermes";

/**
 * @deprecated C02-WP3.5 (Decision-044): Direct/Speckit path split is
 * cancelled; solution-gate depth-tier decisions replace path selection.
 * Kept only until runtime consumers are rebaselined (WP3.5-B/C); the residue
 * audit (WP3.5-F/WP6) requires its removal from active code.
 */
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
 * Agent mapping entry.
 */
export interface AgentMapEntry {
  node: DocFlowNode;
  agent: LoopAgent;
}

// ── Node Capability Contract (v2 single-rail, C02-WP3.5) ──
// Agent-neutral capability surface. A node declares the capability it needs;
// the binding layer (WP-3) chooses which agent executes it. No agent name may
// appear in any capability contract field.
//
// v2 canonical chain (Decision-044):
//   requirement-intake → solution-design → solution-gate → task-planning
//   → implementation → code-review → knowledge-sync
// solution-gate is ONE node with two execution roles (adversarial_scan /
// formal_verdict) that must be bound to different agents (Decision-044
// binding-level separation).

export type NodeCapabilityId =
  | "requirement-intake"
  | "solution-design"
  | "solution-gate"
  | "task-planning"
  | "implementation"
  | "code-review"
  | "knowledge-sync";

export const NODE_CAPABILITY_IDS: readonly NodeCapabilityId[] = [
  "requirement-intake",
  "solution-design",
  "solution-gate",
  "task-planning",
  "implementation",
  "code-review",
  "knowledge-sync",
] as const;

export type CapabilityExecutionRole = "primary" | "adversarial_scan" | "formal_verdict";

export interface NodeCapabilityContract {
  capability: NodeCapabilityId;
  title: string;
  /** solution-gate 固定为 [adversarial_scan, formal_verdict]；其余节点固定为 [primary]。 */
  executionRoles: readonly CapabilityExecutionRole[];
  inputArtifacts: readonly string[];
  outputArtifact: string;
  gate: string;
  sideEffectBoundary: string;
  prohibited: readonly string[];
}
