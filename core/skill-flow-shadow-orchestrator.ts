// Skill Flow Shadow Orchestrator — Shadow-only Execution
// ========================================================
// Executes SkillFlowPlan objects in memory with deterministic shadow results.
// Does NOT call runtime, ExecutionGateway, real agents, or real skills.
// Does NOT write files, use DB, or call network.

import {
  SkillFlowPlan,
  SkillFlowStagePlan,
  SkillFlowExecutionResult,
  SkillFlowStageResult,
  SkillFlowShadowArtifact,
} from "./skill-flow-orchestrator-types";

// ─── Safety ───────────────────────────────────────────

function buildSafety() {
  return {
    shadowOnly: true as const,
    invokesRealAgents: false as const,
    invokesRealSkills: false as const,
    writesFiles: false as const,
    changesRuntimeBehavior: false as const,
    affectsRouting: false as const,
    affectsAgentSelection: false as const,
  };
}

// ─── Shadow executor ──────────────────────────────────

export function executeSkillFlowShadow(plan: SkillFlowPlan): SkillFlowExecutionResult {
  const warnings = [...plan.warnings];

  // Handle invalid/blocked plans
  if (plan.status === "invalid" || plan.status === "blocked") {
    return {
      flowId: plan.flowId,
      requirementId: plan.requirementId,
      mode: "shadow_only",
      status: "shadow_failed",
      stageResults: [],
      artifacts: [],
      safety: buildSafety(),
      warnings,
    };
  }

  const stageResults: SkillFlowStageResult[] = [];
  const allArtifacts: SkillFlowShadowArtifact[] = [];

  for (const stage of plan.stages) {
    const now = new Date().toISOString();

    switch (stage.kind) {
      case "skill": {
        const artifact: SkillFlowShadowArtifact = {
          id: `${plan.requirementId}:${plan.flowId}:${stage.index}:shadow_skill_output`,
          type: "shadow_skill_output",
          flowId: plan.flowId,
          stageId: stage.id,
          skill: stage.skill,
          stageName: stage.stageName,
          content: {
            mode: "shadow_only",
            skill: stage.skill,
            flowId: plan.flowId,
            stageName: stage.stageName,
            requirementId: plan.requirementId,
            inputArtifacts: stage.inputArtifacts,
            outputArtifacts: stage.outputArtifacts,
            downstreamConsumers: stage.downstreamConsumers,
            executionRequestPreview: stage.executionRequestPreview ?? null,
            message: "Shadow skill execution only; no real skill invoked",
          },
        };

        stageResults.push({
          stageId: stage.id,
          index: stage.index,
          kind: stage.kind,
          flowId: plan.flowId,
          skill: stage.skill,
          stageName: stage.stageName,
          agent: stage.selectedAgent,
          status: "shadow_success",
          output: {
            result: `shadow_${stage.skill ?? stage.stageName}_completed`,
            mode: "shadow_only",
          },
          artifacts: [artifact],
          startedAt: now,
          completedAt: now,
          notes: ["Shadow execution only"],
        });
        allArtifacts.push(artifact);
        break;
      }

      case "controller": {
        stageResults.push({
          stageId: stage.id,
          index: stage.index,
          kind: stage.kind,
          flowId: plan.flowId,
          stageName: stage.stageName,
          status: "shadow_success",
          output: {
            result: `shadow_controller_${stage.stageName}_completed`,
            mode: "shadow_only",
            message: "Shadow controller stage; no skill invoked",
          },
          artifacts: [],
          startedAt: now,
          completedAt: now,
          notes: ["Controller stage — no artifact produced"],
        });
        break;
      }

      case "skillless_agent_execution": {
        const artifact: SkillFlowShadowArtifact = {
          id: `${plan.requirementId}:${plan.flowId}:${stage.index}:shadow_skillless_output`,
          type: "shadow_skillless_output",
          flowId: plan.flowId,
          stageId: stage.id,
          stageName: stage.stageName,
          content: {
            mode: "shadow_only",
            skill: null,
            stageName: "DIRECT_IMPLEMENTATION_AGENT_EXECUTION",
            agent: stage.selectedAgent,
            inputArtifacts: stage.inputArtifacts,
            outputArtifacts: stage.outputArtifacts,
            message: "Shadow skillless agent execution only; no real agent invoked",
          },
        };

        stageResults.push({
          stageId: stage.id,
          index: stage.index,
          kind: stage.kind,
          flowId: plan.flowId,
          stageName: stage.stageName,
          agent: stage.selectedAgent,
          status: "shadow_success",
          output: {
            result: "shadow_skillless_agent_execution_completed",
            mode: "shadow_only",
          },
          artifacts: [artifact],
          startedAt: now,
          completedAt: now,
          notes: ["Skillless agent execution — no skill invoked"],
        });
        allArtifacts.push(artifact);
        break;
      }
    }
  }

  return {
    flowId: plan.flowId,
    requirementId: plan.requirementId,
    mode: "shadow_only",
    status: "shadow_success",
    stageResults,
    artifacts: allArtifacts,
    safety: buildSafety(),
    warnings,
  };
}
