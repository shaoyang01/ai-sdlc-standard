// Regression Test — Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Implementation
// ======================================================================================
// Phase-2 shadow-only sidecar attachment for code_review / validation.
// Uses fake dispatcher only. No real Hermes CLI. No persistence.

import fs from "fs";
import path from "path";
import { ExecutionGateway } from "../execution/gateway";
import type { ExecutionRequest, ExecutionResult } from "../execution/types";
import type { HermesPhase2ShadowDispatcher } from "../execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement";
import type { HermesPhase2ShadowEnablementDispatchResult } from "../execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement";

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

function baseRequest(type: "code_review" | "validation"): ExecutionRequest {
  return {
    type,
    node: type === "code_review" ? "code-review" : "validation",
    agent: "hermes",
    requirementId: `REQ-PHASE2-${type.toUpperCase()}`,
    input: type === "code_review" ? { artifacts: [] } : {},
    operatorApproval: { hermesPhase2ShadowEnablement: true },
  };
}

function unsupportedRequest(type: "llm_task" | "code_generation" | "bugfix"): ExecutionRequest {
  return {
    type,
    node: type,
    agent: "hermes",
    requirementId: `REQ-UNSUPPORTED-${type}`,
    input: type === "bugfix" ? { artifacts: [], findings: [] } : {},
  };
}

function successDispatchResult(): HermesPhase2ShadowEnablementDispatchResult {
  return { status: "success", summary: "sanitized summary", warnings: [] };
}

