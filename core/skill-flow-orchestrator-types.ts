// Skill Flow Orchestrator Contract Types
// ========================================
// Metadata-only types for future skill flow orchestration.
// Plan-only in this PR — no execution, no agent calls, no skill invocation.

import { AgentName } from "./skill-types";

export type SkillFlowInvocationMode =
  | "plan_only"
  | "shadow_only"
  | "future_real_execution";

export type SkillFlowPlanStatus =
  | "planned"
  | "blocked"
  | "invalid";

export type SkillFlowStageKind =
  | "skill"
  | "controller"
  | "skillless_agent_execution";

export type SkillFlowStageStatus =
  | "planned"
  | "skipped"
  | "blocked";

export interface SkillFlowInvocation {
  flowId: string;
  entrySkill?: string;
  requirementId: string;
  mode: "plan_only";
  inputArtifacts: string[];
  context?: Readonly<Record<string, unknown>>;
}

export interface SkillFlowStagePlan {
  id: string;
  index: number;
  kind: SkillFlowStageKind;
  flowId: string;
  skill?: string;
  stageName: string;
  role?: string;
  eligibleAgents: AgentName[];
  selectedAgent?: AgentName;
  inputArtifacts: string[];
  outputArtifacts: string[];
  downstreamConsumers: string[];
  status: SkillFlowStageStatus;
  executionRequestPreview?: {
    type: string;
    agent: AgentName;
    skill?: string;
    flowId: string;
    requirementId: string;
  };
  notes: string[];
}

export interface SkillFlowPlan {
  flowId: string;
  requirementId: string;
  entrySkill?: string;
  mode: "plan_only";
  status: SkillFlowPlanStatus;
  stages: SkillFlowStagePlan[];
  safety: {
    planOnly: true;
    invokesAgents: false;
    invokesSkills: false;
    changesRuntimeBehavior: false;
    affectsRouting: false;
    affectsAgentSelection: false;
  };
  warnings: string[];
}

// ─── Shadow Execution Result Types ────────────────────

export type SkillFlowStageResultStatus =
  | "shadow_success"
  | "shadow_skipped"
  | "shadow_blocked";

export interface SkillFlowStageResult {
  stageId: string;
  index: number;
  kind: SkillFlowStageKind;
  flowId: string;
  skill?: string;
  stageName: string;
  agent?: AgentName;
  status: SkillFlowStageResultStatus;
  output: Readonly<Record<string, unknown>>;
  artifacts: ReadonlyArray<SkillFlowShadowArtifact>;
  startedAt: string;
  completedAt: string;
  notes: string[];
}

export interface SkillFlowShadowArtifact {
  id: string;
  type:
    | "shadow_skill_output"
    | "shadow_skillless_output"
    | "shadow_controller_output";
  flowId: string;
  stageId: string;
  skill?: string;
  stageName: string;
  content: Readonly<Record<string, unknown>>;
}

export interface SkillFlowExecutionResult {
  flowId: string;
  requirementId: string;
  mode: "shadow_only";
  status: "shadow_success" | "shadow_partial" | "shadow_failed";
  stageResults: ReadonlyArray<SkillFlowStageResult>;
  artifacts: ReadonlyArray<SkillFlowShadowArtifact>;
  safety: {
    shadowOnly: true;
    invokesRealAgents: false;
    invokesRealSkills: false;
    writesFiles: false;
    changesRuntimeBehavior: false;
    affectsRouting: false;
    affectsAgentSelection: false;
  };
  warnings: string[];
}
