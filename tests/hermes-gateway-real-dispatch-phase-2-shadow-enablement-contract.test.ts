// Regression Test — Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Contract
// =================================================================================
// Contract-only. No Runtime, no Gateway, no CLI.

import {
  HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_CONTRACT,
} from "../execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement-contract";
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
  console.log("Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Contract Test\n");

  const contract = HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_CONTRACT;

  // Test 1: Object shape and status
  console.log("Test 1: Object shape and status");
  assert(contract.name === "Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Contract", "name");
  assert(contract.adapter === "hermes", "adapter");
  assert(contract.status === "contract_only", "status contract_only");
  assert(contract.contractOnly === true, "contractOnly true");
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

  // Test 4: Request scope
  console.log("Test 4: Request scope");
  assert(contract.currentReadinessVerdict === "READY_WITH_CONSTRAINTS", "verdict");
  assert(contract.currentValidatedRequestTypes.length === 1 && contract.currentValidatedRequestTypes[0] === "review", "current review only");
  assert(contract.phase2ShadowTargets.includes("code_review") && contract.phase2ShadowTargets.includes("validation"), "phase 2 shadow targets");
  assert(contract.supportedRequestTypes.includes("review") && contract.supportedRequestTypes.includes("code_review") && contract.supportedRequestTypes.includes("validation"), "supported types");
  assert(contract.unsupportedRequestTypes.includes("llm_task") && contract.unsupportedRequestTypes.includes("code_generation") && contract.unsupportedRequestTypes.includes("bugfix"), "unsupported types");
  assert(contract.requiredPrerequisites.length >= 10, "prerequisites exist");
  console.log("");

  // Test 5: Operator/automation constraints
  console.log("Test 5: Operator/automation constraints");
  assert(contract.operatorApprovalRequired === true, "operator required");
  assert(contract.automaticEnablementAllowed === false, "no auto enablement");
  assert(contract.rolloutMayProceedAutomatically === false, "no auto rollout");
  assert(contract.phase2MayProceedAutomatically === false, "no auto phase-2");
  assert(contract.requiresMultipleFlags === true, "multiple flags");
  assert(contract.requiredFlags.length === 3, "3 flags");
  console.log("");

  // Test 6: Gateway/Runtime behavior safety
  console.log("Test 6: Gateway/Runtime behavior safety");
  assert(contract.changesGatewayPrimaryDispatch === false, "no gateway primary dispatch change");
  assert(contract.changesGatewayFinalResult === false, "no gateway final result change");
  assert(contract.changesRuntimeFinalStatus === false, "no runtime final status change");
  assert(contract.changesRuntimeRouting === false, "no runtime routing change");
  assert(contract.affectsPrimaryGatewayResult === false, "no primary gateway result effect");
  console.log("");

  // Test 7: Dispatch eligibility safety
  console.log("Test 7: Dispatch eligibility safety");
  assert(contract.changesHermesDispatchEligibilityNow === false, "no hermes dispatch eligibility change now");
  console.log("");

  // Test 8: Ownership boundaries
  console.log("Test 8: Ownership boundaries");
  assert(contract.makesHermesDefault === false, "not default");
  assert(contract.makesHermesFinalReviewOwner === false, "not review owner");
  assert(contract.makesHermesFinalCodeReviewOwner === false, "not code review owner");
  assert(contract.makesHermesFinalValidationOwner === false, "not validation owner");
  console.log("");

  // Test 9: Persistence/leakage boundaries
  console.log("Test 9: Persistence/leakage boundaries");
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

  // Test 10: Attach contract
  console.log("Test 10: Attach contract");
  const attach = contract.attachContract;
  assert(attach !== undefined, "attach contract exists");
  assert(attach.mayAttachForRequestTypes.includes("code_review") && attach.mayAttachForRequestTypes.includes("validation"), "attach only code_review/validation");
  assert(attach.requiresAllHermesFlagsExplicitlyEnabled === true, "attach requires flags");
  assert(attach.requiresOperatorApproval === true, "attach requires operator");
  assert(attach.sidecarModeOnly === true, "attach sidecar only");
  assert(attach.attachUnderField === "hermes_gateway_real_dispatch", "attach under hermes_gateway_real_dispatch");
  assert(attach.mustNotAffectGatewayPrimaryResult === true, "attach no primary result change");
  assert(attach.mustNotAffectRuntimeFinalStatus === true, "attach no runtime final status change");
  console.log("");

  // Test 11: Omit contract
  console.log("Test 11: Omit contract");
  const omit = contract.omitContract;
  assert(omit !== undefined, "omit contract exists");
  assert(omit.omitWhenDisabled === true, "omit when disabled");
  assert(omit.omitWhenAnyRequiredFlagMissing === true, "omit when flag missing");
  assert(omit.omitWhenOperatorApprovalMissing === true, "omit when operator missing");
  assert(omit.omitForUnsupportedRequestTypes === true, "omit unsupported");
  assert(omit.omitForLlmTaskCodeGenerationBugfix === true, "omit llm_task/code_generation/bugfix");
  assert(omit.omitWhenMetadataUnsafe === true, "omit unsafe metadata");
  assert(omit.omitOnDispatcherException === true, "omit on exception");
  assert(omit.omitWhenSanitizationFails === true, "omit on sanitization failure");
  assert(omit.omitRatherThanDegradePrimaryGatewayResult === true, "omit rather than degrade");
  console.log("");

  // Test 12: Sidecar contract
  console.log("Test 12: Sidecar contract");
  const sidecar = contract.sidecarContract;
  assert(sidecar !== undefined, "sidecar contract exists");
  assert(sidecar.sidecarField === "hermes_gateway_real_dispatch", "sidecar field");
  assert(sidecar.containsOnlySanitizedSummaryMetadata === true, "sanitized summary only");
  assert(sidecar.containsRawPrompt === false, "sidecar no raw prompt");
  assert(sidecar.containsRawArtifacts === false, "sidecar no raw artifacts");
  assert(sidecar.containsSecrets === false, "sidecar no secrets");
  assert(sidecar.containsStdoutStderrOrFullCliOutput === false, "sidecar no stdout/stderr/full CLI");
  assert(sidecar.includesFallbackPolicySummary === true, "sidecar fallback summary");
  assert(sidecar.includesObservabilitySummary === true, "sidecar observability summary");
  assert(sidecar.includesGuardrailsSummary === true, "sidecar guardrails summary");
  assert(sidecar.preservesPrimaryGatewayResult === true, "sidecar preserves primary result");
  assert(sidecar.preservesRuntimeFinalStatus === true, "sidecar preserves final_status");
  console.log("");

  // Test 13: Safety contract
  console.log("Test 13: Safety contract");
  const safety = contract.safetyContract;
  assert(safety !== undefined, "safety contract exists");
  assert(safety.defaultDisabled === true, "safety default disabled");
  assert(safety.featureFlagged === true, "safety feature flagged");
  assert(safety.operatorApprovalRequired === true, "safety operator required");
  assert(safety.automaticEnablementDisallowed === true, "safety no auto enablement");
  assert(safety.automaticRolloutDisallowed === true, "safety no auto rollout");
  assert(safety.automaticPhase2ExpansionDisallowed === true, "safety no auto phase-2");
  assert(safety.noPackageScriptCiEnablement === true, "safety no package/script/CI enablement");
  assert(safety.noRealHermesCliInTests === true, "safety no real CLI in tests");
  assert(safety.noPersistenceWithoutSeparateContract === true, "safety no persistence without contract");
  console.log("");

  // Test 14: Required test contract
  console.log("Test 14: Required test contract");
  assert(Array.isArray(contract.requiredTestContract) && contract.requiredTestContract.length >= 10, "required test contract exists");
  assert(contract.requiredTestContract.some(t => t.includes("disabled path")), "test: disabled");
  assert(contract.requiredTestContract.some(t => t.includes("missing flag")), "test: missing flag");
  assert(contract.requiredTestContract.some(t => t.includes("operator approval")), "test: operator approval");
  assert(contract.requiredTestContract.some(t => t.includes("unsupported request type")), "test: unsupported");
  assert(contract.requiredTestContract.some(t => t.includes("unsafe metadata")), "test: unsafe metadata");
  assert(contract.requiredTestContract.some(t => t.includes("dispatcher exception")), "test: exception");
  assert(contract.requiredTestContract.some(t => t.includes("sanitization failure")), "test: sanitization");
  assert(contract.requiredTestContract.some(t => t.includes("code_review")), "test: code_review");
  assert(contract.requiredTestContract.some(t => t.includes("validation")), "test: validation");
  assert(contract.requiredTestContract.some(t => t.includes("no real Hermes CLI")), "test: no real CLI");
  console.log("");

  // Test 15: Prohibited behaviors
  console.log("Test 15: Prohibited behaviors");
  assert(Array.isArray(contract.prohibitedBehaviors) && contract.prohibitedBehaviors.length >= 10, "prohibited behaviors exist");
  assert(contract.prohibitedBehaviors.some(b => b.includes("Runtime final_status")), "prohibited: final_status");
  assert(contract.prohibitedBehaviors.some(b => b.includes("Runtime routing")), "prohibited: routing");
  assert(contract.prohibitedBehaviors.some(b => b.includes("Gateway primary")), "prohibited: gateway primary");
  assert(contract.prohibitedBehaviors.some(b => b.includes("Hermes dispatch eligibility")), "prohibited: dispatch eligibility");
  assert(contract.prohibitedBehaviors.some(b => b.includes("default")), "prohibited: default");
  assert(contract.prohibitedBehaviors.some(b => b.includes("raw prompt") || b.includes("raw prompts")), "prohibited: raw prompt");
  assert(contract.prohibitedBehaviors.some(b => b.includes("llm_task")), "prohibited: llm_task");
  console.log("");

  // Test 16: Markdown consistency
  console.log("Test 16: Markdown consistency");
  const md = fs.readFileSync("HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_CONTRACT.md", "utf-8");
  assert(md.includes("contract_only"), "md: status");
  assert(md.includes("No Phase-2 enablement now"), "md: no enablement");
  assert(md.includes("No request type expansion now"), "md: no expansion");
  assert(md.includes("Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Fixture Contract"), "md: next PR");
  console.log("");

  // Test 17: JSON consistency
  console.log("Test 17: JSON consistency");
  const jr = fs.readFileSync("hermes-gateway-real-dispatch-phase-2-shadow-enablement-contract.json", "utf-8");
  const json = JSON.parse(jr);
  assert(json.status === "contract_only", "json: status");
  assert(json.contract_only === true, "json: contract only");
  assert(json.implements_now === false, "json: implements_now false");
  assert(json.changes_hermes_dispatch_eligibility_now === false, "json: no dispatch eligibility change");
  assert(json.recommended_next_pr.title === "Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Fixture Contract", "json: next PR");
  console.log("");

  // Test 18: Forbidden imports
  console.log("Test 18: Forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement-contract.ts", "utf-8");
  assert(!src.includes("import "), "no imports at all (pure static object)");
  console.log("");

  // Test 19: Forbidden runtime/script/CI changes
  console.log("Test 19: Forbidden runtime/script/CI changes");
  const rt = fs.readFileSync("runtime.ts", "utf-8");
  const gw = fs.readFileSync("execution/gateway.ts", "utf-8");
  const hd = fs.readFileSync("execution/hermes-gateway-real-dispatch.ts", "utf-8");
  const pj = fs.readFileSync("package.json", "utf-8");
  assert(!rt.includes("phase_2_shadow_enablement_contract"), "runtime.ts no phase_2_shadow_enablement_contract");
  assert(!gw.includes("phase_2_shadow_enablement_contract"), "execution/gateway.ts no phase_2_shadow_enablement_contract");
  assert(!hd.includes("phase_2_shadow_enablement_contract"), "execution/hermes-gateway-real-dispatch.ts no phase_2_shadow_enablement_contract");
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
