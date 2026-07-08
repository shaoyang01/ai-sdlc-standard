// Regression Test — Hermes Gateway Real Dispatch Gateway Integration
// Sidecar metadata only. No real Hermes CLI calls. Uses fake dispatcher.

import fs from "fs";
import { ExecutionGateway, type HermesGatewayRealDispatcher } from "../execution/gateway";
import type { ExecutionRequest, ExecutionResult } from "../execution/types";
import type { HermesGatewayRealDispatchResult } from "../execution/hermes-gateway-real-dispatch";
import type { HermesPhase2ShadowDispatcher, HermesPhase2ShadowEnablementDispatchResult } from "../execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement";

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

function makePhase2Dispatcher(
  impl: (request: ExecutionRequest) => HermesPhase2ShadowEnablementDispatchResult | Promise<HermesPhase2ShadowEnablementDispatchResult>
): { dispatcher: HermesPhase2ShadowDispatcher; calls: () => number } {
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

function assertNoTopLevelFallbackField(result: ExecutionResult, label: string): void {
  assert(!("fallbackPolicy" in result), `${label}: no top-level fallback policy`);
  assert(Object.prototype.hasOwnProperty.call(result, "fallbackPolicy") === false, `${label}: no own top-level fallback policy`);
}

function assertNoTopLevelObservabilityField(result: ExecutionResult, label: string): void {
  assert(!("observability" in result), `${label}: no top-level observability`);
  assert(Object.prototype.hasOwnProperty.call(result, "observability") === false, `${label}: no own top-level observability`);
}

function assertNoTopLevelGuardrailsField(result: ExecutionResult, label: string): void {
  assert(!("guardrails" in result), `${label}: no top-level guardrails`);
  assert(Object.prototype.hasOwnProperty.call(result, "guardrails") === false, `${label}: no own top-level guardrails`);
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

function assertFallbackPolicy(
  result: ExecutionResult,
  expected: {
    reason: NonNullable<HermesGatewayRealDispatchResult["fallbackPolicy"]>["reason"];
    action: NonNullable<HermesGatewayRealDispatchResult["fallbackPolicy"]>["action"];
    attach: boolean;
  },
  label: string
): void {
  const sidecar = result.hermes_gateway_real_dispatch as HermesGatewayRealDispatchResult | undefined;
  const policy = sidecar?.fallbackPolicy;
  assert(policy !== undefined, `${label}: fallback policy attached`);
  assert(policy?.reason === expected.reason, `${label}: fallback reason`);
  assert(policy?.action === expected.action, `${label}: fallback action`);
  assert(policy?.shouldAttachSidecar === expected.attach, `${label}: fallback attach`);
  assert(policy?.shouldOmitSidecar === !expected.attach, `${label}: fallback omit`);
  assert(policy?.preservesGatewayPrimaryResult === true, `${label}: preserves primary`);
  assert(policy?.preservesGatewayFinalResult === true, `${label}: preserves gateway final`);
  assert(policy?.preservesRuntimeFinalStatus === true, `${label}: preserves runtime final status`);
  assert(policy?.preservesRuntimeRouting === true, `${label}: preserves runtime routing`);
  assert(policy?.changesGatewayPrimaryDispatch === false, `${label}: no gateway dispatch change`);
  assert(policy?.changesGatewayFinalResult === false, `${label}: no gateway final result change`);
  assert(policy?.changesRuntimeFinalStatus === false, `${label}: no runtime final status change`);
  assert(policy?.changesRuntimeRouting === false, `${label}: no runtime routing change`);
  assert(policy?.writesFiles === false, `${label}: no file writes`);
  assert(policy?.persistsAudit === false, `${label}: no audit persistence`);
  assert(policy?.containsRawPrompt === false, `${label}: no raw prompt`);
  assert(policy?.containsRawArtifacts === false, `${label}: no raw artifacts`);
  assert(policy?.containsSecrets === false, `${label}: no secrets`);
}

function assertObservability(
  result: ExecutionResult,
  expected: {
    outcome: NonNullable<HermesGatewayRealDispatchResult["observability"]>["outcome"];
    attached: boolean;
    omitted: boolean;
    safeToAttach: boolean;
  },
  label: string
): void {
  const sidecar = result.hermes_gateway_real_dispatch as HermesGatewayRealDispatchResult | undefined;
  const observability = sidecar?.observability;
  assert(observability !== undefined, `${label}: observability attached`);
  assert(observability?.outcome === expected.outcome, `${label}: observability outcome`);
  assert(observability?.attached === expected.attached, `${label}: observability attached flag`);
  assert(observability?.omitted === expected.omitted, `${label}: observability omitted flag`);
  assert(observability?.safeToAttach === expected.safeToAttach, `${label}: observability safe to attach`);
  assert(observability?.preservesGatewayPrimaryResult === true, `${label}: observability preserves primary`);
  assert(observability?.preservesGatewayFinalResult === true, `${label}: observability preserves gateway final`);
  assert(observability?.preservesRuntimeFinalStatus === true, `${label}: observability preserves runtime final status`);
  assert(observability?.preservesRuntimeRouting === true, `${label}: observability preserves runtime routing`);
  assert(observability?.changesGatewayPrimaryDispatch === false, `${label}: observability no gateway dispatch change`);
  assert(observability?.changesGatewayFinalResult === false, `${label}: observability no gateway final result change`);
  assert(observability?.changesRuntimeFinalStatus === false, `${label}: observability no runtime final status change`);
  assert(observability?.changesRuntimeRouting === false, `${label}: observability no runtime routing change`);
  assert(observability?.writesFiles === false, `${label}: observability no file writes`);
  assert(observability?.persistsObservability === false, `${label}: observability no persistence`);
  assert(observability?.persistsAudit === false, `${label}: observability no audit persistence`);
  assert(observability?.containsRawPrompt === false, `${label}: observability no raw prompt`);
  assert(observability?.containsRawArtifacts === false, `${label}: observability no raw artifacts`);
  assert(observability?.containsSecrets === false, `${label}: observability no secrets`);
}

function assertGuardrails(result: ExecutionResult, label: string): void {
  const sidecar = result.hermes_gateway_real_dispatch as HermesGatewayRealDispatchResult | undefined;
  const guardrails = sidecar?.guardrails;
  assert(guardrails !== undefined, `${label}: guardrails attached`);
  assert(guardrails?.decision === "allow_attach", `${label}: guardrails allow`);
  assert(guardrails?.allowed === true, `${label}: guardrails allowed`);
  assert(guardrails?.shouldAttachSidecar === true, `${label}: guardrails should attach`);
  assert(guardrails?.checks.requestTypeAllowed === true, `${label}: guardrails request type`);
  assert(guardrails?.checks.statusAllowed === true, `${label}: guardrails status`);
  assert(guardrails?.checks.warningLimitOk === true, `${label}: guardrails warning limit`);
  assert(guardrails?.checks.fallbackPolicyPresent === true, `${label}: guardrails fallback present`);
  assert(guardrails?.checks.observabilityPresent === true, `${label}: guardrails observability present`);
  assert(guardrails?.checks.noRawPrompt === true, `${label}: guardrails no raw prompt check`);
  assert(guardrails?.checks.noRawArtifacts === true, `${label}: guardrails no raw artifacts check`);
  assert(guardrails?.checks.noSecrets === true, `${label}: guardrails no secrets check`);
  assert(guardrails?.preservesGatewayPrimaryResult === true, `${label}: guardrails preserves primary`);
  assert(guardrails?.preservesGatewayFinalResult === true, `${label}: guardrails preserves gateway final`);
  assert(guardrails?.preservesRuntimeFinalStatus === true, `${label}: guardrails preserves runtime final status`);
  assert(guardrails?.preservesRuntimeRouting === true, `${label}: guardrails preserves runtime routing`);
  assert(guardrails?.changesGatewayPrimaryDispatch === false, `${label}: guardrails no gateway dispatch change`);
  assert(guardrails?.changesGatewayFinalResult === false, `${label}: guardrails no gateway final result change`);
  assert(guardrails?.changesRuntimeFinalStatus === false, `${label}: guardrails no runtime final status change`);
  assert(guardrails?.changesRuntimeRouting === false, `${label}: guardrails no runtime routing change`);
  assert(guardrails?.writesFiles === false, `${label}: guardrails no file writes`);
  assert(guardrails?.persistsGuardrails === false, `${label}: guardrails no persistence`);
  assert(guardrails?.persistsObservability === false, `${label}: guardrails no observability persistence`);
  assert(guardrails?.persistsAudit === false, `${label}: guardrails no audit persistence`);
  assert(guardrails?.containsRawPrompt === false, `${label}: guardrails no raw prompt`);
  assert(guardrails?.containsRawArtifacts === false, `${label}: guardrails no raw artifacts`);
  assert(guardrails?.containsSecrets === false, `${label}: guardrails no secrets`);
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
  assertNoTopLevelObservabilityField(r1, "disabled");
  assertNoTopLevelGuardrailsField(r1, "disabled");
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
    assertNoTopLevelObservabilityField(result, `${request.type}`);
    assertNoTopLevelGuardrailsField(result, `${request.type}`);
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
  assertFallbackPolicy(r3, {
    reason: "dispatch_success",
    action: "attach_sidecar_metadata",
    attach: true,
  }, "safe");
  assertObservability(r3, {
    outcome: "attached_success",
    attached: true,
    omitted: false,
    safeToAttach: true,
  }, "safe");
  assertGuardrails(r3, "safe");
  assertShadowReviewUnchanged(r3, "safe");
  console.log("");

  console.log("Test 4: Safe failure, timeout, and guarded fallback attach policy metadata");
  for (const [label, overrides, reason, outcome] of [
    ["failure", {
      status: "dispatch_executed_failure",
      commandDecision: "executed_failure",
      fallbackAction: "fallback_without_final_status_change",
    }, "dispatch_failure", "attached_failure"],
    ["timeout", {
      status: "dispatch_executed_timeout",
      commandDecision: "executed_timeout",
      fallbackAction: "fallback_without_final_status_change",
    }, "dispatch_timeout", "attached_timeout"],
    ["guarded", {
      status: "dispatch_guarded_fallback",
      executed: false,
      commandDecision: "executed_failure",
      fallbackAction: "fallback_without_final_status_change",
    }, "dispatch_guarded_fallback", "attached_guarded_fallback"],
  ] as const) {
    const variant = makeDispatcher((request) => safeDispatchResult(request, overrides));
    const gateway = new ExecutionGateway({
      env: allHermesFlags,
      hermesGatewayRealDispatcher: variant.dispatcher,
    });
    const result = await gateway.execute(reviewRequest());
    assert(variant.calls() === 1, `${label}: dispatcher called once`);
    assert(Object.prototype.hasOwnProperty.call(result, "hermes_gateway_real_dispatch") === true, `${label}: field attached`);
    assertFallbackPolicy(result, {
      reason,
      action: "fallback_without_final_status_change",
      attach: true,
    }, label);
    assertObservability(result, {
      outcome,
      attached: true,
      omitted: false,
      safeToAttach: true,
    }, label);
    assertGuardrails(result, label);
    assertShadowReviewUnchanged(result, label);
  }
  console.log("");

  console.log("Test 5: code_review and validation use Phase-2 shadow sidecar path");
  for (const type of ["code_review", "validation"] as const) {
    const phase2Dispatcher = makePhase2Dispatcher(() => ({ status: "success", summary: "ok", warnings: [] }));
    const gateway = new ExecutionGateway({
      env: allHermesFlags,
      hermesPhase2ShadowDispatcher: phase2Dispatcher.dispatcher,
    });
    const request: ExecutionRequest = {
      type,
      node: type === "code_review" ? "code-review" : "validation",
      agent: "hermes",
      requirementId: `REQ-${type}`,
      input: type === "code_review" ? { artifacts: [] } : {},
      operatorApproval: { hermesPhase2ShadowEnablement: true },
    };
    const result = await gateway.execute(request);
    assert(phase2Dispatcher.calls() === 1, `${type}: Phase-2 dispatcher called once`);
    assert(Object.prototype.hasOwnProperty.call(result, "hermes_gateway_real_dispatch") === true, `${type}: field attached`);
    const sidecar = result.hermes_gateway_real_dispatch as unknown as Record<string, unknown> | undefined;
    assert(sidecar?.requestType === type, `${type}: request type preserved`);
    assert(sidecar?.phase === "phase_2_shadow_enablement", `${type}: Phase-2 phase`);
    assert(sidecar?.mode === "shadow_sidecar", `${type}: shadow sidecar mode`);
    assert(sidecar?.status === "attached", `${type}: sidecar attached`);
    assert(sidecar?.affectsPrimaryGatewayResult === false, `${type}: no primary effect`);
    assert(sidecar?.changesGatewayPrimaryDispatch === false, `${type}: no gateway dispatch change`);
    assert(sidecar?.changesGatewayFinalResult === false, `${type}: no gateway final result change`);
    assert(sidecar?.changesRuntimeFinalStatus === false, `${type}: no runtime final_status change`);
    assert(sidecar?.changesRuntimeRouting === false, `${type}: no runtime routing change`);
    assert(sidecar?.writesFiles === false, `${type}: no file writes`);
    assert(sidecar?.persistsAudit === false, `${type}: no audit persistence`);
    assert(sidecar?.containsRawPrompt === false, `${type}: no raw prompt`);
    assert(sidecar?.containsRawArtifacts === false, `${type}: no raw artifacts`);
    assert(sidecar?.containsSecrets === false, `${type}: no secrets`);
    assert(typeof (sidecar?.fallbackPolicy as Record<string, unknown> | undefined)?.reason === "string", `${type}: fallback reason`);
    assert(typeof (sidecar?.fallbackPolicy as Record<string, unknown> | undefined)?.action === "string", `${type}: fallback action`);
    assert(typeof (sidecar?.observability as Record<string, unknown> | undefined)?.outcome === "string", `${type}: observability outcome`);
    assert(typeof (sidecar?.observability as Record<string, unknown> | undefined)?.warningCount === "number", `${type}: observability warningCount`);
    assert(typeof (sidecar?.observability as Record<string, unknown> | undefined)?.hasWarnings === "boolean", `${type}: observability hasWarnings`);
    assert((sidecar?.guardrails as Record<string, unknown> | undefined)?.decision === "allow", `${type}: guardrails allow`);
    assert((sidecar?.guardrails as Record<string, unknown> | undefined)?.allowed === true, `${type}: guardrails allowed`);
    assert(typeof (sidecar?.guardrails as Record<string, unknown> | undefined)?.warningCount === "number", `${type}: guardrails warningCount`);
    assert(Array.isArray((sidecar?.guardrails as Record<string, unknown> | undefined)?.checks), `${type}: guardrails checks array`);
    assert((sidecar?.rollback as Record<string, unknown> | undefined)?.decision === "not_required", `${type}: rollback not_required`);
    assert((sidecar?.rollback as Record<string, unknown> | undefined)?.required === false, `${type}: rollback required false`);
    assert(typeof (sidecar?.rollback as Record<string, unknown> | undefined)?.action === "string", `${type}: rollback action`);
    assertPrimaryGatewayResultUnchanged(result, `${type} primary unchanged`);
  }
  console.log("");

  console.log("Test 6: Unsafe dispatch result rejected");
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
  assertNoTopLevelFallbackField(r5, "unsafe");
  assertNoTopLevelObservabilityField(r5, "unsafe");
  assertNoTopLevelGuardrailsField(r5, "unsafe");
  assertShadowReviewUnchanged(r5, "unsafe");
  console.log("");

  console.log("Test 7: Warning limit guardrail rejects sidecar");
  const warningLimit = makeDispatcher((request) => safeDispatchResult(request, {
    warnings: ["safe warning count only"],
  }));
  const warningLimitGateway = new ExecutionGateway({
    env: allHermesFlags,
    hermesGatewayRealDispatcher: warningLimit.dispatcher,
    hermesGuardrailLimits: { maxWarnings: 0 },
  });
  const rWarn = await warningLimitGateway.execute(reviewRequest());
  assert(warningLimit.calls() === 1, "warning limit dispatcher called");
  assertNoHermesField(rWarn, "warning limit");
  assertNoTopLevelGuardrailsField(rWarn, "warning limit");
  assertShadowReviewUnchanged(rWarn, "warning limit");
  console.log("");

  console.log("Test 8: Dispatcher throws safely");
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
  assertNoTopLevelFallbackField(r6, "throw");
  assertNoTopLevelObservabilityField(r6, "throw");
  assertNoTopLevelGuardrailsField(r6, "throw");
  assertShadowReviewUnchanged(r6, "throw");
  const j6 = JSON.stringify(r6);
  assert(!j6.includes("THIS_HERMES_GATEWAY_REAL_DISPATCH_PROMPT_MUST_NOT_LEAK"), "throw no prompt marker");
  assert(!j6.includes("abc"), "throw no secret-like token");
  console.log("");

  console.log("Test 9: No raw prompt leak from Hermes field, policy, observability, and guardrails");
  const promptMarker = "THIS_HERMES_GATEWAY_REAL_DISPATCH_PROMPT_MUST_NOT_LEAK";
  const markerRequest = reviewRequest({ prompt: promptMarker });
  const safeNoPrompt = makeDispatcher((request) => safeDispatchResult(request, {
    outputSummary: "sanitized",
    warnings: [
      "THIS_HERMES_GATEWAY_REAL_DISPATCH_PROMPT_MUST_NOT_LEAK token=abc password=123 api_key=xyz sk-test",
    ],
  }));
  const safePromptGateway = new ExecutionGateway({
    env: allHermesFlags,
    hermesGatewayRealDispatcher: safeNoPrompt.dispatcher,
  });
  const r7Safe = await safePromptGateway.execute(markerRequest);
  assert(JSON.stringify(r3.hermes_gateway_real_dispatch).includes(promptMarker) === false, "safe field no prompt marker");
  assert(JSON.stringify(r7Safe.hermes_gateway_real_dispatch?.fallbackPolicy).includes(promptMarker) === false, "safe policy no prompt marker");
  assert(JSON.stringify(r7Safe.hermes_gateway_real_dispatch?.fallbackPolicy).includes("abc") === false, "safe policy no abc");
  assert(JSON.stringify(r7Safe.hermes_gateway_real_dispatch?.fallbackPolicy).includes("123") === false, "safe policy no 123");
  assert(JSON.stringify(r7Safe.hermes_gateway_real_dispatch?.fallbackPolicy).includes("sk-test") === false, "safe policy no sk-test");
  assert(r7Safe.hermes_gateway_real_dispatch?.observability?.warningCount === 1, "safe observability warning count");
  const obsJson = JSON.stringify(r7Safe.hermes_gateway_real_dispatch?.observability);
  assert(!obsJson.includes(promptMarker), "safe observability no prompt marker");
  assert(!obsJson.includes("abc"), "safe observability no abc");
  assert(!obsJson.includes("123"), "safe observability no 123");
  assert(!obsJson.includes("xyz"), "safe observability no xyz");
  assert(!obsJson.includes("sk-test"), "safe observability no sk-test");
  assert(r7Safe.hermes_gateway_real_dispatch?.guardrails?.warningCount === 2, "safe guardrails warning count");
  const guardrailsJson = JSON.stringify(r7Safe.hermes_gateway_real_dispatch?.guardrails);
  assert(!guardrailsJson.includes(promptMarker), "safe guardrails no prompt marker");
  assert(!guardrailsJson.includes("abc"), "safe guardrails no abc");
  assert(!guardrailsJson.includes("123"), "safe guardrails no 123");
  assert(!guardrailsJson.includes("xyz"), "safe guardrails no xyz");
  assert(!guardrailsJson.includes("sk-test"), "safe guardrails no sk-test");
  const r7Disabled = await disabledGateway.execute(markerRequest);
  assertNoHermesField(r7Disabled, "raw disabled");
  assertNoTopLevelObservabilityField(r7Disabled, "raw disabled");
  assertNoTopLevelGuardrailsField(r7Disabled, "raw disabled");
  const r7Unsafe = await unsafeGateway.execute(markerRequest);
  assertNoHermesField(r7Unsafe, "raw unsafe");
  assertNoTopLevelObservabilityField(r7Unsafe, "raw unsafe");
  assertNoTopLevelGuardrailsField(r7Unsafe, "raw unsafe");
  const r7Throw = await throwingGateway.execute(reviewRequest());
  assertNoHermesField(r7Throw, "raw throw");
  assertNoTopLevelObservabilityField(r7Throw, "raw throw");
  assertNoTopLevelGuardrailsField(r7Throw, "raw throw");
  console.log("");

  console.log("Test 10: No undefined key");
  for (const [label, result] of [
    ["disabled", r1],
    ["unsupported", await unsupportedGateway.execute(unsupportedRequests[0])],
    ["unsafe", r5],
    ["throw", r6],
  ] as const) {
    assertNoHermesField(result, label);
    assertNoTopLevelObservabilityField(result, label);
    assertNoTopLevelGuardrailsField(result, label);
  }
  console.log("");

  console.log("Test 11: No Runtime changes");
  const runtimeSrc = fs.readFileSync("runtime.ts", "utf-8");
  assert(!runtimeSrc.includes("hermes_gateway_real_dispatch"), "runtime no Hermes Gateway field");
  assert(!runtimeSrc.includes("hermes-gateway-real-dispatch"), "runtime no Hermes real dispatch import");
  console.log("");

  console.log("Test 12: No direct CLI imports in Gateway");
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

  console.log("Test 13: Gateway integration contract, fallback policy, observability, and guardrails are used");
  assert(gatewaySrc.includes("evaluateHermesGatewayRealDispatchGatewayIntegrationContract"), "gateway uses integration contract");
  assert(gatewaySrc.includes("integration.mayAttach"), "gateway attaches only when mayAttach");
  assert(gatewaySrc.includes("evaluateHermesGatewayRealDispatchFallbackPolicy"), "gateway uses fallback policy");
  assert(gatewaySrc.includes("fallbackPolicy.shouldAttachSidecar"), "gateway attaches only when fallback policy allows");
  assert(gatewaySrc.includes("buildHermesGatewayRealDispatchObservability"), "gateway builds observability");
  assert(gatewaySrc.includes("evaluateHermesGatewayRealDispatchGuardrails"), "gateway uses guardrails");
  assert(gatewaySrc.includes("guardrails.shouldAttachSidecar"), "gateway attaches only when guardrails allow");
  assert(gatewaySrc.includes("fallbackPolicy"), "gateway attaches fallback policy field");
  assert(gatewaySrc.includes("observability"), "gateway attaches observability field");
  assert(gatewaySrc.includes("guardrails"), "gateway attaches guardrails field");
  assert(gatewaySrc.includes("hermes_gateway_real_dispatch: {"), "gateway attaches dispatch result object");
  console.log("");

  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

test().catch((err) => {
  console.error(err);
  process.exit(1);
});
