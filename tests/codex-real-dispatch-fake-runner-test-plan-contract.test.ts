// Regression Test - Codex Real Dispatch Fake Runner Test Plan Contract
// ======================================================================
// Contract-only. No Runtime, Gateway, real CLI, or skill execution.

import {
  CODEX_REAL_DISPATCH_FAKE_RUNNER_TEST_PLAN_CONTRACT,
} from "../execution/codex-real-dispatch-fake-runner-test-plan-contract";
import * as fs from "node:fs";

function assertSameArray(actual: readonly string[], expected: readonly string[], assert: (c: boolean, m: string) => void, message: string) {
  assert(actual.length === expected.length && expected.every((v, i) => actual[i] === v), message);
}

async function test() {
  let passed = 0;
  let failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }
  console.log("Codex Real Dispatch Fake Runner Test Plan Contract Test\n");

  const c = CODEX_REAL_DISPATCH_FAKE_RUNNER_TEST_PLAN_CONTRACT;

  console.log("Test 1: contract object shape");
  assert(c.name === "Codex Real Dispatch Fake Runner Test Plan Contract", "name");
  assert(c.adapter === "codex", "adapter");
  assert(c.capability === "codex_real_dispatch", "capability");
  assert(c.scope === "fake_runner_test_plan_contract", "scope");
  assert(c.status === "contract_only", "status");
  assert(c.fakeRunnerTestPlanContractOnly === true, "fakeRunnerTestPlanContractOnly");
  assert(c.executingNow === false, "not executing now");
  assert(c.addsRealFakeRunnerNow === false, "not adding real fake runner now");
  assert(c.invokesCodexCliNow === false, "not invoking Codex CLI now");
  assert(c.verdict === "APPROVED_FOR_PLANNING", "verdict");
  assert(c.recommendedNextPr === "Codex Real Dispatch Controlled Rollout Plan", "next PR");
  console.log("");

  console.log("Test 2: default / feature constraints");
  assert(c.defaultEnabled === false, "default disabled");
  assert(c.featureFlagged === true, "feature flagged");
  assert(c.enablesFeatureFlagsNow === false, "not enabling flags now");
  console.log("");

  console.log("Test 3: behavior constraints");
  assert(c.affectsRuntimeRouting === false, "no routing effect");
  assert(c.affectsFinalStatus === false, "no final_status effect");
  assert(c.affectsGatewayPrimaryResult === false, "no primary gateway result effect");
  assert(c.changesGatewayPrimaryDispatch === false, "no gateway primary dispatch change");
  assert(c.changesGatewayFinalResult === false, "no gateway final result change");
  assert(c.changesRuntimeFinalStatus === false, "no runtime final_status change");
  assert(c.changesRuntimeRouting === false, "no runtime routing change");
  assert(c.changesRuntimeBehaviorNow === false, "no runtime behavior change now");
  assert(c.changesGatewayBehaviorNow === false, "no gateway behavior change now");
  console.log("");

  console.log("Test 4: request type scope");
  assertSameArray(c.supportedRequestTypes, ["code_generation"], assert, "supported request types");
  assertSameArray(
    c.unsupportedRequestTypes,
    ["code_review", "validation", "bugfix", "llm_task", "review"],
    assert,
    "unsupported request types"
  );
  console.log("");

  console.log("Test 5: fake runner boundary");
  assert(c.fakeRunnerBoundary.realCodexCliInvoked === false, "real Codex CLI not invoked");
  assert(c.fakeRunnerBoundary.processSpawnAllowed === false, "process spawn not allowed");
  assert(c.fakeRunnerBoundary.networkAllowed === false, "network not allowed");
  assert(c.fakeRunnerBoundary.filesystemWritesAllowed === false, "filesystem writes not allowed");
  assert(c.fakeRunnerBoundary.productionGatewayMutationAllowed === false, "production Gateway mutation not allowed");
  assert(c.fakeRunnerBoundary.executionResultMetadataAttachmentNow === false, "ExecutionResult metadata not attached now");
  console.log("");

  console.log("Test 6: fake runner scenarios");
  assertSameArray(
    c.fakeRunnerScenarios,
    [
      "success_code_patch",
      "cli_missing",
      "timeout",
      "non_zero_exit",
      "prompt_too_large",
      "output_too_large",
      "prohibited_prompt_content",
      "prohibited_output_content",
      "missing_file_path",
      "empty_patch",
      "parse_error",
      "unsupported_request_type",
    ],
    assert,
    "fake runner scenarios"
  );
  console.log("");

  console.log("Test 7: expected fallback assertions");
  const fb = c.expectedFallbackAssertions;
  assert(fb.cliMissing === "shadow_fallback", "cliMissing fallback");
  assert(fb.timeout === "shadow_fallback", "timeout fallback");
  assert(fb.nonZeroExit === "shadow_fallback", "nonZeroExit fallback");
  assert(fb.promptTooLarge === "reject_and_shadow_fallback", "promptTooLarge fallback");
  assert(fb.outputTooLarge === "truncate_and_shadow_fallback", "outputTooLarge fallback");
  assert(fb.prohibitedPromptContent === "reject_and_shadow_fallback", "prohibitedPromptContent fallback");
  assert(fb.prohibitedOutputContent === "reject_and_shadow_fallback", "prohibitedOutputContent fallback");
  assert(fb.missingFilePath === "reject_and_shadow_fallback", "missingFilePath fallback");
  assert(fb.emptyPatch === "reject_and_shadow_fallback", "emptyPatch fallback");
  assert(fb.parseError === "reject_and_shadow_fallback", "parseError fallback");
  assert(fb.unsupportedRequestType === "reject_and_shadow_fallback", "unsupportedRequestType fallback");
  console.log("");

  console.log("Test 8: expected success assertions");
  const sa = c.expectedSuccessAssertions;
  assert(sa.artifactType === "code_patch", "artifact type is code_patch");
  assert(sa.requireFilePath === true, "require file path");
  assert(sa.requireSanitizedPatch === true, "require sanitized patch");
  assert(sa.rawStdoutNotPersisted === true, "raw stdout not persisted");
  assert(sa.rawStderrNotPersisted === true, "raw stderr not persisted");
  assert(sa.rawPromptNotPersisted === true, "raw prompt not persisted");
  console.log("");

  console.log("Test 9: gateway boundary assertions");
  const gb = c.gatewayBoundaryAssertions;
  assert(gb.primaryResultUnchanged === true, "primary result unchanged");
  assert(gb.finalResultShapeUnchanged === true, "final result shape unchanged");
  assert(gb.runtimeRoutingUnchanged === true, "runtime routing unchanged");
  assert(gb.runtimeFinalStatusUnchanged === true, "runtime final_status unchanged");
  assert(gb.codexOutputNotRoutingSignal === true, "codex output not routing signal");
  assert(gb.codexOutputNotFinalDecision === true, "codex output not final decision");
  console.log("");

  console.log("Test 10: metadata boundary assertions");
  const mb = c.metadataBoundaryAssertions;
  assert(mb.metadataKey === "codexRealDispatch", "metadata key is codexRealDispatch");
  assert(mb.sanitizedSummaryOnly === true, "sanitized summary only");
  assert(mb.rawPromptForbidden === true, "raw prompt forbidden");
  assert(mb.rawStdoutForbidden === true, "raw stdout forbidden");
  assert(mb.rawStderrForbidden === true, "raw stderr forbidden");
  assert(mb.rawArtifactsForbidden === true, "raw artifacts forbidden");
  assert(mb.fullPatchForbidden === true, "full patch forbidden");
  assert(mb.secretsForbidden === true, "secrets forbidden");
  console.log("");

  console.log("Test 11: rollout dependency");
  assert(c.rolloutDependency.requiredBeforeRealCli === true, "required before real CLI");
  assert(c.rolloutDependency.requiredBeforeGatewayImplementation === true, "required before Gateway implementation");
  assert(c.rolloutDependency.operatorApprovalRequiredAfterPassing === true, "operator approval after passing");
  console.log("");

  console.log("Test 12: safety rules");
  assert(c.fakeRunnerSafetyRules.some((r) => r.includes("contract-only")), "safety: contract-only");
  assert(c.fakeRunnerSafetyRules.some((r) => r.includes("default-off") || r.includes("default off")), "safety: default-off");
  assert(c.fakeRunnerSafetyRules.some((r) => r.includes("code_generation")), "safety: code_generation only");
  assert(c.fakeRunnerSafetyRules.some((r) => r.includes("not invoke real Codex CLI")), "safety: no real CLI");
  assert(c.fakeRunnerSafetyRules.some((r) => r.includes("not spawn")), "safety: no spawn");
  assert(c.fakeRunnerSafetyRules.some((r) => r.includes("not require network") || r.includes("network")), "safety: no network");
  assert(c.fakeRunnerSafetyRules.some((r) => r.includes("not write")), "safety: no filesystem writes");
  assert(c.fakeRunnerSafetyRules.some((r) => r.includes("not mutate") && r.includes("Gateway")), "safety: no Gateway mutation");
  assert(c.fakeRunnerSafetyRules.some((r) => r.includes("not attach") && r.includes("ExecutionResult")), "safety: no metadata attachment");
  assert(c.fakeRunnerSafetyRules.some((r) => r.includes("code_patch")), "safety: code_patch success");
  assert(c.fakeRunnerSafetyRules.some((r) => r.includes("codexRealDispatch")), "safety: metadata key");
  assert(c.fakeRunnerSafetyRules.some((r) => r.includes("Operator") || r.includes("operator")), "safety: operator approval");
  console.log("");

  console.log("Test 13: non-goals");
  assert(c.nonGoals.some((g) => g.includes("fake runner") && g.includes("production")), "non-goal: no production fake runner");
  assert(c.nonGoals.some((g) => g.includes("Gateway integration")), "non-goal: no gateway integration");
  assert(c.nonGoals.some((g) => g.includes("metadata") && g.includes("ExecutionResult")), "non-goal: no metadata attachment");
  assert(c.nonGoals.some((g) => g.includes("real Codex CLI")), "non-goal: no real Codex CLI");
  assert(c.nonGoals.some((g) => g.includes("routing")), "non-goal: no routing change");
  assert(c.nonGoals.some((g) => g.includes("final_status")), "non-goal: no final_status change");
  assert(c.nonGoals.some((g) => g.includes("package scripts") || g.includes("CI")), "non-goal: no package/CI enablement");
  console.log("");

  console.log("Test 14: required before implementation");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("Prompt builder")), "requires prompt builder");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("Output parser") || r.includes("output parser")), "requires output parser");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("Guardrails")), "requires guardrails");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("Fallback policy")), "requires fallback policy");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("Gateway integration")), "requires gateway integration");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("rollout plan") || r.includes("Rollout")), "requires rollout plan");
  console.log("");

  console.log("Test 15: Markdown consistency");
  const md = fs.readFileSync("CODEX_REAL_DISPATCH_FAKE_RUNNER_TEST_PLAN_CONTRACT.md", "utf-8");
  assert(md.includes("APPROVED_FOR_PLANNING"), "md: verdict");
  assert(md.includes("Fake Runner Boundary") || md.includes("fake runner boundary"), "md: fake runner boundary");
  assert(md.includes("Fake Runner Scenarios") || md.includes("fake runner scenarios"), "md: fake runner scenarios");
  assert(md.includes("Fallback Assertions") || md.includes("fallback assertions"), "md: fallback assertions");
  assert(md.includes("Success Assertions") || md.includes("success assertions"), "md: success assertions");
  assert(md.includes("Gateway Boundary") || md.includes("gateway boundary"), "md: gateway boundary");
  assert(md.includes("Metadata Boundary") || md.includes("metadata boundary"), "md: metadata boundary");
  assert(md.includes("Rollout Dependency") || md.includes("rollout dependency"), "md: rollout dependency");
  assert(md.includes("Non-Goals") || md.includes("Non-goals"), "md: non-goals");
  assert(md.includes("code_generation"), "md: supported request type");
  console.log("");

  console.log("Test 16: forbidden imports");
  const src = fs.readFileSync("execution/codex-real-dispatch-fake-runner-test-plan-contract.ts", "utf-8");
  const forbidden = [
    "runtime",
    "execution/gateway",
    "executeCodexAgent",
    "executeShadowAgent",
    "child_process",
    "fs",
    "http",
    "https",
    "fetch",
    "policy-memory",
    "graph",
    "kimi-gateway-real-dispatch",
    "hermes-gateway-real-dispatch",
  ];
  const badLines = src.split("\n").filter((line: string) => {
    if (!line.includes("import ")) return false;
    return forbidden.some(f => line.includes(f));
  });
  assert(badLines.length === 0, `no forbidden imports (found ${badLines.length})`);
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
