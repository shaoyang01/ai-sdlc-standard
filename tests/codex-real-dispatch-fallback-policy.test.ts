// Regression Test - Codex Real Dispatch Fallback Policy
// ======================================================
// Contract-only. No Runtime, Gateway, real CLI, or skill execution.

import {
  CODEX_REAL_DISPATCH_FALLBACK_POLICY,
  type CodexFallbackReason,
  type CodexFallbackAction,
} from "../execution/codex-real-dispatch-fallback-policy";
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
  console.log("Codex Real Dispatch Fallback Policy Test\n");

  const p = CODEX_REAL_DISPATCH_FALLBACK_POLICY;

  console.log("Test 1: policy object shape");
  assert(p.name === "Codex Real Dispatch Fallback Policy", "name");
  assert(p.adapter === "codex", "adapter");
  assert(p.capability === "codex_real_dispatch", "capability");
  assert(p.scope === "fallback_policy", "scope");
  assert(p.status === "contract_only", "status");
  assert(p.contractOnly === true, "contractOnly");
  assert(p.executingNow === false, "not executing now");
  assert(p.verdict === "APPROVED_FOR_PLANNING", "verdict");
  assert(p.recommendedNextPr === "Codex Real Dispatch Observability Contract", "next PR");
  console.log("");

  console.log("Test 2: default / behavior constraints");
  assert(p.defaultEnabled === false, "default disabled");
  assert(p.featureFlagged === true, "feature flagged");
  assert(p.affectsRuntimeRouting === false, "no routing effect");
  assert(p.affectsFinalStatus === false, "no final_status effect");
  assert(p.affectsGatewayPrimaryResult === false, "no primary gateway result effect");
  assert(p.changesGatewayPrimaryDispatch === false, "no gateway primary dispatch change");
  assert(p.changesGatewayFinalResult === false, "no gateway final result change");
  assert(p.changesRuntimeFinalStatus === false, "no runtime final_status change");
  assert(p.changesRuntimeRouting === false, "no runtime routing change");
  console.log("");

  console.log("Test 3: request type scope");
  assertSameArray(p.supportedRequestTypes, ["code_generation"], assert, "supported request types");
  assertSameArray(
    p.unsupportedRequestTypes,
    ["code_review", "validation", "bugfix", "llm_task", "review"],
    assert,
    "unsupported request types"
  );
  console.log("");

  console.log("Test 4: fallback matrix covers all known reasons");
  const expectedReasons: CodexFallbackReason[] = [
    "cli_missing",
    "timeout",
    "non_zero_exit",
    "output_too_large",
    "prompt_too_large",
    "prohibited_content",
    "unsupported_request_type",
    "unknown_error",
  ];
  for (const reason of expectedReasons) {
    assert(p.fallbackMatrix[reason] !== undefined, `fallbackMatrix covers ${reason}`);
  }
  console.log("");

  console.log("Test 5: fallback matrix actions");
  assert(p.fallbackMatrix.cli_missing === "shadow_fallback", "cli_missing → shadow_fallback");
  assert(p.fallbackMatrix.timeout === "shadow_fallback", "timeout → shadow_fallback");
  assert(p.fallbackMatrix.non_zero_exit === "shadow_fallback", "non_zero_exit → shadow_fallback");
  assert(p.fallbackMatrix.output_too_large === "truncate_and_shadow_fallback", "output_too_large → truncate_and_shadow_fallback");
  assert(p.fallbackMatrix.prompt_too_large === "reject_and_shadow_fallback", "prompt_too_large → reject_and_shadow_fallback");
  assert(p.fallbackMatrix.prohibited_content === "reject_and_shadow_fallback", "prohibited_content → reject_and_shadow_fallback");
  assert(p.fallbackMatrix.unsupported_request_type === "reject_and_shadow_fallback", "unsupported_request_type → reject_and_shadow_fallback");
  assert(p.fallbackMatrix.unknown_error === "shadow_fallback", "unknown_error → shadow_fallback");
  console.log("");

  console.log("Test 6: no unsafe persistence");
  const prohibited = p.persistedFieldsProhibited;
  assert(prohibited.includes("raw_prompt"), "raw_prompt prohibited");
  assert(prohibited.includes("full_prompt"), "full_prompt prohibited");
  assert(prohibited.includes("raw_output"), "raw_output prohibited");
  assert(prohibited.includes("full_stdout"), "full_stdout prohibited");
  assert(prohibited.includes("full_stderr"), "full_stderr prohibited");
  assert(prohibited.includes("full_cli_output"), "full_cli_output prohibited");
  assert(prohibited.includes("raw_artifacts"), "raw_artifacts prohibited");
  assert(prohibited.includes("secret"), "secret prohibited");
  assert(prohibited.includes("token"), "token prohibited");
  assert(prohibited.includes("api_key"), "api_key prohibited");
  assert(prohibited.includes("password"), "password prohibited");
  assert(prohibited.includes("private_key"), "private_key prohibited");
  console.log("");

  console.log("Test 7: sanitized summary fields exclude raw content");
  const summary = p.sanitizedSummaryFields;
  assert(!summary.some((f) => f.includes("raw")), "sanitized fields do not include raw");
  assert(!summary.some((f) => f.includes("full_stdout")), "sanitized fields do not include full_stdout");
  assert(!summary.some((f) => f.includes("full_stderr")), "sanitized fields do not include full_stderr");
  assert(!summary.some((f) => f.includes("prompt")), "sanitized fields do not include prompt");
  assert(!summary.some((f) => f.includes("secret")), "sanitized fields do not include secret");
  assert(summary.includes("reason"), "sanitized fields include reason");
  assert(summary.includes("action"), "sanitized fields include action");
  assert(summary.includes("outcome"), "sanitized fields include outcome");
  console.log("");

  console.log("Test 8: non-goals");
  assert(p.nonGoals.some((g) => g.includes("fallback logic") && g.includes("Gateway")), "non-goal: no gateway fallback logic");
  assert(p.nonGoals.some((g) => g.includes("real Codex CLI")), "non-goal: no real Codex CLI");
  assert(p.nonGoals.some((g) => g.includes("routing")), "non-goal: no routing change");
  assert(p.nonGoals.some((g) => g.includes("final_status")), "non-goal: no final_status change");
  assert(p.nonGoals.some((g) => g.includes("package scripts") || g.includes("CI")), "non-goal: no package/CI enablement");
  console.log("");

  console.log("Test 9: required before implementation");
  assert(p.requiredBeforeImplementation.some((r) => r.includes("Observability")), "requires observability contract");
  assert(p.requiredBeforeImplementation.some((r) => r.includes("guardrails") || r.includes("Guardrails")), "requires guardrails contract");
  assert(p.requiredBeforeImplementation.some((r) => r.includes("ImplementationExecutorInput")), "requires typed input builder");
  assert(p.requiredBeforeImplementation.some((r) => r.includes("Fake-runner") || r.includes("tests")), "requires fake-runner tests");
  console.log("");

  console.log("Test 10: Markdown consistency");
  const md = fs.readFileSync("CODEX_REAL_DISPATCH_FALLBACK_POLICY.md", "utf-8");
  assert(md.includes("APPROVED_FOR_PLANNING"), "md: verdict");
  assert(md.includes("fallback matrix") || md.includes("Fallback Matrix"), "md: fallback matrix");
  assert(md.includes("shadow_fallback"), "md: shadow_fallback");
  assert(md.includes("truncate_and_shadow_fallback"), "md: truncate_and_shadow_fallback");
  assert(md.includes("reject_and_shadow_fallback"), "md: reject_and_shadow_fallback");
  assert(md.includes("Non-Goals"), "md: non-goals");
  assert(md.includes("code_generation"), "md: supported request type");
  console.log("");

  console.log("Test 11: forbidden imports");
  const src = fs.readFileSync("execution/codex-real-dispatch-fallback-policy.ts", "utf-8");
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
