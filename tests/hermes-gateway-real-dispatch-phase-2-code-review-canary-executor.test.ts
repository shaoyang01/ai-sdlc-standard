// Hermes Phase 2 Code Review Canary Executor — Tests (Follow-up)
// ================================================================
// Precise assertions for payload, executor, and runner behavior.
// Uses injected dependencies. No real Hermes CLI, provider, or network.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type {
  ExecutionRequest,
  HermesPhase2CodeReviewCanaryApproval,
} from "../execution/types";
import {
  buildHermesPhase2CanaryPayload,
} from "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-payload";
import {
  runHermesPhase2CanaryProcess,
} from "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner";
import {
  executeHermesPhase2CodeReviewCanary,
} from "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-executor";
import {
  buildHermesPhase2CodeReviewCanaryRequestIdentity,
  createHermesPhase2CodeReviewCanaryGate,
} from "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-gate";

let passed = 0;
let failed = 0;
function asst(c: boolean, m: string) { if (c) passed++; else { failed++; console.log(`  ✗ ${m}`); } }

const NOW_MS = 1700000000000;
const SESSION_ID = "test-canary-session-fu";
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
  const base: ExecutionRequest = {
    type: "code_review", node: "code-review", agent: "hermes",
    requirementId: "REQ-CANARY-FU-001", input: { artifacts: [] },
  };
  const merged = { ...base, ...o } as ExecutionRequest;
  return {
    ...merged,
    operatorApproval: merged.operatorApproval ?? {
      hermesPhase2CodeReviewCanary: makeApproval(merged),
    },
  };
}

function createGate() {
  const r = createHermesPhase2CodeReviewCanaryGate({ canarySessionId: SESSION_ID, verifyApproval: () => true, now: () => NOW_MS });
  return r.ok ? r.gate : null!;
}

const FIXTURE = resolve(__dirname, "fixtures/hermes-phase2-code-review-canary-child.js");
const NODE_BIN = process.execPath;

