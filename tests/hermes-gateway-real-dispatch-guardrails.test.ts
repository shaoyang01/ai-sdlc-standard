// Regression Test — Hermes Gateway Real Dispatch Guardrails
// Sidecar metadata guardrails only. No real Hermes CLI calls.

import fs from "fs";
import {
  DEFAULT_HERMES_GATEWAY_REAL_DISPATCH_GUARDRAIL_LIMITS,
  evaluateHermesGatewayRealDispatchGuardrails,
  type HermesGatewayRealDispatchGuardrailDecision,
  type HermesGatewayRealDispatchGuardrailResult,
} from "../execution/hermes-gateway-real-dispatch-guardrails";
import type { HermesGatewayRealDispatchResult } from "../execution/hermes-gateway-real-dispatch";
import type { HermesGatewayRealDispatchFallbackPolicyResult } from "../execution/hermes-gateway-real-dispatch-fallback-policy";
import type { HermesGatewayRealDispatchObservability } from "../execution/hermes-gateway-real-dispatch-observability";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failed++;
    console.error(`  ✗ ${message}`);
    return;
  }
  passed++;
  console.log(`  ✓ ${message}`);
}

function dispatchResult(
  overrides: Partial<HermesGatewayRealDispatchResult> = {}
): HermesGatewayRealDispatchResult {
  return {
    adapter: "hermes",
    source: "hermes_gateway_real_dispatch",
    status: "dispatch_executed_success",
    requestId: "REQ-HERMES-GUARD",
    requestType: "review",
    enabled: true,
    eligible: true,
    executed: true,
    contractDecision: "eligible_contract_only",
    commandDecision: "executed_success",
    outputSummary: "ok",
    fallbackAction: "preserve_existing_gateway_behavior",
    affectsPrimaryGatewayResult: false,
    changesGatewayPrimaryDispatch: false,
    changesRuntimeFinalStatus: false,
    changesRuntimeRouting: false,
    writesFiles: false,
    persistsAudit: false,
    containsRawPrompt: false,
    containsRawArtifacts: false,
    containsSecrets: false,
    warnings: [],
    ...overrides,
  };
}

function fallbackPolicy(
  overrides: Partial<HermesGatewayRealDispatchFallbackPolicyResult> = {}
): HermesGatewayRealDispatchFallbackPolicyResult {
  return {
    adapter: "hermes",
    source: "hermes_gateway_real_dispatch_fallback_policy",
    policyVersion: 1,
    reason: "dispatch_success",
    action: "attach_sidecar_metadata",
    shouldAttachSidecar: true,
    shouldOmitSidecar: false,
    preservesGatewayPrimaryResult: true,
    preservesGatewayFinalResult: true,
    preservesRuntimeFinalStatus: true,
    preservesRuntimeRouting: true,
    affectsPrimaryGatewayResult: false,
    changesGatewayPrimaryDispatch: false,
    changesGatewayFinalResult: false,
    changesRuntimeFinalStatus: false,
    changesRuntimeRouting: false,
    writesFiles: false,
    persistsAudit: false,
    containsRawPrompt: false,
    containsRawArtifacts: false,
    containsSecrets: false,
    warnings: [],
    ...overrides,
  };
}

function observability(
  overrides: Partial<HermesGatewayRealDispatchObservability> = {}
): HermesGatewayRealDispatchObservability {
  return {
    adapter: "hermes",
    source: "hermes_gateway_real_dispatch_observability",
    observabilityVersion: 1,
    gatewayField: "hermes_gateway_real_dispatch",
    outcome: "attached_success",
    requestType: "review",
    dispatchStatus: "dispatch_executed_success",
    contractDecision: "eligible_contract_only",
    fallbackReason: "dispatch_success",
    fallbackAction: "attach_sidecar_metadata",
    attached: true,
    omitted: false,
    safeToAttach: true,
    warningCount: 0,
    hasWarnings: false,
    timestamp: "2026-01-01T00:00:00.000Z",
    preservesGatewayPrimaryResult: true,
    preservesGatewayFinalResult: true,
    preservesRuntimeFinalStatus: true,
    preservesRuntimeRouting: true,
    affectsPrimaryGatewayResult: false,
    changesGatewayPrimaryDispatch: false,
    changesGatewayFinalResult: false,
    changesRuntimeFinalStatus: false,
    changesRuntimeRouting: false,
    writesFiles: false,
    persistsObservability: false,
    persistsAudit: false,
    containsRawPrompt: false,
    containsRawArtifacts: false,
    containsSecrets: false,
    ...overrides,
  };
}

