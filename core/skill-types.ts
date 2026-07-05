// Skill Types — Flow-Stage Skill Registry Contracts
// ===================================================
// Skills are modeled as flow nodes with positions, artifacts, and handoffs.
// NOT as runtime node handlers. NOT as (agent, node, requestType) mappings.
// Metadata-only. Does not affect runtime execution, routing, or agent selection.

export type AgentName = "kimi" | "codex" | "hermes";

export type SkillRuntimeStatus =
  | "documented_skill_contract"
  | "metadata_only"
  | "future_orchestrator_only";

export type SkillFlowRole =
  | "global_entry"
  | "subflow_entry"
  | "subflow_normalizer"
  | "flow_controller"
  | "flow_internal"
  | "post_execution_recorder"
  | "utility";

export type SkillFlowType =
  | "main_docflow"
  | "direct_implementation_path"
  | "speckit_pipeline"
  | "code_review_subflow"
  | "test_feedback_subflow"
  | "cross_cutting";

export interface SkillFlowBinding {
  skill: string;
  role: SkillFlowRole;
  flowIds: string[];
  flowTypes: SkillFlowType[];
  stage: string;
  category: string;
  primaryInputArtifacts: string[];
  primaryOutputArtifacts: string[];
  downstreamConsumers: string[];
  eligibleAgents: AgentName[];
  runtimeInvoked: false;
  executionMode: "metadata_only";
  runtimeStatus: SkillRuntimeStatus;
  evidence: string[];
  confidence: "high" | "medium" | "low";
}

export interface SkillInvocation {
  skill: string;
  flowId?: string;
  expectedInputArtifacts?: string[];
}

export interface SkillInvocationValidation {
  attempted: boolean;
  valid: boolean;
  reason: string;
  binding?: SkillFlowBinding;
}
