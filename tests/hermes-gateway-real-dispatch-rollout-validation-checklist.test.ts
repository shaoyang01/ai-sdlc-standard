// Regression Test - Hermes Gateway Real Dispatch Rollout Validation Checklist
// ===========================================================================
// Checklist-only. No rollout execution, Gateway behavior change, Runtime behavior change, or real CLI.

import {
  HERMES_GATEWAY_REAL_DISPATCH_ROLLOUT_VALIDATION_CHECKLIST,
} from "../execution/hermes-gateway-real-dispatch-rollout-validation-checklist";
import * as fs from "node:fs";

function assertSameArray(actual: readonly string[], expected: readonly string[], assert: (c: boolean, m: string) => void, message: string) {
  assert(actual.length === expected.length && expected.every((v, i) => actual[i] === v), message);
}

async function test() {
  let passed = 0;
  let failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Hermes Gateway Real Dispatch Rollout Validation Checklist Test\n");

  const c = HERMES_GATEWAY_REAL_DISPATCH_ROLLOUT_VALIDATION_CHECKLIST;

  console.log("Test 1: checklist object shape");
  assert(c.name === "Hermes Gateway Real Dispatch Rollout Validation Checklist", "name");
  assert(c.adapter === "hermes", "adapter");
  assert(c.scope === "gateway_real_dispatch_sidecar_rollout_validation", "scope");
  assert(c.status === "checklist_only", "status");
  assert(c.recommendedNextPr === "Hermes Gateway Real Dispatch Operator Runbook", "next PR");
  console.log("");

  console.log("Test 2: non-execution constraints");
  assert(c.checklistOnly === true, "checklist only");
  assert(c.executingNow === false, "not executing");
  assert(c.enablesFeatureFlagsNow === false, "does not enable flags");
  assert(c.changesRuntimeBehaviorNow === false, "no runtime behavior change");
  assert(c.changesGatewayBehaviorNow === false, "no Gateway behavior change");
  console.log("");

  console.log("Test 3: readiness and rollout-plan dependency");
  assert(c.readinessVerdictRequired === "READY_WITH_CONSTRAINTS", "required readiness");
  assert(c.rolloutPlanStatusRequired === "plan_only", "required rollout plan status");
  assert(c.currentReadinessVerdict === "READY_WITH_CONSTRAINTS", "current readiness");
  assert(c.currentRolloutPlanStatus === "plan_only", "current rollout plan");
  console.log("");

  console.log("Test 4: field and flag constraints");
  assert(c.gatewayField === "hermes_gateway_real_dispatch", "gateway field");
  assert(c.fallbackPolicyField === "fallbackPolicy", "fallback field");
  assert(c.observabilityField === "observability", "observability field");
  assert(c.guardrailsField === "guardrails", "guardrails field");
  assert(c.defaultDisabled === true, "default disabled");
  assert(c.featureFlagged === true, "feature flagged");
  assert(c.requiresMultipleFlags === true, "requires multiple flags");
  assertSameArray(c.requiredFlags, [
    "SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled",
    "SDLC_HERMES_GATEWAY_INTEGRATION=enabled",
    "SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled",
  ], assert, "required flags");
  console.log("");

  console.log("Test 5: request type validation scope");
  assertSameArray(c.initialValidationRequestTypes, ["review"], assert, "initial validation request types");
  assertSameArray(c.supportedRequestTypes, ["review", "code_review", "validation"], assert, "supported request types");
  assertSameArray(c.unsupportedRequestTypes, ["llm_task", "code_generation", "bugfix"], assert, "unsupported request types");
  console.log("");

  console.log("Test 6: behavior safety");
  assert(c.changesGatewayPrimaryDispatch === false, "no primary dispatch change");
  assert(c.changesGatewayFinalResult === false, "no Gateway final result change");
  assert(c.changesRuntimeFinalStatus === false, "no Runtime final status change");
  assert(c.changesRuntimeRouting === false, "no Runtime routing change");
  assert(c.affectsPrimaryGatewayResult === false, "no primary Gateway effect");
  assert(c.makesHermesDefault === false, "Hermes not default");
  assert(c.makesHermesFinalReviewOwner === false, "Hermes not review owner");
  assert(c.makesHermesFinalValidationOwner === false, "Hermes not validation owner");
  console.log("");

  console.log("Test 7: persistence/leakage");
  assert(c.writesFiles === false, "no writes");
  assert(c.persistsValidationLogs === false, "no validation logs");
  assert(c.persistsRolloutLogs === false, "no rollout logs");
  assert(c.persistsAudit === false, "no audit persistence");
  assert(c.persistsObservability === false, "no observability persistence");
  assert(c.persistsGuardrails === false, "no guardrail persistence");
  assert(c.containsRawPrompt === false, "no raw prompt");
  assert(c.containsRawArtifacts === false, "no raw artifacts");
  assert(c.containsSecrets === false, "no secrets");
  console.log("");

  console.log("Test 8: validation gates");
  assert(c.validationGates.length >= 8, "at least 8 gates");
  assert(c.requiredGateCount === c.validationGates.length, "required gate count matches");
  for (const gate of c.validationGates) {
    assert(gate.status === "required", `${gate.id}: required`);
    assert(gate.requiredBeforeOperatorEnablement === true, `${gate.id}: required before operator`);
    assert(gate.executingNow === false, `${gate.id}: not executing`);
    assert(gate.enablesFeatureFlagsNow === false, `${gate.id}: no flags`);
    assert(gate.changesRuntimeBehaviorNow === false, `${gate.id}: no runtime behavior`);
    assert(gate.changesGatewayBehaviorNow === false, `${gate.id}: no Gateway behavior`);
    assert(gate.passCriteria.length > 0, `${gate.id}: pass criteria`);
    assert(gate.failCriteria.length > 0, `${gate.id}: fail criteria`);
  }
  const gateIds = c.validationGates.map(g => g.id);
  for (const id of [
    "non_execution_guard",
    "feature_flag_gate",
    "request_scope_gate",
    "gateway_runtime_safety_gate",
    "sidecar_metadata_safety_gate",
    "test_safety_gate",
    "rollback_readiness_gate",
    "operator_approval_gate",
  ]) {
    assert(gateIds.includes(id), `gate: ${id}`);
  }
  console.log("");

  console.log("Test 9: operator approval");
  assert(c.operatorApprovalRequired === true, "operator approval required");
  assert(c.rolloutMayProceedAutomatically === false, "rollout cannot proceed automatically");
  assert(c.automaticEnablementAllowed === false, "automatic enablement not allowed");
  console.log("");

  console.log("Test 10: global failure criteria and constraints");
  assert(c.globalFailureCriteria.some(f => f.includes("Runtime or Gateway implementation files change")), "failure: implementation file change");
  assert(c.globalFailureCriteria.some(f => f.includes("feature flag") && f.includes("enabled by default")), "failure: flag default enabled");
  assert(c.globalFailureCriteria.some(f => f.includes("real Hermes CLI") && f.includes("tests")), "failure: real CLI in tests");
  assert(c.globalFailureCriteria.some(f => f.includes("unsupported request type") && f.includes("dispatcher")), "failure: unsupported dispatcher");
  assert(c.globalFailureCriteria.some(f => f.includes("Gateway primary result")), "failure: Gateway primary");
  assert(c.globalFailureCriteria.some(f => f.includes("Gateway final result")), "failure: Gateway final");
  assert(c.globalFailureCriteria.some(f => f.includes("Runtime final_status") && f.includes("routing")), "failure: Runtime final_status/routing");
  assert(c.globalFailureCriteria.some(f => f.includes("raw prompt") && f.includes("raw artifact") && f.includes("secret")), "failure: raw prompt/artifact/secret");
  assert(c.globalFailureCriteria.some(f => f.includes("validation") && f.includes("rollout") && f.includes("audit") && f.includes("observability") && f.includes("guardrail") && f.includes("persisted")), "failure: persisted logs");
  assert(c.globalFailureCriteria.some(f => f.includes("automatic rollout") && f.includes("automatic feature flag enablement")), "failure: automatic rollout/flag");
  assert(c.checklistConstraints.some(k => k.includes("checklist-only")), "constraint: checklist-only");
  assert(c.checklistConstraints.some(k => k.includes("does not enable Hermes feature flags")), "constraint: no feature flags");
  assert(c.checklistConstraints.some(k => k.includes("sidecar metadata only")), "constraint: sidecar only");
  assert(c.checklistConstraints.some(k => k.includes("default-off")), "constraint: default-off");
  assert(c.checklistConstraints.some(k => k.includes("Initial validation is review-only")), "constraint: review initial");
  assert(c.checklistConstraints.some(k => k.includes("requires operator approval")), "constraint: expansion approval");
  assert(c.checklistConstraints.some(k => k.includes("final review or validation owner")), "constraint: no final ownership");
  assert(c.checklistConstraints.some(k => k.includes("final_status") && k.includes("routing")), "constraint: no runtime dependency");
  assert(c.checklistConstraints.some(k => k.includes("No validation") && k.includes("persist")), "constraint: no persistence");
  assert(c.checklistConstraints.some(k => k.includes("No rollout may proceed automatically")), "constraint: no automatic rollout");
  console.log("");

  console.log("Test 11: evidence");
  for (const file of [
    "execution/hermes-gateway-real-dispatch-readiness-review.ts",
    "execution/hermes-gateway-real-dispatch-controlled-rollout-plan.ts",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_READINESS_REVIEW.md",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_CONTROLLED_ROLLOUT_PLAN.md",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-readiness-review.json",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-controlled-rollout-plan.json",
    "execution/hermes-gateway-real-dispatch-rollout-validation-checklist.ts",
    "tests/hermes-gateway-real-dispatch-rollout-validation-checklist.test.ts",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_ROLLOUT_VALIDATION_CHECKLIST.md",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-rollout-validation-checklist.json",
  ]) {
    assert(c.evidence.includes(file), `evidence: ${file}`);
  }
  console.log("");

  console.log("Test 12: Markdown consistency");
  const md = fs.readFileSync("docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_ROLLOUT_VALIDATION_CHECKLIST.md", "utf-8");
  assert(md.includes("checklist_only"), "md: status");
  assert(md.includes("Gateway real dispatch sidecar rollout validation only"), "md: scope");
  assert(md.includes("This PR does not execute rollout"), "md: no rollout execution");
  assert(md.includes("This PR does not enable feature flags"), "md: no feature flags");
  assert(md.includes("READY_WITH_CONSTRAINTS"), "md: readiness");
  assert(md.includes("plan_only"), "md: rollout plan status");
  for (const flag of c.requiredFlags) {
    assert(md.includes(flag), `md: ${flag}`);
  }
  for (const id of gateIds) {
    assert(md.includes(id), `md gate: ${id}`);
  }
  assert(md.includes("Hermes Gateway Real Dispatch Operator Runbook"), "md: next PR");
  console.log("");

  console.log("Test 13: JSON consistency");
  const json = JSON.parse(fs.readFileSync("metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-rollout-validation-checklist.json", "utf-8"));
  assert(json.status === c.status, "json: status");
  assert(json.checklist_only === true, "json: checklist only");
  assert(json.executing_now === false, "json: not executing");
  assert(json.current_readiness_verdict === c.currentReadinessVerdict, "json: current readiness");
  assert(json.current_rollout_plan_status === c.currentRolloutPlanStatus, "json: rollout plan status");
  assert(json.recommended_next_pr.title === c.recommendedNextPr, "json: next PR");
  assert(json.validation_gates.length === c.validationGates.length, "json: gate length");
  assert(json.required_gate_count === c.requiredGateCount, "json: required gate count");
  console.log("");

  console.log("Test 14: forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-real-dispatch-rollout-validation-checklist.ts", "utf-8");
  const forbidden = [
    "runtime",
    "execution/gateway",
    "dispatchHermesGatewayReal",
    "executeHermesCliCommand",
    "runHermesGatewayShadowSidecar",
    "buildHermesRuntimeShadowAttachmentFromRequest",
    "child_process",
    "fs",
    "http",
    "https",
    "fetch",
    "policy-memory",
    "graph",
    "kimi-gateway-real-dispatch",
    "codex",
  ];
  const badLines = src.split("\n").filter((line: string) => {
    if (!line.includes("import ")) return false;
    return forbidden.some(f => line.includes(f));
  });
  assert(badLines.length === 0, `no forbidden imports (found ${badLines.length})`);
  console.log("");

  console.log("Test 15: forbidden runtime file changes");
  const runtimeSrc = fs.readFileSync("runtime.ts", "utf-8");
  const gatewaySrc = fs.readFileSync("execution/gateway.ts", "utf-8");
  const dispatchSrc = fs.readFileSync("execution/hermes-gateway-real-dispatch.ts", "utf-8");
  const rolloutPlanSrc = fs.readFileSync("execution/hermes-gateway-real-dispatch-controlled-rollout-plan.ts", "utf-8");
  assert(!runtimeSrc.includes("rollout_validation"), "runtime.ts no rollout_validation");
  assert(!gatewaySrc.includes("rollout_validation"), "execution/gateway.ts no rollout_validation");
  assert(!dispatchSrc.includes("rollout_validation"), "real dispatch no rollout_validation");
  assert(!rolloutPlanSrc.includes("rollout_validation"), "controlled rollout plan no rollout_validation");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
