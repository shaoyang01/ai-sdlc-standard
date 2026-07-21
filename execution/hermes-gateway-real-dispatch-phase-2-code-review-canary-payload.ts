// Hermes Phase 2 Code Review Canary — Synthetic Payload Builder
// ==============================================================
// Constructs a fixed synthetic-only payload for the Phase 2 code-review canary.
// The payload contains no repository content, no real artifacts, and no secrets.
// Builder returns bounded failure decisions; no raw input is leaked.

import { createHash } from "node:crypto";
import type { ExecutionRequest } from "./types";

export type HermesPhase2CanaryPayloadDecision =
  | "payload_built"
  | "wrong_request_type"
  | "wrong_node"
  | "wrong_agent"
  | "invalid_requirement_id"
  | "invalid_input_shape"
  | "invalid_metadata_shape"
  | "invalid_operator_approval"
  | "extra_key_detected"
  | "non_plain_object_detected"
  | "circular_reference_detected"
  | "secret_content_detected"
  | "synthetic_patch_too_large"
  | "serialized_payload_too_large";

export type HermesPhase2CanaryPayload = Readonly<{
  schemaVersion: 1;
  fixtureId: "hermes-phase2-code-review-canary-v1";
  mode: "synthetic_only";
  requestType: "code_review";
  instruction: string;
  syntheticPatch: string;
}>;

export type HermesPhase2CanaryPayloadResult =
  | {
      ok: true;
      payload: HermesPhase2CanaryPayload;
      serializedPayload: string;
      payloadDigestSha256: string;
      serializedByteCount: number;
      syntheticPatchByteCount: number;
    }
  | {
      ok: false;
      decision: HermesPhase2CanaryPayloadDecision;
    };

const INSTRUCTION =
  "Review the following synthetic code patch. " +
  "Identify potential issues in correctness, style, and security. " +
  "Provide a structured review with severity classifications.";

const SYNTHETIC_PATCH = [
  "diff --git a/src/utils.ts b/src/utils.ts",
  "index 0123456..789abcd 100644",
  "--- a/src/utils.ts",
  "+++ b/src/utils.ts",
  "@@ -10,6 +10,8 @@",
  " export function parseInput(raw: string): Parsed {",
  "+  // TODO: add input validation",
  "   return { value: raw.trim() };",
  " }",
  "+",
  "+function unusedHelper(): void {}",
].join("\n");

const REQUIREMENT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

const SECRET_PATTERNS = [
  /secret/i,
  /token/i,
  /password/i,
  /api[_\s]?key/i,
  /private[_\s]?key/i,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bghp_[A-Za-z0-9]{36}\b/,
  /\bsk-[A-Za-z0-9]{32,}\b/,
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

function hasCircularReference(value: unknown, seen = new WeakSet()): boolean {
  if (value !== null && typeof value === "object") {
    if (seen.has(value as object)) return true;
    seen.add(value as object);
    if (Array.isArray(value)) {
      for (const item of value) {
        if (hasCircularReference(item, seen)) return true;
      }
    } else {
      for (const v of Object.values(value as object)) {
        if (hasCircularReference(v, seen)) return true;
      }
    }
  }
  return false;
}

function containsSecretContent(value: unknown): boolean {
  if (typeof value === "string") {
    return SECRET_PATTERNS.some((p) => p.test(value));
  }
  if (value !== null && typeof value === "object") {
    for (const v of Object.values(value as object)) {
      if (containsSecretContent(v)) return true;
    }
  }
  return false;
}

function hasAccessorOrProxy(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  // Check for Proxy
  const proto = Object.getPrototypeOf(value);
  if (proto === Proxy.prototype) return true;
  // Check for non-plain prototype
  if (proto !== null && proto !== Object.prototype && proto !== Array.prototype) return true;
  // Recursively check
  if (Array.isArray(value)) {
    return value.some((v) => hasAccessorOrProxy(v));
  }
  return Object.values(value as object).some((v) => hasAccessorOrProxy(v));
}

function exactKeyMatch(value: Record<string, unknown>, allowedKeys: Set<string>): string | null {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) return key;
  }
  return null;
}

/**
 * Build a synthetic canary payload from an ExecutionRequest.
 * Only accepts type=code_review, node=code-review, agent=hermes.
 */
