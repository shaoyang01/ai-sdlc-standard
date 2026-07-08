// Regression Test - Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance
// ============================================================================================
// Operator-acceptance-only artifact. No execution, no operator actions, no flag enablement,
// no Gateway/Runtime change.

import fs from "node:fs";
import path from "node:path";
import {
  HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_OPERATOR_ACCEPTANCE,
} from "../execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement-operator-acceptance";

function assertSameArray(actual: readonly string[], expected: readonly string[], assert: (c: boolean, m: string) => void, message: string) {
  assert(actual.length === expected.length && expected.every((v, i) => actual[i] === v), message);
}

function readFilesRecursively(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...readFilesRecursively(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

async function test() {
  let passed = 0;
  let failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }

  console.log("Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance Test\n");

  const o = HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_OPERATOR_ACCEPTANCE;

  console.log("Test 1: object shape and status");
  assert(o.name === "Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance", "name");
  assert(o.adapter === "hermes", "adapter");
  assert(o.scope === "gateway_real_dispatch_sidecar_phase_2_shadow_enablement_operator_acceptance", "scope");
  assert(o.status === "operator_acceptance_only", "status");
  assert(o.recommendedNextPr === "Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Gate", "next PR");
  console.log("");

  console.log("Test 2: operator-acceptance-only / non-execution fields");
  assert(o.operatorAcceptanceOnly === true, "operator acceptance only");
  assert(o.executingNow === false, "not executing");
  assert(o.executesOperatorActionsNow === false, "does not execute operator actions");
  assert(o.enablesFeatureFlagsNow === false, "does not enable flags");
  assert(o.expandsRequestTypesNow === false, "does not expand request types");
  assert(o.changesRuntimeBehaviorNow === false, "no runtime behavior change");
  assert(o.changesGatewayPrimaryDispatchNow === false, "no Gateway primary dispatch change");
  assert(o.changesGatewayFinalResultNow === false, "no Gateway final result change");
  assert(o.changesHermesDispatchEligibilityNow === false, "no Hermes dispatch eligibility change");
  assert(o.makesHermesDefaultNow === false, "Hermes not default");
  assert(o.makesHermesFinalOwnerNow === false, "Hermes not final owner");
  assert(o.addsPackageScriptFlagEnablementNow === false, "no package script flag enablement");
  assert(o.changesCiBehaviorNow === false, "no CI behavior change");
  assert(o.persistsLogsNow === false, "no log persistence");
  console.log("");

  console.log("Test 3: implementation status");
  assert(o.implementationStatus === "implemented_phase_2_shadow_sidecar_only", "implementation status");
  console.log("");

  console.log("Test 4: validation status");
  assert(o.validationStatus === "implemented_phase_2_shadow_sidecar_validation_only", "validation status");
  console.log("");

  console.log("Test 5: request scope");
  assertSameArray(o.currentValidatedRequestTypes, ["review"], assert, "current validated request types");
  assertSameArray(o.phase2ShadowTargets, ["code_review", "validation"], assert, "phase-2 shadow targets");
  assertSameArray(o.supportedRequestTypes, ["review", "code_review", "validation"], assert, "supported request types");
  assertSameArray(o.unsupportedRequestTypes, ["llm_task", "code_generation", "bugfix"], assert, "unsupported request types");
  console.log("");

  console.log("Test 6: required flags");
  assertSameArray(o.requiredFlags, [
    "SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled",
    "SDLC_HERMES_GATEWAY_INTEGRATION=enabled",
    "SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled",
  ], assert, "required flags");
  console.log("");

  console.log("Test 7: operator approval and acceptance required");
  assert(o.operatorApprovalRequired === true, "operator approval required");
  assert(o.operatorAcceptanceRequired === true, "operator acceptance required");
  console.log("");

  console.log("Test 8: operator action not executed");
  assert(o.operatorActionExecuted === false, "operator action not executed");
  console.log("");

  console.log("Test 9: default disabled / sidecar-only");
  assert(o.defaultDisabled === true, "default disabled");
  assert(o.sidecarOnly === true, "sidecar only");
  console.log("");

  console.log("Test 10: Gateway/Runtime preservation booleans");
  assert(o.gatewayPrimaryResultPreserved === true, "Gateway primary result preserved");
  assert(o.gatewayFinalResultPreserved === true, "Gateway final result preserved");
  assert(o.runtimeFinalStatusPreserved === true, "Runtime final_status preserved");
  assert(o.runtimeRoutingPreserved === true, "Runtime routing preserved");
  console.log("");

  console.log("Test 11: Hermes non-final-owner booleans");
  assert(o.hermesFinalReviewOwner === false, "Hermes not final review owner");
  assert(o.hermesFinalCodeReviewOwner === false, "Hermes not final code_review owner");
  assert(o.hermesFinalValidationOwner === false, "Hermes not final validation owner");
  console.log("");

  console.log("Test 12: leakage booleans");
  assert(o.containsRawPrompt === false, "no raw prompt");
  assert(o.containsRawArtifacts === false, "no raw artifacts");
  assert(o.containsSecrets === false, "no secrets");
  assert(o.containsStdoutStderrOrFullCliOutput === false, "no stdout/stderr/full CLI output");
  assert(o.containsFullWarningText === false, "no full warning text");
  console.log("");

  console.log("Test 13: persistence booleans");
  assert(o.persistsReadinessLogs === false, "no readiness logs");
  assert(o.persistsAuditLogs === false, "no audit logs");
  assert(o.persistsRollbackLogs === false, "no rollback logs");
  assert(o.persistsGuardrailLogs === false, "no guardrail logs");
  assert(o.persistsObservabilityLogs === false, "no observability logs");
  assert(o.persistsReviewLogs === false, "no review logs");
  assert(o.persistsValidationLogs === false, "no validation logs");
  assert(o.persistsOperatorAcceptanceLogs === false, "no operator acceptance logs");
  console.log("");

  console.log("Test 14: operator acceptance checklist contains all required rows");
  assert(o.operatorAcceptanceChecklist.length >= 26, "at least 26 checklist rows");
  const checklistNames = o.operatorAcceptanceChecklist.map((row) => row.name);
  for (const requiredName of [
    "implementation artifact present",
    "validation artifact present",
    "disabled path validated",
    "missing flag paths validated",
    "missing operator approval validated",
    "unsupported request types validated",
    "unsafe metadata validated",
    "sanitization failure validated",
    "dispatcher exception validated",
    "guardrail refusal validated",
    "rollback required validated",
    "safe code_review attach validated",
    "safe validation attach validated",
    "raw prompt leakage prevention validated",
    "raw artifact leakage prevention validated",
    "secret leakage prevention validated",
    "stdout/stderr/full CLI output prevention validated",
    "full warning text prevention validated",
    "Gateway primary/final preservation validated",
    "Runtime final_status/routing preservation validated",
    "Hermes non-final-owner guarantee validated",
    "no persistence validated",
    "no real Hermes CLI in tests validated",
    "no package/script/CI flag enablement validated",
    "roadmap numbering continuity validated",
    "operator acceptance recorded as static artifact only",
  ]) {
    assert(checklistNames.includes(requiredName), `checklist row: ${requiredName}`);
  }
  for (const row of o.operatorAcceptanceChecklist) {
    assert(typeof row.name === "string", `${row.name}: name is string`);
    assert(typeof row.expectedOutcome === "string", `${row.name}: expectedOutcome is string`);
    assert(typeof row.acceptedBy === "string", `${row.name}: acceptedBy is string`);
    assert(row.required === true, `${row.name}: required`);
  }
  console.log("");

  console.log("Test 15: required operator inputs");
  for (const input of [
    "implementation status",
    "validation status",
    "validation matrix",
    "operator approval requirement",
    "three required Hermes flags requirement",
    "sidecar-only ownership boundary",
    "Gateway primary/final preservation guarantee",
    "Runtime final_status/routing preservation guarantee",
    "no raw prompt/artifact/secret guarantee",
    "no stdout/stderr/full CLI output/full warning text guarantee",
    "no persistence guarantee",
    "next rollout gate requirement",
  ]) {
    assert(o.requiredOperatorInputs.includes(input), `required operator input: ${input}`);
  }
  console.log("");

  console.log("Test 16: pass criteria");
  assert(o.operatorAcceptancePassCriteria.length >= 16, "at least 16 pass criteria");
  for (const criterion of [
    "implementation is present",
    "validation is present",
    "operator approval remains required",
    "all three Hermes flags remain required",
    "Gateway primary/final result preservation is validated",
    "Runtime final_status/routing preservation is validated",
    "Hermes non-final-owner guarantee is validated",
    "leakage prevention is validated",
    "persistence prohibition is validated",
    "future controlled rollout gate is required before broader rollout",
  ]) {
    assert(o.operatorAcceptancePassCriteria.includes(criterion), `pass criterion: ${criterion}`);
  }
  console.log("");

  console.log("Test 17: reject criteria");
  assert(o.operatorAcceptanceRejectCriteria.length >= 16, "at least 16 reject criteria");
  for (const criterion of [
    "implementation missing",
    "validation missing",
    "operator approval no longer required",
    "Phase-2 enabled by default",
    "Hermes becomes final review/code_review/validation owner",
    "persistence introduced",
    "real Hermes CLI called in tests",
    "package/script/CI flag enablement introduced",
    "roadmap numbering jumps",
    "controlled rollout gate skipped",
  ]) {
    assert(o.operatorAcceptanceRejectCriteria.includes(criterion), `reject criterion: ${criterion}`);
  }
  console.log("");

  console.log("Test 18: operator acceptance evidence");
  for (const file of [
    "execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement.ts",
    "execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement-validation.ts",
    "execution/gateway.ts",
    "execution/types.ts",
    "tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts",
    "tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement-validation.test.ts",
  ]) {
    assert(o.operatorAcceptanceEvidence.includes(file), `operator acceptance evidence: ${file}`);
  }
  console.log("");

  console.log("Test 19: prohibited operator acceptance behaviors");
  for (const behavior of [
    "Executing operator actions.",
    "Enabling Hermes flags by default.",
    "Adding package scripts that set Hermes flags.",
    "Calling real Hermes CLI in tests.",
    "Persisting readiness/audit/rollback/guardrail/observability/review/validation/operator logs.",
    "Changing Runtime final_status.",
    "Changing Gateway primary dispatch.",
    "Making Hermes final code_review owner.",
    "Routing llm_task/code_generation/bugfix to Hermes.",
    "Storing raw prompt/artifact/secret/stdout/stderr/full CLI output/full warning text.",
    "Skipping future controlled rollout gate.",
  ]) {
    assert(o.prohibitedOperatorAcceptanceBehaviors.includes(behavior), `prohibited behavior: ${behavior}`);
  }
  console.log("");

  console.log("Test 20: Markdown consistency");
  const md = fs.readFileSync("HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_OPERATOR_ACCEPTANCE.md", "utf-8");
  assert(md.includes("# Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance"), "md title");
  assert(md.includes("## Status"), "md status section");
  assert(md.includes("operator_acceptance_only"), "md status value");
  assert(md.includes("## Operator Acceptance Checklist"), "md checklist section");
  assert(md.includes("## Required Operator Inputs"), "md required inputs section");
  assert(md.includes("## Pass Criteria"), "md pass criteria section");
  assert(md.includes("## Reject Criteria"), "md reject criteria section");
  assert(md.includes("## Evidence"), "md evidence section");
  assert(md.includes("## Prohibited Operator Acceptance Behaviors"), "md prohibited behaviors section");
  assert(md.includes("## Recommended Next PR"), "md recommended next PR section");
  assert(md.includes(o.recommendedNextPr), "md recommended next PR value");
  console.log("");

  console.log("Test 21: JSON consistency");
  const jsonText = fs.readFileSync("hermes-gateway-real-dispatch-phase-2-shadow-enablement-operator-acceptance.json", "utf-8");
  const json = JSON.parse(jsonText);
  assert(json.status === o.status, "json status");
  assert(json.operator_acceptance_only === o.operatorAcceptanceOnly, "json operator_acceptance_only");
  assert(json.implementation_status === o.implementationStatus, "json implementation_status");
  assert(json.validation_status === o.validationStatus, "json validation_status");
  assertSameArray(json.current_validated_request_types, ["review"], assert, "json current_validated_request_types");
  assertSameArray(json.phase_2_shadow_targets, ["code_review", "validation"], assert, "json phase_2_shadow_targets");
  assert(json.recommended_next_pr === o.recommendedNextPr, "json recommended_next_pr");
  console.log("");

  console.log("Test 22: forbidden runtime/gateway/implementation/script/CI changes");
  const runtimeSrc = fs.readFileSync("runtime.ts", "utf-8");
  assert(!runtimeSrc.includes("phase_2_shadow_enablement_operator_acceptance"), "runtime.ts no phase_2_shadow_enablement_operator_acceptance");

  const gatewaySrc = fs.readFileSync("execution/gateway.ts", "utf-8");
  assert(!gatewaySrc.includes("phase_2_shadow_enablement_operator_acceptance"), "execution/gateway.ts no phase_2_shadow_enablement_operator_acceptance");

  const implSrc = fs.readFileSync("execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement.ts", "utf-8");
  assert(!implSrc.includes("operator_acceptance"), "execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement.ts no operator_acceptance");

  const packageJson = fs.readFileSync("package.json", "utf-8");
  assert(!packageJson.includes("SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled"), "package.json no SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled");
  assert(!packageJson.includes("SDLC_HERMES_GATEWAY_INTEGRATION=enabled"), "package.json no SDLC_HERMES_GATEWAY_INTEGRATION=enabled");
  assert(!packageJson.includes("SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled"), "package.json no SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled");

  const githubFiles = readFilesRecursively(".github");
  const scriptsFiles = readFilesRecursively("scripts");
  const forbiddenFlag = "SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled";
  let foundInGithub = false;
  let foundInScripts = false;
  for (const f of githubFiles) {
    if (fs.readFileSync(f, "utf-8").includes(forbiddenFlag)) { foundInGithub = true; break; }
  }
  for (const f of scriptsFiles) {
    if (fs.readFileSync(f, "utf-8").includes(forbiddenFlag)) { foundInScripts = true; break; }
  }
  assert(!foundInGithub, ".github does not contain SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled");
  assert(!foundInScripts, "scripts does not contain SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled");
  console.log("");

  console.log("Test 23: roadmap numbering continuity");
  const statusMd = fs.readFileSync("SYSTEM_STATUS.md", "utf-8");
  assert(!statusMd.includes("170."), "no 170. numbering jump");
  assert(!statusMd.includes("171."), "no 171. numbering jump");
  assert(!statusMd.includes("172."), "no 172. numbering jump");
  console.log("");

  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

test().catch((err) => {
  console.error(err);
  process.exit(1);
});
