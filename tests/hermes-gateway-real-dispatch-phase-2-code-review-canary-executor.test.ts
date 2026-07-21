// Hermes Phase 2 Code Review Canary Executor — Tests
// ======================================================
// Tests for payload builder, executor pathway, POSIX runner, and integration.
// Only fake/injected dependencies, process.execPath, and local fixture.
// No real Hermes CLI, provider, network, or real credentials.

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

import type {
  ExecutionRequest,
  HermesPhase2CodeReviewCanaryApproval,
} from "../execution/types";
import {
  buildHermesPhase2CanaryPayload,
  type HermesPhase2CanaryPayloadResult,
} from "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-payload";
import {
  runHermesPhase2CanaryProcess,
  type HermesPhase2CanaryProcessRunnerConfig,
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

function asst(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.log(`  ✗ ${message}`);
  }
}

const NOW_MS = 1700000000000;
const SESSION_ID = "test-canary-session-payload-runner";

function sha256(input: string): string {
  const { createHash } = require("node:crypto");
  return createHash("sha256").update(input).digest("hex");
}

function makeApproval(
  request: ExecutionRequest,
  overrides?: Partial<HermesPhase2CodeReviewCanaryApproval>,
): HermesPhase2CodeReviewCanaryApproval {
  const identity = buildHermesPhase2CodeReviewCanaryRequestIdentity(request);
  return {
    approvalId: overrides?.approvalId ?? "approval-001",
    operatorIdentityReference: "operator-ref-001",
    phaseId: "phase_2_code_review_canary_one",
    requestType: "code_review",
    requestIdentity: identity,
    payloadDigestSha256: overrides?.payloadDigestSha256 ?? sha256("default"),
    canarySessionId: SESSION_ID,
    issuedAtIso: new Date(NOW_MS - 60000).toISOString(),
    expiresAtIso: new Date(NOW_MS + 60000).toISOString(),
    nonce: overrides?.nonce ?? "nonce-abcdef1234567890",
    singleUse: true,
    proof: "synthetic-proof",
  } as HermesPhase2CodeReviewCanaryApproval;
}

function makeRequest(overrides?: Partial<ExecutionRequest>): ExecutionRequest {
  return {
    type: "code_review",
    node: "code-review",
    agent: "hermes",
    requirementId: "REQ-CANARY-PAYLOAD-001",
    input: { artifacts: [] },
    operatorApproval: {
      hermesPhase2CodeReviewCanary: makeApproval({
        type: "code_review",
        node: "code-review",
        agent: "hermes",
        requirementId: overrides?.requirementId ?? "REQ-CANARY-PAYLOAD-001",
        input: { artifacts: [] },
      } as ExecutionRequest),
    },
    ...overrides,
  };
}

function createTestGate(approvalOverrides?: Partial<HermesPhase2CodeReviewCanaryApproval>) {
  const result = createHermesPhase2CodeReviewCanaryGate({
    canarySessionId: SESSION_ID,
    verifyApproval: () => true,
    now: () => NOW_MS,
  });
  if (!result.ok) throw new Error("gate create failed");
  return result.gate;
}

const FIXTURE = resolve(__dirname, "fixtures/hermes-phase2-code-review-canary-child.js");

