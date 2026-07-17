// Regression Test — Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Guardrail Contract
// ==========================================================================================
// Guardrail-contract-only. No Runtime, no Gateway, no CLI.

import {
  HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_GUARDRAIL_CONTRACT,
} from "../execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement-guardrail-contract";
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
  console.log("Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Guardrail Contract Test\n");

  const contract = HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_GUARDRAIL_CONTRACT;

  // Test 1: Object shape and status
  console.log("Test 1: Object shape and status");
  assert(contract.name === "Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Guardrail Contract", "name");
  assert(contract.adapter === "hermes", "adapter");
  assert(contract.status === "guardrail_contract_only", "status guardrail_contract_only");
  assert(contract.guardrailContractOnly === true, "guardrailContractOnly true");
  console.log("");

  // Test 2: Guardrail-contract-only / non-execution fields
  console.log("Test 2: Guardrail-contract-only / non-execution fields");
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

  // Test 4: Real guardrail execution not added now
  console.log("Test 4: Real guardrail execution not added now");
  assert(contract.addsRealGuardrailExecutionNow === false, "addsRealGuardrailExecutionNow false");
  console.log("");

  // Test 5: Guardrail logs not persisted now
  console.log("Test 5: Guardrail logs not persisted now");
  assert(contract.persistsGuardrailLogsNow === false, "persistsGuardrailLogsNow false");
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
  assert(contract.containsRawPrompt === false, "no raw prompt");
  assert(contract.containsRawArtifacts === false, "no raw artifacts");
  assert(contract.containsSecrets === false, "no secrets");
  console.log("");

  // Test 12: Guardrail decision shape
  console.log("Test 12: Guardrail decision shape");
  const shape = contract.guardrailDecisionShape;
  assert(shape !== undefined, "guardrail decision shape exists");
  assert(shape.decision !== undefined, "shape: decision");
  assert(shape.allowed !== undefined, "shape: allowed");
  assert(shape.reason !== undefined, "shape: reason");
  assert(shape.checks !== undefined, "shape: checks");
  assert(shape.warningCount !== undefined, "shape: warningCount");
  assert(shape.hasWarnings !== undefined, "shape: hasWarnings");
  assert(shape.fallbackAction !== undefined, "shape: fallbackAction");
  assert(shape.sanitizedSummaryOnly !== undefined, "shape: sanitizedSummaryOnly");
  assert(shape.containsRawPrompt !== undefined, "shape: containsRawPrompt");
  assert(shape.containsRawArtifacts !== undefined, "shape: containsRawArtifacts");
  assert(shape.containsSecrets !== undefined, "shape: containsSecrets");
  assert(shape.containsStdoutStderrOrFullCliOutput !== undefined, "shape: containsStdoutStderrOrFullCliOutput");
  console.log("");

  // Test 13: Allowed guardrail decisions
  console.log("Test 13: Allowed guardrail decisions");
  assert(Array.isArray(contract.allowedGuardrailDecisions) && contract.allowedGuardrailDecisions.length === 4, "allowed decisions length 4");
  assert(contract.allowedGuardrailDecisions.includes("allow"), "allowed: allow");
  assert(contract.allowedGuardrailDecisions.includes("omit"), "allowed: omit");
  assert(contract.allowedGuardrailDecisions.includes("fallback"), "allowed: fallback");
  assert(contract.allowedGuardrailDecisions.includes("rollback_required"), "allowed: rollback_required");
  console.log("");

  // Test 14: Refusal conditions
  console.log("Test 14: Refusal conditions");
  assert(Array.isArray(contract.refusalConditions) && contract.refusalConditions.length >= 10, "refusal conditions exist");
  assert(contract.refusalConditions.some(c => c.includes("missing required Hermes flag")), "refusal: missing flag");
  assert(contract.refusalConditions.some(c => c.includes("operator approval")), "refusal: operator approval");
  assert(contract.refusalConditions.some(c => c.includes("unsupported request type")), "refusal: unsupported type");
  assert(contract.refusalConditions.some(c => c.includes("raw prompt")), "refusal: raw prompt");
  assert(contract.refusalConditions.some(c => c.includes("secret")), "refusal: secret");
  assert(contract.refusalConditions.some(c => c.includes("stdout") || c.includes("CLI output")), "refusal: stdout/stderr/full CLI output");
  assert(contract.refusalConditions.some(c => c.includes("final code_review")), "refusal: final code_review");
  assert(contract.refusalConditions.some(c => c.includes("final validation")), "refusal: final validation");
  assert(contract.refusalConditions.some(c => c.includes("persistence")), "refusal: persistence");
  assert(contract.refusalConditions.some(c => c.includes("automatic enablement")), "refusal: automatic enablement");
  console.log("");

  // Test 15: Fallback requirements
  console.log("Test 15: Fallback requirements");
  assert(Array.isArray(contract.fallbackRequirements) && contract.fallbackRequirements.length >= 5, "fallback requirements exist");
  assert(contract.fallbackRequirements.some(r => r.includes("Gateway primary result")), "fallback: primary result");
  assert(contract.fallbackRequirements.some(r => r.includes("Gateway final result")), "fallback: final result");
  assert(contract.fallbackRequirements.some(r => r.includes("Runtime final_status")), "fallback: final_status");
  assert(contract.fallbackRequirements.some(r => r.includes("Runtime routing")), "fallback: routing");
  assert(contract.fallbackRequirements.some(r => r.includes("omit Hermes sidecar")), "fallback: omit sidecar");
  assert(contract.fallbackRequirements.some(r => r.includes("not call real Hermes CLI in tests")), "fallback: no real CLI");
  assert(contract.fallbackRequirements.some(r => r.includes("sanitized reason enum")), "fallback: sanitized reason");
  console.log("");

  // Test 16: Guardrail safety rules
  console.log("Test 16: Guardrail safety rules");
  assert(Array.isArray(contract.guardrailSafetyRules) && contract.guardrailSafetyRules.length >= 10, "guardrail safety rules exist");
  assert(contract.guardrailSafetyRules.some(r => r.includes("sidecar decision metadata only")), "rule: sidecar metadata only");
  assert(contract.guardrailSafetyRules.some(r => r.includes("Gateway primary/final result")), "rule: no gateway result change");
  assert(contract.guardrailSafetyRules.some(r => r.includes("Runtime final_status/routing")), "rule: no runtime change");
  assert(contract.guardrailSafetyRules.some(r => r.includes("raw prompt")), "rule: no raw prompt");
  assert(contract.guardrailSafetyRules.some(r => r.includes("raw artifacts")), "rule: no raw artifacts");
  assert(contract.guardrailSafetyRules.some(r => r.includes("secrets")), "rule: no secrets");
  assert(contract.guardrailSafetyRules.some(r => r.includes("stdout") || r.includes("stderr")), "rule: no stdout/stderr");
  assert(contract.guardrailSafetyRules.some(r => r.includes("full warning text")), "rule: no full warning text");
  assert(contract.guardrailSafetyRules.some(r => r.includes("persist logs") || r.includes("persistence")), "rule: no persistence");
  assert(contract.guardrailSafetyRules.some(r => r.includes("omit rather than leak")), "rule: omit rather than leak");
  console.log("");

  // Test 17: Prohibited guardrail data
  console.log("Test 17: Prohibited guardrail data");
  assert(Array.isArray(contract.prohibitedGuardrailData) && contract.prohibitedGuardrailData.length >= 10, "prohibited data exist");
  assert(contract.prohibitedGuardrailData.some(d => d.includes("raw prompt")), "prohibited: raw prompt");
  assert(contract.prohibitedGuardrailData.some(d => d.includes("raw artifact")), "prohibited: raw artifact");
  assert(contract.prohibitedGuardrailData.some(d => d.includes("secret")), "prohibited: secret");
  assert(contract.prohibitedGuardrailData.some(d => d.includes("stdout")), "prohibited: stdout");
  assert(contract.prohibitedGuardrailData.some(d => d.includes("stderr")), "prohibited: stderr");
  assert(contract.prohibitedGuardrailData.some(d => d.includes("full CLI output")), "prohibited: full CLI output");
  assert(contract.prohibitedGuardrailData.some(d => d.includes("full warning text")), "prohibited: full warning text");
  assert(contract.prohibitedGuardrailData.some(d => d.includes("real API key")), "prohibited: real API key");
  assert(contract.prohibitedGuardrailData.some(d => d.includes("environment variable")), "prohibited: environment variable");
  assert(contract.prohibitedGuardrailData.some(d => d.includes("persisted")), "prohibited: persisted logs");
  console.log("");

  // Test 18: Markdown consistency
  console.log("Test 18: Markdown consistency");
  const md = fs.readFileSync("docs/capabilities/hermes/phase-2/HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_GUARDRAIL_CONTRACT.md", "utf-8");
  assert(md.includes("guardrail_contract_only"), "md: status");
  assert(md.includes("No Phase-2 enablement now") || md.includes("no Phase-2 enablement now"), "md: no enablement");
  assert(md.includes("No request type expansion now") || md.includes("no request type expansion now"), "md: no expansion");
  assert(md.includes("Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Rollback Contract"), "md: next PR");
  console.log("");

  // Test 19: JSON consistency
  console.log("Test 19: JSON consistency");
  const jr = fs.readFileSync("metadata/capabilities/hermes/phase-2/hermes-gateway-real-dispatch-phase-2-shadow-enablement-guardrail-contract.json", "utf-8");
  const json = JSON.parse(jr);
  assert(json.status === "guardrail_contract_only", "json: status");
  assert(json.guardrail_contract_only === true, "json: guardrail contract only");
  assert(json.implements_now === false, "json: implements_now false");
  assert(json.adds_real_guardrail_execution_now === false, "json: adds_real_guardrail_execution_now false");
  assert(json.persists_guardrail_logs_now === false, "json: persists_guardrail_logs_now false");
  assert(json.changes_hermes_dispatch_eligibility_now === false, "json: no dispatch eligibility change");
  assert(json.recommended_next_pr.title === "Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Rollback Contract", "json: next PR");
  console.log("");

  // Test 20: Forbidden imports
  console.log("Test 20: Forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement-guardrail-contract.ts", "utf-8");
  assert(!src.includes("import "), "no imports at all (pure static object)");
  console.log("");

  // Test 21: Forbidden runtime/script/CI changes
  console.log("Test 21: Forbidden runtime/script/CI changes");
  const rt = fs.readFileSync("runtime.ts", "utf-8");
  const gw = fs.readFileSync("execution/gateway.ts", "utf-8");
  const hd = fs.readFileSync("execution/hermes-gateway-real-dispatch.ts", "utf-8");
  const pj = fs.readFileSync("package.json", "utf-8");
  assert(!rt.includes("phase_2_shadow_enablement_guardrail_contract"), "runtime.ts no phase_2_shadow_enablement_guardrail_contract");
  assert(!gw.includes("phase_2_shadow_enablement_guardrail_contract"), "execution/gateway.ts no phase_2_shadow_enablement_guardrail_contract");
  assert(!hd.includes("phase_2_shadow_enablement_guardrail_contract"), "execution/hermes-gateway-real-dispatch.ts no phase_2_shadow_enablement_guardrail_contract");
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
