// Regression Test — Skill Flow Runtime Integration Contract
// ==========================================================
// Verifies the runtime integration contract is disabled by default,
// shadow mode requires explicit flag, and no runtime behavior changes.
// No runtime, no Gateway, no real agents, no real skills.

import { getSkillFlowRuntimeIntegrationConfig } from "../core/skill-flow-runtime-integration-config";
import { decideSkillFlowRuntimeIntegration } from "../core/skill-flow-runtime-integration";

const request = {
  requirementId: "REQ-SFI",
  flowId: "main_docflow",
  reason: "test shadow integration",
  inputArtifacts: [],
  mode: "shadow_only" as const,
};

async function test() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      passed++;
      console.log(`  ✓ ${message}`);
    } else {
      failed++;
      console.error(`  ✗ ${message}`);
    }
  }

  console.log("Skill Flow Runtime Integration Contract Test\n");

  // ── Test 1: Default disabled ──
  console.log("Test 1: Default disabled");
  const defaultConfig = getSkillFlowRuntimeIntegrationConfig({});
  assert(defaultConfig.enabled === false, "config.enabled is false");
  assert(defaultConfig.mode === "disabled", "config.mode is disabled");
  assert(defaultConfig.source === "default", "source is default");

  const defaultResult = decideSkillFlowRuntimeIntegration(defaultConfig, request);
  assert(defaultResult.decision === "disabled_by_default", "decision is disabled_by_default");
  assert(defaultResult.shadowPlanCreated === false, "shadowPlanCreated is false");
  assert(defaultResult.shadowExecutionCreated === false, "shadowExecutionCreated is false");
  assert(defaultResult.affectsRuntimeRouting === false, "does not affect routing");
  assert(defaultResult.invokesRealAgents === false, "does not invoke real agents");
  assert(defaultResult.invokesRealSkills === false, "does not invoke real skills");
  assert(defaultResult.writesFiles === false, "does not write files");
  console.log("");

  // ── Test 2: Explicit disabled ──
  console.log("Test 2: Explicit disabled");
  const disabledConfig = getSkillFlowRuntimeIntegrationConfig({
    SDLC_SKILL_FLOW_RUNTIME_INTEGRATION: "disabled",
  });
  assert(disabledConfig.enabled === false, "explicit disabled: enabled false");
  const disabledResult = decideSkillFlowRuntimeIntegration(disabledConfig, request);
  assert(disabledResult.decision === "blocked_missing_flag", "explicit disabled → blocked_missing_flag");
  assert(disabledResult.shadowPlanCreated === false, "no plan created");
  console.log("");

  // ── Test 3: Shadow enabled ──
  console.log("Test 3: Shadow enabled");
  const shadowConfig = getSkillFlowRuntimeIntegrationConfig({
    SDLC_SKILL_FLOW_RUNTIME_INTEGRATION: "shadow",
  });
  assert(shadowConfig.enabled === true, "shadow: enabled true");
  assert(shadowConfig.mode === "shadow_only", "shadow: mode is shadow_only");
  assert(shadowConfig.source === "environment", "shadow: source is environment");

  const shadowResult = decideSkillFlowRuntimeIntegration(shadowConfig, request);
  assert(shadowResult.decision === "enabled_shadow_only", "decision is enabled_shadow_only");
  assert(shadowResult.enabled === true, "result enabled true");
  assert(shadowResult.mode === "shadow_only", "result mode shadow_only");
  assert(shadowResult.shadowPlanCreated === true, "shadow plan created");
  assert(shadowResult.shadowExecutionCreated === true, "shadow execution created");
  assert(shadowResult.shadowPlanStageCount! > 0, "plan has stages");
  assert(shadowResult.shadowExecutionStageCount! > 0, "execution has stage results");
  assert(shadowResult.shadowArtifactCount! > 0, "execution has artifacts");
  assert(shadowResult.affectsRuntimeRouting === false, "does not affect routing");
  assert(shadowResult.affectsAgentSelection === false, "does not affect agent selection");
  assert(shadowResult.invokesRealAgents === false, "does not invoke real agents");
  assert(shadowResult.invokesRealSkills === false, "does not invoke real skills");
  assert(shadowResult.writesFiles === false, "does not write files");
  // Audit trail
  const audit = shadowResult.auditTrail;
  assert(audit !== undefined, "audit trail exists");
  assert(audit!.featureFlag === "SDLC_SKILL_FLOW_RUNTIME_INTEGRATION", "audit feature flag");
  assert(audit!.featureFlagValue === "shadow", "audit feature flag value");
  assert(audit!.flowId === "main_docflow", "audit flowId");
  assert(audit!.inputArtifactCount === 0, "audit input artifact count");
  assert(audit!.affectsRuntimeRouting === false, "audit no routing");
  assert(audit!.invokesRealAgents === false, "audit no real agents");
  assert(audit!.invokesRealSkills === false, "audit no real skills");
  assert(audit!.writesFiles === false, "audit no file writes");
  console.log("");

  // ── Test 4: Invalid mode blocked ──
  console.log("Test 4: Invalid mode blocked");
  const invalidConfig = getSkillFlowRuntimeIntegrationConfig({
    SDLC_SKILL_FLOW_RUNTIME_INTEGRATION: "real",
  });
  assert(invalidConfig.enabled === false, "invalid mode: enabled false");
  assert(invalidConfig.rawMode === "real", "rawMode captured");
  const invalidResult = decideSkillFlowRuntimeIntegration(invalidConfig, request);
  assert(invalidResult.decision === "blocked_invalid_mode", "decision is blocked_invalid_mode");
  assert(invalidResult.shadowPlanCreated === false, "no plan created");
  assert(invalidResult.shadowExecutionCreated === false, "no execution created");
  assert(invalidResult.warnings.some((w) => w.includes("real")), "warning includes invalid value");
  console.log("");

  // ── Test 5: Unknown flow under shadow flag preserves warnings ──
  console.log("Test 6: Unknown flow under shadow flag preserves warnings");
  const unknownConfig = getSkillFlowRuntimeIntegrationConfig({
    SDLC_SKILL_FLOW_RUNTIME_INTEGRATION: "shadow",
  });
  const unknownResult = decideSkillFlowRuntimeIntegration(unknownConfig, {
    requirementId: "REQ-UNKNOWN",
    flowId: "unknown_flow",
    reason: "test unknown flow",
    inputArtifacts: [],
    mode: "shadow_only",
  });
  assert(unknownResult.decision === "enabled_shadow_only", "still enabled_shadow_only");
  assert(unknownResult.shadowPlanCreated === false, "plan not created for unknown flow");
  assert(unknownResult.shadowExecutionCreated === false, "execution not created for unknown flow");
  assert(unknownResult.warnings.some((w) => w.includes("Unknown flow")), "warnings include Unknown flow");
  assert(unknownResult.affectsRuntimeRouting === false, "does not affect routing");
  assert(unknownResult.invokesRealAgents === false, "does not invoke real agents");
  assert(unknownResult.invokesRealSkills === false, "does not invoke real skills");
  assert(unknownResult.writesFiles === false, "does not write files");
  // Unknown flow audit
  const uAudit = unknownResult.auditTrail;
  assert(uAudit !== undefined, "unknown flow audit exists");
  assert(uAudit!.shadowPlanCreated === false, "audit plan not created");
  assert(uAudit!.shadowExecutionCreated === false, "audit execution not created");
  assert(uAudit!.warnings.some((w: string) => w.includes("Unknown flow")), "audit warnings include Unknown flow");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
