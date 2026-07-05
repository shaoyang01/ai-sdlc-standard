// Skill Types — Agent Skill Registry Contracts
// =============================================
// Metadata-only type definitions for the Agent Skill Registry.
// Does not affect runtime execution, routing, or agent selection.

export type AgentName = "kimi" | "codex" | "hermes";

export type SkillExecutionMode =
  | "metadata_only"
  | "shadow"
  | "feature_flagged_real"
  | "not_implemented";

export type SkillRuntimeStatus =
  | "documented_skill_contract"
  | "runtime_connected"
  | "execution_connected"
  | "shadow_only"
  | "feature_flagged_real"
  | "not_implemented";

export type CanonicalSkillName = string;

export type AgentSkillBinding = Readonly<{
  skill: CanonicalSkillName;
  agent: AgentName;
  expectedNodes: ReadonlyArray<string>;
  expectedRequestTypes: ReadonlyArray<string>;
  executionMode: SkillExecutionMode;
  runtimeStatus: SkillRuntimeStatus;
  wiredToRuntime: boolean;
  skillFile?: string;
  contractFile?: string;
  manifestFile?: string;
  registryFile?: string;
  notes?: string;
}>;

export type SkillInvocation = Readonly<{
  requirementId: string;
  skill: CanonicalSkillName;
  agent: AgentName;
  node: string;
  requestType: string;
  input: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}>;

export type SkillInvocationValidation = Readonly<{
  valid: boolean;
  reason: string;
  binding?: AgentSkillBinding;
}>;
