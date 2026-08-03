// LOOP Executor Kernel — Governance Tail Result Contract (D09-A1)
// =================================================================
// Pure module. No fs, child_process, Git, network, process.env,
// Runtime/Gateway/Graph, or Artifact Store direct calls.
//
// Builds/parses the canonical, deterministic, fail-closed
// `loop-governance-tail-result-v1` artifact: the completed-only completion
// aggregation contract transported between the Shared Documentation
// Governance Tail and governed D07 publish (D09 accepted boundary items
// 6→7). It expresses ONLY that the Shared Tail has formally completed and
// is eligible for governed publish. It never expresses pending, blocked,
// failed or partial state.
//
// This artifact is completion evidence aggregation, NOT the completion
// decision owner — the Tail Completion Gate and the Manifest remain the
// formal completion decision and current-status authorities.

import { createHash } from "node:crypto";
import { validateLoopRunIdentity } from "./loop-run-state";
import type { LoopRunIdentity } from "./loop-executor-types";

// ═══════════════════════════════════════ Types

export type LoopGovernanceTailEvidenceResult = "PASS" | "PASS_WITH_RISK";
export type LoopGovernanceTailSyncDecision = "SYNC_REQUIRED" | "NOT_REQUIRED";
export type LoopGovernanceTailReconcileDecision = "required" | "not_required";
export type LoopGovernanceTailEntryCoverageStatus = "PASS" | "not_applicable";
export type LoopGovernanceTailReGateStatus = "PASS" | "not_required";

export interface LoopGovernanceTailEvidenceRef {
  readonly path: string;
  readonly version: string;
  readonly digest_sha256: string;
}

export interface LoopGovernanceTailDecisionBasis {
  readonly scope: string;
  readonly reason: string;
  readonly evidence: string;
  readonly decision_source: string;
  readonly decision_owner: string;
  readonly version_basis: string;
  readonly stale_condition: string;
}

export interface LoopGovernanceTailFinalWorkspace {
  readonly workspace_path: string;
  readonly task_branch: string;
  readonly task_head_sha: string;
  readonly status_digest_sha256: string;
  readonly task_has_changes: true;
}

export interface LoopGovernanceTailDocFlowReview {
  readonly path: string;
  readonly version: string;
  readonly digest_sha256: string;
  readonly result: LoopGovernanceTailEvidenceResult;
}

export interface LoopGovernanceTailDocFlow {
  readonly implementation_record: LoopGovernanceTailEvidenceRef;
  readonly code_review: LoopGovernanceTailDocFlowReview;
  readonly test_acceptance: LoopGovernanceTailDocFlowReview;
}

export interface LoopGovernanceTailBusinessDomainSync {
  readonly decision: LoopGovernanceTailSyncDecision;
  readonly write_authorized: boolean;
  readonly execution_status: string;
  readonly evidence: LoopGovernanceTailEvidenceRef | null;
  readonly basis: LoopGovernanceTailDecisionBasis | null;
}

export interface LoopGovernanceTailReconcile {
  readonly decision: LoopGovernanceTailReconcileDecision;
  readonly execution_status: string;
  readonly evidence: LoopGovernanceTailEvidenceRef | null;
  readonly basis: LoopGovernanceTailDecisionBasis | null;
}

export interface LoopGovernanceTailEntryCoverage {
  readonly status: LoopGovernanceTailEntryCoverageStatus;
  readonly evidence: LoopGovernanceTailEvidenceRef | null;
  readonly basis: LoopGovernanceTailDecisionBasis | null;
}

export interface LoopGovernanceTailReGate {
  readonly status: LoopGovernanceTailReGateStatus;
  readonly evidence: LoopGovernanceTailEvidenceRef | null;
  readonly basis: LoopGovernanceTailDecisionBasis | null;
}

export interface LoopGovernanceTailManifest {
  readonly path: string;
  readonly version: string;
  readonly digest_sha256: string;
  readonly tail_status: "completed";
  readonly completion_evidence: ReadonlyArray<LoopGovernanceTailEvidenceRef>;
  readonly completion_decision_source: LoopGovernanceTailEvidenceRef;
}

export interface LoopGovernanceTailTailGate {
  readonly path: string;
  readonly version: string;
  readonly digest_sha256: string;
  readonly result: LoopGovernanceTailEvidenceResult;
  readonly persisted: true;
  readonly read_back_verified: true;
  readonly reviewed_manifest_version: string;
  readonly completion_decision_source: LoopGovernanceTailEvidenceRef;
}

export interface LoopGovernanceTailResult {
  readonly schema: "loop-governance-tail-result-v1";
  readonly status: "completed";
  readonly reason_code: "GOVERNANCE_TAIL_COMPLETED";
  readonly identity: LoopRunIdentity;
  readonly orchestration_result_artifact_ref: string;
  readonly executor_input_artifact_ref: string;
  readonly delivery_result_artifact_ref: string;
  readonly final_workspace: LoopGovernanceTailFinalWorkspace;
  readonly implementation_files: ReadonlyArray<string>;
  readonly files: ReadonlyArray<string>;
  readonly docflow: LoopGovernanceTailDocFlow;
  readonly business_domain_sync: LoopGovernanceTailBusinessDomainSync;
  readonly reconcile: LoopGovernanceTailReconcile;
  readonly entry_coverage: LoopGovernanceTailEntryCoverage;
  readonly regate: LoopGovernanceTailReGate;
  readonly manifest: LoopGovernanceTailManifest;
  readonly tail_gate: LoopGovernanceTailTailGate;
  readonly blocking_items: ReadonlyArray<never>;
  readonly elapsed_ms: number;
}

