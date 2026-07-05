// Skill Flow Runtime Integration Config
// =======================================
// Feature-flagged runtime integration config helper.
// Disabled by default. Only "shadow" enables shadow-only integration.

import { SkillFlowRuntimeIntegrationConfig } from "./skill-flow-runtime-integration-types";

export function getSkillFlowRuntimeIntegrationConfig(
  env: NodeJS.ProcessEnv = process.env
): SkillFlowRuntimeIntegrationConfig {
  const raw = env.SDLC_SKILL_FLOW_RUNTIME_INTEGRATION;
  if (raw === undefined || raw === "") {
    return { enabled: false, mode: "disabled", source: "default" };
  }
  if (raw === "disabled") {
    return { enabled: false, mode: "disabled", source: "environment" };
  }
  if (raw === "shadow") {
    return { enabled: true, mode: "shadow_only", source: "environment" };
  }
  return { enabled: false, mode: "disabled", source: "environment", rawMode: raw };
}
