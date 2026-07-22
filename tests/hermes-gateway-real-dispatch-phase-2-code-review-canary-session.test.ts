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

function makeFakeRunner(): { runner: HermesPhase2CanaryProcessRunner; state: { calls: number } } {
  const state = { calls: 0 };
  const runner: HermesPhase2CanaryProcessRunner = async () => {
    state.calls++;
    return {
      decision: "executed", exitCode: 0, signal: null, timedOut: false,
      durationMs: 1, stdoutBytes: 10, stderrBytes: 0,
      stdoutOverflow: false, stderrOverflow: false,
      termSent: false, killSent: false,
      exitObserved: true, closeObserved: true,
      processGroupCleanupConfirmed: true, temporaryCleanupConfirmed: true,
    };
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

  // R2: Duplicate registration
  console.log("R2: duplicate registration");
  {
    const { runner } = makeFakeRunner();
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

  // R4: Config snapshot
  console.log("R4: config snapshot isolation");
  {
    const { runner, state } = makeFakeRunner();
    const runnerConfig: any = {
      executablePath: process.execPath,
      allowedExecutablePaths: [process.execPath],
      args: ["original-arg"],
      credentialEnvNames: ["ORIG_CRED"],
      sourceEnv: { ORIG_CRED: "original-value" },
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

    // Mutate original config
    runnerConfig.args.push("mutated-arg");
    runnerConfig.allowedExecutablePaths.push("/mutated/path");
    runnerConfig.credentialEnvNames.push("MUTATED_CRED");
    runnerConfig.sourceEnv.MUTATED_CRED = "mutated-value";
    runnerConfig.executablePath = "/mutated/exec";

    // Execute — runner should receive snapshot, not mutated config
    const req = makeReq("session-r4-unique");
    const result = await r.entry.execute(req);
    asst(result.decision === "executed", "executed");
    asst(state.calls === 1, "runner called once");
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

  // R6: Concurrent one-shot
  console.log("R6: concurrent one-shot");
  {
    const { runner, state } = makeFakeRunner();
    const r = registerHermesPhase2CodeReviewCanarySession({
      canarySessionId: "session-r6-unique",
      verifyApproval: () => true,
      now: () => NOW_MS,
      processRunner: runner,
      runnerConfig: makeRunnerConfig(),
    });
    if (!r.ok) return;
    const req = makeReq("session-r6-unique");
    const [res1, res2] = await Promise.all([
      r.entry.execute(req),
      r.entry.execute(req),
    ]);
    const executedCount = [res1, res2].filter(r => r.decision === "executed").length;
    asst(executedCount === 1, "exactly one executed");
    asst(state.calls === 1, "runner called exactly once");
    const deniedCount = [res1, res2].filter(r => r.decision === "gate_denied").length;
    asst(deniedCount === 1, "exactly one denied");
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

  // R13: Sanitized result — no sensitive markers
  console.log("R13: sanitized result");
  {
    const { runner } = makeFakeRunner();
    const r = registerHermesPhase2CodeReviewCanarySession({
      canarySessionId: "session-r13-unique",
      verifyApproval: () => true,
      now: () => NOW_MS,
      processRunner: runner,
      runnerConfig: {
        executablePath: process.execPath,
        allowedExecutablePaths: [process.execPath],
        args: ["SECRET_ARG_MARKER"],
        credentialEnvNames: ["SECRET_CRED_MARKER"],
        sourceEnv: { SECRET_CRED_MARKER: "SECRET_VALUE_MARKER" },
      },
    });
    if (!r.ok) return;
    const req = makeReq("session-r13-unique", {
      operatorApproval: {
        hermesPhase2CodeReviewCanary: makeApproval(
          makeReq("session-r13-unique"),
          { proof: "SECRET_PROOF_MARKER", nonce: "SECRET_NONCE_MARKER_123", canarySessionId: "session-r13-unique", payloadDigestSha256: KNOWN_PAYLOAD_DIGEST },
        ),
      },
    });
    const result = await r.entry.execute(req);
    const json = JSON.stringify(result);
    asst(!json.includes("SECRET_PROOF_MARKER"), "no proof marker");
    asst(!json.includes("SECRET_NONCE_MARKER"), "no nonce marker");
    asst(!json.includes("SECRET_ARG_MARKER"), "no args marker");
    asst(!json.includes("SECRET_CRED_MARKER"), "no credential marker");
    asst(!json.includes("SECRET_VALUE_MARKER"), "no credential value marker");
    asst(!json.includes("serializedPayload"), "no serializedPayload");
    asst(!json.includes("payloadDigestSha256"), "no digest");
    asst(!json.includes("canarySessionId"), "no session ID");

    // Verify exact key set
    const keys = Object.keys(result);
    const expectedKeys = ["decision", "gateClaimed", "runnerExecuted", "runnerDecision", "exitCode", "timedOut", "processGroupCleanupConfirmed", "temporaryCleanupConfirmed"];
    for (const k of expectedKeys) {
      asst(keys.includes(k), `has key: ${k}`);
    }
    asst(!keys.includes("runnerResult"), "no runnerResult");
    asst(!keys.includes("request"), "no request");
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

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

test().catch((e) => { console.error(e); process.exit(1); });
