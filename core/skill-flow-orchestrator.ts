// Skill Flow Orchestrator — Plan-only Contract
// ==============================================
// Pure planning helpers for future skill flow orchestration.
// Does NOT execute skills, call agents, change runtime, or affect routing.
// Uses flow-stage based Agent Skill Registry as source of truth.

import {
  SkillFlowInvocation,
  SkillFlowPlan,
  SkillFlowPlanStatus,
  SkillFlowStagePlan,
  SkillFlowStageKind,
} from "./skill-flow-orchestrator-types";
import {
  getSkillsByFlowId,
  getSkillFlowBinding,
} from "./agent-skill-registry";
import { AgentName } from "./skill-types";

// ─── Request type defaults (metadata-only) ────────────

function defaultRequestType(stageName: string): string {
  const lower = stageName.toLowerCase();
  if (lower.includes("requirement") || lower.includes("spec") || lower.includes("doc") || lower.includes("plan") || lower.includes("tasks")) return "llm_task";
  if (lower.includes("review") || lower.includes("analyze") || lower.includes("gate") || lower.includes("clarify") || lower.includes("reconcile")) return "review";
  if (lower.includes("implement")) return "code_generation";
  if (lower.includes("test") || lower.includes("validat") || lower.includes("feedback") || lower.includes("sync")) return "validation";
  return "llm_task";
}

// ─── Stage builders ───────────────────────────────────

function buildSkillStage(
  skill: string,
  flowId: string,
  requirementId: string,
  index: number,
  selectedAgent?: AgentName
): SkillFlowStagePlan {
  const binding = getSkillFlowBinding(skill);
  const agent = selectedAgent ?? binding?.eligibleAgents[0] ?? "codex";
  return {
    id: `${flowId}:${index}:${skill}`,
    index,
    kind: "skill",
    flowId,
    skill,
    stageName: binding?.stage ?? skill,
    role: binding?.role,
    eligibleAgents: binding?.eligibleAgents ?? [],
    selectedAgent: agent,
    inputArtifacts: binding?.primaryInputArtifacts ?? [],
    outputArtifacts: binding?.primaryOutputArtifacts ?? [],
    downstreamConsumers: binding?.downstreamConsumers ?? [],
    status: "planned",
    executionRequestPreview: {
      type: defaultRequestType(binding?.stage ?? skill),
      agent,
      skill,
      flowId,
      requirementId,
    },
    notes: [],
  };
}

function buildControllerStage(
  name: string,
  flowId: string,
  requirementId: string,
  index: number
): SkillFlowStagePlan {
  return {
    id: `${flowId}:${index}:${name}`,
    index,
    kind: "controller",
    flowId,
    stageName: name,
    eligibleAgents: [],
    inputArtifacts: [],
    outputArtifacts: [],
    downstreamConsumers: [],
    status: "planned",
    notes: [`Controller stage: ${name}`],
  };
}

function buildSkilllessAgentExecutionStage(
  flowId: string,
  requirementId: string,
  index: number,
  agent: AgentName = "codex"
): SkillFlowStagePlan {
  return {
    id: `${flowId}:${index}:DIRECT_IMPLEMENTATION_AGENT_EXECUTION`,
    index,
    kind: "skillless_agent_execution",
    flowId,
    stageName: "DIRECT_IMPLEMENTATION_AGENT_EXECUTION",
    eligibleAgents: [agent],
    selectedAgent: agent,
    inputArtifacts: ["01-技术方案", "02-方案审核"],
    outputArtifacts: ["Code changes"],
    downstreamConsumers: ["sdlc-implementation"],
    status: "planned",
    executionRequestPreview: {
      type: "code_generation",
      agent,
      flowId,
      requirementId,
    },
    notes: ["Direct implementation is skillless agent execution", "No sdlc-* skill is invoked"],
  };
}

// ─── Flow definitions ─────────────────────────────────

