// LOOP Executor Kernel — Durable Delivery Checkpoint Contract (D10-A)
// =====================================================================
// Pure module. No fs, child_process, Git, network, process.env,
// Runtime/Gateway/Graph, or Artifact Store direct calls.
//
// Builds/parses the canonical, immutable, deterministic, fail-closed
// `loop-delivery-checkpoint-v1` artifact: the generation-linear durable
// checkpoint transported through the Artifact Store. The checkpoint
// artifact is the immutable authority; the current-head locator
// (loop-delivery-checkpoint-store) only locates the newest trusted
// artifact and is never a business authority on its own.
//
// This module also implements the explicit checkpoint transition graph
// (pure validator): every transition produces a new immutable artifact,
// phases advance along one fixed linear path, generation increments by
// exactly one, and the previous checkpoint artifact ref must match the
// canonical bytes of the previous generation (chain fork prevention).

import { createHash } from "node:crypto";
import { validateLoopRunIdentity } from "./loop-run-state";
import type { LoopRunIdentity } from "./loop-executor-types";

// ═══════════════════════════════════════ Types

export type LoopDeliveryCheckpointMode = "fresh" | "recovery";

export type LoopDeliveryCheckpointPhase =
  | "initialized"
  | "d08_completed"
  | "workspace_prepared"
  | "d06_in_progress"
  | "d06_completed"
  | "tail_in_progress"
  | "tail_completed"
  | "a1_persisted"
  | "publish_intent_persisted"
  | "commit_reconciled"
  | "push_reconciled"
  | "pr_reconciled"
  | "publish_result_persisted"
  | "completed"
  | "blocked"
  | "failed";

export type LoopDeliveryCheckpointTerminalStatus = "completed" | "blocked" | "failed";

export interface LoopDeliveryCheckpoint {
  readonly schema: "loop-delivery-checkpoint-v1";
  readonly identity: LoopRunIdentity;
  readonly mode: LoopDeliveryCheckpointMode;
  readonly generation: number;
  readonly previous_checkpoint_artifact_ref: string | null;
  readonly phase: LoopDeliveryCheckpointPhase;

  readonly target_repository: string;
  readonly base_branch: string;
  readonly expected_base_sha: string;
  readonly task_branch: string;

  readonly source_head_sha: string;
  readonly source_wip_digest_sha256: string;

  readonly workspace_path: string | null;
  readonly workspace_head_sha: string | null;
  readonly workspace_status_digest_sha256: string | null;
  readonly workspace_has_changes: boolean | null;

  readonly orchestration_result_artifact_ref: string | null;
  readonly executor_input_artifact_ref: string | null;
  readonly delivery_result_artifact_ref: string | null;
  readonly governance_tail_result_artifact_ref: string | null;
  readonly publish_intent_artifact_ref: string | null;
  readonly publish_result_artifact_ref: string | null;

  readonly commit_sha: string | null;
  readonly remote_branch_sha: string | null;

  readonly pr_number: number | null;
  readonly pr_url: string | null;
  readonly pr_body_sha256: string | null;

  readonly deadline_origin_ms: number;
  readonly max_total_duration_ms: number;
  readonly elapsed_ms: number;

  readonly terminal_status: LoopDeliveryCheckpointTerminalStatus | null;
  readonly terminal_reason_code: string | null;
}

export interface LoopDeliveryCheckpointBuildSuccess {
  readonly ok: true;
  readonly value: Readonly<LoopDeliveryCheckpoint>;
  readonly text: string;
  readonly bytes: Uint8Array;
  readonly digestSha256: string;
  readonly sizeBytes: number;
}

export type LoopDeliveryCheckpointFailureReason = "invalid_input" | "invalid_bytes" | "too_large" | "invalid_transition";

export interface LoopDeliveryCheckpointFailure {
  readonly ok: false;
  readonly reason: LoopDeliveryCheckpointFailureReason;
  readonly diagnostic: string;
}

export type LoopDeliveryCheckpointBuildResult = LoopDeliveryCheckpointBuildSuccess | LoopDeliveryCheckpointFailure;

export type LoopDeliveryCheckpointTransitionResult = { readonly ok: true } | LoopDeliveryCheckpointFailure;

// ═══════════════════════════════════════ Constants

export const LOOP_DELIVERY_CHECKPOINT_SCHEMA = "loop-delivery-checkpoint-v1" as const;
export const LOOP_DELIVERY_CHECKPOINT_MAX_BYTES = 1_048_576;

/** The only terminal reason code a `completed` checkpoint may carry (D10-A-F-001). */
export const LOOP_DELIVERY_CHECKPOINT_COMPLETED_REASON_CODE = "DELIVERY_COMPLETED" as const;

export const LOOP_DELIVERY_CHECKPOINT_PHASES: readonly LoopDeliveryCheckpointPhase[] = [
  "initialized",
  "d08_completed",
  "workspace_prepared",
  "d06_in_progress",
  "d06_completed",
  "tail_in_progress",
  "tail_completed",
  "a1_persisted",
  "publish_intent_persisted",
  "commit_reconciled",
  "push_reconciled",
  "pr_reconciled",
  "publish_result_persisted",
  "completed",
  "blocked",
  "failed",
];

export const LOOP_DELIVERY_CHECKPOINT_MODES: readonly LoopDeliveryCheckpointMode[] = ["fresh", "recovery"];

export const LOOP_DELIVERY_CHECKPOINT_TERMINAL_PHASES: readonly LoopDeliveryCheckpointPhase[] = ["completed", "blocked", "failed"];

const MAX_STRING_UTF8_BYTES = 65_536;
const MAX_DIAGNOSTIC_LENGTH = 256;
const MAX_REPOSITORY_LENGTH = 200;
const MIN_MAX_TOTAL_DURATION_MS = 1_000;
const MAX_MAX_TOTAL_DURATION_MS = 3_600_000;

const CONTROL_RE = /[\x00-\x1f\x7f-\x9f]/;
const SHA40_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const REPOSITORY_SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const REF_RE = /^loop-artifact:v1:([a-z_]+):sha256:([0-9a-f]{64})$/;
const PR_URL_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/([0-9]+)$/;

// Canonical terminal reason code syntax (D10-A-F-001): uppercase start, then
// uppercase letters/digits/underscore, at most 64 characters total. No free
// text, no whitespace, no case variants, no control characters, no silent
// normalization — the code must round-trip byte-for-byte.
const TERMINAL_REASON_CODE_RE = /^[A-Z][A-Z0-9_]{0,63}$/;

const CHECKPOINT_REF_RE = /^loop-artifact:v1:delivery_checkpoint:sha256:[0-9a-f]{64}$/;

/** Artifact ref kinds allowed for each checkpoint ref field (D10-A 8.4). */
const REF_KIND_BY_FIELD: Readonly<Record<string, string>> = {
  orchestration_result_artifact_ref: "orchestration_result",
  executor_input_artifact_ref: "executor_input",
  delivery_result_artifact_ref: "delivery_result",
  governance_tail_result_artifact_ref: "governance_tail_result",
  publish_intent_artifact_ref: "workspace_metadata",
  publish_result_artifact_ref: "workspace_metadata",
};

// Exact canonical key sequences (D10-A-R-001): every public input record is
// required to carry its own keys in exactly this order — reordered, extra or
// missing keys are rejected, never silently canonicalized.