function evaluateSafe(overrides: {
  requestType?: string;
  dispatchResult?: HermesGatewayRealDispatchResult;
  fallbackPolicy?: HermesGatewayRealDispatchFallbackPolicyResult;
  observability?: HermesGatewayRealDispatchObservability;
  realDispatchEnabled?: boolean;
  integrationMayAttach?: boolean;
  limits?: Parameters<typeof evaluateHermesGatewayRealDispatchGuardrails>[0]["limits"];
} = {}): HermesGatewayRealDispatchGuardrailResult {
  return evaluateHermesGatewayRealDispatchGuardrails({
    requestType: overrides.requestType ?? "review",
    dispatchResult: overrides.dispatchResult ?? dispatchResult(),
    fallbackPolicy: overrides.fallbackPolicy ?? fallbackPolicy(),
    observability: overrides.observability ?? observability(),
    realDispatchEnabled: overrides.realDispatchEnabled ?? true,
    integrationMayAttach: overrides.integrationMayAttach ?? true,
    limits: overrides.limits,
  });
}

function assertDecision(
  result: HermesGatewayRealDispatchGuardrailResult,
  decision: HermesGatewayRealDispatchGuardrailDecision,
  label: string
): void {
  assert(result.decision === decision, `${label}: decision`);
  assert(result.allowed === (decision === "allow_attach"), `${label}: allowed`);
  assert(result.shouldAttachSidecar === (decision === "allow_attach"), `${label}: attach`);
}

function assertSafety(result: HermesGatewayRealDispatchGuardrailResult, label: string): void {
  assert(result.adapter === "hermes", `${label}: adapter`);
  assert(result.source === "hermes_gateway_real_dispatch_guardrails", `${label}: source`);
  assert(result.guardrailVersion === 1, `${label}: version`);
  assert(result.preservesGatewayPrimaryResult === true, `${label}: preserves primary`);
  assert(result.preservesGatewayFinalResult === true, `${label}: preserves gateway final`);
  assert(result.preservesRuntimeFinalStatus === true, `${label}: preserves runtime final status`);
  assert(result.preservesRuntimeRouting === true, `${label}: preserves runtime routing`);
  assert(result.affectsPrimaryGatewayResult === false, `${label}: no primary effect`);
  assert(result.changesGatewayPrimaryDispatch === false, `${label}: no gateway dispatch change`);
  assert(result.changesGatewayFinalResult === false, `${label}: no gateway final result change`);
  assert(result.changesRuntimeFinalStatus === false, `${label}: no runtime final status change`);
  assert(result.changesRuntimeRouting === false, `${label}: no runtime routing change`);
  assert(result.writesFiles === false, `${label}: no file writes`);
  assert(result.persistsGuardrails === false, `${label}: no guardrail persistence`);
  assert(result.persistsObservability === false, `${label}: no observability persistence`);
  assert(result.persistsAudit === false, `${label}: no audit persistence`);
  assert(result.containsRawPrompt === false, `${label}: no raw prompt`);
  assert(result.containsRawArtifacts === false, `${label}: no raw artifacts`);
  assert(result.containsSecrets === false, `${label}: no secrets`);
}

function assertNoLeaks(value: unknown, label: string): void {
  const serialized = JSON.stringify(value);
  assert(!serialized.includes("THIS_HERMES_GATEWAY_REAL_DISPATCH_PROMPT_MUST_NOT_LEAK"), `${label}: no prompt marker`);
  assert(!serialized.includes("abc"), `${label}: no abc`);
  assert(!serialized.includes("123"), `${label}: no 123`);
  assert(!serialized.includes("xyz"), `${label}: no xyz`);
  assert(!serialized.includes("sk-test"), `${label}: no sk-test`);
}