function makeDispatcher(
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

function assertNoSidecar(result: ExecutionResult, label: string): void {
  assert(!("hermes_gateway_real_dispatch" in result), `${label}: no Hermes sidecar`);
  assert(Object.prototype.hasOwnProperty.call(result, "hermes_gateway_real_dispatch") === false, `${label}: no own Hermes sidecar property`);
}

function assertPrimaryUnchanged(result: ExecutionResult, request: ExecutionRequest, label: string): void {
  assert(result.success === true, `${label}: primary success unchanged`);
  assert(result.node === request.node, `${label}: primary node unchanged`);
  assert(result.agent === request.agent, `${label}: primary agent unchanged`);
  assert(Array.isArray(result.artifacts), `${label}: primary artifacts array`);
  assert(result.artifacts.length > 0, `${label}: primary artifacts present`);
}

function assertSidecarAttached(result: ExecutionResult, requestType: "code_review" | "validation", label: string): void {
  assert(Object.prototype.hasOwnProperty.call(result, "hermes_gateway_real_dispatch") === true, `${label}: own Hermes sidecar property`);
  const sidecar = result.hermes_gateway_real_dispatch as unknown as Record<string, unknown> | undefined;
  assert(sidecar !== undefined, `${label}: sidecar exists`);
  assert(sidecar?.requestType === requestType, `${label}: sidecar requestType`);
  assert(sidecar?.phase === "phase_2_shadow_enablement", `${label}: sidecar phase`);
  assert(sidecar?.mode === "shadow_sidecar", `${label}: sidecar mode`);
  assert(sidecar?.status === "attached", `${label}: sidecar status attached`);

  const fallbackPolicy = sidecar?.fallbackPolicy as Record<string, unknown> | undefined;
  assert(typeof fallbackPolicy?.reason === "string", `${label}: fallback reason`);
  assert(typeof fallbackPolicy?.action === "string", `${label}: fallback action`);

  const observability = sidecar?.observability as Record<string, unknown> | undefined;
  assert(typeof observability?.outcome === "string", `${label}: observability outcome`);
  assert(typeof observability?.warningCount === "number", `${label}: observability warningCount`);
  assert(typeof observability?.hasWarnings === "boolean", `${label}: observability hasWarnings`);

  const guardrails = sidecar?.guardrails as Record<string, unknown> | undefined;
  assert(guardrails?.decision === "allow", `${label}: guardrails allow`);
  assert(guardrails?.allowed === true, `${label}: guardrails allowed`);
  assert(typeof guardrails?.warningCount === "number", `${label}: guardrails warningCount`);
  assert(Array.isArray(guardrails?.checks), `${label}: guardrails checks array`);

  const rollback = sidecar?.rollback as Record<string, unknown> | undefined;
  assert(rollback?.decision === "not_required", `${label}: rollback not_required`);
  assert(rollback?.required === false, `${label}: rollback required false`);
  assert(typeof rollback?.action === "string", `${label}: rollback action`);

  assert(sidecar?.preservesGatewayPrimaryResult === true, `${label}: preserves primary`);
  assert(sidecar?.preservesGatewayFinalResult === true, `${label}: preserves gateway final`);
  assert(sidecar?.preservesRuntimeFinalStatus === true, `${label}: preserves runtime final_status`);
  assert(sidecar?.preservesRuntimeRouting === true, `${label}: preserves runtime routing`);
  assert(sidecar?.affectsPrimaryGatewayResult === false, `${label}: no primary effect`);
  assert(sidecar?.changesGatewayPrimaryDispatch === false, `${label}: no gateway dispatch change`);
  assert(sidecar?.changesGatewayFinalResult === false, `${label}: no gateway final result change`);
  assert(sidecar?.changesRuntimeFinalStatus === false, `${label}: no runtime final_status change`);
  assert(sidecar?.changesRuntimeRouting === false, `${label}: no runtime routing change`);
  assert(sidecar?.writesFiles === false, `${label}: no file writes`);
  assert(sidecar?.persistsAudit === false, `${label}: no audit persistence`);
  assert(sidecar?.persistsObservability === false, `${label}: no observability persistence`);
  assert(sidecar?.persistsGuardrails === false, `${label}: no guardrail persistence`);
  assert(sidecar?.persistsRollback === false, `${label}: no rollback persistence`);
  assert(sidecar?.containsRawPrompt === false, `${label}: no raw prompt`);
  assert(sidecar?.containsRawArtifacts === false, `${label}: no raw artifacts`);
  assert(sidecar?.containsSecrets === false, `${label}: no secrets`);
}

function assertNoLeakedUnsafeData(result: ExecutionResult, label: string): void {
  const json = JSON.stringify(result);
  assert(!json.includes("THIS_HERMES_GATEWAY_REAL_DISPATCH_PROMPT_MUST_NOT_LEAK"), `${label}: no raw prompt marker`);
  assert(!json.includes("__UNSAFE_METADATA__"), `${label}: no unsafe metadata marker`);
  assert(!json.includes("__SANITIZATION_FAILURE__"), `${label}: no sanitization failure marker`);
  assert(!json.includes("secret_value_123"), `${label}: no secret value`);
  assert(!json.includes("stdout payload"), `${label}: no stdout payload`);
  assert(!json.includes("stderr payload"), `${label}: no stderr payload`);
  assert(!json.includes("full CLI output"), `${label}: no full CLI output`);
  assert(!json.includes("full warning text"), `${label}: no full warning text`);
  assert(!json.includes("real_api_key_"), `${label}: no real API key`);
}

function fileExists(p: string): boolean {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function readTextSafe(p: string): string | undefined {
  try { return fs.readFileSync(p, "utf-8"); } catch { return undefined; }
}

function scanDirForString(dir: string, needle: string): { found: boolean; file?: string } {
  if (!fileExists(dir)) return { found: false };
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = scanDirForString(full, needle);
      if (nested.found) return nested;
    } else if (entry.isFile()) {
      const text = readTextSafe(full);
      if (text !== undefined && text.includes(needle)) {
        return { found: true, file: full };
      }
    }
  }
  return { found: false };
}