export interface LoopGovernanceTailResultBuildSuccess {
  readonly ok: true;
  readonly value: Readonly<LoopGovernanceTailResult>;
  readonly text: string;
  readonly bytes: Uint8Array;
  readonly digestSha256: string;
  readonly sizeBytes: number;
}

export type LoopGovernanceTailResultFailureReason = "invalid_input" | "invalid_bytes" | "too_large";

export interface LoopGovernanceTailResultFailure {
  readonly ok: false;
  readonly reason: LoopGovernanceTailResultFailureReason;
  readonly diagnostic: string;
}

export type LoopGovernanceTailResultBuildResult =
  | LoopGovernanceTailResultBuildSuccess
  | LoopGovernanceTailResultFailure;

// ═══════════════════════════════════════ Constants

export const LOOP_GOVERNANCE_TAIL_RESULT_SCHEMA = "loop-governance-tail-result-v1" as const;
export const LOOP_GOVERNANCE_TAIL_RESULT_STATUS = "completed" as const;
export const LOOP_GOVERNANCE_TAIL_RESULT_REASON_CODE = "GOVERNANCE_TAIL_COMPLETED" as const;

export const LOOP_GOVERNANCE_TAIL_RESULT_MAX_BYTES = 1_048_576;

const MAX_STRING_UTF8_BYTES = 65_536;
const MAX_PATH_LENGTH = 1_024;
const MAX_ARRAY_ELEMENTS = 4_096;
const MAX_DIAGNOSTIC_LENGTH = 256;
const MAX_ELAPSED_MS = 3_600_000;

const CONTROL_RE = /[\x00-\x1f\x7f-\x9f]/;
const SHA40_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const UPSTREAM_REF_RE = /^loop-artifact:v1:(orchestration_result|executor_input|delivery_result):sha256:[0-9a-f]{64}$/;
const DRIVE_RE = /^[A-Za-z]:/;
const INDEX_KEY_RE = /^(0|[1-9][0-9]*)$/;

const DIR_03 = "03-实现记录";
const DIR_04 = "04-代码审核";
const DIR_05 = "05-测试验收";

const EVIDENCE_RESULTS: readonly string[] = ["PASS", "PASS_WITH_RISK"];
const SYNC_DECISIONS: readonly string[] = ["SYNC_REQUIRED", "NOT_REQUIRED"];
const RECONCILE_DECISIONS: readonly string[] = ["required", "not_required"];
const ENTRY_STATUSES: readonly string[] = ["PASS", "not_applicable"];
const REGATE_STATUSES: readonly string[] = ["PASS", "not_required"];

const ROOT_KEYS = [
  "schema", "status", "reason_code", "identity", "orchestration_result_artifact_ref",
  "executor_input_artifact_ref", "delivery_result_artifact_ref", "final_workspace",
  "implementation_files", "files", "docflow", "business_domain_sync", "reconcile",
  "entry_coverage", "regate", "manifest", "tail_gate", "blocking_items", "elapsed_ms",
] as const;

const IDENTITY_KEYS = [
  "runId", "requirementId", "repository", "repositoryPath", "baseBranch",
  "expectedBaseSha", "taskBranch", "controlRoot", "createdAt",
] as const;

const EVIDENCE_REF_KEYS = ["path", "version", "digest_sha256"] as const;
const BASIS_KEYS = ["scope", "reason", "evidence", "decision_source", "decision_owner", "version_basis", "stale_condition"] as const;
const REVIEW_KEYS = ["path", "version", "digest_sha256", "result"] as const;
const WORKSPACE_KEYS = ["workspace_path", "task_branch", "task_head_sha", "status_digest_sha256", "task_has_changes"] as const;
const DOCFLOW_KEYS = ["implementation_record", "code_review", "test_acceptance"] as const;
const SYNC_KEYS = ["decision", "write_authorized", "execution_status", "evidence", "basis"] as const;
const RECONCILE_KEYS = ["decision", "execution_status", "evidence", "basis"] as const;
const ENTRY_KEYS = ["status", "evidence", "basis"] as const;
const REGATE_KEYS = ["status", "evidence", "basis"] as const;
const MANIFEST_KEYS = ["path", "version", "digest_sha256", "tail_status", "completion_evidence", "completion_decision_source"] as const;
const TAIL_GATE_KEYS = ["path", "version", "digest_sha256", "result", "persisted", "read_back_verified", "reviewed_manifest_version", "completion_decision_source"] as const;

// ═══════════════════════════════════════ Internal error model

