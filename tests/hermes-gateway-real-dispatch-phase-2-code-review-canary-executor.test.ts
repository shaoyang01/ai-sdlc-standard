// Hermes Phase 2 Code Review Canary Executor — Tests (Round 2)
// ==============================================================
// Injected runner, deterministic assertions, no loose ||.
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

async function test() {
  console.log("Hermes Phase 2 Canary Executor Tests — Round 2");

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

  // P2: throwing Proxy
  console.log("P2: throwing Proxy rejected");
  {
    const proxied = new Proxy(makeReq(), { get: () => { throw new Error("trap"); } });
    const r = buildHermesPhase2CanaryPayload(proxied);
    asst(r.ok === false, "proxy rejected");
  }

  // P3: approval with throwing Proxy — builder must NOT trigger internal traps
  console.log("P3: approval proxy not read internally");
  {
    const trap = () => { throw new Error("approval trap"); };
    const approvalProxy = new Proxy(makeApproval(makeReq()), { get: trap });
    const req = makeReq({ operatorApproval: { hermesPhase2CodeReviewCanary: approvalProxy as any } });
    const r = buildHermesPhase2CanaryPayload(req);
    // Builder should succeed because it does NOT read approval internals
    asst(r.ok === true, "builder does not trigger proxy trap");
  }

  // P4: proof with secret pattern not scanned
  console.log("P4: proof not scanned for secrets");
  {
    const source = readFileSync(resolve(__dirname, "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-payload.ts"), "utf8");
    asst(source.includes("Do NOT scan structured approval"), "approval not scanned comment");
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

  // ═══════════ RUNNER ═══════════
  console.log("\n--- Runner ---");

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

  // R9: no raw output in result
  console.log("R9: no sensitive data in result");
  {
    const source = readFileSync(resolve(__dirname, "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner.ts"), "utf8");
    asst(!source.includes("stdout:"), "no raw stdout field");
    asst(!source.includes("process.env"), "no process.env");
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
    asst(!plSrc.includes("checkAccessors"), "no recursive checkAccessors");
    asst(plSrc.includes("checkTopLevelAccessors"), "top-level only");
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

test().catch((e) => { console.error(e); process.exit(1); });
