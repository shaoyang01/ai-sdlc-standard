// Regression Test — Hermes Gateway Real Dispatch Fallback Policy
// Sidecar metadata policy only. No real Hermes CLI calls.

import fs from "fs";
import {
  evaluateHermesGatewayRealDispatchFallbackPolicy,
  type HermesGatewayRealDispatchFallbackPolicyResult,
} from "../execution/hermes-gateway-real-dispatch-fallback-policy";
import type { HermesGatewayRealDispatchResult } from "../execution/hermes-gateway-real-dispatch";

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
    requestId: "REQ-HERMES-FALLBACK",
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

function assertSafetyFields(
  result: HermesGatewayRealDispatchFallbackPolicyResult,
  label: string
): void {
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
  assert(result.persistsAudit === false, `${label}: no audit persistence`);
  assert(result.containsRawPrompt === false, `${label}: no raw prompt`);
  assert(result.containsRawArtifacts === false, `${label}: no raw artifacts`);
  assert(result.containsSecrets === false, `${label}: no secrets`);
}

function assertPolicy(
  result: HermesGatewayRealDispatchFallbackPolicyResult,
  expected: {
    reason: HermesGatewayRealDispatchFallbackPolicyResult["reason"];
    action: HermesGatewayRealDispatchFallbackPolicyResult["action"];
    attach: boolean;
  },
  label: string
): void {
  assert(result.adapter === "hermes", `${label}: adapter`);
  assert(result.source === "hermes_gateway_real_dispatch_fallback_policy", `${label}: source`);
  assert(result.policyVersion === 1, `${label}: policy version`);
  assert(result.reason === expected.reason, `${label}: reason`);
  assert(result.action === expected.action, `${label}: action`);
  assert(result.shouldAttachSidecar === expected.attach, `${label}: attach`);
  assert(result.shouldOmitSidecar === !expected.attach, `${label}: omit`);
  assert(Array.isArray(result.warnings), `${label}: warnings array`);
  assertSafetyFields(result, label);
}

