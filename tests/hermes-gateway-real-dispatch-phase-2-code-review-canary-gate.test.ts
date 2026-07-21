// Hermes Phase 2 Code Review Canary Gate — Tests
// ================================================
// Synthetic approval, synthetic request, injected clock/verifier.
// No Hermes flags. No external imports. No network. No file writes.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  HERMES_PHASE_2_CODE_REVIEW_CANARY_PHASE_ID,
  buildHermesPhase2CodeReviewCanaryRequestIdentity,
  createHermesPhase2CodeReviewCanaryGate,
} from "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-gate";
import type {
  HermesPhase2CodeReviewCanaryApproval,
  ExecutionRequest,
} from "../execution/types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.log(`  ✗ ${message}`);
  }
}

const SESSION_ID = "test-canary-session-001";
const NOW_MS = 1700000000000;
const ISSUED_AT = new Date(NOW_MS - 60000).toISOString();
const EXPIRES_AT = new Date(NOW_MS + 60000).toISOString();

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function makeRequest(overrides?: Partial<ExecutionRequest>): ExecutionRequest {
  return {
    type: "code_review",
    node: "code-review",
    agent: "hermes",
    requirementId: "REQ-CANARY-001",
    input: { artifacts: [] },
    ...overrides,
  };
}

function makeApproval(
  request: ExecutionRequest,
  overrides?: Partial<HermesPhase2CodeReviewCanaryApproval>,
): HermesPhase2CodeReviewCanaryApproval {
  const requestIdentity =
    buildHermesPhase2CodeReviewCanaryRequestIdentity(request);
  return {
    approvalId: "approval-001",
    operatorIdentityReference: "operator-ref-001",
    phaseId: "phase_2_code_review_canary_one",
    requestType: "code_review",
    requestIdentity,
    payloadDigestSha256: sha256("test-payload"),
    canarySessionId: SESSION_ID,
    issuedAtIso: ISSUED_AT,
    expiresAtIso: EXPIRES_AT,
    nonce: "nonce-abcdef1234567890",
    singleUse: true,
    proof: "synthetic-proof-value",
    ...overrides,
  } as HermesPhase2CodeReviewCanaryApproval;
}

function makeRequestWithApproval(
  approval: HermesPhase2CodeReviewCanaryApproval,
  requestOverrides?: Partial<ExecutionRequest>,
): ExecutionRequest {
  return makeRequest({
    ...requestOverrides,
    operatorApproval: {
      ...(requestOverrides?.operatorApproval ?? {}),
      hermesPhase2CodeReviewCanary: approval,
    },
  });
}

function createTestGate(overrides?: {
  verifyApproval?: (...args: any[]) => any;
  now?: () => number;
  maxApprovalTtlMs?: number;
}) {
  const result = createHermesPhase2CodeReviewCanaryGate({
    canarySessionId: SESSION_ID,
    verifyApproval: overrides?.verifyApproval ?? (() => true),
    now: overrides?.now ?? (() => NOW_MS),
    maxApprovalTtlMs: overrides?.maxApprovalTtlMs,
  });
  if (!result.ok) throw new Error("gate creation failed");
  return result.gate;
}

const PAYLOAD_DIGEST = sha256("test-payload");

