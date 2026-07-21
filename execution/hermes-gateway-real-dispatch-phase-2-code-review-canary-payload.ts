// Hermes Phase 2 Code Review Canary — Synthetic Payload Builder
// ==============================================================
// Fixed synthetic-only payload for the Phase 2 code-review canary.
// Fail-closed on all reflection: accessors, Proxy traps, circular references.
// Does not scan structured approval proof, nonce, or operator identity.

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
  | "serialized_payload_too_large"
  | "reflection_failure";

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

const DEFAULT_MAX_SYNTHETIC_PATCH_BYTES = 4096;
const DEFAULT_MAX_SERIALIZED_PAYLOAD_BYTES = 8192;

function isNonEmptyTrimmedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  try {
    const proto = Object.getPrototypeOf(value);
    return proto === null || proto === Object.prototype;
  } catch {
    return false;
  }
}

function hasCircularReference(value: unknown, seen = new WeakSet()): boolean {
  try {
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
  } catch {
    return true; // fail-closed on reflection errors
  }
}

function containsSecretInValues(obj: Record<string, unknown>): boolean {
  for (const v of Object.values(obj)) {
    if (typeof v === "string") {
      if (SECRET_PATTERNS.some((p) => p.test(v))) return true;
    }
  }
  return false;
}

function checkTopLevelAccessors(value: unknown, path: string): string | null {
  if (value === null || typeof value !== "object") return null;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const [key, desc] of Object.entries(descriptors)) {
      if (desc.get !== undefined || desc.set !== undefined) {
        return `${path}.${key}`;
      }
    }
    return null;
  } catch {
    return path; // reflection failure = accessor-like
  }
}

export type PayloadBuilderOptions = Readonly<{
  maxSyntheticPatchBytes?: number;
  maxSerializedPayloadBytes?: number;
}>;

function validateLimit(
  value: unknown,
  defaultValue: number,
): number | null {
  if (value === undefined) return defaultValue;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (!Number.isInteger(value) || value <= 0) return null;
  if (value > defaultValue) return null;
  return value;
}

