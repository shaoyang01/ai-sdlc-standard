// Regression Test — Hermes Gateway Real Dispatch Phase-2 Controlled Enablement Plan
// ===================================================================================
// Plan-only. No Runtime, no Gateway, no CLI.

import {
  HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_CONTROLLED_ENABLEMENT_PLAN,
} from "../execution/hermes-gateway-real-dispatch-phase-2-controlled-enablement-plan";
import * as fs from "fs";

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Hermes Gateway Real Dispatch Phase-2 Controlled Enablement Plan Test\n");

  const plan = HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_CONTROLLED_ENABLEMENT_PLAN;

  // Test 1: Object shape and status
  console.log("Test 1: Object shape and status");
  assert(plan.name === "Hermes Gateway Real Dispatch Phase-2 Controlled Enablement Plan", "name");
  assert(plan.adapter === "hermes", "adapter");
  assert(plan.status === "plan_only", "status plan_only");
  assert(plan.planOnly === true, "planOnly true");
  console.log("");

  // Test 2: Non-execution fields
  console.log("Test 2: Non-execution fields");
  assert(plan.executingNow === false, "executingNow false");
  assert(plan.enablesFeatureFlagsNow === false, "no flags now");
  assert(plan.expandsRequestTypesNow === false, "no expansion now");
  assert(plan.validatesNow === false, "no validation now");
  assert(plan.changesRuntimeBehaviorNow === false, "no runtime now");
  assert(plan.changesGatewayBehaviorNow === false, "no gateway now");
  assert(plan.addsEnablementScripts === false, "no scripts");
  assert(plan.changesCiBehavior === false, "no CI");
  console.log("");

  // Test 3: Readiness + scope
  console.log("Test 3: Readiness + scope");
  assert(plan.currentReadinessVerdict === "READY_WITH_CONSTRAINTS", "verdict");
  assert(plan.currentValidatedRequestTypes.length === 1 && plan.currentValidatedRequestTypes[0] === "review", "current review only");
  assert(plan.phase2EnablementTargets.includes("code_review") && plan.phase2EnablementTargets.includes("validation"), "phase 2 targets");
  assert(plan.supportedRequestTypes.includes("review") && plan.supportedRequestTypes.includes("code_review") && plan.supportedRequestTypes.includes("validation"), "supported types");
  assert(plan.unsupportedRequestTypes.includes("llm_task") && plan.unsupportedRequestTypes.includes("code_generation") && plan.unsupportedRequestTypes.includes("bugfix"), "unsupported types");
  assert(plan.requiredPrerequisites.length >= 8, "prerequisites exist");
  console.log("");

  // Test 4: Operator/automation constraints
  console.log("Test 4: Operator/automation constraints");
  assert(plan.operatorApprovalRequired === true, "operator required");
  assert(plan.automaticEnablementAllowed === false, "no auto enablement");
  assert(plan.rolloutMayProceedAutomatically === false, "no auto rollout");
  assert(plan.phase2MayProceedAutomatically === false, "no auto phase 2");
  assert(plan.requiresMultipleFlags === true, "multiple flags");
  assert(plan.requiredFlags.length === 3, "3 flags");
  console.log("");

  // Test 5: Gateway/Runtime safety
  console.log("Test 5: Gateway/Runtime safety");
  assert(plan.changesGatewayPrimaryDispatch === false, "no gateway change");
  assert(plan.changesGatewayFinalResult === false, "no gateway final");
  assert(plan.changesRuntimeFinalStatus === false, "no final status");
  assert(plan.changesRuntimeRouting === false, "no routing");
  assert(plan.affectsPrimaryGatewayResult === false, "no primary");
  console.log("");

  // Test 6: Ownership boundaries
  console.log("Test 6: Ownership boundaries");
  assert(plan.makesHermesDefault === false, "not default");
  assert(plan.makesHermesFinalReviewOwner === false, "not review owner");
  assert(plan.makesHermesFinalCodeReviewOwner === false, "not code review owner");
  assert(plan.makesHermesFinalValidationOwner === false, "not validation owner");
  console.log("");

  // Test 7: Persistence/leakage
  console.log("Test 7: Persistence/leakage");
  assert(plan.writesFiles === false, "no files");
  assert(plan.persistsEnablementLogs === false, "no enablement logs");
  assert(plan.persistsValidationLogs === false, "no validation logs");
  assert(plan.persistsReviewLogs === false, "no review logs");
  assert(plan.persistsAudit === false, "no audit");
  assert(plan.persistsObservability === false, "no observability");
  assert(plan.persistsGuardrails === false, "no guardrails");
  assert(plan.containsRawPrompt === false, "no raw prompt");
  assert(plan.containsRawArtifacts === false, "no raw artifacts");
  assert(plan.containsSecrets === false, "no secrets");
  console.log("");

  // Test 8: Operator gates
  console.log("Test 8: Required operator gates");
  assert(Array.isArray(plan.requiredOperatorGates) && plan.requiredOperatorGates.length >= 8, "gates exist");
  assert(plan.requiredOperatorGates.some(g => g.toLowerCase().includes("operator approval")), "gate: operator approval");
  assert(plan.requiredOperatorGates.some(g => g.includes("manually provided")), "gate: manual flags");
  assert(plan.requiredOperatorGates.some(g => g.includes("sidecar-only")), "gate: sidecar only");
  assert(plan.requiredOperatorGates.some(g => g.toLowerCase().includes("rollback")), "gate: rollback");
  console.log("");

  // Test 9: Manual enablement steps
  console.log("Test 9: Manual enablement steps");
  assert(Array.isArray(plan.manualEnablementSteps) && plan.manualEnablementSteps.length >= 10, "steps exist");
  assert(plan.manualEnablementSteps.some(s => s.includes("not executed by this PR")), "step: not executed");
  assert(plan.manualEnablementSteps.some(s => s.includes("not be encoded")), "step: not encoded");
  console.log("");

  // Test 10: Rollback triggers
  console.log("Test 10: Rollback triggers");
  assert(Array.isArray(plan.rollbackTriggers) && plan.rollbackTriggers.length >= 8, "triggers exist");
  assert(plan.rollbackTriggers.some(t => t.includes("final code_review decision")), "trigger: code_review");
  assert(plan.rollbackTriggers.some(t => t.includes("final_status") || t.includes("routing")), "trigger: final_status/routing");
  assert(plan.rollbackTriggers.some(t => t.includes("enabled by default")), "trigger: default enabled");
  console.log("");

  // Test 11: Blocking conditions
  console.log("Test 11: Blocking conditions");
  assert(Array.isArray(plan.blockingConditions) && plan.blockingConditions.length >= 8, "conditions exist");
  assert(plan.blockingConditions.some(c => c.includes("implementation change")), "cond: impl change");
  assert(plan.blockingConditions.some(c => c.includes("enabled by default")), "cond: default enabled");
  assert(plan.blockingConditions.some(c => c.includes("automatic")), "cond: automatic");
  console.log("");

  // Test 12: Next PR
  console.log("Test 12: Recommended next PR");
  assert(plan.recommendedNextPr === "Hermes Gateway Real Dispatch Phase-2 Enablement Guard Contract", "next PR");
  console.log("");

  // Test 13: Forbidden runtime/script/CI changes
  console.log("Test 13: Forbidden runtime/script/CI changes");
  const rt = fs.readFileSync("runtime.ts", "utf-8");
  const gw = fs.readFileSync("execution/gateway.ts", "utf-8");
  const pj = fs.readFileSync("package.json", "utf-8");
  assert(!rt.includes("phase_2_controlled_enablement"), "runtime no phase 2");
  assert(!gw.includes("phase_2_controlled_enablement"), "gateway no phase 2");
  assert(!pj.includes("SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled"), "package no flag enablement");
  // Check no flag enablement in test scripts
  assert(!pj.includes("SDLC_HERMES_GATEWAY_INTEGRATION=enabled") || pj.includes("&& tsx"), "package no integration flag");
  console.log("");

  // Test 14: Markdown consistency
  console.log("Test 14: Markdown consistency");
  const md = fs.readFileSync("HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_CONTROLLED_ENABLEMENT_PLAN.md", "utf-8");
  assert(md.includes("plan_only"), "md: status");
  assert(md.includes("No Phase-2 enablement now"), "md: no enablement");
  assert(md.includes("No request type expansion now"), "md: no expansion");
  assert(md.includes("Hermes Gateway Real Dispatch Phase-2 Enablement Guard Contract"), "md: next PR");
  console.log("");

  // Test 15: JSON consistency
  console.log("Test 15: JSON consistency");
  const jr = fs.readFileSync("hermes-gateway-real-dispatch-phase-2-controlled-enablement-plan.json", "utf-8");
  const json = JSON.parse(jr);
  assert(json.status === "plan_only", "json: status");
  assert(json.plan_only === true, "json: plan only");
  assert(json.recommended_next_pr.title === "Hermes Gateway Real Dispatch Phase-2 Enablement Guard Contract", "json: next PR");
  console.log("");

  // Test 16: Forbidden imports
  console.log("Test 16: Forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-real-dispatch-phase-2-controlled-enablement-plan.ts", "utf-8");
  assert(!src.includes("import "), "no imports at all (pure static object)");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