export const LOOP_DELIVERY_CHECKPOINT_ROOT_KEYS = [
  "schema", "identity", "mode", "generation", "previous_checkpoint_artifact_ref", "phase",
  "target_repository", "base_branch", "expected_base_sha", "task_branch",
  "source_head_sha", "source_wip_digest_sha256",
  "workspace_path", "workspace_head_sha", "workspace_status_digest_sha256", "workspace_has_changes",
  "orchestration_result_artifact_ref", "executor_input_artifact_ref", "delivery_result_artifact_ref",
  "governance_tail_result_artifact_ref", "publish_intent_artifact_ref", "publish_result_artifact_ref",
  "commit_sha", "remote_branch_sha",
  "pr_number", "pr_url", "pr_body_sha256",
  "deadline_origin_ms", "max_total_duration_ms", "elapsed_ms",
  "terminal_status", "terminal_reason_code",
] as const;

export const LOOP_DELIVERY_CHECKPOINT_IDENTITY_KEYS = [
  "runId", "requirementId", "repository", "repositoryPath", "baseBranch",
  "expectedBaseSha", "taskBranch", "controlRoot", "createdAt",
] as const;

/** Advance body sequence: the full root sequence minus the three store-owned fields. */
export const LOOP_DELIVERY_CHECKPOINT_BODY_KEYS: readonly string[] =
  LOOP_DELIVERY_CHECKPOINT_ROOT_KEYS.filter(
    (key) => key !== "schema" && key !== "generation" && key !== "previous_checkpoint_artifact_ref",
  );

const ROOT_KEYS = LOOP_DELIVERY_CHECKPOINT_ROOT_KEYS;

const IDENTITY_KEYS = LOOP_DELIVERY_CHECKPOINT_IDENTITY_KEYS;

// ═══════════════════════════════════════ Internal error model

/**
 * Internal validation failure. Carries a static, safe diagnostic (field name
 * and constraint only — never raw input values, never unknown exception
 * text). All untrusted-input paths converge here and are converted to
 * failure results at the module boundary; no unknown exception propagates.
 */
class ValidationError extends Error {
  readonly reason: LoopDeliveryCheckpointFailureReason;
  constructor(reason: LoopDeliveryCheckpointFailureReason, diagnostic: string) {
    super(diagnostic);
    this.name = "ValidationError";
    this.reason = reason;
  }
}

class TooLargeError extends ValidationError {
  constructor(diagnostic: string) {
    super("too_large", diagnostic);
    this.name = "TooLargeError";
  }
}

function freeze<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}

function failure(reason: LoopDeliveryCheckpointFailureReason, diagnostic: string): LoopDeliveryCheckpointFailure {
  const sanitized = diagnostic.replace(CONTROL_RE, " ").slice(0, MAX_DIAGNOSTIC_LENGTH);
  return freeze({ ok: false as const, reason, diagnostic: sanitized });
}

/** Byte budget tracked during validation; throws before any unbounded copy. */
interface Budget {
  used: number;
  maxBytes: number;
}

// ═══════════════════════════════════════ Descriptor-based plain scans

/**
 * Descriptor-based exact-sequence snapshot of a public input record
 * (D10-A-R-001/R-003). The own keys must appear in exactly the `allowed`
 * sequence: reordered keys, extra keys, missing keys, symbol keys,
 * `__proto__` own keys, accessors, class instances and non-plain prototypes
 * are all rejected. OwnKeys/descriptor/prototype reflection failures
 * (including Proxy traps and revoked proxies) fail closed. Getters are never
 * invoked; the returned record is a fresh plain snapshot.
 */
function scanPlainObject(value: unknown, allowed: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("invalid_input", `${label} must be a plain object`);
  }
  let proto: unknown;
  try {
    proto = Object.getPrototypeOf(value);
  } catch {
    throw new ValidationError("invalid_input", `${label} prototype reflection failed`);
  }
  if (proto !== Object.prototype && proto !== null) {
    throw new ValidationError("invalid_input", `${label} has a non-plain prototype`);
  }
  let keys: Array<string | symbol>;
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    throw new ValidationError("invalid_input", `${label} ownKeys reflection failed`);
  }
  const stringKeys: string[] = [];
  for (const key of keys) {
    if (typeof key === "symbol") throw new ValidationError("invalid_input", `${label} has a symbol key`);
    if (key === "__proto__") throw new ValidationError("invalid_input", `${label} has a __proto__ key`);
    if (!allowed.includes(key)) throw new ValidationError("invalid_input", `${label} has an unknown key`);
    stringKeys.push(key);
  }
  // Exact own-key sequence: no silent canonicalization of reordered input.
  if (stringKeys.length !== allowed.length) {
    throw new ValidationError("invalid_input", `${label} is missing required keys`);
  }
  for (let index = 0; index < stringKeys.length; index += 1) {
    if (stringKeys[index] !== allowed[index]) {
      throw new ValidationError("invalid_input", `${label} has keys in the wrong order`);
    }
  }
  const out = Object.create(null) as Record<string, unknown>;
  for (const key of stringKeys) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      throw new ValidationError("invalid_input", `${label} descriptor reflection failed`);
    }
    if (descriptor === undefined) throw new ValidationError("invalid_input", `${label} key descriptor is missing`);
    if ("get" in descriptor || "set" in descriptor) throw new ValidationError("invalid_input", `${label} has an accessor property`);
    if (!("value" in descriptor)) throw new ValidationError("invalid_input", `${label} key has no value`);
    Object.defineProperty(out, key, {
      value: descriptor.value,
      writable: false,
      enumerable: true,
      configurable: false,
    });
  }
  return out;
}

// ═══════════════════════════════════════ Scalar helpers

// Bounded UTF-8 byte counting — single bounded linear pass, stops the instant
// the per-string bound is exceeded, rejects C0/DEL/C1 control characters.

function countUtf8Bytes(value: string, label: string): number {
  if (value.length > MAX_STRING_UTF8_BYTES) {
    throw new ValidationError("invalid_input", `${label} exceeds the per-string byte bound`);
  }
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
      throw new ValidationError("invalid_input", `${label} must not contain control characters`);
    }
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = index + 1 < value.length ? value.charCodeAt(index + 1) : -1;
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
    if (bytes > MAX_STRING_UTF8_BYTES) {
      throw new ValidationError("invalid_input", `${label} exceeds the per-string byte bound`);
    }
  }
  return bytes;
}

function chargeString(value: unknown, label: string, budget: Budget): string {
  if (typeof value !== "string") throw new ValidationError("invalid_input", `${label} must be a string`);
  const bytes = countUtf8Bytes(value, label);
  if (bytes > budget.maxBytes - budget.used) throw new TooLargeError("artifact exceeds maxBytes");
  budget.used += bytes;
  return value;
}

function asTrimmedString(value: unknown, label: string, budget: Budget): string {
  const text = chargeString(value, label, budget);
  if (text !== text.trim() || text.length === 0) {
    throw new ValidationError("invalid_input", `${label} must be a trimmed non-empty string`);
  }
  return text;
}

function asAbsolutePathString(value: unknown, label: string, budget: Budget): string {
  const text = asTrimmedString(value, label, budget);
  if (!text.startsWith("/")) throw new ValidationError("invalid_input", `${label} must be an absolute path`);
  return text;
}

