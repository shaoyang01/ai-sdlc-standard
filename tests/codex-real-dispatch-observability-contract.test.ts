// Regression Test - Codex Real Dispatch Observability Contract
// =============================================================
// Contract-only. No Runtime, Gateway, real CLI, or skill execution.

import {
  CODEX_REAL_DISPATCH_OBSERVABILITY_CONTRACT,
} from "../execution/codex-real-dispatch-observability-contract";
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
  console.log("Codex Real Dispatch Observability Contract Test\n");

  const c = CODEX_REAL_DISPATCH_OBSERVABILITY_CONTRACT;

  console.log("Test 1: contract object shape");
  assert(c.name === "Codex Real Dispatch Observability Contract", "name");
  assert(c.adapter === "codex", "adapter");
  assert(c.capability === "codex_real_dispatch", "capability");
  assert(c.scope === "observability_contract", "scope");
  assert(c.status === "contract_only", "status");
  assert(c.observabilityContractOnly === true, "observabilityContractOnly");
  assert(c.executingNow === false, "not executing now");
  assert(c.addsRealObservabilityCollectionNow === false, "not adding real collection now");
  assert(c.persistsObservabilityLogsNow === false, "not persisting logs now");
  assert(c.verdict === "APPROVED_FOR_PLANNING", "verdict");
  assert(c.recommendedNextPr === "Codex Real Dispatch Guardrails Contract", "next PR");
  console.log("");

  console.log("Test 2: default / persistence constraints");
  assert(c.defaultEnabled === false, "default disabled");
  assert(c.persisted === false, "not persisted");
  assert(c.inMemoryOnly === true, "in-memory only");
  assert(c.retentionPolicy.persisted === false, "retention: not persisted");
  assert(c.retentionPolicy.inMemoryOnly === true, "retention: in-memory only");
  assert(c.retentionPolicy.noDiskWrites === true, "retention: no disk writes");
  assert(c.retentionPolicy.noNetworkExport === true, "retention: no network export");
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

  console.log("Test 5: allowed summary fields");
  const allowed = c.allowedSummaryFields;
  assert(allowed.includes("request_type"), "request_type allowed");
  assert(allowed.includes("success"), "success allowed");
  assert(allowed.includes("duration_ms"), "duration_ms allowed");
  assert(allowed.includes("prompt_char_count"), "prompt_char_count allowed");
  assert(allowed.includes("output_char_count"), "output_char_count allowed");
  assert(allowed.includes("fallback_reason"), "fallback_reason allowed");
  assert(allowed.includes("fallback_action"), "fallback_action allowed");
  console.log("");

  console.log("Test 6: prohibited fields");
  const prohibited = c.prohibitedFields;
  assert(prohibited.includes("raw_prompt"), "raw_prompt prohibited");
  assert(prohibited.includes("full_prompt"), "full_prompt prohibited");
  assert(prohibited.includes("raw_stdout"), "raw_stdout prohibited");
  assert(prohibited.includes("full_stdout"), "full_stdout prohibited");
  assert(prohibited.includes("raw_stderr"), "raw_stderr prohibited");
  assert(prohibited.includes("full_stderr"), "full_stderr prohibited");
  assert(prohibited.includes("raw_artifacts"), "raw_artifacts prohibited");
  assert(prohibited.includes("full_patch"), "full_patch prohibited");
  assert(prohibited.includes("secret"), "secret prohibited");
  assert(prohibited.includes("token"), "token prohibited");
  assert(prohibited.includes("api_key"), "api_key prohibited");
  assert(prohibited.includes("password"), "password prohibited");
  assert(prohibited.includes("private_key"), "private_key prohibited");
  console.log("");

  console.log("Test 7: allowed fields do not leak raw content");
  const dangerousSubstrings = ["raw_", "full_", "prompt", "stdout", "stderr", "secret", "token", "api_key", "password", "private_key"];
  for (const field of allowed) {
    const isSafeCountField = field === "prompt_char_count" || field === "output_char_count";
    if (isSafeCountField) continue;
    const hasDangerous = dangerousSubstrings.some((d) => field.includes(d));
    assert(!hasDangerous, `allowed field "${field}" is safe`);
  }
  console.log("");

  console.log("Test 8: allowed signals");
  assert(c.allowedSignals.requestType === true, "requestType signal allowed");
  assert(c.allowedSignals.fallbackReason === true, "fallbackReason signal allowed");
  assert(c.allowedSignals.fallbackAction === true, "fallbackAction signal allowed");
  assert(c.allowedSignals.success === true, "success signal allowed");
  assert(c.allowedSignals.durationMs === true, "durationMs signal allowed");
  assert(c.allowedSignals.promptCharCount === true, "promptCharCount signal allowed");
  assert(c.allowedSignals.outputCharCount === true, "outputCharCount signal allowed");
  assert(c.allowedSignals.truncated === true, "truncated signal allowed");
  assert(c.allowedSignals.warningCount === true, "warningCount signal allowed");
  assert(c.allowedSignals.hasWarnings === true, "hasWarnings signal allowed");
  console.log("");

  console.log("Test 9: prohibited signals");
  assert(c.prohibitedSignals.rawPrompt === true, "rawPrompt signal prohibited");
  assert(c.prohibitedSignals.fullPrompt === true, "fullPrompt signal prohibited");
  assert(c.prohibitedSignals.rawStdout === true, "rawStdout signal prohibited");
  assert(c.prohibitedSignals.fullStdout === true, "fullStdout signal prohibited");
  assert(c.prohibitedSignals.rawStderr === true, "rawStderr signal prohibited");
  assert(c.prohibitedSignals.fullStderr === true, "fullStderr signal prohibited");
  assert(c.prohibitedSignals.rawArtifacts === true, "rawArtifacts signal prohibited");
  assert(c.prohibitedSignals.fullPatch === true, "fullPatch signal prohibited");
  assert(c.prohibitedSignals.secrets === true, "secrets signal prohibited");
  assert(c.prohibitedSignals.tokens === true, "tokens signal prohibited");
  assert(c.prohibitedSignals.apiKeys === true, "apiKeys signal prohibited");
  assert(c.prohibitedSignals.passwords === true, "passwords signal prohibited");
  assert(c.prohibitedSignals.privateKeys === true, "privateKeys signal prohibited");
  console.log("");

  console.log("Test 10: safety rules");
  assert(c.observabilitySafetyRules.some((r) => r.includes("in-memory")), "safety: in-memory only");
  assert(c.observabilitySafetyRules.some((r) => r.includes("not be persisted")), "safety: no persistence");
  assert(c.observabilitySafetyRules.some((r) => r.includes("raw prompt")), "safety: no raw prompt");
  assert(c.observabilitySafetyRules.some((r) => r.includes("stdout")), "safety: no stdout");
  assert(c.observabilitySafetyRules.some((r) => r.includes("stderr")), "safety: no stderr");
  assert(c.observabilitySafetyRules.some((r) => r.includes("secret")), "safety: no secrets");
  assert(c.observabilitySafetyRules.some((r) => r.includes("final_status") && r.includes("routing")), "safety: no runtime dependency");
  console.log("");

  console.log("Test 11: non-goals");
  assert(c.nonGoals.some((g) => g.includes("observability collection") && g.includes("Gateway")), "non-goal: no gateway observability collection");
  assert(c.nonGoals.some((g) => g.includes("real Codex CLI")), "non-goal: no real Codex CLI");
  assert(c.nonGoals.some((g) => g.includes("routing")), "non-goal: no routing change");
  assert(c.nonGoals.some((g) => g.includes("final_status")), "non-goal: no final_status change");
  assert(c.nonGoals.some((g) => g.includes("package scripts") || g.includes("CI")), "non-goal: no package/CI enablement");
  console.log("");

  console.log("Test 12: required before implementation");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("guardrails") || r.includes("Guardrails")), "requires guardrails contract");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("ImplementationExecutorInput")), "requires typed input builder");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("Fake-runner") || r.includes("tests")), "requires fake-runner tests");
  console.log("");

  console.log("Test 13: Markdown consistency");
  const md = fs.readFileSync("docs/capabilities/codex/CODEX_REAL_DISPATCH_OBSERVABILITY_CONTRACT.md", "utf-8");
  assert(md.includes("APPROVED_FOR_PLANNING"), "md: verdict");
  assert(md.includes("Allowed Summary Fields") || md.includes("allowed summary fields"), "md: allowed fields");
  assert(md.includes("Prohibited Fields") || md.includes("prohibited fields"), "md: prohibited fields");
  assert(md.includes("Retention Policy") || md.includes("retention policy"), "md: retention policy");
  assert(md.includes("Non-Goals") || md.includes("Non-goals"), "md: non-goals");
  assert(md.includes("code_generation"), "md: supported request type");
  assert(md.includes("in-memory") || md.includes("in memory"), "md: in-memory");
  console.log("");

  console.log("Test 14: forbidden imports");
  const src = fs.readFileSync("execution/codex-real-dispatch-observability-contract.ts", "utf-8");
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
