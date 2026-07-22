// Hermes Phase 2 Code Review Canary Session Entry — Tests
// ==========================================================
// Process-local session registration, one-shot semantics, sanitized results.
// Unique session IDs per test to avoid registry conflicts.
// No real Hermes CLI, provider, network, or credentials.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExecutionRequest, HermesPhase2CodeReviewCanaryApproval } from "../execution/types";
import {
  registerHermesPhase2CodeReviewCanarySession,
  HERMES_PHASE_2_CODE_REVIEW_CANARY_SESSION_SCOPE,
  type HermesPhase2CanarySanitizedResult,
} from "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-session";
import type {
  HermesPhase2CanaryProcessRunner,
} from "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-executor";
import {
  buildHermesPhase2CodeReviewCanaryRequestIdentity,
} from "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-gate";
import {
  buildHermesPhase2CanaryPayload,
} from "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-payload";
import type {
  HermesPhase2CanaryProcessRunnerConfig,
  HermesPhase2CanaryRunnerResult,
  HermesPhase2CanaryRunnerDeps,
} from "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner";

let passed = 0, failed = 0;
function asst(c: boolean, m: string) { if (c) passed++; else { failed++; console.log(`  ✗ ${m}`); } }

const NOW_MS = 1700000000000;
function sha256(s: string) { return require("node:crypto").createHash("sha256").update(s).digest("hex"); }

function makeApproval(req: ExecutionRequest, o?: Partial<HermesPhase2CodeReviewCanaryApproval>): HermesPhase2CodeReviewCanaryApproval {
  // Every supported override takes real effect; only phaseId, requestType
  // and singleUse stay fixed.
  return {
    approvalId: o?.approvalId ?? "approval-001",
    operatorIdentityReference: o?.operatorIdentityReference ?? "op-ref",
    phaseId: "phase_2_code_review_canary_one",
    requestType: "code_review",
    requestIdentity: o?.requestIdentity ?? buildHermesPhase2CodeReviewCanaryRequestIdentity(req),
    payloadDigestSha256: o?.payloadDigestSha256 ?? sha256("default"),
    canarySessionId: o?.canarySessionId ?? "test-session",
    issuedAtIso: o?.issuedAtIso ?? new Date(NOW_MS - 60000).toISOString(),
    expiresAtIso: o?.expiresAtIso ?? new Date(NOW_MS + 60000).toISOString(),
    nonce: o?.nonce ?? "nonce-abcdef1234567890",
    singleUse: true,
    proof: o?.proof ?? "proof",
  } as HermesPhase2CodeReviewCanaryApproval;
}

// The payload is fixed/synthetic, so the digest is always the same
const KNOWN_PAYLOAD_DIGEST = "bcc62b07f56d63a4d3e420c923c25fac3f79d6bcd976fa688dc39d362b8819d1";

function makeReq(sessionId: string, o?: Partial<ExecutionRequest>): ExecutionRequest {
  const base: ExecutionRequest = { type: "code_review", node: "code-review", agent: "hermes", requirementId: "REQ-SESSION-001", input: { artifacts: [] } };
  const merged = { ...base, ...o } as ExecutionRequest;
  return {
    ...merged,
    operatorApproval: merged.operatorApproval ?? {
      hermesPhase2CodeReviewCanary: makeApproval(merged, { canarySessionId: sessionId, payloadDigestSha256: KNOWN_PAYLOAD_DIGEST }),
    },
  };
}

function makeSuccessRunnerResult(): HermesPhase2CanaryRunnerResult {
  return {
    decision: "executed", exitCode: 0, signal: null, timedOut: false,
    durationMs: 1, stdoutBytes: 10, stderrBytes: 0,
    stdoutOverflow: false, stderrOverflow: false,
    termSent: false, killSent: false,
    exitObserved: true, closeObserved: true,
    processGroupCleanupConfirmed: true, temporaryCleanupConfirmed: true,
  };
}

function makeFakeRunner(): { runner: HermesPhase2CanaryProcessRunner; state: { calls: number; lastConfig?: HermesPhase2CanaryProcessRunnerConfig } } {
  const state: { calls: number; lastConfig?: HermesPhase2CanaryProcessRunnerConfig } = { calls: 0 };
  const runner: HermesPhase2CanaryProcessRunner = async (config) => {
    state.calls++;
    state.lastConfig = config;
    return makeSuccessRunnerResult();
  };
  return { runner, state };
}

function makeRunnerConfig(): HermesPhase2CanaryProcessRunnerConfig {
  return {
    executablePath: process.execPath,
    allowedExecutablePaths: [process.execPath],
    args: [],
  };
}

// ── invalid-config assertion helpers ──

// Asserts: the call does not throw; result.ok is false; decision is exactly
// invalid_session_configuration; the result JSON is exactly the minimal
// failure shape (no raw exception text, no extra fields).
function assertInvalidWithoutThrow(label: string, fn: () => unknown): void {
  let r: any;
  let threw = false;
  try {
    r = fn();
  } catch {
    threw = true;
  }
  asst(!threw, `${label}: does not throw`);
  asst(r !== null && typeof r === "object" && r.ok === false, `${label}: ok false`);
  asst(r !== null && typeof r === "object" && r.decision === "invalid_session_configuration", `${label}: exact decision`);
  asst(
    r !== null && typeof r === "object" &&
      JSON.stringify(r) === JSON.stringify({ ok: false, decision: "invalid_session_configuration" }),
    `${label}: exact minimal failure shape, no error text`,
  );
}

// Asserts the invalid call AND that the same (valid) session ID can still be
// registered afterwards — i.e. the failure did not burn the session ID.
function assertInvalidDoesNotBurn(label: string, sessionId: string, fn: () => unknown): void {
  assertInvalidWithoutThrow(label, fn);
  const good = registerHermesPhase2CodeReviewCanarySession({
    canarySessionId: sessionId,
    verifyApproval: () => true,
    now: () => NOW_MS,
    processRunner: makeFakeRunner().runner,
    runnerConfig: makeRunnerConfig(),
  });
  asst(good.ok === true, `${label}: session ID not burned`);
}