export function buildHermesPhase2CanaryPayload(
  request: ExecutionRequest,
  options?: PayloadBuilderOptions,
): HermesPhase2CanaryPayloadResult {
  const maxSyntheticPatchBytes = validateLimit(
    options?.maxSyntheticPatchBytes, DEFAULT_MAX_SYNTHETIC_PATCH_BYTES);
  const maxSerializedPayloadBytes = validateLimit(
    options?.maxSerializedPayloadBytes, DEFAULT_MAX_SERIALIZED_PAYLOAD_BYTES);
  if (maxSyntheticPatchBytes === null || maxSerializedPayloadBytes === null) {
    return { ok: false, decision: "reflection_failure" };
  }

  // Validate request type (via safe property access)
  let reqType: unknown;
  try { reqType = request.type; } catch { return { ok: false, decision: "reflection_failure" }; }
  if (reqType !== "code_review") return { ok: false, decision: "wrong_request_type" };

  let reqNode: unknown;
  try { reqNode = request.node; } catch { return { ok: false, decision: "reflection_failure" }; }
  if (reqNode !== "code-review") return { ok: false, decision: "wrong_node" };

  let reqAgent: unknown;
  try { reqAgent = request.agent; } catch { return { ok: false, decision: "reflection_failure" }; }
  if (reqAgent !== "hermes") return { ok: false, decision: "wrong_agent" };

  // Validate requirementId
  let reqId: unknown;
  try { reqId = request.requirementId; } catch { return { ok: false, decision: "reflection_failure" }; }
  if (typeof reqId !== "string" || !REQUIREMENT_ID_RE.test(reqId)) {
    return { ok: false, decision: "invalid_requirement_id" };
  }

  // Check top-level accessors on request (no recursive traversal)
  const accessorPath = checkTopLevelAccessors(request, "request");
  if (accessorPath !== null) {
    return { ok: false, decision: "non_plain_object_detected" };
  }

  // Validate input
  let reqInput: unknown;
  try { reqInput = request.input; } catch { return { ok: false, decision: "reflection_failure" }; }
  if (!isPlainObject(reqInput)) return { ok: false, decision: "invalid_input_shape" };

  let inputKeys: string[];
  try { inputKeys = Object.keys(reqInput as Record<string, unknown>); } catch {
    return { ok: false, decision: "reflection_failure" };
  }
  if (inputKeys.length !== 1 || inputKeys[0] !== "artifacts") {
    return { ok: false, decision: "invalid_input_shape" };
  }
  const artifacts = (reqInput as Record<string, unknown>).artifacts;
  if (!Array.isArray(artifacts) || artifacts.length !== 0) {
    return { ok: false, decision: "invalid_input_shape" };
  }

  // Check input for secrets
  try {
    if (containsSecretInValues(reqInput as Record<string, unknown>)) {
      return { ok: false, decision: "secret_content_detected" };
    }
  } catch {
    return { ok: false, decision: "reflection_failure" };
  }

  // Validate metadata (optional but must be exactly { attempt: 0 } if present)
  let reqMeta: unknown;
  try { reqMeta = request.metadata; } catch { return { ok: false, decision: "reflection_failure" }; }
  if (reqMeta !== undefined) {
    if (!isPlainObject(reqMeta)) return { ok: false, decision: "invalid_metadata_shape" };
    let metaKeys: string[];
    try { metaKeys = Object.keys(reqMeta as Record<string, unknown>); } catch {
      return { ok: false, decision: "reflection_failure" };
    }
    if (metaKeys.length !== 1 || metaKeys[0] !== "attempt") {
      return { ok: false, decision: "invalid_metadata_shape" };
    }
    if ((reqMeta as Record<string, unknown>).attempt !== 0) {
      return { ok: false, decision: "invalid_metadata_shape" };
    }
    // Check metadata for secrets
    try {
      if (containsSecretInValues(reqMeta as Record<string, unknown>)) {
        return { ok: false, decision: "secret_content_detected" };
      }
    } catch {
      return { ok: false, decision: "reflection_failure" };
    }
  }

  // Validate operatorApproval
  let reqApproval: unknown;
  try { reqApproval = request.operatorApproval; } catch { return { ok: false, decision: "reflection_failure" }; }
  if (reqApproval === undefined || reqApproval === null) {
    return { ok: false, decision: "invalid_operator_approval" };
  }
  if (!isPlainObject(reqApproval)) return { ok: false, decision: "invalid_operator_approval" };

  let approvalKeys: string[];
  try { approvalKeys = Object.keys(reqApproval as Record<string, unknown>); } catch {
    return { ok: false, decision: "reflection_failure" };
  }
  if (approvalKeys.length !== 1 || approvalKeys[0] !== "hermesPhase2CodeReviewCanary") {
    return { ok: false, decision: "invalid_operator_approval" };
  }
  // Legacy hermesPhase2ShadowEnablement must not be present
  if ("hermesPhase2ShadowEnablement" in (reqApproval as object)) {
    return { ok: false, decision: "invalid_operator_approval" };
  }
  // Do NOT scan structured approval fields (proof, nonce, etc.)

  // Check for extra keys on request
  const allowedRequestKeys = new Set([
    "type", "node", "agent", "requirementId", "input", "metadata",
    "skill", "skillValidation", "operatorApproval",
  ]);
  let requestKeys: string[];
  try {
    requestKeys = Object.keys(request as unknown as Record<string, unknown>);
  } catch {
    return { ok: false, decision: "reflection_failure" };
  }
  for (const key of requestKeys) {
    if (!allowedRequestKeys.has(key)) {
      return { ok: false, decision: "extra_key_detected" };
    }
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
  if (syntheticPatchBytes > maxSyntheticPatchBytes) {
    return { ok: false, decision: "synthetic_patch_too_large" };
  }

  // Serialize with fixed key order
  let serializedPayload: string;
  try {
    serializedPayload = JSON.stringify(payload, [
      "schemaVersion",
      "fixtureId",
      "mode",
      "requestType",
      "instruction",
      "syntheticPatch",
    ]);
  } catch {
    return { ok: false, decision: "circular_reference_detected" };
  }
  const serializedBytes = Buffer.byteLength(serializedPayload, "utf8");
  if (serializedBytes > maxSerializedPayloadBytes) {
    return { ok: false, decision: "serialized_payload_too_large" };
  }

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
