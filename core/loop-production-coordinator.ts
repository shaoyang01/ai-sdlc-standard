// LOOP Executor Kernel — Production Coordinator (D09-B)
// ======================================================
// Bounded, single-run, fail-closed coordinator for the governed production
// delivery chain:
//
//   fixed orchestration_result artifact ref
//   → orchestration parser (direct / DIRECT_READY)
//   → executor_input ref from the orchestration artifact
//   → executor-input parser
//   → D03 prepare
//   → D06 execute
//   → D06 delivery artifact read-back + parser
//   → injected Shared Documentation Governance Tail dependency
//   → completed Tail with persisted/read-back Tail Gate
//   → A1 build / store / read-back / parse
//   → D03 post-Tail inspect
//   → D07 governed publish
//   → D07 publish-result read-back + parser
//   → D09 succeeded
//
// Boundaries (accepted D09-B contract):
// - The ONLY root input is a fixed `loop-artifact:v1:orchestration_result:...`
//   artifact ref. No in-memory requirement/design/executor-input objects and
//   no floating or unbound refs are accepted.
// - The Shared Documentation Governance Tail is an injected typed dependency.
//   This module never re-implements Gate Runner / Sync / Reconcile / Entry
//   Coverage / the full Tail, and the tail dependency never builds or stores
//   A1, never calls D07, and never commits/pushes/creates PRs.
// - Only `completed / GOVERNANCE_TAIL_COMPLETED` tail results may carry a
//   completion package; pending/in_progress/blocked/failed never reach A1 or
//   D07.
// - A1 is built (real `buildLoopGovernanceTailResult`), stored, read back,
//   parsed and cross-bound by the coordinator; any verification failure
//   prevents D07.
// - D07 requests always include `governanceTailResultArtifactRef`; there is
//   no standalone fallback. D07 only creates a Draft PR.
// - One shared deadline starts at the first valid `execute()` clock sample
//   (`identity.createdAt` is never used as the deadline origin). D06 receives
//   `min(executor budget, remaining budget)`; the Tail and D07 are gated by
//   the remaining budget before invocation.
// - Ambiguous D06/D07 side-effect windows are blocked, never re-executed.
// - No `production_coordinator_state` / `production_coordinator_result`
//   artifacts and no new Artifact Store kinds.
//
// The four additive parsers below are strict canonical parsers for the D08 /
// D06 / D07 artifacts: bounded defensive copy, strict UTF-8, exact keys,
// canonical property order, canonical-bytes rebuild with byte-identical
// round-trip, artifact-ref/digest/identity/material binding, no-throw and
// fail-closed. They never change any existing artifact bytes and never alter
// D08/D06/D07 execution results, public fields or behavior.

import { createHash } from "node:crypto";
import { validateLoopRunIdentity } from "./loop-run-state";
import type { LoopRunIdentity } from "./loop-executor-types";
import type { LoopArtifactKind, LoopArtifactStore, LoopStoredArtifact } from "./loop-artifact-store";
import type { LoopGitWorkspaceManager, LoopGitWorkspaceSnapshot } from "./loop-git-workspace";
import type {
  LoopAutonomousDeliveryLoop,
  LoopAutonomousDeliveryRequest,
  LoopAutonomousDeliveryResult,
  LoopAutonomousDeliveryStatus,
  LoopAutonomousDeliveryReasonCode,
  LoopDeliveryCommandStep,
  LoopDeliveryResultWorkspace,
} from "./loop-autonomous-delivery-loop";
import type {
  LoopDeliveryPublisher,
  LoopDeliveryPublishMode,
  LoopDeliveryPublishReasonCode,
  LoopDeliveryPublishRecoveryStage,
  LoopDeliveryPublishRequest,
  LoopDeliveryPublishResult,
  LoopDeliveryPublishStatus,
} from "./loop-delivery-publisher";
import type { LoopDirectExecutorInput } from "./loop-requirement-design-orchestrator";
import {
  buildLoopGovernanceTailResult,
  parseLoopGovernanceTailResultBytes,
  LOOP_GOVERNANCE_TAIL_RESULT_MAX_BYTES,
  LOOP_GOVERNANCE_TAIL_RESULT_SCHEMA,
  type LoopGovernanceTailBusinessDomainSync,
  type LoopGovernanceTailDocFlow,
  type LoopGovernanceTailEntryCoverage,
  type LoopGovernanceTailFinalWorkspace,
  type LoopGovernanceTailManifest,
  type LoopGovernanceTailReconcile,
  type LoopGovernanceTailReGate,
  type LoopGovernanceTailResult,
  type LoopGovernanceTailResultBuildSuccess,
  type LoopGovernanceTailTailGate,
} from "./loop-governance-tail-result";

// ═══════════════════════════════════════ Canonical literal vocabularies
// (mirrors of the D08/D06/D07 serialized unions; the producers keep these
// module-private, so the strict parsers carry their own exact lists)

const ORCHESTRATION_ROUTES = ["direct", "speckit_pending", "multi_repo_pending", "paused", "blocked", "failed"] as const;
const ORCHESTRATION_REASON_CODES = [
  "DIRECT_READY", "MULTI_REPOSITORY", "AMBIGUITY_REQUIRES_INPUT", "PRODUCT_DECISION_REQUIRED",
  "PERMISSION_REQUIRED", "HIGH_RISK_ACCEPTANCE_REQUIRED", "COMPLEX_REQUIREMENT", "DEPENDENCY_FAILED",
  "DEPENDENCY_RESULT_INVALID", "SOLUTION_REVIEW_BLOCKED", "DESIGN_REVISION_EXHAUSTED", "INVALID_INPUT",
  "TOTAL_TIMEOUT", "CLOCK_INVALID", "ARTIFACT_STORE_FAILED", "INTERNAL_ERROR",
] as const;
const DELIVERY_STATUSES = ["succeeded", "failed", "blocked"] as const;
const DELIVERY_REASON_CODES = [
  "DELIVERY_SUCCEEDED", "INVALID_INPUT", "WORKSPACE_DRIFT", "EXECUTION_BLOCKED", "IMPLEMENTATION_FAILED",
  "TEST_FAILED", "TEST_TIMED_OUT", "TEST_OUTPUT_TRUNCATED", "TEST_WORKSPACE_MUTATED", "REVIEW_FAILED",
  "REVIEW_TIMED_OUT", "REVIEW_OUTPUT_TRUNCATED", "REVIEW_WORKSPACE_MUTATED", "REPAIR_FAILED",
  "FIX_BUDGET_EXHAUSTED", "NO_PROGRESS", "TOTAL_TIMEOUT", "ARTIFACT_STORE_FAILED",
  "DEPENDENCY_RESULT_INVALID", "INTERNAL_ERROR",
] as const;
const DELIVERY_TRACE_KINDS = [
  "implementation_initial", "test_plan_start", "test_step_pass", "test_step_fail", "test_plan_end",
  "review_plan_start", "review_step_pass", "review_step_fail", "review_plan_end", "repair_attempt",
  "evidence_stored", "terminal", "info",
] as const;
const DELIVERY_TRACE_PHASES = ["initial", "test", "review", "test_repair", "review_repair"] as const;
const PUBLISH_STATUSES = ["succeeded", "failed", "blocked"] as const;
const PUBLISH_REASON_CODES = [
  "PUBLISH_SUCCEEDED", "INVALID_INPUT", "DELIVERY_NOT_READY", "GOVERNANCE_TAIL_NOT_READY",
  "WORKSPACE_DRIFT", "WORKSPACE_STATE_CONFLICT", "BASE_BRANCH_DRIFT", "DEPENDENCY_RESULT_INVALID",
  "ARTIFACT_STORE_FAILED", "COMMIT_FAILED", "REMOTE_BRANCH_CONFLICT", "PUSH_FAILED", "PR_STATE_CONFLICT",
  "PR_CREATE_FAILED", "EXECUTION_BLOCKED", "TOTAL_TIMEOUT", "INTERNAL_ERROR",
] as const;
const PUBLISH_RECOVERY_STAGES = [
  "not_started", "delivery_verified", "governance_verified", "intent_persisted", "commit_created",
  "branch_pushed", "draft_pr_created", "completed",
] as const;
const PUBLISH_TRACE_STAGES = [
  "delivery", "workspace", "staging", "intent", "commit", "push", "draft_pr", "terminal", "governance_tail",
] as const;

// ═══════════════════════════════════════ Canonical property orders
// (exact serialized key orders produced by D08/D06/D07/A1)

const IDENTITY_KEYS = [
  "runId", "requirementId", "repository", "repositoryPath", "baseBranch", "expectedBaseSha",
  "taskBranch", "controlRoot", "createdAt",
] as const;
const ORCHESTRATION_KEYS = [
  "schema", "identity", "route", "reason_code", "rounds", "requirement_artifact_ref",
  "design_artifact_refs", "solution_review_artifact_refs", "executor_input_artifact_ref",
  "executor_input_digest_sha256", "elapsed_ms",
] as const;
const EXECUTOR_INPUT_KEYS = [
  "schema", "identity", "requirement", "designSummary", "implementationConstraints", "allowedPaths",
  "testPlan", "reviewPlan", "maxFixRounds", "maxTotalDurationMs", "commitSubject", "prTitle",
] as const;
const REQUIREMENT_KEYS = ["objective", "acceptanceCriteria", "constraints"] as const;
const DESIGN_SUMMARY_KEYS = ["approach", "components", "interfaces", "dataChanges", "riskControls"] as const;
const COMMAND_STEP_KEYS = ["id", "executableId", "args", "timeoutMs", "maxStdoutBytes", "maxStderrBytes"] as const;
const DELIVERY_KEYS = [
  "schema", "status", "reason_code", "cause_code", "total_fix_rounds", "test_attempts", "review_attempts",
  "patch_artifact_refs", "test_summary_artifact_refs", "review_summary_artifact_refs", "files",
  "final_workspace", "elapsed_ms", "trace",
] as const;
const DELIVERY_FINAL_WORKSPACE_KEYS = [
  "workspace_path", "task_branch", "task_head_sha", "status_digest_sha256", "task_has_changes",
] as const;
const DELIVERY_TRACE_KEYS = [
  "sequence", "kind", "phase", "fix_round", "attempt", "step_id", "outcome", "artifact_ref",
  "patch_artifact_ref", "patch_digest_sha256", "workspace_status_digest_sha256", "elapsed_ms",
] as const;
const PUBLISH_KEYS_GOVERNED = [
  "schema", "status", "reason_code", "cause_code", "recovery_stage", "orchestration_result_artifact_ref",
  "executor_input_artifact_ref", "delivery_result_artifact_ref", "governance_tail_result_artifact_ref",
  "publish_intent_artifact_ref", "precommit_head_sha", "commit_sha", "remote_branch_sha", "pr_number",
  "pr_url", "implementation_files", "files", "commit_created", "commit_recovered", "push_created",
  "push_recovered", "pr_created", "pr_recovered", "pr_body_sha256", "elapsed_ms", "trace",
] as const;
const PUBLISH_KEYS_STANDALONE = [
  "schema", "status", "reason_code", "cause_code", "recovery_stage", "delivery_result_artifact_ref",
  "publish_intent_artifact_ref", "precommit_head_sha", "commit_sha", "remote_branch_sha", "pr_number",
  "pr_url", "files", "commit_created", "commit_recovered", "push_created", "push_recovered",
  "pr_created", "pr_recovered", "pr_body_sha256", "elapsed_ms", "trace",
] as const;
const PUBLISH_TRACE_KEYS = [
  "sequence", "stage", "outcome", "artifact_ref", "commit_sha", "remote_branch_sha", "pr_number",
  "elapsed_ms",
] as const;

// ═══════════════════════════════════════ Bounds

const MAX_ARTIFACT_BYTES_BOUND = 16_777_216;
const DEFAULT_MAX_TOTAL_DURATION_MS = 1_800_000;
const MIN_MAX_TOTAL_DURATION_MS = 1_000;
const MAX_MAX_TOTAL_DURATION_MS = 3_600_000;
const DEFAULT_MAX_ORCHESTRATION_RESULT_BYTES = 1_048_576;
const DEFAULT_MAX_EXECUTOR_INPUT_BYTES = 1_048_576;
const DEFAULT_MAX_DELIVERY_RESULT_BYTES = 131_072;
const DEFAULT_MAX_PUBLISH_RESULT_BYTES = 65_536;
const DEFAULT_MAX_A1_BYTES = LOOP_GOVERNANCE_TAIL_RESULT_MAX_BYTES;
const MAX_SAFE_MESSAGE_LENGTH = 256;
const REF_RE = /^loop-artifact:v1:([a-z_]+):sha256:([0-9a-f]{64})$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const SHA40_RE = /^[0-9a-f]{40}$/;

// ═══════════════════════════════════════ Parser result shapes

export type LoopCanonicalParseFailureReason = "invalid_input" | "invalid_bytes" | "too_large";

export interface LoopCanonicalParseSuccess<T> {
  readonly ok: true;
  readonly value: Readonly<T>;
  readonly text: string;
  readonly bytes: Uint8Array;
  readonly digestSha256: string;
  readonly sizeBytes: number;
}

export interface LoopCanonicalParseFailure {
  readonly ok: false;
  readonly reason: LoopCanonicalParseFailureReason;
  readonly diagnostic: string;
}

export type LoopCanonicalParseResult<T> = LoopCanonicalParseSuccess<T> | LoopCanonicalParseFailure;

// ═══════════════════════════════════════ Parsed value contracts

/** Canonical value parsed from `loop_requirement_orchestration_result_v1` bytes. */
export interface LoopParsedOrchestrationResult {
  readonly schema: "loop_requirement_orchestration_result_v1";
  readonly identity: Readonly<LoopRunIdentity>;
  readonly route: string;
  readonly reasonCode: string;
  readonly rounds: number;
  readonly requirementArtifactRef: string | null;
  readonly designArtifactRefs: readonly string[];
  readonly solutionReviewArtifactRefs: readonly string[];
  readonly executorInputArtifactRef: string | null;
  readonly executorInputDigestSha256: string | null;
  readonly elapsedMs: number;
}

