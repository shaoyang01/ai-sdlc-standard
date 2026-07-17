// Regression Test - Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Validation
// ===================================================================================
// Validation-only artifact. No execution, no flag enablement, no Gateway/Runtime change.

import fs from "node:fs";
import path from "node:path";
import {
  HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_VALIDATION,
} from "../execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement-validation";

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

  console.log("Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Validation Test\n");

  const v = HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_VALIDATION;

  console.log("Test 1: object shape and status");
  assert(v.name === "Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Validation", "name");
  assert(v.adapter === "hermes", "adapter");
  assert(v.scope === "gateway_real_dispatch_sidecar_phase_2_shadow_enablement_validation", "scope");
  assert(v.status === "validation_only", "status");
  assert(v.recommendedNextPr === "Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance", "next PR");
  console.log("");

  console.log("Test 2: validation-only / non-execution fields");
  assert(v.validationOnly === true, "validation only");
  assert(v.executingNow === false, "not executing");
  assert(v.enablesFeatureFlagsNow === false, "does not enable flags");
  assert(v.expandsRequestTypesNow === false, "does not expand request types");
  assert(v.changesRuntimeBehaviorNow === false, "no runtime behavior change");
  assert(v.changesGatewayPrimaryDispatchNow === false, "no Gateway primary dispatch change");
  assert(v.changesGatewayFinalResultNow === false, "no Gateway final result change");
  assert(v.changesHermesDispatchEligibilityNow === false, "no Hermes dispatch eligibility change");
  assert(v.makesHermesDefaultNow === false, "Hermes not default");
  assert(v.makesHermesFinalOwnerNow === false, "Hermes not final owner");
  assert(v.addsPackageScriptFlagEnablementNow === false, "no package script flag enablement");
  assert(v.changesCiBehaviorNow === false, "no CI behavior change");
  assert(v.persistsLogsNow === false, "no log persistence");
  console.log("");

  console.log("Test 3: implementation status");
  assert(v.implementationStatus === "implemented_phase_2_shadow_sidecar_only", "implementation status");
  assert(v.implementationPrAlreadyExists === true, "implementation PR already exists");
  assert(v.validationPrOnly === true, "validation PR only");
  console.log("");

  console.log("Test 4: request scope");
  assertSameArray(v.currentValidatedRequestTypes, ["review"], assert, "current validated request types");
  assertSameArray(v.phase2ShadowTargets, ["code_review", "validation"], assert, "phase-2 shadow targets");
  assertSameArray(v.supportedRequestTypes, ["review", "code_review", "validation"], assert, "supported request types");
  assertSameArray(v.unsupportedRequestTypes, ["llm_task", "code_generation", "bugfix"], assert, "unsupported request types");
  console.log("");

  console.log("Test 5: required flags");
  assertSameArray(v.requiredFlags, [
    "SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled",
    "SDLC_HERMES_GATEWAY_INTEGRATION=enabled",
    "SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled",
  ], assert, "required flags");
  console.log("");

  console.log("Test 6: operator approval required");
  assert(v.operatorApprovalRequired === true, "operator approval required");
  console.log("");

  console.log("Test 7: default disabled / sidecar-only");
  assert(v.defaultDisabled === true, "default disabled");
  assert(v.sidecarOnly === true, "sidecar only");
  console.log("");

  console.log("Test 8: Gateway/Runtime preservation booleans");
  assert(v.gatewayPrimaryResultPreserved === true, "Gateway primary result preserved");
  assert(v.gatewayFinalResultPreserved === true, "Gateway final result preserved");
  assert(v.runtimeFinalStatusPreserved === true, "Runtime final_status preserved");
  assert(v.runtimeRoutingPreserved === true, "Runtime routing preserved");
  console.log("");

  console.log("Test 9: Hermes non-final-owner booleans");
  assert(v.hermesFinalReviewOwner === false, "Hermes not final review owner");
  assert(v.hermesFinalCodeReviewOwner === false, "Hermes not final code_review owner");
  assert(v.hermesFinalValidationOwner === false, "Hermes not final validation owner");
  console.log("");

  console.log("Test 10: leakage booleans");
  assert(v.containsRawPrompt === false, "no raw prompt");
  assert(v.containsRawArtifacts === false, "no raw artifacts");
  assert(v.containsSecrets === false, "no secrets");
  assert(v.containsStdoutStderrOrFullCliOutput === false, "no stdout/stderr/full CLI output");
  assert(v.containsFullWarningText === false, "no full warning text");
  console.log("");

  console.log("Test 11: persistence booleans");
  assert(v.persistsReadinessLogs === false, "no readiness logs");
  assert(v.persistsAuditLogs === false, "no audit logs");
  assert(v.persistsRollbackLogs === false, "no rollback logs");
  assert(v.persistsGuardrailLogs === false, "no guardrail logs");
  assert(v.persistsObservabilityLogs === false, "no observability logs");
  assert(v.persistsReviewLogs === false, "no review logs");
  assert(v.persistsValidationLogs === false, "no validation logs");
  console.log("");

  console.log("Test 12: validation matrix contains all required rows");
  assert(v.validationMatrix.length >= 27, "at least 27 matrix rows");
  const matrixNames = v.validationMatrix.map((row) => row.name);
  for (const requiredName of [
    "disabled path",
    "missing SDLC_HERMES_GATEWAY_REAL_DISPATCH",
    "missing SDLC_HERMES_GATEWAY_INTEGRATION",
    "missing SDLC_HERMES_CLI_COMMAND_EXECUTION",
    "missing operator approval",
    "unsupported llm_task",
    "unsupported code_generation",
    "unsupported bugfix",
    "unsafe metadata",
    "sanitization failure",
    "dispatcher exception",
    "guardrail refusal",
    "rollback required",
    "safe code_review attach",
    "safe validation attach",
    "raw prompt leakage prevention",
    "raw artifact leakage prevention",
    "secret leakage prevention",
    "stdout/stderr/full CLI output prevention",
    "full warning text prevention",
    "Gateway primary/final preservation",
    "Runtime final_status/routing preservation",
    "Hermes non-final-owner guarantee",
    "no persistence guarantee",
    "no real Hermes CLI in tests",
    "no package/script/CI flag enablement",
    "roadmap numbering continuity",
  ]) {
    assert(matrixNames.includes(requiredName), `matrix row: ${requiredName}`);
  }
  for (const row of v.validationMatrix) {
    assert(typeof row.name === "string", `${row.name}: name is string`);
    assert(typeof row.expectedOutcome === "string", `${row.name}: expectedOutcome is string`);
    assert(typeof row.validatedBy === "string", `${row.name}: validatedBy is string`);
    assert(row.required === true, `${row.name}: required`);
  }
  console.log("");

  console.log("Test 13: pass criteria");
  assert(v.validationPassCriteria.length >= 24, "at least 24 pass criteria");
  for (const criterion of [
    "disabled path omits sidecar",
    "missing each required flag omits sidecar",
    "missing operator approval omits sidecar",
    "unsupported request types omit sidecar",
    "safe code_review attaches sanitized sidecar only",
    "safe validation attaches sanitized sidecar only",
    "Gateway primary/final result unchanged",
    "Runtime final_status/routing unchanged",
    "Hermes output never final code_review decision",
    "Hermes output never final validation decision",
    "roadmap numbering continuous",
  ]) {
    assert(v.validationPassCriteria.includes(criterion), `pass criterion: ${criterion}`);
  }
  console.log("");

  console.log("Test 14: failure criteria");
  assert(v.validationFailureCriteria.length >= 24, "at least 24 failure criteria");
  for (const criterion of [
    "sidecar attaches when disabled",
    "sidecar attaches with missing flag",
    "sidecar attaches without operator approval",
    "unsupported request type reaches Phase-2 sidecar",
    "Hermes output becomes final code_review decision",
    "Hermes output becomes final validation decision",
    "raw prompt leaks into sidecar",
    "real Hermes CLI is called in tests",
    "roadmap numbering jumps",
  ]) {
    assert(v.validationFailureCriteria.includes(criterion), `failure criterion: ${criterion}`);
  }
  console.log("");

  console.log("Test 15: validation evidence");
  for (const file of [
    "execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement.ts",
    "execution/gateway.ts",
    "execution/types.ts",
    "tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts",
    "tests/hermes-gateway-real-dispatch-gateway-integration.test.ts",
  ]) {
    assert(v.validationEvidence.includes(file), `validation evidence: ${file}`);
  }
  console.log("");

  console.log("Test 16: prohibited validation behaviors");
  for (const behavior of [
    "Enabling Hermes flags by default.",
    "Adding package scripts that set Hermes flags.",
    "Calling real Hermes CLI in tests.",
    "Persisting readiness/audit/rollback/guardrail/observability/review/validation logs.",
    "Changing Runtime final_status.",
    "Changing Gateway primary dispatch.",
    "Making Hermes final code_review owner.",
    "Routing llm_task/code_generation/bugfix to Hermes.",
    "Storing raw prompt/artifact/secret/stdout/stderr/full CLI output/full warning text.",
  ]) {
    assert(v.prohibitedValidationBehaviors.includes(behavior), `prohibited behavior: ${behavior}`);
  }
  console.log("");

  console.log("Test 17: Markdown consistency");
  const md = fs.readFileSync("docs/capabilities/hermes/phase-2/HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_VALIDATION.md", "utf-8");
  assert(md.includes("# Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Validation"), "md title");
  assert(md.includes("## Status"), "md status section");
  assert(md.includes("validation_only"), "md status value");
  assert(md.includes("## Validation Matrix"), "md validation matrix section");
  assert(md.includes("## Pass Criteria"), "md pass criteria section");
  assert(md.includes("## Failure Criteria"), "md failure criteria section");
  assert(md.includes("## Evidence"), "md evidence section");
  assert(md.includes("## Prohibited Validation Behaviors"), "md prohibited behaviors section");
  assert(md.includes("## Recommended Next PR"), "md recommended next PR section");
  assert(md.includes(v.recommendedNextPr), "md recommended next PR value");
  console.log("");

  console.log("Test 18: JSON consistency");
  const jsonText = fs.readFileSync("metadata/capabilities/hermes/phase-2/hermes-gateway-real-dispatch-phase-2-shadow-enablement-validation.json", "utf-8");
  const json = JSON.parse(jsonText);
  assert(json.status === v.status, "json status");
  assert(json.validation_only === v.validationOnly, "json validation_only");
  assert(json.implementation_status === v.implementationStatus, "json implementation_status");
  assertSameArray(json.current_validated_request_types, ["review"], assert, "json current_validated_request_types");
  assertSameArray(json.phase_2_shadow_targets, ["code_review", "validation"], assert, "json phase_2_shadow_targets");
  assert(json.recommended_next_pr === v.recommendedNextPr, "json recommended_next_pr");
  console.log("");

  console.log("Test 19: forbidden runtime/script/CI changes");
  const runtimeSrc = fs.readFileSync("runtime.ts", "utf-8");
  assert(!runtimeSrc.includes("phase_2_shadow_enablement_validation"), "runtime.ts no phase_2_shadow_enablement_validation");

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

  console.log("Test 20: roadmap numbering continuity");
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
