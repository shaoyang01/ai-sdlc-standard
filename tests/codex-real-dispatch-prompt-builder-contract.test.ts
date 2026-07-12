// Regression Test - Codex Real Dispatch Prompt Builder Contract
// ================================================================
// Contract-only. No Runtime, Gateway, real CLI, or skill execution.

import {
  CODEX_REAL_DISPATCH_PROMPT_BUILDER_CONTRACT,
} from "../execution/codex-real-dispatch-prompt-builder-contract";
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
  console.log("Codex Real Dispatch Prompt Builder Contract Test\n");

  const c = CODEX_REAL_DISPATCH_PROMPT_BUILDER_CONTRACT;

  console.log("Test 1: contract object shape");
  assert(c.name === "Codex Real Dispatch Prompt Builder Contract", "name");
  assert(c.adapter === "codex", "adapter");
  assert(c.capability === "codex_real_dispatch", "capability");
  assert(c.scope === "prompt_builder_contract", "scope");
  assert(c.status === "contract_only", "status");
  assert(c.promptBuilderContractOnly === true, "promptBuilderContractOnly");
  assert(c.executingNow === false, "not executing now");
  assert(c.addsRealPromptBuilderNow === false, "not adding real builder now");
  assert(c.invokesCodexCliNow === false, "not invoking Codex CLI now");
  assert(c.verdict === "APPROVED_FOR_PLANNING", "verdict");
  assert(c.recommendedNextPr === "Codex Real Dispatch Output Parser Contract", "next PR");
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

  console.log("Test 5: input source");
  assert(c.inputSource.requiredInput === "ImplementationExecutorInput", "required input is ImplementationExecutorInput");
  assert(c.inputSource.rawContextDumpAllowed === false, "raw context dump not allowed");
  assert(c.inputSource.rawArtifactsAllowed === false, "raw artifacts not allowed");
  assert(c.inputSource.fullPatchAllowed === false, "full patch not allowed");
  console.log("");

  console.log("Test 6: required prompt sections");
  assertSameArray(
    c.requiredPromptSections,
    ["task_summary", "requirement", "structured_design", "implementation_constraints", "expected_output_contract"],
    assert,
    "required prompt sections"
  );
  console.log("");

  console.log("Test 7: allowed input fields");
  const allowed = c.allowedInputFields;
  assert(allowed.includes("requirement"), "requirement allowed");
  assert(allowed.includes("requirementId"), "requirementId allowed");
  assert(allowed.includes("summary"), "summary allowed");
  assert(allowed.includes("designOutput"), "designOutput allowed");
  assert(allowed.includes("reviewOutput"), "reviewOutput allowed");
  assert(allowed.includes("complexity"), "complexity allowed");
  assert(allowed.includes("executionMode"), "executionMode allowed");
  console.log("");

  console.log("Test 8: prohibited input fields");
  const prohibited = c.prohibitedInputFields;
  assert(prohibited.includes("raw_context"), "raw_context prohibited");
  assert(prohibited.includes("raw_artifacts"), "raw_artifacts prohibited");
  assert(prohibited.includes("full_patch"), "full_patch prohibited");
  assert(prohibited.includes("raw_prompt"), "raw_prompt prohibited");
  assert(prohibited.includes("full_stdout"), "full_stdout prohibited");
  assert(prohibited.includes("full_stderr"), "full_stderr prohibited");
  assert(prohibited.includes("secret"), "secret prohibited");
  assert(prohibited.includes("token"), "token prohibited");
  assert(prohibited.includes("api_key"), "api_key prohibited");
  assert(prohibited.includes("password"), "password prohibited");
  assert(prohibited.includes("private_key"), "private_key prohibited");
  console.log("");

  console.log("Test 9: prompt limits");
  assert(typeof c.promptLimits.maxPromptChars === "number", "maxPromptChars is number");
  assert(c.promptLimits.maxPromptChars > 0, "maxPromptChars positive");
  assert(typeof c.promptLimits.maxRequirementChars === "number", "maxRequirementChars is number");
  assert(c.promptLimits.maxRequirementChars > 0, "maxRequirementChars positive");
  assert(typeof c.promptLimits.maxDesignChars === "number", "maxDesignChars is number");
  assert(c.promptLimits.maxDesignChars > 0, "maxDesignChars positive");
  assert(typeof c.promptLimits.maxReviewChars === "number", "maxReviewChars is number");
  assert(c.promptLimits.maxReviewChars > 0, "maxReviewChars positive");
  assert(c.promptLimits.maxRequirementChars < c.promptLimits.maxPromptChars, "requirement limit smaller than prompt");
  assert(c.promptLimits.maxDesignChars < c.promptLimits.maxPromptChars, "design limit smaller than prompt");
  assert(c.promptLimits.maxReviewChars < c.promptLimits.maxPromptChars, "review limit smaller than prompt");
  console.log("");

  console.log("Test 10: sanitization rules");
  assert(c.sanitizationRules.stripSecrets === true, "strip secrets");
  assert(c.sanitizationRules.stripRawArtifacts === true, "strip raw artifacts");
  assert(c.sanitizationRules.stripFullPatchContent === true, "strip full patch content");
  assert(c.sanitizationRules.truncateLongFields === true, "truncate long fields");
  assert(c.sanitizationRules.omitUnsafeFields === true, "omit unsafe fields");
  console.log("");

  console.log("Test 11: output expectation");
  assert(c.outputExpectation.expectedArtifactType === "code_patch", "expected artifact type is code_patch");
  assert(c.outputExpectation.requirePatchContent === true, "require patch content");
  assert(c.outputExpectation.requireFilePath === true, "require file path");
  assert(c.outputExpectation.prohibitRawStdoutAsPatch === true, "prohibit raw stdout as patch");
  console.log("");

  console.log("Test 12: fallback mapping");
  assert(c.fallbackMapping.promptTooLarge === "reject_and_shadow_fallback", "promptTooLarge fallback");
  assert(c.fallbackMapping.prohibitedPromptContent === "reject_and_shadow_fallback", "prohibitedPromptContent fallback");
  assert(c.fallbackMapping.unsupportedRequestType === "reject_and_shadow_fallback", "unsupportedRequestType fallback");
  console.log("");

  console.log("Test 13: safety rules");
  assert(c.promptBuilderSafetyRules.some((r) => r.includes("contract-only")), "safety: contract-only");
  assert(c.promptBuilderSafetyRules.some((r) => r.includes("default-off") || r.includes("default off")), "safety: default-off");
  assert(c.promptBuilderSafetyRules.some((r) => r.includes("code_generation")), "safety: code_generation only");
  assert(c.promptBuilderSafetyRules.some((r) => r.includes("ImplementationExecutorInput")), "safety: required input");
  assert(c.promptBuilderSafetyRules.some((r) => r.includes("raw") && r.includes("context")), "safety: no raw context dump");
  assert(c.promptBuilderSafetyRules.some((r) => r.includes("raw") && r.includes("artifacts")), "safety: no raw artifacts");
  assert(c.promptBuilderSafetyRules.some((r) => r.includes("full patch") || r.includes("full_patch")), "safety: no full patch");
  assert(c.promptBuilderSafetyRules.some((r) => r.includes("maxPromptChars")), "safety: prompt limit");
  assert(c.promptBuilderSafetyRules.some((r) => r.includes("secret") || r.includes("Secrets")), "safety: no secrets");
  assert(c.promptBuilderSafetyRules.some((r) => r.includes("stdout")), "safety: no stdout");
  assert(c.promptBuilderSafetyRules.some((r) => r.includes("routing") && r.includes("not change")), "safety: no routing change");
  assert(c.promptBuilderSafetyRules.some((r) => r.includes("final_status") && r.includes("not change")), "safety: no final_status change");
  console.log("");

  console.log("Test 14: non-goals");
  assert(c.nonGoals.some((g) => g.includes("prompt builder") && g.includes("Gateway")), "non-goal: no gateway builder logic");
  assert(c.nonGoals.some((g) => g.includes("real Codex CLI")), "non-goal: no real Codex CLI");
  assert(c.nonGoals.some((g) => g.includes("routing")), "non-goal: no routing change");
  assert(c.nonGoals.some((g) => g.includes("final_status")), "non-goal: no final_status change");
  assert(c.nonGoals.some((g) => g.includes("package scripts") || g.includes("CI")), "non-goal: no package/CI enablement");
  console.log("");

  console.log("Test 15: required before implementation");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("Output parser") || r.includes("output parser")), "requires output parser");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("Gateway integration")), "requires gateway integration");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("Fallback policy")), "requires fallback policy");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("Guardrails")), "requires guardrails");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("Fake-runner") || r.includes("tests")), "requires fake-runner tests");
  console.log("");

  console.log("Test 16: Markdown consistency");
  const md = fs.readFileSync("docs/capabilities/codex/CODEX_REAL_DISPATCH_PROMPT_BUILDER_CONTRACT.md", "utf-8");
  assert(md.includes("APPROVED_FOR_PLANNING"), "md: verdict");
  assert(md.includes("Prompt Source") || md.includes("prompt source"), "md: prompt source");
  assert(md.includes("Required Prompt Sections") || md.includes("required prompt sections"), "md: required sections");
  assert(md.includes("Allowed Input Fields") || md.includes("allowed input fields"), "md: allowed fields");
  assert(md.includes("Prohibited Input Fields") || md.includes("prohibited input fields"), "md: prohibited fields");
  assert(md.includes("Prompt Limits") || md.includes("prompt limits"), "md: prompt limits");
  assert(md.includes("Sanitization") || md.includes("sanitization"), "md: sanitization");
  assert(md.includes("Output Contract") || md.includes("output contract"), "md: output contract");
  assert(md.includes("Fallback") || md.includes("fallback"), "md: fallback behavior");
  assert(md.includes("Non-Goals") || md.includes("Non-goals"), "md: non-goals");
  assert(md.includes("code_generation"), "md: supported request type");
  console.log("");

  console.log("Test 17: forbidden imports");
  const src = fs.readFileSync("execution/codex-real-dispatch-prompt-builder-contract.ts", "utf-8");
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