function asSha40(value: unknown, label: string, budget: Budget): string {
  const text = chargeString(value, label, budget);
  if (!SHA40_RE.test(text)) throw new ValidationError("invalid_input", `${label} must be 40 lowercase hex characters`);
  return text;
}

function asSha256(value: unknown, label: string, budget: Budget): string {
  const text = chargeString(value, label, budget);
  if (!SHA256_RE.test(text)) throw new ValidationError("invalid_input", `${label} must be 64 lowercase hex characters`);
  return text;
}

function asCanonicalRepository(value: unknown, label: string, budget: Budget): string {
  const text = asTrimmedString(value, label, budget);
  if (text.length > MAX_REPOSITORY_LENGTH) throw new ValidationError("invalid_input", `${label} exceeds the length bound`);
  const slash = text.indexOf("/");
  if (slash <= 0 || slash === text.length - 1 || text.indexOf("/", slash + 1) !== -1) {
    throw new ValidationError("invalid_input", `${label} must be a canonical owner/repo`);
  }
  const owner = text.slice(0, slash);
  const repo = text.slice(slash + 1);
  if (!REPOSITORY_SEGMENT_RE.test(owner) || !REPOSITORY_SEGMENT_RE.test(repo)) {
    throw new ValidationError("invalid_input", `${label} must be a canonical owner/repo`);
  }
  if (owner === "." || owner === ".." || repo === "." || repo === "..") {
    throw new ValidationError("invalid_input", `${label} must be a canonical owner/repo`);
  }
  return text;
}

function asNonNegativeSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError("invalid_input", `${label} must be a non-negative safe integer`);
  }
  return value;
}

function asPositiveSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new ValidationError("invalid_input", `${label} must be a positive safe integer`);
  }
  return value;
}

// ═══════════════════════════════════════ Nullable helpers

type NullableValidator<T> = (value: unknown, label: string, budget: Budget) => T;

function nullable<T>(value: unknown, label: string, budget: Budget, validator: NullableValidator<T>): T | null {
  if (value === null) return null;
  return validator(value, label, budget);
}

// ═══════════════════════════════════════ Identity single snapshot

function validateIdentity(value: unknown, budget: Budget): LoopRunIdentity {
  const record = scanPlainObject(value, IDENTITY_KEYS, "identity");
  for (const key of IDENTITY_KEYS) {
    chargeString(record[key], `identity.${key}`, budget);
  }
  try {
    validateLoopRunIdentity(record);
  } catch {
    throw new ValidationError("invalid_input", "identity must satisfy the canonical LoopRunIdentity contract");
  }
  // Fresh plain snapshot — the caller's original identity object is never
  // read again and never returned.
  const canonical = Object.create(null) as Record<string, unknown>;
  for (const key of IDENTITY_KEYS) {
    canonical[key] = record[key];
  }
  return freeze(canonical) as unknown as LoopRunIdentity;
}

// ═══════════════════════════════════════ Artifact refs

function validateRef(value: unknown, expectedKind: string, label: string, budget: Budget): string {
  const text = asTrimmedString(value, label, budget);
  const match = REF_RE.exec(text);
  if (match === null || match[1] !== expectedKind) {
    throw new ValidationError("invalid_input", `${label} must be a canonical loop-artifact:v1:${expectedKind} reference`);
  }
  return text;
}

function validateCheckpointRef(value: unknown, label: string, budget: Budget): string {
  const text = asTrimmedString(value, label, budget);
  if (!CHECKPOINT_REF_RE.test(text)) {
    throw new ValidationError("invalid_input", `${label} must be a canonical delivery_checkpoint reference`);
  }
  return text;
}

// ═══════════════════════════════════════ Fact presence model

type FactGroup = "A" | "W" | "D" | "G" | "I" | "C" | "R" | "P" | "X" | "T";

interface FactSnapshot {
  orchestrationRef: string | null;
  executorRef: string | null;
  deliveryRef: string | null;
  governanceRef: string | null;
  publishIntentRef: string | null;
  publishResultRef: string | null;
  commitSha: string | null;
  remoteBranchSha: string | null;
  prNumber: number | null;
  prUrl: string | null;
  prBodySha256: string | null;
  workspacePath: string | null;
  workspaceHeadSha: string | null;
  workspaceStatusDigest: string | null;
  workspaceHasChanges: boolean | null;
  terminalStatus: LoopDeliveryCheckpointTerminalStatus | null;
  terminalReasonCode: string | null;
}

function groupPresent(facts: FactSnapshot, group: FactGroup): boolean {
  switch (group) {
    case "A": return facts.orchestrationRef !== null || facts.executorRef !== null;
    case "W": return facts.workspacePath !== null || facts.workspaceHeadSha !== null || facts.workspaceStatusDigest !== null || facts.workspaceHasChanges !== null;
    case "D": return facts.deliveryRef !== null;
    case "G": return facts.governanceRef !== null;
    case "I": return facts.publishIntentRef !== null;
    case "C": return facts.commitSha !== null;
    case "R": return facts.remoteBranchSha !== null;
    case "P": return facts.prNumber !== null || facts.prUrl !== null || facts.prBodySha256 !== null;
    case "X": return facts.publishResultRef !== null;
    case "T": return facts.terminalStatus !== null || facts.terminalReasonCode !== null;
  }
}

function validateGroupConsistency(facts: FactSnapshot): void {
  if (facts.orchestrationRef !== null && facts.executorRef === null) {
    throw new ValidationError("invalid_input", "orchestration and executor refs must be all-null or all-non-null");
  }
  if (facts.orchestrationRef === null && facts.executorRef !== null) {
    throw new ValidationError("invalid_input", "orchestration and executor refs must be all-null or all-non-null");
  }
  const wCount = [facts.workspacePath, facts.workspaceHeadSha, facts.workspaceStatusDigest, facts.workspaceHasChanges].filter((v) => v !== null).length;
  if (wCount !== 0 && wCount !== 4) {
    throw new ValidationError("invalid_input", "workspace facts must be all-null or all-non-null");
  }
  const pCount = [facts.prNumber, facts.prUrl, facts.prBodySha256].filter((v) => v !== null).length;
  if (pCount !== 0 && pCount !== 3) {
    throw new ValidationError("invalid_input", "PR facts must be all-null or all-non-null");
  }
}

/** Dependency closures: no later fact without its prerequisite. */
function validateDependencyClosures(facts: FactSnapshot): void {
  if (facts.deliveryRef !== null && (facts.orchestrationRef === null || facts.executorRef === null || facts.workspacePath === null)) {
    throw new ValidationError("invalid_input", "delivery result requires D08 refs and workspace facts");
  }
  if (facts.governanceRef !== null && facts.deliveryRef === null) {
    throw new ValidationError("invalid_input", "governance tail result requires the delivery result");
  }
  if (facts.publishIntentRef !== null && facts.governanceRef === null) {
    throw new ValidationError("invalid_input", "publish intent requires the governance tail result");
  }
  if (facts.commitSha !== null && facts.publishIntentRef === null) {
    throw new ValidationError("invalid_input", "commit requires the publish intent");
  }
  if (facts.remoteBranchSha !== null && facts.commitSha === null) {
    throw new ValidationError("invalid_input", "remote branch sha requires the commit sha");
  }
  if (facts.remoteBranchSha !== null && facts.remoteBranchSha !== facts.commitSha) {
    throw new ValidationError("invalid_input", "remote branch sha must equal the commit sha");
  }
  if (facts.prNumber !== null && facts.remoteBranchSha === null) {
    throw new ValidationError("invalid_input", "PR facts require the remote branch sha");
  }
  if (facts.publishResultRef !== null && facts.prNumber === null) {
    throw new ValidationError("invalid_input", "publish result requires the PR facts");
  }
}