/** Canonical value parsed from `loop-delivery-result-v1` bytes. */
export interface LoopParsedDeliveryFinalWorkspace {
  readonly workspacePath: string;
  readonly taskBranch: string;
  readonly taskHeadSha: string;
  readonly statusDigestSha256: string;
  readonly taskHasChanges: boolean;
}

export interface LoopParsedDeliveryTraceEntry {
  readonly sequence: number;
  readonly kind: string;
  readonly phase: string;
  readonly fixRound: number;
  readonly attempt: number;
  readonly stepId: string | null;
  readonly outcome: string;
  readonly artifactRef: string | null;
  readonly patchArtifactRef: string | null;
  readonly patchDigestSha256: string | null;
  readonly workspaceStatusDigestSha256: string | null;
  readonly elapsedMs: number;
}

export interface LoopParsedDeliveryResult {
  readonly schema: "loop-delivery-result-v1";
  readonly status: LoopAutonomousDeliveryStatus;
  readonly reasonCode: LoopAutonomousDeliveryReasonCode;
  readonly causeCode: string | null;
  readonly totalFixRounds: number;
  readonly testAttempts: number;
  readonly reviewAttempts: number;
  readonly patchArtifactRefs: readonly string[];
  readonly testSummaryArtifactRefs: readonly string[];
  readonly reviewSummaryArtifactRefs: readonly string[];
  readonly files: readonly string[];
  readonly finalWorkspace: Readonly<LoopParsedDeliveryFinalWorkspace> | null;
  readonly elapsedMs: number;
  readonly trace: readonly LoopParsedDeliveryTraceEntry[];
}

export interface LoopParsedPublishTraceEntry {
  readonly sequence: number;
  readonly stage: string;
  readonly outcome: string;
  readonly artifactRef: string | null;
  readonly commitSha: string | null;
  readonly remoteBranchSha: string | null;
  readonly prNumber: number | null;
  readonly elapsedMs: number;
}

/** Canonical value parsed from `loop-governed-publish-result-v1` / `loop-publish-result-v1` bytes. */
export interface LoopParsedPublishResult {
  readonly schema: string;
  readonly status: LoopDeliveryPublishStatus;
  readonly reasonCode: LoopDeliveryPublishReasonCode;
  readonly causeCode: string | null;
  readonly recoveryStage: LoopDeliveryPublishRecoveryStage;
  readonly orchestrationResultArtifactRef: string | null;
  readonly executorInputArtifactRef: string | null;
  readonly deliveryResultArtifactRef: string;
  readonly governanceTailResultArtifactRef: string | null;
  readonly publishIntentArtifactRef: string | null;
  readonly precommitHeadSha: string | null;
  readonly commitSha: string | null;
  readonly remoteBranchSha: string | null;
  readonly prNumber: number | null;
  readonly prUrl: string | null;
  readonly implementationFiles: readonly string[];
  readonly files: readonly string[];
  readonly commitCreated: boolean;
  readonly commitRecovered: boolean;
  readonly pushCreated: boolean;
  readonly pushRecovered: boolean;
  readonly prCreated: boolean;
  readonly prRecovered: boolean;
  readonly prBodySha256: string | null;
  readonly elapsedMs: number;
  readonly trace: readonly LoopParsedPublishTraceEntry[];
}

// ═══════════════════════════════════════ Parser expected bindings

export interface LoopParseOrchestrationOptions {
  readonly maxBytes?: number;
  readonly expectedIdentity?: Readonly<LoopRunIdentity>;
}

export interface LoopParseExecutorInputOptions {
  readonly maxBytes?: number;
  readonly expectedIdentity?: Readonly<LoopRunIdentity>;
}

export interface LoopParseDeliveryOptions {
  readonly maxBytes?: number;
  readonly expectedMaterial?: Readonly<{
    readonly workspacePath: string;
    readonly taskBranch: string;
    readonly taskHeadSha: string;
    readonly statusDigestSha256: string;
    readonly taskHasChanges: boolean;
  }>;
}

export interface LoopParsePublishOptions {
  readonly maxBytes?: number;
  readonly expectedMode?: LoopDeliveryPublishMode;
  readonly expectedDeliveryResultArtifactRef?: string;
  readonly expectedGovernanceTailResultArtifactRef?: string;
  readonly expectedFiles?: readonly string[];
}

// ═══════════════════════════════════════ Internal fail-closed toolkit
// (validators throw `ParseValidationError`; public parser boundaries catch
// and convert — same idiom as the A1 governance-tail-result module)

// ECMAScript TypedArray intrinsics captured once at module load. Applied via
// direct call they read the internal [[TypedArrayName]] and [[ArrayLength]]
// slots, so callers cannot forge them with `Symbol.toStringTag` spoofing,
// tampered `length` properties, or Proxy traps; proxy-trap/revoked-proxy
// reflection fails closed instead of throwing.
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype);
const IntrinsicByteLengthGetter = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, "byteLength")!.get!;
const IntrinsicToStringTagGetter = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, Symbol.toStringTag)!.get!;

class ParseValidationError extends Error {
  readonly reason: LoopCanonicalParseFailureReason;
  readonly diagnostic: string;

  constructor(reason: LoopCanonicalParseFailureReason, diagnostic: string) {
    super(diagnostic);
    this.name = "ParseValidationError";
    this.reason = reason;
    this.diagnostic = diagnostic;
  }
}

function validationFail(reason: LoopCanonicalParseFailureReason, diagnostic: string): never {
  throw new ParseValidationError(reason, diagnostic);
}

function asFailure(error: unknown, fallbackDiagnostic: string): LoopCanonicalParseFailure {
  if (error instanceof ParseValidationError) {
    return { ok: false, reason: error.reason, diagnostic: error.diagnostic };
  }
  return { ok: false, reason: "invalid_input", diagnostic: fallbackDiagnostic };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function scanPlainObject(value: unknown, allowedKeys: readonly string[], label: string): Record<string, unknown> {
  if (!isPlainRecord(value)) validationFail("invalid_input", `${label} must be a plain object`);
  let own: string[];
  try {
    own = Object.getOwnPropertyNames(value);
  } catch {
    validationFail("invalid_input", `${label} ownKeys reflection failed`);
  }
  if (own.length !== allowedKeys.length) {
    validationFail("invalid_input", `${label} must have exactly the canonical keys`);
  }
  for (let i = 0; i < own.length; i++) {
    if (own[i] !== allowedKeys[i]) validationFail("invalid_input", `${label} must have the canonical keys in canonical order`);
  }
  for (const key of own) {
    if (key === "__proto__") validationFail("invalid_input", `${label} must not carry __proto__`);
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      validationFail("invalid_input", `${label} descriptor reflection failed`);
    }
    if (descriptor === undefined) validationFail("invalid_input", `${label} key descriptor is missing`);
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
      validationFail("invalid_input", `${label} must not carry accessors`);
    }
  }
  return value as Record<string, unknown>;
}

function scanPlainArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) validationFail("invalid_input", `${label} must be an array`);
  const names = Object.getOwnPropertyNames(value);
  // Indices 0..length-1 plus the intrinsic "length" — nothing else.
  if (names.length !== value.length + 1) {
    validationFail("invalid_input", `${label} must not carry extra own properties`);
  }
  for (const name of names) {
    if (name === "length") continue;
    const idx = Number(name);
    if (!Number.isInteger(idx) || idx < 0 || idx >= value.length) {
      validationFail("invalid_input", `${label} must not carry extra own properties`);
    }
  }
  const result: unknown[] = [];
  for (let i = 0; i < value.length; i++) {
    if (!(i in value)) validationFail("invalid_input", `${label} must not be sparse`);
    result.push(value[i]);
  }
  return result;
}

function safeMessageText(value: unknown, label: string): string {
  if (typeof value !== "string") validationFail("invalid_input", `${label} must be a string`);
  if (/[\x00-\x1f\x7f-\x9f]/.test(value)) validationFail("invalid_input", `${label} must not contain control characters`);
  if (value.length > MAX_SAFE_MESSAGE_LENGTH) validationFail("invalid_input", `${label} exceeds the safe length`);
  return value;
}

function asNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    validationFail("invalid_input", `${label} must be a trimmed non-empty string`);
  }
  return value;
}

function asSafeInt(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    validationFail("invalid_input", `${label} must be a safe integer within bounds`);
  }
  return value;
}

function asNullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return asNonEmptyString(value, label);
}

function asSha256(value: unknown, label: string): string {
  const s = asNonEmptyString(value, label);
  if (!SHA256_RE.test(s)) validationFail("invalid_input", `${label} must be a 64-char lowercase SHA-256 hex`);
  return s;
}

function asNullableSha256(value: unknown, label: string): string | null {
  if (value === null) return null;
  return asSha256(value, label);
}

function asSha40(value: unknown, label: string): string {
  const s = asNonEmptyString(value, label);
  if (!SHA40_RE.test(s)) validationFail("invalid_input", `${label} must be a 40-char lowercase SHA-1 hex`);
  return s;
}

function artifactRefOf(value: unknown, label: string, expectedKind: string): { ref: string; kind: string; digest: string } {
  const s = asNonEmptyString(value, label);
  const m = REF_RE.exec(s);
  if (m === null || m[1] !== expectedKind) {
    validationFail("invalid_input", `${label} must be a canonical ${expectedKind} artifact ref`);
  }
  return { ref: s, kind: m[1]!, digest: m[2]! };
}

function asNullableRef(value: unknown, label: string, expectedKind: string): string | null {
  if (value === null) return null;
  return artifactRefOf(value, label, expectedKind).ref;
}

function validatePathArray(value: unknown, label: string, requireSorted: boolean): string[] {
  const arr = scanPlainArray(value, label);
  const out: string[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = asNonEmptyString(arr[i], `${label}[${i}]`);
    if (item.startsWith("/") || item.includes("\\") || /[\x00-\x1f\x7f-\x9f]/.test(item)) {
      validationFail("invalid_input", `${label}[${i}] must be a repository-relative safe path`);
    }
    if (item === "." || item === ".." || item.includes("/./") || item.includes("/../")
      || item.endsWith("/.") || item.endsWith("/..") || item.split("/").includes(".git")) {
      validationFail("invalid_input", `${label}[${i}] is not a safe repository-relative path`);
    }
    if (requireSorted) {
      if (i > 0 && out[i - 1]! >= item) {
        validationFail("invalid_input", `${label} must be strictly ascending without duplicates`);
      }
    } else if (out.includes(item)) {
      validationFail("invalid_input", `${label} must not contain duplicates`);
    }
    out.push(item);
  }
  return out;
}

function validateIdentityRecord(value: unknown, label: string): Readonly<LoopRunIdentity> {
  const rec = scanPlainObject(value, IDENTITY_KEYS, label);
  try {
    validateLoopRunIdentity(rec);
  } catch {
    validationFail("invalid_input", `${label} is not a valid loop run identity`);
  }
  const identity = rec as unknown as LoopRunIdentity;
  return Object.freeze({
    runId: identity.runId,
    requirementId: identity.requirementId,
    repository: identity.repository,
    repositoryPath: identity.repositoryPath,
    baseBranch: identity.baseBranch,
    expectedBaseSha: identity.expectedBaseSha,
    taskBranch: identity.taskBranch,
    controlRoot: identity.controlRoot,
    createdAt: identity.createdAt,
  });
}

function sameIdentity(a: Readonly<LoopRunIdentity>, b: Readonly<LoopRunIdentity>): boolean {
  return a.runId === b.runId && a.requirementId === b.requirementId && a.repository === b.repository
    && a.repositoryPath === b.repositoryPath && a.baseBranch === b.baseBranch
    && a.expectedBaseSha === b.expectedBaseSha && a.taskBranch === b.taskBranch
    && a.controlRoot === b.controlRoot && a.createdAt === b.createdAt;
}

function sameStringArray(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function sameMaterial(
  a: Readonly<{ workspacePath: string; taskBranch: string; taskHeadSha: string; statusDigestSha256: string; taskHasChanges: boolean }>,
  b: Readonly<{ workspacePath: string; taskBranch: string; taskHeadSha: string; statusDigestSha256: string; taskHasChanges: boolean }>,
): boolean {
  return a.workspacePath === b.workspacePath && a.taskBranch === b.taskBranch && a.taskHeadSha === b.taskHeadSha
    && a.statusDigestSha256 === b.statusDigestSha256 && a.taskHasChanges === b.taskHasChanges;
}

function deepFrozenEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepFrozenEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (isPlainRecord(a) && isPlainRecord(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return false;
      if (!deepFrozenEqual(a[ka[i]!], b[ka[i]!])) return false;
    }
    return true;
  }
  return false;
}

function byteEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value === null || typeof value !== "object") return value as Readonly<T>;
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    Object.freeze(value);
    return value as Readonly<T>;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  Object.freeze(value);
  return value as Readonly<T>;
}

function resolveMaxBytes(maxBytes: number | undefined, fallback: number): number {
  const resolved = maxBytes ?? fallback;
  if (typeof resolved !== "number" || !Number.isSafeInteger(resolved) || resolved < 1 || resolved > MAX_ARTIFACT_BYTES_BOUND) {
    validationFail("invalid_input", "maxBytes must be a safe positive integer within the allowed bound");
  }
  return resolved;
}

