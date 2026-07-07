// Regression Test — Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Implementation Plan
// =============================================================================================
// Plan-only. No Runtime, no Gateway, no CLI.

import {
  HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_IMPLEMENTATION_PLAN,
} from "../execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement-implementation-plan";
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
  console.log("Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Implementation Plan Test\n");

  const plan = HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_IMPLEMENTATION_PLAN;

  // Test 1: Object shape and status
  console.log("Test 1: Object shape and status");
  assert(plan.name === "Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Implementation Plan", "name");
  assert(plan.adapter === "hermes", "adapter");
  assert(plan.status === "plan_only", "status plan_only");
  assert(plan.planOnly === true, "planOnly true");
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

  // Test 4: Request scope
  console.log("Test 4: Request scope");
  assert(plan.currentReadinessVerdict === "READY_WITH_CONSTRAINTS", "verdict");
  assert(plan.currentValidatedRequestTypes.length === 1 && plan.currentValidatedRequestTypes[0] === "review", "current review only");
  assert(plan.phase2ShadowTargets.includes("code_review") && plan.phase2ShadowTargets.includes("validation"), "phase 2 shadow targets");
  assert(plan.supportedRequestTypes.includes("review") && plan.supportedRequestTypes.includes("code_review") && plan.supportedRequestTypes.includes("validation"), "supported types");
  assert(plan.unsupportedRequestTypes.includes("llm_task") && plan.unsupportedRequestTypes.includes("code_generation") && plan.unsupportedRequestTypes.includes("bugfix"), "unsupported types");
  assert(plan.requiredPrerequisites.length >= 10, "prerequisites exist");
  console.log("");

  // Test 5: Operator/automation constraints
  console.log("Test 5: Operator/automation constraints");
  assert(plan.operatorApprovalRequired === true, "operator required");
  assert(plan.automaticEnablementAllowed === false, "no auto enablement");
  assert(plan.rolloutMayProceedAutomatically === false, "no auto rollout");
  assert(plan.phase2MayProceedAutomatically === false, "no auto phase 2");
  assert(plan.requiresMultipleFlags === true, "multiple flags");
  assert(plan.requiredFlags.length === 3, "3 flags");
  console.log("");

  // Test 6: Gateway/Runtime behavior safety
  console.log("Test 6: Gateway/Runtime behavior safety");
  assert(plan.changesGatewayPrimaryDispatch === false, "no gateway primary dispatch change");
  assert(plan.changesGatewayFinalResult === false, "no gateway final result change");
  assert(plan.changesRuntimeFinalStatus === false, "no runtime final status change");
  assert(plan.changesRuntimeRouting === false, "no runtime routing change");
  assert(plan.affectsPrimaryGatewayResult === false, "no primary gateway result effect");
  console.log("");

  // Test 7: Dispatch eligibility safety
  console.log("Test 7: Dispatch eligibility safety");
  assert(plan.changesHermesDispatchEligibilityNow === false, "no hermes dispatch eligibility change now");
  console.log("");

  // Test 8: Ownership boundaries
  console.log("Test 8: Ownership boundaries");
  assert(plan.makesHermesDefault === false, "not default");
  assert(plan.makesHermesFinalReviewOwner === false, "not review owner");
  assert(plan.makesHermesFinalCodeReviewOwner === false, "not code review owner");
  assert(plan.makesHermesFinalValidationOwner === false, "not validation owner");
  console.log("");

  // Test 9: Persistence/leakage boundaries
  console.log("Test 9: Persistence/leakage boundaries");
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

  // Test 10: Implementation phases
  console.log("Test 10: Implementation phases");
  assert(Array.isArray(plan.implementationPhases) && plan.implementationPhases.length >= 6, "phases exist");
  assert(plan.implementationPhases.some(p => p.includes("shadow-only eligibility")), "phase: eligibility");
  assert(plan.implementationPhases.some(p => p.includes("disabled-by-default")), "phase: disabled-by-default");
  assert(plan.implementationPhases.some(p => p.includes("sidecar-only")), "phase: sidecar-only");
  assert(plan.implementationPhases.some(p => p.includes("fake-runner tests")), "phase: fake-runner tests");
  console.log("");

  // Test 11: Required shadow behaviors
  console.log("Test 11: Required shadow behaviors");
  assert(Array.isArray(plan.requiredShadowBehaviors) && plan.requiredShadowBehaviors.length >= 8, "shadow behaviors exist");
  assert(plan.requiredShadowBehaviors.some(b => b.includes("explicit flags")), "behavior: explicit flags");
  assert(plan.requiredShadowBehaviors.some(b => b.includes("Gateway primary/final result")), "behavior: gateway result");
  assert(plan.requiredShadowBehaviors.some(b => b.includes("Runtime final_status/routing")), "behavior: runtime");
  assert(plan.requiredShadowBehaviors.some(b => b.includes("hermes_gateway_real_dispatch")), "behavior: nested field");
  assert(plan.requiredShadowBehaviors.some(b => b.includes("omit when disabled")), "behavior: omit disabled");
  assert(plan.requiredShadowBehaviors.some(b => b.includes("final code_review decision")), "behavior: not final code_review");
  assert(plan.requiredShadowBehaviors.some(b => b.includes("final validation decision")), "behavior: not final validation");
  console.log("");

  // Test 12: Required test coverage
  console.log("Test 12: Required test coverage");
  assert(Array.isArray(plan.requiredTestCoverage) && plan.requiredTestCoverage.length >= 8, "test coverage exists");
  assert(plan.requiredTestCoverage.some(t => t.includes("disabled")), "test: disabled");
  assert(plan.requiredTestCoverage.some(t => t.includes("unsupported")), "test: unsupported");
  assert(plan.requiredTestCoverage.some(t => t.includes("exception")), "test: exception");
  assert(plan.requiredTestCoverage.some(t => t.includes("code_review")), "test: code_review");
  assert(plan.requiredTestCoverage.some(t => t.includes("validation")), "test: validation");
  assert(plan.requiredTestCoverage.some(t => t.includes("rollback")), "test: rollback");
  console.log("");

  // Test 13: Prohibited implementation behaviors
  console.log("Test 13: Prohibited implementation behaviors");
  assert(Array.isArray(plan.prohibitedImplementationBehaviors) && plan.prohibitedImplementationBehaviors.length >= 10, "prohibited behaviors exist");
  assert(plan.prohibitedImplementationBehaviors.some(b => b.includes("Runtime final_status")), "prohibited: final_status");
  assert(plan.prohibitedImplementationBehaviors.some(b => b.includes("Runtime routing")), "prohibited: routing");
  assert(plan.prohibitedImplementationBehaviors.some(b => b.includes("Gateway primary")), "prohibited: gateway primary");
  assert(plan.prohibitedImplementationBehaviors.some(b => b.includes("Hermes dispatch eligibility")), "prohibited: dispatch eligibility");
  assert(plan.prohibitedImplementationBehaviors.some(b => b.includes("default")), "prohibited: default");
  assert(plan.prohibitedImplementationBehaviors.some(b => b.includes("raw prompt") || b.includes("raw prompts")), "prohibited: raw prompt");
  assert(plan.prohibitedImplementationBehaviors.some(b => b.includes("llm_task")), "prohibited: llm_task");
  console.log("");

  // Test 14: Rollback required conditions
  console.log("Test 14: Rollback required conditions");
  assert(Array.isArray(plan.rollbackRequiredWhen) && plan.rollbackRequiredWhen.length >= 8, "rollback conditions exist");
  assert(plan.rollbackRequiredWhen.some(r => r.includes("final code_review decision")), "rollback: code_review");
  assert(plan.rollbackRequiredWhen.some(r => r.includes("final_status") || r.includes("routing")), "rollback: final_status/routing");
  assert(plan.rollbackRequiredWhen.some(r => r.includes("enabled by default")), "rollback: default enabled");
  console.log("");

  // Test 15: Markdown consistency
  console.log("Test 15: Markdown consistency");
  const md = fs.readFileSync("HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_IMPLEMENTATION_PLAN.md", "utf-8");
  assert(md.includes("plan_only"), "md: status");
  assert(md.includes("No Phase-2 enablement now"), "md: no enablement");
  assert(md.includes("No request type expansion now"), "md: no expansion");
  assert(md.includes("Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Contract"), "md: next PR");
  console.log("");

  // Test 16: JSON consistency
  console.log("Test 16: JSON consistency");
  const jr = fs.readFileSync("hermes-gateway-real-dispatch-phase-2-shadow-enablement-implementation-plan.json", "utf-8");
  const json = JSON.parse(jr);
  assert(json.status === "plan_only", "json: status");
  assert(json.plan_only === true, "json: plan only");
  assert(json.implements_now === false, "json: implements_now false");
  assert(json.changes_hermes_dispatch_eligibility_now === false, "json: no dispatch eligibility change");
  assert(json.recommended_next_pr.title === "Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Contract", "json: next PR");
  console.log("");

  // Test 17: Forbidden imports
  console.log("Test 17: Forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement-implementation-plan.ts", "utf-8");
  assert(!src.includes("import "), "no imports at all (pure static object)");
  console.log("");

  // Test 18: Forbidden runtime/script/CI changes
  console.log("Test 18: Forbidden runtime/script/CI changes");
  const rt = fs.readFileSync("runtime.ts", "utf-8");
  const gw = fs.readFileSync("execution/gateway.ts", "utf-8");
  const hd = fs.readFileSync("execution/hermes-gateway-real-dispatch.ts", "utf-8");
  const pj = fs.readFileSync("package.json", "utf-8");
  assert(!rt.includes("phase_2_shadow_enablement"), "runtime.ts no phase_2_shadow_enablement");
  assert(!gw.includes("phase_2_shadow_enablement"), "execution/gateway.ts no phase_2_shadow_enablement");
  assert(!hd.includes("phase_2_shadow_enablement"), "execution/hermes-gateway-real-dispatch.ts no phase_2_shadow_enablement");
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