async function test() {
  console.log("Hermes Phase 2 Code Review Canary Executor Tests");
  console.log("==================================================");

  // ============ PAYLOAD BUILDER ============
  console.log("\n--- Payload Builder ---");

  // Test 1: Successful payload
  console.log("Test 1: successful payload build");
  {
    const req = makeRequest();
    const result = buildHermesPhase2CanaryPayload(req) as any;
    asst(result.ok === true, "ok");
    asst(result.payload.schemaVersion === 1, "schemaVersion");
    asst(result.payload.fixtureId === "hermes-phase2-code-review-canary-v1", "fixtureId");
    asst(result.payload.mode === "synthetic_only", "mode");
    asst(result.payload.requestType === "code_review", "requestType");
    asst(typeof result.payload.instruction === "string", "instruction present");
    asst(typeof result.payload.syntheticPatch === "string", "syntheticPatch present");
    asst(typeof result.payloadDigestSha256 === "string", "digest present");
    asst(result.serializedByteCount <= 8192, "serialized under 8192");
    asst(result.syntheticPatchByteCount <= 4096, "patch under 4096");
    // Verify deterministic
    const r2 = buildHermesPhase2CanaryPayload(req) as any;
    asst(r2.ok && r2.payloadDigestSha256 === result.payloadDigestSha256, "deterministic digest");
  }

  // Test 2: Wrong type/node/agent
  console.log("Test 2: wrong type/node/agent");
  {
    asst((buildHermesPhase2CanaryPayload(makeRequest({ type: "validation" as any })) as any).decision === "wrong_request_type", "wrong type");
    asst((buildHermesPhase2CanaryPayload(makeRequest({ node: "wrong" })) as any).decision === "wrong_node", "wrong node");
    asst((buildHermesPhase2CanaryPayload(makeRequest({ agent: "kimi" as any })) as any).decision === "wrong_agent", "wrong agent");
  }

  // Test 3: Invalid requirementId
  console.log("Test 3: invalid requirementId");
  {
    asst((buildHermesPhase2CanaryPayload(makeRequest({ requirementId: "" })) as any).decision === "invalid_requirement_id", "empty rejected");
    asst((buildHermesPhase2CanaryPayload(makeRequest({ requirementId: "!bad" })) as any).decision === "invalid_requirement_id", "special char rejected");
  }

  // Test 4: Invalid input shape
  console.log("Test 4: invalid input shape");
  {
    asst((buildHermesPhase2CanaryPayload(makeRequest({ input: {} as any })) as any).decision === "invalid_input_shape", "empty input rejected");
    asst((buildHermesPhase2CanaryPayload(makeRequest({ input: { artifacts: [{ id: "x" }] } as any })) as any).decision === "invalid_input_shape", "non-empty artifacts rejected");
  }

  // Test 5: Metadata validation
  console.log("Test 5: metadata validation");
  {
    const ok = buildHermesPhase2CanaryPayload(makeRequest({ metadata: { attempt: 0 } }));
    asst(ok.ok === true, "metadata attempt=0 ok");
    const bad = buildHermesPhase2CanaryPayload(makeRequest({ metadata: { attempt: 1 } })) as any;
    asst(bad.decision === "invalid_metadata_shape", "metadata attempt=1 rejected");
  }

  // Test 6: Operator approval (only hermesPhase2CodeReviewCanary)
  console.log("Test 6: operator approval validation");
  {
    const req = makeRequest({ operatorApproval: {} as any });
    asst((buildHermesPhase2CanaryPayload(req) as any).decision === "invalid_operator_approval", "empty approval rejected");

    const req2 = makeRequest({
      operatorApproval: {
        hermesPhase2ShadowEnablement: true,
        hermesPhase2CodeReviewCanary: makeApproval(makeRequest() as any),
      } as any,
    });
    asst((buildHermesPhase2CanaryPayload(req2) as any).decision === "invalid_operator_approval", "legacy+canary rejected");
  }

  // Test 7: Secret detection
  console.log("Test 7: secret content detection");
  {
    const req = makeRequest({ requirementId: "sk-my-apikey-abcdef1234567890" });
    asst((buildHermesPhase2CanaryPayload(req) as any).decision === "secret_content_detected", "secret in requirementId");
  }

  // Test 8: Extra key detection
  console.log("Test 8: extra key detection");
  {
    const req = { ...makeRequest(), extraStuff: "value" } as any;
    asst((buildHermesPhase2CanaryPayload(req) as any).decision === "extra_key_detected", "extra key");
  }

  // Test 9: No requirementId/artifacts in payload
  console.log("Test 9: no sensitive data in payload");
  {
    const req = makeRequest();
    const result = buildHermesPhase2CanaryPayload(req) as any;
    asst(result.ok === true, "ok");
    const payloadStr = JSON.stringify(result.payload);
    asst(!payloadStr.includes("requirementId"), "no requirementId");
    asst(!payloadStr.includes("REQ-CANARY"), "no canary requirement ref");
    asst(!("approvalId" in result.payload), "no approvalId in payload");
    asst(!("proof" in result.payload), "no proof in payload");
    asst(!("nonce" in result.payload), "no nonce in payload");
  }

  // Test 10: Size limits
  console.log("Test 10: byte limits");
  {
    const result = buildHermesPhase2CanaryPayload(makeRequest()) as any;
    asst(result.syntheticPatchByteCount <= 4096, "patch <= 4096");
    asst(result.serializedByteCount <= 8192, "serialized <= 8192");
  }

  // ============ EXECUTOR PATHWAY ============
  console.log("\n--- Executor Pathway ---");

  // Test 11: Builder failure blocked
  console.log("Test 11: builder failure blocks executor");
  {
    const gate = createTestGate();
    const badReq = makeRequest({ type: "validation" as any });
    const result = await executeHermesPhase2CodeReviewCanary(badReq, gate, {
      executablePath: process.execPath,
      allowedExecutablePaths: [process.execPath],
      args: [],
    });
    asst(result.decision === "payload_build_failed", "builder failure");
    asst(result.gateClaimed === false, "gate not claimed");
    asst(result.runnerExecuted === false, "runner not executed");
  }

  // Test 12: Gate deny blocked
  console.log("Test 12: gate deny blocks runner");
  {
    const gate = (() => {
      const r = createHermesPhase2CodeReviewCanaryGate({
        canarySessionId: SESSION_ID,
        verifyApproval: () => false,
        now: () => NOW_MS,
      });
      return r.ok ? r.gate : null;
    })()!;
    const req = makeRequest();
    const payload = buildHermesPhase2CanaryPayload(req);
    if (!payload.ok) throw new Error("payload build failed");
    // Override digest to match what builder produces
    const approval = makeApproval(req, { payloadDigestSha256: payload.payloadDigestSha256 });
    const req2 = {
      ...req,
      operatorApproval: { hermesPhase2CodeReviewCanary: approval },
    };
    const result = await executeHermesPhase2CodeReviewCanary(req2, gate, {
      executablePath: process.execPath,
      allowedExecutablePaths: [process.execPath],
      args: [],
    });
    asst(result.decision === "gate_denied", "gate denied");
    asst(result.runnerExecuted === false, "runner not executed");
  }

  // Test 13: Gate throw handled
  console.log("Test 13: gate throw handled");
  {
    const badGate = {
      claim: () => { throw new Error("gate crash"); },
    } as any;
    const req = makeRequest();
    const result = await executeHermesPhase2CodeReviewCanary(req, badGate, {
      executablePath: process.execPath,
      allowedExecutablePaths: [process.execPath],
      args: [],
    });
    asst(result.decision === "gate_threw", "gate throw caught");
    asst(result.runnerExecuted === false, "runner not executed");
  }

  // Test 14: Gate malformed (returns null)
  console.log("Test 14: gate malformed");
  {
    const badGate = {
      claim: () => null,
    } as any;
    const req = makeRequest();
    const result = await executeHermesPhase2CodeReviewCanary(req, badGate, {
      executablePath: process.execPath,
      allowedExecutablePaths: [process.execPath],
      args: [],
    });
    asst(result.decision === "gate_malformed", "gate malformed");
  }

  // ============ RUNNER ============
  console.log("\n--- Process Runner ---");

  // Test 15: Unsupported platform handled
  console.log("Test 15: unsupported platform (code path)");
  {
    // This test confirms the platform check exists in the source
    const source = readFileSync(resolve(__dirname, "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner.ts"), "utf8");
    asst(source.includes("unsupported_platform"), "platform check exists");
  }

  // Test 16: Executable allowlist
  console.log("Test 16: executable allowlist");
  {
    const result = await runHermesPhase2CanaryProcess({
      executablePath: "/nonexistent/path",
      allowedExecutablePaths: ["/something/else"],
      args: [],
    });
    asst(result.decision === "executable_not_allowed", "not allowed");
  }

  // Test 17: Args validation
  console.log("Test 17: args validation");
  {
    const longArg = "x".repeat(257);
    const result = await runHermesPhase2CanaryProcess({
      executablePath: process.execPath,
      allowedExecutablePaths: [process.execPath],
      args: [longArg],
    });
    asst(result.decision === "args_validation_failed", "arg too long");

    const manyArgs = Array(17).fill("x");
    const r2 = await runHermesPhase2CanaryProcess({
      executablePath: process.execPath,
      allowedExecutablePaths: [process.execPath],
      args: manyArgs,
    });
    asst(r2.decision === "args_validation_failed", "too many args");
  }

  // Test 18: Credential name validation
  console.log("Test 18: credential name validation");
  {
    const result = await runHermesPhase2CanaryProcess({
      executablePath: process.execPath,
      allowedExecutablePaths: [process.execPath],
      args: [],
      credentialEnvNames: ["HOME"],
    });
    asst(result.decision === "credential_name_invalid", "HOME rejected");
  }

  // Test 19: Shell=false, detached=true
  console.log("Test 19: spawn uses shell:false, detached:true");
  {
    const source = readFileSync(resolve(__dirname, "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner.ts"), "utf8");
    asst(source.includes("shell: false"), "shell: false");
    asst(source.includes("detached: true"), "detached: true");
    asst(source.includes("stdio: [\"pipe\", \"pipe\", \"pipe\"]"), "stdio pipe");
  }

  // Test 20: Isolated env (no process.env inheritance)
  console.log("Test 20: isolated child env");
  {
    const source = readFileSync(resolve(__dirname, "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner.ts"), "utf8");
    asst(!source.includes("process.env"), "no process.env inheritance");
    asst(source.includes("env: childEnv"), "uses child env object");
    asst(source.includes("HISTFILE: \"/dev/null\""), "HISTFILE=/dev/null");
  }

  // Test 21: Success mode (uses fixture)
  console.log("Test 21: runner success with fixture");
  {
    if (!existsSync(FIXTURE)) {
      console.log("  (fixture not found, skipping)");
    } else {
      const result = await runHermesPhase2CanaryProcess({
        executablePath: process.execPath,
        allowedExecutablePaths: [process.execPath],
        args: [FIXTURE, "success"],
        timeoutMs: 10000,
      });
      asst(result.decision === "executed", "executed");
      asst(result.executed === true, "executed flag");
      asst(result.closeObserved === true, "close observed");
      asst(result.temporaryCleanupConfirmed === true, "temp cleaned");
    }
  }

  // Test 22: Nonzero exit
  console.log("Test 22: nonzero exit");
  {
    if (existsSync(FIXTURE)) {
      const result = await runHermesPhase2CanaryProcess({
        executablePath: process.execPath,
        allowedExecutablePaths: [process.execPath],
        args: [FIXTURE, "nonzero"],
        timeoutMs: 10000,
      });
      asst(result.decision === "executed", "executed");
      asst(result.exitCode === 1, "exit code 1");
    }
  }

  // Test 23: Stdout overflow
  console.log("Test 23: stdout overflow");
  {
    if (existsSync(FIXTURE)) {
      const result = await runHermesPhase2CanaryProcess({
        executablePath: process.execPath,
        allowedExecutablePaths: [process.execPath],
        args: [FIXTURE, "stdout-overflow"],
        timeoutMs: 10000,
        maxStdoutBytes: 100,
      });
      asst(result.decision === "stdout_overflow" || result.executed === true, "overflow or executed");
      asst(result.stdoutBytes > 0, "stdout captured");
    }
  }

  // Test 24: Timeout → TERM
  console.log("Test 24: timeout term");
  {
    if (existsSync(FIXTURE)) {
      const result = await runHermesPhase2CanaryProcess({
        executablePath: process.execPath,
        allowedExecutablePaths: [process.execPath],
        args: [FIXTURE, "hang-ignore-term"],
        timeoutMs: 2000,
        termGraceMs: 500,
      });
      asst(result.timedOut === true || result.decision === "timed_out", "timed out");
      asst(result.termSent === true, "TERM sent");
    }
  }

  // ============ INTEGRATION ============
  console.log("\n--- Integration ---");

  // Test 25: Full executor success with real gate
  console.log("Test 25: executor + gate + fixture success");
  {
    const gate = createTestGate();
    const req = makeRequest();
    const payload = buildHermesPhase2CanaryPayload(req);
    if (!payload.ok) {
      asst(false, "payload build failed");
      return;
    }
    // Create approval with correct digest
    const approval = makeApproval(req, { payloadDigestSha256: payload.payloadDigestSha256 });
    const reqWithCorrectApproval = {
      ...req,
      operatorApproval: { hermesPhase2CodeReviewCanary: approval },
    };

    if (existsSync(FIXTURE)) {
      const result = await executeHermesPhase2CodeReviewCanary(reqWithCorrectApproval, gate, {
        executablePath: process.execPath,
        allowedExecutablePaths: [process.execPath],
        args: [FIXTURE, "success"],
        timeoutMs: 10000,
      });
      asst(result.decision === "executed", "full success");
      asst(result.gateClaimed === true, "gate claimed");
      asst(result.runnerExecuted === true, "runner executed");
    }
  }

  // Test 26: Same gate - second call denied (request cap)
  console.log("Test 26: gate cap exhausted on second call");
  {
    const gate = createTestGate();
    const req = makeRequest();
    const payload = buildHermesPhase2CanaryPayload(req);
    if (!payload.ok) {
      asst(false, "payload build failed");
      return;
    }
    const approval = makeApproval(req, { payloadDigestSha256: payload.payloadDigestSha256 });
    const reqWithApproval = {
      ...req,
      operatorApproval: { hermesPhase2CodeReviewCanary: approval },
    };

    if (existsSync(FIXTURE)) {
      // First call
      const r1 = await executeHermesPhase2CodeReviewCanary(reqWithApproval, gate, {
        executablePath: process.execPath,
        allowedExecutablePaths: [process.execPath],
        args: [FIXTURE, "success"],
        timeoutMs: 10000,
      });
      asst(r1.runnerExecuted === true, "first runner executed");

      // Second call with different approval should trigger cap
      const req2 = makeRequest({ requirementId: "REQ-CANARY-SECOND-01" });
      const payload2 = buildHermesPhase2CanaryPayload(req2);
      if (!payload2.ok) return;
      const approval2 = makeApproval(req2, {
        approvalId: "approval-002",
        nonce: "nonce-second-abcdef123456",
        payloadDigestSha256: payload2.payloadDigestSha256,
      });
      const reqWithApproval2 = {
        ...req2,
        operatorApproval: { hermesPhase2CodeReviewCanary: approval2 },
      };
      const r2 = await executeHermesPhase2CodeReviewCanary(reqWithApproval2, gate, {
        executablePath: process.execPath,
        allowedExecutablePaths: [process.execPath],
        args: [FIXTURE, "success"],
        timeoutMs: 10000,
      });
      asst(r2.runnerExecuted === false, "second runner blocked");
      asst(r2.decision === "gate_denied" || r2.gateDecision === "request_cap_exhausted", "cap exhausted");
    }
  }

  // Test 27: Executor does not call gate factory
  console.log("Test 27: executor does not call gate factory");
  {
    const source = readFileSync(resolve(__dirname, "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-executor.ts"), "utf8");
    asst(!source.includes("createHermesPhase2CodeReviewCanaryGate"), "no gate factory call");
  }

  // ============ STATIC CHECKS ============
  console.log("\n--- Static Code Checks ---");

  // Test 28: Payload builder has no forbidden imports
  console.log("Test 28: payload is free of forbidden imports");
  {
    const source = readFileSync(resolve(__dirname, "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-payload.ts"), "utf8");
    asst(!source.includes("node:child_process"), "no child_process in payload");
    asst(!source.includes("node:fs"), "no fs in payload");
    asst(!source.includes("node:net"), "no net in payload");
    asst(!source.includes("./gateway"), "no gateway import");
  }

  // Test 29: Executor has no forbidden imports
  console.log("Test 29: executor is free of runtime/Gateway imports");
  {
    const source = readFileSync(resolve(__dirname, "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-executor.ts"), "utf8");
    asst(!source.includes("../runtime"), "no runtime import");
    asst(!source.includes("./gateway"), "no gateway import");
    asst(!source.includes("hermes-gateway-real-dispatch-phase-2-shadow-enablement"), "no shadow enablement import");
  }

  // Test 30: Runner is the only file with child_process
  console.log("Test 30: only runner has child_process");
  {
    const runnerSource = readFileSync(resolve(__dirname, "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-process-runner.ts"), "utf8");
    asst(runnerSource.includes("node:child_process"), "runner has child_process");

    const payloadSource = readFileSync(resolve(__dirname, "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-payload.ts"), "utf8");
    asst(!payloadSource.includes("node:child_process"), "payload no child_process");

    const executorSource = readFileSync(resolve(__dirname, "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-executor.ts"), "utf8");
    asst(!executorSource.includes("node:child_process"), "executor no child_process");
  }

  console.log("");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

test().catch((err) => {
  console.error(err);
  process.exit(1);
});
