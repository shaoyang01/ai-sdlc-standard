// Regression Test - Codex Real Dispatch Readiness Review
// =======================================================
// Review-only. No Runtime, Gateway, real CLI, or skill execution.

import {
  CODEX_REAL_DISPATCH_READINESS_REVIEW,
} from "../execution/codex-real-dispatch-readiness-review";
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
  console.log("Codex Real Dispatch Readiness Review Test\n");

  const r = CODEX_REAL_DISPATCH_READINESS_REVIEW;

  console.log("Test 1: readiness object shape");
  assert(r.name === "Codex Real Dispatch Readiness Review", "name");
  assert(r.adapter === "codex", "adapter");
  assert(r.scope === "real_dispatch_readiness_review", "scope");
  assert(r.status === "review_only", "status");
  assert(r.reviewOnly === true, "reviewOnly");
  assert(r.verdict === "READY_WITH_CONSTRAINTS", "verdict");
  assert(r.executingNow === false, "not executing now");
  assert(r.enablesFeatureFlagsNow === false, "not enabling flags now");
  assert(r.expandsRequestTypesNow === false, "not expanding request types now");
  assert(r.recommendedNextPr === "Codex Real Dispatch Fallback Policy Contract", "next PR");
  console.log("");

  console.log("Test 2: default / behavior constraints");
  assert(r.defaultDisabled === true, "default disabled");
  assert(r.featureFlagged === true, "feature flagged");
  assert(r.changesRuntimeBehaviorNow === false, "no runtime behavior change now");
  assert(r.changesGatewayBehaviorNow === false, "no gateway behavior change now");
  assert(r.addsEnablementScripts === false, "no enablement scripts");
  assert(r.changesCiBehavior === false, "no CI behavior change");
  console.log("");

  console.log("Test 3: request type scope");
  assertSameArray(r.supportedRequestTypes, ["code_generation"], assert, "supported request types");
  assert(!(r.supportedRequestTypes as readonly string[]).includes("code_review"), "code_review is not supported");
  assert(!(r.supportedRequestTypes as readonly string[]).includes("validation"), "validation is not supported");
  assert(!(r.supportedRequestTypes as readonly string[]).includes("bugfix"), "bugfix is not supported");
  assert(!(r.supportedRequestTypes as readonly string[]).includes("llm_task"), "llm_task is not supported");
  assert(!(r.supportedRequestTypes as readonly string[]).includes("review"), "review is not supported");
  assert(r.unsupportedRequestTypes.includes("code_review"), "code_review in unsupported list");
  assert(r.unsupportedRequestTypes.includes("validation"), "validation in unsupported list");
  assert(r.unsupportedRequestTypes.includes("bugfix"), "bugfix in unsupported list");
  console.log("");

  console.log("Test 4: required flags");
  assert(r.requiredFlags.includes("SDLC_EXECUTION_MODE=codex"), "requires SDLC_EXECUTION_MODE=codex");
  assert(r.requiredFlags.length === 1, "exactly one required flag in this phase");
  console.log("");

  console.log("Test 5: guardrails");
  assert(typeof r.guardrails.maxPromptChars === "number" && r.guardrails.maxPromptChars > 0, "maxPromptChars present");
  assert(typeof r.guardrails.maxOutputChars === "number" && r.guardrails.maxOutputChars > 0, "maxOutputChars present");
  assert(typeof r.guardrails.timeoutMs === "number" && r.guardrails.timeoutMs > 0, "timeoutMs present");
  assert(r.guardrails.prohibitRawPromptPersistence === true, "raw prompt persistence prohibited");
  assert(r.guardrails.prohibitSecrets === true, "secrets prohibited");
  assert(r.guardrails.prohibitFullStdoutPersistence === true, "full stdout persistence prohibited");
  assert(r.guardrails.prohibitFullStderrPersistence === true, "full stderr persistence prohibited");
  console.log("");

  console.log("Test 6: fallback policy");
  assert(r.fallbackPolicy.onCliMissing === "shadow_fallback", "CLI missing fallback is shadow_fallback");
  assert(r.fallbackPolicy.onTimeout === "shadow_fallback", "timeout fallback is shadow_fallback");
  assert(r.fallbackPolicy.onNonZeroExit === "shadow_fallback", "non-zero exit fallback is shadow_fallback");
  assert(r.fallbackPolicy.onOutputTooLarge === "truncate_and_shadow_fallback", "output too large fallback truncates and shadows");
  console.log("");

  console.log("Test 7: non-goals");
  assert(r.nonGoals.some((g) => g.includes("no routing change") || g.includes("Do not change Runtime graph transitions")), "non-goal: no routing change");
  assert(r.nonGoals.some((g) => g.includes("no final_status change") || g.includes("Do not change Runtime final_status")), "non-goal: no final_status change");
  assert(r.nonGoals.some((g) => g.includes("code_review")), "non-goal mentions code_review");
  assert(r.nonGoals.some((g) => g.includes("validation")), "non-goal mentions validation");
  assert(r.nonGoals.some((g) => g.includes("bugfix")), "non-goal mentions bugfix");
  assert(r.nonGoals.some((g) => g.includes("package scripts") || g.includes("CI")), "non-goal mentions package scripts or CI");
  console.log("");

  console.log("Test 8: ownership and side effects");
  assert(r.changesRuntimeFinalStatus === false, "no runtime final_status change");
  assert(r.changesRuntimeRouting === false, "no runtime routing change");
  assert(r.changesGatewayPrimaryDispatch === false, "no gateway primary dispatch change");
  assert(r.changesGatewayFinalResult === false, "no gateway final result change");
  assert(r.affectsPrimaryGatewayResult === false, "no primary gateway result effect");
  assert(r.makesCodexDefault === false, "Codex not default");
  assert(r.makesCodexFinalReviewOwner === false, "Codex not final review owner");
  assert(r.makesCodexFinalCodeReviewOwner === false, "Codex not final code_review owner");
  assert(r.makesCodexFinalValidationOwner === false, "Codex not final validation owner");
  assert(r.writesFiles === false, "no file writes");
  assert(r.persistsAudit === false, "no audit persistence");
  assert(r.persistsObservability === false, "no observability persistence");
  assert(r.persistsGuardrails === false, "no guardrail persistence");
  assert(r.containsRawPrompt === false, "no raw prompt in contract");
  assert(r.containsRawArtifacts === false, "no raw artifacts in contract");
  assert(r.containsSecrets === false, "no secrets in contract");
  assert(r.invokesRealCodexCliInTests === false, "no real Codex CLI in tests");
  console.log("");

  console.log("Test 9: observability boundaries");
  assert(r.observability.persisted === false, "observability not persisted");
  assert(r.observability.includesRawPrompt === false, "observability excludes raw prompt");
  assert(r.observability.includesRawArtifacts === false, "observability excludes raw artifacts");
  assert(r.observability.includesSecrets === false, "observability excludes secrets");
  assert(r.observability.includesFullStdout === false, "observability excludes full stdout");
  assert(r.observability.includesFullStderr === false, "observability excludes full stderr");
  console.log("");

  console.log("Test 10: Markdown consistency");
  const md = fs.readFileSync("CODEX_REAL_DISPATCH_READINESS_REVIEW.md", "utf-8");
  assert(md.includes("READY_WITH_CONSTRAINTS"), "md: verdict");
  assert(md.includes("SDLC_EXECUTION_MODE=codex"), "md: required flag");
  assert(md.includes("code_generation"), "md: supported request type");
  assert(md.includes("code_review") || md.includes("validation") || md.includes("bugfix"), "md: unsupported request types");
  assert(md.includes("shadow_fallback"), "md: fallback policy");
  assert(md.includes("no routing change") || md.includes("routing"), "md: routing boundary");
  assert(md.includes("final_status"), "md: final_status boundary");
  console.log("");

  console.log("Test 11: forbidden imports");
  const src = fs.readFileSync("execution/codex-real-dispatch-readiness-review.ts", "utf-8");
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
