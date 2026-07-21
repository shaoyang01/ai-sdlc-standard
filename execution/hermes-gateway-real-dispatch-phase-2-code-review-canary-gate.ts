// Hermes Gateway Real Dispatch Phase 2 Code Review Canary Gate
// =============================================================
// Structured approval contract, synchronous verifier, in-memory one-shot gate.
// No file I/O, no database, no network, no persistence.
// No Gateway wiring, no CLI, no provider.

import { createHash } from "node:crypto";
import type {
  ExecutionRequest,
  HermesPhase2CodeReviewCanaryApproval,
} from "./types";

export const HERMES_PHASE_2_CODE_REVIEW_CANARY_PHASE_ID =
  "phase_2_code_review_canary_one" as const;

export type HermesPhase2CodeReviewCanaryGateDecision =
  | "allow"
  | "missing_approval"
  | "wrong_phase"
  | "wrong_request_type"
  | "session_mismatch"
  | "single_use_required"
  | "invalid_approval_shape"
  | "approval_not_yet_valid"
  | "approval_expired"
  | "approval_ttl_exceeded"
  | "request_identity_mismatch"
  | "payload_digest_mismatch"
  | "approval_verification_failed"
  | "approval_replayed"
  | "nonce_replayed"
  | "request_cap_exhausted"
  | "invalid_gate_configuration"
  | "clock_failure";

export type HermesPhase2CodeReviewCanaryClaimResult = Readonly<{
  allowed: boolean;
  decision: HermesPhase2CodeReviewCanaryGateDecision;
  claimedCount: number;
  remainingCount: number;
}>;

/**
 * Verifier contract — the verifier is the sole authority for proof validation.
 *
 * It MUST be:
 * - synchronous (must return immediately; no Promise, no thenable);
 * - pure (deterministic for the same input);
 * - side-effect-free (must not update approval, session, replay, nonce, or quota state);
 * - non-consuming (the gate performs atomic consume after successful verification);
 * - file-system-free (no file reads or writes);
 * - database-free (no SQLite, no external storage);
 * - network-free (no HTTP, no sockets, no IPC).
 *
 * The verifier MUST NOT:
 * - execute billing, audit persistence, or external attempt records;
 * - modify approval fields, proof, session ID, or timestamps.
 *
 * The verifier's sole responsibility is:
 * - validate the proof against the input binding (expectedRequestIdentity,
 *   expectedPayloadDigestSha256, canarySessionId, nowEpochMs).
 *
 * Returns:
 * - true: proof is valid for this input binding;
 * - false: proof is invalid for this input binding;
 *
 * Fail-closed behavior is enforced by the gate:
 * - false → approval_verification_failed;
 * - throw → approval_verification_failed;
 * - Promise or thenable return → approval_verification_failed.
 */
export type HermesPhase2CodeReviewCanaryApprovalVerifier = (input: Readonly<{
  approval: HermesPhase2CodeReviewCanaryApproval;
  expectedRequestIdentity: string;
  expectedPayloadDigestSha256: string;
  canarySessionId: string;
  nowEpochMs: number;
}>) => boolean;

export type HermesPhase2CodeReviewCanaryGate = Readonly<{
  claim(
    request: ExecutionRequest,
    expectedPayloadDigestSha256: string,
  ): HermesPhase2CodeReviewCanaryClaimResult;
}>;

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const MAX_REAL_REQUESTS = 1;
const DEFAULT_MAX_APPROVAL_TTL_MS = 900000;
const MIN_MAX_APPROVAL_TTL_MS = 1;
const MAX_MAX_APPROVAL_TTL_MS = 900000;

