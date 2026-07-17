// Regression Test — Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Readiness Gate
// =====================================================================================
// Readiness-gate-only. No Runtime, no Gateway, no CLI.

import {
  HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_READINESS_GATE,
} from "../execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement-readiness-gate";
import * as fs from "fs";
import * as path from "path";

function fileExists(p: string): boolean {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function readTextSafe(p: string): string | undefined {
  try { return fs.readFileSync(p, "utf-8"); } catch { return undefined; }
}

function scanDirForString(dir: string, needle: string): { found: boolean; file?: string } {
  if (!fileExists(dir)) return { found: false };
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = scanDirForString(full, needle);
      if (nested.found) return nested;
    } else if (entry.isFile()) {
      const text = readTextSafe(full);
      if (text !== undefined && text.includes(needle)) {
        return { found: true, file: full };
      }
    }
  }
  return { found: false };
}

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Readiness Gate Test\n");

  const gate = HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_READINESS_GATE;

  // Test 1: Object shape and status
  console.log("Test 1: Object shape and status");
  assert(gate.name === "Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Readiness Gate", "name");
  assert(gate.adapter === "hermes", "adapter");
  assert(gate.status === "readiness_gate_only", "status readiness_gate_only");
  assert(gate.readinessGateOnly === true, "readinessGateOnly true");
  console.log("");

  // Test 2: Readiness-gate-only / non-execution fields
  console.log("Test 2: Readiness-gate-only / non-execution fields");
  assert(gate.executingNow === false, "executingNow false");
  assert(gate.enablesFeatureFlagsNow === false, "no flags now");
  assert(gate.expandsRequestTypesNow === false, "no expansion now");
  assert(gate.validatesNow === false, "no validation now");
  assert(gate.changesRuntimeBehaviorNow === false, "no runtime now");
  assert(gate.changesGatewayBehaviorNow === false, "no gateway now");
  assert(gate.addsEnablementScripts === false, "no scripts");
  assert(gate.changesCiBehavior === false, "no CI");
  console.log("");

  // Test 3: Implementation is not happening now
  console.log("Test 3: Implementation is not happening now");
  assert(gate.implementsNow === false, "implementsNow false");
  assert(gate.changesHermesDispatchEligibilityNow === false, "no dispatch eligibility change now");
  console.log("");

  // Test 4: Real shadow enablement not added now
  console.log("Test 4: Real shadow enablement not added now");
  assert(gate.addsRealShadowEnablementNow === false, "addsRealShadowEnablementNow false");
  console.log("");

  // Test 5: Real readiness evaluation not added now
  console.log("Test 5: Real readiness evaluation not added now");
  assert(gate.addsRealReadinessEvaluationNow === false, "addsRealReadinessEvaluationNow false");
  console.log("");

  // Test 6: Readiness/audit/rollback/guardrail/observability logs not persisted now
  console.log("Test 6: Persistence boundaries now");
  assert(gate.persistsReadinessLogsNow === false, "persistsReadinessLogsNow false");
  assert(gate.persistsAuditLogsNow === false, "persistsAuditLogsNow false");
  assert(gate.persistsRollbackLogsNow === false, "persistsRollbackLogsNow false");
  assert(gate.persistsGuardrailLogsNow === false, "persistsGuardrailLogsNow false");
  assert(gate.persistsObservabilityLogsNow === false, "persistsObservabilityLogsNow false");
  console.log("");

  // Test 7: Request scope
  console.log("Test 7: Request scope");
  assert(gate.currentReadinessVerdict === "READY_WITH_CONSTRAINTS", "verdict");
  assert(gate.currentValidatedRequestTypes.length === 1 && gate.currentValidatedRequestTypes[0] === "review", "current review only");
  assert(gate.phase2ShadowTargets.includes("code_review") && gate.phase2ShadowTargets.includes("validation"), "phase 2 shadow targets");
  assert(gate.supportedRequestTypes.includes("review") && gate.supportedRequestTypes.includes("code_review") && gate.supportedRequestTypes.includes("validation"), "supported types");
  assert(gate.unsupportedRequestTypes.includes("llm_task") && gate.unsupportedRequestTypes.includes("code_generation") && gate.unsupportedRequestTypes.includes("bugfix"), "unsupported types");
  assert(gate.requiredPrerequisites.length >= 10, "prerequisites exist");
  console.log("");

  // Test 8: Operator/automation constraints
  console.log("Test 8: Operator/automation constraints");
  assert(gate.operatorApprovalRequired === true, "operator required");
  assert(gate.implementationPrRequired === true, "implementation PR required");
  assert(gate.automaticEnablementAllowed === false, "no auto enablement");
  assert(gate.rolloutMayProceedAutomatically === false, "no auto rollout");
  assert(gate.phase2MayProceedAutomatically === false, "no auto phase-2");
  assert(gate.requiresMultipleFlags === true, "multiple flags");
  assert(gate.requiredFlags.length === 3, "3 flags");
  console.log("");

  // Test 9: Gateway/Runtime behavior safety
  console.log("Test 9: Gateway/Runtime behavior safety");
  assert(gate.changesGatewayPrimaryDispatch === false, "no gateway primary dispatch change");
  assert(gate.changesGatewayFinalResult === false, "no gateway final result change");
  assert(gate.changesRuntimeFinalStatus === false, "no runtime final status change");
  assert(gate.changesRuntimeRouting === false, "no runtime routing change");
  assert(gate.affectsPrimaryGatewayResult === false, "no primary gateway result effect");
  console.log("");

  // Test 10: Dispatch eligibility safety
  console.log("Test 10: Dispatch eligibility safety");
  assert(gate.changesHermesDispatchEligibilityNow === false, "no hermes dispatch eligibility change now");
  console.log("");

  // Test 11: Ownership boundaries
  console.log("Test 11: Ownership boundaries");
  assert(gate.makesHermesDefault === false, "not default");
  assert(gate.makesHermesFinalReviewOwner === false, "not review owner");
  assert(gate.makesHermesFinalCodeReviewOwner === false, "not code review owner");
  assert(gate.makesHermesFinalValidationOwner === false, "not validation owner");
  console.log("");

  // Test 12: Persistence/leakage boundaries
  console.log("Test 12: Persistence/leakage boundaries");
  assert(gate.writesFiles === false, "no files");
  assert(gate.persistsEnablementLogs === false, "no enablement logs");
  assert(gate.persistsValidationLogs === false, "no validation logs");
  assert(gate.persistsReviewLogs === false, "no review logs");
  assert(gate.persistsAudit === false, "no audit");
  assert(gate.persistsObservability === false, "no observability");
  assert(gate.persistsGuardrails === false, "no guardrails");
  assert(gate.persistsRollback === false, "no rollback persistence");
  assert(gate.persistsReadiness === false, "no readiness persistence");
  assert(gate.containsRawPrompt === false, "no raw prompt");
  assert(gate.containsRawArtifacts === false, "no raw artifacts");
  assert(gate.containsSecrets === false, "no secrets");
  console.log("");

  // Test 13: Readiness gate decision shape
  console.log("Test 13: Readiness gate decision shape");
  const shape = gate.readinessGateDecisionShape;
  assert(shape !== undefined, "readiness gate decision shape exists");
  assert(shape.decision !== undefined, "shape: decision");
  assert(shape.verdict !== undefined, "shape: verdict");
  assert(shape.reason !== undefined, "shape: reason");
  assert(shape.sanitizedSummaryOnly !== undefined, "shape: sanitizedSummaryOnly");
  assert(shape.requiredInputsPresent !== undefined, "shape: requiredInputsPresent");
  assert(shape.contractCoverageComplete !== undefined, "shape: contractCoverageComplete");
  assert(shape.testPlanCoverageComplete !== undefined, "shape: testPlanCoverageComplete");
  assert(shape.fixtureContractComplete !== undefined, "shape: fixtureContractComplete");
  assert(shape.observabilityContractComplete !== undefined, "shape: observabilityContractComplete");
  assert(shape.guardrailContractComplete !== undefined, "shape: guardrailContractComplete");
  assert(shape.rollbackContractComplete !== undefined, "shape: rollbackContractComplete");
  assert(shape.operatorApprovalRequired !== undefined, "shape: operatorApprovalRequired");
  assert(shape.implementationPrRequired !== undefined, "shape: implementationPrRequired");
  assert(shape.automaticEnablementAllowed !== undefined, "shape: automaticEnablementAllowed");
  assert(shape.containsRawPrompt !== undefined, "shape: containsRawPrompt");
  assert(shape.containsRawArtifacts !== undefined, "shape: containsRawArtifacts");
  assert(shape.containsSecrets !== undefined, "shape: containsSecrets");
  assert(shape.persistsLogs !== undefined, "shape: persistsLogs");
  console.log("");

  // Test 14: Required gate inputs
  console.log("Test 14: Required gate inputs");
  assert(Array.isArray(gate.requiredGateInputs) && gate.requiredGateInputs.length >= 10, "required gate inputs exist");
  assert(gate.requiredGateInputs.some(i => i.includes("implementation plan")), "input: implementation plan");
  assert(gate.requiredGateInputs.some(i => i.includes("contract")), "input: contract");
  assert(gate.requiredGateInputs.some(i => i.includes("test plan")), "input: test plan");
  assert(gate.requiredGateInputs.some(i => i.includes("fixture contract")), "input: fixture contract");
  assert(gate.requiredGateInputs.some(i => i.includes("observability contract")), "input: observability contract");
  assert(gate.requiredGateInputs.some(i => i.includes("guardrail contract")), "input: guardrail contract");
  assert(gate.requiredGateInputs.some(i => i.includes("rollback contract")), "input: rollback contract");
  assert(gate.requiredGateInputs.some(i => i.includes("operator approval")), "input: operator approval");
  assert(gate.requiredGateInputs.some(i => i.includes("Hermes flags")), "input: Hermes flags");
  assert(gate.requiredGateInputs.some(i => i.includes("sidecar-only")), "input: sidecar-only");
  console.log("");

  // Test 15: Pass criteria
  console.log("Test 15: Pass criteria");
  assert(Array.isArray(gate.passCriteria) && gate.passCriteria.length >= 10, "pass criteria exist");
  assert(gate.passCriteria.some(c => c.includes("review only")), "pass: review only");
  assert(gate.passCriteria.some(c => c.includes("code_review and validation")), "pass: targets");
  assert(gate.passCriteria.some(c => c.includes("sidecar-only")), "pass: sidecar-only");
  assert(gate.passCriteria.some(c => c.includes("operator approval")), "pass: operator approval");
  assert(gate.passCriteria.some(c => c.includes("implementation PR")), "pass: implementation PR");
  assert(gate.passCriteria.some(c => c.includes("automatic enablement")), "pass: no automatic enablement");
  assert(gate.passCriteria.some(c => c.includes("Runtime final_status")), "pass: runtime preservation");
  assert(gate.passCriteria.some(c => c.includes("Gateway primary/final result")), "pass: gateway preservation");
  assert(gate.passCriteria.some(c => c.includes("raw prompt")), "pass: no raw prompt");
  assert(gate.passCriteria.some(c => c.includes("stdout")), "pass: no stdout");
  console.log("");

  // Test 16: Fail criteria
  console.log("Test 16: Fail criteria");
  assert(Array.isArray(gate.failCriteria) && gate.failCriteria.length >= 5, "fail criteria exist");
  assert(gate.failCriteria.some(c => c.includes("prerequisite artifact")), "fail: missing prerequisite");
  assert(gate.failCriteria.some(c => c.includes("test plan")), "fail: missing test plan");
  assert(gate.failCriteria.some(c => c.includes("fixture contract")), "fail: missing fixture contract");
  assert(gate.failCriteria.some(c => c.includes("observability contract")), "fail: missing observability contract");
  assert(gate.failCriteria.some(c => c.includes("guardrail contract")), "fail: missing guardrail contract");
  assert(gate.failCriteria.some(c => c.includes("rollback contract")), "fail: missing rollback contract");
  assert(gate.failCriteria.some(c => c.includes("operator approval")), "fail: unclear operator approval");
  assert(gate.failCriteria.some(c => c.includes("sidecar-only")), "fail: unclear sidecar-only");
  console.log("");

  // Test 17: Blocked criteria
  console.log("Test 17: Blocked criteria");
  assert(Array.isArray(gate.blockedCriteria) && gate.blockedCriteria.length >= 5, "blocked criteria exist");
  assert(gate.blockedCriteria.some(c => c.includes("implementation of Phase-2")), "blocked: implementation");
  assert(gate.blockedCriteria.some(c => c.includes("request type expansion")), "blocked: request type expansion");
  assert(gate.blockedCriteria.some(c => c.includes("feature flag enablement")), "blocked: feature flag enablement");
  assert(gate.blockedCriteria.some(c => c.includes("package/script/CI")), "blocked: package/script/CI");
  assert(gate.blockedCriteria.some(c => c.includes("Runtime behavior change")), "blocked: runtime behavior");
  assert(gate.blockedCriteria.some(c => c.includes("Gateway behavior change")), "blocked: gateway behavior");
  assert(gate.blockedCriteria.some(c => c.includes("Hermes dispatch eligibility")), "blocked: dispatch eligibility");
  assert(gate.blockedCriteria.some(c => c.includes("Hermes final ownership")), "blocked: final ownership");
  assert(gate.blockedCriteria.some(c => c.includes("raw prompt")), "blocked: raw prompt");
  assert(gate.blockedCriteria.some(c => c.includes("log persistence")), "blocked: log persistence");
  console.log("");

  // Test 18: Required future implementation tests
  console.log("Test 18: Required future implementation tests");
  assert(Array.isArray(gate.requiredFutureImplementationTests) && gate.requiredFutureImplementationTests.length >= 10, "future tests exist");
  assert(gate.requiredFutureImplementationTests.some(t => t.includes("disabled path")), "future test: disabled path");
  assert(gate.requiredFutureImplementationTests.some(t => t.includes("required flag")), "future test: required flag");
  assert(gate.requiredFutureImplementationTests.some(t => t.includes("operator approval")), "future test: operator approval");
  assert(gate.requiredFutureImplementationTests.some(t => t.includes("unsupported")), "future test: unsupported");
  assert(gate.requiredFutureImplementationTests.some(t => t.includes("code_review")), "future test: code_review");
  assert(gate.requiredFutureImplementationTests.some(t => t.includes("validation")), "future test: validation");
  assert(gate.requiredFutureImplementationTests.some(t => t.includes("Gateway primary/final result")), "future test: gateway result");
  assert(gate.requiredFutureImplementationTests.some(t => t.includes("Runtime final_status")), "future test: runtime final_status");
  assert(gate.requiredFutureImplementationTests.some(t => t.includes("no real Hermes CLI")), "future test: no real CLI");
  assert(gate.requiredFutureImplementationTests.some(t => t.includes("rollback trigger")), "future test: rollback");
  assert(gate.requiredFutureImplementationTests.some(t => t.includes("guardrail refusal")), "future test: guardrail");
  console.log("");

  // Test 19: Prohibited readiness data
  console.log("Test 19: Prohibited readiness data");
  assert(Array.isArray(gate.prohibitedReadinessData) && gate.prohibitedReadinessData.length >= 10, "prohibited data exist");
  assert(gate.prohibitedReadinessData.some(d => d.includes("raw prompt")), "prohibited: raw prompt");
  assert(gate.prohibitedReadinessData.some(d => d.includes("raw artifact")), "prohibited: raw artifact");
  assert(gate.prohibitedReadinessData.some(d => d.includes("secret")), "prohibited: secret");
  assert(gate.prohibitedReadinessData.some(d => d.includes("stdout")), "prohibited: stdout");
  assert(gate.prohibitedReadinessData.some(d => d.includes("stderr")), "prohibited: stderr");
  assert(gate.prohibitedReadinessData.some(d => d.includes("full CLI output")), "prohibited: full CLI output");
  assert(gate.prohibitedReadinessData.some(d => d.includes("full warning text")), "prohibited: full warning text");
  assert(gate.prohibitedReadinessData.some(d => d.includes("real API key")), "prohibited: real API key");
  assert(gate.prohibitedReadinessData.some(d => d.includes("environment variable")), "prohibited: environment variable");
  assert(gate.prohibitedReadinessData.some(d => d.includes("persisted")), "prohibited: persisted logs");
  console.log("");

  // Test 20: Safety rules
  console.log("Test 20: Safety rules");
  assert(Array.isArray(gate.safetyRules) && gate.safetyRules.length >= 10, "safety rules exist");
  assert(gate.safetyRules.some(r => r.includes("contract-only")), "rule: contract-only");
  assert(gate.safetyRules.some(r => r.includes("does not execute evaluation")), "rule: no evaluation");
  assert(gate.safetyRules.some(r => r.includes("does not enable Phase-2")), "rule: no enablement");
  assert(gate.safetyRules.some(r => r.includes("Runtime final_status")), "rule: no runtime change");
  assert(gate.safetyRules.some(r => r.includes("Gateway primary/final result")), "rule: no gateway result change");
  assert(gate.safetyRules.some(r => r.includes("raw prompt")), "rule: no raw prompt");
  assert(gate.safetyRules.some(r => r.includes("raw artifacts")), "rule: no raw artifacts");
  assert(gate.safetyRules.some(r => r.includes("secrets")), "rule: no secrets");
  assert(gate.safetyRules.some(r => r.includes("stdout") || r.includes("stderr")), "rule: no stdout/stderr");
  assert(gate.safetyRules.some(r => r.includes("operator approval")), "rule: operator approval");
  console.log("");

  // Test 21: Markdown consistency
  console.log("Test 21: Markdown consistency");
  const md = fs.readFileSync("docs/capabilities/hermes/phase-2/HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_READINESS_GATE.md", "utf-8");
  assert(md.includes("readiness_gate_only"), "md: status");
  assert(md.includes("No Phase-2 enablement now") || md.includes("no Phase-2 enablement now"), "md: no enablement");
  assert(md.includes("No request type expansion now") || md.includes("no request type expansion now"), "md: no expansion");
  assert(md.includes("Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Implementation"), "md: next PR");
  console.log("");

  // Test 22: JSON consistency
  console.log("Test 22: JSON consistency");
  const jr = fs.readFileSync("metadata/capabilities/hermes/phase-2/hermes-gateway-real-dispatch-phase-2-shadow-enablement-readiness-gate.json", "utf-8");
  const json = JSON.parse(jr);
  assert(json.status === "readiness_gate_only", "json: status");
  assert(json.readiness_gate_only === true, "json: readiness gate only");
  assert(json.implements_now === false, "json: implements_now false");
  assert(json.adds_real_shadow_enablement_now === false, "json: adds_real_shadow_enablement_now false");
  assert(json.adds_real_readiness_evaluation_now === false, "json: adds_real_readiness_evaluation_now false");
  assert(json.persists_readiness_logs_now === false, "json: persists_readiness_logs_now false");
  assert(json.persists_audit_logs_now === false, "json: persists_audit_logs_now false");
  assert(json.persists_rollback_logs_now === false, "json: persists_rollback_logs_now false");
  assert(json.persists_guardrail_logs_now === false, "json: persists_guardrail_logs_now false");
  assert(json.persists_observability_logs_now === false, "json: persists_observability_logs_now false");
  assert(json.changes_hermes_dispatch_eligibility_now === false, "json: no dispatch eligibility change");
  assert(json.recommended_next_pr.title === "Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Implementation", "json: next PR");
  console.log("");

  // Test 23: Forbidden imports
  console.log("Test 23: Forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement-readiness-gate.ts", "utf-8");
  assert(!src.includes("import "), "no imports at all (pure static object)");
  console.log("");

  // Test 24: Forbidden runtime/script/CI changes
  console.log("Test 24: Forbidden runtime/script/CI changes");
  const rt = fs.readFileSync("runtime.ts", "utf-8");
  const gw = fs.readFileSync("execution/gateway.ts", "utf-8");
  const hd = fs.readFileSync("execution/hermes-gateway-real-dispatch.ts", "utf-8");
  const pj = fs.readFileSync("package.json", "utf-8");
  assert(!rt.includes("phase_2_shadow_enablement_readiness_gate"), "runtime.ts no phase_2_shadow_enablement_readiness_gate");
  assert(!gw.includes("phase_2_shadow_enablement_readiness_gate"), "execution/gateway.ts no phase_2_shadow_enablement_readiness_gate");
  assert(!hd.includes("phase_2_shadow_enablement_readiness_gate"), "execution/hermes-gateway-real-dispatch.ts no phase_2_shadow_enablement_readiness_gate");
  const forbiddenFlags = [
    "SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled",
    "SDLC_HERMES_GATEWAY_INTEGRATION=enabled",
    "SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled",
  ];
  for (const flag of forbiddenFlags) {
    assert(!pj.includes(flag), `package.json does not contain ${flag}`);
  }
  const githubScan = scanDirForString(".github", "SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled");
  assert(!githubScan.found, `.github does not contain SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled${githubScan.file ? ` (found in ${githubScan.file})` : ""}`);
  const scriptsScan = scanDirForString("scripts", "SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled");
  assert(!scriptsScan.found, `scripts does not contain SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled${scriptsScan.file ? ` (found in ${scriptsScan.file})` : ""}`);
  console.log("");

  // Test 25: Roadmap numbering continuity
  console.log("Test 25: Roadmap numbering continuity");
  const statusMd = fs.readFileSync("SYSTEM_STATUS.md", "utf-8");
  assert(!statusMd.includes("170."), "no 170. numbering jump");
  assert(!statusMd.includes("171."), "no 171. numbering jump");
  assert(!statusMd.includes("172."), "no 172. numbering jump");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
