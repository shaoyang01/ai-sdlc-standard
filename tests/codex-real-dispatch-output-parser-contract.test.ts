// Regression Test - Codex Real Dispatch Output Parser Contract
// ==============================================================
// Contract-only. No Runtime, Gateway, real CLI, or skill execution.

import {
  CODEX_REAL_DISPATCH_OUTPUT_PARSER_CONTRACT,
} from "../execution/codex-real-dispatch-output-parser-contract";
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
  console.log("Codex Real Dispatch Output Parser Contract Test\n");

  const c = CODEX_REAL_DISPATCH_OUTPUT_PARSER_CONTRACT;

  console.log("Test 1: contract object shape");
  assert(c.name === "Codex Real Dispatch Output Parser Contract", "name");
  assert(c.adapter === "codex", "adapter");
  assert(c.capability === "codex_real_dispatch", "capability");
  assert(c.scope === "output_parser_contract", "scope");
  assert(c.status === "contract_only", "status");
  assert(c.outputParserContractOnly === true, "outputParserContractOnly");
  assert(c.executingNow === false, "not executing now");
  assert(c.addsRealOutputParserNow === false, "not adding real parser now");
  assert(c.invokesCodexCliNow === false, "not invoking Codex CLI now");
  assert(c.verdict === "APPROVED_FOR_PLANNING", "verdict");
  assert(c.recommendedNextPr === "Codex Real Dispatch Gateway Integration Contract", "next PR");
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
  assert(c.inputSource.codexStdoutAllowedAsRawInput === true, "stdout allowed as raw parser input");
  assert(c.inputSource.rawStdoutPersistenceAllowed === false, "raw stdout persistence not allowed");
  assert(c.inputSource.rawStderrPersistenceAllowed === false, "raw stderr persistence not allowed");
  assert(c.inputSource.rawStdoutAsPatchAllowed === false, "raw stdout as patch not allowed");
  console.log("");

  console.log("Test 6: expected output artifact");
  assert(c.expectedOutputArtifact.artifactType === "code_patch", "artifact type is code_patch");
  assert(c.expectedOutputArtifact.requireFilePath === true, "require file path");
  assert(c.expectedOutputArtifact.requirePatchContent === true, "require patch content");
  assert(c.expectedOutputArtifact.requireSanitizedPatch === true, "require sanitized patch");
  assert(c.expectedOutputArtifact.prohibitRawStdoutAsPatch === true, "prohibit raw stdout as patch");
  console.log("");

  console.log("Test 7: parser requirements");
  assert(c.parserRequirements.extractFilePath === true, "extract file path");
  assert(c.parserRequirements.extractPatchContent === true, "extract patch content");
  assert(c.parserRequirements.rejectEmptyPatch === true, "reject empty patch");
  assert(c.parserRequirements.rejectMissingFilePath === true, "reject missing file path");
  assert(c.parserRequirements.rejectOversizedOutput === true, "reject oversized output");
  assert(c.parserRequirements.rejectProhibitedContent === true, "reject prohibited content");
  assert(c.parserRequirements.sanitizeBeforeArtifact === true, "sanitize before artifact");
  console.log("");

  console.log("Test 8: limits");
  assert(typeof c.limits.maxStdoutChars === "number", "maxStdoutChars is number");
  assert(c.limits.maxStdoutChars > 0, "maxStdoutChars positive");
  assert(typeof c.limits.maxPatchChars === "number", "maxPatchChars is number");
  assert(c.limits.maxPatchChars > 0, "maxPatchChars positive");
  assert(typeof c.limits.maxFilePathChars === "number", "maxFilePathChars is number");
  assert(c.limits.maxFilePathChars > 0, "maxFilePathChars positive");
  assert(typeof c.limits.maxSafeMessageChars === "number", "maxSafeMessageChars is number");
  assert(c.limits.maxSafeMessageChars > 0, "maxSafeMessageChars positive");
  assert(c.limits.maxPatchChars < c.limits.maxStdoutChars, "patch limit smaller than stdout");
  assert(c.limits.maxFilePathChars < c.limits.maxPatchChars, "file path limit smaller than patch");
  assert(c.limits.maxSafeMessageChars < c.limits.maxPatchChars, "safe message limit smaller than patch");
  console.log("");

  console.log("Test 9: prohibited content patterns");
  const patterns = c.prohibitedContentPatterns.map((p) => p.toLowerCase());
  assert(patterns.some((p) => p.includes("secret")), "secret pattern");
  assert(patterns.some((p) => p.includes("token")), "token pattern");
  assert(patterns.some((p) => p.includes("api_key") || p.includes("api-key") || p.includes("apikey")), "api_key pattern");
  assert(patterns.some((p) => p.includes("password")), "password pattern");
  assert(patterns.some((p) => p.includes("private_key") || p.includes("private-key") || p.includes("privatekey")), "private_key pattern");
  assert(patterns.some((p) => p.includes("credential")), "credential pattern");
  assert(patterns.some((p) => p.includes("env")), "env-like pattern");
  console.log("");

  console.log("Test 10: prohibited persistence fields");
  const prohibited = c.prohibitedPersistenceFields;
  assert(prohibited.includes("raw_stdout"), "raw_stdout prohibited");
  assert(prohibited.includes("full_stdout"), "full_stdout prohibited");
  assert(prohibited.includes("raw_stderr"), "raw_stderr prohibited");
  assert(prohibited.includes("full_stderr"), "full_stderr prohibited");
  assert(prohibited.includes("raw_output"), "raw_output prohibited");
  assert(prohibited.includes("full_output"), "full_output prohibited");
  assert(prohibited.includes("raw_artifacts"), "raw_artifacts prohibited");
  assert(prohibited.includes("full_patch"), "full_patch prohibited");
  assert(prohibited.includes("patch_content"), "patch_content prohibited");
  assert(prohibited.includes("secret"), "secret prohibited");
  assert(prohibited.includes("token"), "token prohibited");
  assert(prohibited.includes("api_key"), "api_key prohibited");
  assert(prohibited.includes("password"), "password prohibited");
  assert(prohibited.includes("private_key"), "private_key prohibited");
  console.log("");

  console.log("Test 11: allowed artifact content fields");
  const allowed = c.allowedArtifactContentFields;
  assert(allowed.includes("file"), "file field allowed");
  assert(allowed.includes("patch"), "patch field allowed");
  assert(allowed.includes("parser_summary"), "parser_summary field allowed");
  const dangerous = ["raw_stdout", "full_stdout", "raw_stderr", "full_stderr", "raw_output", "full_output", "secret", "token", "api_key", "password", "private_key"];
  for (const field of dangerous) {
    assert(!allowed.includes(field), `allowed fields do not include ${field}`);
  }
  console.log("");

  console.log("Test 12: fallback mapping");
  assert(c.fallbackMapping.missingFilePath === "reject_and_shadow_fallback", "missingFilePath fallback");
  assert(c.fallbackMapping.emptyPatch === "reject_and_shadow_fallback", "emptyPatch fallback");
  assert(c.fallbackMapping.outputTooLarge === "truncate_and_shadow_fallback", "outputTooLarge fallback");
  assert(c.fallbackMapping.prohibitedOutputContent === "reject_and_shadow_fallback", "prohibitedOutputContent fallback");
  assert(c.fallbackMapping.parseError === "reject_and_shadow_fallback", "parseError fallback");
  assert(c.fallbackMapping.unsupportedRequestType === "reject_and_shadow_fallback", "unsupportedRequestType fallback");
  console.log("");

  console.log("Test 13: safety rules");
  assert(c.outputParserSafetyRules.some((r) => r.includes("contract-only")), "safety: contract-only");
  assert(c.outputParserSafetyRules.some((r) => r.includes("default-off") || r.includes("default off")), "safety: default-off");
  assert(c.outputParserSafetyRules.some((r) => r.includes("code_generation")), "safety: code_generation only");
  assert(c.outputParserSafetyRules.some((r) => r.includes("stdout") && r.includes("not be persisted")), "safety: no stdout persistence");
  assert(c.outputParserSafetyRules.some((r) => r.includes("stderr") && r.includes("not be persisted")), "safety: no stderr persistence");
  assert(c.outputParserSafetyRules.some((r) => r.includes("code_patch")), "safety: code_patch output");
  assert(c.outputParserSafetyRules.some((r) => r.includes("empty") && r.includes("reject")), "safety: reject empty patch");
  assert(c.outputParserSafetyRules.some((r) => r.includes("file path") && r.includes("reject")), "safety: reject missing file path");
  assert(c.outputParserSafetyRules.some((r) => r.includes("secret") || r.includes("Secrets")), "safety: no secrets");
  assert(c.outputParserSafetyRules.some((r) => r.includes("routing") && r.includes("not change")), "safety: no routing change");
  assert(c.outputParserSafetyRules.some((r) => r.includes("final_status") && r.includes("not change")), "safety: no final_status change");
  console.log("");

  console.log("Test 14: non-goals");
  assert(c.nonGoals.some((g) => g.includes("output parser") && g.includes("Gateway")), "non-goal: no gateway parser logic");
  assert(c.nonGoals.some((g) => g.includes("real Codex CLI")), "non-goal: no real Codex CLI");
  assert(c.nonGoals.some((g) => g.includes("routing")), "non-goal: no routing change");
  assert(c.nonGoals.some((g) => g.includes("final_status")), "non-goal: no final_status change");
  assert(c.nonGoals.some((g) => g.includes("package scripts") || g.includes("CI")), "non-goal: no package/CI enablement");
  console.log("");

  console.log("Test 15: required before implementation");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("Gateway integration")), "requires gateway integration");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("Prompt builder")), "requires prompt builder");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("Fallback policy")), "requires fallback policy");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("Guardrails")), "requires guardrails");
  assert(c.requiredBeforeImplementation.some((r) => r.includes("Fake-runner") || r.includes("tests")), "requires fake-runner tests");
  console.log("");

  console.log("Test 16: Markdown consistency");
  const md = fs.readFileSync("CODEX_REAL_DISPATCH_OUTPUT_PARSER_CONTRACT.md", "utf-8");
  assert(md.includes("APPROVED_FOR_PLANNING"), "md: verdict");
  assert(md.includes("Parser Input Source") || md.includes("parser input source"), "md: parser input source");
  assert(md.includes("Expected Output Artifact") || md.includes("expected output artifact"), "md: expected output artifact");
  assert(md.includes("Parser Requirements") || md.includes("parser requirements"), "md: parser requirements");
  assert(md.includes("Prohibited Persistence Fields") || md.includes("prohibited persistence fields"), "md: prohibited persistence fields");
  assert(md.includes("Allowed Artifact Content Fields") || md.includes("allowed artifact content fields"), "md: allowed artifact content fields");
  assert(md.includes("Fallback") || md.includes("fallback"), "md: fallback behavior");
  assert(md.includes("Non-Goals") || md.includes("Non-goals"), "md: non-goals");
  assert(md.includes("code_generation"), "md: supported request type");
  console.log("");

  console.log("Test 17: forbidden imports");
  const src = fs.readFileSync("execution/codex-real-dispatch-output-parser-contract.ts", "utf-8");
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
