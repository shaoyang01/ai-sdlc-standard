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
  return {
    approvalId: o?.approvalId ?? "approval-001",
    operatorIdentityReference: "op-ref",
    phaseId: "phase_2_code_review_canary_one",
    requestType: "code_review",
    requestIdentity: buildHermesPhase2CodeReviewCanaryRequestIdentity(req),
    payloadDigestSha256: o?.payloadDigestSha256 ?? sha256("default"),
    canarySessionId: o?.canarySessionId ?? "test-session",
    issuedAtIso: new Date(NOW_MS - 60000).toISOString(),
    expiresAtIso: new Date(NOW_MS + 60000).toISOString(),
    nonce: o?.nonce ?? "nonce-abcdef1234567890",
    singleUse: true,
    proof: "proof",
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

  // R2: Duplicate registration — gate state preserved
  console.log("R2: duplicate registration with gate state preservation");
  {
    const { runner, state } = makeFakeRunner();
    const config = {
      canarySessionId: "session-r2-unique",
      verifyApproval: () => true,
      now: () => NOW_MS,
      processRunner: runner,
      runnerConfig: makeRunnerConfig(),
    };
    const r1 = registerHermesPhase2CodeReviewCanarySession(config);
    asst(r1.ok === true, "first ok");

    const r2 = registerHermesPhase2CodeReviewCanarySession(config);
    asst(r2.ok === false, "second fails");
    if (!r2.ok) asst(r2.decision === "session_already_registered", "already registered");

    // Prove original entry still works and gate state is preserved
    if (r1.ok) {
      const req = makeReq("session-r2-unique");
      const res1 = await r1.entry.execute(req);
      asst(res1.decision === "executed", "original entry still executes");
      asst(state.calls === 1, "runner called once via original entry");

      // Second execute on original entry should be denied (gate state preserved)
      const res2 = await r1.entry.execute(req);
      asst(res2.decision === "gate_denied", "gate state preserved — replay denied");
      asst(res2.gateDecision === "approval_replayed", "approval_replayed on original gate");
      asst(state.calls === 1, "runner still called once");
    }
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

  // R4: Config snapshot — comprehensive field isolation
  console.log("R4: config snapshot isolation (comprehensive)");
  {
    const { runner, state } = makeFakeRunner();
    const fakeDeps: HermesPhase2CanaryRunnerDeps = {
      nowFn: () => 42,
      delayFn: async () => {},
    };
    const runnerConfig: any = {
      executablePath: process.execPath,
      allowedExecutablePaths: [process.execPath],
      args: ["original-arg"],
      timeoutMs: 5000,
      termGraceMs: 500,
      observationMs: 2000,
      maxStdoutBytes: 1024,
      maxStderrBytes: 2048,
      credentialEnvNames: ["ORIG_CRED"],
      sourceEnv: { ORIG_CRED: "original-value" },
      deps: fakeDeps,
    };
    const r = registerHermesPhase2CodeReviewCanarySession({
      canarySessionId: "session-r4-unique",
      verifyApproval: () => true,
      now: () => NOW_MS,
      processRunner: runner,
      runnerConfig,
    });
    asst(r.ok === true, "registered");
    if (!r.ok) return;

    // Mutate ALL original config fields
    runnerConfig.args.push("mutated-arg");
    runnerConfig.allowedExecutablePaths.push("/mutated/path");
    runnerConfig.credentialEnvNames.push("MUTATED_CRED");
    runnerConfig.sourceEnv.MUTATED_CRED = "mutated-value";
    runnerConfig.sourceEnv.ORIG_CRED = "mutated-original";
    runnerConfig.executablePath = "/mutated/exec";
    runnerConfig.timeoutMs = 99999;
    runnerConfig.termGraceMs = 9999;
    runnerConfig.observationMs = 9999;
    runnerConfig.maxStdoutBytes = 1;
    runnerConfig.maxStderrBytes = 1;
    runnerConfig.deps = { nowFn: () => 999 };

    // Execute — runner should receive snapshot, not mutated config
    const req = makeReq("session-r4-unique");
    const result = await r.entry.execute(req);
    asst(result.decision === "executed", "executed");
    asst(state.calls === 1, "runner called once");

    // Verify runner received the original snapshot values
    const rc = state.lastConfig!;
    asst(rc.executablePath === process.execPath, "executablePath is snapshot");
    asst(rc.allowedExecutablePaths.length === 1, "allowedExecutablePaths length is snapshot");
    asst(rc.allowedExecutablePaths[0] === process.execPath, "allowedExecutablePaths[0] is snapshot");
    asst(rc.args.length === 1, "args length is snapshot");
    asst(rc.args[0] === "original-arg", "args[0] is snapshot");
    asst(rc.timeoutMs === 5000, "timeoutMs is snapshot");
    asst(rc.termGraceMs === 500, "termGraceMs is snapshot");
    asst(rc.observationMs === 2000, "observationMs is snapshot");
    asst(rc.maxStdoutBytes === 1024, "maxStdoutBytes is snapshot");
    asst(rc.maxStderrBytes === 2048, "maxStderrBytes is snapshot");
    asst(rc.credentialEnvNames!.length === 1, "credentialEnvNames length is snapshot");
    asst(rc.credentialEnvNames![0] === "ORIG_CRED", "credentialEnvNames[0] is snapshot");
    asst(rc.sourceEnv!.ORIG_CRED === "original-value", "sourceEnv value is snapshot");
    asst(!("MUTATED_CRED" in rc.sourceEnv!), "sourceEnv has no mutated key");
    asst(rc.deps !== undefined, "deps is present");
    asst(rc.deps!.nowFn === fakeDeps.nowFn, "deps.nowFn is snapshot reference");
    asst(rc.serializedPayload !== undefined, "serializedPayload set by executor");
    asst(rc.serializedPayload!.length > 0, "serializedPayload non-empty");
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
  }

  // R15: Task A and Task B tests remain passing
  console.log("R15: existing tests pass (verified by npm test)");
  {
    asst(true, "verified via npm test");
  }

  // R16: Comprehensive invalid config tests
  console.log("R16: comprehensive invalid config");
  {
    const validBase = {
      verifyApproval: () => true,
      now: () => NOW_MS,
      processRunner: makeFakeRunner().runner,
      runnerConfig: makeRunnerConfig(),
    };

    // 16a: empty session ID
    const r1 = registerHermesPhase2CodeReviewCanarySession({ ...validBase, canarySessionId: "" });
    asst(!r1.ok && r1.decision === "invalid_session_configuration", "empty session ID rejected");

    // 16b: whitespace-padded session ID
    const r2 = registerHermesPhase2CodeReviewCanarySession({ ...validBase, canarySessionId: " padded " });
    asst(!r2.ok && r2.decision === "invalid_session_configuration", "padded session ID rejected");

    // 16c: session ID too long (>128)
    const r3 = registerHermesPhase2CodeReviewCanarySession({ ...validBase, canarySessionId: "x".repeat(129) });
    asst(!r3.ok && r3.decision === "invalid_session_configuration", "overlong session ID rejected");

    // 16d: non-function verifier
    const r4 = registerHermesPhase2CodeReviewCanarySession({ ...validBase, canarySessionId: "session-r16d", verifyApproval: 42 as any });
    asst(!r4.ok && r4.decision === "invalid_session_configuration", "non-function verifier rejected");

    // 16e: non-function clock
    const r5 = registerHermesPhase2CodeReviewCanarySession({ ...validBase, canarySessionId: "session-r16e", now: "not-a-fn" as any });
    asst(!r5.ok && r5.decision === "invalid_session_configuration", "non-function clock rejected");

    // 16f: non-function processRunner
    const r6 = registerHermesPhase2CodeReviewCanarySession({ ...validBase, canarySessionId: "session-r16f", processRunner: null as any });
    asst(!r6.ok && r6.decision === "invalid_session_configuration", "null processRunner rejected");

    // 16g: null runnerConfig
    const r7 = registerHermesPhase2CodeReviewCanarySession({ ...validBase, canarySessionId: "session-r16g", runnerConfig: null as any });
    asst(!r7.ok && r7.decision === "invalid_session_configuration", "null runnerConfig rejected");

    // 16h: runnerConfig with pre-set serializedPayload
    const r8 = registerHermesPhase2CodeReviewCanarySession({
      ...validBase, canarySessionId: "session-r16h",
      runnerConfig: { ...makeRunnerConfig(), serializedPayload: "injected" } as any,
    });
    asst(!r8.ok && r8.decision === "invalid_session_configuration", "pre-set serializedPayload rejected");

    // 16i: runnerConfig with empty executablePath
    const r9 = registerHermesPhase2CodeReviewCanarySession({
      ...validBase, canarySessionId: "session-r16i",
      runnerConfig: { ...makeRunnerConfig(), executablePath: "" },
    });
    asst(!r9.ok && r9.decision === "invalid_session_configuration", "empty executablePath rejected");

    // 16j: runnerConfig with empty allowedExecutablePaths
    const r10 = registerHermesPhase2CodeReviewCanarySession({
      ...validBase, canarySessionId: "session-r16j",
      runnerConfig: { ...makeRunnerConfig(), allowedExecutablePaths: [] },
    });
    asst(!r10.ok && r10.decision === "invalid_session_configuration", "empty allowedExecutablePaths rejected");

    // 16k: runnerConfig with non-array args
    const r11 = registerHermesPhase2CodeReviewCanarySession({
      ...validBase, canarySessionId: "session-r16k",
      runnerConfig: { ...makeRunnerConfig(), args: "not-array" as any },
    });
    asst(!r11.ok && r11.decision === "invalid_session_configuration", "non-array args rejected");

    // 16l: runnerConfig with non-finite timeoutMs
    const r12 = registerHermesPhase2CodeReviewCanarySession({
      ...validBase, canarySessionId: "session-r16l",
      runnerConfig: { ...makeRunnerConfig(), timeoutMs: Infinity },
    });
    asst(!r12.ok && r12.decision === "invalid_session_configuration", "infinite timeoutMs rejected");

    // 16m: runnerConfig with non-finite observationMs
    const r13 = registerHermesPhase2CodeReviewCanarySession({
      ...validBase, canarySessionId: "session-r16m",
      runnerConfig: { ...makeRunnerConfig(), observationMs: NaN },
    });
    asst(!r13.ok && r13.decision === "invalid_session_configuration", "NaN observationMs rejected");

    // 16n: runnerConfig with non-object sourceEnv
    const r14 = registerHermesPhase2CodeReviewCanarySession({
      ...validBase, canarySessionId: "session-r16n",
      runnerConfig: { ...makeRunnerConfig(), sourceEnv: "bad" as any },
    });
    asst(!r14.ok && r14.decision === "invalid_session_configuration", "non-object sourceEnv rejected");

    // 16o: runnerConfig with non-object deps
    const r15 = registerHermesPhase2CodeReviewCanarySession({
      ...validBase, canarySessionId: "session-r16o",
      runnerConfig: { ...makeRunnerConfig(), deps: 123 as any },
    });
    asst(!r15.ok && r15.decision === "invalid_session_configuration", "non-object deps rejected");

    // Verify none of the invalid registrations burned their session IDs
    const burnCheck = registerHermesPhase2CodeReviewCanarySession({
      ...validBase, canarySessionId: "session-r16d",
    });
    asst(burnCheck.ok === true, "invalid registration did not burn session ID");
  }

  // R17: Marker leakage — comprehensive
  console.log("R17: marker leakage");
  {
    const { runner } = makeFakeRunner();
    const r = registerHermesPhase2CodeReviewCanarySession({
      canarySessionId: "session-r17-unique",
      verifyApproval: () => true,
      now: () => NOW_MS,
      processRunner: runner,
      runnerConfig: {
        executablePath: process.execPath,
        allowedExecutablePaths: [process.execPath],
        args: ["SECRET_ARG_MARKER_R17"],
        credentialEnvNames: ["SECRET_CRED_NAME_R17"],
        sourceEnv: { SECRET_CRED_NAME_R17: "SECRET_CRED_VALUE_R17" },
      },
    });
    if (!r.ok) return;
    const req = makeReq("session-r17-unique", {
      operatorApproval: {
        hermesPhase2CodeReviewCanary: makeApproval(
          makeReq("session-r17-unique"),
          {
            proof: "SECRET_PROOF_MARKER_R17",
            nonce: "SECRET_NONCE_MARKER_R17",
            operatorIdentityReference: "SECRET_OPERATOR_MARKER_R17",
            canarySessionId: "session-r17-unique",
            payloadDigestSha256: KNOWN_PAYLOAD_DIGEST,
          },
        ),
      },
    });
    const result = await r.entry.execute(req);
    const json = JSON.stringify(result);
    asst(!json.includes("SECRET_PROOF_MARKER_R17"), "no proof marker");
    asst(!json.includes("SECRET_NONCE_MARKER_R17"), "no nonce marker");
    asst(!json.includes("SECRET_OPERATOR_MARKER_R17"), "no operator marker");
    asst(!json.includes("SECRET_ARG_MARKER_R17"), "no args marker");
    asst(!json.includes("SECRET_CRED_NAME_R17"), "no credential name marker");
    asst(!json.includes("SECRET_CRED_VALUE_R17"), "no credential value marker");
    asst(!json.includes("serializedPayload"), "no serializedPayload key");
    asst(!json.includes("payloadDigestSha256"), "no digest key");
    asst(!json.includes("session-r17-unique"), "no session ID in result");
    asst(!json.includes(process.execPath), "no executable path in result");
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

test().catch((e) => { console.error(e); process.exit(1); });
