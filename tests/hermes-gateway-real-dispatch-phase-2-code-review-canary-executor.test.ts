// Hermes Phase 2 Code Review Canary Executor — Tests (Round 3)
// ==============================================================
// Injected runner, injected runner lifecycle dependencies, deterministic
// single-decision assertions, no loose multi-result assertions.
// No real Hermes CLI, provider, network, or credentials.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExecutionRequest, HermesPhase2CodeReviewCanaryApproval } from "../execution/types";
import { buildHermesPhase2CanaryPayload } from "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-payload";
import { type HermesPhase2CanaryProcessRunnerConfig, type HermesPhase2CanaryRunnerResult } from "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner";
import { executeHermesPhase2CodeReviewCanary, type HermesPhase2CanaryProcessRunner } from "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-executor";
import { buildHermesPhase2CodeReviewCanaryRequestIdentity, createHermesPhase2CodeReviewCanaryGate } from "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-gate";

let passed = 0, failed = 0;
function asst(c: boolean, m: string) { if (c) passed++; else { failed++; console.log(`  ✗ ${m}`); } }

const NOW_MS = 1700000000000;
const SESSION_ID = "test-canary-session-r2";
function sha256(s: string) { return require("node:crypto").createHash("sha256").update(s).digest("hex"); }

function makeApproval(req: ExecutionRequest, o?: Partial<HermesPhase2CodeReviewCanaryApproval>): HermesPhase2CodeReviewCanaryApproval {
  return {
    approvalId: o?.approvalId ?? "approval-001",
    operatorIdentityReference: "op-ref",
    phaseId: "phase_2_code_review_canary_one",
    requestType: "code_review",
    requestIdentity: buildHermesPhase2CodeReviewCanaryRequestIdentity(req),
    payloadDigestSha256: o?.payloadDigestSha256 ?? sha256("default"),
    canarySessionId: SESSION_ID,
    issuedAtIso: new Date(NOW_MS - 60000).toISOString(),
    expiresAtIso: new Date(NOW_MS + 60000).toISOString(),
    nonce: o?.nonce ?? "nonce-abcdef1234567890",
    singleUse: true,
    proof: "proof",
  } as HermesPhase2CodeReviewCanaryApproval;
}

function makeReq(o?: Partial<ExecutionRequest>): ExecutionRequest {
  const base: ExecutionRequest = { type: "code_review", node: "code-review", agent: "hermes", requirementId: "REQ-R2-001", input: { artifacts: [] } };
  const merged = { ...base, ...o } as ExecutionRequest;
  return { ...merged, operatorApproval: merged.operatorApproval ?? { hermesPhase2CodeReviewCanary: makeApproval(merged) } };
}

function createGate() {
  const r = createHermesPhase2CodeReviewCanaryGate({ canarySessionId: SESSION_ID, verifyApproval: () => true, now: () => NOW_MS });
  return r.ok ? r.gate : null!;
}

function makeFakeRunner(): { runner: HermesPhase2CanaryProcessRunner; calls: { config: HermesPhase2CanaryProcessRunnerConfig }[] } {
  const calls: { config: HermesPhase2CanaryProcessRunnerConfig }[] = [];
  const runner: HermesPhase2CanaryProcessRunner = async (config) => {
    calls.push({ config });
    return {
      decision: "executed", exitCode: 0, signal: null, timedOut: false,
      durationMs: 1, stdoutBytes: 10, stderrBytes: 0,
      stdoutOverflow: false, stderrOverflow: false,
      termSent: false, killSent: false,
      exitObserved: true, closeObserved: true,
      processGroupCleanupConfirmed: true, temporaryCleanupConfirmed: true,
    };
  };
  return { runner, calls };
}

function makeThrowingRunner(): { runner: HermesPhase2CanaryProcessRunner; state: { callCount: number } } {
  const state = { callCount: 0 };
  const runner: HermesPhase2CanaryProcessRunner = async () => {
    state.callCount++;
    throw new Error("runner crash");
  };
  return { runner, state };
}

const NODE_BIN = process.execPath;
const FIXTURE = resolve(__dirname, "fixtures/hermes-phase2-code-review-canary-child.js");

// ── injected runner test harness ──

function makeFakeChild(): any {
  const { EventEmitter } = require("node:events");
  class FakeChild extends EventEmitter {
    pid = 43210;
    stdout = new EventEmitter();
    stderr = new EventEmitter();
    stdin: any = new EventEmitter();
    written: Buffer[] = [];
    constructor() {
      super();
      this.stdin.write = (data: string, enc: string, cb: (e?: Error | null) => void) => {
        this.written.push(Buffer.from(data, enc as BufferEncoding));
        cb(null);
        return true;
      };
      this.stdin.end = () => {};
    }
    kill() { return true; }
  }
  return new FakeChild();
}

