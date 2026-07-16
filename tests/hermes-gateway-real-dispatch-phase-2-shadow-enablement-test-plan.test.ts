// Regression Test — Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Test Plan
// ===================================================================================
// Test-plan-only. No Runtime, no Gateway, no CLI.

import {
  HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_TEST_PLAN,
} from "../execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement-test-plan";
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
  console.log("Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Test Plan Test\n");

  const plan = HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_TEST_PLAN;

  // Test 1: Object shape and status
  console.log("Test 1: Object shape and status");
  assert(plan.name === "Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Test Plan", "name");
  assert(plan.adapter === "hermes", "adapter");
  assert(plan.status === "test_plan_only", "status test_plan_only");
  assert(plan.testPlanOnly === true, "testPlanOnly true");
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

  // Test 3: Implementation is not happening now
  console.log("Test 3: Implementation is not happening now");
  assert(plan.implementsNow === false, "implementsNow false");
  assert(plan.changesHermesDispatchEligibilityNow === false, "no dispatch eligibility change now");
  console.log("");

  // Test 4: Real implementation tests not added now
  console.log("Test 4: Real implementation tests not added now");
  assert(plan.addsRealImplementationTestsNow === false, "addsRealImplementationTestsNow false");
  console.log("");

  // Test 5: Request scope
  console.log("Test 5: Request scope");
  assert(plan.currentReadinessVerdict === "READY_WITH_CONSTRAINTS", "verdict");
  assert(plan.currentValidatedRequestTypes.length === 1 && plan.currentValidatedRequestTypes[0] === "review", "current review only");
  assert(plan.phase2ShadowTargets.includes("code_review") && plan.phase2ShadowTargets.includes("validation"), "phase 2 shadow targets");
  assert(plan.supportedRequestTypes.includes("review") && plan.supportedRequestTypes.includes("code_review") && plan.supportedRequestTypes.includes("validation"), "supported types");
  assert(plan.unsupportedRequestTypes.includes("llm_task") && plan.unsupportedRequestTypes.includes("code_generation") && plan.unsupportedRequestTypes.includes("bugfix"), "unsupported types");
  assert(plan.requiredPrerequisites.length >= 10, "prerequisites exist");
  console.log("");

  // Test 6: Operator/automation constraints
  console.log("Test 6: Operator/automation constraints");
  assert(plan.operatorApprovalRequired === true, "operator required");
  assert(plan.automaticEnablementAllowed === false, "no auto enablement");
  assert(plan.rolloutMayProceedAutomatically === false, "no auto rollout");
  assert(plan.phase2MayProceedAutomatically === false, "no auto phase-2");
  assert(plan.requiresMultipleFlags === true, "multiple flags");
  assert(plan.requiredFlags.length === 3, "3 flags");
  console.log("");

  // Test 7: Gateway/Runtime behavior safety
  console.log("Test 7: Gateway/Runtime behavior safety");
  assert(plan.changesGatewayPrimaryDispatch === false, "no gateway primary dispatch change");
  assert(plan.changesGatewayFinalResult === false, "no gateway final result change");
  assert(plan.changesRuntimeFinalStatus === false, "no runtime final status change");
  assert(plan.changesRuntimeRouting === false, "no runtime routing change");
  assert(plan.affectsPrimaryGatewayResult === false, "no primary gateway result effect");
  console.log("");

  // Test 8: Dispatch eligibility safety
  console.log("Test 8: Dispatch eligibility safety");
  assert(plan.changesHermesDispatchEligibilityNow === false, "no hermes dispatch eligibility change now");
  console.log("");

  // Test 9: Ownership boundaries
  console.log("Test 9: Ownership boundaries");
  assert(plan.makesHermesDefault === false, "not default");
  assert(plan.makesHermesFinalReviewOwner === false, "not review owner");
  assert(plan.makesHermesFinalCodeReviewOwner === false, "not code review owner");
  assert(plan.makesHermesFinalValidationOwner === false, "not validation owner");
  console.log("");

  // Test 10: Persistence/leakage boundaries
  console.log("Test 10: Persistence/leakage boundaries");
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

  // Test 11: Required test suites
  console.log("Test 11: Required test suites");
  assert(Array.isArray(plan.requiredTestSuites) && plan.requiredTestSuites.length >= 10, "required test suites exist");
  assert(plan.requiredTestSuites.some(s => s.includes("disabled")), "suite: disabled");
  assert(plan.requiredTestSuites.some(s => s.includes("missing flag")), "suite: missing flag");
  assert(plan.requiredTestSuites.some(s => s.includes("operator approval")), "suite: operator approval");
  assert(plan.requiredTestSuites.some(s => s.includes("unsupported")), "suite: unsupported");
  assert(plan.requiredTestSuites.some(s => s.includes("unsafe metadata")), "suite: unsafe metadata");
  assert(plan.requiredTestSuites.some(s => s.includes("dispatcher exception")), "suite: dispatcher exception");
  assert(plan.requiredTestSuites.some(s => s.includes("code_review")), "suite: code_review");
  assert(plan.requiredTestSuites.some(s => s.includes("validation")), "suite: validation");
  assert(plan.requiredTestSuites.some(s => s.includes("rollback")), "suite: rollback");
  console.log("");

  // Test 12: Required path coverage
  console.log("Test 12: Required path coverage");
  assert(Array.isArray(plan.requiredPathCoverage) && plan.requiredPathCoverage.length >= 10, "required path coverage exists");
  assert(plan.requiredPathCoverage.some(p => p.includes("disabled")), "path: disabled");
  assert(plan.requiredPathCoverage.some(p => p.includes("SDLC_HERMES_GATEWAY_REAL_DISPATCH")), "path: real dispatch flag");
  assert(plan.requiredPathCoverage.some(p => p.includes("SDLC_HERMES_GATEWAY_INTEGRATION")), "path: integration flag");
  assert(plan.requiredPathCoverage.some(p => p.includes("SDLC_HERMES_CLI_COMMAND_EXECUTION")), "path: CLI flag");
  assert(plan.requiredPathCoverage.some(p => p.includes("operator approval")), "path: operator approval");
  assert(plan.requiredPathCoverage.some(p => p.includes("llm_task")), "path: llm_task");
  assert(plan.requiredPathCoverage.some(p => p.includes("code_generation")), "path: code_generation");
  assert(plan.requiredPathCoverage.some(p => p.includes("bugfix")), "path: bugfix");
  assert(plan.requiredPathCoverage.some(p => p.includes("unsafe metadata")), "path: unsafe metadata");
  assert(plan.requiredPathCoverage.some(p => p.includes("dispatcher exception")), "path: dispatcher exception");
  assert(plan.requiredPathCoverage.some(p => p.includes("sanitization failure")), "path: sanitization failure");
  assert(plan.requiredPathCoverage.some(p => p.includes("code_review")), "path: code_review");
  assert(plan.requiredPathCoverage.some(p => p.includes("validation")), "path: validation");
  console.log("");

  // Test 13: Required safety assertions
  console.log("Test 13: Required safety assertions");
  assert(Array.isArray(plan.requiredSafetyAssertions) && plan.requiredSafetyAssertions.length >= 10, "required safety assertions exist");
  assert(plan.requiredSafetyAssertions.some(a => a.includes("Gateway primary result")), "safety: gateway primary");
  assert(plan.requiredSafetyAssertions.some(a => a.includes("Gateway final result")), "safety: gateway final");
  assert(plan.requiredSafetyAssertions.some(a => a.includes("Runtime final_status")), "safety: runtime final_status");
  assert(plan.requiredSafetyAssertions.some(a => a.includes("Runtime routing")), "safety: runtime routing");
  assert(plan.requiredSafetyAssertions.some(a => a.includes("final code_review decision")), "safety: code_review ownership");
  assert(plan.requiredSafetyAssertions.some(a => a.includes("final validation decision")), "safety: validation ownership");
  assert(plan.requiredSafetyAssertions.some(a => a.includes("raw prompt")), "safety: raw prompt");
  assert(plan.requiredSafetyAssertions.some(a => a.includes("raw artifacts")), "safety: raw artifacts");
  assert(plan.requiredSafetyAssertions.some(a => a.includes("secrets")), "safety: secrets");
  assert(plan.requiredSafetyAssertions.some(a => a.includes("stdout") || a.includes("stderr")), "safety: stdout/stderr");
  console.log("");

  // Test 14: Required fixture coverage
  console.log("Test 14: Required fixture coverage");
  assert(Array.isArray(plan.requiredFixtureCoverage) && plan.requiredFixtureCoverage.length >= 8, "required fixture coverage exists");
  assert(plan.requiredFixtureCoverage.some(f => f.includes("code_review")), "fixture: code_review");
  assert(plan.requiredFixtureCoverage.some(f => f.includes("validation")), "fixture: validation");
  assert(plan.requiredFixtureCoverage.some(f => f.includes("llm_task")), "fixture: llm_task");
  assert(plan.requiredFixtureCoverage.some(f => f.includes("code_generation")), "fixture: code_generation");
  assert(plan.requiredFixtureCoverage.some(f => f.includes("bugfix")), "fixture: bugfix");
  assert(plan.requiredFixtureCoverage.some(f => f.includes("unsafe metadata")), "fixture: unsafe metadata");
  assert(plan.requiredFixtureCoverage.some(f => f.includes("dispatcher exception")), "fixture: dispatcher exception");
  assert(plan.requiredFixtureCoverage.some(f => f.includes("sanitization failure")), "fixture: sanitization failure");
  assert(plan.requiredFixtureCoverage.some(f => f.includes("operator approval")), "fixture: operator approval");
  console.log("");

  // Test 15: Prohibited test behaviors
  console.log("Test 15: Prohibited test behaviors");
  assert(Array.isArray(plan.prohibitedTestBehaviors) && plan.prohibitedTestBehaviors.length >= 10, "prohibited test behaviors exist");
  assert(plan.prohibitedTestBehaviors.some(b => b.includes("Calling real Hermes CLI")), "prohibited: real CLI");
  assert(plan.prohibitedTestBehaviors.some(b => b.includes("Spawning real external processes")), "prohibited: spawn processes");
  assert(plan.prohibitedTestBehaviors.some(b => b.includes("Reading real API keys")), "prohibited: API keys");
  assert(plan.prohibitedTestBehaviors.some(b => b.includes("Enabling Hermes flags in package scripts")), "prohibited: package scripts");
  assert(plan.prohibitedTestBehaviors.some(b => b.includes("Enabling Hermes flags in CI")), "prohibited: CI");
  assert(plan.prohibitedTestBehaviors.some(b => b.includes("Changing Runtime behavior")), "prohibited: runtime");
  assert(plan.prohibitedTestBehaviors.some(b => b.includes("Changing Gateway behavior")), "prohibited: gateway");
  assert(plan.prohibitedTestBehaviors.some(b => b.includes("Changing Hermes dispatch eligibility")), "prohibited: dispatch eligibility");
  assert(plan.prohibitedTestBehaviors.some(b => b.includes("raw prompts")), "prohibited: raw prompts");
  console.log("");

  // Test 16: Markdown consistency
  console.log("Test 16: Markdown consistency");
  const md = fs.readFileSync("docs/capabilities/hermes/phase-2/HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_TEST_PLAN.md", "utf-8");
  assert(md.includes("test_plan_only"), "md: status");
  assert(md.includes("No Phase-2 enablement now"), "md: no enablement");
  assert(md.includes("No request type expansion now"), "md: no expansion");
  assert(md.includes("Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Fixture Contract"), "md: next PR");
  console.log("");

  // Test 17: JSON consistency
  console.log("Test 17: JSON consistency");
  const jr = fs.readFileSync("metadata/capabilities/hermes/phase-2/hermes-gateway-real-dispatch-phase-2-shadow-enablement-test-plan.json", "utf-8");
  const json = JSON.parse(jr);
  assert(json.status === "test_plan_only", "json: status");
  assert(json.test_plan_only === true, "json: test plan only");
  assert(json.implements_now === false, "json: implements_now false");
  assert(json.adds_real_implementation_tests_now === false, "json: adds_real_implementation_tests_now false");
  assert(json.changes_hermes_dispatch_eligibility_now === false, "json: no dispatch eligibility change");
  assert(json.recommended_next_pr.title === "Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Fixture Contract", "json: next PR");
  console.log("");

  // Test 18: Forbidden imports
  console.log("Test 18: Forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement-test-plan.ts", "utf-8");
  assert(!src.includes("import "), "no imports at all (pure static object)");
  console.log("");

  // Test 19: Forbidden runtime/script/CI changes
  console.log("Test 19: Forbidden runtime/script/CI changes");
  const rt = fs.readFileSync("runtime.ts", "utf-8");
  const gw = fs.readFileSync("execution/gateway.ts", "utf-8");
  const hd = fs.readFileSync("execution/hermes-gateway-real-dispatch.ts", "utf-8");
  const pj = fs.readFileSync("package.json", "utf-8");
  assert(!rt.includes("phase_2_shadow_enablement_test_plan"), "runtime.ts no phase_2_shadow_enablement_test_plan");
  assert(!gw.includes("phase_2_shadow_enablement_test_plan"), "execution/gateway.ts no phase_2_shadow_enablement_test_plan");
  assert(!hd.includes("phase_2_shadow_enablement_test_plan"), "execution/hermes-gateway-real-dispatch.ts no phase_2_shadow_enablement_test_plan");
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