export function buildHermesPhase2CanaryPayload(
  request: ExecutionRequest,
): HermesPhase2CanaryPayloadResult {
  // Validate request type
  if (request.type !== "code_review") {
    return { ok: false, decision: "wrong_request_type" };
  }
  if (request.node !== "code-review") {
    return { ok: false, decision: "wrong_node" };
  }
  if (request.agent !== "hermes") {
    return { ok: false, decision: "wrong_agent" };
  }

  // Validate requirementId
  if (typeof request.requirementId !== "string" || !REQUIREMENT_ID_RE.test(request.requirementId)) {
    return { ok: false, decision: "invalid_requirement_id" };
  }

  // Check for accessor/Proxy/non-plain
  if (hasAccessorOrProxy(request)) {
    return { ok: false, decision: "non_plain_object_detected" };
  }
  if (hasCircularReference(request)) {
    return { ok: false, decision: "circular_reference_detected" };
  }

  // Validate input
  if (!isPlainObject(request.input)) {
    return { ok: false, decision: "invalid_input_shape" };
  }
  const inputKeys = Object.keys(request.input);
  if (inputKeys.length !== 1 || inputKeys[0] !== "artifacts") {
    return { ok: false, decision: "invalid_input_shape" };
  }
  if (!Array.isArray(request.input.artifacts) || request.input.artifacts.length !== 0) {
    return { ok: false, decision: "invalid_input_shape" };
  }

  // Validate metadata (optional but must be exactly { attempt: 0 } if present)
  if (request.metadata !== undefined) {
    if (!isPlainObject(request.metadata)) {
      return { ok: false, decision: "invalid_metadata_shape" };
    }
    const metaKeys = Object.keys(request.metadata);
    if (metaKeys.length !== 1 || metaKeys[0] !== "attempt") {
      return { ok: false, decision: "invalid_metadata_shape" };
    }
    if (request.metadata.attempt !== 0) {
      return { ok: false, decision: "invalid_metadata_shape" };
    }
  }

  // Validate operatorApproval
  if (request.operatorApproval === undefined || request.operatorApproval === null) {
    return { ok: false, decision: "invalid_operator_approval" };
  }
  if (!isPlainObject(request.operatorApproval)) {
    return { ok: false, decision: "invalid_operator_approval" };
  }
  const approvalKeys = Object.keys(request.operatorApproval);
  if (approvalKeys.length !== 1 || approvalKeys[0] !== "hermesPhase2CodeReviewCanary") {
    return { ok: false, decision: "invalid_operator_approval" };
  }
  // Legacy hermesPhase2ShadowEnablement must not be present
  if ("hermesPhase2ShadowEnablement" in request.operatorApproval) {
    return { ok: false, decision: "invalid_operator_approval" };
  }

  // Check for extra keys on request (only known ExecutionRequest keys)
  const allowedRequestKeys = new Set([
    "type", "node", "agent", "requirementId", "input", "metadata",
    "skill", "skillValidation", "operatorApproval",
  ]);
  const extraKey = exactKeyMatch(request as unknown as Record<string, unknown>, allowedRequestKeys);
  if (extraKey !== null) {
    return { ok: false, decision: "extra_key_detected" };
  }

  // Check for secret content
  if (containsSecretContent(request)) {
    return { ok: false, decision: "secret_content_detected" };
  }

  // Build payload with fixed key order
  const payload: HermesPhase2CanaryPayload = {
    schemaVersion: 1,
    fixtureId: "hermes-phase2-code-review-canary-v1",
    mode: "synthetic_only",
    requestType: "code_review",
    instruction: INSTRUCTION,
    syntheticPatch: SYNTHETIC_PATCH,
  };

  // Check syntheticPatch byte size
  const syntheticPatchBytes = Buffer.byteLength(payload.syntheticPatch, "utf8");
  if (syntheticPatchBytes > 4096) {
    return { ok: false, decision: "synthetic_patch_too_large" };
  }

  // Serialize with fixed key order
  const serializedPayload = JSON.stringify(payload, [
    "schemaVersion",
    "fixtureId",
    "mode",
    "requestType",
    "instruction",
    "syntheticPatch",
  ]);
  const serializedBytes = Buffer.byteLength(serializedPayload, "utf8");
  if (serializedBytes > 8192) {
    return { ok: false, decision: "serialized_payload_too_large" };
  }

  // Compute SHA-256 digest
  const payloadDigestSha256 = createHash("sha256")
    .update(serializedPayload)
    .digest("hex");

  return {
    ok: true,
    payload,
    serializedPayload,
    payloadDigestSha256,
    serializedByteCount: serializedBytes,
    syntheticPatchByteCount: syntheticPatchBytes,
  };
}