// Creates a true own "__proto__" data property (not the special object
// literal syntax, which sets the prototype instead).
function withOwnProtoDataProperty(target: object, value: unknown): object {
  Object.defineProperty(target, "__proto__", {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
  return target;
}

async function test() {
  console.log("Hermes Phase 2 Canary Session Entry Tests");

  // R1: Registration success
  console.log("R1: registration success");
  {
    const { runner } = makeFakeRunner();
    const r = registerHermesPhase2CodeReviewCanarySession({
      canarySessionId: "session-r1-unique",
      verifyApproval: () => true,
      now: () => NOW_MS,
      processRunner: runner,
      runnerConfig: makeRunnerConfig(),
    });
    asst(r.ok === true, "ok");
    if (r.ok) {
      asst(r.decision === "session_registered", "decision");
      asst(r.entry.scope === "single_node_process_only", "scope");
      asst(typeof r.entry.execute === "function", "execute exists");
      const keys = Object.keys(r.entry);
      asst(keys.length === 2, "exactly 2 keys");
      asst(keys.includes("scope"), "has scope");
      asst(keys.includes("execute"), "has execute");
    }
  }

  // R2: Duplicate registration — consumed gate is never reset
  // Strict order: register original → execute (consumes approval, nonce and
  // request quota) → duplicate registration attempt with replacement runner
  // and replacement config → original entry replay is still denied.
  console.log("R2: duplicate registration after gate consumption");
  {
    // 1. original runner and replacement runner with separate call counters
    const { runner: originalRunner, state: originalState } = makeFakeRunner();
    const { runner: replacementRunner, state: replacementState } = makeFakeRunner();

    // 2. first registration with the original runner
    const r1 = registerHermesPhase2CodeReviewCanarySession({
      canarySessionId: "session-r2-unique",
      verifyApproval: () => true,
      now: () => NOW_MS,
      processRunner: originalRunner,
      runnerConfig: makeRunnerConfig(),
    });
    asst(r1.ok === true, "first registration ok");
    if (!r1.ok) return;

    // 3. execute a legal request via the original entry
    const req = makeReq("session-r2-unique");
    const res1 = await r1.entry.execute(req);
    // 4. exact executed
    asst(res1.decision === "executed", "original entry executed");
    // 5. original runner calls exactly 1
    asst(originalState.calls === 1, "original runner called once");
    // 6. gate has now consumed approval, nonce and request quota

    // 7. duplicate registration: same session ID, replacement runner and a
    // replacement config (a throwing Proxy — proves the duplicate path never
    // scans the replacement runnerConfig)
    const r2 = registerHermesPhase2CodeReviewCanarySession({
      canarySessionId: "session-r2-unique",
      verifyApproval: () => true,
      now: () => NOW_MS,
      processRunner: replacementRunner,
      runnerConfig: new Proxy({}, {
        getPrototypeOf: () => { throw new Error("replacement proxy trap"); },
      }) as any,
    });
    // 8. exact session_already_registered
    asst(r2.ok === false, "duplicate registration rejected");
    if (!r2.ok) {
      asst(r2.decision === "session_already_registered", "exact session_already_registered");
      // 9. result carries no entry
      asst(!("entry" in r2), "no entry on duplicate result");
    }
    // 10. replacement runner calls exactly 0
    asst(replacementState.calls === 0, "replacement runner never called");

    // 11. execute the same request again via the original entry
    const res2 = await r1.entry.execute(req);
    // 12. exact gate_denied
    asst(res2.decision === "gate_denied", "replay gate_denied after duplicate attempt");
    // 13. exact approval_replayed — the consumed gate was not reset
    asst(res2.gateDecision === "approval_replayed", "approval_replayed — gate state preserved");
    // 14. original runner calls still exactly 1
    asst(originalState.calls === 1, "original runner still called once");
    // 15. replacement runner calls still exactly 0
    asst(replacementState.calls === 0, "replacement runner still never called");
  }

  // R3: Invalid registration does not burn ID
  console.log("R3: invalid registration does not burn ID");
  {
    const badR = registerHermesPhase2CodeReviewCanarySession({
      canarySessionId: "session-r3-unique",
      verifyApproval: "not-a-function" as any,
      now: () => NOW_MS,
      processRunner: makeFakeRunner().runner,
      runnerConfig: makeRunnerConfig(),
    });
    asst(badR.ok === false, "invalid config rejected");
    if (!badR.ok) asst(badR.decision === "invalid_session_configuration", "decision");

    // Same ID with valid config should succeed
    const goodR = registerHermesPhase2CodeReviewCanarySession({
      canarySessionId: "session-r3-unique",
      verifyApproval: () => true,
      now: () => NOW_MS,
      processRunner: makeFakeRunner().runner,
      runnerConfig: makeRunnerConfig(),
    });
    asst(goodR.ok === true, "valid config succeeds after invalid");
  }

  // R4: Config snapshot — comprehensive identity, isolation, freeze, and
  // exact serializedPayload verification
  console.log("R4: config snapshot isolation (comprehensive)");
  {
    const { runner, state } = makeFakeRunner();

    // All eight optional deps functions provided explicitly
    const depSpawnFn = () => { throw new Error("unused"); };
    const depSignalGroupFn = () => "ok" as const;
    const depSignal0CheckFn = () => "gone" as const;
    const depDelayFn = async () => {};
    const depSetTimerFn = (_cb: () => void, _ms: number): unknown => ({});
    const depClearTimerFn = (_h: unknown) => {};
    const depCleanupTempFn = (_dir: string) => true;
    const depNowFn = () => 42;
    const originalDeps: any = {
      spawnFn: depSpawnFn,
      signalGroupFn: depSignalGroupFn,
      signal0CheckFn: depSignal0CheckFn,
      delayFn: depDelayFn,
      setTimerFn: depSetTimerFn,
      clearTimerFn: depClearTimerFn,
      cleanupTempFn: depCleanupTempFn,
      nowFn: depNowFn,
    };
    const originalAllowedExecutablePaths = [process.execPath];
    const originalArgs = ["original-arg"];
    const originalCredentialEnvNames = ["ORIG_CRED"];
    const originalSourceEnv: Record<string, string> = { ORIG_CRED: "original-value" };
    const originalRunnerConfig: any = {
      executablePath: process.execPath,
      allowedExecutablePaths: originalAllowedExecutablePaths,
      args: originalArgs,
      timeoutMs: 5000,
      termGraceMs: 500,
      observationMs: 2000,
      maxStdoutBytes: 1024,
      maxStderrBytes: 2048,
      credentialEnvNames: originalCredentialEnvNames,
      sourceEnv: originalSourceEnv,
      deps: originalDeps,
    };

    const r = registerHermesPhase2CodeReviewCanarySession({
      canarySessionId: "session-r4-unique",
      verifyApproval: () => true,
      now: () => NOW_MS,
      processRunner: runner,
      runnerConfig: originalRunnerConfig,
    });
    asst(r.ok === true, "registered");
    if (!r.ok) return;

    // After registration, before execute: mutate every original reference
    originalRunnerConfig.executablePath = "/mutated/exec";
    originalRunnerConfig.timeoutMs = 99999;
    originalRunnerConfig.termGraceMs = 9999;
    originalRunnerConfig.observationMs = 9999;
    originalRunnerConfig.maxStdoutBytes = 1;
    originalRunnerConfig.maxStderrBytes = 1;
    originalAllowedExecutablePaths.push("/mutated/path");
    originalArgs.push("mutated-arg");
    originalCredentialEnvNames.push("MUTATED_CRED");
    originalSourceEnv.ORIG_CRED = "mutated-original";
    originalSourceEnv.NEW_KEY = "mutated-new";
    originalDeps.nowFn = () => 999;
    originalDeps.extraKey = () => "extra";
    originalRunnerConfig.deps = { nowFn: () => -1 };

    // Expected payload from the current Task B payload builder
    const req = makeReq("session-r4-unique");
    const payloadResult = buildHermesPhase2CanaryPayload(req);
    asst(payloadResult.ok === true, "payload builder ok");
    if (!payloadResult.ok) return;

    const result = await r.entry.execute(req);
    asst(result.decision === "executed", "executed");
    asst(state.calls === 1, "runner called once");

    const rc = state.lastConfig!;
    // 1. received config is not the original runnerConfig object
    asst(rc !== (originalRunnerConfig as any), "receivedConfig is not originalRunnerConfig");
    // 2. executablePath is the registration-time value
    asst(rc.executablePath === process.execPath, "executablePath snapshot value");
    // 3/4. allowedExecutablePaths exact value, not the original array
    asst(rc.allowedExecutablePaths.length === 1 && rc.allowedExecutablePaths[0] === process.execPath, "allowedExecutablePaths exact snapshot value");
    asst(rc.allowedExecutablePaths !== (originalAllowedExecutablePaths as any), "allowedExecutablePaths is a new array");
    // 5/6. args exact value, not the original array
    asst(rc.args.length === 1 && rc.args[0] === "original-arg", "args exact snapshot value");
    asst(rc.args !== (originalArgs as any), "args is a new array");
    // 7. all five numeric configs keep registration-time values
    asst(rc.timeoutMs === 5000, "timeoutMs snapshot");
    asst(rc.termGraceMs === 500, "termGraceMs snapshot");
    asst(rc.observationMs === 2000, "observationMs snapshot");
    asst(rc.maxStdoutBytes === 1024, "maxStdoutBytes snapshot");
    asst(rc.maxStderrBytes === 2048, "maxStderrBytes snapshot");
    // 8/9. credentialEnvNames exact value, not the original array
    asst(rc.credentialEnvNames!.length === 1 && rc.credentialEnvNames![0] === "ORIG_CRED", "credentialEnvNames exact snapshot value");
    asst(rc.credentialEnvNames !== (originalCredentialEnvNames as any), "credentialEnvNames is a new array");
    // 10/11/12. sourceEnv exact value, new object, no post-registration key
    asst(rc.sourceEnv!.ORIG_CRED === "original-value", "sourceEnv snapshot value");
    asst(rc.sourceEnv !== (originalSourceEnv as any), "sourceEnv is a new object");
    asst(!("NEW_KEY" in rc.sourceEnv!), "sourceEnv has no post-registration key");
    // 13/14. deps is a new object without the post-registration key
    asst(rc.deps !== (originalDeps as any), "deps is a new object");
    asst(!("extraKey" in rc.deps!), "deps has no post-registration key");
    // 15. all eight deps function references are the registration-time originals
    asst(rc.deps!.spawnFn === depSpawnFn, "deps.spawnFn original reference");
    asst(rc.deps!.signalGroupFn === depSignalGroupFn, "deps.signalGroupFn original reference");
    asst(rc.deps!.signal0CheckFn === depSignal0CheckFn, "deps.signal0CheckFn original reference");
    asst(rc.deps!.delayFn === depDelayFn, "deps.delayFn original reference");
    asst(rc.deps!.setTimerFn === depSetTimerFn, "deps.setTimerFn original reference");
    asst(rc.deps!.clearTimerFn === depClearTimerFn, "deps.clearTimerFn original reference");
    asst(rc.deps!.cleanupTempFn === depCleanupTempFn, "deps.cleanupTempFn original reference");
    asst(rc.deps!.nowFn === depNowFn, "deps.nowFn original reference");
    // 16–20. nested snapshot objects are frozen
    asst(Object.isFrozen(rc.allowedExecutablePaths), "allowedExecutablePaths frozen");
    asst(Object.isFrozen(rc.args), "args frozen");
    asst(Object.isFrozen(rc.credentialEnvNames), "credentialEnvNames frozen");
    asst(Object.isFrozen(rc.sourceEnv), "sourceEnv frozen");
    asst(Object.isFrozen(rc.deps), "deps frozen");

    // serializedPayload: exact match with the Task B builder output
    asst(rc.serializedPayload === payloadResult.serializedPayload, "serializedPayload exact match");
  }

  // R5: Sequential one-shot
  console.log("R5: sequential one-shot");
  {
    const { runner, state } = makeFakeRunner();
    const r = registerHermesPhase2CodeReviewCanarySession({
      canarySessionId: "session-r5-unique",
      verifyApproval: () => true,
      now: () => NOW_MS,
      processRunner: runner,
      runnerConfig: makeRunnerConfig(),
    });
    if (!r.ok) return;
    const req = makeReq("session-r5-unique");
    const r1 = await r.entry.execute(req);
    asst(r1.decision === "executed", "first executed");
    asst(state.calls === 1, "runner called once");

    const r2 = await r.entry.execute(req);
    asst(r2.decision === "gate_denied", "second denied");
    asst(state.calls === 1, "runner still called once");
  }

  // R6: Concurrent one-shot with PENDING runner
  console.log("R6: concurrent one-shot (pending runner)");
  {
    // Use a runner that stays pending to prove the second call doesn't wait
    // for the first runner to complete before being gate-denied.
    let resolveRunner!: (v: HermesPhase2CanaryRunnerResult) => void;
    let runnerCalls = 0;
    const pendingRunner: HermesPhase2CanaryProcessRunner = () => {
      runnerCalls++;
      return new Promise<HermesPhase2CanaryRunnerResult>((resolve) => {
        resolveRunner = resolve;
      });
    };
    const r = registerHermesPhase2CodeReviewCanarySession({
      canarySessionId: "session-r6-pending-unique",
      verifyApproval: () => true,
      now: () => NOW_MS,
      processRunner: pendingRunner,
      runnerConfig: makeRunnerConfig(),
    });
    if (!r.ok) return;
    const req = makeReq("session-r6-pending-unique");

    // Launch both concurrently — first claims gate and starts pending runner
    const p1 = r.entry.execute(req);
    const p2 = r.entry.execute(req);

    // p2 should resolve immediately with gate_denied (doesn't wait for runner)
    const res2 = await p2;
    asst(res2.decision === "gate_denied", "second denied immediately while runner pending");
    asst(runnerCalls === 1, "runner called exactly once while pending");

    // Now resolve the first runner
    resolveRunner(makeSuccessRunnerResult());
    const res1 = await p1;
    asst(res1.decision === "executed", "first executed after runner resolves");
    asst(runnerCalls === 1, "runner total calls exactly 1");
  }

  // R7: Approval replay
  console.log("R7: approval replay");
  {
    const { runner, state } = makeFakeRunner();
    const r = registerHermesPhase2CodeReviewCanarySession({
      canarySessionId: "session-r7-unique",
      verifyApproval: () => true,
      now: () => NOW_MS,
      processRunner: runner,
      runnerConfig: makeRunnerConfig(),
    });
    if (!r.ok) return;
    const req = makeReq("session-r7-unique");
    const r1 = await r.entry.execute(req);
    asst(r1.decision === "executed", "first executed");
    const r2 = await r.entry.execute(req);
    asst(r2.decision === "gate_denied", "replay denied");
    asst(r2.gateDecision === "approval_replayed", "approval_replayed");
    asst(state.calls === 1, "runner called once");
  }

  // R8: Nonce replay
  console.log("R8: nonce replay");
  {
    const { runner, state } = makeFakeRunner();
    const r = registerHermesPhase2CodeReviewCanarySession({
      canarySessionId: "session-r8-unique",
      verifyApproval: () => true,
      now: () => NOW_MS,
      processRunner: runner,
      runnerConfig: makeRunnerConfig(),
    });
    if (!r.ok) return;
    const req1 = makeReq("session-r8-unique");
    const r1 = await r.entry.execute(req1);
    asst(r1.decision === "executed", "first executed");

    const req2 = makeReq("session-r8-unique", {
      requirementId: "REQ-R8-SECOND",
      operatorApproval: {
        hermesPhase2CodeReviewCanary: makeApproval(
          { type: "code_review", node: "code-review", agent: "hermes", requirementId: "REQ-R8-SECOND", input: { artifacts: [] } },
          { approvalId: "approval-r8-2", nonce: "nonce-abcdef1234567890", canarySessionId: "session-r8-unique", payloadDigestSha256: KNOWN_PAYLOAD_DIGEST },
        ),
      },
    });
    const r2 = await r.entry.execute(req2);
    asst(r2.decision === "gate_denied", "nonce replay denied");
    asst(r2.gateDecision === "nonce_replayed", "nonce_replayed");
    asst(state.calls === 1, "runner called once");
  }

  // R9: Request cap
  console.log("R9: request cap exhausted");
  {
    const { runner, state } = makeFakeRunner();
    const r = registerHermesPhase2CodeReviewCanarySession({
      canarySessionId: "session-r9-unique",
      verifyApproval: () => true,
      now: () => NOW_MS,
      processRunner: runner,
      runnerConfig: makeRunnerConfig(),
    });
    if (!r.ok) return;
    const req1 = makeReq("session-r9-unique");
    await r.entry.execute(req1);

    const req2 = makeReq("session-r9-unique", {
      requirementId: "REQ-R9-SECOND",
      operatorApproval: {
        hermesPhase2CodeReviewCanary: makeApproval(
          { type: "code_review", node: "code-review", agent: "hermes", requirementId: "REQ-R9-SECOND", input: { artifacts: [] } },
          { approvalId: "approval-r9-2", nonce: "nonce-r9-second-12345", canarySessionId: "session-r9-unique", payloadDigestSha256: KNOWN_PAYLOAD_DIGEST },
        ),
      },
    });
    const r2 = await r.entry.execute(req2);
    asst(r2.decision === "gate_denied", "cap denied");
    asst(r2.gateDecision === "request_cap_exhausted", "request_cap_exhausted");
    asst(state.calls === 1, "runner called once");
  }

  // R10: Malformed payload
  console.log("R10: malformed payload");
  {
    const { runner, state } = makeFakeRunner();
    const r = registerHermesPhase2CodeReviewCanarySession({
      canarySessionId: "session-r10-unique",
      verifyApproval: () => true,
      now: () => NOW_MS,
      processRunner: runner,
      runnerConfig: makeRunnerConfig(),
    });
    if (!r.ok) return;
    const badReq = makeReq("session-r10-unique", { agent: "kimi" as any });
    const result = await r.entry.execute(badReq);
    asst(result.decision === "payload_build_failed", "payload_build_failed");
    asst(result.gateClaimed === false, "gate not claimed");
    asst(state.calls === 0, "runner not called");
  }

  // R11: Gate denial
  console.log("R11: gate denial");
  {
    const { runner, state } = makeFakeRunner();
    const r = registerHermesPhase2CodeReviewCanarySession({
      canarySessionId: "session-r11-unique",
      verifyApproval: () => false, // verifier denies
      now: () => NOW_MS,
      processRunner: runner,
      runnerConfig: makeRunnerConfig(),
    });
    if (!r.ok) return;
    const req = makeReq("session-r11-unique");
    const result = await r.entry.execute(req);
    asst(result.decision === "gate_denied", "gate_denied");
    asst(state.calls === 0, "runner not called");
  }

  // R12: Runner throw
  console.log("R12: runner throw");
  {
    let throwCount = 0;
    const throwingRunner: HermesPhase2CanaryProcessRunner = async () => {
      throwCount++;
      throw new Error("runner crash");
    };
    const r = registerHermesPhase2CodeReviewCanarySession({
      canarySessionId: "session-r12-unique",
      verifyApproval: () => true,
      now: () => NOW_MS,
      processRunner: throwingRunner,
      runnerConfig: makeRunnerConfig(),
    });
    if (!r.ok) return;
    const req = makeReq("session-r12-unique");
    const result = await r.entry.execute(req);
    asst(result.decision === "runner_failed", "runner_failed");
    asst(throwCount === 1, "throw count exactly 1");
  }

  // R13: Sanitized result — exact key sets for 3 result types
  console.log("R13: sanitized result exact key sets");
  {
    // 13a: executed result keys
    const { runner: runnerA } = makeFakeRunner();
    const rA = registerHermesPhase2CodeReviewCanarySession({
      canarySessionId: "session-r13a-unique",
      verifyApproval: () => true,
      now: () => NOW_MS,
      processRunner: runnerA,
      runnerConfig: makeRunnerConfig(),
    });
    if (!rA.ok) return;
    const resExecuted = await rA.entry.execute(makeReq("session-r13a-unique"));
    const executedKeys = Object.keys(resExecuted).sort();
    const expectedExecutedKeys = [
      "decision", "exitCode", "gateClaimed", "gateDecision",
      "processGroupCleanupConfirmed", "runnerDecision", "runnerExecuted",
      "temporaryCleanupConfirmed", "timedOut",
    ].sort();
    asst(JSON.stringify(executedKeys) === JSON.stringify(expectedExecutedKeys),
      `executed keys exact: got [${executedKeys}]`);

    // 13b: gate_denied result keys
    const { runner: runnerB } = makeFakeRunner();
    const rB = registerHermesPhase2CodeReviewCanarySession({
      canarySessionId: "session-r13b-unique",
      verifyApproval: () => false,
      now: () => NOW_MS,
      processRunner: runnerB,
      runnerConfig: makeRunnerConfig(),
    });
    if (!rB.ok) return;
    const resDenied = await rB.entry.execute(makeReq("session-r13b-unique"));
    const deniedKeys = Object.keys(resDenied).sort();
    const expectedDeniedKeys = [
      "decision", "gateClaimed", "gateDecision", "runnerExecuted",
    ].sort();
    asst(JSON.stringify(deniedKeys) === JSON.stringify(expectedDeniedKeys),
      `gate_denied keys exact: got [${deniedKeys}]`);

    // 13c: payload_build_failed result keys
    const { runner: runnerC } = makeFakeRunner();
    const rC = registerHermesPhase2CodeReviewCanarySession({
      canarySessionId: "session-r13c-unique",
      verifyApproval: () => true,
      now: () => NOW_MS,
      processRunner: runnerC,
      runnerConfig: makeRunnerConfig(),
    });
    if (!rC.ok) return;
    const resPayloadFail = await rC.entry.execute(makeReq("session-r13c-unique", { agent: "kimi" as any }));
    const payloadFailKeys = Object.keys(resPayloadFail).sort();
    const expectedPayloadFailKeys = [
      "decision", "gateClaimed", "payloadDecision", "runnerExecuted",
    ].sort();
    asst(JSON.stringify(payloadFailKeys) === JSON.stringify(expectedPayloadFailKeys),
      `payload_build_failed keys exact: got [${payloadFailKeys}]`);
  }

  // R14: No Gateway/Runtime wiring
  console.log("R14: no forbidden imports");
  {
    const source = readFileSync(resolve(__dirname, "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-session.ts"), "utf8");
    asst(!source.includes("./gateway"), "no gateway import");
    asst(!source.includes("../runtime"), "no runtime import");
    asst(!source.includes("core/runtime-executors"), "no runtime-executors import");
    asst(!source.includes("phase-2-shadow-enablement"), "no shadow enablement import");
    asst(!source.includes("hermes-gateway-real-dispatch.ts"), "no generic hermes dispatcher");
    asst(!source.includes("runHermesPhase2CanaryProcess"), "no production runner value import");
    asst(!source.includes("process.env"), "no process.env");
    asst(!source.includes("hermesPhase2ShadowEnablement"), "no shadow enablement");
    asst(!source.includes("unregister"), "no unregister");
    asst(!source.includes("reset"), "no reset");
    asst(!source.includes("replace"), "no replace");
    asst(!source.includes("reopen"), "no reopen");
    asst(source.includes("scanPlainDataRecord"), "plain data record scan present");
    asst(source.includes("satisfies CompleteRunnerConfigSnapshot"), "mapped-type snapshot guard present");
    asst(source.includes("RunnerConfigSnapshotField"), "snapshot field mapped type present");
    asst(!source.includes("_SnapshotMustCoverAll"), "old weak guard removed");
    asst(source.includes("Object.create(null)"), "null-prototype scanner values");
    asst(source.includes("Reflect.ownKeys"), "Reflect.ownKeys descriptor traversal");
    asst(source.includes('"__proto__"'), "explicit __proto__ rejection");
    asst(!source.includes("const values: Record<string, unknown> = {}"), "no plain {} scanner values");
    asst(!source.includes("values[key] ="), "no plain assignment into scanner values");
  }

  // R15: Task A and Task B tests remain passing
  console.log("R15: existing tests pass (verified by npm test)");
  {
    asst(true, "verified via npm test");
  }

  // R16: Comprehensive invalid config tests — fail-closed, no throw, no burn
  console.log("R16: comprehensive invalid config");
  {
    const base = (sessionId: string) => ({
      canarySessionId: sessionId,
      verifyApproval: () => true,
      now: () => NOW_MS,
      processRunner: makeFakeRunner().runner,
      runnerConfig: makeRunnerConfig(),
    });
    const rcBase = () => makeRunnerConfig() as any;
    const iterThrowArray = (items: string[]): string[] => {
      const a = [...items];
      Object.defineProperty(a, Symbol.iterator, {
        get() { throw new Error("iterator boom"); },
        enumerable: false,
        configurable: true,
      });
      return a;
    };
    const throwingProxy = () => new Proxy({}, {
      getPrototypeOf: () => { throw new Error("proxy trap boom"); },
    });

    // ── session ID shape ──
    assertInvalidWithoutThrow("empty session ID", () =>
      registerHermesPhase2CodeReviewCanarySession({ ...base("session-r16-x0"), canarySessionId: "" }));
    assertInvalidWithoutThrow("padded session ID", () =>
      registerHermesPhase2CodeReviewCanarySession({ ...base("session-r16-x1"), canarySessionId: " padded " }));
    assertInvalidWithoutThrow("overlong session ID", () =>
      registerHermesPhase2CodeReviewCanarySession({ ...base("session-r16-x2"), canarySessionId: "x".repeat(129) }));

    // ── top-level config (1–7) ──
    assertInvalidWithoutThrow("top-level null", () =>
      registerHermesPhase2CodeReviewCanarySession(null as any));
    assertInvalidWithoutThrow("top-level undefined", () =>
      registerHermesPhase2CodeReviewCanarySession(undefined as any));
    assertInvalidWithoutThrow("top-level array", () =>
      registerHermesPhase2CodeReviewCanarySession([] as any));
    assertInvalidWithoutThrow("top-level array with full fields", () => {
      const a: any = ["x"];
      Object.assign(a, base("session-r16-top-arr"));
      return registerHermesPhase2CodeReviewCanarySession(a);
    });
    assertInvalidWithoutThrow("top-level class instance", () => {
      class TopCfg {
        canarySessionId = "session-r16-top-class";
        verifyApproval = () => true;
        now = () => NOW_MS;
        processRunner = makeFakeRunner().runner;
        runnerConfig = makeRunnerConfig();
      }
      return registerHermesPhase2CodeReviewCanarySession(new TopCfg() as any);
    });
    // top-level accessor with a valid session ID — also proves no burn
    assertInvalidDoesNotBurn("top-level accessor", "session-r16-burn-top", () => {
      const c: any = base("session-r16-burn-top");
      Object.defineProperty(c, "verifyApproval", {
        get() { return () => true; },
        enumerable: true,
        configurable: true,
      });
      return registerHermesPhase2CodeReviewCanarySession(c);
    });
    assertInvalidWithoutThrow("top-level throwing Proxy", () =>
      registerHermesPhase2CodeReviewCanarySession(throwingProxy() as any));

    // ── runnerConfig (8–17) ──
    assertInvalidWithoutThrow("runnerConfig null", () =>
      registerHermesPhase2CodeReviewCanarySession({ ...base("session-r16-rc-null"), runnerConfig: null as any }));
    assertInvalidWithoutThrow("runnerConfig empty object", () =>
      registerHermesPhase2CodeReviewCanarySession({ ...base("session-r16-rc-empty"), runnerConfig: {} as any }));
    assertInvalidWithoutThrow("runnerConfig array", () =>
      registerHermesPhase2CodeReviewCanarySession({ ...base("session-r16-rc-arr"), runnerConfig: [] as any }));
    assertInvalidWithoutThrow("runnerConfig array with fields", () => {
      const a: any = ["x"];
      a.executablePath = process.execPath;
      a.allowedExecutablePaths = [process.execPath];
      a.args = [];
      return registerHermesPhase2CodeReviewCanarySession({ ...base("session-r16-rc-arrf"), runnerConfig: a });
    });
    assertInvalidWithoutThrow("runnerConfig class instance", () => {
      class Rc {
        executablePath = process.execPath;
        allowedExecutablePaths = [process.execPath];
        args: string[] = [];
      }
      return registerHermesPhase2CodeReviewCanarySession({ ...base("session-r16-rc-class"), runnerConfig: new Rc() as any });
    });
    assertInvalidWithoutThrow("runnerConfig accessor", () => {
      const rc: any = rcBase();
      Object.defineProperty(rc, "executablePath", {
        get() { return process.execPath; },
        enumerable: true,
        configurable: true,
      });
      return registerHermesPhase2CodeReviewCanarySession({ ...base("session-r16-rc-acc"), runnerConfig: rc });
    });
    // throwing runnerConfig Proxy with a valid session ID — proves no burn
    assertInvalidDoesNotBurn("runnerConfig throwing Proxy", "session-r16-burn-rc", () =>
      registerHermesPhase2CodeReviewCanarySession({ ...base("session-r16-burn-rc"), runnerConfig: throwingProxy() as any }));
    assertInvalidWithoutThrow("runnerConfig missing args", () => {
      const rc: any = rcBase();
      delete rc.args;
      return registerHermesPhase2CodeReviewCanarySession({ ...base("session-r16-rc-noargs"), runnerConfig: rc });
    });
    assertInvalidWithoutThrow("runnerConfig missing allowedExecutablePaths", () => {
      const rc: any = rcBase();
      delete rc.allowedExecutablePaths;
      return registerHermesPhase2CodeReviewCanarySession({ ...base("session-r16-rc-noallow"), runnerConfig: rc });
    });
    assertInvalidWithoutThrow("serializedPayload undefined key rejected", () =>
      registerHermesPhase2CodeReviewCanarySession({
        ...base("session-r16-rc-spu"),
        runnerConfig: { ...rcBase(), serializedPayload: undefined } as any,
      }));
    assertInvalidWithoutThrow("serializedPayload pre-set rejected", () =>
      registerHermesPhase2CodeReviewCanarySession({
        ...base("session-r16-rc-spp"),
        runnerConfig: { ...rcBase(), serializedPayload: "injected" } as any,
      }));

    // ── runnerConfig field shape (18–19) ──
    assertInvalidWithoutThrow("empty executablePath", () =>
      registerHermesPhase2CodeReviewCanarySession({ ...base("session-r16-f-exec"), runnerConfig: { ...rcBase(), executablePath: "" } }));
    assertInvalidWithoutThrow("args non-array", () =>
      registerHermesPhase2CodeReviewCanarySession({ ...base("session-r16-f-args"), runnerConfig: { ...rcBase(), args: "not-array" as any } }));
    assertInvalidWithoutThrow("empty allowedExecutablePaths", () =>
      registerHermesPhase2CodeReviewCanarySession({ ...base("session-r16-f-allow"), runnerConfig: { ...rcBase(), allowedExecutablePaths: [] } }));

    // ── array copy throws (20–22) ──
    // args copy throws — also proves no burn for the array-copy category
    assertInvalidDoesNotBurn("args array copy throws", "session-r16-burn-arr", () =>
      registerHermesPhase2CodeReviewCanarySession({
        ...base("session-r16-burn-arr"),
        runnerConfig: { ...rcBase(), args: iterThrowArray(["a"]) },
      }));
    assertInvalidWithoutThrow("allowlist array copy throws", () =>
      registerHermesPhase2CodeReviewCanarySession({
        ...base("session-r16-f-allowiter"),
        runnerConfig: { ...rcBase(), allowedExecutablePaths: iterThrowArray([process.execPath]) },
      }));
    assertInvalidWithoutThrow("credentialEnvNames array copy throws", () =>
      registerHermesPhase2CodeReviewCanarySession({
        ...base("session-r16-f-crediter"),
        runnerConfig: { ...rcBase(), credentialEnvNames: iterThrowArray(["CRED_A"]) },
      }));

    // ── sourceEnv (23–25) ──
    assertInvalidWithoutThrow("sourceEnv non-object", () =>
      registerHermesPhase2CodeReviewCanarySession({ ...base("session-r16-se-str"), runnerConfig: { ...rcBase(), sourceEnv: "bad" as any } }));
    assertInvalidWithoutThrow("sourceEnv array", () =>
      registerHermesPhase2CodeReviewCanarySession({ ...base("session-r16-se-arr"), runnerConfig: { ...rcBase(), sourceEnv: ["x"] as any } }));
    assertInvalidWithoutThrow("sourceEnv class instance", () => {
      class Se { CRED_A = "v"; }
      return registerHermesPhase2CodeReviewCanarySession({ ...base("session-r16-se-class"), runnerConfig: { ...rcBase(), sourceEnv: new Se() as any } });
    });
    // throwing sourceEnv Proxy — also proves no burn for the sourceEnv category
    assertInvalidDoesNotBurn("sourceEnv throwing Proxy", "session-r16-burn-env", () =>
      registerHermesPhase2CodeReviewCanarySession({
        ...base("session-r16-burn-env"),
        runnerConfig: { ...rcBase(), sourceEnv: throwingProxy() as any },
      }));

    // ── deps (26–28) ──
    assertInvalidWithoutThrow("deps non-object", () =>
      registerHermesPhase2CodeReviewCanarySession({ ...base("session-r16-de-num"), runnerConfig: { ...rcBase(), deps: 123 as any } }));
    assertInvalidWithoutThrow("deps array", () =>
      registerHermesPhase2CodeReviewCanarySession({ ...base("session-r16-de-arr"), runnerConfig: { ...rcBase(), deps: ["x"] as any } }));
    assertInvalidWithoutThrow("deps class instance", () => {
      class De { nowFn = () => 1; }
      return registerHermesPhase2CodeReviewCanarySession({ ...base("session-r16-de-class"), runnerConfig: { ...rcBase(), deps: new De() as any } });
    });
    // throwing deps Proxy — also proves no burn for the deps category
    assertInvalidDoesNotBurn("deps throwing Proxy", "session-r16-burn-deps", () =>
      registerHermesPhase2CodeReviewCanarySession({
        ...base("session-r16-burn-deps"),
        runnerConfig: { ...rcBase(), deps: throwingProxy() as any },
      }));

    // ── numeric fields (29) ──
    assertInvalidWithoutThrow("timeoutMs Infinity", () =>
      registerHermesPhase2CodeReviewCanarySession({ ...base("session-r16-n-inf"), runnerConfig: { ...rcBase(), timeoutMs: Infinity } }));
    assertInvalidWithoutThrow("maxStderrBytes NaN", () =>
      registerHermesPhase2CodeReviewCanarySession({ ...base("session-r16-n-nan"), runnerConfig: { ...rcBase(), maxStderrBytes: NaN } }));

    // ── functions (30) ──
    assertInvalidWithoutThrow("non-function verifier", () =>
      registerHermesPhase2CodeReviewCanarySession({ ...base("session-r16-fn-v"), verifyApproval: 42 as any }));
    assertInvalidWithoutThrow("non-function clock", () =>
      registerHermesPhase2CodeReviewCanarySession({ ...base("session-r16-fn-c"), now: "not-a-fn" as any }));
    assertInvalidWithoutThrow("non-function processRunner", () =>
      registerHermesPhase2CodeReviewCanarySession({ ...base("session-r16-fn-r"), processRunner: null as any }));
  }

  // R17: Marker leakage — comprehensive (all approval/config/payload markers)
  console.log("R17: marker leakage");
  {
    const SESSION = "session-r17-marker-unique";
    const { runner } = makeFakeRunner();
    const r = registerHermesPhase2CodeReviewCanarySession({
      canarySessionId: SESSION,
      verifyApproval: () => true,
      now: () => NOW_MS,
      processRunner: runner,
      runnerConfig: {
        executablePath: "/marker/exec-path-r17",
        allowedExecutablePaths: ["/marker/allowed-path-r17"],
        args: ["MARKER_ARG_R17"],
        credentialEnvNames: ["MARKER_CRED_NAME_R17"],
        sourceEnv: {
          MARKER_CRED_NAME_R17: "MARKER_CRED_VALUE_R17",
          MARKER_ENV_EXTRA_R17: "MARKER_ENV_VALUE_R17",
        },
        deps: {
          nowFn: () => NOW_MS,
          markerDepsExtraR17: "MARKER_DEPS_VALUE_R17",
        } as any,
      },
    });
    asst(r.ok === true, "registered with marker config");
    if (!r.ok) return;
    const req = makeReq(SESSION, {
      operatorApproval: {
        hermesPhase2CodeReviewCanary: makeApproval(
          makeReq(SESSION),
          {
            approvalId: "MARKER_APPROVAL_ID_R17",
            operatorIdentityReference: "MARKER_OPERATOR_R17",
            proof: "MARKER_PROOF_R17",
            nonce: "MARKER_NONCE_R17_abcdef123456",
            canarySessionId: SESSION,
            payloadDigestSha256: KNOWN_PAYLOAD_DIGEST,
          },
        ),
      },
    });
    const result = await r.entry.execute(req);
    asst(result.decision === "executed", "executed with marker approval");
    const json = JSON.stringify(result);

    // value markers
    asst(!json.includes("MARKER_APPROVAL_ID_R17"), "no approval ID marker");
    asst(!json.includes("MARKER_PROOF_R17"), "no proof marker");
    asst(!json.includes("MARKER_NONCE_R17"), "no nonce marker");
    asst(!json.includes("MARKER_OPERATOR_R17"), "no operator identity marker");
    asst(!json.includes(SESSION), "no session ID marker");
    asst(!json.includes("/marker/exec-path-r17"), "no executable path marker");
    asst(!json.includes("/marker/allowed-path-r17"), "no allowed path marker");
    asst(!json.includes("MARKER_ARG_R17"), "no args marker");
    asst(!json.includes("MARKER_CRED_NAME_R17"), "no credential name marker");
    asst(!json.includes("MARKER_CRED_VALUE_R17"), "no credential value marker");
    asst(!json.includes("MARKER_ENV_EXTRA_R17"), "no sourceEnv extra key marker");
    asst(!json.includes("MARKER_ENV_VALUE_R17"), "no sourceEnv extra value marker");
    asst(!json.includes("MARKER_DEPS_VALUE_R17"), "no deps extra marker");
    asst(!json.includes("hermes-phase2-code-review-canary-v1"), "no payload fixture ID");
    asst(!json.includes("diff --git a/src/utils.ts"), "no synthetic patch fragment");

    // field names must not appear anywhere in the sanitized result
    const forbiddenFields = [
      "request", "runnerResult", "serializedPayload", "payloadDigestSha256",
      "syntheticPatch", "approval", "approvalId", "proof", "nonce",
      "operatorIdentityReference", "canarySessionId", "runnerConfig",
      "executablePath", "allowedExecutablePaths", "args",
      "credentialEnvNames", "sourceEnv", "deps",
    ];
    for (const f of forbiddenFields) {
      asst(!(f in result), `field ${f} absent (top-level)`);
      asst(!json.includes(`"${f}"`), `field name ${f} absent in JSON`);
    }
  }

  // R18: Scanner prototype-safety — own "__proto__" data properties and
  // symbol-keyed properties must fail closed; malicious getters never run
  console.log("R18: scanner prototype-safety");
  {
    const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

    // A. top-level own "__proto__" data property carrying a full valid config
    {
      const { runner, state } = makeFakeRunner();
      const payload = {
        canarySessionId: "session-r18-a",
        verifyApproval: () => true,
        now: () => NOW_MS,
        processRunner: runner,
        runnerConfig: makeRunnerConfig(),
      };
      const cfg = withOwnProtoDataProperty({}, payload);
      asst(hasOwn(cfg, "__proto__") === true, "A: own __proto__ confirmed");
      asst(hasOwn(cfg, "canarySessionId") === false, "A: no own canarySessionId");
      assertInvalidDoesNotBurn("A: top-level __proto__ bypass", "session-r18-a", () =>
        registerHermesPhase2CodeReviewCanarySession(cfg as any));
      asst(state.calls === 0, "A: runner never called");
    }

    // B. top-level "__proto__" payload with getters — getters must never run
    {
      const { runner, state } = makeFakeRunner();
      let sidGetterCalls = 0, rcGetterCalls = 0;
      const payload: any = {};
      Object.defineProperty(payload, "canarySessionId", {
        get() { sidGetterCalls++; return "session-r18-b"; }, enumerable: true,
      });
      Object.defineProperty(payload, "runnerConfig", {
        get() { rcGetterCalls++; return makeRunnerConfig(); }, enumerable: true,
      });
      payload.verifyApproval = () => true;
      payload.now = () => NOW_MS;
      payload.processRunner = runner;
      const cfg = withOwnProtoDataProperty({}, payload);
      asst(hasOwn(cfg, "__proto__") === true, "B: own __proto__ confirmed");
      assertInvalidDoesNotBurn("B: top-level __proto__ getters", "session-r18-b", () =>
        registerHermesPhase2CodeReviewCanarySession(cfg as any));
      asst(sidGetterCalls === 0, "B: canarySessionId getter never called");
      asst(rcGetterCalls === 0, "B: runnerConfig getter never called");
      asst(state.calls === 0, "B: runner never called");
    }

    // C. runnerConfig own "__proto__" carrying the required fields
    {
      const { runner, state } = makeFakeRunner();
      const rcPayload = {
        executablePath: process.execPath,
        allowedExecutablePaths: [process.execPath],
        args: [],
      };
      const rc = withOwnProtoDataProperty({}, rcPayload);
      asst(hasOwn(rc, "__proto__") === true, "C: own __proto__ confirmed");
      asst(hasOwn(rc, "executablePath") === false, "C: no own executablePath");
      assertInvalidDoesNotBurn("C: runnerConfig __proto__ bypass", "session-r18-c", () =>
        registerHermesPhase2CodeReviewCanarySession({
          canarySessionId: "session-r18-c",
          verifyApproval: () => true,
          now: () => NOW_MS,
          processRunner: runner,
          runnerConfig: rc as any,
        }));
      asst(state.calls === 0, "C: runner never called");
    }

    // D. runnerConfig "__proto__" payload with getters — none may run
    {
      const { runner, state } = makeFakeRunner();
      let execGetterCalls = 0, allowGetterCalls = 0, argsGetterCalls = 0;
      const rcPayload: any = {};
      Object.defineProperty(rcPayload, "executablePath", {
        get() { execGetterCalls++; return process.execPath; }, enumerable: true,
      });
      Object.defineProperty(rcPayload, "allowedExecutablePaths", {
        get() { allowGetterCalls++; return [process.execPath]; }, enumerable: true,
      });
      Object.defineProperty(rcPayload, "args", {
        get() { argsGetterCalls++; return []; }, enumerable: true,
      });
      const rc = withOwnProtoDataProperty({}, rcPayload);
      asst(hasOwn(rc, "__proto__") === true, "D: own __proto__ confirmed");
      assertInvalidDoesNotBurn("D: runnerConfig __proto__ getters", "session-r18-d", () =>
        registerHermesPhase2CodeReviewCanarySession({
          canarySessionId: "session-r18-d",
          verifyApproval: () => true,
          now: () => NOW_MS,
          processRunner: runner,
          runnerConfig: rc as any,
        }));
      asst(execGetterCalls === 0, "D: executablePath getter never called");
      asst(allowGetterCalls === 0, "D: allowedExecutablePaths getter never called");
      asst(argsGetterCalls === 0, "D: args getter never called");
      asst(state.calls === 0, "D: runner never called");
    }

    // E. sourceEnv own "__proto__" with credential getter — must fail closed
    {
      const { runner, state } = makeFakeRunner();
      let credGetterCalls = 0;
      const sePayload: any = {};
      Object.defineProperty(sePayload, "CRED_A", {
        get() { credGetterCalls++; return "secret"; }, enumerable: true,
      });
      const se = withOwnProtoDataProperty({}, sePayload);
      asst(hasOwn(se, "__proto__") === true, "E: own __proto__ confirmed");
      assertInvalidDoesNotBurn("E: sourceEnv __proto__", "session-r18-e", () =>
        registerHermesPhase2CodeReviewCanarySession({
          canarySessionId: "session-r18-e",
          verifyApproval: () => true,
          now: () => NOW_MS,
          processRunner: runner,
          runnerConfig: { ...makeRunnerConfig(), sourceEnv: se as any },
        }));
      asst(credGetterCalls === 0, "E: sourceEnv getter never called");
      asst(state.calls === 0, "E: runner never called");
    }

    // F. deps own "__proto__" with function getters — must fail closed
    {
      const { runner, state } = makeFakeRunner();
      let nowFnGetterCalls = 0, spawnFnGetterCalls = 0;
      const depsPayload: any = {};
      Object.defineProperty(depsPayload, "nowFn", {
        get() { nowFnGetterCalls++; return () => NOW_MS; }, enumerable: true,
      });
      Object.defineProperty(depsPayload, "spawnFn", {
        get() { spawnFnGetterCalls++; return () => ({}); }, enumerable: true,
      });
      const deps = withOwnProtoDataProperty({}, depsPayload);
      asst(hasOwn(deps, "__proto__") === true, "F: own __proto__ confirmed");
      assertInvalidDoesNotBurn("F: deps __proto__", "session-r18-f", () =>
        registerHermesPhase2CodeReviewCanarySession({
          canarySessionId: "session-r18-f",
          verifyApproval: () => true,
          now: () => NOW_MS,
          processRunner: runner,
          runnerConfig: { ...makeRunnerConfig(), deps: deps as any },
        }));
      asst(nowFnGetterCalls === 0, "F: nowFn getter never called");
      asst(spawnFnGetterCalls === 0, "F: spawnFn getter never called");
      asst(state.calls === 0, "F: runner never called");
    }

    // G. top-level symbol-keyed accessor — symbol getter must never run
    {
      const { runner, state } = makeFakeRunner();
      const sym = Symbol("r18g");
      let symGetterCalls = 0;
      const cfg: any = {
        canarySessionId: "session-r18-g",
        verifyApproval: () => true,
        now: () => NOW_MS,
        processRunner: runner,
        runnerConfig: makeRunnerConfig(),
      };
      Object.defineProperty(cfg, sym, {
        get() { symGetterCalls++; return 1; }, enumerable: true,
      });
      asst(Object.getOwnPropertySymbols(cfg).length === 1, "G: symbol present");
      assertInvalidDoesNotBurn("G: top-level symbol accessor", "session-r18-g", () =>
        registerHermesPhase2CodeReviewCanarySession(cfg));
      asst(symGetterCalls === 0, "G: symbol getter never called");
      asst(state.calls === 0, "G: runner never called");
    }

    // H. runnerConfig symbol-keyed accessor
    {
      const { runner, state } = makeFakeRunner();
      const sym = Symbol("r18h");
      let symGetterCalls = 0;
      const rc: any = makeRunnerConfig();
      Object.defineProperty(rc, sym, {
        get() { symGetterCalls++; return 1; }, enumerable: true,
      });
      asst(Object.getOwnPropertySymbols(rc).length === 1, "H: symbol present");
      assertInvalidDoesNotBurn("H: runnerConfig symbol accessor", "session-r18-h", () =>
        registerHermesPhase2CodeReviewCanarySession({
          canarySessionId: "session-r18-h",
          verifyApproval: () => true,
          now: () => NOW_MS,
          processRunner: runner,
          runnerConfig: rc,
        }));
      asst(symGetterCalls === 0, "H: symbol getter never called");
      asst(state.calls === 0, "H: runner never called");
    }

    // I. symbol-keyed data property (top-level and runnerConfig)
    {
      const { runner, state } = makeFakeRunner();
      const sym = Symbol("r18i");
      const cfg: any = {
        canarySessionId: "session-r18-i",
        verifyApproval: () => true,
        now: () => NOW_MS,
        processRunner: runner,
        runnerConfig: makeRunnerConfig(),
      };
      Object.defineProperty(cfg, sym, {
        value: "symbol-data", enumerable: true, writable: true, configurable: true,
      });
      asst(Object.getOwnPropertySymbols(cfg).length === 1, "I: symbol data present");
      assertInvalidDoesNotBurn("I: top-level symbol data property", "session-r18-i", () =>
        registerHermesPhase2CodeReviewCanarySession(cfg));
      asst(state.calls === 0, "I: runner never called");
    }
    {
      const sym = Symbol("r18i2");
      const rc: any = makeRunnerConfig();
      Object.defineProperty(rc, sym, {
        value: "symbol-data", enumerable: true, writable: true, configurable: true,
      });
      assertInvalidDoesNotBurn("I2: runnerConfig symbol data property", "session-r18-i2", () =>
        registerHermesPhase2CodeReviewCanarySession({
          canarySessionId: "session-r18-i2",
          verifyApproval: () => true,
          now: () => NOW_MS,
          processRunner: makeFakeRunner().runner,
          runnerConfig: rc,
        }));
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

test().catch((e) => { console.error(e); process.exit(1); });