async function test(): Promise<void> {
  console.log("Hermes Gateway Real Dispatch Guardrails Test\n");

  console.log("Test 1: Allow attach");
  const allowed = evaluateSafe();
  assertDecision(allowed, "allow_attach", "allow");
  for (const [name, value] of Object.entries(allowed.checks)) {
    assert(value === true, `allow check ${name}`);
  }
  assert(allowed.warningCount === 0, "allow warning count");
  assert(allowed.maxWarnings === DEFAULT_HERMES_GATEWAY_REAL_DISPATCH_GUARDRAIL_LIMITS.maxWarnings, "allow max warnings");
  assertSafety(allowed, "allow");
  console.log("");

  console.log("Test 2: Disabled reject");
  assertDecision(evaluateSafe({ realDispatchEnabled: false }), "reject_disabled", "disabled");
  console.log("");

  console.log("Test 3: Unsupported request type reject");
  assertDecision(evaluateSafe({ requestType: "llm_task" }), "reject_unsupported_request_type", "unsupported");
  console.log("");

  console.log("Test 4: Missing dispatch result reject");
  const missingDispatch = evaluateHermesGatewayRealDispatchGuardrails({
    requestType: "review",
    fallbackPolicy: fallbackPolicy(),
    observability: observability(),
    realDispatchEnabled: true,
    integrationMayAttach: true,
  });
  assertDecision(missingDispatch, "reject_missing_dispatch_result", "missing dispatch");
  console.log("");

  console.log("Test 5: Integration unsafe reject");
  assertDecision(evaluateSafe({ integrationMayAttach: false }), "reject_unsafe_dispatch_result", "unsafe integration");
  console.log("");

  console.log("Test 6: Unexpected status reject");
  assertDecision(
    evaluateSafe({ dispatchResult: dispatchResult({ status: "dispatch_weird" as any }) }),
    "reject_unexpected_status",
    "unexpected status"
  );
  console.log("");

  console.log("Test 7: Missing fallback policy reject");
  const missingFallback = evaluateHermesGatewayRealDispatchGuardrails({
    requestType: "review",
    dispatchResult: dispatchResult(),
    observability: observability(),
    realDispatchEnabled: true,
    integrationMayAttach: true,
  });
  assertDecision(missingFallback, "reject_missing_fallback_policy", "missing fallback");
  console.log("");

  console.log("Test 8: Missing observability reject");
  const missingObservability = evaluateHermesGatewayRealDispatchGuardrails({
    requestType: "review",
    dispatchResult: dispatchResult(),
    fallbackPolicy: fallbackPolicy(),
    realDispatchEnabled: true,
    integrationMayAttach: true,
  });
  assertDecision(missingObservability, "reject_missing_observability", "missing observability");
  console.log("");

  console.log("Test 9: Warning limit exceeded");
  const warningLimit = evaluateSafe({
    dispatchResult: dispatchResult({ warnings: ["one"] }),
    fallbackPolicy: fallbackPolicy({ warnings: ["two"] }),
    observability: observability({ warningCount: 2, hasWarnings: true }),
    limits: { maxWarnings: 1 },
  });
  assertDecision(warningLimit, "reject_warning_limit_exceeded", "warning limit");
  assert(warningLimit.warningCount === 4, "warning count combined");
  console.log("");

  console.log("Test 10: Raw prompt risk");
  assertDecision(
    evaluateSafe({ dispatchResult: dispatchResult({ containsRawPrompt: true as false }) }),
    "reject_raw_prompt_risk",
    "raw prompt"
  );
  console.log("");

  console.log("Test 11: Raw artifact risk");
  assertDecision(
    evaluateSafe({ dispatchResult: dispatchResult({ containsRawArtifacts: true as false }) }),
    "reject_artifact_risk",
    "raw artifact"
  );
  console.log("");

  console.log("Test 12: Secret risk");
  assertDecision(
    evaluateSafe({ dispatchResult: dispatchResult({ containsSecrets: true as false }) }),
    "reject_secret_risk",
    "secret"
  );
  console.log("");

  console.log("Test 13: Gateway/Runtime mutation risk");
  for (const field of [
    "changesGatewayPrimaryDispatch",
    "affectsPrimaryGatewayResult",
    "changesRuntimeFinalStatus",
    "changesRuntimeRouting",
    "writesFiles",
    "persistsAudit",
  ] as const) {
    const result = evaluateSafe({
      dispatchResult: dispatchResult({ [field]: true } as any),
    });
    assertDecision(result, "reject_unsafe_dispatch_result", field);
  }
  console.log("");

  console.log("Test 14: Observability persistence risk");
  assertDecision(
    evaluateSafe({ observability: observability({ persistsObservability: true as false }) }),
    "reject_unsafe_dispatch_result",
    "observability persistence"
  );
  console.log("");

  console.log("Test 15: No raw warning text in result");
  const rawWarnings = evaluateSafe({
    dispatchResult: dispatchResult({
      warnings: [
        "THIS_HERMES_GATEWAY_REAL_DISPATCH_PROMPT_MUST_NOT_LEAK token=abc",
        "password=123",
      ],
    }),
    fallbackPolicy: fallbackPolicy({
      warnings: [
        "api_key=xyz",
        "sk-test",
      ],
    }),
    observability: observability({ warningCount: 4, hasWarnings: true }),
  });
  assertDecision(rawWarnings, "allow_attach", "raw warnings");
  assert(rawWarnings.warningCount === 8, "raw warnings count only");
  assertNoLeaks(rawWarnings, "raw warnings");
  console.log("");

  console.log("Test 16: Forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-real-dispatch-guardrails.ts", "utf-8");
  const forbiddenImports = [
    "runtime",
    "execution/gateway",
    "executeHermesCliCommand",
    "dispatchHermesGatewayReal",
    "child_process",
    "\"fs\"",
    "'fs'",
    "http",
    "https",
    "fetch",
    "policy-memory",
    "graph",
    "kimi-gateway-real-dispatch",
    "codex",
  ];
  const badLines = src.split("\n").filter((line) => {
    if (!line.includes("import ")) return false;
    return forbiddenImports.some((item) => line.includes(item));
  });
  assert(badLines.length === 0, `no forbidden imports (found ${badLines.length})`);
  console.log("");

  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

test().catch((err) => {
  console.error(err);
  process.exit(1);
});