// Delays below 5000ms resolve immediately; delays >= 5000ms never resolve.
// With timeoutMs=10000 the timeout timer stays logically pending forever —
// every clean injected run therefore also proves the runner returns without
// awaiting a still-pending delay.
const IMMEDIATE_BELOW_5000 = (ms: number): Promise<void> =>
  ms >= 5000 ? new Promise<void>(() => {}) : Promise.resolve();

function makeInjectedDeps(child: any, o?: {
  signal0Seq?: Array<"gone" | "exists" | "error">;
  cleanupOk?: boolean;
  delayImpl?: (ms: number) => Promise<void>;
}) {
  const log = { term: 0, kill: 0, signal0Calls: 0, cleanups: 0 };
  let idx = 0;
  const deps = {
    spawnFn: () => child,
    signalGroupFn: (_pid: number, sig: string) => {
      if (sig === "SIGTERM") log.term++; else log.kill++;
      return "ok" as const;
    },
    signal0CheckFn: () => {
      const seq = o?.signal0Seq ?? ["gone"];
      const v = seq[Math.min(idx, seq.length - 1)];
      idx++; log.signal0Calls++;
      return v;
    },
    delayFn: o?.delayImpl ?? IMMEDIATE_BELOW_5000,
    cleanupTempFn: (dir: string) => {
      log.cleanups++;
      try { require("node:fs").rmSync(dir, { recursive: true, force: true }); } catch {}
      return o?.cleanupOk ?? true;
    },
    nowFn: () => NOW_MS,
  };
  return { deps, log };
}

function injectedCfg(deps: any, o?: Record<string, unknown>): any {
  return {
    executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN],
    args: [FIXTURE, "success"],
    serializedPayload: "test-payload-bytes",
    timeoutMs: 10000, termGraceMs: 100, observationMs: 50,
    deps, ...o,
  };
}

const EXPECTED_RESULT_KEYS = [
  "closeObserved", "decision", "durationMs", "exitCode", "exitObserved",
  "killSent", "processGroupCleanupConfirmed", "signal", "stderrBytes",
  "stderrOverflow", "stdoutBytes", "stdoutOverflow",
  "temporaryCleanupConfirmed", "termSent", "timedOut",
];

