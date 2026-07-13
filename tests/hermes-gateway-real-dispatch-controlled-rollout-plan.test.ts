// Regression Test - Hermes Gateway Real Dispatch Controlled Rollout Plan
// ======================================================================
// Plan-only. No rollout execution, Gateway behavior change, Runtime behavior change, or real CLI.

import {
  HERMES_GATEWAY_REAL_DISPATCH_CONTROLLED_ROLLOUT_PLAN,
} from "../execution/hermes-gateway-real-dispatch-controlled-rollout-plan";
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
  console.log("Hermes Gateway Real Dispatch Controlled Rollout Plan Test\n");

  const p = HERMES_GATEWAY_REAL_DISPATCH_CONTROLLED_ROLLOUT_PLAN;

  console.log("Test 1: plan object shape");
  assert(p.name === "Hermes Gateway Real Dispatch Controlled Rollout Plan", "name");
  assert(p.adapter === "hermes", "adapter");
  assert(p.scope === "gateway_real_dispatch_sidecar_rollout_plan", "scope");
  assert(p.status === "plan_only", "status");
  assert(p.recommendedNextPr === "Hermes Gateway Real Dispatch Rollout Validation Checklist", "next PR");
  console.log("");

  console.log("Test 2: non-execution constraints");
  assert(p.planOnly === true, "plan only");
  assert(p.executingNow === false, "not executing");
  assert(p.enablesFeatureFlagsNow === false, "does not enable flags");
  assert(p.changesRuntimeBehaviorNow === false, "no runtime behavior change");
  assert(p.changesGatewayBehaviorNow === false, "no Gateway behavior change");
  console.log("");

  console.log("Test 3: readiness dependency");
  assert(p.readinessVerdictRequired === "READY_WITH_CONSTRAINTS", "required verdict");
  assert(p.currentReadinessVerdict === "READY_WITH_CONSTRAINTS", "current verdict");
  console.log("");

  console.log("Test 4: field and flag constraints");
  assert(p.gatewayField === "hermes_gateway_real_dispatch", "gateway field");
  assert(p.fallbackPolicyField === "fallbackPolicy", "fallback field");
  assert(p.observabilityField === "observability", "observability field");
  assert(p.guardrailsField === "guardrails", "guardrails field");
  assert(p.defaultDisabled === true, "default disabled");
  assert(p.featureFlagged === true, "feature flagged");
  assert(p.requiresMultipleFlags === true, "requires multiple flags");
  assertSameArray(p.requiredFlags, [
    "SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled",
    "SDLC_HERMES_GATEWAY_INTEGRATION=enabled",
    "SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled",
  ], assert, "required flags");
  console.log("");

  console.log("Test 5: request type rollout scope");
  assertSameArray(p.supportedRequestTypes, ["review", "code_review", "validation"], assert, "supported request types");
  assertSameArray(p.initialRolloutRequestTypes, ["review"], assert, "initial request types");
  assertSameArray(p.unsupportedRequestTypes, ["llm_task", "code_generation", "bugfix"], assert, "unsupported request types");
  console.log("");

  console.log("Test 6: behavior safety");
  assert(p.changesGatewayPrimaryDispatch === false, "no primary dispatch change");
  assert(p.changesGatewayFinalResult === false, "no Gateway final result change");
  assert(p.changesRuntimeFinalStatus === false, "no Runtime final status change");
  assert(p.changesRuntimeRouting === false, "no Runtime routing change");
  assert(p.affectsPrimaryGatewayResult === false, "no primary Gateway effect");
  assert(p.makesHermesDefault === false, "Hermes not default");
  assert(p.makesHermesFinalReviewOwner === false, "Hermes not review owner");
  assert(p.makesHermesFinalValidationOwner === false, "Hermes not validation owner");
  console.log("");

  console.log("Test 7: persistence/leakage");
  assert(p.writesFiles === false, "no writes");
  assert(p.persistsRolloutLogs === false, "no rollout log persistence");
  assert(p.persistsAudit === false, "no audit persistence");
  assert(p.persistsObservability === false, "no observability persistence");
  assert(p.persistsGuardrails === false, "no guardrail persistence");
  assert(p.containsRawPrompt === false, "no raw prompt");
  assert(p.containsRawArtifacts === false, "no raw artifacts");
  assert(p.containsSecrets === false, "no secrets");
  console.log("");

  console.log("Test 8: rollout phases");
  assert(p.rolloutPhases.length === 6, "six phases");
  for (const phase of p.rolloutPhases) {
    assert(phase.status === "planned", `${phase.name}: planned`);
    assert(phase.executingNow === false, `${phase.name}: not executing`);
    assert(phase.enablesFeatureFlagsNow === false, `${phase.name}: no flag enablement`);
    assert(phase.changesRuntimeBehaviorNow === false, `${phase.name}: no runtime behavior change`);
    assert(phase.changesGatewayBehaviorNow === false, `${phase.name}: no Gateway behavior change`);
    assert(phase.requiredBeforeNextPhase.length > 0, `${phase.name}: requirements`);
    assert(phase.rollbackCriteria.length > 0, `${phase.name}: rollback criteria`);
  }
  assertSameArray(p.rolloutPhases[0].allowedRequestTypes, [], assert, "phase 0 no request types");
  assertSameArray(p.rolloutPhases[1].allowedRequestTypes, ["review"], assert, "phase 1 review only");
  assertSameArray(p.rolloutPhases[2].allowedRequestTypes, ["review"], assert, "phase 2 review only");
  assertSameArray(p.rolloutPhases[3].allowedRequestTypes, ["review"], assert, "phase 3 review only");
  assertSameArray(p.rolloutPhases[4].allowedRequestTypes, ["review", "code_review", "validation"], assert, "phase 4 all supported");
  assertSameArray(p.rolloutPhases[5].allowedRequestTypes, ["review", "code_review", "validation"], assert, "phase 5 all supported");
  console.log("");

  console.log("Test 9: rollback criteria and constraints");
  assert(p.globalRollbackCriteria.some(c => c.includes("Gateway primary result")), "rollback: Gateway primary result");
  assert(p.globalRollbackCriteria.some(c => c.includes("Gateway final result")), "rollback: Gateway final result");
  assert(p.globalRollbackCriteria.some(c => c.includes("Runtime final_status") && c.includes("routing")), "rollback: Runtime final_status/routing");
  assert(p.globalRollbackCriteria.some(c => c.includes("unsupported request type")), "rollback: unsupported request type");
  assert(p.globalRollbackCriteria.some(c => c.includes("raw prompt") && c.includes("raw artifact") && c.includes("secret")), "rollback: raw prompt/artifact/secret");
  assert(p.globalRollbackCriteria.some(c => c.includes("persisted rollout") && c.includes("audit") && c.includes("observability") && c.includes("guardrail")), "rollback: persisted logs");
  assert(p.globalRollbackCriteria.some(c => c.includes("real Hermes CLI") && c.includes("tests")), "rollback: real CLI in tests");
  assert(p.globalRollbackCriteria.some(c => c.includes("feature flag") && c.includes("enabled by default")), "rollback: default flag");
  assert(p.rolloutConstraints.some(c => c.includes("plan-only")), "constraint: plan-only");
  assert(p.rolloutConstraints.some(c => c.includes("sidecar metadata only")), "constraint: sidecar only");
  assert(p.rolloutConstraints.some(c => c.includes("default-off")), "constraint: default-off");
  assert(p.rolloutConstraints.some(c => c.includes("initially roll out only for review")), "constraint: review initial");
  assert(p.rolloutConstraints.some(c => c.includes("requires operator approval")), "constraint: expansion approval");
  assert(p.rolloutConstraints.some(c => c.includes("final review or validation owner")), "constraint: no final ownership");
  assert(p.rolloutConstraints.some(c => c.includes("final_status") && c.includes("routing")), "constraint: no runtime dependency");
  assert(p.rolloutConstraints.some(c => c.includes("No rollout logs") && c.includes("persist")), "constraint: no persistence");
  console.log("");

  console.log("Test 10: evidence");
  const expectedEvidence = [
    "execution/hermes-gateway-real-dispatch-readiness-review.ts",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_READINESS_REVIEW.md",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-readiness-review.json",
    "execution/hermes-gateway-real-dispatch-controlled-rollout-plan.ts",
    "tests/hermes-gateway-real-dispatch-controlled-rollout-plan.test.ts",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_CONTROLLED_ROLLOUT_PLAN.md",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-controlled-rollout-plan.json",
  ];
  for (const file of expectedEvidence) {
    assert(p.evidence.includes(file), `evidence: ${file}`);
  }
  console.log("");

  console.log("Test 11: Markdown consistency");
  const md = fs.readFileSync("docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_CONTROLLED_ROLLOUT_PLAN.md", "utf-8");
  assert(md.includes("plan_only"), "md: status");
  assert(md.includes("Gateway real dispatch sidecar rollout plan only"), "md: scope");
  assert(md.includes("This PR does not execute rollout"), "md: no rollout execution");
  assert(md.includes("This PR does not enable feature flags"), "md: no flag enablement");
  assert(md.includes("READY_WITH_CONSTRAINTS"), "md: readiness");
  for (const flag of p.requiredFlags) {
    assert(md.includes(flag), `md: ${flag}`);
  }
  for (const phase of p.rolloutPhases) {
    assert(md.includes(phase.name), `md: ${phase.name}`);
  }
  assert(md.includes("Hermes Gateway Real Dispatch Rollout Validation Checklist"), "md: next PR");
  console.log("");

  console.log("Test 12: JSON consistency");
  const json = JSON.parse(fs.readFileSync("metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-controlled-rollout-plan.json", "utf-8"));
  assert(json.status === p.status, "json: status");
  assert(json.plan_only === true, "json: plan only");
  assert(json.executing_now === false, "json: not executing");
  assert(json.current_readiness_verdict === p.currentReadinessVerdict, "json: readiness verdict");
  assert(json.recommended_next_pr.title === p.recommendedNextPr, "json: next PR");
  assert(json.rollout_phases.length === p.rolloutPhases.length, "json: phases length");
  console.log("");

  console.log("Test 13: forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-real-dispatch-controlled-rollout-plan.ts", "utf-8");
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

  console.log("Test 14: forbidden runtime file changes");
  const runtimeSrc = fs.readFileSync("runtime.ts", "utf-8");
  const gatewaySrc = fs.readFileSync("execution/gateway.ts", "utf-8");
  const dispatchSrc = fs.readFileSync("execution/hermes-gateway-real-dispatch.ts", "utf-8");
  assert(!runtimeSrc.includes("controlled_rollout"), "runtime.ts no controlled_rollout");
  assert(!gatewaySrc.includes("controlled_rollout"), "execution/gateway.ts no controlled_rollout");
  assert(!dispatchSrc.includes("controlled_rollout"), "real dispatch no controlled_rollout");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