/** Terminal phases may carry facts verified up to any legal prefix only. */
function validateTerminalPrefix(facts: FactSnapshot): void {
  if (facts.workspacePath === null) return;
  if (facts.workspaceHasChanges === true) {
    if (facts.deliveryRef === null) {
      throw new ValidationError("invalid_input", "a changed workspace requires the delivery result");
    }
    if (facts.commitSha !== null) {
      throw new ValidationError("invalid_input", "a changed workspace must not carry a commit");
    }
  } else {
    if (facts.commitSha !== null) {
      if (facts.workspaceHeadSha !== facts.commitSha) {
        throw new ValidationError("invalid_input", "workspace head must equal the commit sha after commit");
      }
    } else if (facts.deliveryRef !== null) {
      throw new ValidationError("invalid_input", "a clean workspace before commit must not carry the delivery result");
    }
  }
}

// ═══════════════════════════════════════ Phase / fact matrix

interface PhaseRequirement {
  readonly require: readonly FactGroup[];
  readonly nulls: readonly FactGroup[];
  readonly workspaceHasChanges?: boolean;
  readonly workspaceHeadEqualsCommit?: boolean;
  readonly terminalStatus?: LoopDeliveryCheckpointTerminalStatus;
  readonly terminalReasonRequired?: boolean;
}

const PHASE_REQUIREMENTS: Readonly<Record<LoopDeliveryCheckpointPhase, PhaseRequirement>> = {
  initialized: { require: [], nulls: ["A", "W", "D", "G", "I", "C", "R", "P", "X", "T"] },
  d08_completed: { require: ["A"], nulls: ["W", "D", "G", "I", "C", "R", "P", "X", "T"] },
  workspace_prepared: { require: ["A", "W"], nulls: ["D", "G", "I", "C", "R", "P", "X", "T"], workspaceHasChanges: false },
  d06_in_progress: { require: ["A", "W"], nulls: ["D", "G", "I", "C", "R", "P", "X", "T"], workspaceHasChanges: false },
  d06_completed: { require: ["A", "W", "D"], nulls: ["G", "I", "C", "R", "P", "X", "T"], workspaceHasChanges: true },
  tail_in_progress: { require: ["A", "W", "D"], nulls: ["G", "I", "C", "R", "P", "X", "T"], workspaceHasChanges: true },
  tail_completed: { require: ["A", "W", "D"], nulls: ["G", "I", "C", "R", "P", "X", "T"], workspaceHasChanges: true },
  a1_persisted: { require: ["A", "W", "D", "G"], nulls: ["I", "C", "R", "P", "X", "T"], workspaceHasChanges: true },
  publish_intent_persisted: { require: ["A", "W", "D", "G", "I"], nulls: ["C", "R", "P", "X", "T"], workspaceHasChanges: true },
  commit_reconciled: { require: ["A", "W", "D", "G", "I", "C"], nulls: ["R", "P", "X", "T"], workspaceHasChanges: false, workspaceHeadEqualsCommit: true },
  push_reconciled: { require: ["A", "W", "D", "G", "I", "C", "R"], nulls: ["P", "X", "T"], workspaceHasChanges: false, workspaceHeadEqualsCommit: true },
  pr_reconciled: { require: ["A", "W", "D", "G", "I", "C", "R", "P"], nulls: ["X", "T"], workspaceHasChanges: false, workspaceHeadEqualsCommit: true },
  publish_result_persisted: { require: ["A", "W", "D", "G", "I", "C", "R", "P", "X"], nulls: ["T"], workspaceHasChanges: false, workspaceHeadEqualsCommit: true },
  completed: { require: ["A", "W", "D", "G", "I", "C", "R", "P", "X"], nulls: [], workspaceHasChanges: false, workspaceHeadEqualsCommit: true, terminalStatus: "completed" },
  blocked: { require: [], nulls: [], terminalStatus: "blocked", terminalReasonRequired: true },
  failed: { require: [], nulls: [], terminalStatus: "failed", terminalReasonRequired: true },
};

function validatePhaseFacts(phase: LoopDeliveryCheckpointPhase, facts: FactSnapshot): void {
  const requirement = PHASE_REQUIREMENTS[phase];
  for (const group of requirement.require) {
    if (!groupPresent(facts, group)) {
      throw new ValidationError("invalid_input", `phase ${phase} requires the ${group} facts`);
    }
  }
  for (const group of requirement.nulls) {
    if (groupPresent(facts, group)) {
      throw new ValidationError("invalid_input", `phase ${phase} must not carry the ${group} facts`);
    }
  }
  if (requirement.workspaceHasChanges !== undefined) {
    if (facts.workspaceHasChanges !== requirement.workspaceHasChanges) {
      throw new ValidationError("invalid_input", `phase ${phase} requires workspace_has_changes ${requirement.workspaceHasChanges}`);
    }
  }
  if (requirement.workspaceHeadEqualsCommit === true) {
    if (facts.workspaceHeadSha !== facts.commitSha) {
      throw new ValidationError("invalid_input", `phase ${phase} requires workspace head to equal the commit sha`);
    }
  }
  if (requirement.terminalStatus !== undefined) {
    if (facts.terminalStatus !== requirement.terminalStatus) {
      throw new ValidationError("invalid_input", `phase ${phase} requires terminal status ${requirement.terminalStatus}`);
    }
  }
  if (requirement.terminalReasonRequired === true) {
    if (facts.terminalReasonCode === null) {
      throw new ValidationError("invalid_input", `phase ${phase} requires a terminal reason code`);
    }
  }
}

// ═══════════════════════════════════════ Root validator (canonical value)

