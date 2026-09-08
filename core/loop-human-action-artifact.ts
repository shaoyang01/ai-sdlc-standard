// C03-E W6b2 (E4-T4): the machine-readable `human_action_required` artifact.
// ===========================================================================
// The human boundary is the one place a run may legitimately stop and ask a
// person for something. Before this module that boundary was an opaque string
// (`humanActionRef`) whose meaning lived in whatever prose an executor happened
// to attach, so a consumer could not tell "please accept this risk" from
// "switch to another agent" without reading English.
//
// This module pins it to a closed contract:
//   - the artifact is stored under the `human_action_required` kind, so a ref
//     is self-describing;
//   - the reason is one of SIX codes, decided by an allowlist (never by
//     pattern-matching on free text);
//   - `SWITCH_AGENT_REQUIRED` and `SHADOW_FALLBACK_REQUIRED` are deliberately
//     NOT legal: both are routing decisions the runtime must make itself, not
//     something a human can be asked to do. Asking a human to "switch agents"
//     would turn an automation failure into a manual workaround.
//
// Validation style follows core/loop-governance-tail-result.ts: untrusted input
// converges on a failure result at the module boundary, no unknown exception
// escapes, and diagnostics carry field names and constraints only — never raw
// input values.

import { LoopArtifactStore, type LoopArtifactKind, type LoopStoredArtifact } from "./loop-artifact-store";

export const HUMAN_ACTION_ARTIFACT_KIND = "human_action_required" as const;

export const LOOP_HUMAN_ACTION_ARTIFACT_SCHEMA = "loop-human-action-required-v1" as const;

/**
 * The closed set of reasons a run may stop for a human. Anything outside this
 * list is rejected — including look-alikes spelled differently.
 */
export const HUMAN_ACTION_REASON_CODES = [
  "MISSING_BUSINESS_FACT",
  "SOURCE_CONFLICT",
  "RISK_ACCEPTANCE_REQUIRED",
  "PERMISSION_REQUIRED",
  "EXTERNAL_SIDE_EFFECT_AUTHORIZATION_REQUIRED",
  "MANUAL_GIT_HANDOFF_REQUIRED",
] as const;

export type HumanActionReasonCode = (typeof HUMAN_ACTION_REASON_CODES)[number];

export type HumanActionRequiredArtifact = Readonly<{
  schema: typeof LOOP_HUMAN_ACTION_ARTIFACT_SCHEMA;
  reasonCode: HumanActionReasonCode;
  runId: string;
  requirementId: string;
  /** Capability that hit the human boundary (null when run-scoped). */
  capability: string | null;
  /** Execution role of that capability (null when run-scoped). */
  executionRole: string | null;
  /** Bounded human-facing detail; never a substitute for the reason code. */
  message: string | null;
}>;

export type HumanActionArtifactInput = Readonly<{
  reasonCode: HumanActionReasonCode;
  runId: string;
  requirementId: string;
  capability?: string | null;
  executionRole?: string | null;
  message?: string | null;
}>;

export type HumanActionArtifactFailureReason =
  | "invalid_input"
  | "invalid_bytes"
  | "too_large";

export type HumanActionArtifactFailure = Readonly<{
  ok: false;
  reason: HumanActionArtifactFailureReason;
  diagnostic: string;
}>;

export type HumanActionArtifactSuccess = Readonly<{
  ok: true;
  artifact: HumanActionRequiredArtifact;
  content: string;
}>;

export type HumanActionArtifactBuildResult =
  | HumanActionArtifactSuccess
  | HumanActionArtifactFailure;

export type HumanActionArtifactStoreResult = Readonly<
  | { ok: true; artifact: HumanActionRequiredArtifact; stored: LoopStoredArtifact }
  | HumanActionArtifactFailure
>;

const FIELDS = [
  "schema",
  "reasonCode",
  "runId",
  "requirementId",
  "capability",
  "executionRole",
  "message",
] as const;

const MAX_CONTENT_BYTES = 65_536;
const MAX_ID_LENGTH = 256;
const MAX_MESSAGE_LENGTH = 512;
const MAX_DIAGNOSTIC_LENGTH = 256;
const CONTROL_RE = /[\u0000-\u001f\u007f]/g;
const ID_RE = /^[A-Za-z0-9._:-]+$/;

function freeze<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}