/** Bounded defensive copy + byte-level gates shared by all four parsers. */
function takeCanonicalBytes(
  input: Uint8Array,
  maxBytes: number,
  trailingLf: boolean,
): { bytes: Uint8Array; text: string; parsed: unknown } {
  if (input === null || typeof input !== "object") validationFail("invalid_input", "bytes must be a Uint8Array");
  let tag: unknown;
  let byteLength: unknown;
  try {
    tag = IntrinsicToStringTagGetter.call(input);
    byteLength = IntrinsicByteLengthGetter.call(input);
  } catch {
    validationFail("invalid_input", "bytes must be a Uint8Array");
  }
  if (tag !== "Uint8Array") validationFail("invalid_input", "bytes must be a Uint8Array");
  if (typeof byteLength !== "number" || !Number.isSafeInteger(byteLength) || byteLength < 0) {
    validationFail("invalid_input", "bytes length must be a non-negative safe integer");
  }
  if (byteLength > maxBytes) validationFail("too_large", "artifact bytes exceed the size limit");
  let snapshot: Uint8Array;
  try {
    snapshot = new Uint8Array(input);
  } catch {
    validationFail("invalid_input", "bytes snapshot failed");
  }
  if (snapshot.length !== byteLength) validationFail("invalid_input", "bytes snapshot length mismatch");
  // No BOM, no CR, no NUL; exactly one trailing LF (or none for D08 artifacts).
  if (snapshot.length >= 3 && snapshot[0] === 0xef && snapshot[1] === 0xbb && snapshot[2] === 0xbf) {
    validationFail("invalid_bytes", "artifact bytes must not carry a BOM");
  }
  for (let i = 0; i < snapshot.length; i++) {
    if (snapshot[i] === 0x0d || snapshot[i] === 0x00) validationFail("invalid_bytes", "artifact bytes must not contain CR or NUL");
  }
  if (trailingLf) {
    if (snapshot.length === 0 || snapshot[snapshot.length - 1] !== 0x0a) {
      validationFail("invalid_bytes", "artifact bytes must end with exactly one LF");
    }
    for (let i = 0; i < snapshot.length - 1; i++) {
      if (snapshot[i] === 0x0a) validationFail("invalid_bytes", "artifact bytes must not contain an embedded LF");
    }
  } else {
    for (let i = 0; i < snapshot.length; i++) {
      if (snapshot[i] === 0x0a) validationFail("invalid_bytes", "artifact bytes must not contain an LF");
    }
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(snapshot);
  } catch {
    validationFail("invalid_bytes", "artifact bytes are not strict UTF-8");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    validationFail("invalid_bytes", "artifact bytes are not valid JSON");
  }
  return { bytes: snapshot, text, parsed };
}

/**
 * Canonical success payload: the digest is computed over the ORIGINAL intake
 * bytes and the text is the canonical serialization of the parsed value.
 */
function canonicalParseSuccess<T>(
  value: Readonly<T>,
  canonicalText: string,
  digestSha256: string,
  sizeBytes: number,
): LoopCanonicalParseSuccess<T> {
  return {
    ok: true,
    value,
    text: canonicalText,
    bytes: utf8(canonicalText),
    digestSha256,
    sizeBytes,
  };
}

/**
 * Canonical round-trip guard: re-serialize the already-validated parsed
 * object (its key order was enforced to be canonical) and require the result
 * to be byte-identical to the intake bytes.
 */
function requireRoundTrip(intake: { bytes: Uint8Array; text: string; parsed: unknown }, trailingLf: boolean): void {
  const rebuilt = utf8(JSON.stringify(intake.parsed) + (trailingLf ? "\n" : ""));
  if (!byteEquals(intake.bytes, rebuilt)) {
    validationFail("invalid_bytes", "artifact bytes are not canonical (round-trip mismatch)");
  }
}

// ═══════════════════════════════════════ Additive parsers

/**
 * Strict canonical parser for `loop_requirement_orchestration_result_v1`
 * (D08 orchestration result artifact). Fail-closed, no-throw. When
 * `expectedIdentity` is provided, the embedded identity must match exactly.
 */
export function parseLoopOrchestrationResultBytes(
  bytes: Uint8Array,
  options?: Readonly<LoopParseOrchestrationOptions>,
): LoopCanonicalParseResult<LoopParsedOrchestrationResult> {
  try {
    const maxBytes = resolveMaxBytes(options?.maxBytes, DEFAULT_MAX_ORCHESTRATION_RESULT_BYTES);
    const intake = takeCanonicalBytes(bytes, maxBytes, false);
    const rec = scanPlainObject(intake.parsed, ORCHESTRATION_KEYS, "orchestration result");
    if (rec.schema !== "loop_requirement_orchestration_result_v1") validationFail("invalid_input", "orchestration result schema mismatch");
    const identity = validateIdentityRecord(rec.identity, "orchestration result identity");
    if (options?.expectedIdentity !== undefined && !sameIdentity(identity, options.expectedIdentity)) {
      validationFail("invalid_input", "orchestration result identity binding mismatch");
    }
    if (typeof rec.route !== "string" || !(ORCHESTRATION_ROUTES as readonly string[]).includes(rec.route)) {
      validationFail("invalid_input", "orchestration result route is not canonical");
    }
    if (typeof rec.reason_code !== "string" || !(ORCHESTRATION_REASON_CODES as readonly string[]).includes(rec.reason_code)) {
      validationFail("invalid_input", "orchestration result reason_code is not canonical");
    }
    const rounds = asSafeInt(rec.rounds, "orchestration result rounds", 0, 100);
    const requirementRef = asNullableRef(rec.requirement_artifact_ref, "orchestration result requirement_artifact_ref", "requirement_summary");
    const designRefs = scanPlainArray(rec.design_artifact_refs, "orchestration result design_artifact_refs");
    for (let i = 0; i < designRefs.length; i++) {
      artifactRefOf(designRefs[i], `orchestration result design_artifact_refs[${i}]`, "technical_design");
    }
    const reviewRefs = scanPlainArray(rec.solution_review_artifact_refs, "orchestration result solution_review_artifact_refs");
    for (let i = 0; i < reviewRefs.length; i++) {
      artifactRefOf(reviewRefs[i], `orchestration result solution_review_artifact_refs[${i}]`, "solution_review");
    }
    const executorRef = asNullableRef(rec.executor_input_artifact_ref, "orchestration result executor_input_artifact_ref", "executor_input");
    const executorDigest = asNullableSha256(rec.executor_input_digest_sha256, "orchestration result executor_input_digest_sha256");
    const elapsedMs = asSafeInt(rec.elapsed_ms, "orchestration result elapsed_ms", 0, MAX_MAX_TOTAL_DURATION_MS);
    if ((executorRef === null) !== (executorDigest === null)) {
      validationFail("invalid_input", "orchestration result executor ref and digest must be both present or both absent");
    }
    const value: Readonly<LoopParsedOrchestrationResult> = deepFreeze({
      schema: "loop_requirement_orchestration_result_v1",
      identity,
      route: rec.route as string,
      reasonCode: rec.reason_code as string,
      rounds,
      requirementArtifactRef: requirementRef,
      designArtifactRefs: Object.freeze(designRefs.map((r) => artifactRefOf(r, "", "technical_design").ref)),
      solutionReviewArtifactRefs: Object.freeze(reviewRefs.map((r) => artifactRefOf(r, "", "solution_review").ref)),
      executorInputArtifactRef: executorRef,
      executorInputDigestSha256: executorDigest,
      elapsedMs,
    });
    requireRoundTrip(intake, false);
    return canonicalParseSuccess(value, JSON.stringify(intake.parsed), sha256Hex(intake.bytes), intake.bytes.length);
  } catch (error) {
    return asFailure(error, "unexpected failure while parsing orchestration result");
  }
}

/**
 * Strict canonical parser for `loop_direct_executor_input_v1`
 * (D08 direct executor input artifact). Fail-closed, no-throw. When
 * `expectedIdentity` is provided, the embedded identity must match exactly.
 */
export function parseLoopDirectExecutorInputBytes(
  bytes: Uint8Array,
  options?: Readonly<LoopParseExecutorInputOptions>,
): LoopCanonicalParseResult<LoopDirectExecutorInput> {
  try {
    const maxBytes = resolveMaxBytes(options?.maxBytes, DEFAULT_MAX_EXECUTOR_INPUT_BYTES);
    const intake = takeCanonicalBytes(bytes, maxBytes, false);
    const rec = scanPlainObject(intake.parsed, EXECUTOR_INPUT_KEYS, "executor input");
    if (rec.schema !== "loop_direct_executor_input_v1") validationFail("invalid_input", "executor input schema mismatch");
    const identity = validateIdentityRecord(rec.identity, "executor input identity");
    if (options?.expectedIdentity !== undefined && !sameIdentity(identity, options.expectedIdentity)) {
      validationFail("invalid_input", "executor input identity binding mismatch");
    }
    const requirement = scanPlainObject(rec.requirement, REQUIREMENT_KEYS, "executor input requirement");
    const objective = asNonEmptyString(requirement.objective, "executor input requirement.objective");
    const acceptanceCriteria = scanPlainArray(requirement.acceptanceCriteria, "executor input requirement.acceptanceCriteria");
    for (let i = 0; i < acceptanceCriteria.length; i++) {
      const s = asNonEmptyString(acceptanceCriteria[i], `executor input requirement.acceptanceCriteria[${i}]`);
      if (/[\x00-\x1f\x7f-\x9f]/.test(s)) validationFail("invalid_input", `executor input requirement.acceptanceCriteria[${i}] must not contain control characters`);
    }
    const constraints = scanPlainArray(requirement.constraints, "executor input requirement.constraints");
    for (let i = 0; i < constraints.length; i++) {
      const s = asNonEmptyString(constraints[i], `executor input requirement.constraints[${i}]`);
      if (/[\x00-\x1f\x7f-\x9f]/.test(s)) validationFail("invalid_input", `executor input requirement.constraints[${i}] must not contain control characters`);
    }
    const designSummary = scanPlainObject(rec.designSummary, DESIGN_SUMMARY_KEYS, "executor input designSummary");
    const approach = asNonEmptyString(designSummary.approach, "executor input designSummary.approach");
    const dsComponents = scanPlainArray(designSummary.components, "executor input designSummary.components");
    const dsInterfaces = scanPlainArray(designSummary.interfaces, "executor input designSummary.interfaces");
    const dsDataChanges = scanPlainArray(designSummary.dataChanges, "executor input designSummary.dataChanges");
    const dsRiskControls = scanPlainArray(designSummary.riskControls, "executor input designSummary.riskControls");
    for (const [label, arr] of [
      ["designSummary.components", dsComponents],
      ["designSummary.interfaces", dsInterfaces],
      ["designSummary.dataChanges", dsDataChanges],
      ["designSummary.riskControls", dsRiskControls],
    ] as const) {
      for (let i = 0; i < arr.length; i++) {
        asNonEmptyString(arr[i], `executor input ${label}[${i}]`);
      }
    }
    const implConstraints = scanPlainArray(rec.implementationConstraints, "executor input implementationConstraints");
    for (let i = 0; i < implConstraints.length; i++) {
      asNonEmptyString(implConstraints[i], `executor input implementationConstraints[${i}]`);
    }
    const allowedPaths = scanPlainArray(rec.allowedPaths, "executor input allowedPaths");
    for (let i = 0; i < allowedPaths.length; i++) {
      const s = asNonEmptyString(allowedPaths[i], `executor input allowedPaths[${i}]`);
      if (s.startsWith("/") || s.includes("\\") || /[\x00-\x1f\x7f-\x9f]/.test(s)) {
        validationFail("invalid_input", `executor input allowedPaths[${i}] must be a repository-relative safe path`);
      }
    }
    const steps = (listKey: string, raw: unknown): LoopDeliveryCommandStep[] => {
      const arr = scanPlainArray(raw, `executor input ${listKey}`);
      const out: LoopDeliveryCommandStep[] = [];
      for (let i = 0; i < arr.length; i++) {
        const step = scanPlainObject(arr[i], COMMAND_STEP_KEYS, `executor input ${listKey}[${i}]`);
        const id = asNonEmptyString(step.id, `executor input ${listKey}[${i}].id`);
        const executableId = asNonEmptyString(step.executableId, `executor input ${listKey}[${i}].executableId`);
        let stepArgs: readonly string[] | undefined;
        if (step.args !== undefined) {
          const args = scanPlainArray(step.args, `executor input ${listKey}[${i}].args`);
          const argStrs: string[] = [];
          for (let j = 0; j < args.length; j++) {
            argStrs.push(asNonEmptyString(args[j], `executor input ${listKey}[${i}].args[${j}]`));
          }
          stepArgs = Object.freeze(argStrs);
        }
        const stepRec: LoopDeliveryCommandStep = {
          id,
          executableId,
          ...(stepArgs !== undefined ? { args: stepArgs } : {}),
          ...(step.timeoutMs !== undefined
            ? { timeoutMs: asSafeInt(step.timeoutMs, `executor input ${listKey}[${i}].timeoutMs`, 1, 600_000) }
            : {}),
          ...(step.maxStdoutBytes !== undefined
            ? { maxStdoutBytes: asSafeInt(step.maxStdoutBytes, `executor input ${listKey}[${i}].maxStdoutBytes`, 1, 16_777_216) }
            : {}),
          ...(step.maxStderrBytes !== undefined
            ? { maxStderrBytes: asSafeInt(step.maxStderrBytes, `executor input ${listKey}[${i}].maxStderrBytes`, 1, 16_777_216) }
            : {}),
        };
        out.push(Object.freeze(stepRec));
      }
      return out;
    };
    const testPlan = steps("testPlan", rec.testPlan);
    const reviewPlan = steps("reviewPlan", rec.reviewPlan);
    const maxFixRounds = asSafeInt(rec.maxFixRounds, "executor input maxFixRounds", 0, 4);
    const maxTotalDurationMs = asSafeInt(rec.maxTotalDurationMs, "executor input maxTotalDurationMs", 1_000, 3_600_000);
    const commitSubject = asNonEmptyString(rec.commitSubject, "executor input commitSubject");
    if (/[\x00-\x1f\x7f-\x9f]/.test(commitSubject)) validationFail("invalid_input", "executor input commitSubject must not contain control characters");
    const prTitle = asNonEmptyString(rec.prTitle, "executor input prTitle");
    if (/[\x00-\x1f\x7f-\x9f]/.test(prTitle)) validationFail("invalid_input", "executor input prTitle must not contain control characters");
    const value: Readonly<LoopDirectExecutorInput> = deepFreeze({
      schema: "loop_direct_executor_input_v1",
      identity,
      requirement: {
        objective,
        acceptanceCriteria: Object.freeze(acceptanceCriteria.map((s) => s as string)),
        constraints: Object.freeze(constraints.map((s) => s as string)),
      },
      designSummary: {
        approach,
        components: Object.freeze(dsComponents.map((s) => s as string)),
        interfaces: Object.freeze(dsInterfaces.map((s) => s as string)),
        dataChanges: Object.freeze(dsDataChanges.map((s) => s as string)),
        riskControls: Object.freeze(dsRiskControls.map((s) => s as string)),
      },
      implementationConstraints: Object.freeze(implConstraints.map((s) => s as string)),
      allowedPaths: Object.freeze(allowedPaths.map((s) => s as string)),
      testPlan: Object.freeze(testPlan),
      reviewPlan: Object.freeze(reviewPlan),
      maxFixRounds,
      maxTotalDurationMs,
      commitSubject,
      prTitle,
    });
    requireRoundTrip(intake, false);
    return canonicalParseSuccess(value, JSON.stringify(intake.parsed), sha256Hex(intake.bytes), intake.bytes.length);
  } catch (error) {
    return asFailure(error, "unexpected failure while parsing executor input");
  }
}