function validateRoot(record: Record<string, unknown>, budget: Budget): LoopDeliveryCheckpoint {
  if (record.schema !== LOOP_DELIVERY_CHECKPOINT_SCHEMA) {
    throw new ValidationError("invalid_input", "schema must be loop-delivery-checkpoint-v1");
  }
  const mode = record.mode;
  if (typeof mode !== "string" || !LOOP_DELIVERY_CHECKPOINT_MODES.includes(mode as LoopDeliveryCheckpointMode)) {
    throw new ValidationError("invalid_input", "mode must be fresh or recovery");
  }
  const generation = asPositiveSafeInteger(record.generation, "generation");
  const previousRef = nullable(record.previous_checkpoint_artifact_ref, "previous_checkpoint_artifact_ref", budget, (v, l, b) => validateCheckpointRef(v, l, b));
  if (generation === 1 && previousRef !== null) {
    throw new ValidationError("invalid_input", "generation 1 must not carry a previous checkpoint ref");
  }
  if (generation > 1 && previousRef === null) {
    throw new ValidationError("invalid_input", "generations above 1 require the previous checkpoint ref");
  }
  const phase = record.phase;
  if (typeof phase !== "string" || !LOOP_DELIVERY_CHECKPOINT_PHASES.includes(phase as LoopDeliveryCheckpointPhase)) {
    throw new ValidationError("invalid_input", "phase must be a canonical LoopDeliveryCheckpointPhase");
  }
  const canonicalPhase = phase as LoopDeliveryCheckpointPhase;

  const identity = validateIdentity(record.identity, budget);
  const targetRepository = asCanonicalRepository(record.target_repository, "target_repository", budget);
  const baseBranch = asTrimmedString(record.base_branch, "base_branch", budget);
  const expectedBaseSha = asSha40(record.expected_base_sha, "expected_base_sha", budget);
  const taskBranch = asTrimmedString(record.task_branch, "task_branch", budget);
  const sourceHeadSha = asSha40(record.source_head_sha, "source_head_sha", budget);
  const sourceWipDigest = asSha256(record.source_wip_digest_sha256, "source_wip_digest_sha256", budget);

  // ── fixed bindings (D10-A 8.4) ──
  if (targetRepository !== identity.repository) {
    throw new ValidationError("invalid_input", "target_repository must equal identity.repository");
  }
  if (baseBranch !== identity.baseBranch) {
    throw new ValidationError("invalid_input", "base_branch must equal identity.baseBranch");
  }
  if (expectedBaseSha !== identity.expectedBaseSha) {
    throw new ValidationError("invalid_input", "expected_base_sha must equal identity.expectedBaseSha");
  }
  if (taskBranch !== identity.taskBranch) {
    throw new ValidationError("invalid_input", "task_branch must equal identity.taskBranch");
  }
  if (sourceHeadSha !== expectedBaseSha) {
    throw new ValidationError("invalid_input", "source_head_sha must equal expected_base_sha");
  }

  // ── workspace facts ──
  const workspacePath = nullable(record.workspace_path, "workspace_path", budget, (v, l, b) => asAbsolutePathString(v, l, b));
  const workspaceHeadSha = nullable(record.workspace_head_sha, "workspace_head_sha", budget, (v, l, b) => asSha40(v, l, b));
  const workspaceStatusDigest = nullable(record.workspace_status_digest_sha256, "workspace_status_digest_sha256", budget, (v, l, b) => asSha256(v, l, b));
  const workspaceHasChangesValue = record.workspace_has_changes;
  if (workspaceHasChangesValue !== null && typeof workspaceHasChangesValue !== "boolean") {
    throw new ValidationError("invalid_input", "workspace_has_changes must be a boolean or null");
  }
  const workspaceHasChanges = workspaceHasChangesValue as boolean | null;

  // ── artifact refs ──
  const orchestrationRef = nullable(record.orchestration_result_artifact_ref, "orchestration_result_artifact_ref", budget, (v, l, b) => validateRef(v, REF_KIND_BY_FIELD.orchestration_result_artifact_ref!, l, b));
  const executorRef = nullable(record.executor_input_artifact_ref, "executor_input_artifact_ref", budget, (v, l, b) => validateRef(v, REF_KIND_BY_FIELD.executor_input_artifact_ref!, l, b));
  const deliveryRef = nullable(record.delivery_result_artifact_ref, "delivery_result_artifact_ref", budget, (v, l, b) => validateRef(v, REF_KIND_BY_FIELD.delivery_result_artifact_ref!, l, b));
  const governanceRef = nullable(record.governance_tail_result_artifact_ref, "governance_tail_result_artifact_ref", budget, (v, l, b) => validateRef(v, REF_KIND_BY_FIELD.governance_tail_result_artifact_ref!, l, b));
  const publishIntentRef = nullable(record.publish_intent_artifact_ref, "publish_intent_artifact_ref", budget, (v, l, b) => validateRef(v, REF_KIND_BY_FIELD.publish_intent_artifact_ref!, l, b));
  const publishResultRef = nullable(record.publish_result_artifact_ref, "publish_result_artifact_ref", budget, (v, l, b) => validateRef(v, REF_KIND_BY_FIELD.publish_result_artifact_ref!, l, b));

  // ── git facts ──
  const commitSha = nullable(record.commit_sha, "commit_sha", budget, (v, l, b) => asSha40(v, l, b));
  const remoteBranchSha = nullable(record.remote_branch_sha, "remote_branch_sha", budget, (v, l, b) => asSha40(v, l, b));

  // ── PR facts ──
  const prNumber = nullable(record.pr_number, "pr_number", budget, (v) => asPositiveSafeInteger(v, "pr_number"));
  const prUrl = nullable(record.pr_url, "pr_url", budget, (v, l, b) => asTrimmedString(v, l, b));
  const prBodySha256 = nullable(record.pr_body_sha256, "pr_body_sha256", budget, (v, l, b) => asSha256(v, l, b));
  if (prUrl !== null) {
    const match = PR_URL_RE.exec(prUrl);
    if (match === null || match[1] + "/" + match[2] !== targetRepository) {
      throw new ValidationError("invalid_input", "pr_url must match the canonical GitHub pull URL for the target repository");
    }
    const urlNumber = Number(match[3]);
    if (prNumber !== null && urlNumber !== prNumber) {
      throw new ValidationError("invalid_input", "pr_url must reference the pr_number");
    }
  }

  // ── deadline ──
  const deadlineOriginMs = asNonNegativeSafeInteger(record.deadline_origin_ms, "deadline_origin_ms");
  const maxTotalDurationMs = record.max_total_duration_ms;
  if (
    typeof maxTotalDurationMs !== "number" || !Number.isSafeInteger(maxTotalDurationMs) ||
    maxTotalDurationMs < MIN_MAX_TOTAL_DURATION_MS || maxTotalDurationMs > MAX_MAX_TOTAL_DURATION_MS
  ) {
    throw new ValidationError("invalid_input", "max_total_duration_ms must be a safe integer in 1000..3600000");
  }
  const elapsedMs = asNonNegativeSafeInteger(record.elapsed_ms, "elapsed_ms");
  if (elapsedMs > maxTotalDurationMs) {
    throw new ValidationError("invalid_input", "elapsed_ms must not exceed max_total_duration_ms");
  }

  // ── terminal fields ──
  const terminalStatusValue = record.terminal_status;
  if (
    terminalStatusValue !== null &&
    (typeof terminalStatusValue !== "string" || !LOOP_DELIVERY_CHECKPOINT_TERMINAL_PHASES.includes(terminalStatusValue as LoopDeliveryCheckpointPhase))
  ) {
    throw new ValidationError("invalid_input", "terminal_status must be completed, blocked, failed or null");
  }
  const terminalStatus = terminalStatusValue as LoopDeliveryCheckpointTerminalStatus | null;
  let terminalReasonCode: string | null = null;
  if (record.terminal_reason_code !== null) {
    const reason = asTrimmedString(record.terminal_reason_code, "terminal_reason_code", budget);
    if (!TERMINAL_REASON_CODE_RE.test(reason)) {
      throw new ValidationError("invalid_input", "terminal_reason_code must be a canonical reason code");
    }
    terminalReasonCode = reason;
  }
  const isTerminalPhase = canonicalPhase === "completed" || canonicalPhase === "blocked" || canonicalPhase === "failed";
  if (!isTerminalPhase) {
    if (terminalStatus !== null || terminalReasonCode !== null) {
      throw new ValidationError("invalid_input", "non-terminal checkpoints must not carry terminal facts");
    }
  } else if (
    canonicalPhase === "completed" &&
    terminalReasonCode !== LOOP_DELIVERY_CHECKPOINT_COMPLETED_REASON_CODE
  ) {
    // Completed is the success terminal: terminal_status is fixed to
    // "completed" (enforced below) and the reason is bound to exactly
    // DELIVERY_COMPLETED — null, empty, alternative canonical codes, free
    // text, whitespace variants and control characters are all rejected.
    throw new ValidationError("invalid_input", "completed checkpoints must carry the DELIVERY_COMPLETED terminal reason");
  }

  // ── fact consistency ──
  const facts: FactSnapshot = {
    orchestrationRef, executorRef, deliveryRef, governanceRef, publishIntentRef, publishResultRef,
    commitSha, remoteBranchSha, prNumber, prUrl, prBodySha256,
    workspacePath, workspaceHeadSha, workspaceStatusDigest, workspaceHasChanges,
    terminalStatus, terminalReasonCode,
  };
  validateGroupConsistency(facts);
  validateDependencyClosures(facts);
  validatePhaseFacts(canonicalPhase, facts);
  if (canonicalPhase === "blocked" || canonicalPhase === "failed") {
    validateTerminalPrefix(facts);
  }

  // ── canonical value in fixed root property order ──
  const canonical: Record<string, unknown> = Object.create(null);
  canonical.schema = LOOP_DELIVERY_CHECKPOINT_SCHEMA;
  canonical.identity = identity;
  canonical.mode = mode;
  canonical.generation = generation;
  canonical.previous_checkpoint_artifact_ref = previousRef;
  canonical.phase = canonicalPhase;
  canonical.target_repository = targetRepository;
  canonical.base_branch = baseBranch;
  canonical.expected_base_sha = expectedBaseSha;
  canonical.task_branch = taskBranch;
  canonical.source_head_sha = sourceHeadSha;
  canonical.source_wip_digest_sha256 = sourceWipDigest;
  canonical.workspace_path = workspacePath;
  canonical.workspace_head_sha = workspaceHeadSha;
  canonical.workspace_status_digest_sha256 = workspaceStatusDigest;
  canonical.workspace_has_changes = workspaceHasChanges;
  canonical.orchestration_result_artifact_ref = orchestrationRef;
  canonical.executor_input_artifact_ref = executorRef;
  canonical.delivery_result_artifact_ref = deliveryRef;
  canonical.governance_tail_result_artifact_ref = governanceRef;
  canonical.publish_intent_artifact_ref = publishIntentRef;
  canonical.publish_result_artifact_ref = publishResultRef;
  canonical.commit_sha = commitSha;
  canonical.remote_branch_sha = remoteBranchSha;
  canonical.pr_number = prNumber;
  canonical.pr_url = prUrl;
  canonical.pr_body_sha256 = prBodySha256;
  canonical.deadline_origin_ms = deadlineOriginMs;
  canonical.max_total_duration_ms = maxTotalDurationMs;
  canonical.elapsed_ms = elapsedMs;
  canonical.terminal_status = terminalStatus;
  canonical.terminal_reason_code = terminalReasonCode;
  return canonical as unknown as LoopDeliveryCheckpoint;
}

