// Regression Test — Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Observability Contract
// ==============================================================================================
// Observability-contract-only. No Runtime, no Gateway, no CLI.

import {
  HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_OBSERVABILITY_CONTRACT,
} from "../execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement-observability-contract";
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
  console.log("Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Observability Contract Test\n");

  const contract = HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_OBSERVABILITY_CONTRACT;

  // Test 1: Object shape and status
  console.log("Test 1: Object shape and status");
  assert(contract.name === "Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Observability Contract", "name");
  assert(contract.adapter === "hermes", "adapter");
  assert(contract.status === "observability_contract_only", "status observability_contract_only");
  assert(contract.observabilityContractOnly === true, "observabilityContractOnly true");
  console.log("");

  // Test 2: Non-execution fields
  console.log("Test 2: Non-execution fields");
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

  // Test 4: Real observability collection not added now
  console.log("Test 4: Real observability collection not added now");
  assert(contract.addsRealObservabilityCollectionNow === false, "addsRealObservabilityCollectionNow false");
  console.log("");

  // Test 5: Observability logs not persisted now
  console.log("Test 5: Observability logs not persisted now");
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
  assert(contract.containsRawPrompt === false, "no raw prompt");
  assert(contract.containsRawArtifacts === false, "no raw artifacts");
  assert(contract.containsSecrets === false, "no secrets");
  console.log("");

  // Test 12: Allowed observability signals
  console.log("Test 12: Allowed observability signals");
  assert(Array.isArray(contract.allowedObservabilitySignals) && contract.allowedObservabilitySignals.length >= 10, "allowed signals exist");
  assert(contract.allowedObservabilitySignals.some(s => s.includes("requestType")), "signal: requestType");
  assert(contract.allowedObservabilitySignals.some(s => s.includes("sidecarDecision")), "signal: sidecarDecision");
  assert(contract.allowedObservabilitySignals.some(s => s.includes("warningCount")), "signal: warningCount");
  assert(contract.allowedObservabilitySignals.some(s => s.includes("operatorApprovalPresent")), "signal: operatorApprovalPresent");
  assert(contract.allowedObservabilitySignals.some(s => s.includes("sanitizationStatus")), "signal: sanitizationStatus");
  assert(contract.allowedObservabilitySignals.some(s => s.includes("exceptionCategory")), "signal: exceptionCategory");
  console.log("");

  // Test 13: Prohibited observability signals
  console.log("Test 13: Prohibited observability signals");
  assert(Array.isArray(contract.prohibitedObservabilitySignals) && contract.prohibitedObservabilitySignals.length >= 10, "prohibited signals exist");
  assert(contract.prohibitedObservabilitySignals.some(s => s.includes("raw prompt")), "prohibited: raw prompt");
  assert(contract.prohibitedObservabilitySignals.some(s => s.includes("raw artifact")), "prohibited: raw artifact");
  assert(contract.prohibitedObservabilitySignals.some(s => s.includes("secrets")), "prohibited: secrets");
  assert(contract.prohibitedObservabilitySignals.some(s => s.includes("stdout")), "prohibited: stdout");
  assert(contract.prohibitedObservabilitySignals.some(s => s.includes("stderr")), "prohibited: stderr");
  assert(contract.prohibitedObservabilitySignals.some(s => s.includes("full CLI output")), "prohibited: full CLI output");
  assert(contract.prohibitedObservabilitySignals.some(s => s.includes("full warning text")), "prohibited: full warning text");
  assert(contract.prohibitedObservabilitySignals.some(s => s.includes("real API keys")), "prohibited: real API keys");
  assert(contract.prohibitedObservabilitySignals.some(s => s.includes("persisted")), "prohibited: persisted logs");
  console.log("");

  // Test 14: Observability shape
  console.log("Test 14: Observability shape");
  const shape = contract.observabilityShape;
  assert(shape !== undefined, "observability shape exists");
  assert(shape.sidecarDecision !== undefined, "shape: sidecarDecision");
  assert(shape.sidecarAttached !== undefined, "shape: sidecarAttached");
  assert(shape.sidecarOmitted !== undefined, "shape: sidecarOmitted");
  assert(shape.omitReason !== undefined, "shape: omitReason");
  assert(shape.requestType !== undefined, "shape: requestType");
  assert(shape.fallbackPolicy !== undefined, "shape: fallbackPolicy");
  assert(shape.fallbackPolicy.reason !== undefined, "shape: fallbackPolicy.reason");
  assert(shape.fallbackPolicy.action !== undefined, "shape: fallbackPolicy.action");
  assert(shape.observability !== undefined, "shape: observability");
  assert(shape.observability.outcome !== undefined, "shape: observability.outcome");
  assert(shape.observability.warningCount !== undefined, "shape: observability.warningCount");
  assert(shape.observability.hasWarnings !== undefined, "shape: observability.hasWarnings");
  assert(shape.guardrails !== undefined, "shape: guardrails");
  assert(shape.guardrails.decision !== undefined, "shape: guardrails.decision");
  assert(shape.guardrails.allowed !== undefined, "shape: guardrails.allowed");
  assert(shape.guardrails.warningCount !== undefined, "shape: guardrails.warningCount");
  assert(shape.guardrails.checks !== undefined, "shape: guardrails.checks");
  assert(shape.operatorApprovalPresent !== undefined, "shape: operatorApprovalPresent");
  assert(shape.requiredFlagsPresent !== undefined, "shape: requiredFlagsPresent");
  assert(shape.sanitizationStatus !== undefined, "shape: sanitizationStatus");
  assert(shape.metadataSafetyStatus !== undefined, "shape: metadataSafetyStatus");
  assert(shape.dispatcherOutcome !== undefined, "shape: dispatcherOutcome");
  assert(shape.exceptionCategory !== undefined, "shape: exceptionCategory");
  console.log("");

  // Test 15: Observability safety rules
  console.log("Test 15: Observability safety rules");
  assert(Array.isArray(contract.observabilitySafetyRules) && contract.observabilitySafetyRules.length >= 10, "observability safety rules exist");
  assert(contract.observabilitySafetyRules.some(r => r.includes("sidecar metadata only")), "rule: sidecar metadata only");
  assert(contract.observabilitySafetyRules.some(r => r.includes("Gateway primary/final result")), "rule: no gateway result change");
  assert(contract.observabilitySafetyRules.some(r => r.includes("Runtime final_status/routing")), "rule: no runtime change");
  assert(contract.observabilitySafetyRules.some(r => r.includes("raw prompt")), "rule: no raw prompt");
  assert(contract.observabilitySafetyRules.some(r => r.includes("raw artifacts")), "rule: no raw artifacts");
  assert(contract.observabilitySafetyRules.some(r => r.includes("secrets")), "rule: no secrets");
  assert(contract.observabilitySafetyRules.some(r => r.includes("stdout") || r.includes("stderr")), "rule: no stdout/stderr");
  assert(contract.observabilitySafetyRules.some(r => r.includes("full warning text")), "rule: no full warning text");
  assert(contract.observabilitySafetyRules.some(r => r.includes("persist logs") || r.includes("persistence")), "rule: no persistence");
  assert(contract.observabilitySafetyRules.some(r => r.includes("omit rather than leak")), "rule: omit rather than leak");
  console.log("");

  // Test 16: Markdown consistency
  console.log("Test 16: Markdown consistency");
  const md = fs.readFileSync("HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_OBSERVABILITY_CONTRACT.md", "utf-8");
  assert(md.includes("observability_contract_only"), "md: status");
  assert(md.includes("No Phase-2 enablement now"), "md: no enablement");
  assert(md.includes("No request type expansion now"), "md: no expansion");
  assert(md.includes("Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Guardrail Contract"), "md: next PR");
  console.log("");

  // Test 17: JSON consistency
  console.log("Test 17: JSON consistency");
  const jr = fs.readFileSync("hermes-gateway-real-dispatch-phase-2-shadow-enablement-observability-contract.json", "utf-8");
  const json = JSON.parse(jr);
  assert(json.status === "observability_contract_only", "json: status");
  assert(json.observability_contract_only === true, "json: observability contract only");
  assert(json.implements_now === false, "json: implements_now false");
  assert(json.adds_real_observability_collection_now === false, "json: adds_real_observability_collection_now false");
  assert(json.persists_observability_logs_now === false, "json: persists_observability_logs_now false");
  assert(json.changes_hermes_dispatch_eligibility_now === false, "json: no dispatch eligibility change");
  assert(json.recommended_next_pr.title === "Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Guardrail Contract", "json: next PR");
  console.log("");

  // Test 18: Forbidden imports
  console.log("Test 18: Forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement-observability-contract.ts", "utf-8");
  assert(!src.includes("import "), "no imports at all (pure static object)");
  console.log("");

  // Test 19: Forbidden runtime/script/CI changes
  console.log("Test 19: Forbidden runtime/script/CI changes");
  const rt = fs.readFileSync("runtime.ts", "utf-8");
  const gw = fs.readFileSync("execution/gateway.ts", "utf-8");
  const hd = fs.readFileSync("execution/hermes-gateway-real-dispatch.ts", "utf-8");
  const pj = fs.readFileSync("package.json", "utf-8");
  assert(!rt.includes("phase_2_shadow_enablement_observability_contract"), "runtime.ts no phase_2_shadow_enablement_observability_contract");
  assert(!gw.includes("phase_2_shadow_enablement_observability_contract"), "execution/gateway.ts no phase_2_shadow_enablement_observability_contract");
  assert(!hd.includes("phase_2_shadow_enablement_observability_contract"), "execution/hermes-gateway-real-dispatch.ts no phase_2_shadow_enablement_observability_contract");
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