/**
 * Strict canonical parser for `loop-delivery-result-v1` (D06 delivery result
 * artifact). Fail-closed, no-throw. When `expectedMaterial` is provided, the
 * final workspace must match the expected workspace material exactly.
 */
export function parseLoopDeliveryResultBytes(
  bytes: Uint8Array,
  options?: Readonly<LoopParseDeliveryOptions>,
): LoopCanonicalParseResult<LoopParsedDeliveryResult> {
  try {
    const maxBytes = resolveMaxBytes(options?.maxBytes, DEFAULT_MAX_DELIVERY_RESULT_BYTES);
    const intake = takeCanonicalBytes(bytes, maxBytes, true);
    const rec = scanPlainObject(intake.parsed, DELIVERY_KEYS, "delivery result");
    if (rec.schema !== "loop-delivery-result-v1") validationFail("invalid_input", "delivery result schema mismatch");
    if (typeof rec.status !== "string" || !(DELIVERY_STATUSES as readonly string[]).includes(rec.status)) {
      validationFail("invalid_input", "delivery result status is not canonical");
    }
    if (typeof rec.reason_code !== "string" || !(DELIVERY_REASON_CODES as readonly string[]).includes(rec.reason_code)) {
      validationFail("invalid_input", "delivery result reason_code is not canonical");
    }
    const causeCode = asNullableString(rec.cause_code, "delivery result cause_code");
    const totalFixRounds = asSafeInt(rec.total_fix_rounds, "delivery result total_fix_rounds", 0, 1000);
    const testAttempts = asSafeInt(rec.test_attempts, "delivery result test_attempts", 0, 1000);
    const reviewAttempts = asSafeInt(rec.review_attempts, "delivery result review_attempts", 0, 1000);
    for (const [label, raw] of [
      ["patch_artifact_refs", rec.patch_artifact_refs],
      ["test_summary_artifact_refs", rec.test_summary_artifact_refs],
      ["review_summary_artifact_refs", rec.review_summary_artifact_refs],
    ] as const) {
      const arr = scanPlainArray(raw, `delivery result ${label}`);
      for (let i = 0; i < arr.length; i++) {
        artifactRefOf(arr[i], `delivery result ${label}[${i}]`, label.replace("_refs", ""));
      }
    }
    const files = validatePathArray(rec.files, "delivery result files", true);
    let finalWorkspace: Readonly<LoopParsedDeliveryFinalWorkspace> | null = null;
    if (rec.final_workspace !== null) {
      const fw = scanPlainObject(rec.final_workspace, DELIVERY_FINAL_WORKSPACE_KEYS, "delivery result final_workspace");
      const workspacePath = asNonEmptyString(fw.workspace_path, "delivery result final_workspace.workspace_path");
      const taskBranch = asNonEmptyString(fw.task_branch, "delivery result final_workspace.task_branch");
      const taskHeadSha = asSha40(fw.task_head_sha, "delivery result final_workspace.task_head_sha");
      const statusDigest = asSha256(fw.status_digest_sha256, "delivery result final_workspace.status_digest_sha256");
      if (fw.task_has_changes !== true && fw.task_has_changes !== false) {
        validationFail("invalid_input", "delivery result final_workspace.task_has_changes must be a boolean");
      }
      finalWorkspace = Object.freeze({
        workspacePath,
        taskBranch,
        taskHeadSha,
        statusDigestSha256: statusDigest,
        taskHasChanges: fw.task_has_changes as boolean,
      });
    }
    const elapsedMs = asSafeInt(rec.elapsed_ms, "delivery result elapsed_ms", 0, MAX_MAX_TOTAL_DURATION_MS);
    const traceArr = scanPlainArray(rec.trace, "delivery result trace");
    const trace: LoopParsedDeliveryTraceEntry[] = [];
    let lastSequence = 0;
    for (let i = 0; i < traceArr.length; i++) {
      const entry = scanPlainObject(traceArr[i], DELIVERY_TRACE_KEYS, `delivery result trace[${i}]`);
      const sequence = asSafeInt(entry.sequence, `delivery result trace[${i}].sequence`, 1, 1_000_000);
      if (sequence <= lastSequence) validationFail("invalid_input", "delivery result trace sequences must be strictly increasing");
      lastSequence = sequence;
      if (typeof entry.kind !== "string" || !(DELIVERY_TRACE_KINDS as readonly string[]).includes(entry.kind)) {
        validationFail("invalid_input", `delivery result trace[${i}].kind is not canonical`);
      }
      if (typeof entry.phase !== "string" || !(DELIVERY_TRACE_PHASES as readonly string[]).includes(entry.phase)) {
        validationFail("invalid_input", `delivery result trace[${i}].phase is not canonical`);
      }
      const fixRound = asSafeInt(entry.fix_round, `delivery result trace[${i}].fix_round`, 0, 1000);
      const attempt = asSafeInt(entry.attempt, `delivery result trace[${i}].attempt`, 0, 1000);
      const stepId = asNullableString(entry.step_id, `delivery result trace[${i}].step_id`);
      const outcome = safeMessageText(entry.outcome, `delivery result trace[${i}].outcome`);
      const artifactRef = asNullableRef(entry.artifact_ref, `delivery result trace[${i}].artifact_ref`, "workspace_metadata");
      const patchArtifactRef = asNullableRef(entry.patch_artifact_ref, `delivery result trace[${i}].patch_artifact_ref`, "code_patch");
      const patchDigest = asNullableSha256(entry.patch_digest_sha256, `delivery result trace[${i}].patch_digest_sha256`);
      const wsDigest = asNullableSha256(entry.workspace_status_digest_sha256, `delivery result trace[${i}].workspace_status_digest_sha256`);
      const entryElapsed = asSafeInt(entry.elapsed_ms, `delivery result trace[${i}].elapsed_ms`, 0, MAX_MAX_TOTAL_DURATION_MS);
      trace.push(Object.freeze({
        sequence,
        kind: entry.kind as string,
        phase: entry.phase as string,
        fixRound,
        attempt,
        stepId,
        outcome,
        artifactRef,
        patchArtifactRef,
        patchDigestSha256: patchDigest,
        workspaceStatusDigestSha256: wsDigest,
        elapsedMs: entryElapsed,
      }));
    }
    if (options?.expectedMaterial !== undefined) {
      if (finalWorkspace === null || !sameMaterial(options.expectedMaterial, finalWorkspace)) {
        validationFail("invalid_input", "delivery result workspace material binding mismatch");
      }
    }
    const value: Readonly<LoopParsedDeliveryResult> = deepFreeze({
      schema: "loop-delivery-result-v1",
      status: rec.status as LoopAutonomousDeliveryStatus,
      reasonCode: rec.reason_code as LoopAutonomousDeliveryReasonCode,
      causeCode,
      totalFixRounds,
      testAttempts,
      reviewAttempts,
      patchArtifactRefs: Object.freeze((rec.patch_artifact_refs as unknown[]).map((r) => artifactRefOf(r, "", "code_patch").ref)),
      testSummaryArtifactRefs: Object.freeze((rec.test_summary_artifact_refs as unknown[]).map((r) => artifactRefOf(r, "", "test_summary").ref)),
      reviewSummaryArtifactRefs: Object.freeze((rec.review_summary_artifact_refs as unknown[]).map((r) => artifactRefOf(r, "", "review_summary").ref)),
      files: Object.freeze(files),
      finalWorkspace,
      elapsedMs,
      trace: Object.freeze(trace),
    });
    requireRoundTrip(intake, true);
    return canonicalParseSuccess(value, JSON.stringify(intake.parsed) + "\n", sha256Hex(intake.bytes), intake.bytes.length);
  } catch (error) {
    return asFailure(error, "unexpected failure while parsing delivery result");
  }
}

/**
 * Strict canonical parser for `loop-governed-publish-result-v1` /
 * `loop-publish-result-v1` (D07 publish result artifact). Fail-closed,
 * no-throw. When `expectedMode` is provided, the schema must match the mode;
 * provided expected refs/files must bind exactly.
 */