// ═══════════════════════════════════════ Canonical bytes

function deepFreeze<T>(value: T): Readonly<T> {
  if (value === null || typeof value !== "object") return value as Readonly<T>;
  if (value instanceof Uint8Array) return value as Readonly<T>;
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    return Object.freeze(value) as Readonly<T>;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) deepFreeze(record[key]);
  return Object.freeze(value) as Readonly<T>;
}

function resolveMaxBytes(maxBytes: unknown): number {
  if (maxBytes === undefined) return LOOP_DELIVERY_CHECKPOINT_MAX_BYTES;
  if (typeof maxBytes !== "number" || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > LOOP_DELIVERY_CHECKPOINT_MAX_BYTES) {
    throw new ValidationError("invalid_input", "maxBytes must be a safe integer in 1..1048576");
  }
  return maxBytes;
}

/** Canonical serialized text of an already-validated canonical value. */
export function canonicalizeLoopDeliveryCheckpoint(value: LoopDeliveryCheckpoint): string {
  const ordered: Record<string, unknown> = Object.create(null);
  ordered.schema = value.schema;
  ordered.identity = value.identity;
  ordered.mode = value.mode;
  ordered.generation = value.generation;
  ordered.previous_checkpoint_artifact_ref = value.previous_checkpoint_artifact_ref;
  ordered.phase = value.phase;
  ordered.target_repository = value.target_repository;
  ordered.base_branch = value.base_branch;
  ordered.expected_base_sha = value.expected_base_sha;
  ordered.task_branch = value.task_branch;
  ordered.source_head_sha = value.source_head_sha;
  ordered.source_wip_digest_sha256 = value.source_wip_digest_sha256;
  ordered.workspace_path = value.workspace_path;
  ordered.workspace_head_sha = value.workspace_head_sha;
  ordered.workspace_status_digest_sha256 = value.workspace_status_digest_sha256;
  ordered.workspace_has_changes = value.workspace_has_changes;
  ordered.orchestration_result_artifact_ref = value.orchestration_result_artifact_ref;
  ordered.executor_input_artifact_ref = value.executor_input_artifact_ref;
  ordered.delivery_result_artifact_ref = value.delivery_result_artifact_ref;
  ordered.governance_tail_result_artifact_ref = value.governance_tail_result_artifact_ref;
  ordered.publish_intent_artifact_ref = value.publish_intent_artifact_ref;
  ordered.publish_result_artifact_ref = value.publish_result_artifact_ref;
  ordered.commit_sha = value.commit_sha;
  ordered.remote_branch_sha = value.remote_branch_sha;
  ordered.pr_number = value.pr_number;
  ordered.pr_url = value.pr_url;
  ordered.pr_body_sha256 = value.pr_body_sha256;
  ordered.deadline_origin_ms = value.deadline_origin_ms;
  ordered.max_total_duration_ms = value.max_total_duration_ms;
  ordered.elapsed_ms = value.elapsed_ms;
  ordered.terminal_status = value.terminal_status;
  ordered.terminal_reason_code = value.terminal_reason_code;
  return JSON.stringify(ordered) + "\n";
}

/** Content-addressed artifact ref of a canonical checkpoint value. */
export function loopDeliveryCheckpointRef(value: LoopDeliveryCheckpoint): string {
  const digest = createHash("sha256").update(canonicalizeLoopDeliveryCheckpoint(value), "utf8").digest("hex");
  return `loop-artifact:v1:delivery_checkpoint:sha256:${digest}`;
}

function buildSuccess(value: LoopDeliveryCheckpoint, maxBytes: number): LoopDeliveryCheckpointBuildResult {
  const frozen = deepFreeze(value) as unknown as LoopDeliveryCheckpoint;
  const text = canonicalizeLoopDeliveryCheckpoint(frozen);
  const encoded = new TextEncoder().encode(text);
  if (encoded.length > maxBytes) return failure("too_large", "artifact exceeds maxBytes");
  const bytes = new Uint8Array(encoded);
  const digestSha256 = createHash("sha256").update(bytes).digest("hex");
  return freeze({
    ok: true as const,
    value: frozen,
    text,
    bytes,
    digestSha256,
    sizeBytes: bytes.length,
  });
}

