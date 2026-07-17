// Regression Test — Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Rollback Contract
// =========================================================================================
// Rollback-contract-only. No Runtime, no Gateway, no CLI.

import {
  HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_ROLLBACK_CONTRACT,
} from "../execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement-rollback-contract";
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
  console.log("Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Rollback Contract Test\n");

  const contract = HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_ROLLBACK_CONTRACT;

  // Test 1: Object shape and status
  console.log("Test 1: Object shape and status");
  assert(contract.name === "Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Rollback Contract", "name");
  assert(contract.adapter === "hermes", "adapter");
  assert(contract.status === "rollback_contract_only", "status rollback_contract_only");
  assert(contract.rollbackContractOnly === true, "rollbackContractOnly true");
  console.log("");

  // Test 2: Rollback-contract-only / non-execution fields
  console.log("Test 2: Rollback-contract-only / non-execution fields");
  assert(contract.executingNow === false, "executingNow false");
  assert(contract.enablesFeatureFlagsNow === false, "no flags now");
  assert(contract.expandsRequestTypesNow === false, "no expansion now");
  assert(contract.validatesNow === false, "no validation now");
  assert(contract.changesRuntimeBehaviorNow === false, "no runtime now");
  assert(contract.changesGatewayBehaviorNow === false, "no gateway now");
  assert(contract.addsEnablementScripts === false, "no scripts");
  assert(contract.changesCiBehavior === false, "no CI");
  console.log("");

  // Test 3: Implementation is not happening now
  console.log("Test 3: Implementation is not happening now");
  assert(contract.implementsNow === false, "implementsNow false");
  assert(contract.changesHermesDispatchEligibilityNow === false, "no dispatch eligibility change now");
  console.log("");

  // Test 4: Real rollback execution not added now
  console.log("Test 4: Real rollback execution not added now");
  assert(contract.addsRealRollbackExecutionNow === false, "addsRealRollbackExecutionNow false");
  console.log("");

  // Test 5: Rollback/audit/guardrail/observability logs not persisted now
  console.log("Test 5: Rollback/audit/guardrail/observability logs not persisted now");
  assert(contract.persistsRollbackLogsNow === false, "persistsRollbackLogsNow false");
  assert(contract.persistsAuditLogsNow === false, "persistsAuditLogsNow false");
  assert(contract.persistsGuardrailLogsNow === false, "persistsGuardrailLogsNow false");
  assert(contract.persistsObservabilityLogsNow === false, "persistsObservabilityLogsNow false");
  console.log("");

  // Test 6: Request scope
  console.log("Test 6: Request scope");
  assert(contract.currentReadinessVerdict === "READY_WITH_CONSTRAINTS", "verdict");
  assert(contract.currentValidatedRequestTypes.length === 1 && contract.currentValidatedRequestTypes[0] === "review", "current review only");
  assert(contract.phase2ShadowTargets.includes("code_review") && contract.phase2ShadowTargets.includes("validation"), "phase 2 shadow targets");
  assert(contract.supportedRequestTypes.includes("review") && contract.supportedRequestTypes.includes("code_review") && contract.supportedRequestTypes.includes("validation"), "supported types");
  assert(contract.unsupportedRequestTypes.includes("llm_task") && contract.unsupportedRequestTypes.includes("code_generation") && contract.unsupportedRequestTypes.includes("bugfix"), "unsupported types");
  assert(contract.requiredPrerequisites.length >= 10, "prerequisites exist");
  console.log("");

  // Test 7: Operator/automation constraints
  console.log("Test 7: Operator/automation constraints");
  assert(contract.operatorApprovalRequired === true, "operator required");
  assert(contract.automaticEnablementAllowed === false, "no auto enablement");
  assert(contract.rolloutMayProceedAutomatically === false, "no auto rollout");
  assert(contract.phase2MayProceedAutomatically === false, "no auto phase-2");
  assert(contract.requiresMultipleFlags === true, "multiple flags");
  assert(contract.requiredFlags.length === 3, "3 flags");
  console.log("");

  // Test 8: Gateway/Runtime behavior safety
  console.log("Test 8: Gateway/Runtime behavior safety");
  assert(contract.changesGatewayPrimaryDispatch === false, "no gateway primary dispatch change");
  assert(contract.changesGatewayFinalResult === false, "no gateway final result change");
  assert(contract.changesRuntimeFinalStatus === false, "no runtime final status change");
  assert(contract.changesRuntimeRouting === false, "no runtime routing change");
  assert(contract.affectsPrimaryGatewayResult === false, "no primary gateway result effect");
  console.log("");

  // Test 9: Dispatch eligibility safety
  console.log("Test 9: Dispatch eligibility safety");
  assert(contract.changesHermesDispatchEligibilityNow === false, "no hermes dispatch eligibility change now");
  console.log("");

  // Test 10: Ownership boundaries
  console.log("Test 10: Ownership boundaries");
  assert(contract.makesHermesDefault === false, "not default");
  assert(contract.makesHermesFinalReviewOwner === false, "not review owner");
  assert(contract.makesHermesFinalCodeReviewOwner === false, "not code review owner");
  assert(contract.makesHermesFinalValidationOwner === false, "not validation owner");
  console.log("");

  // Test 11: Persistence/leakage boundaries
  console.log("Test 11: Persistence/leakage boundaries");
  assert(contract.writesFiles === false, "no files");
  assert(contract.persistsEnablementLogs === false, "no enablement logs");
  assert(contract.persistsValidationLogs === false, "no validation logs");
  assert(contract.persistsReviewLogs === false, "no review logs");
  assert(contract.persistsAudit === false, "no audit");
  assert(contract.persistsObservability === false, "no observability");
  assert(contract.persistsGuardrails === false, "no guardrails");
  assert(contract.persistsRollback === false, "no rollback persistence");
  assert(contract.containsRawPrompt === false, "no raw prompt");
  assert(contract.containsRawArtifacts === false, "no raw artifacts");
  assert(contract.containsSecrets === false, "no secrets");
  console.log("");

  // Test 12: Rollback decision shape
  console.log("Test 12: Rollback decision shape");
  const shape = contract.rollbackDecisionShape;
  assert(shape !== undefined, "rollback decision shape exists");
  assert(shape.decision !== undefined, "shape: decision");
  assert(shape.required !== undefined, "shape: required");
  assert(shape.trigger !== undefined, "shape: trigger");
  assert(shape.action !== undefined, "shape: action");
  assert(shape.reason !== undefined, "shape: reason");
  assert(shape.sanitizedSummaryOnly !== undefined, "shape: sanitizedSummaryOnly");
  assert(shape.preservesGatewayPrimaryResult !== undefined, "shape: preservesGatewayPrimaryResult");
  assert(shape.preservesGatewayFinalResult !== undefined, "shape: preservesGatewayFinalResult");
  assert(shape.preservesRuntimeFinalStatus !== undefined, "shape: preservesRuntimeFinalStatus");
  assert(shape.preservesRuntimeRouting !== undefined, "shape: preservesRuntimeRouting");
  assert(shape.containsRawPrompt !== undefined, "shape: containsRawPrompt");
  assert(shape.containsRawArtifacts !== undefined, "shape: containsRawArtifacts");
  assert(shape.containsSecrets !== undefined, "shape: containsSecrets");
  assert(shape.containsStdoutStderrOrFullCliOutput !== undefined, "shape: containsStdoutStderrOrFullCliOutput");
  assert(shape.persistsLogs !== undefined, "shape: persistsLogs");
  console.log("");

  // Test 13: Rollback triggers
  console.log("Test 13: Rollback triggers");
  assert(Array.isArray(contract.rollbackTriggers) && contract.rollbackTriggers.length >= 10, "rollback triggers exist");
  assert(contract.rollbackTriggers.some(t => t.includes("Gateway primary result")), "trigger: gateway primary result");
  assert(contract.rollbackTriggers.some(t => t.includes("Runtime final_status")), "trigger: runtime final_status");
  assert(contract.rollbackTriggers.some(t => t.includes("Runtime routing")), "trigger: runtime routing");
  assert(contract.rollbackTriggers.some(t => t.includes("final code_review")), "trigger: final code_review");
  assert(contract.rollbackTriggers.some(t => t.includes("final validation")), "trigger: final validation");
  assert(contract.rollbackTriggers.some(t => t.includes("raw prompt")), "trigger: raw prompt");
  assert(contract.rollbackTriggers.some(t => t.includes("secret")), "trigger: secret");
  assert(contract.rollbackTriggers.some(t => t.includes("stdout") || t.includes("CLI output")), "trigger: stdout/stderr/full CLI output");
  assert(contract.rollbackTriggers.some(t => t.includes("persistence")), "trigger: persistence");
  assert(contract.rollbackTriggers.some(t => t.includes("automatic")), "trigger: automatic rollout/enablement");
  console.log("");

  // Test 14: Rollback actions
  console.log("Test 14: Rollback actions");
  assert(Array.isArray(contract.rollbackActions) && contract.rollbackActions.length >= 5, "rollback actions exist");
  assert(contract.rollbackActions.some(a => a.includes("omit Hermes sidecar")), "action: omit sidecar");
  assert(contract.rollbackActions.some(a => a.includes("preserve Gateway primary result")), "action: primary result");
  assert(contract.rollbackActions.some(a => a.includes("preserve Gateway final result")), "action: final result");
  assert(contract.rollbackActions.some(a => a.includes("preserve Runtime final_status")), "action: final_status");
  assert(contract.rollbackActions.some(a => a.includes("preserve Runtime routing")), "action: routing");
  assert(contract.rollbackActions.some(a => a.includes("disable future Phase-2 shadow attachment")), "action: disable future");
  assert(contract.rollbackActions.some(a => a.includes("operator manual rollback")), "action: operator manual");
  assert(contract.rollbackActions.some(a => a.includes("do not persist rollback logs")), "action: no persist");
  console.log("");

  // Test 15: Rollback safety rules
  console.log("Test 15: Rollback safety rules");
  assert(Array.isArray(contract.rollbackSafetyRules) && contract.rollbackSafetyRules.length >= 10, "rollback safety rules exist");
  assert(contract.rollbackSafetyRules.some(r => r.includes("contract-only")), "rule: contract-only");
  assert(contract.rollbackSafetyRules.some(r => r.includes("Gateway primary/final result")), "rule: no gateway result change");
  assert(contract.rollbackSafetyRules.some(r => r.includes("Runtime final_status/routing")), "rule: no runtime change");
  assert(contract.rollbackSafetyRules.some(r => r.includes("raw prompt")), "rule: no raw prompt");
  assert(contract.rollbackSafetyRules.some(r => r.includes("raw artifacts")), "rule: no raw artifacts");
  assert(contract.rollbackSafetyRules.some(r => r.includes("secrets")), "rule: no secrets");
  assert(contract.rollbackSafetyRules.some(r => r.includes("stdout") || r.includes("stderr")), "rule: no stdout/stderr");
  assert(contract.rollbackSafetyRules.some(r => r.includes("full warning text")), "rule: no full warning text");
  assert(contract.rollbackSafetyRules.some(r => r.includes("persist logs") || r.includes("persistence contract")), "rule: no persistence");
  assert(contract.rollbackSafetyRules.some(r => r.includes("omit sidecar")), "rule: omit sidecar");
  console.log("");

  // Test 16: Prohibited rollback data
  console.log("Test 16: Prohibited rollback data");
  assert(Array.isArray(contract.prohibitedRollbackData) && contract.prohibitedRollbackData.length >= 10, "prohibited data exist");
  assert(contract.prohibitedRollbackData.some(d => d.includes("raw prompt")), "prohibited: raw prompt");
  assert(contract.prohibitedRollbackData.some(d => d.includes("raw artifact")), "prohibited: raw artifact");
  assert(contract.prohibitedRollbackData.some(d => d.includes("secret")), "prohibited: secret");
  assert(contract.prohibitedRollbackData.some(d => d.includes("stdout")), "prohibited: stdout");
  assert(contract.prohibitedRollbackData.some(d => d.includes("stderr")), "prohibited: stderr");
  assert(contract.prohibitedRollbackData.some(d => d.includes("full CLI output")), "prohibited: full CLI output");
  assert(contract.prohibitedRollbackData.some(d => d.includes("full warning text")), "prohibited: full warning text");
  assert(contract.prohibitedRollbackData.some(d => d.includes("real API key")), "prohibited: real API key");
  assert(contract.prohibitedRollbackData.some(d => d.includes("environment variable")), "prohibited: environment variable");
  assert(contract.prohibitedRollbackData.some(d => d.includes("persisted")), "prohibited: persisted logs");
  console.log("");

  // Test 17: Markdown consistency
  console.log("Test 17: Markdown consistency");
  const md = fs.readFileSync("docs/capabilities/hermes/phase-2/HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_ROLLBACK_CONTRACT.md", "utf-8");
  assert(md.includes("rollback_contract_only"), "md: status");
  assert(md.includes("No Phase-2 enablement now") || md.includes("no Phase-2 enablement now"), "md: no enablement");
  assert(md.includes("No request type expansion now") || md.includes("no request type expansion now"), "md: no expansion");
  assert(md.includes("Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Readiness Gate"), "md: next PR");
  console.log("");

  // Test 18: JSON consistency
  console.log("Test 18: JSON consistency");
  const jr = fs.readFileSync("metadata/capabilities/hermes/phase-2/hermes-gateway-real-dispatch-phase-2-shadow-enablement-rollback-contract.json", "utf-8");
  const json = JSON.parse(jr);
  assert(json.status === "rollback_contract_only", "json: status");
  assert(json.rollback_contract_only === true, "json: rollback contract only");
  assert(json.implements_now === false, "json: implements_now false");
  assert(json.adds_real_rollback_execution_now === false, "json: adds_real_rollback_execution_now false");
  assert(json.persists_rollback_logs_now === false, "json: persists_rollback_logs_now false");
  assert(json.persists_audit_logs_now === false, "json: persists_audit_logs_now false");
  assert(json.persists_guardrail_logs_now === false, "json: persists_guardrail_logs_now false");
  assert(json.persists_observability_logs_now === false, "json: persists_observability_logs_now false");
  assert(json.changes_hermes_dispatch_eligibility_now === false, "json: no dispatch eligibility change");
  assert(json.recommended_next_pr.title === "Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Readiness Gate", "json: next PR");
  console.log("");

  // Test 19: Forbidden imports
  console.log("Test 19: Forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement-rollback-contract.ts", "utf-8");
  assert(!src.includes("import "), "no imports at all (pure static object)");
  console.log("");

  // Test 20: Forbidden runtime/script/CI changes
  console.log("Test 20: Forbidden runtime/script/CI changes");
  const rt = fs.readFileSync("runtime.ts", "utf-8");
  const gw = fs.readFileSync("execution/gateway.ts", "utf-8");
  const hd = fs.readFileSync("execution/hermes-gateway-real-dispatch.ts", "utf-8");
  const pj = fs.readFileSync("package.json", "utf-8");
  assert(!rt.includes("phase_2_shadow_enablement_rollback_contract"), "runtime.ts no phase_2_shadow_enablement_rollback_contract");
  assert(!gw.includes("phase_2_shadow_enablement_rollback_contract"), "execution/gateway.ts no phase_2_shadow_enablement_rollback_contract");
  assert(!hd.includes("phase_2_shadow_enablement_rollback_contract"), "execution/hermes-gateway-real-dispatch.ts no phase_2_shadow_enablement_rollback_contract");
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

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