export function parseLoopDeliveryPublishResultBytes(
  bytes: Uint8Array,
  options?: Readonly<LoopParsePublishOptions>,
): LoopCanonicalParseResult<LoopParsedPublishResult> {
  try {
    const maxBytes = resolveMaxBytes(options?.maxBytes, DEFAULT_MAX_PUBLISH_RESULT_BYTES);
    const intake = takeCanonicalBytes(bytes, maxBytes, true);
    const rawParsed = intake.parsed as Record<string, unknown> | null | undefined;
    const schema = rawParsed === null || rawParsed === undefined || typeof rawParsed !== "object"
      ? undefined
      : (rawParsed as Record<string, unknown>).schema;
    const governed = schema === "loop-governed-publish-result-v1";
    const standalone = schema === "loop-publish-result-v1";
    if (!governed && !standalone) validationFail("invalid_input", "publish result schema is not canonical");
    if (options?.expectedMode !== undefined) {
      const modeMatches = (options.expectedMode === "governed" && governed) || (options.expectedMode === "standalone" && standalone);
      if (!modeMatches) validationFail("invalid_input", "publish result mode binding mismatch");
    }
    const rec = scanPlainObject(intake.parsed, governed ? PUBLISH_KEYS_GOVERNED : PUBLISH_KEYS_STANDALONE, "publish result");
    if (typeof rec.status !== "string" || !(PUBLISH_STATUSES as readonly string[]).includes(rec.status)) {
      validationFail("invalid_input", "publish result status is not canonical");
    }
    if (typeof rec.reason_code !== "string" || !(PUBLISH_REASON_CODES as readonly string[]).includes(rec.reason_code)) {
      validationFail("invalid_input", "publish result reason_code is not canonical");
    }
    const causeCode = asNullableString(rec.cause_code, "publish result cause_code");
    if (typeof rec.recovery_stage !== "string" || !(PUBLISH_RECOVERY_STAGES as readonly string[]).includes(rec.recovery_stage)) {
      validationFail("invalid_input", "publish result recovery_stage is not canonical");
    }
    let orchestrationRef: string | null = null;
    let executorRef: string | null = null;
    let governanceRef: string | null = null;
    let implementationFiles: readonly string[] = Object.freeze([]);
    if (governed) {
      orchestrationRef = asNullableRef(rec.orchestration_result_artifact_ref, "publish result orchestration_result_artifact_ref", "orchestration_result");
      executorRef = asNullableRef(rec.executor_input_artifact_ref, "publish result executor_input_artifact_ref", "executor_input");
      governanceRef = asNullableRef(rec.governance_tail_result_artifact_ref, "publish result governance_tail_result_artifact_ref", "governance_tail_result");
      implementationFiles = Object.freeze(validatePathArray(rec.implementation_files, "publish result implementation_files", true));
    }
    const deliveryRef = artifactRefOf(rec.delivery_result_artifact_ref, "publish result delivery_result_artifact_ref", "delivery_result");
    const intentRef = asNullableRef(rec.publish_intent_artifact_ref, "publish result publish_intent_artifact_ref", "workspace_metadata");
    const precommitHead = asNullableString(rec.precommit_head_sha, "publish result precommit_head_sha");
    if (precommitHead !== null && !SHA40_RE.test(precommitHead)) {
      validationFail("invalid_input", "publish result precommit_head_sha must be a 40-char SHA hex");
    }
    const commitSha = asNullableString(rec.commit_sha, "publish result commit_sha");
    if (commitSha !== null && !SHA40_RE.test(commitSha)) {
      validationFail("invalid_input", "publish result commit_sha must be a 40-char SHA hex");
    }
    const remoteBranchSha = asNullableString(rec.remote_branch_sha, "publish result remote_branch_sha");
    if (remoteBranchSha !== null && !SHA40_RE.test(remoteBranchSha)) {
      validationFail("invalid_input", "publish result remote_branch_sha must be a 40-char SHA hex");
    }
    const prNumberRaw = rec.pr_number;
    if (prNumberRaw !== null) {
      asSafeInt(prNumberRaw, "publish result pr_number", 1, 2_147_483_647);
    }
    const prUrl = asNullableString(rec.pr_url, "publish result pr_url");
    const files = validatePathArray(rec.files, "publish result files", true);
    for (const flag of ["commit_created", "commit_recovered", "push_created", "push_recovered", "pr_created", "pr_recovered"] as const) {
      if (typeof rec[flag] !== "boolean") validationFail("invalid_input", `publish result ${flag} must be a boolean`);
    }
    const prBodySha256 = asNullableSha256(rec.pr_body_sha256, "publish result pr_body_sha256");
    const elapsedMs = asSafeInt(rec.elapsed_ms, "publish result elapsed_ms", 0, MAX_MAX_TOTAL_DURATION_MS);
    const traceArr = scanPlainArray(rec.trace, "publish result trace");
    const trace: LoopParsedPublishTraceEntry[] = [];
    let lastSequence = 0;
    for (let i = 0; i < traceArr.length; i++) {
      const entry = scanPlainObject(traceArr[i], PUBLISH_TRACE_KEYS, `publish result trace[${i}]`);
      const sequence = asSafeInt(entry.sequence, `publish result trace[${i}].sequence`, 1, 1_000_000);
      if (sequence <= lastSequence) validationFail("invalid_input", "publish result trace sequences must be strictly increasing");
      lastSequence = sequence;
      if (typeof entry.stage !== "string" || !(PUBLISH_TRACE_STAGES as readonly string[]).includes(entry.stage)) {
        validationFail("invalid_input", `publish result trace[${i}].stage is not canonical`);
      }
      const outcome = safeMessageText(entry.outcome, `publish result trace[${i}].outcome`);
      const artifactRef = asNullableRef(entry.artifact_ref, `publish result trace[${i}].artifact_ref`, "workspace_metadata");
      const tCommitSha = asNullableString(entry.commit_sha, `publish result trace[${i}].commit_sha`);
      if (tCommitSha !== null && !SHA40_RE.test(tCommitSha)) {
        validationFail("invalid_input", `publish result trace[${i}].commit_sha must be a 40-char SHA hex`);
      }
      const tRemoteSha = asNullableString(entry.remote_branch_sha, `publish result trace[${i}].remote_branch_sha`);
      if (tRemoteSha !== null && !SHA40_RE.test(tRemoteSha)) {
        validationFail("invalid_input", `publish result trace[${i}].remote_branch_sha must be a 40-char SHA hex`);
      }
      const tPrNumber = entry.pr_number;
      const prNumberValue: number | null = tPrNumber === null
        ? null
        : asSafeInt(tPrNumber, `publish result trace[${i}].pr_number`, 1, 2_147_483_647);
      const entryElapsed = asSafeInt(entry.elapsed_ms, `publish result trace[${i}].elapsed_ms`, 0, MAX_MAX_TOTAL_DURATION_MS);
      trace.push(Object.freeze({
        sequence,
        stage: entry.stage as string,
        outcome,
        artifactRef,
        commitSha: tCommitSha,
        remoteBranchSha: tRemoteSha,
        prNumber: prNumberValue,
        elapsedMs: entryElapsed,
      }));
    }
    const value: Readonly<LoopParsedPublishResult> = deepFreeze({
      schema: governed ? "loop-governed-publish-result-v1" : "loop-publish-result-v1",
      status: rec.status as LoopDeliveryPublishStatus,
      reasonCode: rec.reason_code as LoopDeliveryPublishReasonCode,
      causeCode,
      recoveryStage: rec.recovery_stage as LoopDeliveryPublishRecoveryStage,
      orchestrationResultArtifactRef: orchestrationRef,
      executorInputArtifactRef: executorRef,
      deliveryResultArtifactRef: deliveryRef.ref,
      governanceTailResultArtifactRef: governanceRef,
      publishIntentArtifactRef: intentRef,
      precommitHeadSha: precommitHead,
      commitSha,
      remoteBranchSha,
      prNumber: prNumberRaw as number | null,
      prUrl,
      implementationFiles,
      files: Object.freeze(files),
      commitCreated: rec.commit_created as boolean,
      commitRecovered: rec.commit_recovered as boolean,
      pushCreated: rec.push_created as boolean,
      pushRecovered: rec.push_recovered as boolean,
      prCreated: rec.pr_created as boolean,
      prRecovered: rec.pr_recovered as boolean,
      prBodySha256,
      elapsedMs,
      trace: Object.freeze(trace),
    });
    if (options?.expectedDeliveryResultArtifactRef !== undefined && value.deliveryResultArtifactRef !== options.expectedDeliveryResultArtifactRef) {
      validationFail("invalid_input", "publish result delivery ref binding mismatch");
    }
    if (options?.expectedGovernanceTailResultArtifactRef !== undefined && value.governanceTailResultArtifactRef !== options.expectedGovernanceTailResultArtifactRef) {
      validationFail("invalid_input", "publish result governance tail ref binding mismatch");
    }
    if (options?.expectedFiles !== undefined && !sameStringArray(value.files, options.expectedFiles)) {
      validationFail("invalid_input", "publish result files binding mismatch");
    }
    requireRoundTrip(intake, true);
    return canonicalParseSuccess(value, JSON.stringify(intake.parsed) + "\n", sha256Hex(intake.bytes), intake.bytes.length);
  } catch (error) {
    return asFailure(error, "unexpected failure while parsing publish result");
  }
}

// ═══════════════════════════════════════ Coordinator public contracts

export type LoopProductionCoordinatorStatus = "succeeded" | "blocked" | "failed";

export type LoopProductionCoordinatorReasonCode =
  | "DELIVERY_SUCCEEDED"
  | "INVALID_INPUT"
  | "ORCHESTRATION_NOT_DIRECT"
  | "ORCHESTRATION_VERIFICATION_FAILED"
  | "EXECUTOR_INPUT_VERIFICATION_FAILED"
  | "WORKSPACE_PREPARE_BLOCKED"
  | "BASE_BRANCH_DRIFT"
  | "WORKSPACE_DRIFT"
  | "DELIVERY_FAILED"
  | "DELIVERY_BLOCKED"
  | "DELIVERY_READBACK_AMBIGUOUS"
  | "GOVERNANCE_TAIL_NOT_COMPLETED"
  | "GOVERNANCE_TAIL_FAILED"
  | "GOVERNANCE_TAIL_INVALID"
  | "A1_BUILD_FAILED"
  | "A1_VERIFICATION_FAILED"
  | "FINAL_WORKSPACE_DRIFT"
  | "PUBLISH_FAILED"
  | "PUBLISH_BLOCKED"
  | "GOVERNED_PUBLISH_VIOLATION"
  | "PUBLISH_READBACK_AMBIGUOUS"
  | "TOTAL_TIMEOUT"
  | "CLOCK_INVALID"
  | "INTERNAL_ERROR";

export type LoopProductionCoordinatorTraceStage =
  | "orchestration_verify"
  | "executor_input_verify"
  | "workspace_prepare"
  | "delivery_execute"
  | "delivery_readback"
  | "governance_tail"
  | "a1_build"
  | "a1_store_readback"
  | "post_tail_inspect"
  | "governed_publish"
  | "publish_readback"
  | "terminal";

export interface LoopProductionCoordinatorTraceEntry {
  readonly sequence: number;
  readonly stage: LoopProductionCoordinatorTraceStage;
  readonly outcome: string;
  readonly artifactRef: string | null;
  readonly elapsedMs: number;
}

/** Shared Documentation Governance Tail — injected typed dependency (D09-B orchestrates it). */
export interface LoopSharedGovernanceTailInput {
  readonly identity: Readonly<LoopRunIdentity>;
  readonly orchestrationResultArtifactRef: string;
  readonly executorInputArtifactRef: string;
  readonly deliveryResultArtifactRef: string;
  readonly implementationFiles: readonly string[];
  readonly finalWorkspace: Readonly<LoopParsedDeliveryFinalWorkspace>;
  readonly remainingMs: number;
}

export type LoopSharedGovernanceTailStatus = "pending" | "in_progress" | "blocked" | "failed" | "completed";

/**
 * Completion package carried ONLY by `completed / GOVERNANCE_TAIL_COMPLETED`
 * tail results. It holds the tail-owned A1 input fields; the coordinator
 * composes the full A1 input and validates it with the real A1 builder.
 */
export interface LoopGovernanceTailCompletionPackage {
  readonly final_workspace: Readonly<LoopGovernanceTailFinalWorkspace>;
  readonly implementation_files: readonly string[];
  readonly files: readonly string[];
  readonly docflow: Readonly<LoopGovernanceTailDocFlow>;
  readonly business_domain_sync: Readonly<LoopGovernanceTailBusinessDomainSync>;
  readonly reconcile: Readonly<LoopGovernanceTailReconcile>;
  readonly entry_coverage: Readonly<LoopGovernanceTailEntryCoverage>;
  readonly regate: Readonly<LoopGovernanceTailReGate>;
  readonly manifest: Readonly<LoopGovernanceTailManifest>;
  readonly tail_gate: Readonly<LoopGovernanceTailTailGate>;
  readonly blocking_items: readonly unknown[];
  readonly elapsed_ms: number;
}

export interface LoopSharedGovernanceTailResult {
  readonly status: LoopSharedGovernanceTailStatus;
  readonly reasonCode: string;
  readonly safeMessage: string;
  readonly completionPackage?: Readonly<LoopGovernanceTailCompletionPackage>;
}

export interface LoopSharedGovernanceTailDependency {
  run(input: Readonly<LoopSharedGovernanceTailInput>): LoopSharedGovernanceTailResult | Promise<LoopSharedGovernanceTailResult>;
}

export interface LoopProductionCoordinatorRequest {
  readonly identity: Readonly<LoopRunIdentity>;
  /** The ONLY root input: a fixed `loop-artifact:v1:orchestration_result:sha256:<digest>` ref. */
  readonly orchestrationResultArtifactRef: string;
  /** Optional existing, verified publish-intent ref for the D07 recovery path (must bind to the same identity/material). */
  readonly recoveryPublishIntentArtifactRef?: string;
}

export interface LoopProductionCoordinatorResult {
  readonly status: LoopProductionCoordinatorStatus;
  readonly reasonCode: LoopProductionCoordinatorReasonCode;
  readonly safeMessage: string;
  readonly causeCode?: string;
  readonly orchestrationResultArtifactRef: string;
  readonly executorInputArtifactRef?: string;
  readonly deliveryResultArtifactRef?: string;
  readonly governanceTailResultArtifactRef?: string;
  readonly publishResultArtifactRef?: string;
  readonly commitSha?: string;
  readonly prNumber?: number;
  readonly prUrl?: string;
  readonly files: readonly string[];
  readonly finalGovernedWorkspace?: Readonly<LoopGovernanceTailFinalWorkspace>;
  readonly elapsedMs: number;
  readonly trace: readonly LoopProductionCoordinatorTraceEntry[];
}

export interface LoopProductionCoordinatorOptions {
  readonly artifactStore: Pick<LoopArtifactStore, "read" | "put">;
  readonly workspaceManager: Pick<LoopGitWorkspaceManager, "prepare" | "inspect">;
  readonly deliveryLoop: Pick<LoopAutonomousDeliveryLoop, "execute">;
  readonly publisher: Pick<LoopDeliveryPublisher, "execute">;
  readonly sharedGovernanceTail: LoopSharedGovernanceTailDependency;
  readonly clock?: Readonly<{ nowMs(): number }>;
  readonly maxTotalDurationMs?: number;
  readonly maxOrchestrationResultBytes?: number;
  readonly maxExecutorInputBytes?: number;
  readonly maxDeliveryResultBytes?: number;
  readonly maxPublishResultBytes?: number;
  readonly maxA1Bytes?: number;
}

const COORDINATOR_OPTION_KEYS = [
  "artifactStore", "workspaceManager", "deliveryLoop", "publisher", "sharedGovernanceTail",
  "clock", "maxTotalDurationMs", "maxOrchestrationResultBytes", "maxExecutorInputBytes",
  "maxDeliveryResultBytes", "maxPublishResultBytes", "maxA1Bytes",
] as const;

const REQUEST_KEYS = ["identity", "orchestrationResultArtifactRef", "recoveryPublishIntentArtifactRef"] as const;

interface CoordinatorInternalState {
  readonly identity: Readonly<LoopRunIdentity>;
  readonly orchestrationResultArtifactRef: string;
  readonly recoveryPublishIntentArtifactRef: string | undefined;
  readonly maxTotalDurationMs: number;
  readonly maxDeliveryResultBytes: number;
  readonly maxPublishResultBytes: number;
  readonly maxA1Bytes: number;
  startMs: number;
  lastClockMs: number;
  clockError: boolean;
  deadlineExceeded: boolean;
  trace: LoopProductionCoordinatorTraceEntry[];
  sequence: number;
}

type ClockGate = "active" | "expired" | "clock_invalid";

function sanitizeSafeMessage(message: string): string {
  const cleaned = message.replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
  return cleaned.length > MAX_SAFE_MESSAGE_LENGTH ? cleaned.slice(0, MAX_SAFE_MESSAGE_LENGTH) : cleaned;
}

/**
 * Bounded, single-run, fail-closed production coordinator. `execute()` never
 * throws; every dependency exception is caught and mapped to a terminal
 * result.
 */
export class LoopProductionCoordinator {
  private readonly artifactStore: Pick<LoopArtifactStore, "read" | "put">;
  private readonly workspaceManager: Pick<LoopGitWorkspaceManager, "prepare" | "inspect">;
  private readonly deliveryLoop: Pick<LoopAutonomousDeliveryLoop, "execute">;
  private readonly publisher: Pick<LoopDeliveryPublisher, "execute">;
  private readonly sharedGovernanceTail: LoopSharedGovernanceTailDependency;
  private readonly clock: Readonly<{ nowMs(): number }>;
  private readonly maxTotalDurationMs: number;
  private readonly maxOrchestrationResultBytes: number;
  private readonly maxExecutorInputBytes: number;
  private readonly maxDeliveryResultBytes: number;
  private readonly maxPublishResultBytes: number;
  private readonly maxA1Bytes: number;