// ═══════════════════════════════════════ Public builder

export function buildLoopDeliveryCheckpoint(
  input: unknown,
  maxBytes?: number,
): LoopDeliveryCheckpointBuildResult {
  try {
    const max = resolveMaxBytes(maxBytes);
    const budget: Budget = { used: 0, maxBytes: max };
    const root = scanPlainObject(input, ROOT_KEYS, "root");
    const value = validateRoot(root, budget);
    return buildSuccess(value, max);
  } catch (error) {
    if (error instanceof ValidationError) return failure(error.reason, error.message);
    return failure("invalid_input", "unexpected failure while building the delivery checkpoint");
  }
}

// ═══════════════════════════════════════ Public parser

const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype);
const TYPED_ARRAY_TAG_GETTER = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, Symbol.toStringTag)!.get!;
const TYPED_ARRAY_BYTELENGTH_GETTER = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, "byteLength")!.get!;

export function parseLoopDeliveryCheckpointBytes(
  bytes: Uint8Array,
  maxBytes?: number,
): LoopDeliveryCheckpointBuildResult {
  let max: number;
  try {
    max = resolveMaxBytes(maxBytes);
  } catch (error) {
    if (error instanceof ValidationError) return failure(error.reason, error.message);
    return failure("invalid_input", "unexpected failure while parsing delivery checkpoint bytes");
  }
  let copy: Uint8Array | null = null;
  try {
    const tag = Reflect.apply(TYPED_ARRAY_TAG_GETTER, bytes, []);
    if (tag !== "Uint8Array") {
      return failure("invalid_input", "bytes must be a genuine Uint8Array");
    }
    const byteLength = Reflect.apply(TYPED_ARRAY_BYTELENGTH_GETTER, bytes, []);
    if (typeof byteLength !== "number" || !Number.isSafeInteger(byteLength) || byteLength < 0) {
      return failure("invalid_input", "bytes must be a genuine Uint8Array");
    }
    if (byteLength > max) return failure("too_large", "artifact bytes exceed maxBytes");
    copy = new Uint8Array(bytes);
    if (copy.length !== byteLength) {
      return failure("invalid_input", "bytes snapshot length mismatch");
    }
  } catch {
    return failure("invalid_input", "bytes must be a genuine Uint8Array");
  }
  try {
    if (copy.length >= 3 && copy[0] === 0xef && copy[1] === 0xbb && copy[2] === 0xbf) {
      return failure("invalid_bytes", "artifact bytes must not start with a BOM");
    }
    if (copy.includes(0x0d)) return failure("invalid_bytes", "artifact bytes must not contain CR");
    if (copy.includes(0x00)) return failure("invalid_bytes", "artifact bytes must not contain NUL");
    if (copy.length === 0 || copy[copy.length - 1] !== 0x0a) {
      return failure("invalid_bytes", "artifact bytes must end with exactly one LF");
    }
    if (copy.length >= 2 && copy[copy.length - 2] === 0x0a) {
      return failure("invalid_bytes", "artifact bytes must end with exactly one LF");
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(copy);
    } catch {
      return failure("invalid_bytes", "artifact bytes are not valid UTF-8");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return failure("invalid_bytes", "artifact bytes do not parse as JSON");
    }
    const budget: Budget = { used: 0, maxBytes: max };
    const root = scanPlainObject(parsed, ROOT_KEYS, "root");
    const value = validateRoot(root, budget);
    const rebuilt = new TextEncoder().encode(canonicalizeLoopDeliveryCheckpoint(value));
    if (!byteEquals(rebuilt, copy)) {
      return failure("invalid_bytes", "artifact bytes are not canonical (round-trip mismatch)");
    }
    const bytesOut = new Uint8Array(rebuilt);
    const digestSha256 = createHash("sha256").update(bytesOut).digest("hex");
    const frozen = deepFreeze(value) as unknown as LoopDeliveryCheckpoint;
    return freeze({
      ok: true as const,
      value: frozen,
      text: JSON.stringify(frozen) + "\n",
      bytes: bytesOut,
      digestSha256,
      sizeBytes: bytesOut.length,
    });
  } catch (error) {
    if (error instanceof TooLargeError) return failure("too_large", error.message);
    return failure("invalid_bytes", "artifact bytes do not form a valid delivery checkpoint");
  }
}

