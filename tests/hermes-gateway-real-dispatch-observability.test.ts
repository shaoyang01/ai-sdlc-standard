// Regression Test — Hermes Gateway Real Dispatch Observability
// Sanitized in-memory sidecar metadata only. No real Hermes CLI calls.

import fs from "fs";
import {
  buildHermesGatewayRealDispatchObservability,
  type HermesGatewayRealDispatchObservability,
} from "../execution/hermes-gateway-real-dispatch-observability";
import type { HermesGatewayRealDispatchResult } from "../execution/hermes-gateway-real-dispatch";
import type { HermesGatewayRealDispatchFallbackPolicyResult } from "../execution/hermes-gateway-real-dispatch-fallback-policy";

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
    requestId: "REQ-HERMES-OBS",
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

function assertSafety(obs: HermesGatewayRealDispatchObservability, label: string): void {
  assert(obs.adapter === "hermes", `${label}: adapter`);
  assert(obs.source === "hermes_gateway_real_dispatch_observability", `${label}: source`);
  assert(obs.observabilityVersion === 1, `${label}: version`);
  assert(obs.gatewayField === "hermes_gateway_real_dispatch", `${label}: gateway field`);
  assert(obs.preservesGatewayPrimaryResult === true, `${label}: preserves primary`);
  assert(obs.preservesGatewayFinalResult === true, `${label}: preserves gateway final`);
  assert(obs.preservesRuntimeFinalStatus === true, `${label}: preserves runtime final status`);
  assert(obs.preservesRuntimeRouting === true, `${label}: preserves runtime routing`);
  assert(obs.affectsPrimaryGatewayResult === false, `${label}: no primary effect`);
  assert(obs.changesGatewayPrimaryDispatch === false, `${label}: no gateway dispatch change`);
  assert(obs.changesGatewayFinalResult === false, `${label}: no gateway final result change`);
  assert(obs.changesRuntimeFinalStatus === false, `${label}: no runtime final status change`);
  assert(obs.changesRuntimeRouting === false, `${label}: no runtime routing change`);
  assert(obs.writesFiles === false, `${label}: no file writes`);
  assert(obs.persistsObservability === false, `${label}: no observability persistence`);
  assert(obs.persistsAudit === false, `${label}: no audit persistence`);
  assert(obs.containsRawPrompt === false, `${label}: no raw prompt`);
  assert(obs.containsRawArtifacts === false, `${label}: no raw artifacts`);
  assert(obs.containsSecrets === false, `${label}: no secrets`);
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
  console.log("Hermes Gateway Real Dispatch Observability Test\n");

  console.log("Test 1: Disabled");
  const disabled = buildHermesGatewayRealDispatchObservability({
    requestType: "review",
    attached: false,
    omitted: true,
    safeToAttach: false,
    realDispatchEnabled: false,
  });
  assert(disabled.outcome === "disabled", "disabled outcome");
  assert(disabled.attached === false, "disabled not attached");
  assert(disabled.omitted === true, "disabled omitted");
  assert(disabled.persistsObservability === false, "disabled no persistence");
  assertSafety(disabled, "disabled");
  console.log("");

  console.log("Test 2: Unsupported request type");
  const unsupported = buildHermesGatewayRealDispatchObservability({
    requestType: "llm_task",
    dispatchResult: dispatchResult(),
    fallbackPolicy: fallbackPolicy(),
    attached: false,
    omitted: true,
    safeToAttach: false,
    realDispatchEnabled: true,
  });
  assert(unsupported.outcome === "unsupported_request_type", "unsupported outcome");
  assertSafety(unsupported, "unsupported");
  console.log("");

  console.log("Test 3: Dispatcher exception");
  const exceptionObs = buildHermesGatewayRealDispatchObservability({
    requestType: "review",
    fallbackPolicy: fallbackPolicy({
      reason: "dispatcher_exception",
      action: "fallback_without_final_status_change",
      shouldAttachSidecar: false,
      shouldOmitSidecar: true,
    }),
    attached: false,
    omitted: true,
    safeToAttach: false,
    dispatcherException: new Error("THIS_HERMES_GATEWAY_REAL_DISPATCH_PROMPT_MUST_NOT_LEAK token=abc password=123"),
    realDispatchEnabled: true,
  });
  assert(exceptionObs.outcome === "dispatcher_exception", "exception outcome");
  assert(exceptionObs.warningCount === 1, "exception warning count");
  assert(exceptionObs.hasWarnings === true, "exception has warnings");
  assertNoLeaks(exceptionObs, "exception");
  assertSafety(exceptionObs, "exception");
  console.log("");

  console.log("Test 4: Unsafe omitted");
  const unsafe = buildHermesGatewayRealDispatchObservability({
    requestType: "review",
    dispatchResult: dispatchResult(),
    fallbackPolicy: fallbackPolicy({
      reason: "unsafe_dispatch_result",
      action: "fallback_without_final_status_change",
      shouldAttachSidecar: false,
      shouldOmitSidecar: true,
    }),
    attached: false,
    omitted: true,
    safeToAttach: false,
    realDispatchEnabled: true,
  });
  assert(unsafe.outcome === "unsafe_omitted", "unsafe outcome");
  assertSafety(unsafe, "unsafe");
  console.log("");

  console.log("Test 5: Attached success");
  const success = buildHermesGatewayRealDispatchObservability({
    requestType: "review",
    dispatchResult: dispatchResult(),
    fallbackPolicy: fallbackPolicy(),
    attached: true,
    omitted: false,
    safeToAttach: true,
    realDispatchEnabled: true,
  });
  assert(success.outcome === "attached_success", "success outcome");
  assert(success.attached === true && success.omitted === false, "success attached");
  assert(success.safeToAttach === true, "success safe to attach");
  assertSafety(success, "success");
  console.log("");

  console.log("Test 6: Attached failure");
  const failure = buildHermesGatewayRealDispatchObservability({
    requestType: "review",
    dispatchResult: dispatchResult({
      status: "dispatch_executed_failure",
      commandDecision: "executed_failure",
      fallbackAction: "fallback_without_final_status_change",
    }),
    fallbackPolicy: fallbackPolicy({
      reason: "dispatch_failure",
      action: "fallback_without_final_status_change",
    }),
    attached: true,
    omitted: false,
    safeToAttach: true,
    realDispatchEnabled: true,
  });
  assert(failure.outcome === "attached_failure", "failure outcome");
  assertSafety(failure, "failure");
  console.log("");

  console.log("Test 7: Attached timeout");
  const timeout = buildHermesGatewayRealDispatchObservability({
    requestType: "review",
    dispatchResult: dispatchResult({
      status: "dispatch_executed_timeout",
      commandDecision: "executed_timeout",
      fallbackAction: "fallback_without_final_status_change",
    }),
    fallbackPolicy: fallbackPolicy({
      reason: "dispatch_timeout",
      action: "fallback_without_final_status_change",
    }),
    attached: true,
    omitted: false,
    safeToAttach: true,
    realDispatchEnabled: true,
  });
  assert(timeout.outcome === "attached_timeout", "timeout outcome");
  assertSafety(timeout, "timeout");
  console.log("");

  console.log("Test 8: Attached guarded fallback");
  const guarded = buildHermesGatewayRealDispatchObservability({
    requestType: "review",
    dispatchResult: dispatchResult({
      status: "dispatch_guarded_fallback",
      executed: false,
      commandDecision: "executed_failure",
      fallbackAction: "fallback_without_final_status_change",
    }),
    fallbackPolicy: fallbackPolicy({
      reason: "dispatch_guarded_fallback",
      action: "fallback_without_final_status_change",
    }),
    attached: true,
    omitted: false,
    safeToAttach: true,
    realDispatchEnabled: true,
  });
  assert(guarded.outcome === "attached_guarded_fallback", "guarded outcome");
  assertSafety(guarded, "guarded");
  console.log("");

  console.log("Test 9: Generic omitted");
  const omitted = buildHermesGatewayRealDispatchObservability({
    requestType: "review",
    dispatchResult: dispatchResult(),
    fallbackPolicy: fallbackPolicy({
      reason: "contract_ineligible",
      action: "preserve_existing_gateway_behavior",
      shouldAttachSidecar: false,
      shouldOmitSidecar: true,
    }),
    attached: false,
    omitted: true,
    safeToAttach: true,
    realDispatchEnabled: true,
  });
  assert(omitted.outcome === "omitted", "generic omitted outcome");
  assertSafety(omitted, "omitted");
  console.log("");

  console.log("Test 10: Warnings count only");
  const rawWarningsObs = buildHermesGatewayRealDispatchObservability({
    requestType: "review",
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
    attached: true,
    omitted: false,
    safeToAttach: true,
    realDispatchEnabled: true,
  });
  assert(rawWarningsObs.warningCount === 4, "warning count");
  assert(rawWarningsObs.hasWarnings === true, "has warnings");
  assertNoLeaks(rawWarningsObs, "warnings");
  assertSafety(rawWarningsObs, "warnings");
  console.log("");

  console.log("Test 11: Fixed timestamp");
  const fixed = buildHermesGatewayRealDispatchObservability({
    requestType: "review",
    dispatchResult: dispatchResult(),
    fallbackPolicy: fallbackPolicy(),
    attached: true,
    omitted: false,
    safeToAttach: true,
    realDispatchEnabled: true,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  });
  assert(fixed.timestamp === "2026-01-01T00:00:00.000Z", "fixed timestamp");
  console.log("");

  console.log("Test 12: Forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-real-dispatch-observability.ts", "utf-8");
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
