// Regression Test - Codex Real Dispatch Guardrails Contract
// ==========================================================
// Contract-only. No Runtime, Gateway, real CLI, or skill execution.

import {
  CODEX_REAL_DISPATCH_GUARDRAILS_CONTRACT,
} from "../execution/codex-real-dispatch-guardrails-contract";
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
  console.log("Codex Real Dispatch Guardrails Contract Test\n");

  const c = CODEX_REAL_DISPATCH_GUARDRAILS_CONTRACT;

  console.log("Test 1: contract object shape");
  assert(c.name === "Codex Real Dispatch Guardrails Contract", "name");
  assert(c.adapter === "codex", "adapter");
  assert(c.capability === "codex_real_dispatch", "capability");
  assert(c.scope === "guardrails_contract", "scope");
  assert(c.status === "contract_only", "status");
  assert(c.guardrailsContractOnly === true, "guardrailsContractOnly");
  assert(c.executingNow === false, "not executing now");
  assert(c.addsRealGuardrailEnforcementNow === false, "not adding real enforcement now");
  assert(c.persistsGuardrailLogsNow === false, "not persisting logs now");
  assert(c.verdict === "APPROVED_FOR_PLANNING", "verdict");
  assert(c.recommendedNextPr === "Codex Real Dispatch Prompt Builder Contract", "next PR");
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

  console.log("Test 5: limits");
  assert(typeof c.limits.maxPromptChars === "number", "maxPromptChars is number");
  assert(c.limits.maxPromptChars > 0, "maxPromptChars positive");
  assert(typeof c.limits.maxOutputChars === "number", "maxOutputChars is number");
  assert(c.limits.maxOutputChars > 0, "maxOutputChars positive");
  assert(typeof c.limits.timeoutMs === "number", "timeoutMs is number");
  assert(c.limits.timeoutMs > 0, "timeoutMs positive");
  assert(typeof c.limits.maxSafeMessageChars === "number", "maxSafeMessageChars is number");
  assert(c.limits.maxSafeMessageChars > 0, "maxSafeMessageChars positive");
  assert(typeof c.limits.maxOutputPreviewChars === "number", "maxOutputPreviewChars is number");
  assert(c.limits.maxOutputPreviewChars > 0, "maxOutputPreviewChars positive");
  assert(c.limits.maxSafeMessageChars < c.limits.maxOutputChars, "safe message smaller than output");
  assert(c.limits.maxOutputPreviewChars < c.limits.maxOutputChars, "output preview smaller than output");
  console.log("");

  console.log("Test 6: pre-dispatch checks");
  assert(c.preDispatchChecks.requestTypeSupported === true, "requestTypeSupported");
  assert(c.preDispatchChecks.promptWithinLimit === true, "promptWithinLimit");
  assert(c.preDispatchChecks.noRawSecretInPrompt === true, "noRawSecretInPrompt");
  assert(c.preDispatchChecks.noRawArtifactDump === true, "noRawArtifactDump");
  assert(c.preDispatchChecks.noUnsupportedRequestType === true, "noUnsupportedRequestType");
  console.log("");

  console.log("Test 7: post-dispatch checks");
  assert(c.postDispatchChecks.outputWithinLimit === true, "outputWithinLimit");
  assert(c.postDispatchChecks.noSecretInOutput === true, "noSecretInOutput");
  assert(c.postDispatchChecks.noFullStdoutPersistence === true, "noFullStdoutPersistence");
  assert(c.postDispatchChecks.noFullStderrPersistence === true, "noFullStderrPersistence");
  assert(c.postDispatchChecks.outputSanitizedBeforeArtifact === true, "outputSanitizedBeforeArtifact");
  console.log("");

  console.log("Test 8: prohibited content patterns");
  const patterns = c.prohibitedContentPatterns.map((p) => p.toLowerCase());
  assert(patterns.some((p) => p.includes("secret")), "secret pattern");
  assert(patterns.some((p) => p.includes("token")), "token pattern");
  assert(patterns.some((p) => p.includes("api_key") || p.includes("api-key") || p.includes("apikey")), "api_key pattern");
  assert(patterns.some((p) => p.includes("password")), "password pattern");
  assert(patterns.some((p) => p.includes("private_key") || p.includes("private-key") || p.includes("privatekey")), "private_key pattern");
  assert(patterns.some((p) => p.includes("credential")), "credential pattern");
  assert(patterns.some((p) => p.includes("env")), "env-like pattern");
  console.log("");

  console.log("Test 9: prohibited persistence fields");
  const prohibited = c.prohibitedPersistenceFields;
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

  console.log("Test 10: fallback mapping");
  assert(c.fallbackMapping.promptTooLarge === "reject_and_shadow_fallback", "promptTooLarge fallback");
  assert(c.fallbackMapping.outputTooLarge === "truncate_and_shadow_fallback", "outputTooLarge fallback");
  assert(c.fallbackMapping.prohibitedPromptContent === "reject_and_shadow_fallback", "prohibitedPromptContent fallback");
  assert(c.fallbackMapping.prohibitedOutputContent === "reject_and_shadow_fallback", "prohibitedOutputContent fallback");
  assert(c.fallbackMapping.timeout === "shadow_fallback", "timeout fallback");
  assert(c.fallbackMapping.unsupportedRequestType === "reject_and_shadow_fallback", "unsupportedRequestType fallback");
  console.log("");

  console.log("Test 11: safety rules");
  assert(c.guardrailSafetyRules.some((r) => r.includes("contract-only")), "safety: contract-only");
  assert(c.guardrailSafetyRules.some((r) => r.includes("default-off") || r.includes("default off")), "safety: default-off");
  assert(c.guardrailSafetyRules.some((r) => r.includes("code_generation")), "safety: code_generation only");
  assert(c.guardrailSafetyRules.some((r) => r.includes("prompt") && r.includes("bounded")), "safety: prompt bounded");
  assert(c.guardrailSafetyRules.some((r) => r.includes("output") && r.includes("bounded")), "safety: output bounded");
  assert(c.guardrailSafetyRules.some((r) => r.includes("raw prompts") && r.includes("not be persisted")), "safety: no raw prompt persistence");
  assert(c.guardrailSafetyRules.some((r) => r.includes("stdout") && r.includes("not be persisted")), "safety: no stdout persistence");
  assert(c.guardrailSafetyRules.some((r) => r.includes("stderr") && r.includes("not be persisted")), "safety: no stderr persistence");
  assert(c.guardrailSafetyRules.some((r) => r.includes("raw artifacts") || r.includes("full patch")), "safety: no raw artifacts");
  assert(c.guardrailSafetyRules.some((r) => r.includes("secret") || r.includes("Secrets")), "safety: no secrets");
  assert(c.guardrailSafetyRules.some((r) => r.includes("routing") && r.includes("not change")), "safety: no routing change");
  assert(c.guardrailSafetyRules.some((r) => r.includes("final_status") && r.includes("not change")), "safety: no final_status change");
  console.log("");

  console.log("Test 12: non-goals");
  assert(c.nonGoals.some((g) => g.includes("guardrail enforcement") && g.includes("Gateway")), "non-goal: no gateway guardrail enforcement");
  assert(c.nonGoals.some((g) => g.includes("real Codex CLI")), "non-goal: no real Codex CLI");
  assert(c.nonGoals.some((g) => g.includes("routing")), "non-goal: no routing change");
  assert(c.nonGoals.some((g) => g.includes("final_status")), "non-goal: no final_status change");
  assert(c.nonGoals.some((g) => g.includes("package scripts") || g.includes("CI")), "non-goal: no package/CI enablement");
  console.log("");

  console.log("Test 13: required before implementation");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("Prompt builder")), "requires prompt builder");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("Output sanitizer")), "requires output sanitizer");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("Fallback policy")), "requires fallback policy implementation");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("Fake-runner") || r.includes("tests")), "requires fake-runner tests");
  console.log("");

  console.log("Test 14: Markdown consistency");
  const md = fs.readFileSync("CODEX_REAL_DISPATCH_GUARDRAILS_CONTRACT.md", "utf-8");
  assert(md.includes("APPROVED_FOR_PLANNING"), "md: verdict");
  assert(md.includes("Limits") || md.includes("limits"), "md: limits");
  assert(md.includes("Pre-Dispatch") || md.includes("pre-dispatch"), "md: pre-dispatch checks");
  assert(md.includes("Post-Dispatch") || md.includes("post-dispatch"), "md: post-dispatch checks");
  assert(md.includes("Prohibited") || md.includes("prohibited"), "md: prohibited content");
  assert(md.includes("Fallback") || md.includes("fallback"), "md: fallback behavior");
  assert(md.includes("Non-Goals") || md.includes("Non-goals"), "md: non-goals");
  assert(md.includes("code_generation"), "md: supported request type");
  console.log("");

  console.log("Test 15: forbidden imports");
  const src = fs.readFileSync("execution/codex-real-dispatch-guardrails-contract.ts", "utf-8");
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