  constructor(options: LoopProductionCoordinatorOptions) {
    if (options === null || typeof options !== "object" || Array.isArray(options)) {
      throw new Error("options must be a plain object");
    }
    const own = Object.getOwnPropertyNames(options);
    if (own.length === 0 || own.some((k) => !(COORDINATOR_OPTION_KEYS as readonly string[]).includes(k))) {
      throw new Error("options must contain only canonical keys");
    }
    const store = options.artifactStore;
    if (!store || typeof store.read !== "function" || typeof store.put !== "function") {
      throw new Error("artifactStore must provide read and put");
    }
    const workspace = options.workspaceManager;
    if (!workspace || typeof workspace.prepare !== "function" || typeof workspace.inspect !== "function") {
      throw new Error("workspaceManager must provide prepare and inspect");
    }
    const delivery = options.deliveryLoop;
    if (!delivery || typeof delivery.execute !== "function") {
      throw new Error("deliveryLoop must provide execute");
    }
    const publisher = options.publisher;
    if (!publisher || typeof publisher.execute !== "function") {
      throw new Error("publisher must provide execute");
    }
    const tail = options.sharedGovernanceTail;
    if (!tail || typeof tail.run !== "function") {
      throw new Error("sharedGovernanceTail must provide run");
    }
    const clock = options.clock ?? { nowMs: () => Date.now() };
    if (!clock || typeof clock.nowMs !== "function") {
      throw new Error("clock must provide nowMs");
    }
    const maxTotalDurationMs = options.maxTotalDurationMs ?? DEFAULT_MAX_TOTAL_DURATION_MS;
    if (typeof maxTotalDurationMs !== "number" || !Number.isSafeInteger(maxTotalDurationMs)
      || maxTotalDurationMs < MIN_MAX_TOTAL_DURATION_MS || maxTotalDurationMs > MAX_MAX_TOTAL_DURATION_MS) {
      throw new Error("maxTotalDurationMs must be a safe integer within the allowed bound");
    }
    const bound = (value: number | undefined, fallback: number, label: string): number => {
      const resolved = value ?? fallback;
      if (typeof resolved !== "number" || !Number.isSafeInteger(resolved) || resolved < 1 || resolved > MAX_ARTIFACT_BYTES_BOUND) {
        throw new Error(`${label} must be a safe positive integer within the allowed bound`);
      }
      return resolved;
    };
    this.artifactStore = store;
    this.workspaceManager = workspace;
    this.deliveryLoop = delivery;
    this.publisher = publisher;
    this.sharedGovernanceTail = tail;
    this.clock = clock;
    this.maxTotalDurationMs = maxTotalDurationMs;
    this.maxOrchestrationResultBytes = bound(options.maxOrchestrationResultBytes, DEFAULT_MAX_ORCHESTRATION_RESULT_BYTES, "maxOrchestrationResultBytes");
    this.maxExecutorInputBytes = bound(options.maxExecutorInputBytes, DEFAULT_MAX_EXECUTOR_INPUT_BYTES, "maxExecutorInputBytes");
    this.maxDeliveryResultBytes = bound(options.maxDeliveryResultBytes, DEFAULT_MAX_DELIVERY_RESULT_BYTES, "maxDeliveryResultBytes");
    this.maxPublishResultBytes = bound(options.maxPublishResultBytes, DEFAULT_MAX_PUBLISH_RESULT_BYTES, "maxPublishResultBytes");
    this.maxA1Bytes = bound(options.maxA1Bytes, DEFAULT_MAX_A1_BYTES, "maxA1Bytes");
  }

  async execute(request: LoopProductionCoordinatorRequest): Promise<LoopProductionCoordinatorResult> {
    // The D09 deadline starts at the first valid `execute()` clock sample
    // (never `identity.createdAt`).
    const startSample = this.sampleClock();
    if (startSample === null) {
      return this.zeroState(
        "failed", "CLOCK_INVALID", "clock invalid",
        request as LoopProductionCoordinatorRequest, undefined,
        Object.freeze([]),
      );
    }
    const state = this.createState(request, startSample);
    if (state === null) {
      return this.zeroState(
        "failed", "INVALID_INPUT", "invalid coordinator request",
        request as LoopProductionCoordinatorRequest, undefined,
        Object.freeze([]),
      );
    }
    try {
      return await this.runChain(state);
    } catch {
      const elapsed = Math.max(0, state.lastClockMs - state.startMs);
      this.addTrace(state, "terminal", "failed", null, elapsed);
      return this.buildResult(state, "failed", "INTERNAL_ERROR", "internal coordinator failure", undefined, elapsed);
    }
  }

  // ── state machine ──

  private createState(request: LoopProductionCoordinatorRequest, startMs: number): CoordinatorInternalState | null {
    try {
      if (request === null || typeof request !== "object" || Array.isArray(request)) return null;
      const proto = Object.getPrototypeOf(request);
      if (proto !== Object.prototype && proto !== null) return null;
      const own = Object.getOwnPropertyNames(request);
      if (own.length < 2 || own.some((k) => !(REQUEST_KEYS as readonly string[]).includes(k))) return null;
      if (Object.getOwnPropertySymbols(request).length !== 0) return null;
      if (!own.includes("identity") || !own.includes("orchestrationResultArtifactRef")) return null;
      if (own.includes("recoveryPublishIntentArtifactRef") && (request as unknown as Record<string, unknown>).recoveryPublishIntentArtifactRef === undefined) {
        return null;
      }
      const identity = request.identity as unknown;
      validateLoopRunIdentity(identity);
      const ref = request.orchestrationResultArtifactRef;
      if (typeof ref !== "string") return null;
      const refMatch = REF_RE.exec(ref);
      if (refMatch === null || refMatch[1] !== "orchestration_result") return null;
      const recovery = request.recoveryPublishIntentArtifactRef;
      if (recovery !== undefined) {
        if (typeof recovery !== "string") return null;
        const recoveryMatch = REF_RE.exec(recovery);
        if (recoveryMatch === null || recoveryMatch[1] !== "workspace_metadata") return null;
      }
      return {
        identity: identity as Readonly<LoopRunIdentity>,
        orchestrationResultArtifactRef: ref,
        recoveryPublishIntentArtifactRef: recovery,
        maxTotalDurationMs: this.maxTotalDurationMs,
        maxDeliveryResultBytes: this.maxDeliveryResultBytes,
        maxPublishResultBytes: this.maxPublishResultBytes,
        maxA1Bytes: this.maxA1Bytes,
        startMs,
        lastClockMs: startMs,
        clockError: false,
        deadlineExceeded: false,
        trace: [],
        sequence: 0,
      };
    } catch {
      return null;
    }
  }

