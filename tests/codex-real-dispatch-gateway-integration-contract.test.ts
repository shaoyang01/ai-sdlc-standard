// Regression Test - Codex Real Dispatch Gateway Integration Contract
// ===================================================================
// Contract-only. No Runtime, Gateway, real CLI, or skill execution.

import {
  CODEX_REAL_DISPATCH_GATEWAY_INTEGRATION_CONTRACT,
} from "../execution/codex-real-dispatch-gateway-integration-contract";
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
  console.log("Codex Real Dispatch Gateway Integration Contract Test\n");

  const c = CODEX_REAL_DISPATCH_GATEWAY_INTEGRATION_CONTRACT;

  console.log("Test 1: contract object shape");
  assert(c.name === "Codex Real Dispatch Gateway Integration Contract", "name");
  assert(c.adapter === "codex", "adapter");
  assert(c.capability === "codex_real_dispatch", "capability");
  assert(c.scope === "gateway_integration_contract", "scope");
  assert(c.status === "contract_only", "status");
  assert(c.gatewayIntegrationContractOnly === true, "gatewayIntegrationContractOnly");
  assert(c.executingNow === false, "not executing now");
  assert(c.addsRealGatewayIntegrationNow === false, "not adding real integration now");
  assert(c.attachesMetadataToExecutionResultNow === false, "not attaching metadata now");
  assert(c.invokesCodexCliNow === false, "not invoking Codex CLI now");
  assert(c.verdict === "APPROVED_FOR_PLANNING", "verdict");
  assert(c.recommendedNextPr === "Codex Real Dispatch Fake Runner Test Plan Contract", "next PR");
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

  console.log("Test 5: integration boundary");
  assert(c.integrationBoundary.gatewayPrimaryResultUnchanged === true, "gateway primary result unchanged");
  assert(c.integrationBoundary.gatewayFinalResultShapeUnchanged === true, "gateway final result shape unchanged");
  assert(c.integrationBoundary.runtimeRoutingUnchanged === true, "runtime routing unchanged");
  assert(c.integrationBoundary.runtimeFinalStatusUnchanged === true, "runtime final_status unchanged");
  assert(c.integrationBoundary.codexOutputNotRoutingSignal === true, "codex output not routing signal");
  assert(c.integrationBoundary.codexOutputNotFinalDecision === true, "codex output not final decision");
  console.log("");

  console.log("Test 6: future ExecutionResult metadata");
  assert(c.futureExecutionResultMetadata.metadataKey === "codexRealDispatch", "metadata key is codexRealDispatch");
  assert(c.futureExecutionResultMetadata.attachOnlySanitizedSummary === true, "attach only sanitized summary");
  assert(c.futureExecutionResultMetadata.attachRawPrompt === false, "do not attach raw prompt");
  assert(c.futureExecutionResultMetadata.attachRawStdout === false, "do not attach raw stdout");
  assert(c.futureExecutionResultMetadata.attachRawStderr === false, "do not attach raw stderr");
  assert(c.futureExecutionResultMetadata.attachRawArtifacts === false, "do not attach raw artifacts");
  assert(c.futureExecutionResultMetadata.attachFullPatch === false, "do not attach full patch");
  assert(c.futureExecutionResultMetadata.attachSecrets === false, "do not attach secrets");
  console.log("");

  console.log("Test 7: allowed metadata fields");
  const allowed = c.allowedMetadataFields;
  assert(allowed.includes("enabled"), "enabled allowed");
  assert(allowed.includes("attempted"), "attempted allowed");
  assert(allowed.includes("success"), "success allowed");
  assert(allowed.includes("fallback_reason"), "fallback_reason allowed");
  assert(allowed.includes("fallback_action"), "fallback_action allowed");
  assert(allowed.includes("duration_ms"), "duration_ms allowed");
  assert(allowed.includes("prompt_char_count"), "prompt_char_count allowed");
  assert(allowed.includes("output_char_count"), "output_char_count allowed");
  assert(allowed.includes("warning_count"), "warning_count allowed");
  assert(allowed.includes("has_warnings"), "has_warnings allowed");
  assert(allowed.includes("parser_summary"), "parser_summary allowed");
  assert(allowed.includes("safe_message"), "safe_message allowed");
  console.log("");

  console.log("Test 8: prohibited metadata fields");
  const prohibited = c.prohibitedMetadataFields;
  assert(prohibited.includes("raw_prompt"), "raw_prompt prohibited");
  assert(prohibited.includes("full_prompt"), "full_prompt prohibited");
  assert(prohibited.includes("raw_stdout"), "raw_stdout prohibited");
  assert(prohibited.includes("full_stdout"), "full_stdout prohibited");
  assert(prohibited.includes("raw_stderr"), "raw_stderr prohibited");
  assert(prohibited.includes("full_stderr"), "full_stderr prohibited");
  assert(prohibited.includes("raw_artifacts"), "raw_artifacts prohibited");
  assert(prohibited.includes("full_patch"), "full_patch prohibited");
  assert(prohibited.includes("patch_content"), "patch_content prohibited");
  assert(prohibited.includes("secret"), "secret prohibited");
  assert(prohibited.includes("token"), "token prohibited");
  assert(prohibited.includes("api_key"), "api_key prohibited");
  assert(prohibited.includes("password"), "password prohibited");
  assert(prohibited.includes("private_key"), "private_key prohibited");
  console.log("");

  console.log("Test 9: integration inputs");
  assertSameArray(
    c.integrationInputs,
    ["fallback_policy", "observability_contract", "guardrails_contract", "prompt_builder_contract", "output_parser_contract"],
    assert,
    "integration inputs"
  );
  console.log("");

  console.log("Test 10: fallback behavior");
  assert(c.fallbackBehavior.fallbackKeepsPrimaryShadowResult === true, "fallback keeps primary shadow result");
  assert(c.fallbackBehavior.fallbackDoesNotChangeRuntimeStatus === true, "fallback does not change runtime status");
  assert(c.fallbackBehavior.fallbackDoesNotChangeRouting === true, "fallback does not change routing");
  assert(c.fallbackBehavior.fallbackReasonSummaryOnly === true, "fallback reason summary only");
  console.log("");

  console.log("Test 11: rollout boundary");
  assert(c.rolloutBoundary.requiresExplicitFeatureFlag === true, "requires explicit feature flag");
  assert(c.rolloutBoundary.defaultOff === true, "default off");
  assert(c.rolloutBoundary.fakeRunnerRequiredBeforeRealCli === true, "fake runner required before real CLI");
  assert(c.rolloutBoundary.operatorApprovalRequired === true, "operator approval required");
  console.log("");

  console.log("Test 12: safety rules");
  assert(c.gatewayIntegrationSafetyRules.some((r) => r.includes("contract-only")), "safety: contract-only");
  assert(c.gatewayIntegrationSafetyRules.some((r) => r.includes("default-off") || r.includes("default off")), "safety: default-off");
  assert(c.gatewayIntegrationSafetyRules.some((r) => r.includes("code_generation")), "safety: code_generation only");
  assert(c.gatewayIntegrationSafetyRules.some((r) => r.includes("primary result") && r.includes("unchanged")), "safety: primary result unchanged");
  assert(c.gatewayIntegrationSafetyRules.some((r) => r.includes("routing") && r.includes("unchanged")), "safety: routing unchanged");
  assert(c.gatewayIntegrationSafetyRules.some((r) => r.includes("final_status") && r.includes("unchanged")), "safety: final_status unchanged");
  assert(c.gatewayIntegrationSafetyRules.some((r) => r.includes("codexRealDispatch")), "safety: metadata key");
  assert(c.gatewayIntegrationSafetyRules.some((r) => r.includes("sanitized summary")), "safety: sanitized summary only");
  assert(c.gatewayIntegrationSafetyRules.some((r) => r.includes("raw stdout") && r.includes("not")), "safety: no raw stdout attach");
  assert(c.gatewayIntegrationSafetyRules.some((r) => r.includes("fake-runner") || r.includes("Fake-runner")), "safety: fake runner required");
  assert(c.gatewayIntegrationSafetyRules.some((r) => r.includes("Operator") || r.includes("operator")), "safety: operator approval");
  console.log("");

  console.log("Test 13: non-goals");
  assert(c.nonGoals.some((g) => g.includes("Gateway integration") && g.includes("Gateway")), "non-goal: no gateway integration logic");
  assert(c.nonGoals.some((g) => g.includes("metadata") && g.includes("ExecutionResult")), "non-goal: no metadata attachment");
  assert(c.nonGoals.some((g) => g.includes("real Codex CLI")), "non-goal: no real Codex CLI");
  assert(c.nonGoals.some((g) => g.includes("routing")), "non-goal: no routing change");
  assert(c.nonGoals.some((g) => g.includes("final_status")), "non-goal: no final_status change");
  assert(c.nonGoals.some((g) => g.includes("package scripts") || g.includes("CI")), "non-goal: no package/CI enablement");
  console.log("");

  console.log("Test 14: required before implementation");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("Fake-runner") || r.includes("fake-runner")), "requires fake-runner tests");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("Prompt builder")), "requires prompt builder");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("Output parser") || r.includes("output parser")), "requires output parser");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("Guardrails")), "requires guardrails");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("Fallback policy")), "requires fallback policy");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("rollout plan") || r.includes("Rollout")), "requires rollout plan");
  console.log("");

  console.log("Test 15: Markdown consistency");
  const md = fs.readFileSync("docs/capabilities/codex/CODEX_REAL_DISPATCH_GATEWAY_INTEGRATION_CONTRACT.md", "utf-8");
  assert(md.includes("APPROVED_FOR_PLANNING"), "md: verdict");
  assert(md.includes("Integration Boundary") || md.includes("integration boundary"), "md: integration boundary");
  assert(md.includes("ExecutionResult") || md.includes("execution result"), "md: ExecutionResult metadata");
  assert(md.includes("Allowed Metadata Fields") || md.includes("allowed metadata fields"), "md: allowed fields");
  assert(md.includes("Prohibited Metadata Fields") || md.includes("prohibited metadata fields"), "md: prohibited fields");
  assert(md.includes("Integration Inputs") || md.includes("integration inputs"), "md: integration inputs");
  assert(md.includes("Fallback Behavior") || md.includes("fallback behavior"), "md: fallback behavior");
  assert(md.includes("Rollout Boundary") || md.includes("rollout boundary"), "md: rollout boundary");
  assert(md.includes("Non-Goals") || md.includes("Non-goals"), "md: non-goals");
  assert(md.includes("code_generation"), "md: supported request type");
  console.log("");

  console.log("Test 16: forbidden imports");
  const src = fs.readFileSync("execution/codex-real-dispatch-gateway-integration-contract.ts", "utf-8");
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
