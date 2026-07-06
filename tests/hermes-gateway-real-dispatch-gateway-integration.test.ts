// Regression Test — Hermes Gateway Real Dispatch Gateway Integration
// Sidecar metadata only. No real Hermes CLI calls. Uses fake dispatcher.

import fs from "fs";
import { ExecutionGateway, type HermesGatewayRealDispatcher } from "../execution/gateway";
import type { ExecutionRequest, ExecutionResult } from "../execution/types";
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

const allHermesFlags = {
  SDLC_HERMES_GATEWAY_REAL_DISPATCH: "enabled",
  SDLC_HERMES_GATEWAY_INTEGRATION: "enabled",
  SDLC_HERMES_CLI_COMMAND_EXECUTION: "enabled",
};

function reviewRequest(input: Record<string, unknown> = {}): ExecutionRequest {
  return {
    type: "review",
    node: "review",
    agent: "hermes",
    requirementId: "REQ-HERMES-GW",
    input,
  };
}

function safeDispatchResult(
  request: ExecutionRequest,
  overrides: Partial<HermesGatewayRealDispatchResult> = {}
): HermesGatewayRealDispatchResult {
  return {
    adapter: "hermes",
    source: "hermes_gateway_real_dispatch",
    status: "dispatch_executed_success",
    requestId: request.requirementId,
    requestType: request.type,
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

function makeDispatcher(
  impl: (request: ExecutionRequest) => HermesGatewayRealDispatchResult | Promise<HermesGatewayRealDispatchResult>
): { dispatcher: HermesGatewayRealDispatcher; calls: () => number } {
  let called = 0;
  return {
    calls: () => called,
    dispatcher: async (input) => {
      called++;
      return impl(input.request);
    },
  };
}

function assertNoHermesField(result: ExecutionResult, label: string): void {
  assert(!("hermes_gateway_real_dispatch" in result), `${label}: no Hermes field`);
  assert(Object.prototype.hasOwnProperty.call(result, "hermes_gateway_real_dispatch") === false, `${label}: no own Hermes property`);
}

function assertPrimaryGatewayResultUnchanged(result: ExecutionResult, label: string): void {
  assert(result.success === true, `${label}: success unchanged`);
  assert(result.agent === "hermes", `${label}: primary agent unchanged`);
  assert(Array.isArray(result.artifacts), `${label}: artifacts array`);
  assert(result.artifacts.length > 0, `${label}: artifacts still present`);
}

function assertShadowReviewUnchanged(result: ExecutionResult, label: string): void {
  assertPrimaryGatewayResultUnchanged(result, label);
  assert(result.node === "review", `${label}: node unchanged`);
  assert(result.output["result"] === "review_by_hermes", `${label}: shadow output unchanged`);
  assert(result.artifacts.length === 1, `${label}: artifact count unchanged`);
  assert(result.artifacts[0].type === "shadow_output", `${label}: artifact type unchanged`);
  assert(result.artifacts[0].id === "REQ-HERMES-GW:review:shadow_output", `${label}: artifact id unchanged`);
}

async function test(): Promise<void> {
  console.log("Hermes Gateway Real Dispatch Gateway Integration Test\n");

  console.log("Test 1: Disabled flag does not call dispatcher");
  const disabled = makeDispatcher((request) => safeDispatchResult(request));
  const disabledGateway = new ExecutionGateway({
    env: {},
    hermesGatewayRealDispatcher: disabled.dispatcher,
  });
  const r1 = await disabledGateway.execute(reviewRequest());
  assert(disabled.calls() === 0, "disabled dispatcher not called");
  assertNoHermesField(r1, "disabled");
  assertShadowReviewUnchanged(r1, "disabled");
  console.log("");

  console.log("Test 2: Unsupported request types do not call dispatcher");
  const unsupported = makeDispatcher((request) => safeDispatchResult(request));
  const unsupportedGateway = new ExecutionGateway({
    env: allHermesFlags,
    hermesGatewayRealDispatcher: unsupported.dispatcher,
  });
  const unsupportedRequests: ExecutionRequest[] = [
    { type: "llm_task", node: "requirement-summary", agent: "hermes", requirementId: "REQ-LLM", input: {} },
    { type: "code_generation", node: "implementation", agent: "hermes", requirementId: "REQ-CODE", input: {} },
    { type: "bugfix", node: "bugfix", agent: "hermes", requirementId: "REQ-BUG", input: { artifacts: [], findings: [] } },
  ];
  for (const request of unsupportedRequests) {
    const result = await unsupportedGateway.execute(request);
    assertNoHermesField(result, `${request.type}`);
    assert(result.success === true, `${request.type}: primary result unchanged`);
  }
  assert(unsupported.calls() === 0, "unsupported dispatcher not called");
  console.log("");

  console.log("Test 3: Supported type with safe dispatch attaches metadata");
  const safe = makeDispatcher((request) => safeDispatchResult(request));
  const safeGateway = new ExecutionGateway({
    env: allHermesFlags,
    hermesGatewayRealDispatcher: safe.dispatcher,
  });
  const r3 = await safeGateway.execute(reviewRequest());
  assert(safe.calls() === 1, "safe dispatcher called once");
  assert(Object.prototype.hasOwnProperty.call(r3, "hermes_gateway_real_dispatch") === true, "safe has own Hermes property");
  assert(r3.hermes_gateway_real_dispatch?.status === "dispatch_executed_success", "safe status attached");
  assert(r3.hermes_gateway_real_dispatch?.changesGatewayPrimaryDispatch === false, "safe no Gateway dispatch change");
  assert(r3.hermes_gateway_real_dispatch?.affectsPrimaryGatewayResult === false, "safe no primary effect");
  assert(r3.hermes_gateway_real_dispatch?.writesFiles === false, "safe no files");
  assert(r3.hermes_gateway_real_dispatch?.persistsAudit === false, "safe no persist");
  assert(r3.hermes_gateway_real_dispatch?.containsRawPrompt === false, "safe no raw prompt");
  assert(r3.hermes_gateway_real_dispatch?.containsRawArtifacts === false, "safe no raw artifacts");
  assert(r3.hermes_gateway_real_dispatch?.containsSecrets === false, "safe no secrets");
  assertShadowReviewUnchanged(r3, "safe");
  console.log("");

  console.log("Test 4: code_review and validation also attach when safe");
  for (const type of ["code_review", "validation"] as const) {
    const typed = makeDispatcher((request) => safeDispatchResult(request));
    const gateway = new ExecutionGateway({
      env: allHermesFlags,
      hermesGatewayRealDispatcher: typed.dispatcher,
    });
    const request: ExecutionRequest = type === "code_review"
      ? { type, node: "code-review", agent: "hermes", requirementId: `REQ-${type}`, input: { artifacts: [] } }
      : { type, node: "validation", agent: "hermes", requirementId: `REQ-${type}`, input: {} };
    const result = await gateway.execute(request);
    assert(typed.calls() === 1, `${type}: dispatcher called once`);
    assert(result.hermes_gateway_real_dispatch?.requestType === type, `${type}: request type preserved`);
    assert(Object.prototype.hasOwnProperty.call(result, "hermes_gateway_real_dispatch") === true, `${type}: field attached`);
  }
  console.log("");

  console.log("Test 5: Unsafe dispatch result rejected");
  const unsafe = makeDispatcher((request) => safeDispatchResult(request, {
    changesGatewayPrimaryDispatch: true as false,
  }));
  const unsafeGateway = new ExecutionGateway({
    env: allHermesFlags,
    hermesGatewayRealDispatcher: unsafe.dispatcher,
  });
  const r5 = await unsafeGateway.execute(reviewRequest());
  assert(unsafe.calls() === 1, "unsafe dispatcher called");
  assertNoHermesField(r5, "unsafe");
  assertShadowReviewUnchanged(r5, "unsafe");
  console.log("");

  console.log("Test 6: Dispatcher throws safely");
  const throwing: { dispatcher: HermesGatewayRealDispatcher; calls: () => number } = (() => {
    let called = 0;
    return {
      calls: () => called,
      dispatcher: async () => {
        called++;
        throw new Error("THIS_HERMES_GATEWAY_REAL_DISPATCH_PROMPT_MUST_NOT_LEAK token=abc");
      },
    };
  })();
  const throwingGateway = new ExecutionGateway({
    env: allHermesFlags,
    hermesGatewayRealDispatcher: throwing.dispatcher,
  });
  const r6 = await throwingGateway.execute(reviewRequest());
  assert(throwing.calls() === 1, "throw dispatcher called");
  assertNoHermesField(r6, "throw");
  assertShadowReviewUnchanged(r6, "throw");
  const j6 = JSON.stringify(r6);
  assert(!j6.includes("THIS_HERMES_GATEWAY_REAL_DISPATCH_PROMPT_MUST_NOT_LEAK"), "throw no prompt marker");
  assert(!j6.includes("abc"), "throw no secret-like token");
  console.log("");

  console.log("Test 7: No raw prompt leak from Hermes field");
  const promptMarker = "THIS_HERMES_GATEWAY_REAL_DISPATCH_PROMPT_MUST_NOT_LEAK";
  const markerRequest = reviewRequest({ prompt: promptMarker });
  const safeNoPrompt = makeDispatcher((request) => safeDispatchResult(request, { outputSummary: "sanitized" }));
  const safePromptGateway = new ExecutionGateway({
    env: allHermesFlags,
    hermesGatewayRealDispatcher: safeNoPrompt.dispatcher,
  });
  const r7Safe = await safePromptGateway.execute(markerRequest);
  assert(JSON.stringify(r7Safe.hermes_gateway_real_dispatch).includes(promptMarker) === false, "safe field no prompt marker");
  const r7Disabled = await disabledGateway.execute(markerRequest);
  assertNoHermesField(r7Disabled, "raw disabled");
  const r7Unsafe = await unsafeGateway.execute(markerRequest);
  assertNoHermesField(r7Unsafe, "raw unsafe");
  const r7Throw = await throwingGateway.execute(reviewRequest());
  assertNoHermesField(r7Throw, "raw throw");
  console.log("");

  console.log("Test 8: No undefined key");
  for (const [label, result] of [
    ["disabled", r1],
    ["unsupported", await unsupportedGateway.execute(unsupportedRequests[0])],
    ["unsafe", r5],
    ["throw", r6],
  ] as const) {
    assertNoHermesField(result, label);
  }
  console.log("");

  console.log("Test 9: No Runtime changes");
  const runtimeSrc = fs.readFileSync("runtime.ts", "utf-8");
  assert(!runtimeSrc.includes("hermes_gateway_real_dispatch"), "runtime no Hermes Gateway field");
  assert(!runtimeSrc.includes("hermes-gateway-real-dispatch"), "runtime no Hermes real dispatch import");
  console.log("");

  console.log("Test 10: No direct CLI imports in Gateway");
  const gatewaySrc = fs.readFileSync("execution/gateway.ts", "utf-8");
  const forbiddenGatewayImports = [
    "executeHermesCliCommand",
    "child_process",
    "\"fs\"",
    "'fs'",
    "http",
    "https",
    "fetch",
  ];
  const badGatewayLines = gatewaySrc.split("\n").filter((line) => {
    if (!line.includes("import ")) return false;
    return forbiddenGatewayImports.some((item) => line.includes(item));
  });
  assert(badGatewayLines.length === 0, `gateway no direct CLI imports (found ${badGatewayLines.length})`);
  console.log("");

  console.log("Test 11: Gateway integration contract is used");
  assert(gatewaySrc.includes("evaluateHermesGatewayRealDispatchGatewayIntegrationContract"), "gateway uses integration contract");
  assert(gatewaySrc.includes("integration.mayAttach"), "gateway attaches only when mayAttach");
  assert(gatewaySrc.includes("hermes_gateway_real_dispatch: dispatchResult"), "gateway attaches dispatch result field");
  console.log("");

  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

test().catch((err) => {
  console.error(err);
  process.exit(1);
});