  private async runChain(state: CoordinatorInternalState): Promise<LoopProductionCoordinatorResult> {
    // ── orchestration artifact (fixed root input) ──
    const gate0 = this.gate(state);
    if (gate0 === "clock_invalid") return this.deadlineTerminal(state, "clock_invalid");
    if (gate0 === "expired") return this.deadlineTerminal(state, "expired");
    const orchestration = await this.readAndParseOrchestration(state);
    if (orchestration.ok === false) {
      return this.terminalize(state, orchestration.status, orchestration.reasonCode, orchestration.message);
    }
    const orchestrationValue = orchestration.value;
    this.addTrace(state, "orchestration_verify", "verified", orchestrationValue.executorInputArtifactRef, this.elapsed(state));

    if (orchestrationValue.route !== "direct" || orchestrationValue.reasonCode !== "DIRECT_READY") {
      return this.terminalize(state, "blocked", "ORCHESTRATION_NOT_DIRECT", "orchestration route is not direct / DIRECT_READY");
    }
    if (orchestrationValue.executorInputArtifactRef === null || orchestrationValue.executorInputDigestSha256 === null) {
      return this.terminalize(state, "failed", "ORCHESTRATION_VERIFICATION_FAILED", "orchestration result carries no executor input ref");
    }
    const executorRef = orchestrationValue.executorInputArtifactRef;
    const executorRefDigest = REF_RE.exec(executorRef)![2]!;
    if (orchestrationValue.executorInputDigestSha256 !== executorRefDigest) {
      return this.terminalize(state, "failed", "ORCHESTRATION_VERIFICATION_FAILED", "orchestration executor digest does not bind to the ref");
    }

    // ── executor input artifact (ref taken from the verified orchestration) ──
    const gate1 = this.gate(state);
    if (gate1 === "clock_invalid") return this.deadlineTerminal(state, "clock_invalid");
    if (gate1 === "expired") return this.deadlineTerminal(state, "expired");
    const executor = await this.readAndParseExecutorInput(state, executorRef);
    if (executor.ok === false) {
      return this.terminalize(state, executor.status, executor.reasonCode, executor.message);
    }
    const executorValue = executor.value;
    this.addTrace(state, "executor_input_verify", "verified", executorRef, this.elapsed(state));

    // ── D03 prepare ──
    const gate2 = this.gate(state);
    if (gate2 === "clock_invalid") return this.deadlineTerminal(state, "clock_invalid");
    if (gate2 === "expired") return this.deadlineTerminal(state, "expired");
    const prepared = await this.prepareWorkspace(state);
    if (prepared.ok === false) {
      return this.terminalize(state, prepared.status, prepared.reasonCode, prepared.message);
    }
    const snapshot = prepared.value;
    this.addTrace(state, "workspace_prepare", snapshot.state, null, this.elapsed(state));

    // ── D06 execute (bounded by the shared remaining budget) ──
    const gate3 = this.gate(state);
    if (gate3 === "clock_invalid") return this.deadlineTerminal(state, "clock_invalid");
    if (gate3 === "expired") return this.deadlineTerminal(state, "expired");
    const remaining3 = state.deadlineExceeded ? 0 : this.remainingMs(state);
    if (remaining3 < MIN_MAX_TOTAL_DURATION_MS) {
      return this.terminalize(state, "failed", "TOTAL_TIMEOUT", "insufficient remaining budget for delivery execution");
    }
    const d06Budget = Math.min(executorValue.maxTotalDurationMs, remaining3);
    let deliveryResult: LoopAutonomousDeliveryResult;
    try {
      deliveryResult = await this.deliveryLoop.execute({
        identity: state.identity,
        workspace: {
          workspacePath: snapshot.workspacePath,
          taskBranch: snapshot.taskBranch,
          expectedTaskHeadSha: snapshot.taskHeadSha,
          expectedPreStatusDigestSha256: snapshot.taskStatusDigestSha256,
        },
        requirement: this.executorRequirementText(executorValue),
        designSummary: this.executorDesignSummaryText(executorValue),
        implementationConstraints: executorValue.implementationConstraints,
        allowedPaths: executorValue.allowedPaths,
        testPlan: executorValue.testPlan,
        reviewPlan: executorValue.reviewPlan,
        maxFixRounds: executorValue.maxFixRounds,
        maxTotalDurationMs: d06Budget,
      });
    } catch {
      return this.terminalize(state, "failed", "INTERNAL_ERROR", "delivery loop threw unexpectedly");
    }
    this.addTrace(state, "delivery_execute", deliveryResult.status, deliveryResult.deliveryResultArtifactRef ?? null, this.elapsed(state));
    if (deliveryResult.status === "failed") {
      return this.terminalize(state, "failed", "DELIVERY_FAILED", "delivery execution failed");
    }
    if (deliveryResult.status === "blocked") {
      return this.terminalize(state, "blocked", "DELIVERY_BLOCKED", "delivery execution blocked");
    }

    // ── D06 delivery artifact read-back + parser (artifact is the authority) ──
    const gate4 = this.gate(state);
    if (gate4 === "clock_invalid") return this.deadlineTerminal(state, "clock_invalid");
    if (gate4 === "expired") return this.deadlineTerminal(state, "expired");
    const deliveryRef = deliveryResult.deliveryResultArtifactRef;
    if (deliveryRef === undefined) {
      return this.terminalize(state, "blocked", "DELIVERY_READBACK_AMBIGUOUS", "delivery succeeded without a persisted artifact");
    }
    if (deliveryResult.finalWorkspace === undefined) {
      return this.terminalize(state, "blocked", "DELIVERY_READBACK_AMBIGUOUS", "delivery succeeded without a final workspace");
    }
    if (deliveryResult.finalWorkspace.taskBranch !== state.identity.taskBranch) {
      return this.terminalize(state, "blocked", "DELIVERY_READBACK_AMBIGUOUS", "delivery workspace branch does not bind to the identity");
    }
    const readback = await this.readAndParseDelivery(state, deliveryRef, {
      workspacePath: deliveryResult.finalWorkspace.workspacePath,
      taskBranch: deliveryResult.finalWorkspace.taskBranch,
      taskHeadSha: deliveryResult.finalWorkspace.taskHeadSha,
      statusDigestSha256: deliveryResult.finalWorkspace.statusDigestSha256,
      taskHasChanges: deliveryResult.finalWorkspace.taskHasChanges,
    });
    if (readback.ok === false) {
      return this.terminalize(state, "blocked", "DELIVERY_READBACK_AMBIGUOUS", readback.message);
    }
    const deliveryParsed = readback.value;
    if (!sameStringArray(deliveryParsed.files, deliveryResult.files)) {
      return this.terminalize(state, "blocked", "DELIVERY_READBACK_AMBIGUOUS", "delivery artifact files do not match the in-memory result");
    }
    if (deliveryParsed.finalWorkspace === null) {
      return this.terminalize(state, "blocked", "DELIVERY_READBACK_AMBIGUOUS", "delivery artifact carries no final workspace");
    }
    this.addTrace(state, "delivery_readback", "verified", deliveryRef, this.elapsed(state));

    // ── injected Shared Documentation Governance Tail ──
    const gate5 = this.gate(state);
    if (gate5 === "clock_invalid") return this.deadlineTerminal(state, "clock_invalid");
    if (gate5 === "expired") return this.deadlineTerminal(state, "expired");
    const tailInput: Readonly<LoopSharedGovernanceTailInput> = {
      identity: state.identity,
      orchestrationResultArtifactRef: state.orchestrationResultArtifactRef,
      executorInputArtifactRef: executorRef,
      deliveryResultArtifactRef: deliveryRef,
      implementationFiles: deliveryParsed.files,
      finalWorkspace: deliveryParsed.finalWorkspace,
      remainingMs: Math.max(0, this.remainingMs(state)),
    };
    let tailResult: LoopSharedGovernanceTailResult;
    try {
      tailResult = await this.sharedGovernanceTail.run(tailInput);
    } catch {
      return this.terminalize(state, "failed", "GOVERNANCE_TAIL_FAILED", "shared governance tail threw");
    }
    const tailShape = this.scanTailResult(tailResult);
    if (tailShape.ok === false) {
      return this.terminalize(state, "failed", "GOVERNANCE_TAIL_INVALID", tailShape.message);
    }
    this.addTrace(state, "governance_tail", tailResult.status, null, this.elapsed(state));
    if (tailResult.status !== "completed") {
      if (tailResult.status === "failed") {
        return this.terminalize(state, "failed", "GOVERNANCE_TAIL_FAILED", "shared governance tail failed");
      }
      return this.terminalize(state, "blocked", "GOVERNANCE_TAIL_NOT_COMPLETED", "shared governance tail is not completed");
    }
    if (tailResult.completionPackage === undefined) {
      return this.terminalize(state, "failed", "GOVERNANCE_TAIL_INVALID", "completed tail result carries no completion package");
    }

    // ── A1 build (the real A1 builder validates the untrusted completion package) ──
    const gate6 = this.gate(state);
    if (gate6 === "clock_invalid") return this.deadlineTerminal(state, "clock_invalid");
    if (gate6 === "expired") return this.deadlineTerminal(state, "expired");
    const packageValue = tailResult.completionPackage;
    let built: Readonly<LoopGovernanceTailResultBuildSuccess>;
    try {
      const a1Input: Record<string, unknown> = {
        schema: LOOP_GOVERNANCE_TAIL_RESULT_SCHEMA,
        status: "completed",
        reason_code: "GOVERNANCE_TAIL_COMPLETED",
        identity: state.identity,
        orchestration_result_artifact_ref: state.orchestrationResultArtifactRef,
        executor_input_artifact_ref: executorRef,
        delivery_result_artifact_ref: deliveryRef,
        final_workspace: packageValue.final_workspace,
        implementation_files: packageValue.implementation_files,
        files: packageValue.files,
        docflow: packageValue.docflow,
        business_domain_sync: packageValue.business_domain_sync,
        reconcile: packageValue.reconcile,
        entry_coverage: packageValue.entry_coverage,
        regate: packageValue.regate,
        manifest: packageValue.manifest,
        tail_gate: packageValue.tail_gate,
        blocking_items: packageValue.blocking_items,
        elapsed_ms: packageValue.elapsed_ms,
      };
      const builtResult = buildLoopGovernanceTailResult(a1Input, this.maxA1Bytes);
      if (builtResult.ok === false) {
        return this.terminalize(state, "failed", "A1_BUILD_FAILED", "governance tail result build failed");
      }
      built = builtResult;
    } catch {
      return this.terminalize(state, "failed", "A1_BUILD_FAILED", "governance tail result build failed");
    }
    this.addTrace(state, "a1_build", "verified", null, this.elapsed(state));

    // ── A1 store / read-back / parse + canonical value comparison ──
    const gate7 = this.gate(state);
    if (gate7 === "clock_invalid") return this.deadlineTerminal(state, "clock_invalid");
    if (gate7 === "expired") return this.deadlineTerminal(state, "expired");
    const a1 = this.storeReadBackA1(state, built);
    if (a1.ok === false) {
      return this.terminalize(state, "failed", "A1_VERIFICATION_FAILED", a1.message);
    }
    const a1Ref = a1.value.artifactRef;
    const a1Value = a1.value.value;
    if (!sameStringArray(a1Value.implementation_files, deliveryParsed.files)) {
      return this.terminalize(state, "failed", "A1_VERIFICATION_FAILED", "A1 implementation files do not bind to the delivery files");
    }
    this.addTrace(state, "a1_store_readback", "verified", a1Ref, this.elapsed(state));

    // ── D03 post-Tail inspect (A1 final workspace must equal the snapshot) ──
    const gate8 = this.gate(state);
    if (gate8 === "clock_invalid") return this.deadlineTerminal(state, "clock_invalid");
    if (gate8 === "expired") return this.deadlineTerminal(state, "expired");
    const inspected = await this.postTailInspect(state, a1Value);
    if (inspected.ok === false) {
      return this.terminalize(state, "blocked", "FINAL_WORKSPACE_DRIFT", inspected.message);
    }
    this.addTrace(state, "post_tail_inspect", "verified", null, this.elapsed(state));

    // ── D07 governed publish (governanceTailResultArtifactRef always present) ──
    const gate9 = this.gate(state);
    if (gate9 === "clock_invalid") return this.deadlineTerminal(state, "clock_invalid");
    if (gate9 === "expired") return this.deadlineTerminal(state, "expired");
    const remaining9 = state.deadlineExceeded ? 0 : this.remainingMs(state);
    if (remaining9 <= 0) {
      return this.terminalize(state, "failed", "TOTAL_TIMEOUT", "insufficient remaining budget for governed publish");
    }
    const publishRequest: LoopDeliveryPublishRequest = {
      identity: state.identity,
      deliveryResultArtifactRef: deliveryRef,
      commitSubject: executorValue.commitSubject,
      prTitle: executorValue.prTitle,
      governanceTailResultArtifactRef: a1Ref,
      ...(state.recoveryPublishIntentArtifactRef !== undefined
        ? { recoveryPublishIntentArtifactRef: state.recoveryPublishIntentArtifactRef }
        : {}),
    };
    let publishResult: LoopDeliveryPublishResult;
    try {
      publishResult = await this.publisher.execute(publishRequest);
    } catch {
      return this.terminalize(state, "failed", "PUBLISH_FAILED", "publisher threw unexpectedly");
    }
    this.addTrace(state, "governed_publish", publishResult.status, publishResult.publishResultArtifactRef ?? null, this.elapsed(state));
    if (publishResult.status === "failed") {
      return this.terminalize(state, "failed", "PUBLISH_FAILED", "governed publish failed");
    }
    if (publishResult.status === "blocked") {
      return this.terminalize(state, "blocked", "PUBLISH_BLOCKED", "governed publish blocked");
    }
    if (publishResult.governanceTailResultArtifactRef !== a1Ref) {
      return this.terminalize(state, "failed", "GOVERNED_PUBLISH_VIOLATION", "publish result is not bound to the governance tail artifact");
    }
    const publishRef = publishResult.publishResultArtifactRef;
    if (publishRef === undefined) {
      return this.terminalize(state, "blocked", "PUBLISH_READBACK_AMBIGUOUS", "publish succeeded without a persisted result artifact");
    }

    // ── D07 publish-result read-back + parser (persisted facts are the authority) ──
    const gate10 = this.gate(state);
    if (gate10 === "clock_invalid") return this.deadlineTerminal(state, "clock_invalid");
    if (gate10 === "expired") return this.deadlineTerminal(state, "expired");
    const publishParsed = await this.readAndParsePublishResult(state, publishRef, {
      expectedDeliveryResultArtifactRef: deliveryRef,
      expectedGovernanceTailResultArtifactRef: a1Ref,
      expectedFiles: a1Value.files,
    });
    if (publishParsed.ok === false) {
      return this.terminalize(state, "blocked", "PUBLISH_READBACK_AMBIGUOUS", publishParsed.message);
    }
    const publishValue = publishParsed.value;
    if (publishValue.status !== "succeeded" || publishValue.reasonCode !== "PUBLISH_SUCCEEDED") {
      return this.terminalize(state, "blocked", "PUBLISH_READBACK_AMBIGUOUS", "persisted publish result is not succeeded");
    }
    if (publishResult.commitSha !== undefined && publishValue.commitSha !== publishResult.commitSha) {
      return this.terminalize(state, "blocked", "PUBLISH_READBACK_AMBIGUOUS", "persisted commit sha does not match the in-memory result");
    }
    this.addTrace(state, "publish_readback", "verified", publishRef, this.elapsed(state));

    // ── D09 succeeded ──
    const elapsed = this.elapsed(state);
    this.addTrace(state, "terminal", "succeeded", publishRef, elapsed);
    return this.buildResult(state, "succeeded", "DELIVERY_SUCCEEDED", "governed production delivery succeeded", undefined, elapsed, {
      executorInputArtifactRef: executorRef,
      deliveryResultArtifactRef: deliveryRef,
      governanceTailResultArtifactRef: a1Ref,
      publishResultArtifactRef: publishRef,
      commitSha: publishValue.commitSha ?? undefined,
      prNumber: publishValue.prNumber ?? undefined,
      prUrl: publishValue.prUrl ?? undefined,
      files: publishValue.files,
      finalGovernedWorkspace: a1Value.final_workspace,
    });
  }

  // ── stage helpers ──

  private async readAndParseOrchestration(
    state: CoordinatorInternalState,
  ): Promise<{ ok: true; value: LoopParsedOrchestrationResult } | { ok: false; status: "failed"; reasonCode: LoopProductionCoordinatorReasonCode; message: string }> {
    const refDigest = REF_RE.exec(state.orchestrationResultArtifactRef)![2]!;
    let bytes: Buffer;
    try {
      bytes = this.artifactStore.read(state.orchestrationResultArtifactRef, refDigest);
    } catch {
      return { ok: false, status: "failed", reasonCode: "ORCHESTRATION_VERIFICATION_FAILED", message: "orchestration artifact read failed" };
    }
    if (sha256Hex(bytes) !== refDigest || bytes.length > this.maxOrchestrationResultBytes) {
      return { ok: false, status: "failed", reasonCode: "ORCHESTRATION_VERIFICATION_FAILED", message: "orchestration artifact digest mismatch" };
    }
    const parsed = parseLoopOrchestrationResultBytes(bytes, {
      maxBytes: this.maxOrchestrationResultBytes,
      expectedIdentity: state.identity,
    });
    if (parsed.ok === false) {
      return { ok: false, status: "failed", reasonCode: "ORCHESTRATION_VERIFICATION_FAILED", message: `orchestration artifact parse failed (${parsed.reason})` };
    }
    return { ok: true, value: parsed.value };
  }

  private async readAndParseExecutorInput(
    state: CoordinatorInternalState,
    executorRef: string,
  ): Promise<{ ok: true; value: LoopDirectExecutorInput } | { ok: false; status: "failed"; reasonCode: LoopProductionCoordinatorReasonCode; message: string }> {
    const refDigest = REF_RE.exec(executorRef)![2]!;
    let bytes: Buffer;
    try {
      bytes = this.artifactStore.read(executorRef, refDigest);
    } catch {
      return { ok: false, status: "failed", reasonCode: "EXECUTOR_INPUT_VERIFICATION_FAILED", message: "executor input artifact read failed" };
    }
    if (sha256Hex(bytes) !== refDigest || bytes.length > this.maxExecutorInputBytes) {
      return { ok: false, status: "failed", reasonCode: "EXECUTOR_INPUT_VERIFICATION_FAILED", message: "executor input artifact digest mismatch" };
    }
    const parsed = parseLoopDirectExecutorInputBytes(bytes, {
      maxBytes: this.maxExecutorInputBytes,
      expectedIdentity: state.identity,
    });
    if (parsed.ok === false) {
      return { ok: false, status: "failed", reasonCode: "EXECUTOR_INPUT_VERIFICATION_FAILED", message: `executor input artifact parse failed (${parsed.reason})` };
    }
    return { ok: true, value: parsed.value };
  }

  private async prepareWorkspace(
    state: CoordinatorInternalState,
  ): Promise<{ ok: true; value: LoopGitWorkspaceSnapshot } | { ok: false; status: "blocked"; reasonCode: LoopProductionCoordinatorReasonCode; message: string }> {
    let snapshot: LoopGitWorkspaceSnapshot;
    try {
      snapshot = await this.workspaceManager.prepare(state.identity);
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      if (code === "BASE_SHA_MISMATCH") {
        return { ok: false, status: "blocked", reasonCode: "BASE_BRANCH_DRIFT", message: "workspace base drifted" };
      }
      if (code === "SOURCE_WORKSPACE_DRIFT") {
        return { ok: false, status: "blocked", reasonCode: "WORKSPACE_DRIFT", message: "source workspace drifted" };
      }
      return { ok: false, status: "blocked", reasonCode: "WORKSPACE_PREPARE_BLOCKED", message: "workspace prepare blocked" };
    }
    if (snapshot.baseDrifted || snapshot.currentBaseSha !== state.identity.expectedBaseSha) {
      return { ok: false, status: "blocked", reasonCode: "BASE_BRANCH_DRIFT", message: "workspace base drifted" };
    }
    if (snapshot.runId !== state.identity.runId || snapshot.repository !== state.identity.repository
      || snapshot.repositoryPath !== state.identity.repositoryPath || snapshot.taskBranch !== state.identity.taskBranch) {
      return { ok: false, status: "blocked", reasonCode: "WORKSPACE_DRIFT", message: "workspace identity binding mismatch" };
    }
    if (snapshot.sourceHeadSha !== state.identity.expectedBaseSha || snapshot.sourceBranch !== state.identity.baseBranch) {
      return { ok: false, status: "blocked", reasonCode: "WORKSPACE_DRIFT", message: "source workspace invariance violation" };
    }
    return { ok: true, value: snapshot };
  }

