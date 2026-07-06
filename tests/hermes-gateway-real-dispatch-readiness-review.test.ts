// Regression Test - Hermes Gateway Real Dispatch Final Readiness Review
// =====================================================================
// Review-only. No Runtime, Gateway, real CLI, or skill execution.

import {
  HERMES_GATEWAY_REAL_DISPATCH_READINESS_REVIEW,
} from "../execution/hermes-gateway-real-dispatch-readiness-review";
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
  console.log("Hermes Gateway Real Dispatch Final Readiness Review Test\n");

  const r = HERMES_GATEWAY_REAL_DISPATCH_READINESS_REVIEW;

  console.log("Test 1: readiness object shape");
  assert(r.name === "Hermes Gateway Real Dispatch Final Readiness Review", "name");
  assert(r.adapter === "hermes", "adapter");
  assert(r.scope === "gateway_real_dispatch_sidecar", "scope");
  assert(r.verdict === "READY_WITH_CONSTRAINTS", "verdict");
  assert(r.recommendedNextPr === "Hermes Gateway Real Dispatch Controlled Rollout Plan", "next PR");
  console.log("");

  console.log("Test 2: default / wiring constraints");
  assert(r.runtimeActiveByDefault === false, "runtime not active by default");
  assert(r.gatewayActiveByDefault === false, "gateway not active by default");
  assert(r.wiredToGateway === true, "wired to gateway");
  assert(r.wiredToRuntime === false, "not wired to runtime");
  assert(r.defaultDisabled === true, "default disabled");
  assert(r.featureFlagged === true, "feature flagged");
  assert(r.requiresMultipleFlags === true, "requires multiple flags");
  console.log("");

  console.log("Test 3: field constraints");
  assert(r.gatewayField === "hermes_gateway_real_dispatch", "gateway field");
  assert(r.fallbackPolicyField === "fallbackPolicy", "fallbackPolicy field");
  assert(r.observabilityField === "observability", "observability field");
  assert(r.guardrailsField === "guardrails", "guardrails field");
  assert(r.topLevelFallbackField === false, "no top-level fallback");
  assert(r.topLevelObservabilityField === false, "no top-level observability");
  assert(r.topLevelGuardrailsField === false, "no top-level guardrails");
  assert(r.neverUndefinedKey === true, "never undefined key");
  console.log("");

  console.log("Test 4: request type ownership");
  assertSameArray(r.supportedRequestTypes, ["review", "code_review", "validation"], assert, "supported request types");
  assertSameArray(r.unsupportedRequestTypes, ["llm_task", "code_generation", "bugfix"], assert, "unsupported request types");
  assert(r.disabledDoesNotCallDispatcher === true, "disabled does not call dispatcher");
  assert(r.unsupportedDoesNotCallDispatcher === true, "unsupported does not call dispatcher");
  console.log("");

  console.log("Test 5: safety and ownership");
  assert(r.unsafeResultOmitted === true, "unsafe omitted");
  assert(r.dispatcherExceptionOmitted === true, "dispatcher exception omitted");
  assert(r.changesGatewayPrimaryDispatch === false, "no primary dispatch change");
  assert(r.changesGatewayFinalResult === false, "no gateway final result change");
  assert(r.changesRuntimeFinalStatus === false, "no runtime final status change");
  assert(r.changesRuntimeRouting === false, "no runtime routing change");
  assert(r.affectsPrimaryGatewayResult === false, "no primary gateway effect");
  assert(r.makesHermesDefault === false, "Hermes not default");
  assert(r.makesHermesFinalReviewOwner === false, "Hermes not final review owner");
  assert(r.makesHermesFinalValidationOwner === false, "Hermes not final validation owner");
  console.log("");

  console.log("Test 6: test safety");
  assert(r.usesFakeDispatcherInTests === true, "fake dispatcher in tests");
  assert(r.usesFakeRunnerInTests === true, "fake runner in tests");
  assert(r.invokesRealHermesCliInTests === false, "no real Hermes CLI in tests");
  console.log("");

  console.log("Test 7: persistence/leakage");
  assert(r.writesFiles === false, "no writes");
  assert(r.persistsAudit === false, "no audit persistence");
  assert(r.persistsObservability === false, "no observability persistence");
  assert(r.persistsGuardrails === false, "no guardrail persistence");
  assert(r.containsRawPrompt === false, "no raw prompt");
  assert(r.containsRawArtifacts === false, "no raw artifacts");
  assert(r.containsSecrets === false, "no secrets");
  console.log("");

  console.log("Test 8: implemented layers");
  assert(r.fallbackPolicyImplemented === true, "fallback policy implemented");
  assert(r.observabilityImplemented === true, "observability implemented");
  assert(r.guardrailsImplemented === true, "guardrails implemented");
  console.log("");

  console.log("Test 9: constraints and evidence");
  assert(r.readinessConstraints.some(c => c.includes("sidecar metadata only")), "constraint: sidecar metadata only");
  assert(r.readinessConstraints.some(c => c.includes("default-off")), "constraint: default-off");
  assert(r.readinessConstraints.some(c => c.includes("review/code_review/validation")), "constraint: request types");
  assert(r.readinessConstraints.some(c => c.includes("final review or validation decision")), "constraint: no final ownership");
  assert(r.readinessConstraints.some(c => c.includes("Unsafe") && c.includes("omitted")), "constraint: unsafe omitted");
  assert(r.readinessConstraints.some(c => c.includes("No persisted audit")), "constraint: no persistence");
  assert(r.readinessConstraints.some(c => c.includes("final_status") && c.includes("routing")), "constraint: no runtime dependency");
  const expectedEvidence = [
    "execution/gateway.ts",
    "execution/hermes-gateway-real-dispatch.ts",
    "execution/hermes-gateway-real-dispatch-contract.ts",
    "execution/hermes-gateway-real-dispatch-gateway-integration-contract.ts",
    "execution/hermes-gateway-real-dispatch-fallback-policy.ts",
    "execution/hermes-gateway-real-dispatch-observability.ts",
    "execution/hermes-gateway-real-dispatch-guardrails.ts",
    "tests/hermes-gateway-real-dispatch.test.ts",
    "tests/hermes-gateway-real-dispatch-gateway-integration.test.ts",
    "tests/hermes-gateway-real-dispatch-fallback-policy.test.ts",
    "tests/hermes-gateway-real-dispatch-observability.test.ts",
    "tests/hermes-gateway-real-dispatch-guardrails.test.ts",
    "HERMES_GATEWAY_REAL_DISPATCH_READINESS_REVIEW.md",
    "hermes-gateway-real-dispatch-readiness-review.json",
  ];
  for (const file of expectedEvidence) {
    assert(r.evidence.includes(file), `evidence: ${file}`);
  }
  console.log("");

  console.log("Test 10: Markdown consistency");
  const md = fs.readFileSync("HERMES_GATEWAY_REAL_DISPATCH_READINESS_REVIEW.md", "utf-8");
  assert(md.includes("READY_WITH_CONSTRAINTS"), "md: verdict");
  assert(md.includes("Gateway real dispatch sidecar metadata only"), "md: scope");
  assert(md.includes("hermes_gateway_real_dispatch"), "md: gateway field");
  assert(md.includes("fallbackPolicy"), "md: fallbackPolicy");
  assert(md.includes("observability"), "md: observability");
  assert(md.includes("guardrails"), "md: guardrails");
  assert(md.includes("No real Hermes CLI in tests"), "md: no real CLI");
  assert(md.includes("Hermes Gateway Real Dispatch Controlled Rollout Plan"), "md: next PR");
  console.log("");

  console.log("Test 11: JSON consistency");
  const json = JSON.parse(fs.readFileSync("hermes-gateway-real-dispatch-readiness-review.json", "utf-8"));
  assert(json.verdict === r.verdict, "json: verdict matches");
  assert(json.gateway_field === r.gatewayField, "json: gateway field matches");
  assert(json.wired_to_gateway === true, "json: wired gateway");
  assert(json.wired_to_runtime === false, "json: not wired runtime");
  assert(json.recommended_next_pr.title === r.recommendedNextPr, "json: next PR matches");
  console.log("");

  console.log("Test 12: forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-real-dispatch-readiness-review.ts", "utf-8");
  const forbidden = [
    "runtime",
    "execution/gateway",
    "dispatchHermesGatewayReal",
    "executeHermesCliCommand",
    "runHermesGatewayShadowSidecar",
    "buildHermesRuntimeShadowAttachmentFromRequest",
    "child_process",
    "fs",
    "http",
    "https",
    "fetch",
    "policy-memory",
    "graph",
    "kimi-gateway-real-dispatch",
    "codex",
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
