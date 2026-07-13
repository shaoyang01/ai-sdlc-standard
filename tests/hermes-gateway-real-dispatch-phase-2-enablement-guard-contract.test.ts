// Regression Test — Hermes Gateway Real Dispatch Phase-2 Enablement Guard Contract
// ================================================================================
// Contract-only. No Runtime, no Gateway, no CLI.

import {
  HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_ENABLEMENT_GUARD_CONTRACT,
} from "../execution/hermes-gateway-real-dispatch-phase-2-enablement-guard-contract";
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
  console.log("Hermes Gateway Real Dispatch Phase-2 Enablement Guard Contract Test\n");

  const contract = HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_ENABLEMENT_GUARD_CONTRACT;

  // Test 1: Object shape and status
  console.log("Test 1: Object shape and status");
  assert(contract.name === "Hermes Gateway Real Dispatch Phase-2 Enablement Guard Contract", "name");
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

  // Test 3: Readiness + scope
  console.log("Test 3: Readiness + scope");
  assert(contract.currentReadinessVerdict === "READY_WITH_CONSTRAINTS", "verdict");
  assert(contract.currentValidatedRequestTypes.length === 1 && contract.currentValidatedRequestTypes[0] === "review", "current review only");
  assert(contract.phase2GuardTargets.includes("code_review") && contract.phase2GuardTargets.includes("validation"), "phase 2 guard targets");
  assert(contract.supportedRequestTypes.includes("review") && contract.supportedRequestTypes.includes("code_review") && contract.supportedRequestTypes.includes("validation"), "supported types");
  assert(contract.unsupportedRequestTypes.includes("llm_task") && contract.unsupportedRequestTypes.includes("code_generation") && contract.unsupportedRequestTypes.includes("bugfix"), "unsupported types");
  assert(contract.requiredPrerequisites.length >= 10, "prerequisites exist");
  console.log("");

  // Test 4: Operator/automation constraints
  console.log("Test 4: Operator/automation constraints");
  assert(contract.operatorApprovalRequired === true, "operator required");
  assert(contract.automaticEnablementAllowed === false, "no auto enablement");
  assert(contract.rolloutMayProceedAutomatically === false, "no auto rollout");
  assert(contract.phase2MayProceedAutomatically === false, "no auto phase 2");
  assert(contract.requiresMultipleFlags === true, "multiple flags");
  assert(contract.requiredFlags.length === 3, "3 flags");
  console.log("");

  // Test 5: Gateway/Runtime safety
  console.log("Test 5: Gateway/Runtime safety");
  assert(contract.changesGatewayPrimaryDispatch === false, "no gateway change");
  assert(contract.changesGatewayFinalResult === false, "no gateway final");
  assert(contract.changesRuntimeFinalStatus === false, "no final status");
  assert(contract.changesRuntimeRouting === false, "no routing");
  assert(contract.affectsPrimaryGatewayResult === false, "no primary");
  console.log("");

  // Test 6: Ownership boundaries
  console.log("Test 6: Ownership boundaries");
  assert(contract.makesHermesDefault === false, "not default");
  assert(contract.makesHermesFinalReviewOwner === false, "not review owner");
  assert(contract.makesHermesFinalCodeReviewOwner === false, "not code review owner");
  assert(contract.makesHermesFinalValidationOwner === false, "not validation owner");
  console.log("");

  // Test 7: Persistence/leakage
  console.log("Test 7: Persistence/leakage");
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

  // Test 8: Required guard conditions
  console.log("Test 8: Required guard conditions");
  assert(Array.isArray(contract.requiredGuardConditions) && contract.requiredGuardConditions.length >= 10, "guard conditions exist");
  assert(contract.requiredGuardConditions.some(g => g.includes("separate future PR")), "guard: separate future PR");
  assert(contract.requiredGuardConditions.some(g => g.includes("code_review") && g.includes("validation")), "guard: targets");
  assert(contract.requiredGuardConditions.some(g => g.toLowerCase().includes("operator approval")), "guard: operator approval");
  assert(contract.requiredGuardConditions.some(g => g.toLowerCase().includes("automatic")), "guard: automatic disallowed");
  assert(contract.requiredGuardConditions.some(g => g.toLowerCase().includes("rollback")), "guard: rollback");
  console.log("");

  // Test 9: Prohibited implementation behaviors
  console.log("Test 9: Prohibited implementation behaviors");
  assert(Array.isArray(contract.prohibitedImplementationBehaviors) && contract.prohibitedImplementationBehaviors.length >= 10, "prohibited behaviors exist");
  assert(contract.prohibitedImplementationBehaviors.some(b => b.includes("Runtime final_status")), "prohibited: final_status");
  assert(contract.prohibitedImplementationBehaviors.some(b => b.includes("Runtime routing")), "prohibited: routing");
  assert(contract.prohibitedImplementationBehaviors.some(b => b.includes("Gateway primary")), "prohibited: gateway primary");
  assert(contract.prohibitedImplementationBehaviors.some(b => b.includes("default")), "prohibited: default");
  assert(contract.prohibitedImplementationBehaviors.some(b => b.includes("raw prompts") || b.includes("raw prompt")), "prohibited: raw prompt");
  assert(contract.prohibitedImplementationBehaviors.some(b => b.includes("llm_task")), "prohibited: llm_task");
  console.log("");

  // Test 10: Future implementation requirements
  console.log("Test 10: Future implementation requirements");
  assert(Array.isArray(contract.futureImplementationRequirements) && contract.futureImplementationRequirements.length >= 8, "future requirements exist");
  assert(contract.futureImplementationRequirements.some(r => r.includes("feature-flagged")), "future: feature-flagged");
  assert(contract.futureImplementationRequirements.some(r => r.includes("shadow-first")), "future: shadow-first");
  assert(contract.futureImplementationRequirements.some(r => r.includes("sidecar-only")), "future: sidecar-only");
  assert(contract.futureImplementationRequirements.some(r => r.includes("rollback tests")), "future: rollback tests");
  assert(contract.futureImplementationRequirements.some(r => r.includes("not call real Hermes CLI")), "future: no real CLI");
  console.log("");

  // Test 11: Rollback required when
  console.log("Test 11: Rollback required when");
  assert(Array.isArray(contract.rollbackRequiredWhen) && contract.rollbackRequiredWhen.length >= 8, "rollback conditions exist");
  assert(contract.rollbackRequiredWhen.some(r => r.includes("final code_review decision")), "rollback: code_review");
  assert(contract.rollbackRequiredWhen.some(r => r.includes("final_status") || r.includes("routing")), "rollback: final_status/routing");
  assert(contract.rollbackRequiredWhen.some(r => r.includes("enabled by default")), "rollback: default enabled");
  console.log("");

  // Test 12: Next PR
  console.log("Test 12: Recommended next PR");
  assert(contract.recommendedNextPr === "Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Implementation Plan", "next PR");
  console.log("");

  // Test 13: Forbidden runtime/script/CI changes
  console.log("Test 13: Forbidden runtime/script/CI changes");
  const rt = fs.readFileSync("runtime.ts", "utf-8");
  const gw = fs.readFileSync("execution/gateway.ts", "utf-8");
  const hd = fs.readFileSync("execution/hermes-gateway-real-dispatch.ts", "utf-8");
  const pj = fs.readFileSync("package.json", "utf-8");
  assert(!rt.includes("phase_2_enablement_guard"), "runtime.ts no phase_2_enablement_guard");
  assert(!gw.includes("phase_2_enablement_guard"), "execution/gateway.ts no phase_2_enablement_guard");
  assert(!hd.includes("phase_2_enablement_guard"), "execution/hermes-gateway-real-dispatch.ts no phase_2_enablement_guard");
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

  // Test 14: Markdown consistency
  console.log("Test 14: Markdown consistency");
  const md = fs.readFileSync("docs/capabilities/hermes/phase-2/HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_ENABLEMENT_GUARD_CONTRACT.md", "utf-8");
  assert(md.includes("contract_only"), "md: status");
  assert(md.includes("No Phase-2 enablement now"), "md: no enablement");
  assert(md.includes("No request type expansion now"), "md: no expansion");
  assert(md.includes("Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Implementation Plan"), "md: next PR");
  console.log("");

  // Test 15: JSON consistency
  console.log("Test 15: JSON consistency");
  const jr = fs.readFileSync("metadata/capabilities/hermes/phase-2/hermes-gateway-real-dispatch-phase-2-enablement-guard-contract.json", "utf-8");
  const json = JSON.parse(jr);
  assert(json.status === "contract_only", "json: status");
  assert(json.contract_only === true, "json: contract only");
  assert(json.recommended_next_pr.title === "Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Implementation Plan", "json: next PR");
  console.log("");

  // Test 16: Forbidden imports
  console.log("Test 16: Forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-real-dispatch-phase-2-enablement-guard-contract.ts", "utf-8");
  assert(!src.includes("import "), "no imports at all (pure static object)");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