  private async readAndParseDelivery(
    state: CoordinatorInternalState,
    deliveryRef: string,
    expectedMaterial: Readonly<{ workspacePath: string; taskBranch: string; taskHeadSha: string; statusDigestSha256: string; taskHasChanges: boolean }>,
  ): Promise<{ ok: true; value: LoopParsedDeliveryResult } | { ok: false; status: "blocked"; reasonCode: LoopProductionCoordinatorReasonCode; message: string }> {
    const refDigest = REF_RE.exec(deliveryRef)![2]!;
    let bytes: Buffer;
    try {
      bytes = this.artifactStore.read(deliveryRef, refDigest);
    } catch {
      return { ok: false, status: "blocked", reasonCode: "DELIVERY_READBACK_AMBIGUOUS", message: "delivery artifact read failed" };
    }
    if (sha256Hex(bytes) !== refDigest || bytes.length > this.maxDeliveryResultBytes) {
      return { ok: false, status: "blocked", reasonCode: "DELIVERY_READBACK_AMBIGUOUS", message: "delivery artifact digest mismatch" };
    }
    const parsed = parseLoopDeliveryResultBytes(bytes, {
      maxBytes: this.maxDeliveryResultBytes,
      expectedMaterial,
    });
    if (parsed.ok === false) {
      return { ok: false, status: "blocked", reasonCode: "DELIVERY_READBACK_AMBIGUOUS", message: `delivery artifact parse failed (${parsed.reason})` };
    }
    if (parsed.value.status !== "succeeded") {
      return { ok: false, status: "blocked", reasonCode: "DELIVERY_READBACK_AMBIGUOUS", message: "delivery artifact is not succeeded" };
    }
    return { ok: true, value: parsed.value };
  }

  private scanTailResult(tailResult: LoopSharedGovernanceTailResult): { ok: true } | { ok: false; message: string } {
    try {
      if (tailResult === null || typeof tailResult !== "object" || Array.isArray(tailResult)) {
        return { ok: false, message: "tail result is not a plain object" };
      }
      const proto = Object.getPrototypeOf(tailResult);
      if (proto !== Object.prototype && proto !== null) {
        return { ok: false, message: "tail result is not a plain object" };
      }
      const own = Object.getOwnPropertyNames(tailResult);
      const allowed = ["status", "reasonCode", "safeMessage", "completionPackage"];
      if (own.some((k) => !allowed.includes(k))) {
        return { ok: false, message: "tail result must contain only canonical keys" };
      }
      const record = tailResult as unknown as Record<string, unknown>;
      const status = record.status;
      const reasonCode = record.reasonCode;
      const safeMessage = record.safeMessage;
      const completionPackage = record.completionPackage;
      const statuses: readonly string[] = ["pending", "in_progress", "blocked", "failed", "completed"];
      if (typeof status !== "string" || !statuses.includes(status)) {
        return { ok: false, message: "tail result status is not canonical" };
      }
      if (typeof reasonCode !== "string" || reasonCode.length === 0 || /[\x00-\x1f\x7f-\x9f]/.test(reasonCode)) {
        return { ok: false, message: "tail result reasonCode is invalid" };
      }
      if (typeof safeMessage !== "string" || /[\x00-\x1f\x7f-\x9f]/.test(safeMessage) || safeMessage.length > MAX_SAFE_MESSAGE_LENGTH) {
        return { ok: false, message: "tail result safeMessage is invalid" };
      }
      if (status !== "completed" && completionPackage !== undefined) {
        return { ok: false, message: "non-completed tail result must not carry a completion package" };
      }
      if (status === "completed" && completionPackage === undefined) {
        return { ok: false, message: "completed tail result must carry a completion package" };
      }
      return { ok: true };
    } catch {
      return { ok: false, message: "tail result is not readable" };
    }
  }

  private storeReadBackA1(
    state: CoordinatorInternalState,
    built: Readonly<LoopGovernanceTailResultBuildSuccess>,
  ): { ok: true; value: { artifactRef: string; value: Readonly<LoopGovernanceTailResult> } } | { ok: false; message: string } {
    let stored: LoopStoredArtifact;
    try {
      stored = this.artifactStore.put("governance_tail_result" as LoopArtifactKind, built.bytes);
    } catch {
      return { ok: false, message: "A1 artifact store put failed" };
    }
    const expectedRef = `loop-artifact:v1:governance_tail_result:sha256:${built.digestSha256}`;
    if (stored.kind !== "governance_tail_result" || stored.digest !== built.digestSha256
      || stored.sizeBytes !== built.sizeBytes || stored.artifactRef !== expectedRef) {
      return { ok: false, message: "A1 store descriptor mismatch" };
    }
    let readBack: Buffer;
    try {
      readBack = this.artifactStore.read(stored.artifactRef, stored.digest);
    } catch {
      return { ok: false, message: "A1 artifact read-back failed" };
    }
    if (sha256Hex(readBack) !== built.digestSha256 || readBack.length !== built.sizeBytes) {
      return { ok: false, message: "A1 artifact read-back digest mismatch" };
    }
    const parsed = parseLoopGovernanceTailResultBytes(readBack, this.maxA1Bytes);
    if (parsed.ok === false) {
      return { ok: false, message: "A1 artifact read-back parse failed" };
    }
    if (!deepFrozenEqual(parsed.value, built.value)) {
      return { ok: false, message: "A1 canonical value comparison mismatch" };
    }
    return { ok: true, value: { artifactRef: stored.artifactRef, value: parsed.value } };
  }

  private async postTailInspect(
    state: CoordinatorInternalState,
    a1Value: Readonly<LoopGovernanceTailResult>,
  ): Promise<{ ok: true; value: LoopGitWorkspaceSnapshot } | { ok: false; message: string }> {
    let snapshot: LoopGitWorkspaceSnapshot;
    try {
      snapshot = await this.workspaceManager.inspect(state.identity);
    } catch {
      return { ok: false, message: "post-tail workspace inspect failed" };
    }
    const fw = a1Value.final_workspace;
    if (snapshot.workspacePath !== fw.workspace_path || snapshot.taskBranch !== fw.task_branch
      || snapshot.taskHeadSha !== fw.task_head_sha || snapshot.taskStatusDigestSha256 !== fw.status_digest_sha256
      || snapshot.taskHasChanges !== fw.task_has_changes) {
      return { ok: false, message: "post-tail workspace does not match the A1 final workspace" };
    }
    if (snapshot.baseDrifted || snapshot.currentBaseSha !== state.identity.expectedBaseSha) {
      return { ok: false, message: "post-tail workspace base drifted" };
    }
    return { ok: true, value: snapshot };
  }

  private async readAndParsePublishResult(
    state: CoordinatorInternalState,
    publishRef: string,
    expected: Readonly<{ expectedDeliveryResultArtifactRef: string; expectedGovernanceTailResultArtifactRef: string; expectedFiles: readonly string[] }>,
  ): Promise<{ ok: true; value: LoopParsedPublishResult } | { ok: false; status: "blocked"; reasonCode: LoopProductionCoordinatorReasonCode; message: string }> {
    const refDigest = REF_RE.exec(publishRef)![2]!;
    let bytes: Buffer;
    try {
      bytes = this.artifactStore.read(publishRef, refDigest);
    } catch {
      return { ok: false, status: "blocked", reasonCode: "PUBLISH_READBACK_AMBIGUOUS", message: "publish result artifact read failed" };
    }
    if (sha256Hex(bytes) !== refDigest || bytes.length > this.maxPublishResultBytes) {
      return { ok: false, status: "blocked", reasonCode: "PUBLISH_READBACK_AMBIGUOUS", message: "publish result artifact digest mismatch" };
    }
    const parsed = parseLoopDeliveryPublishResultBytes(bytes, {
      maxBytes: this.maxPublishResultBytes,
      expectedMode: "governed",
      expectedDeliveryResultArtifactRef: expected.expectedDeliveryResultArtifactRef,
      expectedGovernanceTailResultArtifactRef: expected.expectedGovernanceTailResultArtifactRef,
      expectedFiles: expected.expectedFiles,
    });
    if (parsed.ok === false) {
      return { ok: false, status: "blocked", reasonCode: "PUBLISH_READBACK_AMBIGUOUS", message: `publish result artifact parse failed (${parsed.reason})` };
    }
    return { ok: true, value: parsed.value };
  }

  // ── deadline / clock ──

  private sampleClock(): number | null {
    let now: unknown;
    try {
      now = this.clock.nowMs();
    } catch {
      return null;
    }
    if (typeof now !== "number" || !Number.isFinite(now) || !Number.isSafeInteger(now) || now < 0) {
      return null;
    }
    return now;
  }

  private gate(state: CoordinatorInternalState): ClockGate {
    const now = this.sampleClock();
    if (now === null) {
      state.clockError = true;
      return "clock_invalid";
    }
    if (now < state.lastClockMs) {
      state.clockError = true;
      return "clock_invalid";
    }
    state.lastClockMs = now;
    if (now - state.startMs > state.maxTotalDurationMs) {
      state.deadlineExceeded = true;
      return "expired";
    }
    return "active";
  }

  private remainingMs(state: CoordinatorInternalState): number {
    return state.maxTotalDurationMs - (state.lastClockMs - state.startMs);
  }

  private elapsed(state: CoordinatorInternalState): number {
    return Math.max(0, state.lastClockMs - state.startMs);
  }

  private addTrace(state: CoordinatorInternalState, stage: LoopProductionCoordinatorTraceStage, outcome: string, artifactRef: string | null, elapsedMs: number): void {
    state.sequence += 1;
    state.trace.push(Object.freeze({
      sequence: state.sequence,
      stage,
      outcome,
      artifactRef,
      elapsedMs: Math.max(0, elapsedMs),
    }));
  }

  private deadlineTerminal(state: CoordinatorInternalState, gate: ClockGate): LoopProductionCoordinatorResult {
    const elapsed = this.elapsed(state);
    if (gate === "clock_invalid") {
      this.addTrace(state, "terminal", "failed", null, elapsed);
      return this.buildResult(state, "failed", "CLOCK_INVALID", "clock invalid", undefined, elapsed);
    }
    this.addTrace(state, "terminal", "failed", null, elapsed);
    return this.buildResult(state, "failed", "TOTAL_TIMEOUT", "total timeout reached", undefined, elapsed);
  }

  private terminalize(
    state: CoordinatorInternalState,
    status: LoopProductionCoordinatorStatus,
    reasonCode: LoopProductionCoordinatorReasonCode,
    message: string,
  ): LoopProductionCoordinatorResult {
    const elapsed = this.elapsed(state);
    this.addTrace(state, "terminal", status, null, elapsed);
    return this.buildResult(state, status, reasonCode, message, undefined, elapsed);
  }

  private zeroState(
    status: LoopProductionCoordinatorStatus,
    reasonCode: LoopProductionCoordinatorReasonCode,
    message: string,
    request: LoopProductionCoordinatorRequest,
    causeCode: string | undefined,
    trace: readonly LoopProductionCoordinatorTraceEntry[],
  ): LoopProductionCoordinatorResult {
    // Proxy/accessor traps on the untrusted request must fail closed.
    let orchestrationRef = "";
    try {
      const value = (request as unknown as Record<string, unknown> | null | undefined)?.orchestrationResultArtifactRef;
      if (typeof value === "string") orchestrationRef = value;
    } catch {
      orchestrationRef = "";
    }
    return deepFreeze({
      status,
      reasonCode,
      safeMessage: sanitizeSafeMessage(message),
      causeCode,
      orchestrationResultArtifactRef: orchestrationRef,
      files: Object.freeze([]),
      elapsedMs: 0,
      trace,
    }) as LoopProductionCoordinatorResult;
  }

  private buildResult(
    state: CoordinatorInternalState,
    status: LoopProductionCoordinatorStatus,
    reasonCode: LoopProductionCoordinatorReasonCode,
    message: string,
    causeCode: string | undefined,
    elapsedMs: number,
    facts?: Partial<Omit<LoopProductionCoordinatorResult, "status" | "reasonCode" | "safeMessage" | "causeCode" | "elapsedMs" | "trace">>,
  ): LoopProductionCoordinatorResult {
    const result: LoopProductionCoordinatorResult = {
      status,
      reasonCode,
      safeMessage: sanitizeSafeMessage(message),
      causeCode,
      orchestrationResultArtifactRef: state.orchestrationResultArtifactRef,
      files: Object.freeze(facts?.files ? [...facts.files] : []),
      elapsedMs: Math.max(0, elapsedMs),
      trace: Object.freeze([...state.trace]),
      ...(facts?.executorInputArtifactRef !== undefined ? { executorInputArtifactRef: facts.executorInputArtifactRef } : {}),
      ...(facts?.deliveryResultArtifactRef !== undefined ? { deliveryResultArtifactRef: facts.deliveryResultArtifactRef } : {}),
      ...(facts?.governanceTailResultArtifactRef !== undefined ? { governanceTailResultArtifactRef: facts.governanceTailResultArtifactRef } : {}),
      ...(facts?.publishResultArtifactRef !== undefined ? { publishResultArtifactRef: facts.publishResultArtifactRef } : {}),
      ...(facts?.commitSha !== undefined ? { commitSha: facts.commitSha } : {}),
      ...(facts?.prNumber !== undefined ? { prNumber: facts.prNumber } : {}),
      ...(facts?.prUrl !== undefined ? { prUrl: facts.prUrl } : {}),
      ...(facts?.finalGovernedWorkspace !== undefined ? { finalGovernedWorkspace: facts.finalGovernedWorkspace } : {}),
    };
    return deepFreeze(result);
  }

  // ── lossless D06 request mapping (deterministic canonical JSON) ──

  private executorRequirementText(executor: LoopDirectExecutorInput): string {
    return JSON.stringify({
      objective: executor.requirement.objective,
      acceptanceCriteria: [...executor.requirement.acceptanceCriteria],
      constraints: [...executor.requirement.constraints],
    });
  }

  private executorDesignSummaryText(executor: LoopDirectExecutorInput): string {
    return JSON.stringify({
      approach: executor.designSummary.approach,
      components: [...executor.designSummary.components],
      interfaces: [...executor.designSummary.interfaces],
      dataChanges: [...executor.designSummary.dataChanges],
      riskControls: [...executor.designSummary.riskControls],
    });
  }
}
