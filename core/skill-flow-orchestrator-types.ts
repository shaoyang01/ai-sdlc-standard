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