/**
 * Internal validation failure. Carries a static, safe diagnostic (field name
 * and constraint only — never raw input values, never unknown exception
 * text). All untrusted-input paths converge here and are converted to
 * failure results at the module boundary; no unknown exception propagates.
 */
class ValidationError extends Error {
  readonly reason: LoopGovernanceTailResultFailureReason;
  constructor(reason: LoopGovernanceTailResultFailureReason, diagnostic: string) {
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

function failure(reason: LoopGovernanceTailResultFailureReason, diagnostic: string): LoopGovernanceTailResultFailure {
  const sanitized = diagnostic.replace(CONTROL_RE, " ").slice(0, MAX_DIAGNOSTIC_LENGTH);
  return freeze({ ok: false as const, reason, diagnostic: sanitized });
}

/** Byte budget tracked during validation; throws before any unbounded copy. */
interface Budget {
  used: number;
  maxBytes: number;
}

// ═══════════════════════════════════════ Descriptor-based plain scans
// Single descriptor snapshot per object/array; every later read uses the
// snapshot, never the original. Proxy/revoked-Proxy reflection failures
// fail closed. No getters, no symbol keys, no "__proto__", no accessors.

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
  const out = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key === "symbol") throw new ValidationError("invalid_input", `${label} has a symbol key`);
    if (key === "__proto__") throw new ValidationError("invalid_input", `${label} has a __proto__ key`);
    if (!allowed.includes(key)) throw new ValidationError("invalid_input", `${label} has an unknown key`);
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

function scanPlainArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new ValidationError("invalid_input", `${label} must be an array`);
  let keys: Array<string | symbol>;
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    throw new ValidationError("invalid_input", `${label} ownKeys reflection failed`);
  }
  // One descriptor snapshot; never read the original afterwards.
  const snapshot = new Map<string | symbol, unknown>();
  for (const key of keys) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      throw new ValidationError("invalid_input", `${label} descriptor reflection failed`);
    }
    if (descriptor === undefined || "get" in descriptor || "set" in descriptor || !("value" in descriptor)) {
      throw new ValidationError("invalid_input", `${label} has an invalid property descriptor`);
    }
    snapshot.set(key, descriptor.value);
  }
  const lengthValue = snapshot.get("length");
  if (typeof lengthValue !== "number" || !Number.isSafeInteger(lengthValue) || lengthValue < 0) {
    throw new ValidationError("invalid_input", `${label} length must be a non-negative safe integer`);
  }
  const indexKeys: string[] = [];
  for (const key of keys) {
    if (key === "length") continue;
    if (typeof key !== "string" || !INDEX_KEY_RE.test(key)) {
      throw new ValidationError("invalid_input", `${label} must not have extra own properties`);
    }
    indexKeys.push(key);
  }
  // Dense arrays only: sparse arrays and holes are rejected.
  if (indexKeys.length !== lengthValue) {
    throw new ValidationError("invalid_input", `${label} must be a dense array`);
  }
  if (lengthValue > MAX_ARRAY_ELEMENTS) {
    throw new ValidationError("invalid_input", `${label} exceeds the element bound`);
  }
  const out: unknown[] = new Array(lengthValue);
  for (let index = 0; index < lengthValue; index += 1) {
    out[index] = snapshot.get(String(index));
  }
  return out;
}

// ═══════════════════════════════════════ Scalar helpers