export function buildHermesPhase2CodeReviewCanaryRequestIdentity(
  request: ExecutionRequest,
): string {
  const canonical = JSON.stringify([
    request.requirementId,
    request.type,
    request.node,
    request.agent,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

function isNonEmptyTrimmedString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.trim()
  );
}

function isValidIsoUtc(value: string): boolean {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString() === value;
}

function deny(
  decision: HermesPhase2CodeReviewCanaryGateDecision,
  claimedCount: number,
): HermesPhase2CodeReviewCanaryClaimResult {
  return {
    allowed: false,
    decision,
    claimedCount,
    remainingCount: MAX_REAL_REQUESTS - claimedCount,
  };
}

export function createHermesPhase2CodeReviewCanaryGate(config: Readonly<{
  canarySessionId: string;
  verifyApproval: HermesPhase2CodeReviewCanaryApprovalVerifier;
  now: () => number;
  maxApprovalTtlMs?: number;
}>):
  | { ok: true; gate: HermesPhase2CodeReviewCanaryGate }
  | { ok: false; decision: "invalid_gate_configuration" } {
  const { canarySessionId, verifyApproval, now } = config;
  const maxApprovalTtlMs =
    config.maxApprovalTtlMs ?? DEFAULT_MAX_APPROVAL_TTL_MS;

  // Validate configuration
  if (!isNonEmptyTrimmedString(canarySessionId)) {
    return { ok: false, decision: "invalid_gate_configuration" };
  }
  if (canarySessionId.length > 128) {
    return { ok: false, decision: "invalid_gate_configuration" };
  }
  if (typeof verifyApproval !== "function") {
    return { ok: false, decision: "invalid_gate_configuration" };
  }
  if (typeof now !== "function") {
    return { ok: false, decision: "invalid_gate_configuration" };
  }
  if (
    typeof maxApprovalTtlMs !== "number" ||
    !Number.isFinite(maxApprovalTtlMs) ||
    maxApprovalTtlMs < MIN_MAX_APPROVAL_TTL_MS ||
    maxApprovalTtlMs > MAX_MAX_APPROVAL_TTL_MS
  ) {
    return { ok: false, decision: "invalid_gate_configuration" };
  }

  // Gate-local mutable state (encapsulated in closure)
  const consumedApprovalIds = new Set<string>();
  const consumedNonces = new Set<string>();
  let claimedCount = 0;

  const gate: HermesPhase2CodeReviewCanaryGate = {
    claim(
      request: ExecutionRequest,
      expectedPayloadDigestSha256: string,
    ): HermesPhase2CodeReviewCanaryClaimResult {
      // Step 1: request.type must be code_review
      if (request.type !== "code_review") {
        return deny("wrong_request_type", claimedCount);
      }

      // Step 2: structured approval must exist
      const approval = request.operatorApproval?.hermesPhase2CodeReviewCanary;
      if (approval === undefined || approval === null) {
        return deny("missing_approval", claimedCount);
      }

      // Step 3: field shape, length, digest format validation
      if (
        !isNonEmptyTrimmedString(approval.approvalId) ||
        approval.approvalId.length > 128 ||
        !isNonEmptyTrimmedString(approval.operatorIdentityReference) ||
        approval.operatorIdentityReference.length > 256 ||
        !isNonEmptyTrimmedString(approval.canarySessionId) ||
        approval.canarySessionId.length > 128 ||
        !isNonEmptyTrimmedString(approval.nonce) ||
        approval.nonce.length < 16 ||
        approval.nonce.length > 256 ||
        !isNonEmptyTrimmedString(approval.proof) ||
        approval.proof.length > 4096 ||
        !isNonEmptyTrimmedString(approval.requestIdentity) ||
        !SHA256_HEX_RE.test(approval.requestIdentity) ||
        !isNonEmptyTrimmedString(approval.payloadDigestSha256) ||
        !SHA256_HEX_RE.test(approval.payloadDigestSha256) ||
        !isNonEmptyTrimmedString(approval.issuedAtIso) ||
        !isNonEmptyTrimmedString(approval.expiresAtIso)
      ) {
        return deny("invalid_approval_shape", claimedCount);
      }

      // Step 4: phaseId must match
      if (approval.phaseId !== HERMES_PHASE_2_CODE_REVIEW_CANARY_PHASE_ID) {
        return deny("wrong_phase", claimedCount);
      }

      // Step 5: requestType must be code_review
      if (approval.requestType !== "code_review") {
        return deny("wrong_request_type", claimedCount);
      }

      // Step 6: canarySessionId must match gate session
      if (approval.canarySessionId !== canarySessionId) {
        return deny("session_mismatch", claimedCount);
      }

      // Step 7: singleUse must be strictly true
      if (approval.singleUse !== true) {
        return deny("single_use_required", claimedCount);
      }

      // Step 8: clock must succeed
      let nowMs: number;
      try {
        nowMs = now();
      } catch {
        return deny("clock_failure", claimedCount);
      }
      if (
        typeof nowMs !== "number" ||
        !Number.isFinite(nowMs) ||
        nowMs < 0 ||
        !Number.isInteger(nowMs)
      ) {
        return deny("clock_failure", claimedCount);
      }

      // Step 9: time rules
      const issuedAt = new Date(approval.issuedAtIso).getTime();
      const expiresAt = new Date(approval.expiresAtIso).getTime();

      if (!isValidIsoUtc(approval.issuedAtIso) || !isValidIsoUtc(approval.expiresAtIso)) {
        return deny("invalid_approval_shape", claimedCount);
      }

      if (nowMs < issuedAt) {
        return deny("approval_not_yet_valid", claimedCount);
      }
      if (nowMs >= expiresAt) {
        return deny("approval_expired", claimedCount);
      }
      const ttl = expiresAt - issuedAt;
      if (ttl <= 0 || ttl > maxApprovalTtlMs) {
        return deny("approval_ttl_exceeded", claimedCount);
      }

      // Step 10: requestIdentity must match canonical request digest
      const expectedRequestIdentity =
        buildHermesPhase2CodeReviewCanaryRequestIdentity(request);
      if (approval.requestIdentity !== expectedRequestIdentity) {
        return deny("request_identity_mismatch", claimedCount);
      }

      // Step 11: payloadDigestSha256 must match expected
      if (approval.payloadDigestSha256 !== expectedPayloadDigestSha256) {
        return deny("payload_digest_mismatch", claimedCount);
      }

      // Step 12: approvalId must not be consumed (replay check before verifier)
      if (consumedApprovalIds.has(approval.approvalId)) {
        return deny("approval_replayed", claimedCount);
      }

      // Step 13: nonce must not be consumed (nonce replay before verifier)
      if (consumedNonces.has(approval.nonce)) {
        return deny("nonce_replayed", claimedCount);
      }

      // Step 14: request cap must not be exhausted (quota check before verifier)
      if (claimedCount >= MAX_REAL_REQUESTS) {
        return deny("request_cap_exhausted", claimedCount);
      }

      // Step 15: verifier must synchronously return true
      let verifierResult: unknown;
      try {
        verifierResult = verifyApproval({
          approval,
          expectedRequestIdentity,
          expectedPayloadDigestSha256,
          canarySessionId,
          nowEpochMs: nowMs,
        });
      } catch {
        return deny("approval_verification_failed", claimedCount);
      }
      // Reject Promise/thenable
      if (
        verifierResult !== null &&
        verifierResult !== undefined &&
        typeof verifierResult === "object" &&
        typeof (verifierResult as any).then === "function"
      ) {
        return deny("approval_verification_failed", claimedCount);
      }
      if (verifierResult !== true) {
        return deny("approval_verification_failed", claimedCount);
      }

      // Step 16: atomically consume and return allow
      consumedApprovalIds.add(approval.approvalId);
      consumedNonces.add(approval.nonce);
      claimedCount += 1;

      return {
        allowed: true,
        decision: "allow",
        claimedCount,
        remainingCount: MAX_REAL_REQUESTS - claimedCount,
      };
    },
  };

  return { ok: true, gate };
}
