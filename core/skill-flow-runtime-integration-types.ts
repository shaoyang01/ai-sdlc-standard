// Skill Flow Runtime Integration Types — Contract Only
// ======================================================
// Safe runtime integration contract for future Skill Flow Orchestrator.
// Disabled by default. Requires explicit feature flag for any activation.
// Does NOT change runtime behavior in this PR.

export type SkillFlowRuntimeIntegrationMode =
  | "disabled"
  | "shadow_only";

export type SkillFlowRuntimeIntegrationDecision =
  | "disabled_by_default"
  | "enabled_shadow_only"
  | "blocked_invalid_mode"
  | "blocked_missing_flag";

export interface SkillFlowRuntimeIntegrationConfig {
  enabled: boolean;
  mode: SkillFlowRuntimeIntegrationMode;
  source: "default" | "environment" | "test_override";
  rawMode?: string;
}

export interface SkillFlowRuntimeIntegrationRequest {
  requirementId: string;
  flowId: string;
  triggerNode?: string;
  reason: string;
  inputArtifacts: string[];
  mode: "shadow_only";
}

export interface SkillFlowRuntimeIntegrationResult {
  enabled: boolean;
  decision: SkillFlowRuntimeIntegrationDecision;
  mode: SkillFlowRuntimeIntegrationMode;
  requirementId: string;
  flowId?: string;
  shadowPlanCreated: boolean;
  shadowExecutionCreated: boolean;
  shadowPlanStageCount?: number;
  shadowExecutionStageCount?: number;
  shadowArtifactCount?: number;
  affectsRuntimeRouting: false;
  affectsAgentSelection: false;
  invokesRealAgents: false;
  invokesRealSkills: false;
  writesFiles: false;
  warnings: string[];
}