async function test() {
  console.log("Hermes Phase 2 Canary Executor Tests — Round 3");

  // ═══════════ EXECUTOR ═══════════
  console.log("\n--- Executor ---");

  // E1: fake runner receives byte-for-byte serializedPayload
  console.log("E1: exact serializedPayload to runner");
  {
    const gate = createGate();
    const req = makeReq();
    const pl = buildHermesPhase2CanaryPayload(req);
    if (!pl.ok) { asst(false, "payload fail"); return; }
    const approval = makeApproval(req, { payloadDigestSha256: pl.payloadDigestSha256 });
    const req2 = { ...req, operatorApproval: { hermesPhase2CodeReviewCanary: approval } };
    const { runner, calls } = makeFakeRunner();
    const r = await executeHermesPhase2CodeReviewCanary(req2, gate, runner, {
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN], args: [],
    });
    asst(r.decision === "executed", "executed");
    asst(calls.length === 1, "runner called exactly once");
    asst(calls[0].config.serializedPayload === pl.serializedPayload, "exact serializedPayload");
  }

  // E2: fake gate receives exact digest
  console.log("E2: exact digest to gate");
  {
    const gate = createGate();
    const req = makeReq();
    const pl = buildHermesPhase2CanaryPayload(req);
    if (!pl.ok) return;
    const approval = makeApproval(req, { payloadDigestSha256: pl.payloadDigestSha256 });
    const req2 = { ...req, operatorApproval: { hermesPhase2CodeReviewCanary: approval } };
    const { runner } = makeFakeRunner();
    const r = await executeHermesPhase2CodeReviewCanary(req2, gate, runner, {
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN], args: [],
    });
    asst(r.decision === "executed", "executed");
    asst(r.gateDecision === "allow", "gate allowed");
  }

  // E3: runner throw — callCount=1, decision=runner_failed
  console.log("E3: runner throw no retry");
  {
    const gate = createGate();
    const req = makeReq();
    const pl = buildHermesPhase2CanaryPayload(req);
    if (!pl.ok) return;
    const approval = makeApproval(req, { payloadDigestSha256: pl.payloadDigestSha256 });
    const req2 = { ...req, operatorApproval: { hermesPhase2CodeReviewCanary: approval } };
    const { runner, state } = makeThrowingRunner();
    const r = await executeHermesPhase2CodeReviewCanary(req2, gate, runner, {
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN], args: [],
    });
    asst(r.decision === "runner_failed", "runner_failed");
    asst(state.callCount === 1, "callCount exactly 1");
  }

  // E4: malformed gate result — runner count=0
  console.log("E4: gate malformed blocks runner");
  {
    const badGate = { claim: () => ({ allowed: true, decision: "not-allow", claimedCount: 0, remainingCount: 1 }) } as any;
    const req = makeReq();
    const pl = buildHermesPhase2CanaryPayload(req);
    if (!pl.ok) return;
    const approval = makeApproval(req, { payloadDigestSha256: pl.payloadDigestSha256 });
    const req2 = { ...req, operatorApproval: { hermesPhase2CodeReviewCanary: approval } };
    const { runner, calls } = makeFakeRunner();
    const r = await executeHermesPhase2CodeReviewCanary(req2, badGate, runner, {
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN], args: [],
    });
    asst(r.decision === "gate_malformed", "gate_malformed");
    asst(calls.length === 0, "runner not called");
  }

  // E5: gate deny — runner count=0
  console.log("E5: gate deny blocks runner");
  {
    const denyGate = (() => {
      const r = createHermesPhase2CodeReviewCanaryGate({ canarySessionId: SESSION_ID, verifyApproval: () => false, now: () => NOW_MS });
      return r.ok ? r.gate : null;
    })();
    if (!denyGate) return;
    const req = makeReq();
    const pl = buildHermesPhase2CanaryPayload(req);
    if (!pl.ok) return;
    const approval = makeApproval(req, { payloadDigestSha256: pl.payloadDigestSha256 });
    const req2 = { ...req, operatorApproval: { hermesPhase2CodeReviewCanary: approval } };
    const { runner, calls } = makeFakeRunner();
    const r = await executeHermesPhase2CodeReviewCanary(req2, denyGate, runner, {
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN], args: [],
    });
    asst(r.decision === "gate_denied", "gate_denied");
    asst(calls.length === 0, "runner not called");
  }

  // E6: same Task A gate — second call runner count doesn't increase
  console.log("E6: same gate second call blocked");
  {
    const gate = createGate();
    const req = makeReq();
    const pl = buildHermesPhase2CanaryPayload(req);
    if (!pl.ok) return;
    const approval = makeApproval(req, { payloadDigestSha256: pl.payloadDigestSha256 });
    const req2 = { ...req, operatorApproval: { hermesPhase2CodeReviewCanary: approval } };
    const { runner, calls } = makeFakeRunner();
    const r1 = await executeHermesPhase2CodeReviewCanary(req2, gate, runner, {
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN], args: [],
    });
    asst(r1.runnerExecuted === true, "first runner executed");
    asst(calls.length === 1, "call count 1");

    const reqB = makeReq({ requirementId: "REQ-R2-SECOND-01" } as any);
    const plB = buildHermesPhase2CanaryPayload(reqB);
    if (!plB.ok) return;
    const approvalB = makeApproval(reqB, { approvalId: "approval-002", nonce: "nonce-second-abcd5678", payloadDigestSha256: plB.payloadDigestSha256 });
    const reqB2 = { ...reqB, operatorApproval: { hermesPhase2CodeReviewCanary: approvalB } };
    const r2 = await executeHermesPhase2CodeReviewCanary(reqB2, gate, runner, {
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN], args: [],
    });
    asst(r2.runnerExecuted === false, "second runner blocked");
    asst(calls.length === 1, "call count still 1");
  }

  // E7: runner returns timeout — executor returns runner_failed
  console.log("E7: runner timeout → runner_failed");
  {
    const gate = createGate();
    const req = makeReq();
    const pl = buildHermesPhase2CanaryPayload(req);
    if (!pl.ok) return;
    const approval = makeApproval(req, { payloadDigestSha256: pl.payloadDigestSha256 });
    const req2 = { ...req, operatorApproval: { hermesPhase2CodeReviewCanary: approval } };
    const timeoutRunner: HermesPhase2CanaryProcessRunner = async () => ({
      decision: "timed_out", exitCode: null, signal: "SIGTERM", timedOut: true,
      durationMs: 5000, stdoutBytes: 0, stderrBytes: 0,
      stdoutOverflow: false, stderrOverflow: false,
      termSent: true, killSent: true,
      exitObserved: true, closeObserved: true,
      processGroupCleanupConfirmed: true, temporaryCleanupConfirmed: true,
    });
    const r = await executeHermesPhase2CodeReviewCanary(req2, gate, timeoutRunner, {
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN], args: [],
    });
    asst(r.decision === "runner_failed", "runner_failed for timeout");
  }

  // E8: runner returns cleanup failure — executor returns runner_failed
  console.log("E8: runner cleanup failure → runner_failed");
  {
    const gate = createGate();
    const req = makeReq();
    const pl = buildHermesPhase2CanaryPayload(req);
    if (!pl.ok) return;
    const approval = makeApproval(req, { payloadDigestSha256: pl.payloadDigestSha256 });
    const req2 = { ...req, operatorApproval: { hermesPhase2CodeReviewCanary: approval } };
    const failRunner: HermesPhase2CanaryProcessRunner = async () => ({
      decision: "process_group_cleanup_failed", exitCode: 0, signal: null, timedOut: false,
      durationMs: 1, stdoutBytes: 0, stderrBytes: 0,
      stdoutOverflow: false, stderrOverflow: false,
      termSent: true, killSent: true,
      exitObserved: true, closeObserved: true,
      processGroupCleanupConfirmed: false, temporaryCleanupConfirmed: true,
    });
    const r = await executeHermesPhase2CodeReviewCanary(req2, gate, failRunner, {
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN], args: [],
    });
    asst(r.decision === "runner_failed", "runner_failed for cleanup failure");
  }

  // E9: payload build failure — gate=0, runner=0
  console.log("E9: builder failure blocks all");
  {
    const gate = createGate();
    const badReq = makeReq({ type: "validation" as any });
    const { runner, calls } = makeFakeRunner();
    const r = await executeHermesPhase2CodeReviewCanary(badReq, gate, runner, {
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN], args: [],
    });
    asst(r.decision === "payload_build_failed", "payload_build_failed");
    asst(calls.length === 0, "runner not called");
  }

  // E10: runner returns nonzero_exit — executor returns runner_failed
  console.log("E10: runner nonzero_exit → runner_failed");
  {
    const gate = createGate();
    const req = makeReq();
    const pl = buildHermesPhase2CanaryPayload(req);
    if (!pl.ok) return;
    const approval = makeApproval(req, { payloadDigestSha256: pl.payloadDigestSha256 });
    const req2 = { ...req, operatorApproval: { hermesPhase2CodeReviewCanary: approval } };
    const nzRunner: HermesPhase2CanaryProcessRunner = async () => ({
      decision: "nonzero_exit", exitCode: 1, signal: null, timedOut: false,
      durationMs: 1, stdoutBytes: 0, stderrBytes: 0,
      stdoutOverflow: false, stderrOverflow: false,
      termSent: false, killSent: false,
      exitObserved: true, closeObserved: true,
      processGroupCleanupConfirmed: true, temporaryCleanupConfirmed: true,
    });
    const r = await executeHermesPhase2CodeReviewCanary(req2, gate, nzRunner, {
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN], args: [],
    });
    asst(r.decision === "runner_failed", "runner_failed for nonzero_exit");
    asst(r.runnerResult?.decision === "nonzero_exit", "runner decision preserved");
  }

  // ═══════════ PAYLOAD ═══════════
  console.log("\n--- Payload ---");

  // P1: accessor on request
  console.log("P1: accessor on request rejected");
  {
    const obj: any = { type: "code_review", node: "code-review", agent: "hermes", requirementId: "R-P1", input: { artifacts: [] } };
    Object.defineProperty(obj, "badAccessor", { get: () => "x", enumerable: true });
    const r = buildHermesPhase2CanaryPayload(obj);
    asst(r.ok === false, "rejected");
    asst((r as any).decision === "non_plain_object_detected", "accessor decision");
  }

  // P2: throwing Proxy on request (reflection trap)
  console.log("P2: request throwing Proxy → reflection_failure");
  {
    const proxied = new Proxy(makeReq(), { getPrototypeOf: () => { throw new Error("trap"); } });
    const r = buildHermesPhase2CanaryPayload(proxied);
    asst(r.ok === false, "proxy rejected");
    asst((r as any).decision === "reflection_failure", "exact reflection_failure");
  }

  // P3: approval with throwing Proxy — builder must NOT trigger internal traps
  console.log("P3: approval proxy not read internally");
  {
    const trap = () => { throw new Error("approval trap"); };
    const approvalProxy = new Proxy(makeApproval(makeReq()), { get: trap, getOwnPropertyDescriptor: trap, ownKeys: trap });
    const req = makeReq({ operatorApproval: { hermesPhase2CodeReviewCanary: approvalProxy as any } });
    const r = buildHermesPhase2CanaryPayload(req);
    // Builder should succeed because it does NOT read approval internals
    asst(r.ok === true, "builder does not trigger proxy trap");
  }

  // P4: proof with secret pattern not scanned
  console.log("P4: proof not scanned for secrets");
  {
    const source = readFileSync(resolve(__dirname, "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-payload.ts"), "utf8");
    asst(source.includes("Do NOT read, traverse, or scan its internals"), "approval not scanned comment");
    asst(!source.includes("approval.proof"), "no proof access");
    asst(!source.includes("approval.nonce"), "no nonce access");
  }

  // P5: lowered limits
  console.log("P5: lowered limits");
  {
    const r = buildHermesPhase2CanaryPayload(makeReq(), { maxSyntheticPatchBytes: 10 });
    asst(r.ok === false, "patch limit rejected");
    asst((r as any).decision === "synthetic_patch_too_large", "exact decision");
  }

  // P6: exact digest
  console.log("P6: exact deterministic digest");
  {
    const r1 = buildHermesPhase2CanaryPayload(makeReq());
    const r2 = buildHermesPhase2CanaryPayload(makeReq());
    asst(r1.ok === true, "r1 ok");
    asst(r2.ok === true, "r2 ok");
    if (r1.ok && r2.ok) {
      asst(r1.payloadDigestSha256 === r2.payloadDigestSha256, "deterministic digest");
      asst(r1.serializedPayload === r2.serializedPayload, "deterministic serialization");
    }
  }

  // P7: input artifacts accessor
  console.log("P7: input artifacts accessor → non_plain_object_detected");
  {
    const input: any = {};
    Object.defineProperty(input, "artifacts", { get: () => [], enumerable: true });
    const r = buildHermesPhase2CanaryPayload(makeReq({ input } as any));
    asst(r.ok === false, "rejected");
    asst((r as any).decision === "non_plain_object_detected", "exact decision");
  }

  // P8: metadata attempt accessor
  console.log("P8: metadata attempt accessor → non_plain_object_detected");
  {
    const meta: any = {};
    Object.defineProperty(meta, "attempt", { get: () => 0, enumerable: true });
    const r = buildHermesPhase2CanaryPayload(makeReq({ metadata: meta } as any));
    asst(r.ok === false, "rejected");
    asst((r as any).decision === "non_plain_object_detected", "exact decision");
  }

  // P9: operatorApproval canary accessor
  console.log("P9: operatorApproval canary accessor → non_plain_object_detected");
  {
    const ap: any = {};
    Object.defineProperty(ap, "hermesPhase2CodeReviewCanary", { get: () => ({}), enumerable: true });
    const r = buildHermesPhase2CanaryPayload(makeReq({ operatorApproval: ap } as any));
    asst(r.ok === false, "rejected");
    asst((r as any).decision === "non_plain_object_detected", "exact decision");
  }

  // P10: input throwing Proxy
  console.log("P10: input throwing Proxy → reflection_failure");
  {
    const px = new Proxy({ artifacts: [] }, { getOwnPropertyDescriptor: () => { throw new Error("trap"); } });
    const r = buildHermesPhase2CanaryPayload(makeReq({ input: px } as any));
    asst(r.ok === false, "rejected");
    asst((r as any).decision === "reflection_failure", "exact decision");
  }

  // P11: metadata throwing Proxy
  console.log("P11: metadata throwing Proxy → reflection_failure");
  {
    const px = new Proxy({ attempt: 0 }, { getOwnPropertyDescriptor: () => { throw new Error("trap"); } });
    const r = buildHermesPhase2CanaryPayload(makeReq({ metadata: px } as any));
    asst(r.ok === false, "rejected");
    asst((r as any).decision === "reflection_failure", "exact decision");
  }

  // P12: operatorApproval throwing Proxy
  console.log("P12: operatorApproval throwing Proxy → reflection_failure");
  {
    const px = new Proxy({}, { ownKeys: () => { throw new Error("trap"); } });
    const r = buildHermesPhase2CanaryPayload(makeReq({ operatorApproval: px } as any));
    asst(r.ok === false, "rejected");
    asst((r as any).decision === "reflection_failure", "exact decision");
  }

  // P13: valid metadata { attempt: 0 } accepted
  console.log("P13: valid metadata attempt 0 accepted");
  {
    const r = buildHermesPhase2CanaryPayload(makeReq({ metadata: { attempt: 0 } } as any));
    asst(r.ok === true, "metadata attempt 0 accepted");
  }

  // ═══════════ RUNNER (real child process) ═══════════
  console.log("\n--- Runner (real) ---");

  // R1: exact stdin payload
  console.log("R1: exact stdin payload");
  {
    const payload = JSON.stringify({ test: "exact-stdin-test-data-12345" });
    const { runHermesPhase2CanaryProcess } = require("../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner");
    const r = await runHermesPhase2CanaryProcess({
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN],
      args: [FIXTURE, "success"], serializedPayload: payload, timeoutMs: 10000,
    });
    asst(r.decision === "executed", "executed");
    asst(r.exitCode === 0, "exit code 0");
    asst(r.processGroupCleanupConfirmed === true, "group cleanup");
    asst(r.temporaryCleanupConfirmed === true, "temp cleanup");
  }

  // R2: timeout
  console.log("R2: timeout");
  {
    const { runHermesPhase2CanaryProcess } = require("../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner");
    const r = await runHermesPhase2CanaryProcess({
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN],
      args: [FIXTURE, "hang-ignore-term"], timeoutMs: 2000, termGraceMs: 500,
    });
    asst(r.decision === "timed_out", "timed_out");
    asst(r.timedOut === true, "timedOut flag");
    asst(r.processGroupCleanupConfirmed === true, "group cleanup confirmed");
  }

  // R3: stdout overflow
  console.log("R3: stdout overflow");
  {
    const { runHermesPhase2CanaryProcess } = require("../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner");
    const r = await runHermesPhase2CanaryProcess({
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN],
      args: [FIXTURE, "stdout-overflow"], maxStdoutBytes: 100, timeoutMs: 10000,
    });
    asst(r.decision === "stdout_overflow", "stdout_overflow");
    asst(r.stdoutOverflow === true, "overflow flag");
  }

  // R4: stderr overflow
  console.log("R4: stderr overflow");
  {
    const { runHermesPhase2CanaryProcess } = require("../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner");
    const r = await runHermesPhase2CanaryProcess({
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN],
      args: [FIXTURE, "stderr-overflow"], maxStderrBytes: 100, timeoutMs: 10000,
    });
    asst(r.decision === "stderr_overflow", "stderr_overflow");
    asst(r.stderrOverflow === true, "overflow flag");
  }

  // R5: invalid numeric limits
  console.log("R5: invalid numeric limits");
  {
    const { runHermesPhase2CanaryProcess } = require("../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner");
    const r = await runHermesPhase2CanaryProcess({
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN],
      args: [FIXTURE, "success"], timeoutMs: 99,
    });
    asst(r.decision === "build_error", "build_error for timeout < 1000");
  }

  // R6: blank/control args
  console.log("R6: blank/control args");
  {
    const { runHermesPhase2CanaryProcess } = require("../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner");
    const r = await runHermesPhase2CanaryProcess({
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN], args: ["  "],
    });
    asst(r.decision === "args_validation_failed", "blank arg rejected");
  }

  // R7: missing credential
  console.log("R7: missing credential");
  {
    const { runHermesPhase2CanaryProcess } = require("../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner");
    const r = await runHermesPhase2CanaryProcess({
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN],
      args: [FIXTURE, "success"], credentialEnvNames: ["MISSING_CRED"], sourceEnv: {},
    });
    asst(r.decision === "missing_credential_value", "missing_credential_value");
  }

  // R8: executable not allowed
  console.log("R8: executable not allowed");
  {
    const { runHermesPhase2CanaryProcess } = require("../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner");
    const r = await runHermesPhase2CanaryProcess({
      executablePath: "/nonexistent/path", allowedExecutablePaths: ["/other/path"], args: [],
    });
    asst(r.decision === "executable_not_allowed", "not allowed");
  }

  // R9: no sensitive data in runner source
  console.log("R9: no sensitive data in result");
  {
    const source = readFileSync(resolve(__dirname, "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner.ts"), "utf8");
    asst(!source.includes("process.env"), "no process.env");
  }

  // R10: exact stdin SHA-256 (production runner, real child)
  console.log("R10: exact stdin SHA-256 via production runner");
  {
    const { runHermesPhase2CanaryProcess } = require("../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner");
    const serialized = JSON.stringify({ marker: "exact-stdin-bytes", n: 42, tail: "utf8-✓" });
    const expected = sha256(serialized);
    const r = await runHermesPhase2CanaryProcess({
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN],
      args: [FIXTURE, "verify-stdin-sha256", expected],
      serializedPayload: serialized, timeoutMs: 10000,
    });
    asst(r.decision === "executed", "executed on exact stdin bytes");
    asst(r.exitCode === 0, "exit 0 exact stdin");
  }

  // R11: wrong stdin SHA-256 → nonzero_exit
  console.log("R11: stdin SHA-256 mismatch → nonzero_exit");
  {
    const { runHermesPhase2CanaryProcess } = require("../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner");
    const serialized = JSON.stringify({ marker: "exact-stdin-bytes" });
    const wrong = sha256("some-other-bytes");
    const r = await runHermesPhase2CanaryProcess({
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN],
      args: [FIXTURE, "verify-stdin-sha256", wrong],
      serializedPayload: serialized, timeoutMs: 10000,
    });
    asst(r.decision === "nonzero_exit", "nonzero_exit on mismatch");
    asst(r.exitCode === 3, "fixture fixed exit 3");
    asst(r.processGroupCleanupConfirmed === true, "group cleanup confirmed");
    asst(r.temporaryCleanupConfirmed === true, "temp cleanup confirmed");
  }

  // R12: exit 1 → nonzero_exit (real fixture)
  console.log("R12: exit 1 → nonzero_exit");
  {
    const { runHermesPhase2CanaryProcess } = require("../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner");
    const r = await runHermesPhase2CanaryProcess({
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN],
      args: [FIXTURE, "nonzero"], timeoutMs: 10000,
    });
    asst(r.decision === "nonzero_exit", "nonzero_exit");
    asst(r.exitCode === 1, "exit code 1");
    asst(r.exitObserved === true && r.closeObserved === true, "exit+close observed");
  }

  // ═══════════ RUNNER (injected dependencies, deterministic) ═══════════
  console.log("\n--- Runner (injected) ---");

  // RN1: clean exit 0 → executed; returns despite never-resolving timeout delay; result hygiene
  console.log("RN1: injected clean exit 0 → executed, no pending delay awaited");
  {
    const { runHermesPhase2CanaryProcess } = require("../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner");
    const child = makeFakeChild();
    const { deps, log } = makeInjectedDeps(child);
    const runP = runHermesPhase2CanaryProcess(injectedCfg(deps));
    child.emit("exit", 0, null);
    child.emit("close");
    const r = await Promise.race([
      runP,
      new Promise((_, rej) => setTimeout(() => rej(new Error("runner hung")), 5000)),
    ]) as any;
    asst(r.decision === "executed", "executed");
    asst(r.exitCode === 0, "exit 0");
    asst(r.exitObserved === true && r.closeObserved === true, "exit+close observed");
    asst(r.processGroupCleanupConfirmed === true, "group confirmed");
    asst(r.temporaryCleanupConfirmed === true, "temp confirmed");
    asst(log.term === 0 && log.kill === 0, "no signals on clean path");
    asst(
      JSON.stringify(Object.keys(r).sort()) === JSON.stringify([...EXPECTED_RESULT_KEYS].sort()),
      "exact result key set",
    );
    asst(!JSON.stringify(r).includes("test-payload-bytes"), "no payload bytes in result");
  }

  // RN2: multiple triggers → single terminationPromise, TERM once, KILL once
  console.log("RN2: multiple triggers → single termination, TERM/KILL at most once");
  {
    const { runHermesPhase2CanaryProcess } = require("../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner");
    const child = makeFakeChild();
    const { deps, log } = makeInjectedDeps(child, { signal0Seq: ["exists", "gone"] });
    const runP = runHermesPhase2CanaryProcess(injectedCfg(deps, { maxStdoutBytes: 10, maxStderrBytes: 10 }));
    child.stdout.emit("data", Buffer.alloc(100));
    child.stderr.emit("data", Buffer.alloc(100));
    const r = await runP;
    asst(r.decision === "exit_not_observed", "exit_not_observed after termination without exit");
    asst(r.stdoutOverflow === true && r.stderrOverflow === true, "both overflow triggers fired");
    asst(log.term === 1, "TERM exactly once across triggers");
    asst(log.kill === 1, "KILL exactly once");
    asst(r.termSent === true && r.killSent === true, "term/kill flags");
  }

  // RN3: signal-0 error → process_group_cleanup_failed
  console.log("RN3: signal-0 error → process_group_cleanup_failed");
  {
    const { runHermesPhase2CanaryProcess } = require("../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner");
    const child = makeFakeChild();
    const { deps, log } = makeInjectedDeps(child, { signal0Seq: ["error"] });
    const runP = runHermesPhase2CanaryProcess(injectedCfg(deps, { maxStdoutBytes: 10 }));
    child.stdout.emit("data", Buffer.alloc(100));
    const r = await runP;
    asst(r.decision === "process_group_cleanup_failed", "process_group_cleanup_failed");
    asst(r.processGroupCleanupConfirmed === false, "group not confirmed");
    asst(log.term === 1 && log.kill === 1, "TERM/KILL at most once");
  }

  // RN4: group still exists after KILL → process_group_cleanup_failed
  console.log("RN4: group exists after KILL → process_group_cleanup_failed");
  {
    const { runHermesPhase2CanaryProcess } = require("../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner");
    const child = makeFakeChild();
    const { deps, log } = makeInjectedDeps(child, { signal0Seq: ["exists"] });
    const runP = runHermesPhase2CanaryProcess(injectedCfg(deps, { maxStdoutBytes: 10 }));
    child.stdout.emit("data", Buffer.alloc(100));
    const r = await runP;
    asst(r.decision === "process_group_cleanup_failed", "process_group_cleanup_failed");
    asst(r.processGroupCleanupConfirmed === false, "group not confirmed");
    asst(log.kill === 1, "KILL sent exactly once");
  }

  // RN5: temp cleanup failure overrides overflow
  console.log("RN5: temp cleanup failure overrides overflow");
  {
    const { runHermesPhase2CanaryProcess } = require("../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner");
    const child = makeFakeChild();
    const { deps } = makeInjectedDeps(child, { signal0Seq: ["gone"], cleanupOk: false });
    const runP = runHermesPhase2CanaryProcess(injectedCfg(deps, { maxStdoutBytes: 10 }));
    child.stdout.emit("data", Buffer.alloc(100));
    const r = await runP;
    asst(r.decision === "temporary_cleanup_failed", "temporary_cleanup_failed");
    asst(r.stdoutOverflow === true, "overflow still recorded");
    asst(r.temporaryCleanupConfirmed === false, "temp not confirmed");
  }

  // RN6: temp cleanup failure overrides timeout
  console.log("RN6: temp cleanup failure overrides timeout");
  {
    const { runHermesPhase2CanaryProcess } = require("../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner");
    const child = makeFakeChild();
    const { deps } = makeInjectedDeps(child, {
      signal0Seq: ["gone"], cleanupOk: false,
      delayImpl: () => Promise.resolve(), // timeout timer fires immediately
    });
    const r = await runHermesPhase2CanaryProcess(injectedCfg(deps));
    asst(r.decision === "temporary_cleanup_failed", "temporary_cleanup_failed");
    asst(r.timedOut === true, "timeout still recorded");
  }

  // RN7: exit missing after termination → exit_not_observed (timeout trigger)
  console.log("RN7: timeout trigger, no exit → exit_not_observed");
  {
    const { runHermesPhase2CanaryProcess } = require("../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner");
    const child = makeFakeChild();
    const { deps, log } = makeInjectedDeps(child, {
      signal0Seq: ["gone"],
      delayImpl: () => Promise.resolve(),
    });
    const r = await runHermesPhase2CanaryProcess(injectedCfg(deps));
    asst(r.decision === "exit_not_observed", "exit_not_observed");
    asst(r.timedOut === true, "timedOut flag");
    asst(r.exitObserved === false && r.closeObserved === false, "no exit/close");
    asst(log.term === 1 && log.kill === 0, "TERM once, KILL not needed");
  }

  // RN8: exit observed but close missing → close_not_observed
  console.log("RN8: exit without close → close_not_observed");
  {
    const { runHermesPhase2CanaryProcess } = require("../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner");
    const child = makeFakeChild();
    const { deps } = makeInjectedDeps(child, { signal0Seq: ["gone"] });
    const runP = runHermesPhase2CanaryProcess(injectedCfg(deps, { maxStdoutBytes: 10 }));
    child.emit("exit", 1, null);
    child.stdout.emit("data", Buffer.alloc(100));
    const r = await runP;
    asst(r.decision === "close_not_observed", "close_not_observed");
    asst(r.exitObserved === true && r.closeObserved === false, "exit yes, close no");
  }

  // RN9: parent exits but descendant remains → descendant termination → executed
  console.log("RN9: descendant cleanup after parent exit");
  {
    const { runHermesPhase2CanaryProcess } = require("../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner");
    const child = makeFakeChild();
    const { deps, log } = makeInjectedDeps(child, { signal0Seq: ["exists", "gone"] });
    const runP = runHermesPhase2CanaryProcess(injectedCfg(deps));
    child.emit("exit", 0, null);
    child.emit("close");
    const r = await runP;
    asst(r.decision === "executed", "executed after descendant cleanup");
    asst(log.term === 1, "TERM exactly once for descendants");
    asst(log.kill === 0, "KILL not needed");
    asst(r.processGroupCleanupConfirmed === true, "group confirmed");
  }

  // RN10: timed_out decision via injected deps
  console.log("RN10: timeout with observed exit/close → timed_out");
  {
    const { runHermesPhase2CanaryProcess } = require("../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner");
    const child = makeFakeChild();
    const { deps, log } = makeInjectedDeps(child, { signal0Seq: ["gone"] });
    const runP = runHermesPhase2CanaryProcess(injectedCfg(deps, { timeoutMs: 1000, observationMs: 5000 }));
    await new Promise((r2) => setImmediate(r2));
    await new Promise((r2) => setImmediate(r2));
    child.emit("exit", null, "SIGTERM");
    child.emit("close");
    const r = await runP;
    asst(r.decision === "timed_out", "timed_out");
    asst(r.timedOut === true, "timedOut flag");
    asst(log.term === 1 && log.kill === 0, "TERM once, KILL not needed");
  }

  // RN11: stdin error → stdin_error
  console.log("RN11: stdin error → stdin_error");
  {
    const { runHermesPhase2CanaryProcess } = require("../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner");
    const child = makeFakeChild();
    child.stdin.write = (_d: string, _e: string, cb: (e?: Error | null) => void) => {
      cb(new Error("EPIPE"));
      return false;
    };
    const { deps, log } = makeInjectedDeps(child, { signal0Seq: ["gone"] });
    const runP = runHermesPhase2CanaryProcess(injectedCfg(deps));
    child.emit("exit", 0, null);
    child.emit("close");
    const r = await runP;
    asst(r.decision === "stdin_error", "stdin_error");
    asst(log.term === 1 && log.kill === 0, "TERM once, KILL not needed");
  }

  // ═══════════ STATIC ═══════════
  console.log("\n--- Static ---");
  {
    const exSrc = readFileSync(resolve(__dirname, "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-executor.ts"), "utf8");
    asst(!exSrc.includes("createHermesPhase2CodeReviewCanaryGate"), "no gate factory");
    asst(!exSrc.includes("runHermesPhase2CanaryProcess"), "no production runner import");
    asst(exSrc.includes("HermesPhase2CanaryProcessRunner"), "injected runner type");
    const plSrc = readFileSync(resolve(__dirname, "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-payload.ts"), "utf8");
    asst(!plSrc.includes("Proxy.prototype"), "no Proxy.prototype");
    asst(plSrc.includes("scanDataDescriptors"), "descriptor-based scan");
    asst(!plSrc.includes("checkTopLevelAccessors"), "legacy accessor scan removed");
    const rnSrc = readFileSync(resolve(__dirname, "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner.ts"), "utf8");
    asst(rnSrc.includes("nonzero_exit"), "nonzero_exit decision");
    asst(rnSrc.includes("HermesPhase2CanaryRunnerDeps"), "runner deps injection");
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

test().catch((e) => { console.error(e); process.exit(1); });