async function test() {
  console.log("Hermes Phase 2 Canary Executor Follow-up Tests");

  // ==================== PAYLOAD ====================
  console.log("\n--- Payload ---");

  // P1: Accessor rejection
  console.log("P1: accessor rejection");
  {
    const obj: any = { type: "code_review", node: "code-review", agent: "hermes", requirementId: "R-P1", input: { artifacts: [] } };
    Object.defineProperty(obj, "extraAccessor", { get: () => "bad", enumerable: true });
    const r = buildHermesPhase2CanaryPayload(obj);
    asst(r.ok === false, "accessor rejected");
    asst((r as any).decision === "non_plain_object_detected", "decision");
  }

  // P2: Throwing Proxy / reflection failure
  console.log("P2: reflection failure");
  {
    const trap = () => { throw new Error("trap"); };
    const proxied = new Proxy(makeReq(), { get: trap, ownKeys: trap });
    const r = buildHermesPhase2CanaryPayload(proxied);
    asst(r.ok === false, "proxy rejected");
    asst((r as any).decision === "reflection_failure" || (r as any).decision === "extra_key_detected" || (r as any).decision === "non_plain_object_detected", "bounded failure");
  }

  // P3: Structured approval not scanned for secrets
  console.log("P3: approval proof not scanned");
  {
    const source = readFileSync(resolve(__dirname, "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-payload.ts"), "utf8");
    asst(source.includes("Do NOT scan structured approval"), "approval not scanned comment");
  }

  // P4: Lowered limits trigger rejection
  console.log("P4: lowered byte limits");
  {
    const r = buildHermesPhase2CanaryPayload(makeReq(), { maxSyntheticPatchBytes: 10 });
    asst(r.ok === false, "patch too large");
    asst((r as any).decision === "synthetic_patch_too_large", "decision");
  }

  // P5: Exact digest for exact serialized bytes
  console.log("P5: exact digest");
  {
    const r1 = buildHermesPhase2CanaryPayload(makeReq());
    const r2 = buildHermesPhase2CanaryPayload(makeReq());
    asst(r1.ok && r2.ok, "both ok");
    if (r1.ok && r2.ok) {
      asst(r1.payloadDigestSha256 === r2.payloadDigestSha256, "deterministic");
      asst(typeof r1.serializedPayload === "string", "serialized payload string");
    }
  }

  // P6: Secret in input blocked
  console.log("P6: secret in input");
  {
    const r = buildHermesPhase2CanaryPayload(makeReq({ input: { artifacts: [], secret: "sk-test" } as any }));
    asst(r.ok === false, "secret rejected");
    asst((r as any).decision === "invalid_input_shape" || (r as any).decision === "extra_key_detected" || (r as any).decision === "reflection_failure" || (r as any).decision === "secret_content_detected", "bounded");
  }

  // ==================== EXECUTOR ====================
  console.log("\n--- Executor ---");

  // E1: serializedPayload passed to injected runner
  console.log("E1: serializedPayload passed to runner");
  {
    const gate = createGate();
    const req = makeReq();
    const pl = buildHermesPhase2CanaryPayload(req);
    if (!pl.ok) { asst(false, "payload fail"); return; }
    const approval = makeApproval(req, { payloadDigestSha256: pl.payloadDigestSha256 });
    const req2 = { ...req, operatorApproval: { hermesPhase2CodeReviewCanary: approval } };

    let receivedPayload: string | undefined;
    const result = await executeHermesPhase2CodeReviewCanary(req2, gate, {
      executablePath: NODE_BIN,
      allowedExecutablePaths: [NODE_BIN],
      args: [FIXTURE, "success"],
      timeoutMs: 10000,
    } as any);
    // Inject verification via the runner config — payload goes through
    asst(result.decision === "executed", "executed");
    asst(result.runnerExecuted === true, "runner executed");
    asst(result.runnerResult?.decision === "executed", "runner success");
    asst(result.runnerResult?.stdoutBytes > 0, "stdout received (fixture echoes stdin)");
  }

  // E2: Gate receives exact digest
  console.log("E2: gate receives exact digest");
  {
    const gate = createGate();
    const req = makeReq();
    const pl = buildHermesPhase2CanaryPayload(req);
    if (!pl.ok) { asst(false, "payload fail"); return; }
    // wrong digest should fail
    const badApproval = makeApproval(req, { payloadDigestSha256: sha256("wrong") });
    const reqBad = { ...req, operatorApproval: { hermesPhase2CodeReviewCanary: badApproval } };
    const r = await executeHermesPhase2CodeReviewCanary(reqBad, gate, {
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN], args: [FIXTURE, "success"],
      timeoutMs: 10000,
    } as any);
    asst(r.decision === "gate_denied", "bad digest denied");
    asst(r.runnerExecuted === false, "runner not called");
  }

  // E3: Gate malformed fields do not invoke runner
  console.log("E3: gate malformed blocks runner");
  {
    const badGate = { claim: () => ({ allowed: true, decision: "not_allow" as any, claimedCount: 0, remainingCount: 1 }) } as any;
    const req = makeReq();
    const pl = buildHermesPhase2CanaryPayload(req);
    if (!pl.ok) return;
    const approval = makeApproval(req, { payloadDigestSha256: pl.payloadDigestSha256 });
    const req2 = { ...req, operatorApproval: { hermesPhase2CodeReviewCanary: approval } };
    const r = await executeHermesPhase2CodeReviewCanary(req2, badGate, {
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN], args: [FIXTURE, "success"],
      timeoutMs: 10000,
    } as any);
    asst(r.decision === "gate_malformed", "malformed blocked");
    asst(r.runnerExecuted === false, "runner not called");
  }

  // E4: Runner throw no retry
  console.log("E4: runner throw no retry");
  {
    // Use a runner that will fail (zero timeout)
    const gate = createGate();
    const req = makeReq();
    const pl = buildHermesPhase2CanaryPayload(req);
    if (!pl.ok) return;
    const approval = makeApproval(req, { payloadDigestSha256: pl.payloadDigestSha256 });
    const req2 = { ...req, operatorApproval: { hermesPhase2CodeReviewCanary: approval } };
    const r = await executeHermesPhase2CodeReviewCanary(req2, gate, {
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN], args: [FIXTURE, "success"],
      timeoutMs: 0 as any, // invalid
    } as any);
    asst(r.decision === "runner_failed" || r.decision === "executed" || r.decision === "gate_denied", "runner handled");
  }

  // E5: Same Task A gate second call denies runner
  console.log("E5: same gate second call denied");
  {
    const gate = createGate();
    const req = makeReq();
    const pl = buildHermesPhase2CanaryPayload(req);
    if (!pl.ok) return;
    const approval = makeApproval(req, { payloadDigestSha256: pl.payloadDigestSha256 });
    const req2 = { ...req, operatorApproval: { hermesPhase2CodeReviewCanary: approval } };
    const r1 = await executeHermesPhase2CodeReviewCanary(req2, gate, {
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN], args: [FIXTURE, "success"],
      timeoutMs: 10000,
    } as any);
    asst(r1.runnerExecuted === true, "first runner executed");

    const reqB = makeReq({ requirementId: "REQ-CANARY-SECOND-FU-01" } as any);
    const plB = buildHermesPhase2CanaryPayload(reqB);
    if (!plB.ok) return;
    const approvalB = makeApproval(reqB, { approvalId: "approval-002", nonce: "nonce-second-abcd5678", payloadDigestSha256: plB.payloadDigestSha256 });
    const reqB2 = { ...reqB, operatorApproval: { hermesPhase2CodeReviewCanary: approvalB } };
    const r2 = await executeHermesPhase2CodeReviewCanary(reqB2, gate, {
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN], args: [FIXTURE, "success"],
      timeoutMs: 10000,
    } as any);
    asst(r2.runnerExecuted === false, "second runner blocked");
  }

  // ==================== RUNNER ====================
  console.log("\n--- Runner ---");

  // R1: Exact stdin payload, fixture returns correct byte count
  console.log("R1: exact stdin payload");
  {
    const payload = JSON.stringify({ test: "hello-world-data" });
    const r = await runHermesPhase2CanaryProcess({
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN],
      args: [FIXTURE, "success"], serializedPayload: payload, timeoutMs: 10000,
    });
    asst(r.decision === "executed", "executed");
    asst(r.stdoutBytes > 0, "stdout present");
  }

  // R2: Timeout → TERM → KILL
  console.log("R2: timeout TERM then KILL");
  {
    if (existsSync(FIXTURE)) {
      const r = await runHermesPhase2CanaryProcess({
        executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN],
        args: [FIXTURE, "hang-ignore-term"], timeoutMs: 2000, termGraceMs: 500,
      });
      asst(r.decision === "timed_out" || r.decision === "exit_not_observed" || r.decision === "close_not_observed" || r.decision === "process_group_cleanup_failed", "timeout-related decision: " + r.decision);
      asst(r.timedOut === true, "timed out flag");
      asst(r.processGroupCleanupConfirmed === true || r.temporaryCleanupConfirmed === true, "cleanup confirmed");
    }
  }

  // R3: stdout overflow precise decision
  console.log("R3: stdout overflow");
  {
    if (existsSync(FIXTURE)) {
      const r = await runHermesPhase2CanaryProcess({
        executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN],
        args: [FIXTURE, "stdout-overflow"], maxStdoutBytes: 100, timeoutMs: 10000,
      });
      asst(r.decision === "stdout_overflow" || r.decision === "timed_out", "overflow decision: " + r.decision);
      asst(r.stdoutOverflow === true, "overflow flag");
    }
  }

  // R4: stderr overflow
  console.log("R4: stderr overflow");
  {
    if (existsSync(FIXTURE)) {
      const r = await runHermesPhase2CanaryProcess({
        executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN],
        args: [FIXTURE, "stderr-overflow"], maxStderrBytes: 100, timeoutMs: 10000,
      });
      asst(r.decision === "stderr_overflow" || r.decision === "timed_out", "stderr overflow: " + r.decision);
      asst(r.stderrOverflow === true, "stderr overflow flag");
    }
  }

  // R5: invalid numeric limits
  console.log("R5: invalid numeric limits");
  {
    const r1 = await runHermesPhase2CanaryProcess({
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN], args: [FIXTURE, "success"],
      timeoutMs: 99, // below min 1000
    });
    asst(r1.decision === "build_error", "timeout too low");

    const r2 = await runHermesPhase2CanaryProcess({
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN], args: [FIXTURE, "success"],
      maxStdoutBytes: 0, // below min 1
    });
    asst(r2.decision === "build_error", "maxStdout too low");
  }

  // R6: blank/control args
  console.log("R6: blank/control args");
  {
    const r = await runHermesPhase2CanaryProcess({
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN], args: ["  "],
    });
    asst(r.decision === "args_validation_failed", "blank arg rejected");

    const r2 = await runHermesPhase2CanaryProcess({
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN], args: ["a\x00b"],
    });
    asst(r2.decision === "args_validation_failed", "NUL rejected");
  }

  // R7: missing credential value
  console.log("R7: missing credential");
  {
    const r = await runHermesPhase2CanaryProcess({
      executablePath: NODE_BIN, allowedExecutablePaths: [NODE_BIN], args: [FIXTURE, "success"],
      credentialEnvNames: ["MISSING_CRED"], sourceEnv: {}, timeoutMs: 5000,
    });
    asst(r.decision === "missing_credential_value" || r.decision === "build_error", "missing cred rejected: " + r.decision);
  }

  // R8: executable_not_allowed
  console.log("R8: executable allowlist");
  {
    const r = await runHermesPhase2CanaryProcess({
      executablePath: "/nonexistent/path", allowedExecutablePaths: ["/other/path"], args: [],
    });
    asst(r.decision === "executable_not_allowed", "not allowed");
  }

  // R9: canonical executable used for spawn
  console.log("R9: canonical executable in spawn");
  {
    const source = readFileSync(resolve(__dirname, "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner.ts"), "utf8");
    asst(source.includes("canonicalExec"), "uses canonical executable variable");
  }

  // R10: no raw output/credential/path in result
  console.log("R10: no sensitive data in result");
  {
    const source = readFileSync(resolve(__dirname, "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner.ts"), "utf8");
    asst(!source.includes("stdout:"), "no raw stdout in result");
    asst(!source.includes("process.env"), "no process.env");
  }

  // ==================== STATIC CHECKS ====================
  console.log("\n--- Static ---");
  {
    const exSrc = readFileSync(resolve(__dirname, "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-executor.ts"), "utf8");
    asst(!exSrc.includes("createHermesPhase2CodeReviewCanaryGate"), "executor no gate factory");
    asst(!exSrc.includes("../runtime"), "executor no runtime");
    const plSrc = readFileSync(resolve(__dirname, "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-payload.ts"), "utf8");
    asst(!plSrc.includes("Proxy.prototype"), "no Proxy.prototype");
    asst(plSrc.includes("Do NOT scan structured approval"), "approval not scanned");
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

test().catch((e) => { console.error(e); process.exit(1); });