async function test() {
  console.log("Hermes Phase 2 Code Review Canary Gate Tests");
  console.log("=============================================");

  // Test 1: valid claim
  console.log("Test 1: valid claim");
  {
    const gate = createTestGate();
    const req = makeRequest();
    const approval = makeApproval(req);
    const reqWithApproval = makeRequestWithApproval(approval);
    const result = gate.claim(reqWithApproval, PAYLOAD_DIGEST);
    assert(result.allowed === true, "allowed");
    assert(result.decision === "allow", "decision=allow");
    assert(result.claimedCount === 1, "claimedCount=1");
    assert(result.remainingCount === 0, "remainingCount=0");
  }

  // Test 2: missing structured approval
  console.log("Test 2: missing structured approval");
  {
    const gate = createTestGate();
    const req = makeRequest();
    const result = gate.claim(req, PAYLOAD_DIGEST);
    assert(result.allowed === false, "not allowed");
    assert(result.decision === "missing_approval", "decision=missing_approval");
  }

  // Test 3: legacy boolean not accepted
  console.log("Test 3: legacy boolean not accepted");
  {
    const gate = createTestGate();
    const req = makeRequest({
      operatorApproval: { hermesPhase2ShadowEnablement: true },
    });
    const result = gate.claim(req, PAYLOAD_DIGEST);
    assert(result.allowed === false, "not allowed");
    assert(result.decision === "missing_approval", "legacy boolean rejected");
  }

  // Test 4: request type not code_review
  console.log("Test 4: request type not code_review");
  {
    const gate = createTestGate();
    const req = makeRequest({ type: "validation" });
    const approval = makeApproval(req);
    const reqWithApproval = makeRequestWithApproval(approval, { type: "validation" });
    const result = gate.claim(reqWithApproval, PAYLOAD_DIGEST);
    assert(result.allowed === false, "not allowed");
    assert(result.decision === "wrong_request_type", "decision=wrong_request_type");
  }

  // Test 5: approval phase wrong
  console.log("Test 5: approval phase wrong");
  {
    const gate = createTestGate();
    const req = makeRequest();
    const approval = makeApproval(req, { phaseId: "wrong_phase" as any });
    const reqWithApproval = makeRequestWithApproval(approval);
    const result = gate.claim(reqWithApproval, PAYLOAD_DIGEST);
    assert(result.allowed === false, "not allowed");
    assert(result.decision === "wrong_phase", "decision=wrong_phase");
  }

  // Test 6: approval requestType wrong
  console.log("Test 6: approval requestType wrong");
  {
    const gate = createTestGate();
    const req = makeRequest();
    const approval = makeApproval(req, { requestType: "validation" as any });
    const reqWithApproval = makeRequestWithApproval(approval);
    const result = gate.claim(reqWithApproval, PAYLOAD_DIGEST);
    assert(result.allowed === false, "not allowed");
    assert(result.decision === "wrong_request_type", "decision=wrong_request_type");
  }

  // Test 7: session mismatch
  console.log("Test 7: session mismatch");
  {
    const gate = createTestGate();
    const req = makeRequest();
    const approval = makeApproval(req, { canarySessionId: "wrong-session" });
    const reqWithApproval = makeRequestWithApproval(approval);
    const result = gate.claim(reqWithApproval, PAYLOAD_DIGEST);
    assert(result.allowed === false, "not allowed");
    assert(result.decision === "session_mismatch", "decision=session_mismatch");
  }

  // Test 8: singleUse not true
  console.log("Test 8: singleUse not true");
  {
    const gate = createTestGate();
    const req = makeRequest();
    const approval = makeApproval(req, { singleUse: false as any });
    const reqWithApproval = makeRequestWithApproval(approval);
    const result = gate.claim(reqWithApproval, PAYLOAD_DIGEST);
    assert(result.allowed === false, "not allowed");
    assert(result.decision === "single_use_required", "decision=single_use_required");
  }

  // Test 9: empty required fields
  console.log("Test 9: empty required fields");
  {
    const gate = createTestGate();
    const req = makeRequest();
    const fields: (keyof HermesPhase2CodeReviewCanaryApproval)[] = [
      "approvalId", "operatorIdentityReference", "nonce", "proof",
    ];
    for (const field of fields) {
      const approval = makeApproval(req, { [field]: "" } as any);
      const reqWithApproval = makeRequestWithApproval(approval);
      const result = gate.claim(reqWithApproval, PAYLOAD_DIGEST);
      assert(result.allowed === false, `${field} empty rejected`);
      assert(result.decision === "invalid_approval_shape", `${field} empty → invalid_approval_shape`);
    }
  }

  // Test 10: leading/trailing whitespace
  console.log("Test 10: leading/trailing whitespace");
  {
    const gate = createTestGate();
    const req = makeRequest();
    const approval = makeApproval(req, { approvalId: " approval-001 " } as any);
    const reqWithApproval = makeRequestWithApproval(approval);
    const result = gate.claim(reqWithApproval, PAYLOAD_DIGEST);
    assert(result.allowed === false, "whitespace rejected");
    assert(result.decision === "invalid_approval_shape", "whitespace → invalid_approval_shape");
  }

  // Test 11: bounded field overlength
  console.log("Test 11: bounded field overlength");
  {
    const gate = createTestGate();
    const req = makeRequest();
    const approvalId = makeApproval(req, { approvalId: "x".repeat(129) });
    let r = gate.claim(makeRequestWithApproval(approvalId), PAYLOAD_DIGEST);
    assert(r.decision === "invalid_approval_shape", "approvalId overlength");

    const opRef = makeApproval(req, { operatorIdentityReference: "x".repeat(257) });
    r = createTestGate().claim(makeRequestWithApproval(opRef), PAYLOAD_DIGEST);
    assert(r.decision === "invalid_approval_shape", "operatorIdentityReference overlength");

    const nonce = makeApproval(req, { nonce: "x".repeat(257) });
    r = createTestGate().claim(makeRequestWithApproval(nonce), PAYLOAD_DIGEST);
    assert(r.decision === "invalid_approval_shape", "nonce overlength");

    const proof = makeApproval(req, { proof: "x".repeat(4097) });
    r = createTestGate().claim(makeRequestWithApproval(proof), PAYLOAD_DIGEST);
    assert(r.decision === "invalid_approval_shape", "proof overlength");
  }

  // Test 12: requestIdentity not 64-char lowercase hex
  console.log("Test 12: requestIdentity invalid format");
  {
    const gate = createTestGate();
    const req = makeRequest();
    const approval = makeApproval(req, { requestIdentity: "ABCDEF" });
    const result = gate.claim(makeRequestWithApproval(approval), PAYLOAD_DIGEST);
    assert(result.decision === "invalid_approval_shape", "requestIdentity invalid");
  }

  // Test 13: payload digest not 64-char lowercase hex
  console.log("Test 13: payload digest invalid format");
  {
    const gate = createTestGate();
    const req = makeRequest();
    const approval = makeApproval(req, { payloadDigestSha256: "xyz" });
    const result = gate.claim(makeRequestWithApproval(approval), PAYLOAD_DIGEST);
    assert(result.decision === "invalid_approval_shape", "payloadDigest invalid");
  }

  // Test 14: invalid ISO
  console.log("Test 14: invalid ISO");
  {
    const gate = createTestGate();
    const req = makeRequest();
    const approval = makeApproval(req, { issuedAtIso: "not-a-date" });
    const result = gate.claim(makeRequestWithApproval(approval), PAYLOAD_DIGEST);
    assert(result.decision === "invalid_approval_shape", "invalid ISO rejected");
  }

  // Test 15: non-canonical ISO
  console.log("Test 15: non-canonical ISO");
  {
    const gate = createTestGate();
    const req = makeRequest();
    // +00:00 offset format is not canonical (toISOString uses Z)
    const approval = makeApproval(req, { issuedAtIso: "2023-11-14T22:13:20.000+00:00" });
    const result = gate.claim(makeRequestWithApproval(approval), PAYLOAD_DIGEST);
    assert(result.decision === "invalid_approval_shape", "non-canonical ISO rejected");
  }

  // Test 16: not-yet-valid
  console.log("Test 16: not-yet-valid");
  {
    const gate = createTestGate({ now: () => NOW_MS });
    const req = makeRequest();
    const futureIssued = new Date(NOW_MS + 120000).toISOString();
    const futureExpires = new Date(NOW_MS + 180000).toISOString();
    const approval = makeApproval(req, { issuedAtIso: futureIssued, expiresAtIso: futureExpires });
    const result = gate.claim(makeRequestWithApproval(approval), PAYLOAD_DIGEST);
    assert(result.decision === "approval_not_yet_valid", "not-yet-valid");
  }

  // Test 17: expired
  console.log("Test 17: expired");
  {
    const gate = createTestGate({ now: () => NOW_MS });
    const req = makeRequest();
    const pastIssued = new Date(NOW_MS - 120000).toISOString();
    const pastExpires = new Date(NOW_MS - 60000).toISOString();
    const approval = makeApproval(req, { issuedAtIso: pastIssued, expiresAtIso: pastExpires });
    const result = gate.claim(makeRequestWithApproval(approval), PAYLOAD_DIGEST);
    assert(result.decision === "approval_expired", "expired");
  }

  // Test 18: TTL exceeded
  console.log("Test 18: TTL exceeded");
  {
    const gate = createTestGate({ now: () => NOW_MS });
    const req = makeRequest();
    const longIssued = new Date(NOW_MS - 1000000).toISOString();
    const longExpires = new Date(NOW_MS + 1000000).toISOString();
    const approval = makeApproval(req, { issuedAtIso: longIssued, expiresAtIso: longExpires });
    const result = gate.claim(makeRequestWithApproval(approval), PAYLOAD_DIGEST);
    assert(result.decision === "approval_ttl_exceeded", "TTL exceeded");
  }

  // Test 19: request identity mismatch
  console.log("Test 19: request identity mismatch");
  {
    const gate = createTestGate();
    const req = makeRequest();
    const wrongIdentity = sha256("different-request");
    const approval = makeApproval(req, { requestIdentity: wrongIdentity });
    const result = gate.claim(makeRequestWithApproval(approval), PAYLOAD_DIGEST);
    assert(result.decision === "request_identity_mismatch", "request identity mismatch");
  }

  // Test 20: payload digest mismatch
  console.log("Test 20: payload digest mismatch");
  {
    const gate = createTestGate();
    const req = makeRequest();
    const approval = makeApproval(req);
    const result = gate.claim(makeRequestWithApproval(approval), sha256("wrong-payload"));
    assert(result.decision === "payload_digest_mismatch", "payload digest mismatch");
  }

  // Test 21: verifier returns false
  console.log("Test 21: verifier returns false");
  {
    const gate = createTestGate({ verifyApproval: () => false });
    const req = makeRequest();
    const approval = makeApproval(req);
    const result = gate.claim(makeRequestWithApproval(approval), PAYLOAD_DIGEST);
    assert(result.decision === "approval_verification_failed", "verifier false");
  }

  // Test 22: verifier throws
  console.log("Test 22: verifier throws");
  {
    const gate = createTestGate({ verifyApproval: () => { throw new Error("boom"); } });
    const req = makeRequest();
    const approval = makeApproval(req);
    const result = gate.claim(makeRequestWithApproval(approval), PAYLOAD_DIGEST);
    assert(result.decision === "approval_verification_failed", "verifier throw");
  }

  // Test 23: verifier returns Promise/thenable
  console.log("Test 23: verifier returns Promise/thenable");
  {
    const gate = createTestGate({ verifyApproval: () => Promise.resolve(true) as any });
    const req = makeRequest();
    const approval = makeApproval(req);
    const result = gate.claim(makeRequestWithApproval(approval), PAYLOAD_DIGEST);
    assert(result.decision === "approval_verification_failed", "verifier promise rejected");
  }

  // Test 24: clock throws
  console.log("Test 24: clock throws");
  {
    const gate = createTestGate({ now: () => { throw new Error("clock fail"); } });
    const req = makeRequest();
    const approval = makeApproval(req);
    const result = gate.claim(makeRequestWithApproval(approval), PAYLOAD_DIGEST);
    assert(result.decision === "clock_failure", "clock throw");
  }

  // Test 25: clock returns invalid value
  console.log("Test 25: clock returns invalid value");
  {
    const gate = createTestGate({ now: () => -1 });
    const req = makeRequest();
    const approval = makeApproval(req);
    const result = gate.claim(makeRequestWithApproval(approval), PAYLOAD_DIGEST);
    assert(result.decision === "clock_failure", "clock negative");

    const gate2 = createTestGate({ now: () => NaN });
    const result2 = gate2.claim(makeRequestWithApproval(makeApproval(req)), PAYLOAD_DIGEST);
    assert(result2.decision === "clock_failure", "clock NaN");

    const gate3 = createTestGate({ now: () => 1.5 });
    const result3 = gate3.claim(makeRequestWithApproval(makeApproval(req)), PAYLOAD_DIGEST);
    assert(result3.decision === "clock_failure", "clock non-integer");
  }

  // Test 26: approval replay
  console.log("Test 26: approval replay");
  {
    const gate = createTestGate();
    const req = makeRequest();
    const approval = makeApproval(req);
    const reqWithApproval = makeRequestWithApproval(approval);
    gate.claim(reqWithApproval, PAYLOAD_DIGEST);
    const result = gate.claim(reqWithApproval, PAYLOAD_DIGEST);
    assert(result.decision === "approval_replayed", "same approval replayed");
  }

  // Test 27: nonce replay
  console.log("Test 27: nonce replay");
  {
    const gate = createTestGate();
    const req = makeRequest();
    const approval1 = makeApproval(req, { approvalId: "approval-A" });
    gate.claim(makeRequestWithApproval(approval1), PAYLOAD_DIGEST);
    // Different approvalId but same nonce
    const approval2 = makeApproval(req, { approvalId: "approval-B" });
    const result = gate.claim(makeRequestWithApproval(approval2), PAYLOAD_DIGEST);
    assert(result.decision === "nonce_replayed", "same nonce different approval");
  }

  // Test 28: second different approval rejected by request cap
  console.log("Test 28: second approval rejected by cap");
  {
    const gate = createTestGate();
    const req = makeRequest();
    const approval1 = makeApproval(req, { approvalId: "first", nonce: "nonce-first-1234567890" });
    const r1 = gate.claim(makeRequestWithApproval(approval1), PAYLOAD_DIGEST);
    assert(r1.allowed === true, "first allowed");

    const approval2 = makeApproval(req, { approvalId: "second", nonce: "nonce-second-123456789" });
    const r2 = gate.claim(makeRequestWithApproval(approval2), PAYLOAD_DIGEST);
    assert(r2.allowed === false, "second not allowed");
    assert(r2.decision === "request_cap_exhausted", "cap exhausted");
  }

  // Test 29: two consecutive synchronous claims, only first allowed
  console.log("Test 29: consecutive claims");
  {
    const gate = createTestGate();
    const req = makeRequest();
    const approval = makeApproval(req);
    const reqWithApproval = makeRequestWithApproval(approval);
    const r1 = gate.claim(reqWithApproval, PAYLOAD_DIGEST);
    const r2 = gate.claim(reqWithApproval, PAYLOAD_DIGEST);
    assert(r1.allowed === true, "first claim allowed");
    assert(r2.allowed === false, "second claim denied");
    assert(r1.claimedCount === 1, "first claimedCount=1");
    assert(r2.claimedCount === 1, "second claimedCount still 1");
  }

  // Test 30: claim result does not expose sensitive fields
  console.log("Test 30: no sensitive fields in result");
  {
    const gate = createTestGate();
    const req = makeRequest();
    const approval = makeApproval(req);
    const result = gate.claim(makeRequestWithApproval(approval), PAYLOAD_DIGEST);
    const keys = Object.keys(result);
    assert(keys.length === 4, "exactly 4 fields");
    assert("allowed" in result, "has allowed");
    assert("decision" in result, "has decision");
    assert("claimedCount" in result, "has claimedCount");
    assert("remainingCount" in result, "has remainingCount");
    assert(!("approvalId" in result), "no approvalId");
    assert(!("proof" in result), "no proof");
    assert(!("nonce" in result), "no nonce");
    assert(!("requestIdentity" in result), "no requestIdentity");
  }

  // Test 31: factory invalid configuration
  console.log("Test 31: factory invalid configuration");
  {
    const r1 = createHermesPhase2CodeReviewCanaryGate({
      canarySessionId: "",
      verifyApproval: () => true,
      now: () => NOW_MS,
    });
    assert(r1.ok === false, "empty session rejected");
    if (r1.ok === false) assert(r1.decision === "invalid_gate_configuration", "bounded failure");

    const r2 = createHermesPhase2CodeReviewCanaryGate({
      canarySessionId: SESSION_ID,
      verifyApproval: () => true,
      now: () => NOW_MS,
      maxApprovalTtlMs: 0,
    });
    assert(r2.ok === false, "ttl=0 rejected");

    const r3 = createHermesPhase2CodeReviewCanaryGate({
      canarySessionId: SESSION_ID,
      verifyApproval: () => true,
      now: () => NOW_MS,
      maxApprovalTtlMs: 900001,
    });
    assert(r3.ok === false, "ttl>900000 rejected");
  }

  // Test 32: maxApprovalTtlMs default value
  console.log("Test 32: default maxApprovalTtlMs");
  {
    const gate = createTestGate();
    const req = makeRequest();
    // TTL of exactly 900000ms should pass with default
    const issued = new Date(NOW_MS - 899000).toISOString();
    const expires = new Date(NOW_MS + 1000).toISOString();
    const approval = makeApproval(req, { issuedAtIso: issued, expiresAtIso: expires });
    const result = gate.claim(makeRequestWithApproval(approval), PAYLOAD_DIGEST);
    assert(result.allowed === true, "default TTL allows 900000ms");
  }

  // Test 33: maxApprovalTtlMs boundary
  console.log("Test 33: maxApprovalTtlMs boundary");
  {
    const r = createHermesPhase2CodeReviewCanaryGate({
      canarySessionId: SESSION_ID,
      verifyApproval: () => true,
      now: () => NOW_MS,
      maxApprovalTtlMs: 1,
    });
    assert(r.ok === true, "ttl=1 accepted");

    const r2 = createHermesPhase2CodeReviewCanaryGate({
      canarySessionId: SESSION_ID,
      verifyApproval: () => true,
      now: () => NOW_MS,
      maxApprovalTtlMs: 900000,
    });
    assert(r2.ok === true, "ttl=900000 accepted");
  }

  // Test 34: new gate does not inherit old gate consumed state
  console.log("Test 34: gate isolation");
  {
    const gate1 = createTestGate();
    const req = makeRequest();
    const approval = makeApproval(req);
    gate1.claim(makeRequestWithApproval(approval), PAYLOAD_DIGEST);

    // New gate with same session
    const gate2 = createTestGate();
    const result = gate2.claim(makeRequestWithApproval(approval), PAYLOAD_DIGEST);
    assert(result.allowed === true, "new gate allows same approval");
  }

  // Test 35: old approval cross-session rejected
  console.log("Test 35: cross-session rejection");
  {
    const gate = createHermesPhase2CodeReviewCanaryGate({
      canarySessionId: "new-session-id",
      verifyApproval: () => true,
      now: () => NOW_MS,
    });
    if (!gate.ok) throw new Error("gate creation failed");
    const req = makeRequest();
    const approval = makeApproval(req, { canarySessionId: SESSION_ID });
    const result = gate.gate.claim(makeRequestWithApproval(approval), PAYLOAD_DIGEST);
    assert(result.decision === "session_mismatch", "cross-session rejected");
  }

  // Test 36: no module-global mutable consumed store
  console.log("Test 36: no module-global state");
  {
    const sourcePath = resolve(
      __dirname,
      "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-gate.ts",
    );
    const source = readFileSync(sourcePath, "utf8");
    assert(!source.includes("export let"), "no exported let");
    assert(!source.includes("export var"), "no exported var");
    // Consumed sets are inside factory closure
    assert(source.includes("const consumedApprovalIds = new Set"), "consumed in closure");
    assert(source.includes("const consumedNonces = new Set"), "nonces in closure");
  }

  // Test 37: no forbidden imports
  console.log("Test 37: no forbidden imports");
  {
    const sourcePath = resolve(
      __dirname,
      "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-gate.ts",
    );
    const source = readFileSync(sourcePath, "utf8");
    assert(!source.includes("./gateway"), "no gateway import");
    assert(!source.includes("../runtime"), "no runtime import");
    assert(!source.includes("hermes-cli-command-executor"), "no CLI executor import");
    assert(!source.includes("child_process"), "no child_process");
    assert(!source.includes("node:fs"), "no fs import");
  }

  // Test 38: no process spawn
  console.log("Test 38: no spawn");
  {
    const sourcePath = resolve(
      __dirname,
      "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-gate.ts",
    );
    const source = readFileSync(sourcePath, "utf8");
    assert(!source.includes("spawn"), "no spawn");
    assert(!source.includes("exec("), "no exec");
  }

  // Test 39: no network access
  console.log("Test 39: no network");
  {
    const sourcePath = resolve(
      __dirname,
      "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-gate.ts",
    );
    const source = readFileSync(sourcePath, "utf8");
    assert(!source.includes("fetch("), "no fetch");
    assert(!source.includes("http.request"), "no http");
    assert(!source.includes("https.request"), "no https");
  }

  // Test 40: no file writes
  console.log("Test 40: no file writes");
  {
    const sourcePath = resolve(
      __dirname,
      "../execution/hermes-gateway-real-dispatch-phase-2-code-review-canary-gate.ts",
    );
    const source = readFileSync(sourcePath, "utf8");
    assert(!source.includes("writeFile"), "no writeFile");
    assert(!source.includes("createWriteStream"), "no createWriteStream");
    assert(!source.includes("appendFile"), "no appendFile");
  }

  // Summary
  console.log("");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

test().catch((err) => {
  console.error(err);
  process.exit(1);
});