/**
 * Discriminates the failure branch. Exported because the union does not narrow
 * on a bare `!result.ok` under this project's compiler settings, and callers
 * need to read `reason`/`diagnostic` without a cast.
 */
export function isHumanActionArtifactFailure(
  value: HumanActionArtifactBuildResult | HumanActionArtifactStoreResult,
): value is HumanActionArtifactFailure {
  return value.ok === false;
}

function isFailure(
  value: HumanActionArtifactBuildResult | HumanActionArtifactStoreResult,
): value is HumanActionArtifactFailure {
  return isHumanActionArtifactFailure(value);
}

function failure(
  reason: HumanActionArtifactFailureReason,
  diagnostic: string,
): HumanActionArtifactFailure {
  return freeze({
    ok: false as const,
    reason,
    diagnostic: diagnostic.replace(CONTROL_RE, " ").slice(0, MAX_DIAGNOSTIC_LENGTH),
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === Object.prototype || proto === null;
}

function boundedId(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_ID_LENGTH || !ID_RE.test(trimmed)) {
    throw new Error(`${label} must be a non-empty bounded identifier`);
  }
  return trimmed;
}

function nullableText(value: unknown, label: string, maxLength: number): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string or null`);
  }
  if (value.length > maxLength) {
    throw new Error(`${label} exceeds ${maxLength} characters`);
  }
  return value;
}

/**
 * Validates and freezes the artifact body. Rejects anything whose reason code
 * is not exactly one of the six legal codes (case-sensitive) — including
 * `SWITCH_AGENT_REQUIRED` and `SHADOW_FALLBACK_REQUIRED`, which are routing
 * decisions the runtime owns rather than requests a human can act on.
 */
export function buildHumanActionRequiredArtifact(
  input: HumanActionInputish,
): HumanActionArtifactBuildResult {
  if (!isPlainRecord(input)) {
    return failure("invalid_input", "human action input must be a plain object");
  }
  const keys = Object.keys(input);
  if (
    keys.some((key) => !(INPUT_FIELDS as readonly string[]).includes(key))
  ) {
    return failure("invalid_input", "human action input contains an unknown field");
  }
  if (typeof input["reasonCode"] !== "string") {
    return failure("invalid_input", "reasonCode must be a string");
  }
  if (!(HUMAN_ACTION_REASON_CODES as readonly string[]).includes(input["reasonCode"])) {
    return failure("invalid_input", "reasonCode must be one of the six legal human-action codes");
  }
  let artifact: HumanActionRequiredArtifact;
  try {
    artifact = freeze({
      schema: LOOP_HUMAN_ACTION_ARTIFACT_SCHEMA,
      reasonCode: input["reasonCode"] as HumanActionReasonCode,
      runId: boundedId(input["runId"], "runId"),
      requirementId: boundedId(input["requirementId"], "requirementId"),
      capability: nullableText(input["capability"] ?? null, "capability", MAX_ID_LENGTH),
      executionRole: nullableText(input["executionRole"] ?? null, "executionRole", MAX_ID_LENGTH),
      message: nullableText(input["message"] ?? null, "message", MAX_MESSAGE_LENGTH),
    });
  } catch (error) {
    return failure(
      "invalid_input",
      error instanceof Error ? error.message.slice(0, MAX_DIAGNOSTIC_LENGTH) : "invalid human action input",
    );
  }
  return freeze({ ok: true as const, artifact, content: serializeHumanActionRequiredArtifact(artifact) });
}

const INPUT_FIELDS = [
  "reasonCode", "runId", "requirementId", "capability", "executionRole", "message",
] as const;

type HumanActionInputish = Readonly<Record<string, unknown>> | HumanActionArtifactInput;

/** Fixed-key-order serialization so identical artifacts hash identically. */
export function serializeHumanActionRequiredArtifact(
  artifact: HumanActionRequiredArtifact,
): string {
  return JSON.stringify({
    schema: artifact.schema,
    reasonCode: artifact.reasonCode,
    runId: artifact.runId,
    requirementId: artifact.requirementId,
    capability: artifact.capability,
    executionRole: artifact.executionRole,
    message: artifact.message,
  });
}

/**
 * Parses bytes read back from the artifact store. Strict in both directions:
 * the field set is exact, the schema must match, and the reason code must be in
 * the allowlist — a stored artifact that drifted out of contract is corrupt
 * rather than "close enough".
 */
export function parseHumanActionRequiredArtifact(
  content: string | Uint8Array,
): HumanActionArtifactBuildResult {
  let text: string;
  if (typeof content === "string") {
    text = content;
  } else if (content instanceof Uint8Array) {
    text = new TextDecoder().decode(content);
  } else {
    return failure("invalid_bytes", "human action artifact content must be a string or bytes");
  }
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > MAX_CONTENT_BYTES) {
    return failure("too_large", "human action artifact exceeds the content budget");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return failure("invalid_input", "human action artifact must be valid JSON");
  }
  if (!isPlainRecord(parsed)) {
    return failure("invalid_input", "human action artifact must be a JSON object");
  }
  const keys = Object.keys(parsed);
  if (
    keys.length !== FIELDS.length ||
    FIELDS.some((field) => !(field in parsed))
  ) {
    return failure("invalid_input", "human action artifact must contain exactly the canonical fields");
  }
  if (parsed["schema"] !== LOOP_HUMAN_ACTION_ARTIFACT_SCHEMA) {
    return failure("invalid_input", "human action artifact schema must match the pinned schema");
  }
  const reasonCode = parsed["reasonCode"];
  if (typeof reasonCode !== "string") {
    return failure("invalid_input", "human action artifact reasonCode must be a string");
  }
  if (!(HUMAN_ACTION_REASON_CODES as readonly string[]).includes(reasonCode)) {
    return failure("invalid_input", "human action artifact reasonCode is not a legal human-action code");
  }
  try {
    return freeze({
      ok: true as const,
      artifact: freeze({
        schema: LOOP_HUMAN_ACTION_ARTIFACT_SCHEMA,
        reasonCode: reasonCode as HumanActionReasonCode,
        runId: boundedId(parsed["runId"], "runId"),
        requirementId: boundedId(parsed["requirementId"], "requirementId"),
        capability: nullableText(parsed["capability"], "capability", MAX_ID_LENGTH),
        executionRole: nullableText(parsed["executionRole"], "executionRole", MAX_ID_LENGTH),
        message: nullableText(parsed["message"], "message", MAX_MESSAGE_LENGTH),
      }),
      content: text,
    });
  } catch (error) {
    return failure(
      "invalid_input",
      error instanceof Error ? error.message.slice(0, MAX_DIAGNOSTIC_LENGTH) : "invalid human action artifact",
    );
  }
}

const HUMAN_ACTION_REF_RE =
  /^loop-artifact:v1:human_action_required:sha256:([0-9a-f]{64})$/;

/** True when the ref points at a `human_action_required` artifact. */
export function isHumanActionRequiredRef(value: unknown): boolean {
  return typeof value === "string" && HUMAN_ACTION_REF_RE.test(value);
}

/**
 * Writes the artifact into the store. The kind is pinned by the module, so a
 * caller cannot store a human-action body under some other kind (or vice versa)
 * and have it read back as valid.
 */
export function putHumanActionRequiredArtifact(
  store: LoopArtifactStore,
  input: HumanActionArtifactInput,
): HumanActionArtifactStoreResult {
  const built = buildHumanActionRequiredArtifact(input);
  if (isFailure(built)) {
    return freeze({
      ok: false as const,
      reason: built.reason,
      diagnostic: built.diagnostic,
    });
  }
  const stored = store.put(HUMAN_ACTION_ARTIFACT_KIND as LoopArtifactKind, built.content);
  return freeze({ ok: true as const, artifact: built.artifact, stored });
}

/**
 * Reads the artifact back and re-validates it. The ref must be a
 * `human_action_required` ref — a ref of any other kind is refused before the
 * store is asked for bytes. An expected digest, when supplied, is enforced by
 * the store, so a ref/digest pair that disagrees is rejected rather than
 * silently read.
 */
export function readHumanActionRequiredArtifact(
  store: LoopArtifactStore,
  ref: string,
  expectedDigest?: string,
): HumanActionArtifactBuildResult {
  if (!isHumanActionRequiredRef(ref)) {
    return failure(
      "invalid_input",
      "human action ref must be a canonical loop-artifact:v1:human_action_required reference",
    );
  }
  const bytes = store.read(ref, expectedDigest);
  return parseHumanActionRequiredArtifact(bytes);
}
