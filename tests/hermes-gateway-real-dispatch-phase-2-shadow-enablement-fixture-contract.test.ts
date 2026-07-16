// Regression Test — Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Fixture Contract
// ==========================================================================================
// Fixture-contract-only. No Runtime, no Gateway, no CLI.

import {
  HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_FIXTURE_CONTRACT,
} from "../execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement-fixture-contract";
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
  console.log("Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Fixture Contract Test\n");

  const contract = HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_FIXTURE_CONTRACT;

  // Test 1: Object shape and status
  console.log("Test 1: Object shape and status");
  assert(contract.name === "Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Fixture Contract", "name");
  assert(contract.adapter === "hermes", "adapter");
  assert(contract.status === "fixture_contract_only", "status fixture_contract_only");
  assert(contract.fixtureContractOnly === true, "fixtureContractOnly true");
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

  // Test 4: Real implementation fixtures not added now
  console.log("Test 4: Real implementation fixtures not added now");
  assert(contract.addsRealImplementationFixturesNow === false, "addsRealImplementationFixturesNow false");
  console.log("");

  // Test 5: Real implementation tests not added now
  console.log("Test 5: Real implementation tests not added now");
  assert(contract.addsRealImplementationTestsNow === false, "addsRealImplementationTestsNow false");
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

  // Test 12: Fixture groups
  console.log("Test 12: Fixture groups");
  assert(Array.isArray(contract.fixtureGroups) && contract.fixtureGroups.length >= 10, "fixture groups exist");
  assert(contract.fixtureGroups.some(g => g.includes("code_review")), "group: code_review");
  assert(contract.fixtureGroups.some(g => g.includes("validation")), "group: validation");
  assert(contract.fixtureGroups.some(g => g.includes("llm_task")), "group: llm_task");
  assert(contract.fixtureGroups.some(g => g.includes("code_generation")), "group: code_generation");
  assert(contract.fixtureGroups.some(g => g.includes("bugfix")), "group: bugfix");
  assert(contract.fixtureGroups.some(g => g.includes("operator_approval")), "group: operator approval");
  assert(contract.fixtureGroups.some(g => g.includes("unsafe_metadata")), "group: unsafe metadata");
  assert(contract.fixtureGroups.some(g => g.includes("dispatcher_exception")), "group: dispatcher exception");
  assert(contract.fixtureGroups.some(g => g.includes("sanitization_failure")), "group: sanitization failure");
  console.log("");

  // Test 13: Required fixture shapes
  console.log("Test 13: Required fixture shapes");
  const shapes = contract.requiredFixtureShapes;
  assert(shapes !== undefined, "fixture shapes exist");
  assert(shapes.safe_code_review_request !== undefined, "shape: safe code_review");
  assert(shapes.safe_validation_request !== undefined, "shape: safe validation");
  assert(shapes.unsupported_request !== undefined, "shape: unsupported");
  assert(shapes.missing_flag_request !== undefined, "shape: missing flag");
  assert(shapes.missing_operator_approval !== undefined, "shape: missing operator approval");
  assert(shapes.unsafe_metadata_request !== undefined, "shape: unsafe metadata");
  assert(shapes.dispatcher_exception_result !== undefined, "shape: dispatcher exception");
  assert(shapes.sanitization_failure_result !== undefined, "shape: sanitization failure");
  assert(shapes.safe_code_review_request.requestType === "code_review", "code_review shape requestType");
  assert(shapes.safe_validation_request.requestType === "validation", "validation shape requestType");
  assert(shapes.safe_code_review_request.containsRawPrompt === false, "code_review shape no raw prompt");
  assert(shapes.safe_code_review_request.containsRawArtifacts === false, "code_review shape no raw artifacts");
  assert(shapes.safe_code_review_request.containsSecrets === false, "code_review shape no secrets");
  assert(shapes.safe_validation_request.containsRawPrompt === false, "validation shape no raw prompt");
  assert(shapes.safe_validation_request.containsRawArtifacts === false, "validation shape no raw artifacts");
  assert(shapes.safe_validation_request.containsSecrets === false, "validation shape no secrets");
  console.log("");

  // Test 14: Fixture safety rules
  console.log("Test 14: Fixture safety rules");
  assert(Array.isArray(contract.fixtureSafetyRules) && contract.fixtureSafetyRules.length >= 10, "fixture safety rules exist");
  assert(contract.fixtureSafetyRules.some(r => r.includes("synthetic")), "rule: synthetic");
  assert(contract.fixtureSafetyRules.some(r => r.includes("sanitized")), "rule: sanitized");
  assert(contract.fixtureSafetyRules.some(r => r.includes("real prompts")), "rule: no real prompts");
  assert(contract.fixtureSafetyRules.some(r => r.includes("raw artifacts")), "rule: no raw artifacts");
  assert(contract.fixtureSafetyRules.some(r => r.includes("secrets")), "rule: no secrets");
  assert(contract.fixtureSafetyRules.some(r => r.includes("stdout") || r.includes("stderr")), "rule: no stdout/stderr");
  assert(contract.fixtureSafetyRules.some(r => r.includes("real API keys")), "rule: no real API keys");
  assert(contract.fixtureSafetyRules.some(r => r.includes("real Hermes CLI")), "rule: no real Hermes CLI");
  assert(contract.fixtureSafetyRules.some(r => r.includes("external processes")), "rule: no external processes");
  assert(contract.fixtureSafetyRules.some(r => r.includes("persist")), "rule: no persistence");
  console.log("");

  // Test 15: Prohibited fixture data
  console.log("Test 15: Prohibited fixture data");
  assert(Array.isArray(contract.prohibitedFixtureData) && contract.prohibitedFixtureData.length >= 10, "prohibited fixture data exist");
  assert(contract.prohibitedFixtureData.some(d => d.includes("raw prompts")), "prohibited: raw prompts");
  assert(contract.prohibitedFixtureData.some(d => d.includes("raw artifacts")), "prohibited: raw artifacts");
  assert(contract.prohibitedFixtureData.some(d => d.includes("secrets")), "prohibited: secrets");
  assert(contract.prohibitedFixtureData.some(d => d.includes("credentials")), "prohibited: credentials");
  assert(contract.prohibitedFixtureData.some(d => d.includes("tokens")), "prohibited: tokens");
  assert(contract.prohibitedFixtureData.some(d => d.includes("customer data")), "prohibited: customer data");
  assert(contract.prohibitedFixtureData.some(d => d.includes("stdout")), "prohibited: stdout");
  assert(contract.prohibitedFixtureData.some(d => d.includes("stderr")), "prohibited: stderr");
  assert(contract.prohibitedFixtureData.some(d => d.includes("real API keys")), "prohibited: real API keys");
  assert(contract.prohibitedFixtureData.some(d => d.includes("persisted")), "prohibited: persisted logs");
  console.log("");

  // Test 16: Markdown consistency
  console.log("Test 16: Markdown consistency");
  const md = fs.readFileSync("docs/capabilities/hermes/phase-2/HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_FIXTURE_CONTRACT.md", "utf-8");
  assert(md.includes("fixture_contract_only"), "md: status");
  assert(md.includes("No Phase-2 enablement now"), "md: no enablement");
  assert(md.includes("No request type expansion now"), "md: no expansion");
  assert(md.includes("Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Observability Contract"), "md: next PR");
  console.log("");

  // Test 17: JSON consistency
  console.log("Test 17: JSON consistency");
  const jr = fs.readFileSync("metadata/capabilities/hermes/phase-2/hermes-gateway-real-dispatch-phase-2-shadow-enablement-fixture-contract.json", "utf-8");
  const json = JSON.parse(jr);
  assert(json.status === "fixture_contract_only", "json: status");
  assert(json.fixture_contract_only === true, "json: fixture contract only");
  assert(json.implements_now === false, "json: implements_now false");
  assert(json.adds_real_implementation_fixtures_now === false, "json: adds_real_implementation_fixtures_now false");
  assert(json.adds_real_implementation_tests_now === false, "json: adds_real_implementation_tests_now false");
  assert(json.changes_hermes_dispatch_eligibility_now === false, "json: no dispatch eligibility change");
  assert(json.recommended_next_pr.title === "Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Observability Contract", "json: next PR");
  console.log("");

  // Test 18: Forbidden imports
  console.log("Test 18: Forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement-fixture-contract.ts", "utf-8");
  assert(!src.includes("import "), "no imports at all (pure static object)");
  console.log("");

  // Test 19: Forbidden runtime/script/CI changes
  console.log("Test 19: Forbidden runtime/script/CI changes");
  const rt = fs.readFileSync("runtime.ts", "utf-8");
  const gw = fs.readFileSync("execution/gateway.ts", "utf-8");
  const hd = fs.readFileSync("execution/hermes-gateway-real-dispatch.ts", "utf-8");
  const pj = fs.readFileSync("package.json", "utf-8");
  assert(!rt.includes("phase_2_shadow_enablement_fixture_contract"), "runtime.ts no phase_2_shadow_enablement_fixture_contract");
  assert(!gw.includes("phase_2_shadow_enablement_fixture_contract"), "execution/gateway.ts no phase_2_shadow_enablement_fixture_contract");
  assert(!hd.includes("phase_2_shadow_enablement_fixture_contract"), "execution/hermes-gateway-real-dispatch.ts no phase_2_shadow_enablement_fixture_contract");
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