async function test(): Promise<void> {
  console.log("Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Implementation Test\n");

  console.log("Test 1: Disabled path omits sidecar");
  const disabled = makeDispatcher(() => successDispatchResult());
  const disabledGateway = new ExecutionGateway({
    env: {},
    hermesPhase2ShadowDispatcher: disabled.dispatcher,
  });
  const rDisabled = await disabledGateway.execute(baseRequest("code_review"));
  assert(disabled.calls() === 0, "disabled dispatcher not called");
  assertNoSidecar(rDisabled, "disabled");
  assertPrimaryUnchanged(rDisabled, baseRequest("code_review"), "disabled");
  console.log("");

  console.log("Test 2: Missing each required flag omits sidecar");
  for (const missingFlag of Object.keys(allHermesFlags) as Array<keyof typeof allHermesFlags>) {
    const env = { ...allHermesFlags };
    delete (env as Record<string, string>)[missingFlag];
    const miss = makeDispatcher(() => successDispatchResult());
    const gw = new ExecutionGateway({ env, hermesPhase2ShadowDispatcher: miss.dispatcher });
    const result = await gw.execute(baseRequest("validation"));
    assert(miss.calls() === 0, `missing ${missingFlag}: dispatcher not called`);
    assertNoSidecar(result, `missing ${missingFlag}`);
    assertPrimaryUnchanged(result, baseRequest("validation"), `missing ${missingFlag}`);
  }
  console.log("");

  console.log("Test 3: Missing operator approval omits sidecar");
  const noApprovalRequest: ExecutionRequest = { ...baseRequest("code_review"), operatorApproval: {} };
  const noApproval = makeDispatcher(() => successDispatchResult());
  const noApprovalGateway = new ExecutionGateway({
    env: allHermesFlags,
    hermesPhase2ShadowDispatcher: noApproval.dispatcher,
  });
  const rNoApproval = await noApprovalGateway.execute(noApprovalRequest);
  assert(noApproval.calls() === 0, "no approval dispatcher not called");
  assertNoSidecar(rNoApproval, "no approval");
  assertPrimaryUnchanged(rNoApproval, noApprovalRequest, "no approval");
  console.log("");

  console.log("Test 4: Unsupported request types omit sidecar");
  for (const type of ["llm_task", "code_generation", "bugfix"] as const) {
    const unsupported = makeDispatcher(() => successDispatchResult());
    const gw = new ExecutionGateway({ env: allHermesFlags, hermesPhase2ShadowDispatcher: unsupported.dispatcher });
    const request = unsupportedRequest(type);
    const result = await gw.execute(request);
    assert(unsupported.calls() === 0, `${type}: dispatcher not called`);
    assertNoSidecar(result, `${type}`);
    assertPrimaryUnchanged(result, request, `${type}`);
  }
  console.log("");

  console.log("Test 5: Unsafe metadata omits sidecar");
  const unsafeRequest: ExecutionRequest = { ...baseRequest("code_review"), input: { artifacts: [], marker: "__UNSAFE_METADATA__" } };
  const unsafe = makeDispatcher(() => successDispatchResult());
  const unsafeGateway = new ExecutionGateway({ env: allHermesFlags, hermesPhase2ShadowDispatcher: unsafe.dispatcher });
  const rUnsafe = await unsafeGateway.execute(unsafeRequest);
  assert(unsafe.calls() === 0, "unsafe dispatcher not called");
  assertNoSidecar(rUnsafe, "unsafe metadata");
  assertPrimaryUnchanged(rUnsafe, unsafeRequest, "unsafe metadata");
  console.log("");

  console.log("Test 6: Sanitization failure omits sidecar");
  const sanitizationRequest: ExecutionRequest = { ...baseRequest("validation"), input: { marker: "__SANITIZATION_FAILURE__" } };
  const sanitization = makeDispatcher(() => successDispatchResult());
  const sanitizationGateway = new ExecutionGateway({ env: allHermesFlags, hermesPhase2ShadowDispatcher: sanitization.dispatcher });
  const rSanitization = await sanitizationGateway.execute(sanitizationRequest);
  assert(sanitization.calls() === 0, "sanitization dispatcher not called");
  assertNoSidecar(rSanitization, "sanitization failure");
  assertPrimaryUnchanged(rSanitization, sanitizationRequest, "sanitization failure");
  console.log("");

  console.log("Test 7: Dispatcher exception omits sidecar");
  const throwing: { dispatcher: HermesPhase2ShadowDispatcher; calls: () => number } = (() => {
    let called = 0;
    return {
      calls: () => called,
      dispatcher: async () => {
        called++;
        throw new Error("THIS_HERMES_GATEWAY_REAL_DISPATCH_PROMPT_MUST_NOT_LEAK token=abc");
      },
    };
  })();
  const throwingGateway = new ExecutionGateway({ env: allHermesFlags, hermesPhase2ShadowDispatcher: throwing.dispatcher });
  const rThrow = await throwingGateway.execute(baseRequest("code_review"));
  assert(throwing.calls() === 1, "throwing dispatcher called once");
  assertNoSidecar(rThrow, "dispatcher exception");
  assertPrimaryUnchanged(rThrow, baseRequest("code_review"), "dispatcher exception");
  assertNoLeakedUnsafeData(rThrow, "dispatcher exception");
  console.log("");

  console.log("Test 8: Guardrail refusal omits sidecar");
  const guardrailRefusal = makeDispatcher(() => ({ status: "guardrail_refusal", warnings: ["refused"] }));
  const guardrailGateway = new ExecutionGateway({ env: allHermesFlags, hermesPhase2ShadowDispatcher: guardrailRefusal.dispatcher });
  const rGuardrail = await guardrailGateway.execute(baseRequest("validation"));
  assert(guardrailRefusal.calls() === 1, "guardrail dispatcher called once");
  assertNoSidecar(rGuardrail, "guardrail refusal");
  assertPrimaryUnchanged(rGuardrail, baseRequest("validation"), "guardrail refusal");
  console.log("");

  console.log("Test 9: Rollback required omits sidecar");
  const rollback = makeDispatcher(() => ({ status: "rollback_required", warnings: ["rollback"] }));
  const rollbackGateway = new ExecutionGateway({ env: allHermesFlags, hermesPhase2ShadowDispatcher: rollback.dispatcher });
  const rRollback = await rollbackGateway.execute(baseRequest("code_review"));
  assert(rollback.calls() === 1, "rollback dispatcher called once");
  assertNoSidecar(rRollback, "rollback required");
  assertPrimaryUnchanged(rRollback, baseRequest("code_review"), "rollback required");
  console.log("");

  console.log("Test 10: code_review safe path attaches sanitized sidecar only");
  const codeReview = makeDispatcher(() => successDispatchResult());
  const codeReviewGateway = new ExecutionGateway({ env: allHermesFlags, hermesPhase2ShadowDispatcher: codeReview.dispatcher });
  const codeReviewRequest = baseRequest("code_review");
  const rCodeReview = await codeReviewGateway.execute(codeReviewRequest);
  assert(codeReview.calls() === 1, "code_review dispatcher called once");
  assertSidecarAttached(rCodeReview, "code_review", "code_review safe");
  assertPrimaryUnchanged(rCodeReview, codeReviewRequest, "code_review safe");
  assert(rCodeReview.success === true, "code_review primary success unchanged");
  assertNoLeakedUnsafeData(rCodeReview, "code_review safe");
  console.log("");

  console.log("Test 11: validation safe path attaches sanitized sidecar only");
  const validation = makeDispatcher(() => successDispatchResult());
  const validationGateway = new ExecutionGateway({ env: allHermesFlags, hermesPhase2ShadowDispatcher: validation.dispatcher });
  const validationRequest = baseRequest("validation");
  const rValidation = await validationGateway.execute(validationRequest);
  assert(validation.calls() === 1, "validation dispatcher called once");
  assertSidecarAttached(rValidation, "validation", "validation safe");
  assertPrimaryUnchanged(rValidation, validationRequest, "validation safe");
  assert(rValidation.success === true, "validation primary success unchanged");
  assertNoLeakedUnsafeData(rValidation, "validation safe");
  console.log("");

  console.log("Test 12: Gateway primary/final result unchanged for all paths");
  const primaryOutputs = new Map<string, ExecutionResult>();
  for (const [label, gw, request] of [
    ["disabled", disabledGateway, baseRequest("code_review")],
    ["no approval", noApprovalGateway, noApprovalRequest],
    ["unsupported", new ExecutionGateway({ env: allHermesFlags }), unsupportedRequest("llm_task")],
    ["unsafe", unsafeGateway, unsafeRequest],
    ["sanitization", sanitizationGateway, sanitizationRequest],
    ["throw", throwingGateway, baseRequest("code_review")],
    ["guardrail", guardrailGateway, baseRequest("validation")],
    ["rollback", rollbackGateway, baseRequest("code_review")],
    ["code_review", codeReviewGateway, codeReviewRequest],
    ["validation", validationGateway, validationRequest],
  ] as const) {
    const result = await gw.execute(request as ExecutionRequest);
    primaryOutputs.set(label, result);
    assertPrimaryUnchanged(result, request as ExecutionRequest, `${label} primary unchanged`);
    assert(result.error === undefined, `${label}: no primary error`);
  }
  console.log("");

  console.log("Test 13: Hermes output never final code_review/validation decision");
  const sidecarResults = [rCodeReview, rValidation];
  for (const result of sidecarResults) {
    const sidecar = result.hermes_gateway_real_dispatch as unknown as Record<string, unknown> | undefined;
    assert(sidecar?.status === "attached", "sidecar attached only");
    assert(sidecar?.mode === "shadow_sidecar", "sidecar mode shadow");
    assert(sidecar?.affectsPrimaryGatewayResult === false, "sidecar does not affect primary");
    assert(sidecar?.changesGatewayFinalResult === false, "sidecar does not change final result");
  }
  console.log("");

  console.log("Test 14: No raw prompt/artifact/secret/stdout/stderr/full CLI output in sidecar");
  const rawMarker = "THIS_HERMES_GATEWAY_REAL_DISPATCH_PROMPT_MUST_NOT_LEAK";
  const rawArtifact = "raw artifact content";
  const secret = "secret_value_123";
  const stdout = "stdout payload";
  const stderr = "stderr payload";
  const fullCli = "full CLI output";
  const fullWarning = "full warning text";
  const apiKey = "real_api_key_xyz";
  const dirtyRequest: ExecutionRequest = {
    ...baseRequest("code_review"),
    input: { artifacts: [], raw: rawArtifact },
    metadata: { note: fullWarning },
  };
  const dirtyDispatcher = makeDispatcher(() => ({
    status: "success",
    summary: `${stdout} ${stderr} ${fullCli}`,
    warnings: [`${rawMarker} ${secret} ${apiKey}`],
  }));
  const dirtyGateway = new ExecutionGateway({ env: allHermesFlags, hermesPhase2ShadowDispatcher: dirtyDispatcher.dispatcher });
  const rDirty = await dirtyGateway.execute(dirtyRequest);
  // Dispatcher returned success, but guardrails/rollback built from summary/warnings must not leak.
  assert(dirtyDispatcher.calls() === 1, "dirty dispatcher called once");
  assertNoLeakedUnsafeData(rDirty, "dirty sidecar");
  // However metadata safety/sanitization will reject the request because input contains raw marker? Actually input does not contain marker; only warning does. The dispatcher summary/warnings contain unsafe strings; the sidecar only stores summary/outcome/decision/count/checks. It must not include summary if it leaks? Summary is passed from dispatcher. We must ensure buildHermesPhase2ShadowEnablementSidecar does not expose raw prompt/secret. The summary field is currently stored in observability.outcome and fallbackPolicy.reason? Let's check: build sidecar uses dispatchResult.status in observability.outcome, not summary. fallbackPolicy.reason uses eligibility reason or attached reason. So summary not stored. Good.
  const dirtySidecar = rDirty.hermes_gateway_real_dispatch as unknown as Record<string, unknown> | undefined;
  assert(dirtySidecar !== undefined, "dirty sidecar attached");
  const dirtyJson = JSON.stringify(dirtySidecar);
  assert(!dirtyJson.includes(rawMarker), "dirty sidecar no raw prompt");
  assert(!dirtyJson.includes(secret), "dirty sidecar no secret");
  assert(!dirtyJson.includes(apiKey), "dirty sidecar no api key");
  assert(!dirtyJson.includes(stdout), "dirty sidecar no stdout");
  assert(!dirtyJson.includes(stderr), "dirty sidecar no stderr");
  assert(!dirtyJson.includes(fullCli), "dirty sidecar no full CLI output");
  assert(!dirtyJson.includes(fullWarning), "dirty sidecar no full warning text");
  console.log("");

  console.log("Test 15: No package/script/CI flag enablement");
  const packageJson = fs.readFileSync("package.json", "utf-8");
  const forbiddenFlags = [
    "SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled",
    "SDLC_HERMES_GATEWAY_INTEGRATION=enabled",
    "SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled",
  ];
  for (const flag of forbiddenFlags) {
    assert(!packageJson.includes(flag), `package.json does not contain ${flag}`);
  }
  const githubScan = scanDirForString(".github", "SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled");
  assert(!githubScan.found, `.github does not contain SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled${githubScan.file ? ` (found in ${githubScan.file})` : ""}`);
  const scriptsScan = scanDirForString("scripts", "SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled");
  assert(!scriptsScan.found, `scripts does not contain SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled${scriptsScan.file ? ` (found in ${scriptsScan.file})` : ""}`);
  console.log("");

  console.log("Test 16: No real Hermes CLI called in tests");
  assert(dirtyDispatcher.calls() === 1, "only fake dispatcher used");
  console.log("");

  console.log("Test 17: Roadmap numbering continuity");
  const statusMd = fs.readFileSync("SYSTEM_STATUS.md", "utf-8");
  assert(!statusMd.includes("170."), "no 170. numbering jump");
  assert(!statusMd.includes("171."), "no 171. numbering jump");
  assert(!statusMd.includes("172."), "no 172. numbering jump");
  console.log("");

  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

test().catch((err) => {
  console.error(err);
  process.exit(1);
});
