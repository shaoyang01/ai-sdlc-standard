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

// Note: tsconfig has strict:false, so discriminated-union narrowing is
// unavailable; this uses a flat shape with explicit reason instead.
type DescriptorScan = {
  ok: boolean;
  keys: string[];
  values: Record<string, unknown>;
  reason: "not_object" | "not_plain" | "accessor" | "reflection" | null;
};

// Fail-closed own-property scan. Every reflection call is try/catch wrapped.
// Getter/setter descriptors are always rejected; required values are read only
// from data descriptor .value, never through property access.
function scanDataDescriptors(value: unknown): DescriptorScan {
  const fail = (reason: NonNullable<DescriptorScan["reason"]>): DescriptorScan => ({
    ok: false, keys: [], values: {}, reason,
  });
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return fail("not_object");
  }
  let proto: unknown;
  try { proto = Object.getPrototypeOf(value); } catch {
    return fail("reflection");
  }
  if (proto !== null && proto !== Object.prototype) {
    return fail("not_plain");
  }
  let keys: string[];
  try { keys = Object.keys(value); } catch {
    return fail("reflection");
  }
  let descriptors: Record<string, PropertyDescriptor>;
  try { descriptors = Object.getOwnPropertyDescriptors(value); } catch {
    return fail("reflection");
  }
  // `descriptors` is a fresh plain object created by the engine — safe to iterate.
  for (const key of Object.keys(descriptors)) {
    const desc = descriptors[key];
    if (desc.get !== undefined || desc.set !== undefined) {
      return fail("accessor");
    }
  }
  const values: Record<string, unknown> = {};
  for (const key of keys) {
    values[key] = descriptors[key].value;
  }
  return { ok: true, keys, values, reason: null };
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

function containsSecretInValues(values: Record<string, unknown>): boolean {
  for (const v of Object.values(values)) {
    if (typeof v === "string") {
      if (SECRET_PATTERNS.some((p) => p.test(v))) return true;
    }
  }
  return false;
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

  // ── request: descriptor-based scan (fail-closed) ──
  const reqScan = scanDataDescriptors(request);
  if (!reqScan.ok) {
    return {
      ok: false,
      decision: reqScan.reason === "reflection" ? "reflection_failure" : "non_plain_object_detected",
    };
  }
  const reqValues = reqScan.values;

  if (reqValues.type !== "code_review") return { ok: false, decision: "wrong_request_type" };
  if (reqValues.node !== "code-review") return { ok: false, decision: "wrong_node" };
  if (reqValues.agent !== "hermes") return { ok: false, decision: "wrong_agent" };

  const reqId = reqValues.requirementId;
  if (typeof reqId !== "string" || !REQUIREMENT_ID_RE.test(reqId)) {
    return { ok: false, decision: "invalid_requirement_id" };
  }

  // ── input: exactly { artifacts: [] } as data properties ──
  const inputScan = scanDataDescriptors(reqValues.input);
  if (!inputScan.ok) {
    if (inputScan.reason === "reflection") return { ok: false, decision: "reflection_failure" };
    if (inputScan.reason === "accessor") return { ok: false, decision: "non_plain_object_detected" };
    return { ok: false, decision: "invalid_input_shape" };
  }
  if (inputScan.keys.length !== 1 || inputScan.keys[0] !== "artifacts") {
    return { ok: false, decision: "invalid_input_shape" };
  }
  const artifacts = inputScan.values.artifacts;
  if (!Array.isArray(artifacts) || artifacts.length !== 0) {
    return { ok: false, decision: "invalid_input_shape" };
  }
  if (containsSecretInValues(inputScan.values)) {
    return { ok: false, decision: "secret_content_detected" };
  }

  // ── metadata: optional, exactly { attempt: 0 } as data properties ──
  const metaRaw = reqValues.metadata;
  if (metaRaw !== undefined) {
    const metaScan = scanDataDescriptors(metaRaw);
    if (!metaScan.ok) {
      if (metaScan.reason === "reflection") return { ok: false, decision: "reflection_failure" };
      if (metaScan.reason === "accessor") return { ok: false, decision: "non_plain_object_detected" };
      return { ok: false, decision: "invalid_metadata_shape" };
    }
    if (metaScan.keys.length !== 1 || metaScan.keys[0] !== "attempt") {
      return { ok: false, decision: "invalid_metadata_shape" };
    }
    if (metaScan.values.attempt !== 0) {
      return { ok: false, decision: "invalid_metadata_shape" };
    }
    if (containsSecretInValues(metaScan.values)) {
      return { ok: false, decision: "secret_content_detected" };
    }
  }

  // ── operatorApproval: exactly one data property hermesPhase2CodeReviewCanary ──
  const approvalRaw = reqValues.operatorApproval;
  if (approvalRaw === undefined || approvalRaw === null) {
    return { ok: false, decision: "invalid_operator_approval" };
  }
  const approvalScan = scanDataDescriptors(approvalRaw);
  if (!approvalScan.ok) {
    if (approvalScan.reason === "reflection") return { ok: false, decision: "reflection_failure" };
    if (approvalScan.reason === "accessor") return { ok: false, decision: "non_plain_object_detected" };
    return { ok: false, decision: "invalid_operator_approval" };
  }
  if (approvalScan.keys.length !== 1 || approvalScan.keys[0] !== "hermesPhase2CodeReviewCanary") {
    return { ok: false, decision: "invalid_operator_approval" };
  }
  // Canary approval value: existence confirmed via descriptor key only.
  // Do NOT read, traverse, or scan its internals (proof, nonce, identity, etc.).

  // Check for extra keys on request
  const allowedRequestKeys = new Set([
    "type", "node", "agent", "requirementId", "input", "metadata",
    "skill", "skillValidation", "operatorApproval",
  ]);
  for (const key of reqScan.keys) {
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