function chargeString(value: unknown, label: string, budget: Budget): string {
  if (typeof value !== "string") throw new ValidationError("invalid_input", `${label} must be a string`);
  if (CONTROL_RE.test(value)) throw new ValidationError("invalid_input", `${label} must not contain control characters`);
  const utf8 = new TextEncoder().encode(value);
  if (utf8.length > MAX_STRING_UTF8_BYTES) {
    throw new ValidationError("invalid_input", `${label} exceeds the per-string byte bound`);
  }
  budget.used += utf8.length;
  if (budget.used > budget.maxBytes) throw new TooLargeError("artifact exceeds maxBytes");
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

// ═══════════════════════════════════════ Repository-relative paths

function validateRepositoryPath(value: unknown, label: string, budget: Budget): string {
  const path = asTrimmedString(value, label, budget);
  if (path.length > MAX_PATH_LENGTH) throw new ValidationError("invalid_input", `${label} exceeds the path length bound`);
  if (path.startsWith("/")) throw new ValidationError("invalid_input", `${label} must not be an absolute path`);
  if (path.includes("\\")) throw new ValidationError("invalid_input", `${label} must use forward slashes`);
  if (DRIVE_RE.test(path)) throw new ValidationError("invalid_input", `${label} must not be a drive path`);
  if (path === ".git") throw new ValidationError("invalid_input", `${label} must not be the git directory`);
  if (path.startsWith(".git/")) throw new ValidationError("invalid_input", `${label} must not live under the git directory`);
  const segments = path.split("/");
  for (const segment of segments) {
    if (segment.length === 0) throw new ValidationError("invalid_input", `${label} must not contain empty segments`);
    if (segment === "." || segment === "..") throw new ValidationError("invalid_input", `${label} must not contain dot segments`);
  }
  return path;
}

function pathContainsDir(path: string, dir: string): boolean {
  return path.split("/").includes(dir);
}

function validatePathList(value: unknown, label: string, budget: Budget): string[] {
  const raw = scanPlainArray(value, label);
  if (raw.length === 0) throw new ValidationError("invalid_input", `${label} must not be empty`);
  const out: string[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    out.push(validateRepositoryPath(raw[index], `${label}[${index}]`, budget));
  }
  // Strictly sorted ascending — the builder never sorts or silently dedupes.
  for (let index = 1; index < out.length; index += 1) {
    if (!(out[index - 1]! < out[index]!)) {
      throw new ValidationError("invalid_input", `${label} must be strictly sorted ascending with no duplicates`);
    }
  }
  return out;
}

// ═══════════════════════════════════════ Evidence ref and decision basis

function validateEvidenceRef(
  value: unknown,
  label: string,
  budget: Budget,
  files: Set<string>,
  requiredDir?: string,
): LoopGovernanceTailEvidenceRef {
  const record = scanPlainObject(value, EVIDENCE_REF_KEYS, label);
  const path = validateRepositoryPath(record.path, `${label}.path`, budget);
  if (!files.has(path)) throw new ValidationError("invalid_input", `${label}.path must appear in root files`);
  if (requiredDir !== undefined && !pathContainsDir(path, requiredDir)) {
    throw new ValidationError("invalid_input", `${label}.path must live under ${requiredDir}`);
  }
  const version = asTrimmedString(record.version, `${label}.version`, budget);
  const digest = asSha256(record.digest_sha256, `${label}.digest_sha256`, budget);
  return freeze({ path, version, digest_sha256: digest });
}

function validateDecisionBasis(value: unknown, label: string, budget: Budget): LoopGovernanceTailDecisionBasis {
  const record = scanPlainObject(value, BASIS_KEYS, label);
  const out = Object.create(null) as Record<string, unknown>;
  for (const key of BASIS_KEYS) {
    out[key] = asTrimmedString(record[key], `${label}.${key}`, budget);
  }
  return freeze(out) as unknown as LoopGovernanceTailDecisionBasis;
}

function validateReviewRecord(
  value: unknown,
  label: string,
  budget: Budget,
  files: Set<string>,
  requiredDir: string,
): LoopGovernanceTailDocFlowReview {
  const record = scanPlainObject(value, REVIEW_KEYS, label);
  const path = validateRepositoryPath(record.path, `${label}.path`, budget);
  if (!files.has(path)) throw new ValidationError("invalid_input", `${label}.path must appear in root files`);
  if (!pathContainsDir(path, requiredDir)) {
    throw new ValidationError("invalid_input", `${label}.path must live under ${requiredDir}`);
  }
  const version = asTrimmedString(record.version, `${label}.version`, budget);
  const digest = asSha256(record.digest_sha256, `${label}.digest_sha256`, budget);
  const result = record.result;
  if (typeof result !== "string" || !EVIDENCE_RESULTS.includes(result)) {
    throw new ValidationError("invalid_input", `${label}.result must be PASS or PASS_WITH_RISK`);
  }
  return freeze({ path, version, digest_sha256: digest, result: result as LoopGovernanceTailEvidenceResult });
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

// ═══════════════════════════════════════ Upstream artifact refs

function validateUpstreamRef(value: unknown, expectedKind: string, label: string, budget: Budget): string {
  const text = asTrimmedString(value, label, budget);
  const match = UPSTREAM_REF_RE.exec(text);
  if (match === null || match[1] !== expectedKind) {
    throw new ValidationError("invalid_input", `${label} must be a canonical loop-artifact:v1:${expectedKind} reference`);
  }
  return text;
}

// ═══════════════════════════════════════ Section validators

function validateFinalWorkspace(
  value: unknown,
  budget: Budget,
  identityTaskBranch: string,
): LoopGovernanceTailFinalWorkspace {
  const record = scanPlainObject(value, WORKSPACE_KEYS, "final_workspace");
  const workspacePath = asAbsolutePathString(record.workspace_path, "final_workspace.workspace_path", budget);
  const taskBranch = asTrimmedString(record.task_branch, "final_workspace.task_branch", budget);
  if (taskBranch !== identityTaskBranch) {
    throw new ValidationError("invalid_input", "final_workspace.task_branch must equal identity.taskBranch");
  }
  const taskHeadSha = asSha40(record.task_head_sha, "final_workspace.task_head_sha", budget);
  const statusDigest = asSha256(record.status_digest_sha256, "final_workspace.status_digest_sha256", budget);
  if (record.task_has_changes !== true) {
    throw new ValidationError("invalid_input", "final_workspace.task_has_changes must be true");
  }
  return freeze({
    workspace_path: workspacePath,
    task_branch: taskBranch,
    task_head_sha: taskHeadSha,
    status_digest_sha256: statusDigest,
    task_has_changes: true as const,
  });
}

function validateDocFlow(value: unknown, budget: Budget, files: Set<string>): LoopGovernanceTailDocFlow {
  const record = scanPlainObject(value, DOCFLOW_KEYS, "docflow");
  const implementationRecord = validateEvidenceRef(record.implementation_record, "docflow.implementation_record", budget, files, DIR_03);
  const codeReview = validateReviewRecord(record.code_review, "docflow.code_review", budget, files, DIR_04);
  const testAcceptance = validateReviewRecord(record.test_acceptance, "docflow.test_acceptance", budget, files, DIR_05);
  return freeze({ implementation_record: implementationRecord, code_review: codeReview, test_acceptance: testAcceptance });
}

function validateBusinessDomainSync(value: unknown, budget: Budget, files: Set<string>): LoopGovernanceTailBusinessDomainSync {
  const record = scanPlainObject(value, SYNC_KEYS, "business_domain_sync");
  const decision = record.decision;
  if (decision === "SYNC_REQUIRED") {
    if (record.write_authorized !== true) {
      throw new ValidationError("invalid_input", "business_domain_sync.write_authorized must be true when decision is SYNC_REQUIRED");
    }
    if (record.execution_status !== "completed") {
      throw new ValidationError("invalid_input", "business_domain_sync.execution_status must be completed when decision is SYNC_REQUIRED");
    }
    if (record.basis !== null) {
      throw new ValidationError("invalid_input", "business_domain_sync.basis must be null when decision is SYNC_REQUIRED");
    }
    const evidence = validateEvidenceRef(record.evidence, "business_domain_sync.evidence", budget, files);
    return freeze({
      decision: "SYNC_REQUIRED" as const,
      write_authorized: true,
      execution_status: "completed" as const,
      evidence,
      basis: null,
    });
  }
  if (decision === "NOT_REQUIRED") {
    if (record.write_authorized !== false) {
      throw new ValidationError("invalid_input", "business_domain_sync.write_authorized must be false when decision is NOT_REQUIRED");
    }
    if (record.execution_status !== "not_required") {
      throw new ValidationError("invalid_input", "business_domain_sync.execution_status must be not_required when decision is NOT_REQUIRED");
    }
    if (record.evidence !== null) {
      throw new ValidationError("invalid_input", "business_domain_sync.evidence must be null when decision is NOT_REQUIRED");
    }
    const basis = validateDecisionBasis(record.basis, "business_domain_sync.basis", budget);
    return freeze({
      decision: "NOT_REQUIRED" as const,
      write_authorized: false,
      execution_status: "not_required" as const,
      evidence: null,
      basis,
    });
  }
  throw new ValidationError("invalid_input", "business_domain_sync.decision must be SYNC_REQUIRED or NOT_REQUIRED");
}

function validateReconcile(value: unknown, budget: Budget, files: Set<string>): LoopGovernanceTailReconcile {
  const record = scanPlainObject(value, RECONCILE_KEYS, "reconcile");
  const decision = record.decision;
  if (decision === "required") {
    if (record.execution_status !== "completed") {
      throw new ValidationError("invalid_input", "reconcile.execution_status must be completed when decision is required");
    }
    if (record.basis !== null) {
      throw new ValidationError("invalid_input", "reconcile.basis must be null when decision is required");
    }
    const evidence = validateEvidenceRef(record.evidence, "reconcile.evidence", budget, files);
    return freeze({ decision: "required" as const, execution_status: "completed" as const, evidence, basis: null });
  }
  if (decision === "not_required") {
    if (record.execution_status !== "not_required") {
      throw new ValidationError("invalid_input", "reconcile.execution_status must be not_required when decision is not_required");
    }
    if (record.evidence !== null) {
      throw new ValidationError("invalid_input", "reconcile.evidence must be null when decision is not_required");
    }
    const basis = validateDecisionBasis(record.basis, "reconcile.basis", budget);
    return freeze({ decision: "not_required" as const, execution_status: "not_required" as const, evidence: null, basis });
  }
  throw new ValidationError("invalid_input", "reconcile.decision must be required or not_required");
}

function validateEntryCoverage(value: unknown, budget: Budget, files: Set<string>): LoopGovernanceTailEntryCoverage {
  const record = scanPlainObject(value, ENTRY_KEYS, "entry_coverage");
  const status = record.status;
  if (status === "PASS") {
    if (record.basis !== null) {
      throw new ValidationError("invalid_input", "entry_coverage.basis must be null when status is PASS");
    }
    const evidence = validateEvidenceRef(record.evidence, "entry_coverage.evidence", budget, files);
    return freeze({ status: "PASS" as const, evidence, basis: null });
  }
  if (status === "not_applicable") {
    if (record.evidence !== null) {
      throw new ValidationError("invalid_input", "entry_coverage.evidence must be null when status is not_applicable");
    }
    const basis = validateDecisionBasis(record.basis, "entry_coverage.basis", budget);
    return freeze({ status: "not_applicable" as const, evidence: null, basis });
  }
  throw new ValidationError("invalid_input", "entry_coverage.status must be PASS or not_applicable");
}

function validateReGate(value: unknown, budget: Budget, files: Set<string>): LoopGovernanceTailReGate {
  const record = scanPlainObject(value, REGATE_KEYS, "regate");
  const status = record.status;
  if (status === "PASS") {
    if (record.basis !== null) {
      throw new ValidationError("invalid_input", "regate.basis must be null when status is PASS");
    }
    const evidence = validateEvidenceRef(record.evidence, "regate.evidence", budget, files);
    return freeze({ status: "PASS" as const, evidence, basis: null });
  }
  if (status === "not_required") {
    if (record.evidence !== null) {
      throw new ValidationError("invalid_input", "regate.evidence must be null when status is not_required");
    }
    const basis = validateDecisionBasis(record.basis, "regate.basis", budget);
    return freeze({ status: "not_required" as const, evidence: null, basis });
  }
  throw new ValidationError("invalid_input", "regate.status must be PASS or not_required");
}

function validateManifest(
  value: unknown,
  budget: Budget,
  files: Set<string>,
  docflow: LoopGovernanceTailDocFlow,
  sync: LoopGovernanceTailBusinessDomainSync,
  reconcile: LoopGovernanceTailReconcile,
  entry: LoopGovernanceTailEntryCoverage,
  regate: LoopGovernanceTailReGate,
): LoopGovernanceTailManifest {
  const record = scanPlainObject(value, MANIFEST_KEYS, "manifest");
  const path = validateRepositoryPath(record.path, "manifest.path", budget);
  if (!files.has(path)) throw new ValidationError("invalid_input", "manifest.path must appear in root files");
  const fileName = path.split("/").pop()!;
  if (fileName !== "manifest.md") {
    throw new ValidationError("invalid_input", "manifest.path must be a file named manifest.md");
  }
  const version = asTrimmedString(record.version, "manifest.version", budget);
  const digest = asSha256(record.digest_sha256, "manifest.digest_sha256", budget);
  if (record.tail_status !== "completed") {
    throw new ValidationError("invalid_input", "manifest.tail_status must be completed");
  }

  const rawEvidence = scanPlainArray(record.completion_evidence, "manifest.completion_evidence");
  if (rawEvidence.length === 0) {
    throw new ValidationError("invalid_input", "manifest.completion_evidence must not be empty");
  }
  const completionEvidence: LoopGovernanceTailEvidenceRef[] = [];
  let previousPath: string | null = null;
  for (let index = 0; index < rawEvidence.length; index += 1) {
    const entry = validateEvidenceRef(rawEvidence[index], `manifest.completion_evidence[${index}]`, budget, files);
    if (previousPath !== null && !(previousPath < entry.path)) {
      throw new ValidationError("invalid_input", "manifest.completion_evidence must be sorted by path with no duplicates");
    }
    previousPath = entry.path;
    completionEvidence.push(entry);
  }

  // The completion evidence must include every evidence actually aggregated:
  // docflow 03/04/05 and every non-null conditional evidence.
  const requiredRefs: Array<{ ref: LoopGovernanceTailEvidenceRef | null; name: string }> = [
    { ref: docflow.implementation_record, name: "implementation_record" },
    {
      ref: { path: docflow.code_review.path, version: docflow.code_review.version, digest_sha256: docflow.code_review.digest_sha256 },
      name: "code_review",
    },
    {
      ref: { path: docflow.test_acceptance.path, version: docflow.test_acceptance.version, digest_sha256: docflow.test_acceptance.digest_sha256 },
      name: "test_acceptance",
    },
    { ref: sync.evidence, name: "business_domain_sync evidence" },
    { ref: reconcile.evidence, name: "reconcile evidence" },
    { ref: entry.evidence, name: "entry_coverage evidence" },
    { ref: regate.evidence, name: "regate evidence" },
  ];
  for (const item of requiredRefs) {
    if (item.ref === null) continue;
    const match = completionEvidence.some(
      (entry) => entry.path === item.ref!.path && entry.version === item.ref!.version && entry.digest_sha256 === item.ref!.digest_sha256,
    );
    if (!match) {
      throw new ValidationError("invalid_input", `manifest.completion_evidence must include ${item.name}`);
    }
  }

  const completionDecisionSource = validateEvidenceRef(record.completion_decision_source, "manifest.completion_decision_source", budget, files);
  return freeze({
    path,
    version,
    digest_sha256: digest,
    tail_status: "completed" as const,
    completion_evidence: freeze(completionEvidence),
    completion_decision_source: completionDecisionSource,
  });
}

function validateTailGate(value: unknown, budget: Budget, files: Set<string>, manifestVersion: string): LoopGovernanceTailTailGate {
  const record = scanPlainObject(value, TAIL_GATE_KEYS, "tail_gate");
  const path = validateRepositoryPath(record.path, "tail_gate.path", budget);
  if (!files.has(path)) throw new ValidationError("invalid_input", "tail_gate.path must appear in root files");
  if (!pathContainsDir(path, DIR_05)) {
    throw new ValidationError("invalid_input", `tail_gate.path must live under ${DIR_05}`);
  }
  const version = asTrimmedString(record.version, "tail_gate.version", budget);
  const digest = asSha256(record.digest_sha256, "tail_gate.digest_sha256", budget);
  const result = record.result;
  if (typeof result !== "string" || !EVIDENCE_RESULTS.includes(result)) {
    throw new ValidationError("invalid_input", "tail_gate.result must be PASS or PASS_WITH_RISK");
  }
  if (record.persisted !== true) {
    throw new ValidationError("invalid_input", "tail_gate.persisted must be true");
  }
  if (record.read_back_verified !== true) {
    throw new ValidationError("invalid_input", "tail_gate.read_back_verified must be true");
  }
  const reviewedManifestVersion = asTrimmedString(record.reviewed_manifest_version, "tail_gate.reviewed_manifest_version", budget);
  if (reviewedManifestVersion !== manifestVersion) {
    throw new ValidationError("invalid_input", "tail_gate.reviewed_manifest_version must equal manifest.version");
  }
  const completionDecisionSource = validateEvidenceRef(record.completion_decision_source, "tail_gate.completion_decision_source", budget, files);
  return freeze({
    path,
    version,
    digest_sha256: digest,
    result: result as LoopGovernanceTailEvidenceResult,
    persisted: true as const,
    read_back_verified: true as const,
    reviewed_manifest_version: reviewedManifestVersion,
    completion_decision_source: completionDecisionSource,
  });
}

// ═══════════════════════════════════════ Root validator (canonical value)

function validateRoot(record: Record<string, unknown>, budget: Budget): LoopGovernanceTailResult {
  if (record.schema !== LOOP_GOVERNANCE_TAIL_RESULT_SCHEMA) {
    throw new ValidationError("invalid_input", "schema must be loop-governance-tail-result-v1");
  }
  if (record.status !== LOOP_GOVERNANCE_TAIL_RESULT_STATUS) {
    throw new ValidationError("invalid_input", "status must be completed");
  }
  if (record.reason_code !== LOOP_GOVERNANCE_TAIL_RESULT_REASON_CODE) {
    throw new ValidationError("invalid_input", "reason_code must be GOVERNANCE_TAIL_COMPLETED");
  }

  const identity = validateIdentity(record.identity, budget);
  const orchestrationRef = validateUpstreamRef(record.orchestration_result_artifact_ref, "orchestration_result", "orchestration_result_artifact_ref", budget);
  const executorInputRef = validateUpstreamRef(record.executor_input_artifact_ref, "executor_input", "executor_input_artifact_ref", budget);
  const deliveryResultRef = validateUpstreamRef(record.delivery_result_artifact_ref, "delivery_result", "delivery_result_artifact_ref", budget);

  const finalWorkspace = validateFinalWorkspace(record.final_workspace, budget, identity.taskBranch);

  // File sets first: every later evidence-ref path check needs them.
  const implementationFiles = validatePathList(record.implementation_files, "implementation_files", budget);
  const files = validatePathList(record.files, "files", budget);
  const filesSet = new Set<string>(files);
  for (const implementationFile of implementationFiles) {
    if (!filesSet.has(implementationFile)) {
      throw new ValidationError("invalid_input", "implementation_files must be a subset of files");
    }
  }

  const docflow = validateDocFlow(record.docflow, budget, filesSet);
  const sync = validateBusinessDomainSync(record.business_domain_sync, budget, filesSet);
  const reconcile = validateReconcile(record.reconcile, budget, filesSet);
  const entry = validateEntryCoverage(record.entry_coverage, budget, filesSet);
  const regate = validateReGate(record.regate, budget, filesSet);

  const manifest = validateManifest(record.manifest, budget, filesSet, docflow, sync, reconcile, entry, regate);
  const tailGate = validateTailGate(record.tail_gate, budget, filesSet, manifest.version);

  // ── blocking_items exactly [] ──
  const blockingItems = scanPlainArray(record.blocking_items, "blocking_items");
  if (blockingItems.length !== 0) {
    throw new ValidationError("invalid_input", "blocking_items must be exactly []");
  }

  // ── elapsed_ms bounded safe integer ──
  const elapsedMs = record.elapsed_ms;
  if (typeof elapsedMs !== "number" || !Number.isSafeInteger(elapsedMs) || elapsedMs < 0 || elapsedMs > MAX_ELAPSED_MS) {
    throw new ValidationError("invalid_input", "elapsed_ms must be a safe integer in 0..3600000");
  }

  // ── distinct semantic paths ──
  const semanticPaths: string[] = [];
  semanticPaths.push(docflow.implementation_record.path, docflow.code_review.path, docflow.test_acceptance.path);
  if (sync.evidence !== null) semanticPaths.push(sync.evidence.path);
  if (reconcile.evidence !== null) semanticPaths.push(reconcile.evidence.path);
  if (entry.evidence !== null) semanticPaths.push(entry.evidence.path);
  if (regate.evidence !== null) semanticPaths.push(regate.evidence.path);
  semanticPaths.push(manifest.path, tailGate.path);
  const seenPaths = new Set<string>();
  for (const path of semanticPaths) {
    if (seenPaths.has(path)) {
      throw new ValidationError("invalid_input", "distinct semantic evidences must not share a path");
    }
    seenPaths.add(path);
  }

  // ── completion decision sources must equal the tail gate file itself ──
  const tailGateRef: LoopGovernanceTailEvidenceRef = { path: tailGate.path, version: tailGate.version, digest_sha256: tailGate.digest_sha256 };
  assertRefEquals(manifest.completion_decision_source, tailGateRef, "manifest.completion_decision_source");
  assertRefEquals(tailGate.completion_decision_source, tailGateRef, "tail_gate.completion_decision_source");

  // ── canonical value in fixed root property order ──
  const canonical: Record<string, unknown> = Object.create(null);
  canonical.schema = LOOP_GOVERNANCE_TAIL_RESULT_SCHEMA;
  canonical.status = LOOP_GOVERNANCE_TAIL_RESULT_STATUS;
  canonical.reason_code = LOOP_GOVERNANCE_TAIL_RESULT_REASON_CODE;
  canonical.identity = identity;
  canonical.orchestration_result_artifact_ref = orchestrationRef;
  canonical.executor_input_artifact_ref = executorInputRef;
  canonical.delivery_result_artifact_ref = deliveryResultRef;
  canonical.final_workspace = finalWorkspace;
  canonical.implementation_files = implementationFiles;
  canonical.files = files;
  canonical.docflow = docflow;
  canonical.business_domain_sync = sync;
  canonical.reconcile = reconcile;
  canonical.entry_coverage = entry;
  canonical.regate = regate;
  canonical.manifest = manifest;
  canonical.tail_gate = tailGate;
  canonical.blocking_items = blockingItems;
  canonical.elapsed_ms = elapsedMs;
  return canonical as unknown as LoopGovernanceTailResult;
}

function assertRefEquals(actual: LoopGovernanceTailEvidenceRef, expected: LoopGovernanceTailEvidenceRef, label: string): void {
  if (actual.path !== expected.path || actual.version !== expected.version || actual.digest_sha256 !== expected.digest_sha256) {
    throw new ValidationError("invalid_input", `${label} must exactly equal the tail gate file path/version/digest`);
  }
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
  if (maxBytes === undefined) return LOOP_GOVERNANCE_TAIL_RESULT_MAX_BYTES;
  if (typeof maxBytes !== "number" || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > LOOP_GOVERNANCE_TAIL_RESULT_MAX_BYTES) {
    throw new ValidationError("invalid_input", "maxBytes must be a safe integer in 1..1048576");
  }
  return maxBytes;
}

function buildSuccess(value: LoopGovernanceTailResult, maxBytes: number): LoopGovernanceTailResultBuildResult {
  const frozen = deepFreeze(value) as unknown as LoopGovernanceTailResult;
  const text = JSON.stringify(frozen) + "\n";
  const encoded = new TextEncoder().encode(text);
  // Authoritative final bound after the validated byte budget.
  if (encoded.length > maxBytes) return failure("too_large", "artifact exceeds maxBytes");
  // Fresh defensive bytes: never shares backing storage with any caller input.
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

// ═══════════════════════════════════════ Public API

export function buildLoopGovernanceTailResult(
  input: unknown,
  maxBytes?: number,
): LoopGovernanceTailResultBuildResult {
  try {
    const max = resolveMaxBytes(maxBytes);
    const budget: Budget = { used: 0, maxBytes: max };
    const root = scanPlainObject(input, ROOT_KEYS, "root");
    const value = validateRoot(root, budget);
    return buildSuccess(value, max);
  } catch (error) {
    if (error instanceof ValidationError) return failure(error.reason, error.message);
    return failure("invalid_input", "unexpected failure while building governance tail result");
  }
}

export function parseLoopGovernanceTailResultBytes(
  bytes: Uint8Array,
  maxBytes?: number,
): LoopGovernanceTailResultBuildResult {
  let max: number;
  try {
    max = resolveMaxBytes(maxBytes);
  } catch (error) {
    if (error instanceof ValidationError) return failure(error.reason, error.message);
    return failure("invalid_input", "unexpected failure while parsing governance tail result bytes");
  }
  if (!(bytes instanceof Uint8Array)) {
    return failure("invalid_input", "bytes must be a Uint8Array");
  }
  if (bytes.length > max) return failure("too_large", "artifact bytes exceed maxBytes");
  try {
    // Defensive bounded copy — all later checks run on the copy.
    const copy = new Uint8Array(bytes);
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
    // Same real validator and canonical rebuild as the builder.
    const budget: Budget = { used: 0, maxBytes: max };
    const root = scanPlainObject(parsed, ROOT_KEYS, "root");
    const value = validateRoot(root, budget);
    const rebuilt = new TextEncoder().encode(JSON.stringify(value) + "\n");
    if (!byteEquals(rebuilt, copy)) {
      return failure("invalid_bytes", "artifact bytes are not canonical (round-trip mismatch)");
    }
    const bytesOut = new Uint8Array(rebuilt);
    const digestSha256 = createHash("sha256").update(bytesOut).digest("hex");
    const frozen = deepFreeze(value) as unknown as LoopGovernanceTailResult;
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
    return failure("invalid_bytes", "artifact bytes do not form a valid governance tail result");
  }
}

function byteEquals(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}