async function test(): Promise<void> {
  console.log("Hermes Gateway Real Dispatch Fallback Policy Test\n");

  console.log("Test 1: Disabled preserves existing behavior");
  assertPolicy(
    evaluateHermesGatewayRealDispatchFallbackPolicy({
      requestType: "review",
      realDispatchEnabled: false,
    }),
    {
      reason: "disabled",
      action: "preserve_existing_gateway_behavior",
      attach: false,
    },
    "disabled"
  );
  console.log("");

  console.log("Test 2: Unsupported request type preserves existing behavior");
  assertPolicy(
    evaluateHermesGatewayRealDispatchFallbackPolicy({
      requestType: "llm_task",
      realDispatchEnabled: true,
      dispatchResult: dispatchResult(),
      integrationMayAttach: true,
    }),
    {
      reason: "unsupported_request_type",
      action: "preserve_existing_gateway_behavior",
      attach: false,
    },
    "unsupported"
  );
  console.log("");

  console.log("Test 3: Dispatcher exception does not include raw exception");
  const exceptionPolicy = evaluateHermesGatewayRealDispatchFallbackPolicy({
    requestType: "review",
    realDispatchEnabled: true,
    dispatcherException: new Error(
      "boom token=abc password=123 api_key=xyz sk-test THIS_HERMES_GATEWAY_REAL_DISPATCH_PROMPT_MUST_NOT_LEAK"
    ),
  });
  assertPolicy(
    exceptionPolicy,
    {
      reason: "dispatcher_exception",
      action: "fallback_without_final_status_change",
      attach: false,
    },
    "exception"
  );
  const exceptionJson = JSON.stringify(exceptionPolicy);
  assert(!exceptionJson.includes("abc"), "exception no abc");
  assert(!exceptionJson.includes("123"), "exception no 123");
  assert(!exceptionJson.includes("xyz"), "exception no xyz");
  assert(!exceptionJson.includes("sk-test"), "exception no sk-test");
  assert(!exceptionJson.includes("THIS_HERMES_GATEWAY_REAL_DISPATCH_PROMPT_MUST_NOT_LEAK"), "exception no prompt marker");
  console.log("");

  console.log("Test 4: Missing dispatch result preserves existing behavior");
  assertPolicy(
    evaluateHermesGatewayRealDispatchFallbackPolicy({
      requestType: "review",
      realDispatchEnabled: true,
      integrationMayAttach: true,
    }),
    {
      reason: "missing_dispatch_result",
      action: "preserve_existing_gateway_behavior",
      attach: false,
    },
    "missing"
  );
  console.log("");

  console.log("Test 5: Contract ineligible preserves existing behavior");
  assertPolicy(
    evaluateHermesGatewayRealDispatchFallbackPolicy({
      requestType: "review",
      realDispatchEnabled: true,
      dispatchResult: dispatchResult({
        status: "dispatch_ineligible",
        eligible: false,
        executed: false,
        contractDecision: "adapter_disabled",
      }),
      integrationMayAttach: false,
    }),
    {
      reason: "contract_ineligible",
      action: "preserve_existing_gateway_behavior",
      attach: false,
    },
    "contract ineligible"
  );
  console.log("");

  console.log("Test 6: Unsafe dispatch result is rejected");
  assertPolicy(
    evaluateHermesGatewayRealDispatchFallbackPolicy({
      requestType: "review",
      realDispatchEnabled: true,
      dispatchResult: dispatchResult(),
      integrationMayAttach: false,
    }),
    {
      reason: "unsafe_dispatch_result",
      action: "fallback_without_final_status_change",
      attach: false,
    },
    "unsafe"
  );
  console.log("");

  console.log("Test 7: Safe success attaches sidecar metadata");
  assertPolicy(
    evaluateHermesGatewayRealDispatchFallbackPolicy({
      requestType: "review",
      realDispatchEnabled: true,
      dispatchResult: dispatchResult(),
      integrationMayAttach: true,
    }),
    {
      reason: "dispatch_success",
      action: "attach_sidecar_metadata",
      attach: true,
    },
    "success"
  );
  console.log("");

  console.log("Test 8: Safe failure attaches fallback metadata");
  assertPolicy(
    evaluateHermesGatewayRealDispatchFallbackPolicy({
      requestType: "review",
      realDispatchEnabled: true,
      dispatchResult: dispatchResult({
        status: "dispatch_executed_failure",
        commandDecision: "executed_failure",
        fallbackAction: "fallback_without_final_status_change",
      }),
      integrationMayAttach: true,
    }),
    {
      reason: "dispatch_failure",
      action: "fallback_without_final_status_change",
      attach: true,
    },
    "failure"
  );
  console.log("");

  console.log("Test 9: Safe timeout attaches fallback metadata");
  assertPolicy(
    evaluateHermesGatewayRealDispatchFallbackPolicy({
      requestType: "review",
      realDispatchEnabled: true,
      dispatchResult: dispatchResult({
        status: "dispatch_executed_timeout",
        commandDecision: "executed_timeout",
        fallbackAction: "fallback_without_final_status_change",
      }),
      integrationMayAttach: true,
    }),
    {
      reason: "dispatch_timeout",
      action: "fallback_without_final_status_change",
      attach: true,
    },
    "timeout"
  );
  console.log("");

  console.log("Test 10: Safe guarded fallback attaches fallback metadata");
  assertPolicy(
    evaluateHermesGatewayRealDispatchFallbackPolicy({
      requestType: "review",
      realDispatchEnabled: true,
      dispatchResult: dispatchResult({
        status: "dispatch_guarded_fallback",
        executed: false,
        commandDecision: "executed_failure",
        fallbackAction: "fallback_without_final_status_change",
      }),
      integrationMayAttach: true,
    }),
    {
      reason: "dispatch_guarded_fallback",
      action: "fallback_without_final_status_change",
      attach: true,
    },
    "guarded fallback"
  );
  console.log("");

  console.log("Test 11: Unsafe failure is rejected");
  assertPolicy(
    evaluateHermesGatewayRealDispatchFallbackPolicy({
      requestType: "review",
      realDispatchEnabled: true,
      dispatchResult: dispatchResult({
        status: "dispatch_executed_failure",
        commandDecision: "executed_failure",
        fallbackAction: "fallback_without_final_status_change",
      }),
      integrationMayAttach: false,
    }),
    {
      reason: "unsafe_dispatch_result",
      action: "fallback_without_final_status_change",
      attach: false,
    },
    "unsafe failure"
  );
  console.log("");

  console.log("Test 12: Forbidden imports");
  const src = fs.readFileSync("execution/hermes-gateway-real-dispatch-fallback-policy.ts", "utf-8");
  const forbiddenImports = [
    "runtime",
    "execution/gateway",
    "hermes-cli-command-executor",
    "kimi-",
    "codex",
    "policy-memory",
    "graph",
    "\"fs\"",
    "'fs'",
    "child_process",
    "http",
    "https",
    "fetch",
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