const FLOW_DEFINITIONS: Record<string, {
  entrySkill?: string;
  leadSkill?: string;
  skills: string[];
  controllers: string[];
  hasSkilllessAgent: boolean;
}> = {
  main_docflow: {
    entrySkill: "sdlc-requirement-intake",
    skills: ["sdlc-requirement-intake", "sdlc-solution-design", "sdlc-solution-gate", "sdlc-task-planning"],
    controllers: [],
    hasSkilllessAgent: false,
  },
  direct_implementation_path: {
    skills: ["sdlc-implementation", "sdlc-code-review", "sdlc-knowledge-sync"],
    controllers: [],
    hasSkilllessAgent: true,
  },
};

// ─── Build safety ─────────────────────────────────────

function buildSafety() {
  return {
    planOnly: true as const,
    invokesAgents: false as const,
    invokesSkills: false as const,
    changesRuntimeBehavior: false as const,
    affectsRouting: false as const,
    affectsAgentSelection: false as const,
  };
}

// ─── Public helpers ───────────────────────────────────

export function planSkillFlow(invocation: SkillFlowInvocation): SkillFlowPlan {
  return planFlowById({
    flowId: invocation.flowId,
    requirementId: invocation.requirementId,
    inputArtifacts: invocation.inputArtifacts,
  });
}

export function planFlowById(input: {
  flowId: string;
  requirementId: string;
  inputArtifacts?: string[];
}): SkillFlowPlan {
  const def = FLOW_DEFINITIONS[input.flowId];
  if (!def) {
    return {
      flowId: input.flowId,
      requirementId: input.requirementId,
      mode: "plan_only",
      status: "invalid",
      stages: [],
      safety: buildSafety(),
      warnings: [`Unknown flow "${input.flowId}"`],
    };
  }

  // Check for missing bindings
  const allSkills = def.leadSkill ? [def.leadSkill, ...def.skills] : def.skills;
  const missingSkills = allSkills.filter((s) => !getSkillFlowBinding(s));
  if (missingSkills.length > 0) {
    return {
      flowId: input.flowId,
      requirementId: input.requirementId,
      entrySkill: def.entrySkill,
      mode: "plan_only",
      status: "blocked",
      stages: [],
      safety: buildSafety(),
      warnings: missingSkills.map((s) => `Missing skill binding: ${s}`),
    };
  }

  const stages: SkillFlowStagePlan[] = [];
  let index = 0;

  // Lead skill (placed first, before controllers — for speckit)
  if (def.leadSkill) {
    stages.push(buildSkillStage(def.leadSkill, input.flowId, input.requirementId, index++));
  }

  // Controller stages
  for (const ctrl of def.controllers) {
    stages.push(buildControllerStage(ctrl, input.flowId, input.requirementId, index++));
  }

  // Skill stages
  for (const skill of def.skills) {
    stages.push(buildSkillStage(skill, input.flowId, input.requirementId, index++));
  }

  // Skillless agent execution (after skills, for direct implementation)
  if (def.hasSkilllessAgent) {
    stages.unshift(buildSkilllessAgentExecutionStage(input.flowId, input.requirementId, 0));
    // Re-index after unshift
    stages.forEach((s, i) => { s.index = i; });
  }

  return {
    flowId: input.flowId,
    requirementId: input.requirementId,
    entrySkill: def.entrySkill,
    mode: "plan_only",
    status: "planned",
    stages,
    safety: buildSafety(),
    warnings: [],
  };
}

export function planGlobalEntryFlow(input: {
  requirementId: string;
  inputArtifacts?: string[];
}): SkillFlowPlan {
  return planFlowById({ flowId: "main_docflow", ...input });
}

export function planDirectImplementationPath(input: {
  requirementId: string;
  inputArtifacts?: string[];
}): SkillFlowPlan {
  return planFlowById({ flowId: "direct_implementation_path", ...input });
}
