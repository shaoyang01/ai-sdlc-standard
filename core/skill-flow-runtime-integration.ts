// Skill Flow Runtime Integration — Decision Helpers
// ===================================================
// Pure decision helpers for future runtime integration.
// Does NOT call runtime, ExecutionGateway, real agents, or real skills.
// Does NOT write files or affect routing.

import { planFlowById } from "./skill-flow-orchestrator";
import { executeSkillFlowShadow } from "./skill-flow-shadow-orchestrator";
import {
  SkillFlowRuntimeIntegrationConfig,
  SkillFlowRuntimeIntegrationRequest,
  SkillFlowRuntimeIntegrationResult,
} from "./skill-flow-runtime-integration-types";

export function decideSkillFlowRuntimeIntegration(
  config: SkillFlowRuntimeIntegrationConfig,
  request: SkillFlowRuntimeIntegrationRequest
): SkillFlowRuntimeIntegrationResult {
  const base: SkillFlowRuntimeIntegrationResult = {
    enabled: false,
    decision: "disabled_by_default",
    mode: "disabled",
    requirementId: request.requirementId,
    flowId: request.flowId,
    shadowPlanCreated: false,
    shadowExecutionCreated: false,
    affectsRuntimeRouting: false,
    affectsAgentSelection: false,
    invokesRealAgents: false,
    invokesRealSkills: false,
    writesFiles: false,
    warnings: [],
  };

  // Invalid mode
  if (config.rawMode) {
    return {
      ...base,
      decision: "blocked_invalid_mode",
      warnings: [`Invalid SDLC_SKILL_FLOW_RUNTIME_INTEGRATION value: "${config.rawMode}"`],
    };
  }

  // Explicitly disabled
  if (!config.enabled && config.source === "environment") {
    return {
      ...base,
      decision: "blocked_missing_flag",
      warnings: ["Skill flow runtime integration is not enabled"],
    };
  }

  // Default disabled
  if (!config.enabled) {
    return {
      ...base,
      decision: "disabled_by_default",
      warnings: ["Skill flow runtime integration is disabled by default"],
    };
  }

  // Shadow only enabled
  if (config.mode === "shadow_only") {
    const plan = planFlowById({
      flowId: request.flowId,
      requirementId: request.requirementId,
      inputArtifacts: request.inputArtifacts,
    });

    const execution = executeSkillFlowShadow(plan);

    return {
      ...base,
      enabled: true,
      decision: "enabled_shadow_only",
      mode: "shadow_only",
      requirementId: request.requirementId,
      flowId: request.flowId,
      shadowPlanCreated: plan.status === "planned",
      shadowExecutionCreated: execution.status === "shadow_success",
      shadowPlanStageCount: plan.stages.length,
      shadowExecutionStageCount: execution.stageResults.length,
      shadowArtifactCount: execution.artifacts.length,
      warnings: [...plan.warnings, ...execution.warnings],
    };
  }

  return base;
}

export function previewSkillFlowRuntimeIntegration(
  config: SkillFlowRuntimeIntegrationConfig,
  request: SkillFlowRuntimeIntegrationRequest
): SkillFlowRuntimeIntegrationResult {
  return decideSkillFlowRuntimeIntegration(config, request);
}