function byteEquals(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

// ═══════════════════════════════════════ Explicit transition graph

/** Allowed forward transitions between checkpoint phases (D10-A 9). */
export const LOOP_DELIVERY_CHECKPOINT_TRANSITIONS: Readonly<Record<LoopDeliveryCheckpointPhase, readonly LoopDeliveryCheckpointPhase[]>> = {
  initialized: ["d08_completed", "blocked", "failed"],
  d08_completed: ["workspace_prepared", "blocked", "failed"],
  workspace_prepared: ["d06_in_progress", "blocked", "failed"],
  d06_in_progress: ["d06_completed", "blocked", "failed"],
  d06_completed: ["tail_in_progress", "blocked", "failed"],
  tail_in_progress: ["tail_completed", "blocked", "failed"],
  tail_completed: ["a1_persisted", "blocked", "failed"],
  a1_persisted: ["publish_intent_persisted", "blocked", "failed"],
  publish_intent_persisted: ["commit_reconciled", "blocked", "failed"],
  commit_reconciled: ["push_reconciled", "blocked", "failed"],
  push_reconciled: ["pr_reconciled", "blocked", "failed"],
  pr_reconciled: ["publish_result_persisted", "blocked", "failed"],
  publish_result_persisted: ["completed", "blocked", "failed"],
  completed: [],
  blocked: [],
  failed: [],
};

const TERMINAL_PHASE_SET = new Set<string>(LOOP_DELIVERY_CHECKPOINT_TERMINAL_PHASES);

/** Edges on which a workspace status digest may legitimately change. */
const WORKSPACE_DIGEST_MAY_CHANGE = new Set<string>([
  "d06_in_progress>d06_completed",
  "d06_completed>tail_in_progress",
  "tail_in_progress>tail_completed",
  "tail_completed>a1_persisted",
  "publish_intent_persisted>commit_reconciled",
]);

function transitionFailure(diagnostic: string): LoopDeliveryCheckpointFailure {
  return failure("invalid_transition", diagnostic);
}

function validateWorkspaceTransition(previous: LoopDeliveryCheckpoint, next: LoopDeliveryCheckpoint): string | null {
  const prevW = previous.workspace_path !== null;
  const nextW = next.workspace_path !== null;
  if (prevW && !nextW) return "established workspace facts must not disappear";
  if (!prevW || !nextW) return null;
  if (next.workspace_path !== previous.workspace_path) return "workspace_path must not change once established";

  const edge = `${previous.phase}>${next.phase}`;
  const terminal = TERMINAL_PHASE_SET.has(next.phase);

  if (terminal) {
    // Read-only observation allowed; a commit must never regress to a
    // pre-commit workspace head.
    if (previous.commit_sha !== null && next.workspace_head_sha !== previous.workspace_head_sha) {
      return "workspace head must not regress after the commit is established";
    }
    if (previous.commit_sha !== null && next.workspace_has_changes !== false) {
      return "workspace must stay clean after the commit is established";
    }
    return null;
  }

  if (previous.phase === "d06_in_progress" && next.phase === "d06_completed") {
    if (next.workspace_head_sha !== previous.workspace_head_sha) return "workspace head must not change entering d06_completed";
    if (previous.workspace_has_changes !== false || next.workspace_has_changes !== true) {
      return "workspace_has_changes must move false to true entering d06_completed";
    }
    return null;
  }
  if (previous.phase === "publish_intent_persisted" && next.phase === "commit_reconciled") {
    if (next.workspace_head_sha !== next.commit_sha) return "workspace head must become the commit sha entering commit_reconciled";
    if (previous.workspace_has_changes !== true || next.workspace_has_changes !== false) {
      return "workspace_has_changes must move true to false entering commit_reconciled";
    }
    return null;
  }
  if (WORKSPACE_DIGEST_MAY_CHANGE.has(edge)) {
    if (next.workspace_head_sha !== previous.workspace_head_sha) return "workspace head must not change";
    if (next.workspace_has_changes !== previous.workspace_has_changes) return "workspace_has_changes must not change";
    return null;
  }
  if (
    next.workspace_head_sha !== previous.workspace_head_sha ||
    next.workspace_status_digest_sha256 !== previous.workspace_status_digest_sha256 ||
    next.workspace_has_changes !== previous.workspace_has_changes
  ) {
    return "workspace facts must not change on this transition";
  }
  return null;
}

/**
 * Pure transition validator. Both values must be canonical checkpoints.
 * Verifies the generation-linear, CAS-protected, fork-preventing chain
 * contract: generation +1, previous ref equals the content-derived ref of
 * the previous checkpoint, immutable bindings unchanged, elapsed monotonic,
 * existing facts never altered or dropped, workspace observations bounded
 * by the allowed matrix, and the phase edge inside the explicit graph.
 * Never throws — returns ok/failure.
 */
export function validateLoopDeliveryCheckpointTransition(
  previous: unknown,
  next: unknown,
): LoopDeliveryCheckpointTransitionResult {
  try {
    const budget: Budget = { used: 0, maxBytes: LOOP_DELIVERY_CHECKPOINT_MAX_BYTES };
    const prevRoot = scanPlainObject(previous, ROOT_KEYS, "previous");
    const prevValue = validateRoot(prevRoot, budget);
    const nextRoot = scanPlainObject(next, ROOT_KEYS, "next");
    const nextValue = validateRoot(nextRoot, budget);

    if (TERMINAL_PHASE_SET.has(prevValue.phase)) {
      return transitionFailure("terminal checkpoints must not transition");
    }
    if (nextValue.generation !== prevValue.generation + 1) {
      return transitionFailure("generation must increment by exactly one");
    }
    const prevRef = loopDeliveryCheckpointRef(prevValue);
    if (nextValue.previous_checkpoint_artifact_ref !== prevRef) {
      return transitionFailure("previous checkpoint artifact ref must match the previous generation");
    }
    if (prevValue.identity.runId !== nextValue.identity.runId ||
        prevValue.identity.requirementId !== nextValue.identity.requirementId ||
        prevValue.identity.repository !== nextValue.identity.repository ||
        prevValue.identity.repositoryPath !== nextValue.identity.repositoryPath ||
        prevValue.identity.baseBranch !== nextValue.identity.baseBranch ||
        prevValue.identity.expectedBaseSha !== nextValue.identity.expectedBaseSha ||
        prevValue.identity.taskBranch !== nextValue.identity.taskBranch ||
        prevValue.identity.controlRoot !== nextValue.identity.controlRoot ||
        prevValue.identity.createdAt !== nextValue.identity.createdAt) {
      return transitionFailure("identity bindings must not change");
    }
    if (prevValue.target_repository !== nextValue.target_repository ||
        prevValue.base_branch !== nextValue.base_branch ||
        prevValue.expected_base_sha !== nextValue.expected_base_sha ||
        prevValue.task_branch !== nextValue.task_branch ||
        prevValue.source_head_sha !== nextValue.source_head_sha ||
        prevValue.source_wip_digest_sha256 !== nextValue.source_wip_digest_sha256 ||
        prevValue.deadline_origin_ms !== nextValue.deadline_origin_ms ||
        prevValue.max_total_duration_ms !== nextValue.max_total_duration_ms) {
      return transitionFailure("immutable bindings must not change");
    }
    if (nextValue.elapsed_ms < prevValue.elapsed_ms) {
      return transitionFailure("elapsed_ms must not regress");
    }
    const refFields: Array<[string, string | null]> = [
      ["orchestration", prevValue.orchestration_result_artifact_ref], ["orchestration", nextValue.orchestration_result_artifact_ref],
      ["executor", prevValue.executor_input_artifact_ref], ["executor", nextValue.executor_input_artifact_ref],
      ["delivery", prevValue.delivery_result_artifact_ref], ["delivery", nextValue.delivery_result_artifact_ref],
      ["governance", prevValue.governance_tail_result_artifact_ref], ["governance", nextValue.governance_tail_result_artifact_ref],
      ["publish_intent", prevValue.publish_intent_artifact_ref], ["publish_intent", nextValue.publish_intent_artifact_ref],
      ["publish_result", prevValue.publish_result_artifact_ref], ["publish_result", nextValue.publish_result_artifact_ref],
    ];
    for (let index = 0; index < refFields.length; index += 2) {
      const prev = refFields[index]![1];
      const next = refFields[index + 1]![1];
      if (prev !== null && prev !== next) {
        return transitionFailure(`${refFields[index]![0]} artifact ref must not change once established`);
      }
    }
    const factFields: Array<[string, string | number | null]> = [
      ["commit", prevValue.commit_sha], ["commit", nextValue.commit_sha],
      ["remote branch", prevValue.remote_branch_sha], ["remote branch", nextValue.remote_branch_sha],
      ["pr number", prevValue.pr_number], ["pr number", nextValue.pr_number],
      ["pr url", prevValue.pr_url], ["pr url", nextValue.pr_url],
      ["pr body", prevValue.pr_body_sha256], ["pr body", nextValue.pr_body_sha256],
    ];
    for (let index = 0; index < factFields.length; index += 2) {
      const prev = factFields[index]![1];
      const next = factFields[index + 1]![1];
      if (prev !== null && prev !== next) {
        return transitionFailure(`${factFields[index]![0]} fact must not change once established`);
      }
    }
    const allowed = LOOP_DELIVERY_CHECKPOINT_TRANSITIONS[prevValue.phase];
    if (!allowed.includes(nextValue.phase)) {
      return transitionFailure("phase transition is not allowed by the checkpoint graph");
    }
    const workspaceIssue = validateWorkspaceTransition(prevValue, nextValue);
    if (workspaceIssue !== null) return transitionFailure(workspaceIssue);
    return freeze({ ok: true as const });
  } catch (error) {
    if (error instanceof ValidationError) return transitionFailure(error.message);
    return transitionFailure("checkpoint transition inputs are invalid");
  }
}
