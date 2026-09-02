// LOOP Executor Kernel — Durable SQLite Run Journal Store
// =========================================================
// better-sqlite3 backed append-only run journal with cross-connection
// concurrency guarantees. Each store instance owns exactly one connection.
// Only fixed safe scalars are persisted — never raw prompt, patch, stdout,
// stderr, credentials, environment maps, repository content, JSON payloads,
// or arbitrary metadata.

import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync, statSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";

import {
  LOOP_STAGE_NAMES,
  LoopRunJournalError,
  type LoopRunEvent,
  type LoopRunIdentity,
  type LoopRunSnapshot,
  type LoopRunState,
  type LoopRunStatus,
  type LoopRunStoreOptions,
  type LoopStageName,
  type LoopStageState,
  type LoopStageStatus,
} from "./loop-executor-types";
import {
  applyLoopRunEvent,
  canonicalizeLoopRunEvent,
  canonicalizeLoopRunIdentity,
  createInitialLoopRunState,
  createLoopRunCreatedEvent,
  validateLoopRunEvent,
  validateLoopRunIdentity,
  validateRequirementId,
} from "./loop-run-state";
import {
  canonicalizeLoopCapabilityExecutionEvent,
  findPendingRevisionProducerExecution,
  sameAttemptIdentity,
  validateLoopCapabilityExecutionChain,
  validateLoopCapabilityExecutionEvent,
  type LoopCapabilityExecutionEvent,
} from "./loop-capability-execution";
import { validateBootstrapSourceProvenance } from "./loop-run-state";
import { deriveDispatchCommand, recoverRunContext } from "./loop-recovery";
import {
  planRegateFromFacts,
  type CurrentRevisionFacts,
  type RegateFindingFacts,
} from "./loop-regate";
import type { NodeCapabilityId } from "../loop/types";
import {
  canonicalizeLoopRequirementChangeRecord,
  validateLoopRequirementChangeChain,
  validateLoopRequirementChangeRecord,
  type LoopChangeSourceRef,
  type LoopRequirementChangeRecord,
} from "./loop-change-classification";
import {
  canonicalizeLoopArtifactRevision,
  compareLoopArtifactSemver,
  supersedeArtifactRevision,
  validateLoopArtifactRevision,
  validateLoopArtifactRevisionChain,
  type LoopArtifactRevision,
} from "./loop-artifact-revision";
import {
  acceptLoopFindingRisk,
  canonicalizeLoopFinding,
  canonicalizeLoopFindingInvalidationEdges,
  canonicalizeLoopFindingInvalidationScope,
  canonicalizeLoopFindingProof,
  computeFindingGate as computeFindingGateFromFacts,
  createLoopFindingResolutionProof,
  createLoopFindingRiskAcceptanceProof,
  downstreamNodeIds,
  resolveLoopFinding,
  supersedeLoopFinding,
  validateLoopFinding,
  validateLoopFindingChain,
  validateLoopFindingInvalidation,
  validateLoopFindingInvalidationScope,
  validateLoopFindingProof,
  validateLoopFindingProofs,
  validateLoopFindingResolution,
  validateLoopFindingRiskAcceptance,
  type LoopFinding,
  type LoopFindingGateResult,
  type LoopFindingInvalidation,
  type LoopFindingInvalidationScope,
  type LoopFindingProof,
} from "./loop-finding-lifecycle";
import { LoopArtifactStore, LoopArtifactStoreError } from "./loop-artifact-store";
import { LOOP_CAPABILITY_EXECUTION_POINTS, NODE_CAPABILITY_IDS } from "../loop/types";

// C02-WP5 (clause 0.1.4/0.1.6): construction-time blob-binding registry.
// Module-level so the same-instance determination is non-virtual (no
// subclass override or monkey-patched member can forge it). The WeakMap is
// PRIVATE to this module: the ONLY write path is the constructor below when
// `LoopRunStoreOptions.artifactStore` is provided — no registrar is exported,
// so an unbound store can never be presented to a supported entry as bound.
const LOOP_RUN_STORE_ARTIFACT_BINDINGS = new WeakMap<LoopRunStore, LoopArtifactStore>();

/**
 * Non-virtual identity check for the C02-WP2 blob binding: true only when
 * `runStore` was constructed with `LoopRunOptions.artifactStore` set to
 * exactly `artifactStore`. Supported entries use this instead of any
 * instance method; there is no public way to alter the binding after
 * construction.
 */
export function isLoopRunStoreBoundToArtifactStore(
  runStore: LoopRunStore,
  artifactStore: LoopArtifactStore,
): boolean {
  return LOOP_RUN_STORE_ARTIFACT_BINDINGS.get(runStore) === artifactStore;
}

const DEFAULT_BUSY_TIMEOUT_MS = 2000;
const MAX_BUSY_TIMEOUT_MS = 5000;
// v2 journal format (C02-WP3.5-B, D3): the store supports exactly v7. Known
// historical formats 1..6 are rejected with UNSUPPORTED_HISTORICAL_FORMAT —
// they are never semantically migrated. A declared version above 7 is
// rejected with UNSUPPORTED_FUTURE_FORMAT. Inside v7, schema or canonical
// hash drift is STORE_CORRUPT.
const LOOP_RUN_STORE_FORMAT_VERSION = 7;

/**
 * The COMPLETE LOOP physical table catalogue (Round 1 corrections, H2): every
 * table this store's DDL creates — main tables AND self-owned child tables.
 * A user_version=0 database carrying ANY of these is pre-versioning history,
 * never a fresh store (D3 rule 3). Shared verbatim with the v2 cutover
 * preflight so owner detection and store fresh-detection can never drift.
 */
export const LOOP_PHYSICAL_TABLES: readonly string[] = [
  // main tables
  "loop_runs",
  "loop_stage_states",
  "loop_events",
  "loop_capability_executions",
  "loop_requirement_changes",
  "loop_artifact_revisions",
  "loop_findings",
  // self-owned child tables (mirrors the fresh-v6 DDL exactly)
  "loop_change_source_refs",
  "loop_change_confirmed_facts",
  "loop_change_trigger_evidence",
  "loop_artifact_revision_upstreams",
  "loop_artifact_current",
  "loop_finding_invalidations",
  "loop_finding_proofs",
  "loop_finding_scopes",
];
const LOOP_BUSINESS_TABLES = LOOP_PHYSICAL_TABLES;

export type CapabilityExecutionAppendResult = Readonly<{
  event: LoopCapabilityExecutionEvent;
  appended: boolean;
}>;

export type RequirementChangeAppendResult = Readonly<{
  record: LoopRequirementChangeRecord;
  appended: boolean;
}>;

export type ArtifactRevisionAppendResult = Readonly<{
  record: LoopArtifactRevision;
  appended: boolean;
}>;

export type ArtifactRevisionStaleResult = Readonly<{
  record: LoopArtifactRevision;
  marked: boolean;
}>;

export type FindingAppendResult = Readonly<{
  record: LoopFinding;
  appended: boolean;
}>;

export type FindingTransitionResult = Readonly<{
  record: LoopFinding;
}>;

export type CapabilityExecutionInterruptResult = Readonly<{
  event: LoopCapabilityExecutionEvent;
  interrupted: boolean;
}>;

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function closed(): never {
  throw new LoopRunJournalError("STORE_CLOSED", "loop run store is not open");
}

function busy(): never {
  throw new LoopRunJournalError("STORE_BUSY", "run journal storage is busy");
}

function storageFailure(): never {
  throw new LoopRunJournalError("STORE_FAILURE", "run journal storage operation failed");
}

/** Fail-closed validation for external identifier inputs (never echoed). */
function safeIdInput(value: unknown, label: string): string {
  if (
    typeof value !== "string" || value.length === 0 || value.trim() !== value ||
    /[\x00-\x1f\x7f-\x9f]/.test(value)
  ) {
    throw new LoopRunJournalError("INVALID_INPUT", `${label} must be a safe trimmed non-empty string`);
  }
  return value;
}

/**
 * STORE_CORRUPT reasons are fixed internal strings only — persisted values
 * (event ids, stages, digests, raw scalars) are never echoed.
 */
function corrupt(message: string): never {
  throw new LoopRunJournalError("STORE_CORRUPT", `persisted run journal is corrupt: ${message}`);
}

// ── persisted-data validation boundary ──
// Data read back from SQLite is untrusted: any validation or canonicalization
// failure while reading persisted rows is STORE_CORRUPT, never INVALID_INPUT.
// External API input keeps the public INVALID_INPUT semantics.

function validatePersistedIdentity(identity: unknown): void {
  try {
    validateLoopRunIdentity(identity);
  } catch (error) {
    if (error instanceof LoopRunJournalError) corrupt("persisted identity is invalid");
    throw error;
  }
}

function validatePersistedEvent(event: unknown): void {
  try {
    validateLoopRunEvent(event);
  } catch (error) {
    if (error instanceof LoopRunJournalError) corrupt("persisted event is invalid");
    throw error;
  }
}

function canonicalizePersistedEvent(event: LoopRunEvent): string {
  try {
    return canonicalizeLoopRunEvent(event);
  } catch (error) {
    if (error instanceof LoopRunJournalError) corrupt("persisted event canonicalization failed");
    throw error;
  }
}

function canonicalizePersistedIdentity(identity: LoopRunIdentity): string {
  try {
    return canonicalizeLoopRunIdentity(identity);
  } catch (error) {
    if (error instanceof LoopRunJournalError) corrupt("persisted identity canonicalization failed");
    throw error;
  }
}

function asPersistedRetryable(value: unknown): boolean | null {
  if (value === null) return null;
  if (value === 0) return false;
  if (value === 1) return true;
  return corrupt("persisted retryable is not canonical");
}

function asPersistedSafeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    return corrupt("persisted integer scalar is invalid");
  }
  return value;
}

// ── SQLite error translation boundary ──
// Structured codes only. Raw SQLite messages, paths, input, event content and
// credentials are never read, kept, or echoed.

function sqliteErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function isBusyCode(code: string | null): boolean {
  return code !== null && (code.startsWith("SQLITE_BUSY") || code.startsWith("SQLITE_LOCKED"));
}

function isConstraintCode(code: string | null): boolean {
  return code !== null && code.startsWith("SQLITE_CONSTRAINT");
}

/**
 * Synchronous bounded sleep used for busy retries. Atomics.wait is available
 * in Node.js main and worker threads.
 */
function spinWait(ms: number): void {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
}

type RunRow = {
  run_id: string;
  requirement_id: string;
  repository: string;
  repository_path: string;
  base_branch: string;
  expected_base_sha: string;
  task_branch: string;
  control_root: string;
  status: string;
  current_stage: string | null;
  current_attempt: number;
  fix_round: number;
  last_sequence: number;
  last_event_id: string;
  blocking_reason_code: string | null;
  failure_reason_code: string | null;
  created_at: string;
  updated_at: string;
  identity_sha256: string;
};

type EventRow = {
  event_id: string;
  run_id: string;
  sequence: number;
  kind: string;
  stage: string | null;
  attempt: number;
  created_at: string;
  input_digest: string | null;
  output_artifact_ref: string | null;
  output_digest: string | null;
  error_code: string | null;
  retryable: number | null;
  reason_code: string | null;
  binding_id: string | null;
  binding_version: string | null;
  input_artifact_ref: string | null;
  canonical_sha256: string;
};

type CapabilityExecutionRow = {
  execution_event_id: string;
  run_id: string;
  sequence: number;
  schema_version: number;
  capability: string;
  execution_role: string;
  node_id: string;
  attempt: number;
  status: string;
  created_at: string;
  binding_id: string;
  binding_version: string;
  binding_registry_version: string;
  executor_agent: string;
  executor_adapter: string;
  executor_version: string;
  input_artifact_ref: string;
  input_artifact_version: string;
  input_digest: string;
  output_artifact_ref: string | null;
  output_artifact_version: string | null;
  output_digest: string | null;
  gate_result: string | null;
  unresolved_findings_ref: string | null;
  unresolved_findings_digest: string | null;
  consumed_findings_ref: string | null;
  consumed_findings_digest: string | null;
  decision_depth: string | null;
  decision_scope_id: string | null;
  decision_delta_ref: string | null;
  decision_delta_digest: string | null;
  next_step_eligibility: string | null;
  error_code: string | null;
  retryable: number | null;
  reason_code: string | null;
  process_invocation_digest: string | null;
  process_exit_code: number | null;
  process_signal: string | null;
  process_duration_ms: number | null;
  process_truncated: number | null;
  staging_ref: string | null;
  staging_digest: string | null;
  promotion_ref: string | null;
  promotion_digest: string | null;
  human_action_ref: string | null;
  canonical_sha256: string;
};

type RequirementChangeRow = {
  change_record_id: string;
  run_id: string;
  requirement_id: string;
  sequence: number;
  schema_version: number;
  status: string;
  change_kind: string | null;
  payload_form: string | null;
  previous_generation: number | null;
  current_change_scope: string | null;
  classification_reason: string;
  blocked_reason_code: string | null;
  created_at: string;
  canonical_sha256: string;
};

type ChangeSourceRefRow = {
  change_record_id: string;
  source_index: number;
  source_type: string;
  locator: string;
  priority: number;
  source_version: string | null;
  observed_at: string;
};

type ChangeFactRow = {
  change_record_id: string;
  fact_index: number;
  fact: string;
};

type ChangeEvidenceRow = {
  change_record_id: string;
  evidence_index: number;
  evidence_ref: string;
};

type ArtifactRevisionRow = {
  revision_id: string;
  run_id: string;
  requirement_id: string;
  node_id: string;
  sequence: number;
  schema_version: number;
  generation: number | null;
  stable_path: string;
  artifact_kind: string;
  semver: string;
  artifact_ref: string;
  digest: string;
  producer_execution_id: string;
  producer_execution_role: string;
  gate_result: string | null;
  validity: string;
  superseded_by: string | null;
  created_at: string;
  canonical_sha256: string;
};

type ArtifactRevisionUpstreamRow = {
  revision_id: string;
  upstream_index: number;
  upstream_revision_id: string;
};

type ArtifactCurrentRow = {
  run_id: string;
  node_id: string;
  revision_id: string;
  updated_at: string;
};

type FindingRow = {
  finding_id: string;
  run_id: string;
  requirement_id: string;
  sequence: number;
  source_capability: string;
  source_revision_id: string | null;
  cause_kind: string;
  introduced_by_revision_id: string | null;
  severity: string;
  category: string;
  evidence_ref: string;
  evidence_digest: string;
  earliest_affected_node_id: string;
  status: string;
  resolved_by_revision_id: string | null;
  resolution_evidence_ref: string | null;
  resolution_evidence_digest: string | null;
  risk_accepted_by: string | null;
  risk_acceptance_evidence_ref: string | null;
  risk_acceptance_evidence_digest: string | null;
  risk_accepted_scope_id: string | null;
  superseded_by: string | null;
  created_at: string;
  canonical_sha256: string;
};

type FindingInvalidationRow = {
  finding_id: string;
  invalidation_index: number;
  revision_id: string;
  node_id: string;
};

type FindingProofRow = {
  finding_id: string;
  proof_kind: string;
  revision_id: string | null;
  revision_node_id: string | null;
  revision_artifact_ref: string | null;
  revision_artifact_digest: string | null;
  evidence_ref: string;
  evidence_digest: string;
  risk_accepted_by: string | null;
  risk_accepted_scope_id: string | null;
  canonical_sha256: string;
};

type FindingScopeRow = {
  finding_id: string;
  edge_count: number;
  scope_digest: string;
  canonical_sha256: string;
};

function rowToEvent(row: EventRow): LoopRunEvent {
  return Object.freeze({
    eventId: row.event_id,
    runId: row.run_id,
    sequence: asPersistedSafeInteger(row.sequence),
    kind: row.kind as LoopRunEvent["kind"],
    stage: row.stage as LoopStageName | null,
    attempt: asPersistedSafeInteger(row.attempt),
    createdAt: row.created_at,
    inputDigest: row.input_digest,
    outputArtifactRef: row.output_artifact_ref,
    outputDigest: row.output_digest,
    errorCode: row.error_code,
    retryable: asPersistedRetryable(row.retryable),
    reasonCode: row.reason_code,
    // C01 WP-4 provenance columns; v6 journals always carry them.
    bindingId: row.binding_id ?? null,
    bindingVersion: row.binding_version ?? null,
    inputArtifactRef: row.input_artifact_ref ?? null,
  });
}

function eventToRow(event: LoopRunEvent): EventRow {
  return {
    event_id: event.eventId,
    run_id: event.runId,
    sequence: event.sequence,
    kind: event.kind,
    stage: event.stage,
    attempt: event.attempt,
    created_at: event.createdAt,
    input_digest: event.inputDigest,
    output_artifact_ref: event.outputArtifactRef,
    output_digest: event.outputDigest,
    error_code: event.errorCode,
    retryable: event.retryable === null ? null : event.retryable ? 1 : 0,
    reason_code: event.reasonCode,
    binding_id: event.bindingId,
    binding_version: event.bindingVersion,
    input_artifact_ref: event.inputArtifactRef,
    canonical_sha256: sha256Hex(canonicalizeLoopRunEvent(event)),
  };
}

function rowToCapabilityExecution(row: CapabilityExecutionRow): LoopCapabilityExecutionEvent {
  return Object.freeze({
    schemaVersion: asPersistedSafeInteger(row.schema_version) as 4,
    executionEventId: row.execution_event_id,
    runId: row.run_id,
    sequence: asPersistedSafeInteger(row.sequence),
    capability: row.capability as LoopCapabilityExecutionEvent["capability"],
    executionRole: row.execution_role as LoopCapabilityExecutionEvent["executionRole"],
    nodeId: row.node_id,
    attempt: asPersistedSafeInteger(row.attempt),
    status: row.status as LoopCapabilityExecutionEvent["status"],
    createdAt: row.created_at,
    bindingId: row.binding_id,
    bindingVersion: row.binding_version,
    bindingRegistryVersion: row.binding_registry_version,
    executorAgent: row.executor_agent as LoopCapabilityExecutionEvent["executorAgent"],
    executorAdapter: row.executor_adapter,
    executorVersion: row.executor_version,
    inputArtifactRef: row.input_artifact_ref,
    inputArtifactVersion: row.input_artifact_version,
    inputDigest: row.input_digest,
    outputArtifactRef: row.output_artifact_ref,
    outputArtifactVersion: row.output_artifact_version,
    outputDigest: row.output_digest,
    gateResult: row.gate_result as LoopCapabilityExecutionEvent["gateResult"],
    unresolvedFindingsRef: row.unresolved_findings_ref,
    unresolvedFindingsDigest: row.unresolved_findings_digest,
    consumedFindingsRef: row.consumed_findings_ref,
    consumedFindingsDigest: row.consumed_findings_digest,
    decisionDepth: row.decision_depth as LoopCapabilityExecutionEvent["decisionDepth"],
    decisionScopeId: row.decision_scope_id,
    decisionDeltaRef: row.decision_delta_ref,
    decisionDeltaDigest: row.decision_delta_digest,
    nextStepEligibility: row.next_step_eligibility as LoopCapabilityExecutionEvent["nextStepEligibility"],
    errorCode: row.error_code,
    retryable: asPersistedRetryable(row.retryable),
    reasonCode: row.reason_code,
    processInvocationDigest: row.process_invocation_digest,
    processExitCode: row.process_exit_code === null ? null : asPersistedSafeInteger(row.process_exit_code),
    processSignal: row.process_signal as LoopCapabilityExecutionEvent["processSignal"],
    processDurationMs: row.process_duration_ms === null ? null : asPersistedSafeInteger(row.process_duration_ms),
    processTruncated: row.process_truncated === null ? null : row.process_truncated === 1,
    stagingRef: row.staging_ref,
    stagingDigest: row.staging_digest,
    promotionRef: row.promotion_ref,
    promotionDigest: row.promotion_digest,
    humanActionRef: row.human_action_ref,
  });
}

function capabilityExecutionToRow(event: LoopCapabilityExecutionEvent): CapabilityExecutionRow {
  return {
    execution_event_id: event.executionEventId,
    run_id: event.runId,
    sequence: event.sequence,
    schema_version: event.schemaVersion,
    capability: event.capability,
    execution_role: event.executionRole,
    node_id: event.nodeId,
    attempt: event.attempt,
    status: event.status,
    created_at: event.createdAt,
    binding_id: event.bindingId,
    binding_version: event.bindingVersion,
    binding_registry_version: event.bindingRegistryVersion,
    executor_agent: event.executorAgent,
    executor_adapter: event.executorAdapter,
    executor_version: event.executorVersion,
    input_artifact_ref: event.inputArtifactRef,
    input_artifact_version: event.inputArtifactVersion,
    input_digest: event.inputDigest,
    output_artifact_ref: event.outputArtifactRef,
    output_artifact_version: event.outputArtifactVersion,
    output_digest: event.outputDigest,
    gate_result: event.gateResult,
    unresolved_findings_ref: event.unresolvedFindingsRef,
    unresolved_findings_digest: event.unresolvedFindingsDigest,
    consumed_findings_ref: event.consumedFindingsRef,
    consumed_findings_digest: event.consumedFindingsDigest,
    decision_depth: event.decisionDepth,
    decision_scope_id: event.decisionScopeId,
    decision_delta_ref: event.decisionDeltaRef,
    decision_delta_digest: event.decisionDeltaDigest,
    next_step_eligibility: event.nextStepEligibility,
    error_code: event.errorCode,
    retryable: event.retryable === null ? null : event.retryable ? 1 : 0,
    reason_code: event.reasonCode,
    process_invocation_digest: event.processInvocationDigest,
    process_exit_code: event.processExitCode,
    process_signal: event.processSignal,
    process_duration_ms: event.processDurationMs,
    process_truncated: event.processTruncated === null ? null : event.processTruncated ? 1 : 0,
    staging_ref: event.stagingRef,
    staging_digest: event.stagingDigest,
    promotion_ref: event.promotionRef,
    promotion_digest: event.promotionDigest,
    human_action_ref: event.humanActionRef,
    canonical_sha256: sha256Hex(canonicalizeLoopCapabilityExecutionEvent(event)),
  };
}

function rowToRequirementChange(
  db: Database.Database,
  row: RequirementChangeRow,
): LoopRequirementChangeRecord {
  const sourceRows = db.prepare(
    "SELECT * FROM loop_change_source_refs WHERE change_record_id = ? ORDER BY source_index ASC",
  ).all(row.change_record_id) as ChangeSourceRefRow[];
  const sourceRefs = sourceRows.map((sourceRow, index) => {
    if (asPersistedSafeInteger(sourceRow.source_index) !== index) {
      corrupt("persisted change source refs are not contiguous");
    }
    asPersistedSafeInteger(sourceRow.priority);
    return Object.freeze({
      sourceType: sourceRow.source_type,
      locator: sourceRow.locator,
      priority: sourceRow.priority,
      sourceVersion: sourceRow.source_version,
      observedAt: sourceRow.observed_at,
    } as LoopChangeSourceRef);
  });
  const factRows = db.prepare(
    "SELECT * FROM loop_change_confirmed_facts WHERE change_record_id = ? ORDER BY fact_index ASC",
  ).all(row.change_record_id) as ChangeFactRow[];
  const confirmedFacts = factRows.map((factRow, index) => {
    if (asPersistedSafeInteger(factRow.fact_index) !== index) {
      corrupt("persisted change confirmed facts are not contiguous");
    }
    return factRow.fact;
  });
  const evidenceRows = db.prepare(
    "SELECT * FROM loop_change_trigger_evidence WHERE change_record_id = ? ORDER BY evidence_index ASC",
  ).all(row.change_record_id) as ChangeEvidenceRow[];
  const triggerEvidence = evidenceRows.map((evidenceRow, index) => {
    if (asPersistedSafeInteger(evidenceRow.evidence_index) !== index) {
      corrupt("persisted change trigger evidence is not contiguous");
    }
    return evidenceRow.evidence_ref;
  });
  return Object.freeze({
    schemaVersion: asPersistedSafeInteger(row.schema_version) as 1,
    changeRecordId: row.change_record_id,
    runId: row.run_id,
    requirementId: row.requirement_id,
    sequence: asPersistedSafeInteger(row.sequence),
    status: row.status as LoopRequirementChangeRecord["status"],
    changeKind: row.change_kind as LoopRequirementChangeRecord["changeKind"],
    payloadForm: row.payload_form as LoopRequirementChangeRecord["payloadForm"],
    previousGeneration: row.previous_generation === null
      ? null
      : asPersistedSafeInteger(row.previous_generation),
    currentChangeScope: row.current_change_scope,
    confirmedFactsPreserved: Object.freeze(confirmedFacts),
    sourceRefs: Object.freeze(sourceRefs),
    triggerEvidence: Object.freeze(triggerEvidence),
    classificationReason: row.classification_reason,
    blockedReasonCode: row.blocked_reason_code as LoopRequirementChangeRecord["blockedReasonCode"],
    createdAt: row.created_at,
  });
}

function insertRequirementChangeRows(db: Database.Database, record: LoopRequirementChangeRecord): void {
  db.prepare(
    `INSERT INTO loop_requirement_changes (
      change_record_id, run_id, requirement_id, sequence, schema_version,
      status, change_kind, payload_form, previous_generation,
      current_change_scope, classification_reason, blocked_reason_code,
      created_at, canonical_sha256
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.changeRecordId, record.runId, record.requirementId, record.sequence,
    record.schemaVersion, record.status, record.changeKind, record.payloadForm,
    record.previousGeneration, record.currentChangeScope, record.classificationReason,
    record.blockedReasonCode, record.createdAt,
    sha256Hex(canonicalizeLoopRequirementChangeRecord(record)),
  );
  const sourceInsert = db.prepare(
    `INSERT INTO loop_change_source_refs (
      change_record_id, source_index, source_type, locator, priority,
      source_version, observed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  record.sourceRefs.forEach((ref, index) => {
    sourceInsert.run(
      record.changeRecordId, index, ref.sourceType, ref.locator, ref.priority,
      ref.sourceVersion, ref.observedAt,
    );
  });
  const factInsert = db.prepare(
    "INSERT INTO loop_change_confirmed_facts (change_record_id, fact_index, fact) VALUES (?, ?, ?)",
  );
  record.confirmedFactsPreserved.forEach((fact, index) => {
    factInsert.run(record.changeRecordId, index, fact);
  });
  const evidenceInsert = db.prepare(
    "INSERT INTO loop_change_trigger_evidence (change_record_id, evidence_index, evidence_ref) VALUES (?, ?, ?)",
  );
  record.triggerEvidence.forEach((ref, index) => {
    evidenceInsert.run(record.changeRecordId, index, ref);
  });
}

// ── table schema verification helpers ──
// Persisted DDL is untrusted: any drift from the canonical schema fails
// closed with STORE_CORRUPT. Both helpers verify the exact full shape —
// column count/order/type/nullability/PK position, and the exact foreign key
// set (any count, matched order-insensitively, all CASCADE).

type ExpectedColumn = readonly [string, string, number, number];

function verifyTableColumns(
  db: Database.Database,
  table: string,
  label: string,
  expected: readonly ExpectedColumn[],
): void {
  const actual = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string; type: string; notnull: number; pk: number;
  }>;
  if (actual.length !== expected.length) corrupt(`${label} schema mismatch`);
  for (let index = 0; index < expected.length; index += 1) {
    const row = actual[index]!;
    const [name, type, notnull, pk] = expected[index]!;
    if (row.name !== name || row.type.toUpperCase() !== type || row.notnull !== notnull || row.pk !== pk) {
      corrupt(`${label} schema mismatch`);
    }
  }
}

type ExpectedForeignKey = Readonly<{ from: string; references: string; to: string }>;

function verifyTableForeignKeys(
  db: Database.Database,
  table: string,
  label: string,
  expected: readonly ExpectedForeignKey[],
): void {
  const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${table})`).all() as Array<{
    table: string; from: string; to: string; on_delete: string;
  }>;
  if (foreignKeys.length !== expected.length) corrupt(`${label} foreign key mismatch`);
  const unmatched = foreignKeys.map((fk) => ({
    references: fk.table,
    from: fk.from,
    to: fk.to,
    onDelete: fk.on_delete.toUpperCase(),
  }));
  for (const expectation of expected) {
    const index = unmatched.findIndex((fk) =>
      fk.references === expectation.references &&
      fk.from === expectation.from &&
      fk.to === expectation.to &&
      fk.onDelete === "CASCADE");
    if (index === -1) corrupt(`${label} foreign key mismatch`);
    unmatched.splice(index, 1);
  }
}

function verifyUniqueIndex(
  db: Database.Database,
  table: string,
  label: string,
  columns: readonly string[],
): void {
  const uniqueIndexes = db.prepare(`PRAGMA index_list(${table})`).all() as Array<{
    name: string; unique: number;
  }>;
  const found = uniqueIndexes.some((index) => {
    if (index.unique !== 1) return false;
    const indexColumns = db.prepare(`PRAGMA index_info(${JSON.stringify(index.name)})`).all() as Array<{ name: string }>;
    return indexColumns.length === columns.length && columns.every((column, i) => indexColumns[i]?.name === column);
  });
  if (!found) corrupt(`${label} is missing ${columns.join("/")} uniqueness`);
}

function rowToArtifactRevision(db: Database.Database, row: ArtifactRevisionRow): LoopArtifactRevision {
  const upstreamRows = db.prepare(
    "SELECT * FROM loop_artifact_revision_upstreams WHERE revision_id = ? ORDER BY upstream_index ASC",
  ).all(row.revision_id) as ArtifactRevisionUpstreamRow[];
  const upstreamRevisionIds = upstreamRows.map((upstreamRow, index) => {
    if (asPersistedSafeInteger(upstreamRow.upstream_index) !== index) {
      corrupt("persisted revision upstreams are not contiguous");
    }
    return upstreamRow.upstream_revision_id;
  });
  return Object.freeze({
    schemaVersion: asPersistedSafeInteger(row.schema_version) as 2,
    revisionId: row.revision_id,
    runId: row.run_id,
    requirementId: row.requirement_id,
    nodeId: row.node_id as LoopArtifactRevision["nodeId"],
    sequence: asPersistedSafeInteger(row.sequence),
    generation: row.generation === null ? null : asPersistedSafeInteger(row.generation),
    stablePath: row.stable_path,
    artifactKind: row.artifact_kind as LoopArtifactRevision["artifactKind"],
    semver: row.semver,
    artifactRef: row.artifact_ref,
    digest: row.digest,
    producerExecutionId: row.producer_execution_id,
    producerExecutionRole: row.producer_execution_role as LoopArtifactRevision["producerExecutionRole"],
    gateResult: row.gate_result as LoopArtifactRevision["gateResult"],
    validity: row.validity as LoopArtifactRevision["validity"],
    supersededBy: row.superseded_by,
    upstreamRevisionIds: Object.freeze(upstreamRevisionIds),
    createdAt: row.created_at,
  });
}

function insertArtifactRevisionRows(db: Database.Database, record: LoopArtifactRevision): void {
  db.prepare(
    `INSERT INTO loop_artifact_revisions (
      revision_id, run_id, requirement_id, node_id, sequence, schema_version,
      generation, stable_path, artifact_kind, semver, artifact_ref, digest,
      producer_execution_id, producer_execution_role, gate_result, validity,
      superseded_by, created_at, canonical_sha256
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.revisionId, record.runId, record.requirementId, record.nodeId,
    record.sequence, record.schemaVersion, record.generation, record.stablePath,
    record.artifactKind, record.semver, record.artifactRef, record.digest,
    record.producerExecutionId, record.producerExecutionRole, record.gateResult,
    record.validity, record.supersededBy, record.createdAt,
    sha256Hex(canonicalizeLoopArtifactRevision(record)),
  );
  const upstreamInsert = db.prepare(
    `INSERT INTO loop_artifact_revision_upstreams (
      revision_id, upstream_index, upstream_revision_id
    ) VALUES (?, ?, ?)`,
  );
  record.upstreamRevisionIds.forEach((upstreamId, index) => {
    upstreamInsert.run(record.revisionId, index, upstreamId);
  });
}

function rowToFinding(row: FindingRow): LoopFinding {
  return Object.freeze({
    // The schema version is a fixed model constant, not a persisted column.
    schemaVersion: 4,
    findingId: row.finding_id,
    runId: row.run_id,
    requirementId: row.requirement_id,
    sequence: asPersistedSafeInteger(row.sequence),
    sourceCapability: row.source_capability as LoopFinding["sourceCapability"],
    sourceRevisionId: row.source_revision_id,
    causeKind: row.cause_kind as LoopFinding["causeKind"],
    introducedByRevisionId: row.introduced_by_revision_id,
    severity: row.severity as LoopFinding["severity"],
    category: row.category as LoopFinding["category"],
    evidenceRef: row.evidence_ref,
    evidenceDigest: row.evidence_digest,
    earliestAffectedNodeId: row.earliest_affected_node_id as LoopFinding["earliestAffectedNodeId"],
    status: row.status as LoopFinding["status"],
    resolvedByRevisionId: row.resolved_by_revision_id,
    resolutionEvidenceRef: row.resolution_evidence_ref,
    resolutionEvidenceDigest: row.resolution_evidence_digest,
    riskAcceptedBy: row.risk_accepted_by,
    riskAcceptanceEvidenceRef: row.risk_acceptance_evidence_ref,
    riskAcceptanceEvidenceDigest: row.risk_acceptance_evidence_digest,
    riskAcceptedScopeId: row.risk_accepted_scope_id,
    supersededBy: row.superseded_by,
    createdAt: row.created_at,
  });
}

function insertFindingRow(db: Database.Database, record: LoopFinding): void {
  db.prepare(
    `INSERT INTO loop_findings (
      finding_id, run_id, requirement_id, sequence, source_capability,
      source_revision_id, cause_kind, introduced_by_revision_id, severity,
      category, evidence_ref, evidence_digest,
      earliest_affected_node_id, status, resolved_by_revision_id,
      resolution_evidence_ref, resolution_evidence_digest, risk_accepted_by,
      risk_acceptance_evidence_ref, risk_acceptance_evidence_digest,
      risk_accepted_scope_id,
      superseded_by, created_at, canonical_sha256
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.findingId, record.runId, record.requirementId, record.sequence,
    record.sourceCapability, record.sourceRevisionId, record.causeKind,
    record.introducedByRevisionId, record.severity,
    record.category, record.evidenceRef, record.evidenceDigest,
    record.earliestAffectedNodeId, record.status, record.resolvedByRevisionId,
    record.resolutionEvidenceRef, record.resolutionEvidenceDigest,
    record.riskAcceptedBy, record.riskAcceptanceEvidenceRef,
    record.riskAcceptanceEvidenceDigest, record.riskAcceptedScopeId,
    record.supersededBy, record.createdAt,
    sha256Hex(canonicalizeLoopFinding(record)),
  );
}

function rowToFindingProof(row: FindingProofRow): LoopFindingProof {
  return Object.freeze({
    findingId: row.finding_id,
    proofKind: row.proof_kind as LoopFindingProof["proofKind"],
    revisionId: row.revision_id,
    revisionNodeId: row.revision_node_id as LoopFindingProof["revisionNodeId"],
    revisionArtifactRef: row.revision_artifact_ref,
    revisionArtifactDigest: row.revision_artifact_digest,
    evidenceRef: row.evidence_ref,
    evidenceDigest: row.evidence_digest,
    riskAcceptedBy: row.risk_accepted_by,
    riskAcceptedScopeId: row.risk_accepted_scope_id,
  });
}

function insertFindingProofRow(db: Database.Database, proof: LoopFindingProof, runId: string): void {
  db.prepare(
    `INSERT INTO loop_finding_proofs (
      finding_id, proof_kind, revision_id, revision_node_id,
      revision_artifact_ref, revision_artifact_digest,
      evidence_ref, evidence_digest, risk_accepted_by,
      risk_accepted_scope_id, canonical_sha256
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    proof.findingId, proof.proofKind, proof.revisionId, proof.revisionNodeId,
    proof.revisionArtifactRef, proof.revisionArtifactDigest,
    proof.evidenceRef, proof.evidenceDigest, proof.riskAcceptedBy,
    proof.riskAcceptedScopeId,
    sha256Hex(canonicalizeLoopFindingProof(proof, runId)),
  );
}

function rowToFindingScope(row: FindingScopeRow): LoopFindingInvalidationScope {
  return Object.freeze({
    findingId: row.finding_id,
    edgeCount: asPersistedSafeInteger(row.edge_count),
    scopeDigest: row.scope_digest,
  });
}

function insertFindingScopeRow(
  db: Database.Database,
  scope: LoopFindingInvalidationScope,
  runId: string,
): void {
  db.prepare(
    `INSERT INTO loop_finding_scopes (
      finding_id, edge_count, scope_digest, canonical_sha256
    ) VALUES (?, ?, ?, ?)`,
  ).run(
    scope.findingId, scope.edgeCount, scope.scopeDigest,
    sha256Hex(canonicalizeLoopFindingInvalidationScope(scope, runId)),
  );
}

/**
 * Shared single-revision STALE primitive used by markArtifactRevisionStale and
 * by finding invalidation propagation: guarded UPDATE (the revision must still
 * be ACTIVE) with the canonical hash recomputed for the post-transition form.
 * A concurrent drift surfaces as STORE_CORRUPT inside the caller's transaction.
 */
function markRevisionStaleRowInTransaction(
  db: Database.Database,
  record: LoopArtifactRevision,
): LoopArtifactRevision {
  const marked: LoopArtifactRevision = Object.freeze({ ...record, validity: "STALE" });
  const updateResult = db.prepare(
    "UPDATE loop_artifact_revisions SET validity = ?, canonical_sha256 = ? WHERE revision_id = ? AND validity = ?",
  ).run("STALE", sha256Hex(canonicalizeLoopArtifactRevision(marked)), record.revisionId, "ACTIVE");
  if (updateResult.changes !== 1) {
    corrupt("artifact revision drifted during stale marking");
  }
  return marked;
}

export class LoopRunStore {
  private readonly dbPath: string;
  private readonly busyTimeoutMs: number;
  private readonly artifactStore: LoopArtifactStore | null = null;
  private db: Database.Database | null = null;
  private wasOpened = false;

  constructor(dbPath: string, options?: LoopRunStoreOptions) {
    if (typeof dbPath !== "string" || dbPath.trim().length === 0 || dbPath !== dbPath.trim()) {
      throw new LoopRunJournalError("INVALID_INPUT", "dbPath must be a trimmed non-empty absolute path");
    }
    if (!isAbsolute(dbPath)) {
      throw new LoopRunJournalError("INVALID_INPUT", "dbPath must be an absolute path");
    }
    try {
      if (statSync(dbPath).isDirectory()) {
        throw new LoopRunJournalError("INVALID_INPUT", "dbPath must not point to a directory");
      }
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      const code = (error as NodeJS.ErrnoException | null)?.code;
      if (code === "ENOENT" || code === "ENOTDIR") {
        // Path (or a parent component) does not exist yet; init surfaces any
        // real storage failure via mkdir/open.
      } else if (isBusyCode(sqliteErrorCode(error))) {
        busy();
      } else {
        storageFailure();
      }
    }
    const busyTimeoutMs = options?.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
    if (
      typeof busyTimeoutMs !== "number" ||
      !Number.isInteger(busyTimeoutMs) ||
      busyTimeoutMs < 1 ||
      busyTimeoutMs > MAX_BUSY_TIMEOUT_MS
    ) {
      throw new LoopRunJournalError("INVALID_INPUT", "busyTimeoutMs must be an integer between 1 and 5000");
    }
    this.dbPath = dbPath;
    this.busyTimeoutMs = busyTimeoutMs;
    if (options?.artifactStore !== undefined) {
      if (!(options.artifactStore instanceof LoopArtifactStore)) {
        throw new LoopRunJournalError("INVALID_INPUT", "artifactStore must be a LoopArtifactStore instance");
      }
      this.artifactStore = options.artifactStore;
      // C02-WP5 (clause 0.1.4): the ONLY registration site — inside the
      // owning constructor, through this module's private WeakMap.
      LOOP_RUN_STORE_ARTIFACT_BINDINGS.set(this, options.artifactStore);
    }
  }

  /**
   * C02-WP5 B1-1: the journal file path, exposed read-only so the runtime
   * can scope its cross-process resume lease to exactly this database.
   */
  get databaseFilePath(): string {
    return this.dbPath;
  }

  private connection(): Database.Database {
    if (this.db === null) closed();
    return this.db;
  }

  /**
   * init() tracks the Database connection in a local variable and only assigns
   * to `this.db` and `this.wasOpened` after all pragma, WAL, and schema
   * initialization succeeds. On any intermediate failure the local connection
   * is best-effort closed so no lock lingers.
   *
   * Each step directly calls the appropriate typed throw function
   * (storageFailure, busy, etc.) — no function objects are ever assigned
   * to variables.
   */
  init(): void {
    if (this.db !== null || this.wasOpened) closed();

    let db: Database.Database | null = null;

    try {
      try {
        mkdirSync(dirname(this.dbPath), { recursive: true });
      } catch (error) {
        if (error instanceof LoopRunJournalError) throw error;
        if (isBusyCode(sqliteErrorCode(error))) busy();
        storageFailure();
      }

      try {
        db = new Database(this.dbPath);
      } catch (error) {
        if (error instanceof LoopRunJournalError) throw error;
        if (isBusyCode(sqliteErrorCode(error))) busy();
        storageFailure();
      }

      // WAL mode — ensureWalMode already throws properly typed errors
      this.ensureWalMode(db);

      // foreign_keys pragma
      try {
        db.pragma("foreign_keys = ON");
      } catch (error) {
        if (error instanceof LoopRunJournalError) throw error;
        if (isBusyCode(sqliteErrorCode(error))) busy();
        storageFailure();
      }

      // busy_timeout pragma
      try {
        db.pragma(`busy_timeout = ${this.busyTimeoutMs}`);
      } catch (error) {
        if (error instanceof LoopRunJournalError) throw error;
        if (isBusyCode(sqliteErrorCode(error))) busy();
        storageFailure();
      }

      // v6 format gate and schema creation (C02-WP3.5-B, D3): the declared
      // user_version is read BEFORE any table creation or migration. Known
      // historical formats are rejected outright — no semantic rewrite, no
      // alias, no fallback path.
      try {
        // v6 cutover (C02-WP3.5-B, D3): exactly one supported format. The
        // declared user_version gates every operation below BEFORE any DDL or
        // data access; known historical formats are rejected outright and
        // never semantically migrated. Any failure rolls back all DDL and
        // user_version together.
        db.transaction(() => {
          const formatVersion = db.pragma("user_version", { simple: true });
          if (
            typeof formatVersion !== "number" ||
            !Number.isSafeInteger(formatVersion) ||
            formatVersion < 0
          ) {
            corrupt("unknown journal format version");
          }
          if (formatVersion > LOOP_RUN_STORE_FORMAT_VERSION) {
            throw new LoopRunJournalError(
              "UNSUPPORTED_FUTURE_FORMAT",
              "journal format version is newer than this build supports",
            );
          }
          if (formatVersion >= 1 && formatVersion < LOOP_RUN_STORE_FORMAT_VERSION) {
            throw new LoopRunJournalError(
              "UNSUPPORTED_HISTORICAL_FORMAT",
              "pre-v6 journal formats are unsupported history and are never migrated",
            );
          }
          const loopTableExists = LOOP_BUSINESS_TABLES.some((table) =>
            db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !==
              undefined,
          );
          // D3 rule 3: user_version=0 is a fresh database ONLY when no LOOP
          // business table exists; an unversioned database carrying legacy
          // tables is pre-versioning history, never a fresh store.
          if (formatVersion === 0 && loopTableExists) {
            throw new LoopRunJournalError(
              "UNSUPPORTED_HISTORICAL_FORMAT",
              "unversioned database already carries LOOP business tables",
            );
          }
          if (formatVersion === LOOP_RUN_STORE_FORMAT_VERSION) {
            // Already v6: no DDL, no rewrite. Any missing or drifted
            // table/column/constraint inside the declared format is
            // STORE_CORRUPT.
            this.verifyBaseTablesSchema(db);
            this.verifyCapabilityExecutionTableSchema(db);
            this.verifyRequirementChangeTablesSchema(db);
            this.verifyArtifactRevisionTablesSchema(db);
            this.verifyFindingTablesSchema(db);
            return;
          }
          // Fresh unversioned database: create the complete v6 schema in one
          // shot. There is deliberately no per-version migration chain.
          db.exec(`
            CREATE TABLE loop_runs (
              run_id TEXT PRIMARY KEY,
              requirement_id TEXT NOT NULL,
              repository TEXT NOT NULL,
              repository_path TEXT NOT NULL,
              base_branch TEXT NOT NULL,
              expected_base_sha TEXT NOT NULL,
              task_branch TEXT NOT NULL,
              control_root TEXT NOT NULL,
              status TEXT NOT NULL,
              current_stage TEXT,
              current_attempt INTEGER NOT NULL,
              fix_round INTEGER NOT NULL,
              last_sequence INTEGER NOT NULL,
              last_event_id TEXT NOT NULL,
              blocking_reason_code TEXT,
              failure_reason_code TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              identity_sha256 TEXT NOT NULL
            );
            CREATE INDEX idx_loop_runs_status ON loop_runs(status);

            CREATE TABLE loop_stage_states (
              run_id TEXT NOT NULL,
              stage TEXT NOT NULL,
              status TEXT NOT NULL,
              attempt INTEGER NOT NULL,
              updated_at TEXT NOT NULL,
              PRIMARY KEY (run_id, stage),
              FOREIGN KEY (run_id) REFERENCES loop_runs(run_id) ON DELETE CASCADE
            );
            CREATE INDEX idx_loop_stage_states_run_id ON loop_stage_states(run_id);

            CREATE TABLE loop_events (
              event_id TEXT PRIMARY KEY,
              run_id TEXT NOT NULL,
              sequence INTEGER NOT NULL,
              kind TEXT NOT NULL,
              stage TEXT,
              attempt INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              input_digest TEXT,
              output_artifact_ref TEXT,
              output_digest TEXT,
              error_code TEXT,
              retryable INTEGER CHECK (retryable IS NULL OR retryable IN (0, 1)),
              reason_code TEXT,
              binding_id TEXT,
              binding_version TEXT,
              input_artifact_ref TEXT,
              canonical_sha256 TEXT NOT NULL,
              UNIQUE (run_id, sequence),
              FOREIGN KEY (run_id) REFERENCES loop_runs(run_id) ON DELETE CASCADE
            );
            CREATE INDEX idx_loop_events_run_id ON loop_events(run_id);

            CREATE TABLE loop_capability_executions (
              execution_event_id TEXT PRIMARY KEY,
              run_id TEXT NOT NULL,
              sequence INTEGER NOT NULL,
              schema_version INTEGER NOT NULL,
              capability TEXT NOT NULL,
              execution_role TEXT NOT NULL,
              node_id TEXT NOT NULL,
              attempt INTEGER NOT NULL,
              status TEXT NOT NULL,
              created_at TEXT NOT NULL,
              binding_id TEXT NOT NULL,
              binding_version TEXT NOT NULL,
              binding_registry_version TEXT NOT NULL,
              executor_agent TEXT NOT NULL,
              executor_adapter TEXT NOT NULL,
              executor_version TEXT NOT NULL,
              input_artifact_ref TEXT NOT NULL,
              input_artifact_version TEXT NOT NULL,
              input_digest TEXT NOT NULL,
              output_artifact_ref TEXT,
              output_artifact_version TEXT,
              output_digest TEXT,
              gate_result TEXT,
              unresolved_findings_ref TEXT,
              unresolved_findings_digest TEXT,
              consumed_findings_ref TEXT,
              consumed_findings_digest TEXT,
              decision_depth TEXT,
              decision_scope_id TEXT,
              decision_delta_ref TEXT,
              decision_delta_digest TEXT,
              next_step_eligibility TEXT,
              error_code TEXT,
              retryable INTEGER CHECK (retryable IS NULL OR retryable IN (0, 1)),
              reason_code TEXT,
              process_invocation_digest TEXT,
              process_exit_code INTEGER,
              process_signal TEXT,
              process_duration_ms INTEGER,
              process_truncated INTEGER CHECK (process_truncated IS NULL OR process_truncated IN (0, 1)),
              staging_ref TEXT,
              staging_digest TEXT,
              promotion_ref TEXT,
              promotion_digest TEXT,
              human_action_ref TEXT,
              canonical_sha256 TEXT NOT NULL,
              UNIQUE (run_id, sequence),
              FOREIGN KEY (run_id) REFERENCES loop_runs(run_id) ON DELETE CASCADE
            );
            CREATE INDEX idx_loop_capability_executions_run_id
              ON loop_capability_executions(run_id);
          `);
          this.verifyCapabilityExecutionTableSchema(db);
          db.exec(`
              CREATE TABLE loop_requirement_changes (
                change_record_id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                requirement_id TEXT NOT NULL,
                sequence INTEGER NOT NULL,
                schema_version INTEGER NOT NULL,
                status TEXT NOT NULL,
                change_kind TEXT,
                payload_form TEXT,
                previous_generation INTEGER,
                current_change_scope TEXT,
                classification_reason TEXT NOT NULL,
                blocked_reason_code TEXT,
                created_at TEXT NOT NULL,
                canonical_sha256 TEXT NOT NULL,
                UNIQUE (run_id, sequence),
                FOREIGN KEY (run_id) REFERENCES loop_runs(run_id) ON DELETE CASCADE
              );
              CREATE INDEX idx_loop_requirement_changes_run_id
                ON loop_requirement_changes(run_id);
              CREATE INDEX idx_loop_requirement_changes_requirement_id
                ON loop_requirement_changes(requirement_id);

              CREATE TABLE loop_change_source_refs (
                change_record_id TEXT NOT NULL,
                source_index INTEGER NOT NULL,
                source_type TEXT NOT NULL,
                locator TEXT NOT NULL,
                priority INTEGER NOT NULL,
                source_version TEXT,
                observed_at TEXT NOT NULL,
                PRIMARY KEY (change_record_id, source_index),
                FOREIGN KEY (change_record_id)
                  REFERENCES loop_requirement_changes(change_record_id) ON DELETE CASCADE
              );

              CREATE TABLE loop_change_confirmed_facts (
                change_record_id TEXT NOT NULL,
                fact_index INTEGER NOT NULL,
                fact TEXT NOT NULL,
                PRIMARY KEY (change_record_id, fact_index),
                FOREIGN KEY (change_record_id)
                  REFERENCES loop_requirement_changes(change_record_id) ON DELETE CASCADE
              );

              CREATE TABLE loop_change_trigger_evidence (
                change_record_id TEXT NOT NULL,
                evidence_index INTEGER NOT NULL,
                evidence_ref TEXT NOT NULL,
                PRIMARY KEY (change_record_id, evidence_index),
                FOREIGN KEY (change_record_id)
                  REFERENCES loop_requirement_changes(change_record_id) ON DELETE CASCADE
              );
          `);
          this.verifyRequirementChangeTablesSchema(db);
          db.exec(`
              CREATE TABLE loop_artifact_revisions (
                revision_id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                requirement_id TEXT NOT NULL,
                node_id TEXT NOT NULL,
                sequence INTEGER NOT NULL,
                schema_version INTEGER NOT NULL,
                generation INTEGER,
                stable_path TEXT NOT NULL,
                artifact_kind TEXT NOT NULL,
                semver TEXT NOT NULL,
                artifact_ref TEXT NOT NULL,
                digest TEXT NOT NULL,
                producer_execution_id TEXT NOT NULL,
                producer_execution_role TEXT NOT NULL,
                gate_result TEXT,
                validity TEXT NOT NULL,
                superseded_by TEXT,
                created_at TEXT NOT NULL,
                canonical_sha256 TEXT NOT NULL,
                UNIQUE (run_id, node_id, sequence),
                UNIQUE (run_id, node_id, semver),
                FOREIGN KEY (run_id) REFERENCES loop_runs(run_id) ON DELETE CASCADE
              );
              CREATE INDEX idx_loop_artifact_revisions_run_id
                ON loop_artifact_revisions(run_id);
              CREATE INDEX idx_loop_artifact_revisions_node_id
                ON loop_artifact_revisions(node_id);

              CREATE TABLE loop_artifact_revision_upstreams (
                revision_id TEXT NOT NULL,
                upstream_index INTEGER NOT NULL,
                upstream_revision_id TEXT NOT NULL,
                PRIMARY KEY (revision_id, upstream_index),
                FOREIGN KEY (revision_id)
                  REFERENCES loop_artifact_revisions(revision_id) ON DELETE CASCADE
              );

              CREATE TABLE loop_artifact_current (
                run_id TEXT NOT NULL,
                node_id TEXT NOT NULL,
                revision_id TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (run_id, node_id),
                FOREIGN KEY (run_id) REFERENCES loop_runs(run_id) ON DELETE CASCADE,
                FOREIGN KEY (revision_id)
                  REFERENCES loop_artifact_revisions(revision_id) ON DELETE CASCADE
              );
          `);
          this.verifyArtifactRevisionTablesSchema(db);
          db.exec(`
              CREATE TABLE loop_findings (
                finding_id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                requirement_id TEXT NOT NULL,
                sequence INTEGER NOT NULL,
                source_capability TEXT NOT NULL,
                source_revision_id TEXT NOT NULL,
                cause_kind TEXT NOT NULL,
                introduced_by_revision_id TEXT,
                severity TEXT NOT NULL,
                category TEXT NOT NULL,
                evidence_ref TEXT NOT NULL,
                evidence_digest TEXT NOT NULL,
                earliest_affected_node_id TEXT NOT NULL,
                status TEXT NOT NULL,
                resolved_by_revision_id TEXT,
                resolution_evidence_ref TEXT,
                resolution_evidence_digest TEXT,
                risk_accepted_by TEXT,
                risk_acceptance_evidence_ref TEXT,
                risk_acceptance_evidence_digest TEXT,
                risk_accepted_scope_id TEXT,
                superseded_by TEXT,
                created_at TEXT NOT NULL,
                canonical_sha256 TEXT NOT NULL,
                UNIQUE (run_id, sequence),
                FOREIGN KEY (run_id) REFERENCES loop_runs(run_id) ON DELETE CASCADE,
                FOREIGN KEY (source_revision_id)
                  REFERENCES loop_artifact_revisions(revision_id) ON DELETE CASCADE
              );
              CREATE INDEX idx_loop_findings_run_id
                ON loop_findings(run_id);

              CREATE TABLE loop_finding_invalidations (
                finding_id TEXT NOT NULL,
                invalidation_index INTEGER NOT NULL,
                revision_id TEXT NOT NULL,
                node_id TEXT NOT NULL,
                PRIMARY KEY (finding_id, invalidation_index),
                FOREIGN KEY (finding_id)
                  REFERENCES loop_findings(finding_id) ON DELETE CASCADE,
                FOREIGN KEY (revision_id)
                  REFERENCES loop_artifact_revisions(revision_id) ON DELETE CASCADE
              );

              CREATE TABLE loop_finding_proofs (
                finding_id TEXT PRIMARY KEY,
                proof_kind TEXT NOT NULL,
                revision_id TEXT,
                revision_node_id TEXT,
                revision_artifact_ref TEXT,
                revision_artifact_digest TEXT,
                evidence_ref TEXT NOT NULL,
                evidence_digest TEXT NOT NULL,
                risk_accepted_by TEXT,
                risk_accepted_scope_id TEXT,
                canonical_sha256 TEXT NOT NULL,
                CHECK (proof_kind IN ('RESOLUTION', 'RISK_ACCEPTANCE')),
                FOREIGN KEY (finding_id)
                  REFERENCES loop_findings(finding_id) ON DELETE CASCADE,
                FOREIGN KEY (revision_id)
                  REFERENCES loop_artifact_revisions(revision_id) ON DELETE CASCADE
              );

              CREATE TABLE loop_finding_scopes (
                finding_id TEXT PRIMARY KEY,
                edge_count INTEGER NOT NULL,
                scope_digest TEXT NOT NULL,
                canonical_sha256 TEXT NOT NULL,
                FOREIGN KEY (finding_id)
                  REFERENCES loop_findings(finding_id) ON DELETE CASCADE
              );
          `);
          this.verifyBaseTablesSchema(db);
          this.verifyFindingTablesSchema(db);
          db.exec(`PRAGMA user_version = ${LOOP_RUN_STORE_FORMAT_VERSION}`);
        }).immediate();
      } catch (error) {
        if (error instanceof LoopRunJournalError) throw error;
        if (isBusyCode(sqliteErrorCode(error))) busy();
        storageFailure();
      }

      // All initialization succeeded — publish the connection.
      this.db = db;
      this.wasOpened = true;
    } catch (error) {
      // Best-effort close the local connection so no lock lingers.
      if (db !== null) {
        try { db.close(); } catch { /* cleanup failure must not overwrite original error */ }
      }

      // Re-throw the original error (already a properly typed LoopRunJournalError
      // from one of the step-specific catch blocks, or from ensureWalMode).
      if (error instanceof LoopRunJournalError) throw error;
      // Any raw error that somehow escaped → translate to STORE_FAILURE.
      storageFailure();
    }
  }

  close(): void {
    if (this.db === null) return;
    const db = this.db;
    this.db = null;
    try {
      db.close();
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      if (isBusyCode(sqliteErrorCode(error))) busy();
      storageFailure();
    }
  }

  /**
   * journal_mode changes are not covered by SQLite's busy handler, so a
   * concurrent writer can make the WAL pragma fail instantly. Retry briefly
   * and accept an already-WAL database instead of failing outright.
   */
  private ensureWalMode(db: Database.Database): void {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      let mode: string;
      try {
        mode = String(db.pragma("journal_mode", { simple: true })).toLowerCase();
      } catch (error) {
        if (isBusyCode(sqliteErrorCode(error)) && attempt < 19) {
          spinWait(50);
          continue;
        }
        if (isBusyCode(sqliteErrorCode(error))) busy();
        storageFailure();
      }
      if (mode === "wal") return;
      try {
        db.pragma("journal_mode = WAL");
        return;
      } catch (error) {
        if (isBusyCode(sqliteErrorCode(error)) && attempt < 19) {
          spinWait(50);
          continue;
        }
        if (isBusyCode(sqliteErrorCode(error))) busy();
        storageFailure();
      }
    }
    busy();
  }

  /**
   * createRun: first reads the full verified snapshot, then compares the
   * canonical identity from the verified snapshot with the request identity.
   * This ensures persisted corruption is detected before any business-logic
   * comparison.
   */
  createRun(identity: LoopRunIdentity): LoopRunState {
    const db = this.connection();
    validateLoopRunIdentity(identity);
    const identitySha = sha256Hex(canonicalizeLoopRunIdentity(identity));
    try {
      const snapshot = db.transaction((): LoopRunSnapshot =>
        this.createRunInTransaction(db, identity),
      ).immediate() as LoopRunSnapshot;
      return snapshot.state;
    } catch (error) {
      return this.translateWriterError(error, () => {
        return this.reclassifyCreateRunConstraint(db, identity.runId, identitySha);
      });
    }
  }

  /**
   * C02-WP5 B1: atomic durable bootstrap for a FRESH requirement run — run
   * creation, its run_started event and the ORIGINAL normalized Requirement
   * source provenance land in ONE immediate transaction. A crash can no
   * longer leave a created-but-unstarted run or a running run whose origin
   * source triple is unpinned: either nothing is durable (fresh retry) or
   * the authority carries its confirmed-facts anchor. The provenance rides
   * on the run_started event's nullable input fields (v7 schema, validation
   * already permits them); there is deliberately no second authority.
   */
  bootstrapRunWithSource(
    identity: LoopRunIdentity,
    source: { readonly artifactRef: string; readonly digest: string },
  ): LoopRunState {
    const db = this.connection();
    validateLoopRunIdentity(identity);
    // B1-2: the SAME closed validator the entry and recovery consume — no
    // writer/reader split is possible.
    validateBootstrapSourceProvenance(source);
    try {
      const snapshot = db.transaction((): LoopRunSnapshot => {
        const snap = this.createRunInTransaction(db, identity);
        if (snap.state.status === "created") {
          const started: LoopRunEvent = Object.freeze({
            eventId: `${identity.runId}:2:run_started`,
            runId: identity.runId,
            sequence: 2,
            kind: "run_started",
            stage: null,
            attempt: 0,
            createdAt: identity.createdAt,
            outputArtifactRef: null,
            outputDigest: null,
            errorCode: null,
            retryable: null,
            reasonCode: null,
            bindingId: null,
            bindingVersion: null,
            inputArtifactRef: source.artifactRef,
            inputDigest: source.digest,
          });
          this.appendEvent(started);
          return this.snapshotInTransaction(db, identity.runId);
        }
        // Already bootstrapped (idempotent replay): the recorded provenance
        // must match exactly, otherwise this is an impostor resume.
        const startedEvent = snap.events.find((event) => event.kind === "run_started");
        if (
          startedEvent === undefined ||
          startedEvent.inputArtifactRef !== source.artifactRef ||
          startedEvent.inputDigest !== source.digest
        ) {
          throw new LoopRunJournalError(
            "ILLEGAL_TRANSITION",
            "bootstrap source provenance does not match the durable run authority",
          );
        }
        return snap;
      }).immediate() as LoopRunSnapshot;
      return snapshot.state;
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      storageFailure();
    }
  }

  private createRunInTransaction(db: Database.Database, identity: LoopRunIdentity): LoopRunSnapshot {
    const identitySha = sha256Hex(canonicalizeLoopRunIdentity(identity));
    {
        // ── corruption-first: read full verified snapshot first ──
        const existingSnapshot = this.readRunSnapshotInTransaction(db, identity.runId);
        if (existingSnapshot !== undefined) {
          // Persisted data has been verified. Now compare canonical identity.
          const persistedIdentitySha = sha256Hex(canonicalizePersistedIdentity(existingSnapshot.state.identity));
          if (persistedIdentitySha !== identitySha) {
            throw new LoopRunJournalError("RUN_ID_CONFLICT", "runId already exists with a different identity");
          }
          // Same identity — exact idempotent success.
          return this.snapshotInTransaction(db, identity.runId);
        }

        const createdEvent = createLoopRunCreatedEvent(identity);
        const state = createInitialLoopRunState(identity);
        const eventRow = eventToRow(createdEvent);
        db.prepare(
          `INSERT INTO loop_runs (
            run_id, requirement_id, repository, repository_path, base_branch,
            expected_base_sha, task_branch, control_root, status, current_stage,
            current_attempt, fix_round, last_sequence, last_event_id,
            blocking_reason_code, failure_reason_code, created_at, updated_at,
            identity_sha256
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          identity.runId,
          identity.requirementId,
          identity.repository,
          identity.repositoryPath,
          identity.baseBranch,
          identity.expectedBaseSha,
          identity.taskBranch,
          identity.controlRoot,
          state.status,
          null,
          state.currentAttempt,
          state.fixRound,
          state.lastSequence,
          state.lastEventId,
          null,
          null,
          identity.createdAt,
          state.updatedAt,
          identitySha,
        );
        const stageInsert = db.prepare(
          "INSERT INTO loop_stage_states (run_id, stage, status, attempt, updated_at) VALUES (?, ?, ?, ?, ?)",
        );
        for (const stage of LOOP_STAGE_NAMES) {
          stageInsert.run(identity.runId, stage, "pending", 0, identity.createdAt);
        }
        this.insertEventRow(db, eventRow);
        return this.snapshotInTransaction(db, identity.runId);
    }
  }

  /**
   * C02-WP5 R4-H2: complete the created->running transition for a LEGACY or
   * externally pre-created run whose run_started event has not landed yet.
   * Guarded and idempotent: running runs pass through unchanged; the appended
   * start event carries NO provenance (all-null), matching the historical
   * shape — confirmed-facts anchoring then follows the first intake claim.
   */
  ensureRunStarted(runId: string): LoopRunState {
    const db = this.connection();
    try {
      const snapshot = db.transaction((): LoopRunSnapshot => {
        const snap = this.readRunSnapshotInTransaction(db, runId);
        if (snap === undefined) {
          throw new LoopRunJournalError("RUN_NOT_FOUND", "run does not exist");
        }
        if (snap.state.status === "created") {
          const started: LoopRunEvent = Object.freeze({
            eventId: `${runId}:${snap.state.lastSequence + 1}:run_started`,
            runId,
            sequence: snap.state.lastSequence + 1,
            kind: "run_started",
            stage: null,
            attempt: 0,
            createdAt: new Date().toISOString(),
            inputDigest: null,
            outputArtifactRef: null,
            outputDigest: null,
            errorCode: null,
            retryable: null,
            reasonCode: null,
            bindingId: null,
            bindingVersion: null,
            inputArtifactRef: null,
          });
          this.appendEvent(started);
          return this.snapshotInTransaction(db, runId);
        }
        return snap;
      }).immediate() as LoopRunSnapshot;
      return snapshot.state;
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      storageFailure();
    }
  }

  /**
   * Reclassification callback for createRun constraint violations.
   * Operates within the safe storage translation boundary.
   */
  private reclassifyCreateRunConstraint(
    db: Database.Database,
    runId: string,
    identitySha: string,
  ): LoopRunSnapshot {
    try {
      const existingSnapshot = this.readRunSnapshotInTransaction(db, runId);
      if (existingSnapshot !== undefined) {
        const persistedIdentitySha = sha256Hex(canonicalizePersistedIdentity(existingSnapshot.state.identity));
        if (persistedIdentitySha === identitySha) {
          return existingSnapshot;
        }
        throw new LoopRunJournalError("RUN_ID_CONFLICT", "runId already exists with a different identity");
      }
      storageFailure();
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      if (isBusyCode(sqliteErrorCode(error))) busy();
      if (isConstraintCode(sqliteErrorCode(error))) storageFailure();
      storageFailure();
    }
  }

  /**
   * appendEvent: first reads the full verified snapshot of the owning run,
   * then locates the persisted event within that verified snapshot. This
   * ensures persisted corruption is detected before any event comparison.
   */
  appendEvent(event: LoopRunEvent): LoopRunState {
    const db = this.connection();
    validateLoopRunEvent(event);
    const eventRow = eventToRow(event);
    try {
      const snapshot = db.transaction((): LoopRunSnapshot => {
        // ── corruption-first: read full verified snapshot ──
        const current = this.readRunSnapshotInTransaction(db, event.runId);
        if (current === undefined) {
          throw new LoopRunJournalError("RUN_NOT_FOUND", "run does not exist");
        }

        // ── locate the existing event within the verified snapshot ──
        const existingEvent = current.events.find((e) => e.eventId === event.eventId);
        if (existingEvent !== undefined) {
          // Persisted event has been verified — compare canonical forms.
          if (canonicalizePersistedEvent(existingEvent) === canonicalizePersistedEvent(event)) {
            return this.snapshotInTransaction(db, event.runId);
          }
          throw new LoopRunJournalError("EVENT_ID_CONFLICT", "eventId already exists with different content");
        }

        const capabilityExecutions = this.readCapabilityExecutionsInTransaction(db, event.runId);
        if (capabilityExecutions[capabilityExecutions.length - 1]?.status === "started") {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "run events cannot advance while a capability execution is active");
        }

        // ── check sequence conflict ──
        const sequenceOwner = current.events.find((e) => e.sequence === event.sequence);
        if (sequenceOwner !== undefined) {
          throw new LoopRunJournalError("EVENT_SEQUENCE_CONFLICT", "sequence already occupied by another event");
        }

        const next = applyLoopRunEvent(current.state, event);
        this.insertEventRow(db, eventRow);
        db.prepare(
          `UPDATE loop_runs SET
            status = ?, current_stage = ?, current_attempt = ?, fix_round = ?,
            last_sequence = ?, last_event_id = ?, blocking_reason_code = ?,
            failure_reason_code = ?, updated_at = ?
          WHERE run_id = ?`,
        ).run(
          next.status,
          next.currentStage,
          next.currentAttempt,
          next.fixRound,
          next.lastSequence,
          next.lastEventId,
          next.blockingReasonCode,
          next.failureReasonCode,
          next.updatedAt,
          next.identity.runId,
        );
        if (event.stage !== null) {
          const stageState = next.stages[event.stage];
          db.prepare(
            "UPDATE loop_stage_states SET status = ?, attempt = ?, updated_at = ? WHERE run_id = ? AND stage = ?",
          ).run(stageState.status, stageState.attempt, stageState.updatedAt, next.identity.runId, event.stage);
        }
        return this.snapshotInTransaction(db, event.runId);
      }).immediate() as LoopRunSnapshot;
      return snapshot.state;
    } catch (error) {
      return this.translateWriterError(error, () => {
        return this.reclassifyAppendEventConstraint(db, event);
      });
    }
  }

  /**
   * Reclassification callback for appendEvent constraint violations.
   * Operates within the safe storage translation boundary.
   */
  private reclassifyAppendEventConstraint(
    db: Database.Database,
    event: LoopRunEvent,
  ): LoopRunSnapshot {
    try {
      const current = this.readRunSnapshotInTransaction(db, event.runId);
      if (current === undefined) {
        throw new LoopRunJournalError("RUN_NOT_FOUND", "run does not exist");
      }
      const existingEvent = current.events.find((e) => e.eventId === event.eventId);
      if (existingEvent !== undefined) {
        if (canonicalizePersistedEvent(existingEvent) === canonicalizePersistedEvent(event)) {
          return current;
        }
        throw new LoopRunJournalError("EVENT_ID_CONFLICT", "eventId already exists with different content");
      }
      const sequenceOwner = current.events.find((e) => e.sequence === event.sequence);
      if (sequenceOwner !== undefined) {
        throw new LoopRunJournalError("EVENT_SEQUENCE_CONFLICT", "sequence already occupied by another event");
      }
      storageFailure();
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      if (isBusyCode(sqliteErrorCode(error))) busy();
      if (isConstraintCode(sqliteErrorCode(error))) storageFailure();
      storageFailure();
    }
  }

  getSnapshot(runId: string): LoopRunSnapshot | undefined {
    return this.readSnapshot(runId);
  }

  getRun(runId: string): LoopRunState | undefined {
    const snapshot = this.readSnapshot(runId);
    return snapshot === undefined ? undefined : snapshot.state;
  }

  listEvents(runId: string): readonly LoopRunEvent[] {
    const snapshot = this.readSnapshot(runId);
    return snapshot === undefined ? Object.freeze([]) : snapshot.events;
  }

  /**
   * Append one immutable C01 capability-execution event. Capability attempts
   * use their own per-run sequence and never mutate the legacy delivery-stage
   * cursor. The owning run must exist and be running. The complete persisted
   * run and attempt chain are verified before any write.
   */
  appendCapabilityExecution(event: LoopCapabilityExecutionEvent): CapabilityExecutionAppendResult {
    const db = this.connection();
    validateLoopCapabilityExecutionEvent(event);
    const row = capabilityExecutionToRow(event);
    try {
      return db.transaction((): CapabilityExecutionAppendResult =>
        this.appendCapabilityExecutionInTransaction(db, event, row),
      ).immediate() as CapabilityExecutionAppendResult;
    } catch (error) {
      return this.reclassifyCapabilityAppendError(db, event, error);
    }
  }

  /**
   * C02-WP5 F1: atomic dispatch claim for STARTED events only. Inside ONE
   * immediate transaction this method assembles the full recovery authority
   * (snapshot, executions, findings, revisions, current pointers, change
   * chain — one consistent read set), derives the unique next dispatch
   * command from it and rejects the claim unless the event matches that
   * command exactly. A stale command — one whose target node, input triple
   * or attempt-scoped output version was invalidated between an earlier
   * recovery and this claim — can no longer open an attempt, so the
   * terminal-write CAS never has to salvage a wrong claim. Exact replay of
   * an identical started event stays an idempotent no-op.
   */
  claimNextCapabilityExecution(event: LoopCapabilityExecutionEvent): CapabilityExecutionAppendResult {
    if (event.status !== "started") {
      throw new LoopRunJournalError("INVALID_INPUT", "claim accepts started events only");
    }
    const db = this.connection();
    validateLoopCapabilityExecutionEvent(event);
    try {
      return db.transaction((): CapabilityExecutionAppendResult => {
        // Idempotent exact replay first: a replayed started event must stay a
        // no-op even though the active claim makes the derived command null.
        const current = this.readCapabilityExecutionsInTransaction(db, event.runId);
        const existing = current.find((item) => item.executionEventId === event.executionEventId);
        if (existing !== undefined) {
          if (
            canonicalizeLoopCapabilityExecutionEvent(existing) ===
            canonicalizeLoopCapabilityExecutionEvent(event)
          ) {
            return Object.freeze({ event: existing, appended: false });
          }
          throw new LoopRunJournalError("EVENT_ID_CONFLICT", "capability execution event id already exists");
        }
        // Single-transaction recovery authority.
        const snapshot = this.readRunSnapshotInTransaction(db, event.runId);
        if (snapshot === undefined) {
          throw new LoopRunJournalError("RUN_NOT_FOUND", "run does not exist");
        }
        const requirementId = snapshot.state.identity.requirementId;
        const recovery = recoverRunContext(this, requirementId);
        if (
          recovery === undefined ||
          recovery.snapshot.state.identity.runId !== event.runId
        ) {
          throw new LoopRunJournalError(
            "ILLEGAL_TRANSITION",
            "stale claim: the run is no longer the requirement's latest authority",
          );
        }
        const command = deriveDispatchCommand(recovery);
        if (command === null) {
          throw new LoopRunJournalError(
            "ILLEGAL_TRANSITION",
            "recovery authority derives no dispatchable action for this claim",
          );
        }
        if (command.capability !== event.capability || command.executionRole !== event.executionRole) {
          throw new LoopRunJournalError(
            "ILLEGAL_TRANSITION",
            "claim does not match the unique next action of the recovery authority",
          );
        }
        // Started events persist null result fields, so the attempt NUMBER
        // is the claim-time comparable form of the attempt-scoped output.
        if (command.attempt !== event.attempt) {
          throw new LoopRunJournalError(
            "ILLEGAL_TRANSITION",
            "claim attempt does not match the recovered next attempt",
          );
        }
        if (
          command.inputArtifactRef !== null && (
            command.inputArtifactRef !== event.inputArtifactRef ||
            command.inputArtifactVersion !== event.inputArtifactVersion ||
            command.inputDigest !== event.inputDigest
          )
        ) {
          throw new LoopRunJournalError(
            "ILLEGAL_TRANSITION",
            "claim input does not match the recovered dispatch command",
          );
        }
        return this.appendCapabilityExecutionInTransaction(
          db,
          event,
          capabilityExecutionToRow(event),
        );
      }).immediate() as CapabilityExecutionAppendResult;
    } catch (error) {
      return this.reclassifyCapabilityAppendError(db, event, error);
    }
  }

  /**
   * C02-WP5 F1: run a read function against ONE consistent transaction so a
   * recovery projection can never be assembled from pre- and post-commit
   * fragments of concurrent writers.
   */
  readConsistent<T>(fn: () => T): T {
    return this.connection().transaction(fn).immediate() as T;
  }

  private reclassifyCapabilityAppendError(
    db: Database.Database,
    event: LoopCapabilityExecutionEvent,
    error: unknown,
  ): CapabilityExecutionAppendResult {
    if (error instanceof LoopRunJournalError) throw error;
    const code = sqliteErrorCode(error);
    if (isBusyCode(code)) busy();
    if (isConstraintCode(code)) {
      try {
        const current = this.readCapabilityExecutionsInTransaction(db, event.runId);
        const existing = current.find((item) => item.executionEventId === event.executionEventId);
        if (
          existing !== undefined &&
          canonicalizeLoopCapabilityExecutionEvent(existing) === canonicalizeLoopCapabilityExecutionEvent(event)
        ) {
          return Object.freeze({ event: existing, appended: false });
        }
        if (existing !== undefined) {
          throw new LoopRunJournalError("EVENT_ID_CONFLICT", "capability execution event id already exists");
        }
        if (current.some((item) => item.sequence === event.sequence)) {
          throw new LoopRunJournalError("EVENT_SEQUENCE_CONFLICT", "capability execution sequence is occupied");
        }
      } catch (reclassifyError) {
        if (reclassifyError instanceof LoopRunJournalError) throw reclassifyError;
        storageFailure();
      }
    }
    storageFailure();
  }

  /**
   * In-transaction body shared by appendCapabilityExecution and
   * claimNextCapabilityExecution: run/state checks, idempotent replay,
   * sequence-conflict detection, the F2-1 pending-revision window for
   * started appends, the WP5 terminal-write CAS for terminal events, live
   * Re-Gate authorization via chain validation, decision-delta blob binding
   * and the final insert.
   */
  private appendCapabilityExecutionInTransaction(
    db: Database.Database,
    event: LoopCapabilityExecutionEvent,
    row: CapabilityExecutionRow,
  ): CapabilityExecutionAppendResult {
    const snapshot = this.readRunSnapshotInTransaction(db, event.runId);
    if (snapshot === undefined) {
      throw new LoopRunJournalError("RUN_NOT_FOUND", "run does not exist");
    }
    if (snapshot.state.status !== "running") {
      throw new LoopRunJournalError("ILLEGAL_TRANSITION", "capability execution requires a running run");
    }
    if (snapshot.state.currentStage !== null) {
      throw new LoopRunJournalError("ILLEGAL_TRANSITION", "capability execution requires no active delivery stage");
    }
    const current = this.readCapabilityExecutionsInTransaction(db, event.runId);
    const existing = current.find((item) => item.executionEventId === event.executionEventId);
    if (existing !== undefined) {
      if (
        canonicalizeLoopCapabilityExecutionEvent(existing) ===
        canonicalizeLoopCapabilityExecutionEvent(event)
      ) {
        return Object.freeze({ event: existing, appended: false });
      }
      throw new LoopRunJournalError("EVENT_ID_CONFLICT", "capability execution event id already exists");
    }
    if (current.some((item) => item.sequence === event.sequence)) {
      throw new LoopRunJournalError("EVENT_SEQUENCE_CONFLICT", "capability execution sequence is occupied");
    }
    // Re-review F2-1: the terminal→revision window is a TRANSACTION
    // invariant of every started append, not merely a permit rule. While
    // a succeeded producer's node revision has not landed, no client —
    // runtime, supported entry, or bare gateway — may open another
    // capability attempt: the same-transaction check below makes the
    // bypass impossible instead of delegating it to callers.
    if (event.status === "started") {
      const pendingProducer = findPendingRevisionProducerExecution(
        current,
        this.readArtifactRevisionsInTransaction(db, event.runId, snapshot.state.identity.requirementId),
      );
      if (pendingProducer !== null) {
        throw new LoopRunJournalError(
          "ILLEGAL_TRANSITION",
          "a pending revision producer holds the dispatch window closed",
        );
      }
    }
    // C02-WP5 terminal-write CAS: a terminal event may only close a claim
    // that is STILL the journal tail. Anything that landed after the
    // started event — an interrupt by another entry, a later attempt, any
    // interloper — means this result is late; promoting it could elevate
    // a stale-generation product over the current authority. The chain
    // validator would reject most shapes anyway; this explicit
    // same-transaction check names the invariant and keeps it enforced
    // independently of future validator drift.
    if (event.status !== "started") {
      const tail = current[current.length - 1];
      if (
        tail === undefined || tail.status !== "started" ||
        !sameAttemptIdentity(tail, event)
      ) {
        throw new LoopRunJournalError(
          "ILLEGAL_TRANSITION",
          "a terminal capability event may only close the active tail claim",
        );
      }
    }
    try {
      const regateContext = this.regateChainContextInTransaction(db, event.runId);
      // WP4 Round 1 H1 fix: append-time authorization is ONLY the live
      // pending Re-Gate target derived in this transaction. Historical
      // findings never authorize new writes — resolved/accepted findings
      // must not let a stale scope re-trigger downstream rebuilds.
      //
      // WP4 Round 2 H1: append-time authorization is EXCLUSIVELY the
      // live pending target derived above in this transaction.
      validateLoopCapabilityExecutionChain([...current, event], event.runId, {
        acceptedRiskScopes: regateContext.acceptedRiskScopes,
        allowedRestartTargetIndex: regateContext.allowedRestartTargetIndex,
        historicalFindings: regateContext.historicalFindings,
        feedbackChange: regateContext.feedbackChange,
      });
    } catch (error) {
      if (error instanceof LoopRunJournalError) {
        throw new LoopRunJournalError("ILLEGAL_TRANSITION", "capability execution transition is invalid");
      }
      throw error;
    }
    // v4 (re-review F1): the decision delta is physically bound like
    // revision outputs and finding evidence — the blob must exist in the
    // artifact store with a matching digest before the verdict lands.
    // Error mapping matches verifyRevisionBlob/verifyFindingEvidenceBlob:
    // missing or digest-drifted blobs reject the transition, corrupt blob
    // content fails closed as STORE_CORRUPT, and only genuine I/O faults
    // surface as STORE_FAILURE.
    if (event.decisionDeltaRef !== null && event.decisionDeltaDigest !== null) {
      this.verifyDecisionDeltaBlob(event.decisionDeltaRef, event.decisionDeltaDigest, "append");
    }
    this.insertCapabilityExecutionRow(db, row);
    return Object.freeze({ event: Object.freeze({ ...event }), appended: true });
  }


  interruptCapabilityExecution(
    runId: string,
    expectedStartedEventId: string,
    createdAt: string,
    retryable: boolean,
  ): CapabilityExecutionInterruptResult {
    if (
      typeof runId !== "string" || runId.length === 0 || runId.trim() !== runId ||
      /[\x00-\x1f\x7f-\x9f]/.test(runId)
    ) {
      throw new LoopRunJournalError("INVALID_INPUT", "runId must be a safe trimmed non-empty string");
    }
    if (
      typeof expectedStartedEventId !== "string" || expectedStartedEventId.length === 0 ||
      expectedStartedEventId.trim() !== expectedStartedEventId ||
      /[\x00-\x1f\x7f-\x9f]/.test(expectedStartedEventId)
    ) {
      throw new LoopRunJournalError("INVALID_INPUT", "expected started event id must be a safe string");
    }
    if (
      typeof createdAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(createdAt) ||
      Number.isNaN(Date.parse(createdAt))
    ) {
      throw new LoopRunJournalError("INVALID_INPUT", "interruption timestamp must be ISO-8601");
    }
    if (typeof retryable !== "boolean") {
      throw new LoopRunJournalError("INVALID_INPUT", "interruption retryable must be boolean");
    }

    const db = this.connection();
    try {
      return db.transaction((): CapabilityExecutionInterruptResult => {
        const snapshot = this.readRunSnapshotInTransaction(db, runId);
        if (snapshot === undefined) {
          throw new LoopRunJournalError("RUN_NOT_FOUND", "run does not exist");
        }
        if (snapshot.state.status !== "running" || snapshot.state.currentStage !== null) {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "capability interruption requires an idle running run");
        }
        const current = this.readCapabilityExecutionsInTransaction(db, runId);
        const active = current[current.length - 1];
        if (active?.status !== "started") {
          const priorStarted = current[current.length - 2];
          if (
            active?.status === "failed" && active.errorCode === "ATTEMPT_INTERRUPTED" &&
            priorStarted?.status === "started" &&
            priorStarted.executionEventId === expectedStartedEventId
          ) {
            return Object.freeze({ event: active, interrupted: false });
          }
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "no matching active capability execution exists");
        }
        if (active.executionEventId !== expectedStartedEventId) {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "active capability execution does not match recovery claim");
        }
        const failed: LoopCapabilityExecutionEvent = Object.freeze({
          ...active,
          executionEventId: `${runId}:capability:${active.sequence + 1}:failed`,
          sequence: active.sequence + 1,
          status: "failed",
          createdAt,
          outputArtifactRef: null,
          outputArtifactVersion: null,
          outputDigest: null,
          gateResult: null,
          unresolvedFindingsRef: null,
          unresolvedFindingsDigest: null,
          nextStepEligibility: "BLOCKED",
          errorCode: "ATTEMPT_INTERRUPTED",
          retryable,
          reasonCode: "ENTRY_RECOVERY",
        });
        try {
          const regateContext = this.regateChainContextInTransaction(db, runId);
          validateLoopCapabilityExecutionChain([...current, failed], runId, {
            historicalFindings: regateContext.historicalFindings,
            historicalReplayMode: true,
            feedbackChange: regateContext.feedbackChange,
          });
        } catch (error) {
          if (error instanceof LoopRunJournalError) {
            throw new LoopRunJournalError("ILLEGAL_TRANSITION", "capability interruption transition is invalid");
          }
          throw error;
        }
        this.insertCapabilityExecutionRow(db, capabilityExecutionToRow(failed));
        return Object.freeze({ event: failed, interrupted: true });
      }).immediate() as CapabilityExecutionInterruptResult;
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      const code = sqliteErrorCode(error);
      if (isBusyCode(code)) busy();
      if (isConstraintCode(code)) {
        throw new LoopRunJournalError("EVENT_SEQUENCE_CONFLICT", "capability interruption sequence is occupied");
      }
      storageFailure();
    }
  }

  /** Read and verify the complete capability attempt chain for one run. */
  listCapabilityExecutions(runId: string): readonly LoopCapabilityExecutionEvent[] {
    const snapshot = this.readSnapshot(runId);
    if (snapshot === undefined) return Object.freeze([]);
    const db = this.connection();
    try {
      return db.transaction(() => this.readCapabilityExecutionsInTransaction(db, runId))() as readonly LoopCapabilityExecutionEvent[];
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      if (isBusyCode(sqliteErrorCode(error))) busy();
      storageFailure();
    }
  }

  /**
   * Lists all verified run snapshots for one requirement, oldest first.
   * This is the cross-entry lookup that lets an entry resume the same
   * Requirement by requirementId without reinterpreting confirmed facts.
   * requirementId is external input: validated fail-closed and never echoed.
   *
   * The persisted requirement_id column is never trusted for selection:
   * tampering it would otherwise hide a run from this lookup (and from the
   * cross-run NEW_REQUIREMENT guard) without touching its identity hash.
   * Every run row is read through the verified snapshot path (identity hash,
   * event replay, change chain and revision chain) and filtered by the
   * verified identity instead — a tampered row fails closed as STORE_CORRUPT.
   */
  listRunsByRequirement(requirementId: string): readonly LoopRunSnapshot[] {
    validateRequirementId(requirementId);
    const db = this.connection();
    try {
      return db.transaction((): readonly LoopRunSnapshot[] =>
        this.listRunsByRequirementInTransaction(db, requirementId))() as readonly LoopRunSnapshot[];
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      if (isBusyCode(sqliteErrorCode(error))) busy();
      storageFailure();
    }
  }

  /**
   * In-transaction implementation of listRunsByRequirement: every run row is
   * read through the verified snapshot path (identity hash, event replay,
   * change chain and revision chain) and filtered by the verified identity.
   */
  private listRunsByRequirementInTransaction(
    db: Database.Database,
    requirementId: string,
  ): readonly LoopRunSnapshot[] {
    const rows = db
      .prepare("SELECT run_id FROM loop_runs ORDER BY created_at ASC, run_id ASC")
      .all() as ReadonlyArray<{ run_id: string }>;
    const snapshots: LoopRunSnapshot[] = [];
    for (const row of rows) {
      const snapshot = this.readRunSnapshotInTransaction(db, row.run_id);
      if (snapshot === undefined) {
        // A listed row must always resolve to a verified snapshot.
        throw new LoopRunJournalError("STORE_CORRUPT", "requirement run row missing verified snapshot");
      }
      if (snapshot.state.identity.requirementId === requirementId) {
        snapshots.push(snapshot);
      }
    }
    return snapshots;
  }

  /**
   * Finds the latest verified run snapshot for a requirement, or undefined
   * when the requirement has no run yet. Primary recovery lookup for the
   * LOOP entry contract.
   */
  findLatestRunByRequirement(requirementId: string): LoopRunSnapshot | undefined {
    const runs = this.listRunsByRequirement(requirementId);
    return runs.length === 0 ? undefined : runs[runs.length - 1];
  }

  /**
   * Append one immutable C02 WP-1 requirement change record. Records use
   * their own per-run sequence and never mutate the delivery-stage cursor or
   * the capability-attempt stream. The owning run must exist, be non-terminal
   * and have no active stage or capability execution; the record's
   * requirementId must match the verified run identity. The complete
   * persisted run and change chain are verified before any write. Exact
   * replays are idempotent; conflicting ids or sequences are rejected.
   */
  appendRequirementChange(record: LoopRequirementChangeRecord): RequirementChangeAppendResult {
    const db = this.connection();
    validateLoopRequirementChangeRecord(record);
    try {
      return db.transaction((): RequirementChangeAppendResult => {
        const snapshot = this.readRunSnapshotInTransaction(db, record.runId);
        if (snapshot === undefined) {
          throw new LoopRunJournalError("RUN_NOT_FOUND", "run does not exist");
        }
        const status = snapshot.state.status;
        if (status === "completed" || status === "failed" || status === "cancelled") {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "terminal run must not accept change records");
        }
        if (snapshot.state.currentStage !== null) {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "change records require no active delivery stage");
        }
        if (record.requirementId !== snapshot.state.identity.requirementId) {
          throw new LoopRunJournalError("INVALID_INPUT", "change record requirement does not match the run identity");
        }
        const capabilityExecutions = this.readCapabilityExecutionsInTransaction(db, record.runId);
        if (capabilityExecutions[capabilityExecutions.length - 1]?.status === "started") {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "change records cannot advance while a capability execution is active");
        }
        const current = this.readRequirementChangesInTransaction(db, record.runId, snapshot.state.identity.requirementId);
        const existing = current.find((item) => item.changeRecordId === record.changeRecordId);
        if (existing !== undefined) {
          if (
            canonicalizeLoopRequirementChangeRecord(existing) ===
            canonicalizeLoopRequirementChangeRecord(record)
          ) {
            return Object.freeze({ record: existing, appended: false });
          }
          throw new LoopRunJournalError("EVENT_ID_CONFLICT", "requirement change record id already exists");
        }
        if (current.some((item) => item.sequence === record.sequence)) {
          throw new LoopRunJournalError("EVENT_SEQUENCE_CONFLICT", "requirement change sequence is occupied");
        }
        // Round 2 re-review F3: a FEEDBACK_DRIVEN_CHANGE record must cite the
        // run's CURRENT authoritative generation as previousGeneration — the
        // generation it closes. Skipping ahead (previousGeneration beyond the
        // authority), regressing behind it, or re-citing an already-superseded
        // generation would fork or rewind the generation authority derived
        // from this very chain. Baseline: no prior feedback record means the
        // run sits in generation 1, so previousGeneration must be exactly 1.
        if (
          record.changeKind === "FEEDBACK_DRIVEN_CHANGE" &&
          record.status === "CLASSIFIED" &&
          record.previousGeneration !== null
        ) {
          let authoritative = 1;
          for (const item of current) {
            if (
              item.changeKind === "FEEDBACK_DRIVEN_CHANGE" &&
              item.status === "CLASSIFIED" &&
              item.previousGeneration !== null
            ) {
              authoritative = item.previousGeneration + 1;
            }
          }
          if (record.previousGeneration !== authoritative) {
            throw new LoopRunJournalError(
              "ILLEGAL_TRANSITION",
              `FEEDBACK_DRIVEN_CHANGE must close the current generation ${authoritative}, got ${record.previousGeneration}`,
            );
          }
        }
        // Cross-run NEW_REQUIREMENT uniqueness: NEW_REQUIREMENT is only legal
        // while the requirement has no classified change record in ANY run.
        // The chain validator covers the current run; this check binds the
        // rule across runs of the same requirement (verified run identity is
        // authoritative, so the requirement is resolved through loop_runs).
        // The guard adjudicates only on fully verified chains: every related
        // run's change chain is read through the verified reader inside this
        // same immediate transaction, so a tampered historical row (e.g. a
        // CLASSIFIED record rewritten to BLOCKED with a stale canonical hash)
        // surfaces here as STORE_CORRUPT instead of silently passing.
        if (record.changeKind === "NEW_REQUIREMENT") {
          // corruption-first: every run row is read through the verified
          // snapshot path (never the persisted requirement_id column) and
          // every related chain is fully read and verified before the
          // uniqueness decision — no short-circuit. A tampered identity
          // column or a corrupt related chain surfaces here as STORE_CORRUPT
          // even when an earlier run already holds a valid CLASSIFIED record.
          const allRuns = db.prepare(
            "SELECT run_id FROM loop_runs ORDER BY created_at ASC, run_id ASC",
          ).all() as ReadonlyArray<{ run_id: string }>;
          const relatedChains: Array<readonly LoopRequirementChangeRecord[]> = [];
          for (const row of allRuns) {
            if (row.run_id === record.runId) continue;
            const related = this.readRunSnapshotInTransaction(db, row.run_id);
            if (related === undefined) {
              throw new LoopRunJournalError("STORE_CORRUPT", "run row missing verified snapshot inside change guard");
            }
            if (related.state.identity.requirementId !== snapshot.state.identity.requirementId) continue;
            relatedChains.push(this.readRequirementChangesInTransaction(db, row.run_id, related.state.identity.requirementId));
          }
          const hasPriorClassification = relatedChains.some((chain) =>
            chain.some((item) => item.status === "CLASSIFIED"));
          if (hasPriorClassification) {
            throw new LoopRunJournalError("ILLEGAL_TRANSITION", "requirement already has a classified change record in another run");
          }
        }
        try {
          validateLoopRequirementChangeChain([...current, record], record.runId);
        } catch (error) {
          if (error instanceof LoopRunJournalError) {
            throw new LoopRunJournalError("ILLEGAL_TRANSITION", "requirement change transition is invalid");
          }
          throw error;
        }
        insertRequirementChangeRows(db, record);
        return Object.freeze({ record, appended: true });
      }).immediate() as RequirementChangeAppendResult;
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      const code = sqliteErrorCode(error);
      if (isBusyCode(code)) busy();
      if (isConstraintCode(code)) {
        try {
          const current = db.transaction(() => {
            const snapshot = this.readRunSnapshotInTransaction(db, record.runId);
            if (snapshot === undefined) {
              throw new LoopRunJournalError("STORE_CORRUPT", "run row missing verified snapshot inside conflict reclassification");
            }
            return this.readRequirementChangesInTransaction(db, record.runId, snapshot.state.identity.requirementId);
          })() as readonly LoopRequirementChangeRecord[];
          const existing = current.find((item) => item.changeRecordId === record.changeRecordId);
          if (
            existing !== undefined &&
            canonicalizeLoopRequirementChangeRecord(existing) === canonicalizeLoopRequirementChangeRecord(record)
          ) {
            return Object.freeze({ record: existing, appended: false });
          }
          if (existing !== undefined) {
            throw new LoopRunJournalError("EVENT_ID_CONFLICT", "requirement change record id already exists");
          }
          if (current.some((item) => item.sequence === record.sequence)) {
            throw new LoopRunJournalError("EVENT_SEQUENCE_CONFLICT", "requirement change sequence is occupied");
          }
        } catch (reclassifyError) {
          if (reclassifyError instanceof LoopRunJournalError) throw reclassifyError;
          storageFailure();
        }
      }
      storageFailure();
    }
  }

  /**
   * Read and verify the complete requirement change chain for one run. The
   * snapshot verification and the record read happen in ONE transaction, so
   * no second connection can rewrite identity or records between them.
   */
  listRequirementChanges(runId: string): readonly LoopRequirementChangeRecord[] {
    const db = this.connection();
    try {
      return db.transaction((): readonly LoopRequirementChangeRecord[] => {
        const snapshot = this.readRunSnapshotInTransaction(db, runId);
        if (snapshot === undefined) return Object.freeze([]);
        return this.readRequirementChangesInTransaction(db, runId, snapshot.state.identity.requirementId);
      })() as readonly LoopRequirementChangeRecord[];
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      if (isBusyCode(sqliteErrorCode(error))) busy();
      storageFailure();
    }
  }

  /**
   * Finds the latest verified CLASSIFIED requirement change record for a
   * requirement, scanning its runs newest first and each chain latest-first,
   * or undefined when the requirement has no classification yet. BLOCKED
   * records carry no classification (kind/scope/facts are all null), so they
   * are skipped: a trailing BLOCKED never shadows the latest classification,
   * and a blocked-only requirement reads as unclassified. This is the
   * cross-entry read that lets another entry recover the same classification
   * and confirmed-fact boundary without reinterpreting confirmed facts.
   */
  findLatestRequirementChangeByRequirement(requirementId: string): LoopRequirementChangeRecord | undefined {
    validateRequirementId(requirementId);
    const db = this.connection();
    try {
      // One transaction for the whole scan: run identity verification and
      // change-chain reads cannot be split by a second connection.
      return db.transaction((): LoopRequirementChangeRecord | undefined => {
        const runs = this.listRunsByRequirementInTransaction(db, requirementId);
        for (let index = runs.length - 1; index >= 0; index -= 1) {
          const identity = runs[index]!.state.identity;
          const records = this.readRequirementChangesInTransaction(db, identity.runId, identity.requirementId);
          for (let recordIndex = records.length - 1; recordIndex >= 0; recordIndex -= 1) {
            if (records[recordIndex]!.status === "CLASSIFIED") return records[recordIndex]!;
          }
        }
        return undefined;
      })() as LoopRequirementChangeRecord | undefined;
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      if (isBusyCode(sqliteErrorCode(error))) busy();
      storageFailure();
    }
  }

  /**
   * Cross-check a revision's immutable ref/digest against the physical blob
   * in the bound artifact store (C02-WP2 blob binding; Decision-040 review
   * round 3). No-op when no artifact store is bound. On the append path a
   * missing or digest-drifted blob rejects the transition
   * (ILLEGAL_TRANSITION); on read paths it is journal corruption
   * (STORE_CORRUPT). Corrupt blob content fails closed as STORE_CORRUPT on
   * both paths; artifact-store I/O failures translate to STORE_FAILURE.
   * External input is never echoed.
   */
  private verifyRevisionBlob(record: LoopArtifactRevision, mode: "append" | "read"): void {
    if (this.artifactStore === null) return;
    try {
      this.artifactStore.read(record.artifactRef, record.digest);
    } catch (error) {
      if (error instanceof LoopArtifactStoreError) {
        if (error.code === "ARTIFACT_NOT_FOUND" || error.code === "ARTIFACT_DIGEST_MISMATCH") {
          if (mode === "append") {
            throw new LoopRunJournalError(
              "ILLEGAL_TRANSITION",
              "artifact revision blob is missing in the bound artifact store",
            );
          }
          corrupt("artifact revision blob is missing in the bound artifact store");
        }
        if (error.code === "ARTIFACT_CORRUPT") {
          corrupt("artifact revision blob is corrupt in the bound artifact store");
        }
        storageFailure();
      }
      storageFailure();
    }
  }

  /**
   * Closure-evidence blob binding (contract 0.1.1 §5): when an artifact store
   * is bound, resolution and risk-acceptance evidence must reference a blob
   * that physically exists with the declared digest. A forged but well-formed
   * digest fails closed — ILLEGAL_TRANSITION on write, STORE_CORRUPT on read.
   */
  private verifyFindingEvidenceBlob(ref: string, digest: string, mode: "append" | "read"): void {
    if (this.artifactStore === null) return;
    try {
      this.artifactStore.read(ref, digest);
    } catch (error) {
      if (error instanceof LoopArtifactStoreError) {
        if (error.code === "ARTIFACT_NOT_FOUND" || error.code === "ARTIFACT_DIGEST_MISMATCH") {
          if (mode === "append") {
            throw new LoopRunJournalError(
              "ILLEGAL_TRANSITION",
              "finding closure evidence blob is missing in the bound artifact store",
            );
          }
          corrupt("finding closure evidence blob is missing in the bound artifact store");
        }
        if (error.code === "ARTIFACT_CORRUPT") {
          corrupt("finding closure evidence blob is corrupt in the bound artifact store");
        }
        storageFailure();
      }
      storageFailure();
    }
  }

  /**
   * Decision-delta blob binding (Recovery §2.1 read-path parity with
   * revisions and finding evidence): when an artifact store is bound, a
   * materialized decision delta must reference a blob that physically exists
   * with the declared digest. A missing or drifted blob rejects the
   * transition on append (ILLEGAL_TRANSITION) and is journal corruption on
   * read (STORE_CORRUPT); corrupt blob content fails closed as STORE_CORRUPT
   * on both paths; only genuine artifact-store I/O failures translate to
   * STORE_FAILURE.
   */
  private verifyDecisionDeltaBlob(ref: string, digest: string, mode: "append" | "read"): void {
    if (this.artifactStore === null) return;
    try {
      this.artifactStore.read(ref, digest);
    } catch (error) {
      if (error instanceof LoopArtifactStoreError) {
        if (error.code === "ARTIFACT_NOT_FOUND" || error.code === "ARTIFACT_DIGEST_MISMATCH") {
          if (mode === "append") {
            throw new LoopRunJournalError(
              "ILLEGAL_TRANSITION",
              "decision delta blob is missing in the bound artifact store",
            );
          }
          corrupt("decision delta blob is missing in the bound artifact store");
        }
        if (error.code === "ARTIFACT_CORRUPT") {
          corrupt("decision delta blob is corrupt in the bound artifact store");
        }
        storageFailure();
      }
      storageFailure();
    }
  }

  /**
   * Append one immutable C02 WP-2 artifact revision. Revisions use their own
   * per-run+node sequence and never mutate the delivery-stage cursor, the
   * capability-attempt stream or the change chain. The owning run must exist,
   * be non-terminal and have no active stage or capability execution; the
   * revision's requirementId must match the verified run identity; the
   * producer execution binding (node, output ref, version, digest, Gate) must
   * match a succeeded capability execution of the same run exactly; upstream
   * references must resolve to the ACTIVE current revision of their node; the
   * semver must strictly advance past the node's current revision. The
   * supersede of the previous current and the current-pointer CAS advance
   * happen in the same transaction. Exact replays are idempotent while the
   * persisted revision still carries its original ACTIVE form; conflicting
   * ids, sequences or semvers are rejected.
   */
  appendArtifactRevision(record: LoopArtifactRevision): ArtifactRevisionAppendResult {
    const db = this.connection();
    validateLoopArtifactRevision(record);
    if (record.validity !== "ACTIVE" || record.supersededBy !== null) {
      throw new LoopRunJournalError("INVALID_INPUT", "new artifact revisions must be born active");
    }
    try {
      return db.transaction((): ArtifactRevisionAppendResult => {
        const snapshot = this.readRunSnapshotInTransaction(db, record.runId);
        if (snapshot === undefined) {
          throw new LoopRunJournalError("RUN_NOT_FOUND", "run does not exist");
        }
        const status = snapshot.state.status;
        if (status === "completed" || status === "failed" || status === "cancelled") {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "terminal run must not accept artifact revisions");
        }
        // Round 2 re-review F4: a durably blocked run accepts no further
        // writes on any append boundary — only releaseRunRegateBlock may
        // return it to running.
        if (status === "blocked") {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "blocked run must not accept artifact revisions");
        }
        if (snapshot.state.currentStage !== null) {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "artifact revisions require no active delivery stage");
        }
        if (record.requirementId !== snapshot.state.identity.requirementId) {
          throw new LoopRunJournalError("INVALID_INPUT", "artifact revision requirement does not match the run identity");
        }
        const capabilityExecutions = this.readCapabilityExecutionsInTransaction(db, record.runId);
        if (capabilityExecutions[capabilityExecutions.length - 1]?.status === "started") {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "artifact revisions cannot advance while a capability execution is active");
        }
        const current = this.readArtifactRevisionsInTransaction(db, record.runId, snapshot.state.identity.requirementId);
        const existing = current.find((item) => item.revisionId === record.revisionId);
        if (existing !== undefined) {
          if (
            canonicalizeLoopArtifactRevision(existing) === canonicalizeLoopArtifactRevision(record)
          ) {
            return Object.freeze({ record: existing, appended: false });
          }
          throw new LoopRunJournalError("EVENT_ID_CONFLICT", "artifact revision id already exists");
        }
        if (current.some((item) => item.nodeId === record.nodeId && item.sequence === record.sequence)) {
          throw new LoopRunJournalError("EVENT_SEQUENCE_CONFLICT", "artifact revision sequence is occupied");
        }
        if (current.some((item) => item.nodeId === record.nodeId && item.semver === record.semver)) {
          throw new LoopRunJournalError("EVENT_SEQUENCE_CONFLICT", "artifact revision semver is occupied");
        }
        const producer = capabilityExecutions.find(
          (item) => item.executionEventId === record.producerExecutionId,
        );
        if (producer === undefined || producer.status !== "succeeded") {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "artifact revision requires a succeeded producer execution");
        }
        if (producer.capability !== record.nodeId) {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "artifact revision node does not match the producer execution");
        }
        if (
          producer.outputArtifactRef !== record.artifactRef ||
          producer.outputArtifactVersion !== record.semver ||
          producer.outputDigest !== record.digest
        ) {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "artifact revision does not match the producer execution output");
        }
        if (producer.gateResult !== record.gateResult) {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "artifact revision Gate result does not match the producer execution");
        }
        // v2 (A2): the producing role is bound at append time — the revision
        // must name the exact role of the succeeded execution that produced it.
        if (producer.executionRole !== record.producerExecutionRole) {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "artifact revision producing role does not match the producer execution");
        }
        // v2 promote-time role firewall (A2/G1): before a solution-gate
        // revision may become the node current, its formal_verdict producer
        // must be a different agent than the adversarial_scan execution of
        // the same solution-gate round.
        if (record.nodeId === "solution-gate") {
          const scan = capabilityExecutions.filter(
            (item) => item.capability === "solution-gate" &&
              item.executionRole === "adversarial_scan" && item.status === "succeeded",
          ).pop();
          if (
            scan === undefined || scan.executorAgent === producer.executorAgent
          ) {
            throw new LoopRunJournalError(
              "ILLEGAL_TRANSITION",
              "solution-gate current requires a formal_verdict agent different from adversarial_scan",
            );
          }
        }
        // Round 2 review H3: the revision's generation is bound to the RUN's
        // generation authority — the latest verified CLASSIFIED
        // FEEDBACK_DRIVEN_CHANGE record opens previousGeneration + 1, and
        // generation 1 is the baseline. Node attempts never influence this
        // number, so a retry cannot fork generations across nodes, and no
        // caller can stamp an arbitrary generation onto a revision.
        const changeRecords = this.readRequirementChangesInTransaction(
          db,
          record.runId,
          snapshot.state.identity.requirementId,
        );
        let runGeneration = 1;
        for (let index = changeRecords.length - 1; index >= 0; index -= 1) {
          const change = changeRecords[index]!;
          if (
            change.changeKind === "FEEDBACK_DRIVEN_CHANGE" &&
            change.status === "CLASSIFIED" &&
            change.previousGeneration !== null
          ) {
            runGeneration = change.previousGeneration + 1;
            break;
          }
        }
        if (record.generation !== runGeneration) {
          throw new LoopRunJournalError(
            "ILLEGAL_TRANSITION",
            "artifact revision generation must equal the run's current feedback-opened generation",
          );
        }
        // Blob binding (fifth binding): the producer journal match only proves
        // the claimed output triple; the physical blob must also exist in the
        // bound artifact store with a matching digest before the revision may
        // become the node's ACTIVE current.
        this.verifyRevisionBlob(record, "append");
        const nodeChain = current.filter((item) => item.nodeId === record.nodeId);
        const previousCurrent = nodeChain[nodeChain.length - 1];
        if (
          previousCurrent !== undefined &&
          compareLoopArtifactSemver(record.semver, previousCurrent.semver) <= 0
        ) {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "artifact revision semver must advance past the current revision");
        }
        for (const upstreamId of record.upstreamRevisionIds) {
          const upstream = current.find((item) => item.revisionId === upstreamId);
          if (upstream === undefined) {
            throw new LoopRunJournalError("ILLEGAL_TRANSITION", "upstream artifact revision does not exist in the run");
          }
          const pointer = db.prepare(
            "SELECT revision_id FROM loop_artifact_current WHERE run_id = ? AND node_id = ?",
          ).get(record.runId, upstream.nodeId) as { revision_id?: unknown } | undefined;
          if (pointer === undefined || pointer.revision_id !== upstreamId) {
            throw new LoopRunJournalError("ILLEGAL_TRANSITION", "upstream artifact revision must be the current revision of its node");
          }
          if (upstream.validity !== "ACTIVE") {
            throw new LoopRunJournalError("ILLEGAL_TRANSITION", "upstream artifact revision must be active");
          }
        }
        // The chain is validated in its post-transition state: when this
        // append advances an ACTIVE previous current, that revision becomes
        // SUPERSEDED with supersededBy backfilled by the same transaction
        // (below). Validating the pre-transition rows instead would reject
        // every legitimate version advance, because only the latest revision
        // of a node may remain ACTIVE. A non-contiguous successor sequence
        // keeps the pre-transition rows here so the chain validator rejects
        // the gap itself.
        const supersededPrevious = previousCurrent !== undefined &&
          previousCurrent.validity === "ACTIVE" &&
          record.sequence === previousCurrent.sequence + 1
          ? supersedeArtifactRevision(previousCurrent, record.revisionId)
          : undefined;
        const candidate = [
          ...current.map((item) =>
            supersededPrevious !== undefined && item.revisionId === supersededPrevious.revisionId
              ? supersededPrevious
              : item),
          record,
        ].sort((a, b) =>
          a.nodeId === b.nodeId ? a.sequence - b.sequence : a.nodeId < b.nodeId ? -1 : 1);
        try {
          validateLoopArtifactRevisionChain(candidate, record.runId);
        } catch (error) {
          if (error instanceof LoopRunJournalError) {
            throw new LoopRunJournalError("ILLEGAL_TRANSITION", "artifact revision transition is invalid");
          }
          throw error;
        }
        insertArtifactRevisionRows(db, record);
        // Supersede applies only to an ACTIVE previous current: it is marked
        // SUPERSEDED with supersededBy backfilled and its canonical hash
        // recomputed in the same transaction. A STALE previous current keeps
        // its validity — the state machine has no STALE → SUPERSEDED edge —
        // and the pointer simply advances past it.
        if (supersededPrevious !== undefined) {
          const supersedeResult = db.prepare(
            "UPDATE loop_artifact_revisions SET validity = ?, superseded_by = ?, canonical_sha256 = ? WHERE revision_id = ? AND validity = ?",
          ).run(
            "SUPERSEDED", record.revisionId,
            sha256Hex(canonicalizeLoopArtifactRevision(supersededPrevious)),
            previousCurrent!.revisionId, "ACTIVE",
          );
          if (supersedeResult.changes !== 1) {
            corrupt("previous current artifact revision drifted during supersede");
          }
        }
        if (previousCurrent === undefined) {
          db.prepare(
            "INSERT INTO loop_artifact_current (run_id, node_id, revision_id, updated_at) VALUES (?, ?, ?, ?)",
          ).run(record.runId, record.nodeId, record.revisionId, record.createdAt);
        } else {
          // CAS advance: the pointer moves only while it still targets the
          // exact previous current revision this append was validated against.
          const casResult = db.prepare(
            "UPDATE loop_artifact_current SET revision_id = ?, updated_at = ? WHERE run_id = ? AND node_id = ? AND revision_id = ?",
          ).run(record.revisionId, record.createdAt, record.runId, record.nodeId, previousCurrent.revisionId);
          if (casResult.changes !== 1) {
            corrupt("current artifact pointer drifted during append");
          }
        }
        return Object.freeze({ record, appended: true });
      }).immediate() as ArtifactRevisionAppendResult;
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      const code = sqliteErrorCode(error);
      if (isBusyCode(code)) busy();
      if (isConstraintCode(code)) {
        try {
          const current = db.transaction(() => {
            const snapshot = this.readRunSnapshotInTransaction(db, record.runId);
            if (snapshot === undefined) {
              throw new LoopRunJournalError("STORE_CORRUPT", "run row missing verified snapshot inside conflict reclassification");
            }
            return this.readArtifactRevisionsInTransaction(db, record.runId, snapshot.state.identity.requirementId);
          })() as readonly LoopArtifactRevision[];
          const existing = current.find((item) => item.revisionId === record.revisionId);
          if (
            existing !== undefined &&
            canonicalizeLoopArtifactRevision(existing) === canonicalizeLoopArtifactRevision(record)
          ) {
            return Object.freeze({ record: existing, appended: false });
          }
          if (existing !== undefined) {
            throw new LoopRunJournalError("EVENT_ID_CONFLICT", "artifact revision id already exists");
          }
          if (current.some((item) => item.nodeId === record.nodeId &&
            (item.sequence === record.sequence || item.semver === record.semver))) {
            throw new LoopRunJournalError("EVENT_SEQUENCE_CONFLICT", "artifact revision sequence or semver is occupied");
          }
        } catch (reclassifyError) {
          if (reclassifyError instanceof LoopRunJournalError) throw reclassifyError;
          storageFailure();
        }
      }
      storageFailure();
    }
  }

  /**
   * Explicit STALE marking primitive (C02-WP3 calls it for invalidation
   * propagation; WP-2 implements no propagation). Marks exactly one ACTIVE
   * revision STALE — never its consumers. Re-marking an already STALE
   * revision is an idempotent no-op; marking a SUPERSEDED revision regresses
   * the fixed validity state machine and is rejected. The owning run must be
   * non-terminal with no active stage or capability execution.
   */
  markArtifactRevisionStale(runId: string, revisionId: string): ArtifactRevisionStaleResult {
    if (
      typeof runId !== "string" || runId.length === 0 || runId.trim() !== runId ||
      /[\x00-\x1f\x7f-\x9f]/.test(runId)
    ) {
      throw new LoopRunJournalError("INVALID_INPUT", "runId must be a safe trimmed non-empty string");
    }
    if (
      typeof revisionId !== "string" || revisionId.length === 0 || revisionId.trim() !== revisionId ||
      /[\x00-\x1f\x7f-\x9f]/.test(revisionId)
    ) {
      throw new LoopRunJournalError("INVALID_INPUT", "revisionId must be a safe trimmed non-empty string");
    }
    const db = this.connection();
    try {
      return db.transaction((): ArtifactRevisionStaleResult => {
        const snapshot = this.readRunSnapshotInTransaction(db, runId);
        if (snapshot === undefined) {
          throw new LoopRunJournalError("RUN_NOT_FOUND", "run does not exist");
        }
        const status = snapshot.state.status;
        if (status === "completed" || status === "failed" || status === "cancelled") {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "terminal run must not accept stale markings");
        }
        if (snapshot.state.currentStage !== null) {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "stale markings require no active delivery stage");
        }
        const capabilityExecutions = this.readCapabilityExecutionsInTransaction(db, runId);
        if (capabilityExecutions[capabilityExecutions.length - 1]?.status === "started") {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "stale markings cannot advance while a capability execution is active");
        }
        const current = this.readArtifactRevisionsInTransaction(db, runId, snapshot.state.identity.requirementId);
        const target = current.find((item) => item.revisionId === revisionId);
        if (target === undefined) {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "no matching artifact revision exists");
        }
        if (target.validity === "STALE") {
          return Object.freeze({ record: target, marked: false });
        }
        if (target.validity !== "ACTIVE") {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "only an active artifact revision can be marked stale");
        }
        const marked = markRevisionStaleRowInTransaction(db, target);
        return Object.freeze({ record: marked, marked: true });
      }).immediate() as ArtifactRevisionStaleResult;
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      const code = sqliteErrorCode(error);
      if (isBusyCode(code)) busy();
      storageFailure();
    }
  }

  /**
   * Read and verify the complete artifact revision set for one run. The
   * snapshot verification and the record read happen in ONE transaction, so
   * no second connection can rewrite identity or records between them.
   */
  listArtifactRevisions(runId: string): readonly LoopArtifactRevision[] {
    const db = this.connection();
    try {
      return db.transaction((): readonly LoopArtifactRevision[] => {
        const snapshot = this.readRunSnapshotInTransaction(db, runId);
        if (snapshot === undefined) return Object.freeze([]);
        return this.readArtifactRevisionsInTransaction(db, runId, snapshot.state.identity.requirementId);
      })() as readonly LoopArtifactRevision[];
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      if (isBusyCode(sqliteErrorCode(error))) busy();
      storageFailure();
    }
  }

  /**
   * Read the current artifact revision for one node, or undefined when the
   * run or the node's revision chain does not exist. The pointer target must
   * be ACTIVE: a pointer to a STALE or SUPERSEDED revision fails closed with
   * STORE_CORRUPT on this read path (use listArtifactRevisions to audit the
   * full chain in that state).
   */
  getCurrentArtifactRevision(runId: string, nodeId: string): LoopArtifactRevision | undefined {
    if (
      typeof runId !== "string" || runId.length === 0 || runId.trim() !== runId ||
      /[\x00-\x1f\x7f-\x9f]/.test(runId)
    ) {
      throw new LoopRunJournalError("INVALID_INPUT", "runId must be a safe trimmed non-empty string");
    }
    if (!(NODE_CAPABILITY_IDS as readonly string[]).includes(nodeId)) {
      throw new LoopRunJournalError("INVALID_INPUT", "nodeId must be a canonical capability id");
    }
    const db = this.connection();
    try {
      // Snapshot verification, revision read and pointer resolution happen in
      // ONE transaction: no second connection can rewrite identity or records
      // between verifying the run and returning its current revision.
      return db.transaction((): LoopArtifactRevision | undefined => {
        const snapshot = this.readRunSnapshotInTransaction(db, runId);
        if (snapshot === undefined) return undefined;
        const records = this.readArtifactRevisionsInTransaction(db, runId, snapshot.state.identity.requirementId);
        const row = db.prepare(
          "SELECT revision_id FROM loop_artifact_current WHERE run_id = ? AND node_id = ?",
        ).get(runId, nodeId) as { revision_id?: unknown } | undefined;
        if (row === undefined) return undefined;
        const record = records.find((item) => item.revisionId === row.revision_id);
        if (record === undefined) {
          corrupt("current artifact pointer target is missing");
        }
        if (record.validity !== "ACTIVE") {
          corrupt("current artifact revision is not active");
        }
        return record;
      })() as LoopArtifactRevision | undefined;
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      if (isBusyCode(sqliteErrorCode(error))) busy();
      storageFailure();
    }
  }

  /**
   * WP4: raw per-node CURRENT pointer facts WITHOUT the ACTIVE-only
   * assertion of getCurrentArtifactRevision. After a finding invalidation
   * the pointer legitimately targets a STALE revision; Re-Gate planning
   * consumes exactly those facts (validity + createdAt), while consumption
   * paths keep using the fail-closed getter.
   */
  listRegateCurrentFacts(runId: string): ReadonlyArray<{
    nodeId: NodeCapabilityId;
    revisionId: string;
    artifactRef: string;
    digest: string;
    validity: string;
    createdAt: string;
    generation: number | null;
  }> {
    if (
      typeof runId !== "string" || runId.length === 0 || runId.trim() !== runId ||
      /[\x00-\x1f\x7f-\x9f]/.test(runId)
    ) {
      throw new LoopRunJournalError("INVALID_INPUT", "runId must be a safe trimmed non-empty string");
    }
    const db = this.connection();
    try {
      // WP4 Round 1 H5 fix: ONE transaction, fully validated readers —
      // snapshot (run/events/capability chain/change chain/revision chain +
      // pointer consistency), then per-pointer node ownership and integrity.
      // Legal STALE planning facts are preserved; tampered pointers,
      // missing/mismatched revisions or hash drift surface as STORE_CORRUPT.
      return Object.freeze(db.transaction((): Array<{
        nodeId: NodeCapabilityId;
        revisionId: string;
        artifactRef: string;
        digest: string;
        validity: string;
        createdAt: string;
        generation: number | null;
      }> => {
        const snapshot = this.readRunSnapshotInTransaction(db, runId);
        if (snapshot === undefined) return [];
        const requirementId = snapshot.state.identity.requirementId;
        const records = this.readArtifactRevisionsInTransaction(db, runId, requirementId);
        const byId = new Map(records.map((record) => [record.revisionId, record]));
        const pointerRows = db.prepare(
          "SELECT node_id, revision_id FROM loop_artifact_current WHERE run_id = ?",
        ).all(runId) as ReadonlyArray<{ node_id: string; revision_id: string }>;
        const facts: Array<{
          nodeId: NodeCapabilityId;
          revisionId: string;
          artifactRef: string;
          digest: string;
          validity: string;
          createdAt: string;
          generation: number | null;
        }> = [];
        for (const row of pointerRows) {
          const record = byId.get(row.revision_id);
          if (record === undefined) corrupt("regate facts: current pointer target is missing");
          if (record.nodeId !== row.node_id) corrupt("regate facts: current pointer crosses nodes");
          facts.push(Object.freeze({
            nodeId: record.nodeId,
            revisionId: record.revisionId,
            artifactRef: record.artifactRef,
            digest: record.digest,
            validity: record.validity,
            createdAt: record.createdAt,
            generation: record.generation,
          }));
        }
        return facts;
      })() as Array<{
        nodeId: NodeCapabilityId;
        revisionId: string;
        artifactRef: string;
        digest: string;
        validity: string;
        createdAt: string;
        generation: number | null;
      }>);
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      if (isBusyCode(sqliteErrorCode(error))) busy();
      storageFailure();
    }
  }

  /**
   * WP4 (H4): durably record a Re-Gate round-budget exhaustion as a blocking
   * fact on a RUNNING run. Guarded UPDATE, idempotent for the same reason;
   * only user decision / risk acceptance / scope reset (explicit future
   * instructions) may clear it. Recovery surfaces the code so a fresh agent
   * resumes into an honest BLOCKED instead of silently re-looping.
   */
  /**
   * The run's current Re-Gate generation authority (Round 2 review H3):
   * derived from the verified change chain — the latest CLASSIFIED
   * FEEDBACK_DRIVEN_CHANGE record with a non-null previousGeneration opens
   * previousGeneration + 1; with no such record the run is in generation 1.
   * Node attempts never influence this number, so retries cannot fork
   * generations across nodes. Revision appends bind to this value
   * fail-closed inside their own transaction.
   */
  getRunGeneration(runId: string): number {
    const records = this.listRequirementChanges(runId);
    for (let index = records.length - 1; index >= 0; index -= 1) {
      const record = records[index]!;
      if (
        record.changeKind === "FEEDBACK_DRIVEN_CHANGE" &&
        record.status === "CLASSIFIED" &&
        record.previousGeneration !== null
      ) {
        return record.previousGeneration + 1;
      }
    }
    return 1;
  }

  /**
   * The number of PERSISTED backward jumps (Re-Gate rounds) in the verified
   * execution stream (Round 2 review H4). Raw dispatch counts conflate
   * linear progress with pathological cycles; only a jump to an earlier
   * point consumes a round. Feedback waves and causal waves both count —
   * they are both generation restarts.
   */
  countRegateRounds(runId: string): number {
    const events = this.listCapabilityExecutions(runId);
    const points = LOOP_CAPABILITY_EXECUTION_POINTS;
    let rounds = 0;
    let prevIdx = -1;
    for (const event of events) {
      if (event.status !== "started") continue;
      const idx = points.findIndex(
        (point) => point.capability === event.capability && point.executionRole === event.executionRole,
      );
      // Round 2 re-review F4: a same-point RETRY repeats the previous
      // start's index and is NOT a generation restart — only a move to an
      // EARLIER point consumes a round.
      if (prevIdx >= 0 && idx !== prevIdx && idx < prevIdx + 1) rounds += 1;
      prevIdx = idx;
    }
    return rounds;
  }

  /**
   * The explicit release decision for a durably blocked run (Round 2 review
   * H4): RISK_ACCEPTED or SCOPE_RESET appends a run_resumed event carrying
   * the release code, clearing REGATE_ROUND_BUDGET_EXHAUSTED. Only the
   * budget-exhausted block is releasable here; other blocks need their own
   * governance paths.
   */
  releaseRunRegateBlock(
    runId: string,
    release: { kind: "RISK_ACCEPTED" | "SCOPE_RESET" },
  ): void {
    safeIdInput(runId, "runId");
    if (
      release === null || typeof release !== "object" ||
      (release.kind !== "RISK_ACCEPTED" && release.kind !== "SCOPE_RESET")
    ) {
      throw new LoopRunJournalError("INVALID_INPUT", "release.kind must be RISK_ACCEPTED or SCOPE_RESET");
    }
    const snapshot = this.getSnapshot(runId);
    if (snapshot === undefined) {
      throw new LoopRunJournalError("RUN_NOT_FOUND", "run not found");
    }
    if (snapshot.state.blockingReasonCode !== "REGATE_ROUND_BUDGET_EXHAUSTED") {
      throw new LoopRunJournalError("ILLEGAL_TRANSITION", "only a REGATE_ROUND_BUDGET_EXHAUSTED block is releasable");
    }
    const state = snapshot.state;
    const sequence = state.lastSequence + 1;
    this.appendEvent(Object.freeze({
      eventId: `${runId}:${sequence}:run_resumed`,
      runId,
      sequence,
      kind: "run_resumed" as const,
      stage: null,
      attempt: 0,
      createdAt: new Date().toISOString(),
      inputDigest: null,
      outputArtifactRef: null,
      outputDigest: null,
      errorCode: null,
      retryable: null,
      reasonCode: release.kind,
      bindingId: null,
      bindingVersion: null,
      inputArtifactRef: null,
    }));
  }

  /**
   * Single-transaction execution permit (Round 2 close-out B3): decides
   * whether dispatching `targetPointIndex` is allowed BEFORE any external
   * work happens. The prospective backward-jump round is computed and, when
   * it exceeds the budget, REGATE_ROUND_BUDGET_EXHAUSTED is persisted in the
   * SAME immediate transaction — an over-budget wave performs ZERO agent
   * dispatches and zero revision writes. An active capability execution
   * claim denies concurrent permits without persisting anything, so
   * competing connections serialize on the existing claim invariant instead
   * of racing past the budget.
   */
  authorizeRegateDispatch(
    runId: string,
    targetPointIndex: number,
    maxRounds: number,
  ): { allowed: boolean; blockedPersisted: boolean } {
    safeIdInput(runId, "runId");
    if (
      !Number.isSafeInteger(targetPointIndex) || targetPointIndex < 0 ||
      targetPointIndex >= LOOP_CAPABILITY_EXECUTION_POINTS.length
    ) {
      throw new LoopRunJournalError("INVALID_INPUT", "targetPointIndex must be a canonical point index");
    }
    if (!Number.isSafeInteger(maxRounds) || maxRounds < 1) {
      throw new LoopRunJournalError("INVALID_INPUT", "maxRounds must be a positive safe integer");
    }
    const db = this.connection();
    try {
      return db.transaction((): { allowed: boolean; blockedPersisted: boolean } => {
        const snapshot = this.readRunSnapshotInTransaction(db, runId);
        if (snapshot === undefined) {
          throw new LoopRunJournalError("RUN_NOT_FOUND", "run does not exist");
        }
        const state = snapshot.state;
        if (
          state.status === "blocked" ||
          (state.blockingReasonCode !== null && state.blockingReasonCode !== undefined)
        ) {
          return { allowed: false, blockedPersisted: false };
        }
        if (state.status !== "running") {
          return { allowed: false, blockedPersisted: false };
        }
        const events = this.readCapabilityExecutionsInTransaction(db, runId);
        // Budget basis: every explicit release decision RAISES the allowed
        // round count by one (monotonic, no cross-stream sequence compare).
        // A release authorizes completing the in-flight work it admits;
        // further waves beyond the raised allowance re-block.
        const releaseRow = db.prepare(
          `SELECT COUNT(*) AS n FROM loop_events
           WHERE run_id = ? AND kind = 'run_resumed'
             AND reason_code IN ('RISK_ACCEPTED', 'SCOPE_RESET')`,
        ).get(runId) as { n: number };
        const releases = Number(releaseRow.n);
        const effectiveMaxRounds = maxRounds + releases;
        const points = LOOP_CAPABILITY_EXECUTION_POINTS;
        let rounds = 0;
        let prevIdx = -1;
        for (const event of events) {
          if (event.status !== "started") continue;
          const idx = points.findIndex(
            (point) => point.capability === event.capability && point.executionRole === event.executionRole,
          );
          if (prevIdx >= 0 && idx !== prevIdx && idx < prevIdx + 1) rounds += 1;
          prevIdx = idx;
        }
        const last = events[events.length - 1];
        if (last !== undefined && last.status === "started") {
          // Active execution claim: another connection is mid-dispatch.
          // Deny without persisting — the budget is adjudicated after the
          // claim settles.
          return { allowed: false, blockedPersisted: false };
        }
        // Round 3 review F2: a succeeded producer whose node revision has not
        // landed yet holds the terminal→revision window closed. No entry may
        // dispatch any point while materialization is pending — deny WITHOUT
        // persisting a budget block, so the pending revision append itself
        // and later linear progress stay admissible.
        const pendingProducer = findPendingRevisionProducerExecution(
          events,
          this.readArtifactRevisionsInTransaction(db, runId, snapshot.state.identity.requirementId),
        );
        if (pendingProducer !== null) {
          return { allowed: false, blockedPersisted: false };
        }
        const isJump = prevIdx >= 0 && targetPointIndex !== prevIdx && targetPointIndex < prevIdx + 1;
        // Recovery 2.1.0 H4: the durable REGATE_ROUND_BUDGET_EXHAUSTED block
        // is adjudicated ONLY for a persisted backward jump. Linear
        // successors, same-point retries and scan→verdict progress never
        // persist a budget block, regardless of the historical round count.
        if (isJump && rounds + 1 > effectiveMaxRounds) {
          const sequence = state.lastSequence + 1;
          this.appendEvent(Object.freeze({
            eventId: `${runId}:${sequence}:run_blocked`,
            runId,
            sequence,
            kind: "run_blocked" as const,
            stage: null,
            attempt: 0,
            createdAt: new Date().toISOString(),
            inputDigest: null,
            outputArtifactRef: null,
            outputDigest: null,
            errorCode: null,
            retryable: null,
            reasonCode: "REGATE_ROUND_BUDGET_EXHAUSTED",
            bindingId: null,
            bindingVersion: null,
            inputArtifactRef: null,
          }));
          return { allowed: false, blockedPersisted: true };
        }
        return { allowed: true, blockedPersisted: false };
      }).immediate();
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      const code = sqliteErrorCode(error);
      if (isBusyCode(code)) busy();
      storageFailure();
    }
  }

  markRunRegateBlocked(runId: string, reasonCode: string): void {
    if (
      typeof runId !== "string" || runId.length === 0 || runId.trim() !== runId ||
      typeof reasonCode !== "string" || reasonCode.length === 0 || reasonCode.trim() !== reasonCode ||
      /[\x00-\x1f\x7f-\x9f]/.test(runId) || /[\x00-\x1f\x7f-\x9f]/.test(reasonCode)
    ) {
      throw new LoopRunJournalError("INVALID_INPUT", "runId and reasonCode must be safe trimmed strings");
    }
    const snapshot = this.getSnapshot(runId);
    if (snapshot === undefined) {
      throw new LoopRunJournalError("RUN_NOT_FOUND", "run not found");
    }
    const state = snapshot.state;
    const sequence = state.lastSequence + 1;
    this.appendEvent(Object.freeze({
      eventId: `${runId}:${sequence}:run_blocked`,
      runId,
      sequence,
      kind: "run_blocked" as const,
      stage: null,
      attempt: 0,
      createdAt: new Date().toISOString(),
      inputDigest: null,
      outputArtifactRef: null,
      outputDigest: null,
      errorCode: null,
      retryable: null,
      reasonCode,
      bindingId: null,
      bindingVersion: null,
      inputArtifactRef: null,
    }));
  }

  /**
   * Append one immutable C02 WP-3 finding and atomically propagate its
   * dependency invalidation. Findings use their own per-run sequence and
   * never mutate the delivery-stage cursor, the capability-attempt stream,
   * the change chain or the revision chain beyond the computed STALE marks.
   * The owning run must exist, be non-terminal and have no active stage or
   * capability execution; the finding's requirementId must match the verified
   * run identity; sourceRevisionId (when set) must reference an existing
   * revision of the same run. In the SAME transaction the store computes the
   * downstream node set from earliestAffectedNodeId over the canonical linear
   * node order — callers never submit invalidation lists — marks every
   * affected node's current ACTIVE revision STALE (shared guarded-UPDATE
   * primitive; an already-STALE revision stays STALE and is not recorded) and
   * persists one invalidation edge per marked revision. An empty affected set
   * is legal. Exact replays are idempotent; conflicting ids or sequences are
   * rejected.
   */
  appendFinding(record: LoopFinding): FindingAppendResult {
    const db = this.connection();
    validateLoopFinding(record);
    if (record.status !== "OPEN") {
      throw new LoopRunJournalError("INVALID_INPUT", "new findings must be born open");
    }
    try {
      return db.transaction((): FindingAppendResult => {
        const snapshot = this.readRunSnapshotInTransaction(db, record.runId);
        if (snapshot === undefined) {
          throw new LoopRunJournalError("RUN_NOT_FOUND", "run does not exist");
        }
        const status = snapshot.state.status;
        if (status === "completed" || status === "failed" || status === "cancelled") {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "terminal run must not accept findings");
        }
        if (snapshot.state.currentStage !== null) {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "findings require no active delivery stage");
        }
        if (record.requirementId !== snapshot.state.identity.requirementId) {
          throw new LoopRunJournalError("INVALID_INPUT", "finding requirement does not match the run identity");
        }
        const capabilityExecutions = this.readCapabilityExecutionsInTransaction(db, record.runId);
        if (capabilityExecutions[capabilityExecutions.length - 1]?.status === "started") {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "findings cannot advance while a capability execution is active");
        }
        const verifiedRequirementId = snapshot.state.identity.requirementId;
        const revisions = this.readArtifactRevisionsInTransaction(db, record.runId, verifiedRequirementId);
        const findingChain = this.readFindingChainInTransaction(db, record.runId, verifiedRequirementId);
        const current = findingChain.findings;
        const existing = current.find((item) => item.findingId === record.findingId);
        if (existing !== undefined) {
          if (canonicalizeLoopFinding(existing) === canonicalizeLoopFinding(record)) {
            return Object.freeze({ record: existing, appended: false });
          }
          throw new LoopRunJournalError("EVENT_ID_CONFLICT", "finding id already exists");
        }
        if (current.some((item) => item.sequence === record.sequence)) {
          throw new LoopRunJournalError("EVENT_SEQUENCE_CONFLICT", "finding sequence is occupied");
        }
        // Round 1 (H1-4): a finding binds to the CURRENT revision of its own
        // source capability — verified inside this transaction BEFORE any
        // invalidation action runs.
        if (record.sourceRevisionId !== null) {
          const source = revisions.find((item) => item.revisionId === record.sourceRevisionId);
          if (source === undefined) {
            throw new LoopRunJournalError("ILLEGAL_TRANSITION", "source artifact revision does not exist in the run");
          }
          if (source.nodeId !== record.sourceCapability) {
            throw new LoopRunJournalError("ILLEGAL_TRANSITION", "source artifact revision belongs to another node");
          }
          if (source.validity !== "ACTIVE") {
            throw new LoopRunJournalError(
              "ILLEGAL_TRANSITION",
              "source artifact revision is no longer an active current",
            );
          }
          const pointer = db.prepare(
            "SELECT revision_id FROM loop_artifact_current WHERE run_id = ? AND node_id = ?",
          ).get(record.runId, record.sourceCapability) as { revision_id?: unknown } | undefined;
          if (pointer === undefined || pointer.revision_id !== record.sourceRevisionId) {
            throw new LoopRunJournalError(
              "ILLEGAL_TRANSITION",
              "source artifact revision is not the current revision of the source capability",
            );
          }
        }
        // Round 2 re-review F2: DIRECT causal evidence must reference a REAL
        // revision of this run — a declared REGRESSION whose introducing
        // revision does not exist is rejected before any invalidation runs.
        if (record.causeKind === "REGRESSION") {
          if (record.introducedByRevisionId === null) {
            throw new LoopRunJournalError("ILLEGAL_TRANSITION", "regression finding requires introducedByRevisionId");
          }
          if (!revisions.some((item) => item.revisionId === record.introducedByRevisionId)) {
            throw new LoopRunJournalError("ILLEGAL_TRANSITION", "introducedByRevisionId does not exist in the run");
          }
        }
        try {
          validateLoopFindingChain([...current, record], findingChain.invalidations, record.runId);
        } catch (error) {
          if (error instanceof LoopRunJournalError) {
            throw new LoopRunJournalError("ILLEGAL_TRANSITION", "finding transition is invalid");
          }
          throw error;
        }
        insertFindingRow(db, record);
        // Dependency invalidation along the canonical linear node order: every
        // node at or downstream of earliestAffectedNodeId whose current
        // revision is ACTIVE is marked STALE and recorded as an edge, in node
        // order. Already-STALE currents are skipped without an edge. The
        // complete computed set is then persisted as the finding's
        // append-time invalidation scope (contract 0.1.1 §4): read-back
        // recomputes the scope digest from the surviving edges and fails
        // closed on any deleted edge — first, middle, last or all.
        const invalidationInsert = db.prepare(
          `INSERT INTO loop_finding_invalidations (
            finding_id, invalidation_index, revision_id, node_id
          ) VALUES (?, ?, ?, ?)`,
        );
        const edges: LoopFindingInvalidation[] = [];
        for (const nodeId of downstreamNodeIds(record.earliestAffectedNodeId)) {
          const pointer = db.prepare(
            "SELECT revision_id FROM loop_artifact_current WHERE run_id = ? AND node_id = ?",
          ).get(record.runId, nodeId) as { revision_id?: unknown } | undefined;
          if (pointer === undefined) continue;
          const revision = revisions.find((item) => item.revisionId === pointer.revision_id);
          if (revision === undefined) {
            corrupt("current artifact pointer target is missing");
          }
          if (revision.validity !== "ACTIVE") continue;
          markRevisionStaleRowInTransaction(db, revision);
          edges.push(Object.freeze({
            findingId: record.findingId,
            invalidationIndex: edges.length,
            revisionId: revision.revisionId,
            nodeId,
          }));
        }
        for (const edge of edges) {
          invalidationInsert.run(edge.findingId, edge.invalidationIndex, edge.revisionId, edge.nodeId);
        }
        const scope: LoopFindingInvalidationScope = Object.freeze({
          findingId: record.findingId,
          edgeCount: edges.length,
          scopeDigest: sha256Hex(canonicalizeLoopFindingInvalidationEdges(edges)),
        });
        insertFindingScopeRow(db, scope, record.runId);
        return Object.freeze({ record, appended: true });
      }).immediate() as FindingAppendResult;
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      const code = sqliteErrorCode(error);
      if (isBusyCode(code)) busy();
      if (isConstraintCode(code)) {
        try {
          const current = db.transaction(() => {
            const snapshot = this.readRunSnapshotInTransaction(db, record.runId);
            if (snapshot === undefined) {
              throw new LoopRunJournalError("STORE_CORRUPT", "run row missing verified snapshot inside conflict reclassification");
            }
            return this.readFindingsInTransaction(db, record.runId, snapshot.state.identity.requirementId);
          })() as readonly LoopFinding[];
          const existing = current.find((item) => item.findingId === record.findingId);
          if (
            existing !== undefined &&
            canonicalizeLoopFinding(existing) === canonicalizeLoopFinding(record)
          ) {
            return Object.freeze({ record: existing, appended: false });
          }
          if (existing !== undefined) {
            throw new LoopRunJournalError("EVENT_ID_CONFLICT", "finding id already exists");
          }
          if (current.some((item) => item.sequence === record.sequence)) {
            throw new LoopRunJournalError("EVENT_SEQUENCE_CONFLICT", "finding sequence is occupied");
          }
        } catch (reclassifyError) {
          if (reclassifyError instanceof LoopRunJournalError) throw reclassifyError;
          storageFailure();
        }
      }
      storageFailure();
    }
  }

  /**
   * Read and verify the complete finding chain for one run. The snapshot
   * verification and the record read happen in ONE transaction, so no second
   * connection can rewrite identity or records between them.
   */
  listFindings(runId: string): readonly LoopFinding[] {
    const db = this.connection();
    try {
      return db.transaction((): readonly LoopFinding[] => {
        const snapshot = this.readRunSnapshotInTransaction(db, runId);
        if (snapshot === undefined) return Object.freeze([]);
        return this.readFindingsInTransaction(db, runId, snapshot.state.identity.requirementId);
      })() as readonly LoopFinding[];
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      if (isBusyCode(sqliteErrorCode(error))) busy();
      storageFailure();
    }
  }

  /**
   * Read and verify the complete finding invalidation edge set for one run,
   * ordered by finding sequence and invalidation index. Same single
   * transaction discipline as listFindings.
   */
  listFindingInvalidations(runId: string): readonly LoopFindingInvalidation[] {
    const db = this.connection();
    try {
      return db.transaction((): readonly LoopFindingInvalidation[] => {
        const snapshot = this.readRunSnapshotInTransaction(db, runId);
        if (snapshot === undefined) return Object.freeze([]);
        return this.readFindingChainInTransaction(db, runId, snapshot.state.identity.requirementId).invalidations;
      })() as readonly LoopFindingInvalidation[];
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      if (isBusyCode(sqliteErrorCode(error))) busy();
      storageFailure();
    }
  }

  /**
   * The fixed read-only next-eligibility derivation (contract §6): any OPEN
   * finding blocks; any closed (RESOLVED / ACCEPTED_RISK) finding whose
   * earliest-affected-or-downstream current revision is STALE or missing
   * blocks; SUPERSEDED findings are absorbed by their replacement. The
   * derivation is recomputed from durable facts inside one verified
   * transaction and is never persisted. An unknown run derives ELIGIBLE with
   * no findings, mirroring the empty-chain read pattern.
   */
  computeFindingGate(runId: string): LoopFindingGateResult {
    safeIdInput(runId, "runId");
    const db = this.connection();
    try {
      return db.transaction((): LoopFindingGateResult => {
        const snapshot = this.readRunSnapshotInTransaction(db, runId);
        if (snapshot === undefined) {
          return computeFindingGateFromFacts([], new Map());
        }
        const verifiedRequirementId = snapshot.state.identity.requirementId;
        const findings = this.readFindingsInTransaction(db, runId, verifiedRequirementId);
        const revisions = this.readArtifactRevisionsInTransaction(db, runId, verifiedRequirementId);
        const revisionById = new Map(revisions.map((revision) => [revision.revisionId, revision]));
        const currentValidityByNode = new Map<string, string>();
        const pointerRows = db.prepare(
          "SELECT * FROM loop_artifact_current WHERE run_id = ?",
        ).all(runId) as ArtifactCurrentRow[];
        for (const pointerRow of pointerRows) {
          const revision = revisionById.get(pointerRow.revision_id);
          if (revision === undefined) {
            corrupt("current artifact pointer target is missing");
          }
          currentValidityByNode.set(pointerRow.node_id, revision.validity);
        }
        return computeFindingGateFromFacts(findings, currentValidityByNode);
      })() as LoopFindingGateResult;
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      if (isBusyCode(sqliteErrorCode(error))) busy();
      storageFailure();
    }
  }

  /**
   * OPEN → RESOLVED: the target must be OPEN; resolvedByRevisionId must exist
   * in-run, belong to earliestAffectedNodeId or a downstream node, and be that
   * node's CURRENT ACTIVE revision; resolution evidence ref/digest are
   * required. The transition is a guarded UPDATE with the canonical hash
   * recomputed; concurrent drift surfaces as STORE_CORRUPT.
   */
  resolveFinding(
    runId: string,
    findingId: string,
    resolution: unknown,
  ): FindingTransitionResult {
    safeIdInput(runId, "runId");
    safeIdInput(findingId, "findingId");
    const valid = validateLoopFindingResolution(resolution);
    const db = this.connection();
    try {
      return db.transaction((): FindingTransitionResult => {
        const findings = this.readFindingsForTransitionInTransaction(db, runId);
        const target = findings.find((item) => item.findingId === findingId);
        if (target === undefined) {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "no matching finding exists");
        }
        if (target.status !== "OPEN") {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "only an open finding can be resolved");
        }
        const verifiedRequirementId = target.requirementId;
        const revisions = this.readArtifactRevisionsInTransaction(db, runId, verifiedRequirementId);
        const resolvedBy = revisions.find((item) => item.revisionId === valid.resolvedByRevisionId);
        if (resolvedBy === undefined) {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "resolution revision does not exist in the run");
        }
        if (
          NODE_CAPABILITY_IDS.indexOf(resolvedBy.nodeId) <
          NODE_CAPABILITY_IDS.indexOf(target.earliestAffectedNodeId)
        ) {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "resolution revision is upstream of the earliest affected node");
        }
        const pointer = db.prepare(
          "SELECT revision_id FROM loop_artifact_current WHERE run_id = ? AND node_id = ?",
        ).get(runId, resolvedBy.nodeId) as { revision_id?: unknown } | undefined;
        if (pointer === undefined || pointer.revision_id !== resolvedBy.revisionId || resolvedBy.validity !== "ACTIVE") {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "resolution revision must be the current active revision of its node");
        }
        this.verifyFindingEvidenceBlob(valid.resolutionEvidenceRef, valid.resolutionEvidenceDigest, "append");
        const resolved = resolveLoopFinding(target, valid);
        const updateResult = db.prepare(
          `UPDATE loop_findings SET
            status = ?, resolved_by_revision_id = ?, resolution_evidence_ref = ?,
            resolution_evidence_digest = ?, canonical_sha256 = ?
          WHERE finding_id = ? AND status = ?`,
        ).run(
          "RESOLVED", resolved.resolvedByRevisionId, resolved.resolutionEvidenceRef,
          resolved.resolutionEvidenceDigest, sha256Hex(canonicalizeLoopFinding(resolved)),
          findingId, "OPEN",
        );
        if (updateResult.changes !== 1) {
          corrupt("finding drifted during resolution");
        }
        // Persist the durable closure proof in the same transaction: the
        // resolving revision's immutable content binding (node + artifact
        // ref + digest) is captured so read-back can re-verify the binding
        // even after the revision legitimately leaves ACTIVE.
        insertFindingProofRow(
          db,
          createLoopFindingResolutionProof(resolved, valid, resolvedBy),
          runId,
        );
        return Object.freeze({ record: resolved });
      }).immediate() as FindingTransitionResult;
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      if (isBusyCode(sqliteErrorCode(error))) busy();
      storageFailure();
    }
  }

  /**
   * OPEN → ACCEPTED_RISK: the target must be OPEN and must not be CRITICAL
   * (critical findings are never risk-acceptable); riskAcceptedBy and the
   * risk acceptance evidence ref/digest are required. Same guarded-UPDATE
   * discipline as resolveFinding.
   */
  acceptFindingRisk(
    runId: string,
    findingId: string,
    acceptance: unknown,
  ): FindingTransitionResult {
    safeIdInput(runId, "runId");
    safeIdInput(findingId, "findingId");
    const valid = validateLoopFindingRiskAcceptance(acceptance);
    const db = this.connection();
    try {
      return db.transaction((): FindingTransitionResult => {
        const findings = this.readFindingsForTransitionInTransaction(db, runId);
        const target = findings.find((item) => item.findingId === findingId);
        if (target === undefined) {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "no matching finding exists");
        }
        if (target.status !== "OPEN") {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "only an open finding can be risk-accepted");
        }
        if (target.severity === "CRITICAL") {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "critical findings are not risk-acceptable");
        }
        this.verifyFindingEvidenceBlob(
          valid.riskAcceptanceEvidenceRef,
          valid.riskAcceptanceEvidenceDigest,
          "append",
        );
        const accepted = acceptLoopFindingRisk(target, valid);
        const updateResult = db.prepare(
          `UPDATE loop_findings SET
            status = ?, risk_accepted_by = ?, risk_acceptance_evidence_ref = ?,
            risk_acceptance_evidence_digest = ?, risk_accepted_scope_id = ?,
            canonical_sha256 = ?
          WHERE finding_id = ? AND status = ?`,
        ).run(
          "ACCEPTED_RISK", accepted.riskAcceptedBy, accepted.riskAcceptanceEvidenceRef,
          accepted.riskAcceptanceEvidenceDigest, accepted.riskAcceptedScopeId,
          sha256Hex(canonicalizeLoopFinding(accepted)),
          findingId, "OPEN",
        );
        if (updateResult.changes !== 1) {
          corrupt("finding drifted during risk acceptance");
        }
        // Persist the durable risk-acceptance proof in the same transaction
        // so read-back can re-verify the acceptor and the evidence binding.
        insertFindingProofRow(
          db,
          createLoopFindingRiskAcceptanceProof(accepted, valid),
          runId,
        );
        return Object.freeze({ record: accepted });
      }).immediate() as FindingTransitionResult;
      // W-GW-DIAG P-K-d (Decision-083): mark the decision in the run event
      // stream — the first-class fact the chain validator admits canonical
      // forward on (reasonCode = the verdict decisionScopeId; scope binding
      // and hash-verified acceptance evidence live in the finding proof rows
      // persisted above).
      const snapshot = this.getSnapshot(runId);
      if (snapshot !== undefined) {
        this.appendEvent(Object.freeze({
          eventId: `${runId}:${snapshot.state.lastSequence + 1}:risk_accepted`,
          runId,
          sequence: snapshot.state.lastSequence + 1,
          kind: "risk_accepted",
          stage: null,
          attempt: 0,
          createdAt: new Date().toISOString(),
          inputDigest: null,
          outputArtifactRef: null,
          outputDigest: null,
          errorCode: null,
          retryable: null,
          reasonCode: valid.decisionScopeId,
          bindingId: null,
          bindingVersion: null,
          inputArtifactRef: null,
        }));
      }
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      if (isBusyCode(sqliteErrorCode(error))) busy();
      storageFailure();
    }
  }

  /**
   * OPEN / RESOLVED / ACCEPTED_RISK → SUPERSEDED: the target must exist and
   * not already be SUPERSEDED; the superseding finding must exist in the same
   * run and follow the target in the chain. The transition backfills
   * supersededBy and clears any prior closure fields so every status keeps
   * exactly one canonical field shape. Same guarded-UPDATE discipline.
   */
  supersedeFinding(
    runId: string,
    findingId: string,
    supersedingFindingId: string,
  ): FindingTransitionResult {
    safeIdInput(runId, "runId");
    safeIdInput(findingId, "findingId");
    safeIdInput(supersedingFindingId, "supersedingFindingId");
    const db = this.connection();
    try {
      return db.transaction((): FindingTransitionResult => {
        const findings = this.readFindingsForTransitionInTransaction(db, runId);
        const target = findings.find((item) => item.findingId === findingId);
        if (target === undefined) {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "no matching finding exists");
        }
        if (target.status === "SUPERSEDED") {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "a superseded finding cannot be superseded again");
        }
        const superseding = findings.find((item) => item.findingId === supersedingFindingId);
        if (superseding === undefined) {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "superseding finding does not exist in the run");
        }
        if (superseding.sequence <= target.sequence) {
          throw new LoopRunJournalError("ILLEGAL_TRANSITION", "superseding finding must follow the superseded finding");
        }
        const superseded = supersedeLoopFinding(target, supersedingFindingId);
        const updateResult = db.prepare(
          `UPDATE loop_findings SET
            status = ?, resolved_by_revision_id = ?, resolution_evidence_ref = ?,
            resolution_evidence_digest = ?, risk_accepted_by = ?,
            risk_acceptance_evidence_ref = ?, risk_acceptance_evidence_digest = ?,
            risk_accepted_scope_id = ?,
            superseded_by = ?, canonical_sha256 = ?
          WHERE finding_id = ? AND status != ?`,
        ).run(
          "SUPERSEDED", null, null, null, null, null, null, null,
          superseded.supersededBy,
          sha256Hex(canonicalizeLoopFinding(superseded)), findingId, "SUPERSEDED",
        );
        if (updateResult.changes !== 1) {
          corrupt("finding drifted during supersede");
        }
        // Superseding clears the closure fields, so the closure proof must
        // not survive: a SUPERSEDED finding carries no proof.
        db.prepare("DELETE FROM loop_finding_proofs WHERE finding_id = ?").run(findingId);
        return Object.freeze({ record: superseded });
      }).immediate() as FindingTransitionResult;
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      if (isBusyCode(sqliteErrorCode(error))) busy();
      storageFailure();
    }
  }

  /**
   * Shared prologue for the finding status transitions: verified snapshot,
   * non-terminal run, no active stage or capability execution, then the
   * verified finding chain — all inside the caller's immediate transaction.
   */
  private readFindingsForTransitionInTransaction(
    db: Database.Database,
    runId: string,
  ): readonly LoopFinding[] {
    const snapshot = this.readRunSnapshotInTransaction(db, runId);
    if (snapshot === undefined) {
      throw new LoopRunJournalError("RUN_NOT_FOUND", "run does not exist");
    }
    const status = snapshot.state.status;
    if (status === "completed" || status === "failed" || status === "cancelled") {
      throw new LoopRunJournalError("ILLEGAL_TRANSITION", "terminal run must not transition findings");
    }
    if (snapshot.state.currentStage !== null) {
      throw new LoopRunJournalError("ILLEGAL_TRANSITION", "finding transitions require no active delivery stage");
    }
    const capabilityExecutions = this.readCapabilityExecutionsInTransaction(db, runId);
    if (capabilityExecutions[capabilityExecutions.length - 1]?.status === "started") {
      throw new LoopRunJournalError("ILLEGAL_TRANSITION", "finding transitions cannot advance while a capability execution is active");
    }
    return this.readFindingsInTransaction(db, runId, snapshot.state.identity.requirementId);
  }


  // ── storage error translation ──

  /**
   * translateWriterError is the single storage translation boundary for
   * writer operations. The reclassification callback is also guarded within
   * a safe storage translation — it must not leak raw SQLite exceptions.
   */
  private translateWriterError(
    error: unknown,
    reclassifyConstraint: () => LoopRunSnapshot,
  ): LoopRunState {
    if (error instanceof LoopRunJournalError) throw error;
    const code = sqliteErrorCode(error);
    if (isBusyCode(code)) busy();
    if (isConstraintCode(code)) {
      try {
        const snapshot = reclassifyConstraint();
        return snapshot.state;
      } catch (reclassifyError) {
        // Reclassification callback errors are already translated by the
        // callback itself. Any raw error escaping is translated to STORE_FAILURE.
        if (reclassifyError instanceof LoopRunJournalError) throw reclassifyError;
        storageFailure();
      }
    }
    storageFailure();
  }

  // ── verified snapshot (single read implementation) ──

  private readSnapshot(runId: string): LoopRunSnapshot | undefined {
    const db = this.connection();
    try {
      return db.transaction((): LoopRunSnapshot | undefined => {
        const row = db.prepare("SELECT * FROM loop_runs WHERE run_id = ?").get(runId) as RunRow | undefined;
        if (row === undefined) return undefined;
        return this.verifySnapshotInTransaction(db, row);
      })() as LoopRunSnapshot | undefined;
    } catch (error) {
      if (error instanceof LoopRunJournalError) throw error;
      if (isBusyCode(sqliteErrorCode(error))) busy();
      storageFailure();
    }
  }

  private snapshotInTransaction(db: Database.Database, runId: string): LoopRunSnapshot {
    const row = db.prepare("SELECT * FROM loop_runs WHERE run_id = ?").get(runId) as RunRow | undefined;
    if (row === undefined) corrupt("run row missing inside writer transaction");
    return this.verifySnapshotInTransaction(db, row);
  }

  private readRunSnapshotInTransaction(db: Database.Database, runId: string): LoopRunSnapshot | undefined {
    const row = db.prepare("SELECT * FROM loop_runs WHERE run_id = ?").get(runId) as RunRow | undefined;
    if (row === undefined) return undefined;
    return this.verifySnapshotInTransaction(db, row);
  }

  private insertEventRow(db: Database.Database, row: EventRow): void {
    db.prepare(
      `INSERT INTO loop_events (
        event_id, run_id, sequence, kind, stage, attempt, created_at,
        input_digest, output_artifact_ref, output_digest, error_code,
        retryable, reason_code, binding_id, binding_version,
        input_artifact_ref, canonical_sha256
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      row.event_id,
      row.run_id,
      row.sequence,
      row.kind,
      row.stage,
      row.attempt,
      row.created_at,
      row.input_digest,
      row.output_artifact_ref,
      row.output_digest,
      row.error_code,
      row.retryable,
      row.reason_code,
      row.binding_id,
      row.binding_version,
      row.input_artifact_ref,
      row.canonical_sha256,
    );
  }

  private insertCapabilityExecutionRow(db: Database.Database, row: CapabilityExecutionRow): void {
    db.prepare(
      `INSERT INTO loop_capability_executions (
        execution_event_id, run_id, sequence, schema_version, capability,
        execution_role, node_id, attempt, status, created_at, binding_id,
        binding_version, binding_registry_version, executor_agent,
        executor_adapter, executor_version, input_artifact_ref,
        input_artifact_version, input_digest, output_artifact_ref,
        output_artifact_version, output_digest, gate_result,
        unresolved_findings_ref, unresolved_findings_digest,
        consumed_findings_ref, consumed_findings_digest,
        decision_depth, decision_scope_id, decision_delta_ref,
        decision_delta_digest,
        next_step_eligibility, error_code, retryable, reason_code,
        process_invocation_digest, process_exit_code, process_signal,
        process_duration_ms, process_truncated, staging_ref, staging_digest,
        promotion_ref, promotion_digest, human_action_ref,
        canonical_sha256
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )`,
    ).run(
      row.execution_event_id, row.run_id, row.sequence, row.schema_version,
      row.capability, row.execution_role, row.node_id, row.attempt, row.status,
      row.created_at, row.binding_id, row.binding_version,
      row.binding_registry_version, row.executor_agent, row.executor_adapter,
      row.executor_version, row.input_artifact_ref, row.input_artifact_version,
      row.input_digest, row.output_artifact_ref, row.output_artifact_version,
      row.output_digest, row.gate_result, row.unresolved_findings_ref,
      row.unresolved_findings_digest, row.consumed_findings_ref,
      row.consumed_findings_digest, row.decision_depth,
      row.decision_scope_id, row.decision_delta_ref,
      row.decision_delta_digest, row.next_step_eligibility, row.error_code,
      row.retryable, row.reason_code, row.process_invocation_digest,
      row.process_exit_code, row.process_signal, row.process_duration_ms,
      row.process_truncated, row.staging_ref, row.staging_digest,
      row.promotion_ref, row.promotion_digest, row.human_action_ref,
      row.canonical_sha256,
    );
  }

  /**
   * WP4: derive the chain-validation context from journal facts inside the
   * caller's transaction. `allowedRestartTargetIndex` is the LIVE pending
   * Re-Gate target (append-time strictness); `historicalFindings` enables
   * read-path re-validation of already-recorded restarts against immutable
   * finding facts. Pure journal data — no skill surface, no caller input.
   */
  /** Per-point MAX(attempt) for Re-Gate mid-wave role refinement (WP4). */
  private regatePointLastAttempts(
    db: Database.Database,
    runId: string,
  ): Map<string, number> {
    const rows = db.prepare(
      `SELECT capability, execution_role, MAX(attempt) AS last_attempt
       FROM loop_capability_executions WHERE run_id = ?
       GROUP BY capability, execution_role`,
    ).all(runId) as ReadonlyArray<{
      capability: string;
      execution_role: string;
      last_attempt: number;
    }>;
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(`${row.capability}:${row.execution_role}`, row.last_attempt);
    }
    return map;
  }

  private regateChainContextInTransaction(
    db: Database.Database,
    runId: string,
  ): {
    allowedRestartTargetIndex: number | null;
    historicalFindings: RegateFindingFacts[];
    feedbackChange: { previousGeneration: number } | null;
    acceptedRiskScopes?: readonly string[];
  } {
    // W-GW-DIAG P-K-d (Decision-083): decision scopes carrying a human
    // ACCEPTED_RISK decision, derived from the finding rows (raw, in the
    // same recursion-safe reduced-facts discipline as above).
    const acceptedScopeRows = db.prepare(
      `SELECT DISTINCT risk_accepted_scope_id AS scope FROM loop_findings
       WHERE run_id = ? AND status = 'ACCEPTED_RISK' AND risk_accepted_scope_id IS NOT NULL`,
    ).all(runId) as ReadonlyArray<{ scope: string }>;
    const acceptedRiskScopes = acceptedScopeRows.map((row) => row.scope);
    // NOTE: deliberately avoids the validating readers (readFindings… /
    // readRunSnapshot… / readArtifactRevisions…) — findings reading pulls
    // artifact revisions, revisions reading validates the capability chain,
    // and the capability chain now validates against this helper's facts:
    // using them here would close an infinite reader recursion. The reduced
    // facts below are raw rows; full validation stays with the callers.
    const runRow = db.prepare(
      "SELECT requirement_id FROM loop_runs WHERE run_id = ?",
    ).get(runId) as { requirement_id?: string } | undefined;
    if (runRow === undefined) {
      return { allowedRestartTargetIndex: null, historicalFindings: [], feedbackChange: null, acceptedRiskScopes: [] };
    }
    const findingRows = db.prepare(
      `SELECT f.finding_id AS finding_id, f.severity AS severity, f.status AS status,
              f.earliest_affected_node_id AS earliest_affected_node_id,
              f.cause_kind AS cause_kind, f.introduced_by_revision_id AS introduced_by_revision_id,
              f.created_at AS created_at
       FROM loop_findings f
       WHERE f.run_id = ? ORDER BY f.sequence ASC`,
    ).all(runId) as ReadonlyArray<{
      finding_id: string;
      severity: string;
      status: string;
      earliest_affected_node_id: string;
      cause_kind: string;
      introduced_by_revision_id: string | null;
      created_at: string;
    }>;
    const historicalFindings: RegateFindingFacts[] = findingRows.map((row) => ({
      findingId: row.finding_id,
      severity: row.severity,
      status: row.status,
      earliestAffectedNodeId: row.earliest_affected_node_id as RegateFindingFacts["earliestAffectedNodeId"],
      causeKind: row.cause_kind as RegateFindingFacts["causeKind"],
      createdAt: row.created_at,
    }));
    const currentByNode = new Map<NodeCapabilityId, CurrentRevisionFacts>();
    const pointerRows = db.prepare(
      `SELECT c.node_id AS node_id, r.validity AS validity, r.generation AS generation
       FROM loop_artifact_current c
       JOIN loop_artifact_revisions r ON r.revision_id = c.revision_id
       WHERE c.run_id = ?`,
    ).all(runId) as ReadonlyArray<{ node_id: string; validity: string; generation: number | null }>;
    for (const row of pointerRows) {
      currentByNode.set(row.node_id as NodeCapabilityId, {
        validity: row.validity,
        generation: row.generation === null ? null : Number(row.generation),
      });
    }
    const feedbackRow = db.prepare(
      `SELECT previous_generation FROM loop_requirement_changes
       WHERE run_id = ? AND change_kind = 'FEEDBACK_DRIVEN_CHANGE' AND status = 'CLASSIFIED'
         AND previous_generation IS NOT NULL
       ORDER BY sequence DESC LIMIT 1`,
    ).get(runId) as { previous_generation?: number | null } | undefined;
    const feedbackChange =
      feedbackRow === undefined || feedbackRow.previous_generation === null
        ? null
        : { previousGeneration: Number(feedbackRow.previous_generation) };
    const plan = planRegateFromFacts(
      historicalFindings,
      currentByNode,
      this.regatePointLastAttempts(db, runId),
      feedbackChange,
    );
    return {
      acceptedRiskScopes,
      allowedRestartTargetIndex: plan.kind === "regate" ? plan.restartPointIndex : null,
      historicalFindings,
      feedbackChange,
    };
  }

  private readCapabilityExecutionsInTransaction(
    db: Database.Database,
    runId: string,
  ): readonly LoopCapabilityExecutionEvent[] {
    const rows = db.prepare(
      "SELECT * FROM loop_capability_executions WHERE run_id = ? ORDER BY sequence ASC",
    ).all(runId) as CapabilityExecutionRow[];
    const events = rows.map((row) => {
      const event = rowToCapabilityExecution(row);
      try {
        validateLoopCapabilityExecutionEvent(event);
        if (sha256Hex(canonicalizeLoopCapabilityExecutionEvent(event)) !== row.canonical_sha256) {
          corrupt("capability execution canonical hash mismatch");
        }
      } catch (error) {
        if (error instanceof LoopRunJournalError && error.code === "STORE_CORRUPT") throw error;
        if (error instanceof LoopRunJournalError) corrupt("persisted capability execution is invalid");
        throw error;
      }
      // Round 2 close-out B1 (re-review): a persisted materialized decision
      // must remain physically reproducible — every validating read of an
      // event carrying a decision delta re-reads the blob when an artifact
      // store is bound (append-time verification alone cannot cover later
      // deletion or content drift). Mapping matches verifyRevisionBlob:
      // missing/drifted or corrupt blob content is STORE_CORRUPT; only
      // genuine I/O faults surface as STORE_FAILURE.
      if (
        event.decisionDeltaRef !== null && event.decisionDeltaDigest !== null &&
        this.artifactStore !== null
      ) {
        this.verifyDecisionDeltaBlob(event.decisionDeltaRef, event.decisionDeltaDigest, "read");
      }
      return event;
    });
    try {
      const regateContext = this.regateChainContextInTransaction(db, runId);
      validateLoopCapabilityExecutionChain(events, runId, {
        acceptedRiskScopes: regateContext.acceptedRiskScopes,
        historicalFindings: regateContext.historicalFindings,
        historicalReplayMode: true,
        feedbackChange: regateContext.feedbackChange,
      });
    } catch (error) {
      if (error instanceof LoopRunJournalError) {
        corrupt("persisted capability execution chain is invalid");
      }
      throw error;
      throw error;
    }
    return Object.freeze(events);
  }

  /**
   * Verifies the base run/state/event tables against the exact v6 DDL. There
   * is no migration path: any drift inside a declared-v6 database is
   * STORE_CORRUPT.
   */
  private verifyBaseTablesSchema(db: Database.Database): void {
    verifyTableColumns(db, "loop_runs", "run table", [
      ["run_id", "TEXT", 0, 1], ["requirement_id", "TEXT", 1, 0],
      ["repository", "TEXT", 1, 0], ["repository_path", "TEXT", 1, 0],
      ["base_branch", "TEXT", 1, 0], ["expected_base_sha", "TEXT", 1, 0],
      ["task_branch", "TEXT", 1, 0], ["control_root", "TEXT", 1, 0],
      ["status", "TEXT", 1, 0], ["current_stage", "TEXT", 0, 0],
      ["current_attempt", "INTEGER", 1, 0], ["fix_round", "INTEGER", 1, 0],
      ["last_sequence", "INTEGER", 1, 0], ["last_event_id", "TEXT", 1, 0],
      ["blocking_reason_code", "TEXT", 0, 0], ["failure_reason_code", "TEXT", 0, 0],
      ["created_at", "TEXT", 1, 0], ["updated_at", "TEXT", 1, 0],
      ["identity_sha256", "TEXT", 1, 0],
    ]);
    const statusIndex = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_loop_runs_status'",
    ).get();
    if (statusIndex === undefined) corrupt("run status index is missing");
    verifyTableColumns(db, "loop_stage_states", "stage state table", [
      ["run_id", "TEXT", 1, 1], ["stage", "TEXT", 1, 2],
      ["status", "TEXT", 1, 0], ["attempt", "INTEGER", 1, 0],
      ["updated_at", "TEXT", 1, 0],
    ]);
    verifyTableForeignKeys(db, "loop_stage_states", "stage state table", [
      { from: "run_id", references: "loop_runs", to: "run_id" },
    ]);
    verifyTableColumns(db, "loop_events", "event table", [
      ["event_id", "TEXT", 0, 1], ["run_id", "TEXT", 1, 0],
      ["sequence", "INTEGER", 1, 0], ["kind", "TEXT", 1, 0],
      ["stage", "TEXT", 0, 0], ["attempt", "INTEGER", 1, 0],
      ["created_at", "TEXT", 1, 0], ["input_digest", "TEXT", 0, 0],
      ["output_artifact_ref", "TEXT", 0, 0], ["output_digest", "TEXT", 0, 0],
      ["error_code", "TEXT", 0, 0], ["retryable", "INTEGER", 0, 0],
      ["reason_code", "TEXT", 0, 0], ["binding_id", "TEXT", 0, 0],
      ["binding_version", "TEXT", 0, 0], ["input_artifact_ref", "TEXT", 0, 0],
      ["canonical_sha256", "TEXT", 1, 0],
    ]);
    verifyUniqueIndex(db, "loop_events", "event table", ["run_id", "sequence"]);
    verifyTableForeignKeys(db, "loop_events", "event table", [
      { from: "run_id", references: "loop_runs", to: "run_id" },
    ]);
    const eventIndex = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_loop_events_run_id'",
    ).get();
    if (eventIndex === undefined) corrupt("event run index is missing");
    const tableSql = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'loop_events'",
    ).get() as { sql?: unknown } | undefined;
    if (
      typeof tableSql?.sql !== "string" ||
      !tableSql.sql.includes("CHECK (retryable IS NULL OR retryable IN (0, 1))")
    ) {
      corrupt("event retryable constraint is missing");
    }
  }

  private readRequirementChangesInTransaction(
    db: Database.Database,
    runId: string,
    verifiedRequirementId: string,
  ): readonly LoopRequirementChangeRecord[] {
    const rows = db.prepare(
      "SELECT * FROM loop_requirement_changes WHERE run_id = ? ORDER BY sequence ASC",
    ).all(runId) as RequirementChangeRow[];
    const records = rows.map((row) => {
      const record = rowToRequirementChange(db, row);
      try {
        validateLoopRequirementChangeRecord(record);
        if (sha256Hex(canonicalizeLoopRequirementChangeRecord(record)) !== row.canonical_sha256) {
          corrupt("requirement change canonical hash mismatch");
        }
      } catch (error) {
        if (error instanceof LoopRunJournalError && error.code === "STORE_CORRUPT") throw error;
        if (error instanceof LoopRunJournalError) corrupt("persisted requirement change is invalid");
        throw error;
      }
      return record;
    });
    // Cross-bind every record to the owning run identity: the canonical hash
    // only proves a record is internally consistent, so a tampered row with a
    // recomputed hash must still fail closed when its requirementId drifts
    // from the verified run identity. The identity is ALWAYS supplied by the
    // caller from a snapshot verified inside the same transaction — the
    // persisted loop_runs.requirement_id column is never re-queried here, so
    // a verified snapshot and the returned records cannot drift apart.
    for (const record of records) {
      if (record.requirementId !== verifiedRequirementId) {
        corrupt("requirement change does not match the run identity");
      }
    }
    try {
      validateLoopRequirementChangeChain(records, runId);
    } catch (error) {
      if (error instanceof LoopRunJournalError) corrupt("persisted requirement change chain is invalid");
      throw error;
    }
    return Object.freeze(records);
  }

  private verifyRequirementChangeTablesSchema(db: Database.Database): void {
    const verifyColumns = (
      table: string,
      expected: ReadonlyArray<readonly [string, string, number, number]>,
    ): void => verifyTableColumns(db, table, "requirement change table", expected);
    const verifyForeignKey = (table: string, from: string, referenced: string, to: string): void =>
      verifyTableForeignKeys(db, table, "requirement change table", [{ from, references: referenced, to }]);
    verifyColumns("loop_requirement_changes", [
      ["change_record_id", "TEXT", 0, 1], ["run_id", "TEXT", 1, 0],
      ["requirement_id", "TEXT", 1, 0], ["sequence", "INTEGER", 1, 0],
      ["schema_version", "INTEGER", 1, 0], ["status", "TEXT", 1, 0],
      ["change_kind", "TEXT", 0, 0], ["payload_form", "TEXT", 0, 0],
      ["previous_generation", "INTEGER", 0, 0], ["current_change_scope", "TEXT", 0, 0],
      ["classification_reason", "TEXT", 1, 0], ["blocked_reason_code", "TEXT", 0, 0],
      ["created_at", "TEXT", 1, 0], ["canonical_sha256", "TEXT", 1, 0],
    ]);
    verifyUniqueIndex(db, "loop_requirement_changes", "requirement change table", ["run_id", "sequence"]);
    verifyForeignKey("loop_requirement_changes", "run_id", "loop_runs", "run_id");
    for (const indexName of [
      "idx_loop_requirement_changes_run_id",
      "idx_loop_requirement_changes_requirement_id",
    ]) {
      const index = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?",
      ).get(indexName);
      if (index === undefined) corrupt("requirement change index is missing");
    }
    verifyColumns("loop_change_source_refs", [
      ["change_record_id", "TEXT", 1, 1], ["source_index", "INTEGER", 1, 2],
      ["source_type", "TEXT", 1, 0], ["locator", "TEXT", 1, 0],
      ["priority", "INTEGER", 1, 0], ["source_version", "TEXT", 0, 0],
      ["observed_at", "TEXT", 1, 0],
    ]);
    verifyForeignKey("loop_change_source_refs", "change_record_id", "loop_requirement_changes", "change_record_id");
    verifyColumns("loop_change_confirmed_facts", [
      ["change_record_id", "TEXT", 1, 1], ["fact_index", "INTEGER", 1, 2],
      ["fact", "TEXT", 1, 0],
    ]);
    verifyForeignKey("loop_change_confirmed_facts", "change_record_id", "loop_requirement_changes", "change_record_id");
    verifyColumns("loop_change_trigger_evidence", [
      ["change_record_id", "TEXT", 1, 1], ["evidence_index", "INTEGER", 1, 2],
      ["evidence_ref", "TEXT", 1, 0],
    ]);
    verifyForeignKey("loop_change_trigger_evidence", "change_record_id", "loop_requirement_changes", "change_record_id");
  }

  private verifyArtifactRevisionTablesSchema(db: Database.Database): void {
    verifyTableColumns(db, "loop_artifact_revisions", "artifact revision table", [
      ["revision_id", "TEXT", 0, 1], ["run_id", "TEXT", 1, 0],
      ["requirement_id", "TEXT", 1, 0], ["node_id", "TEXT", 1, 0],
      ["sequence", "INTEGER", 1, 0], ["schema_version", "INTEGER", 1, 0],
      ["generation", "INTEGER", 0, 0], ["stable_path", "TEXT", 1, 0],
      ["artifact_kind", "TEXT", 1, 0], ["semver", "TEXT", 1, 0],
      ["artifact_ref", "TEXT", 1, 0], ["digest", "TEXT", 1, 0],
      ["producer_execution_id", "TEXT", 1, 0],
      ["producer_execution_role", "TEXT", 1, 0], ["gate_result", "TEXT", 0, 0],
      ["validity", "TEXT", 1, 0], ["superseded_by", "TEXT", 0, 0],
      ["created_at", "TEXT", 1, 0], ["canonical_sha256", "TEXT", 1, 0],
    ]);
    verifyUniqueIndex(db, "loop_artifact_revisions", "artifact revision table", ["run_id", "node_id", "sequence"]);
    verifyUniqueIndex(db, "loop_artifact_revisions", "artifact revision table", ["run_id", "node_id", "semver"]);
    verifyTableForeignKeys(db, "loop_artifact_revisions", "artifact revision table", [
      { from: "run_id", references: "loop_runs", to: "run_id" },
    ]);
    for (const indexName of [
      "idx_loop_artifact_revisions_run_id",
      "idx_loop_artifact_revisions_node_id",
    ]) {
      const index = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?",
      ).get(indexName);
      if (index === undefined) corrupt("artifact revision index is missing");
    }
    verifyTableColumns(db, "loop_artifact_revision_upstreams", "artifact revision table", [
      ["revision_id", "TEXT", 1, 1], ["upstream_index", "INTEGER", 1, 2],
      ["upstream_revision_id", "TEXT", 1, 0],
    ]);
    verifyTableForeignKeys(db, "loop_artifact_revision_upstreams", "artifact revision table", [
      { from: "revision_id", references: "loop_artifact_revisions", to: "revision_id" },
    ]);
    verifyTableColumns(db, "loop_artifact_current", "artifact revision table", [
      ["run_id", "TEXT", 1, 1], ["node_id", "TEXT", 1, 2],
      ["revision_id", "TEXT", 1, 0], ["updated_at", "TEXT", 1, 0],
    ]);
    verifyTableForeignKeys(db, "loop_artifact_current", "artifact revision table", [
      { from: "run_id", references: "loop_runs", to: "run_id" },
      { from: "revision_id", references: "loop_artifact_revisions", to: "revision_id" },
    ]);
  }

  private verifyFindingTablesSchema(db: Database.Database): void {
    verifyTableColumns(db, "loop_findings", "finding table", [
      ["finding_id", "TEXT", 0, 1], ["run_id", "TEXT", 1, 0],
      ["requirement_id", "TEXT", 1, 0], ["sequence", "INTEGER", 1, 0],
      ["source_capability", "TEXT", 1, 0], ["source_revision_id", "TEXT", 1, 0],
      ["cause_kind", "TEXT", 1, 0], ["introduced_by_revision_id", "TEXT", 0, 0],
      ["severity", "TEXT", 1, 0], ["category", "TEXT", 1, 0],
      ["evidence_ref", "TEXT", 1, 0], ["evidence_digest", "TEXT", 1, 0],
      ["earliest_affected_node_id", "TEXT", 1, 0], ["status", "TEXT", 1, 0],
      ["resolved_by_revision_id", "TEXT", 0, 0],
      ["resolution_evidence_ref", "TEXT", 0, 0],
      ["resolution_evidence_digest", "TEXT", 0, 0],
      ["risk_accepted_by", "TEXT", 0, 0],
      ["risk_acceptance_evidence_ref", "TEXT", 0, 0],
      ["risk_acceptance_evidence_digest", "TEXT", 0, 0],
      ["risk_accepted_scope_id", "TEXT", 0, 0],
      ["superseded_by", "TEXT", 0, 0],
      ["created_at", "TEXT", 1, 0], ["canonical_sha256", "TEXT", 1, 0],
    ]);
    verifyUniqueIndex(db, "loop_findings", "finding table", ["run_id", "sequence"]);
    verifyTableForeignKeys(db, "loop_findings", "finding table", [
      { from: "run_id", references: "loop_runs", to: "run_id" },
      { from: "source_revision_id", references: "loop_artifact_revisions", to: "revision_id" },
    ]);
    const runIndex = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_loop_findings_run_id'",
    ).get();
    if (runIndex === undefined) corrupt("finding run index is missing");
    verifyTableColumns(db, "loop_finding_invalidations", "finding table", [
      ["finding_id", "TEXT", 1, 1], ["invalidation_index", "INTEGER", 1, 2],
      ["revision_id", "TEXT", 1, 0], ["node_id", "TEXT", 1, 0],
    ]);
    verifyTableForeignKeys(db, "loop_finding_invalidations", "finding table", [
      { from: "finding_id", references: "loop_findings", to: "finding_id" },
      { from: "revision_id", references: "loop_artifact_revisions", to: "revision_id" },
    ]);
    verifyTableColumns(db, "loop_finding_proofs", "finding proof table", [
      ["finding_id", "TEXT", 0, 1], ["proof_kind", "TEXT", 1, 0],
      ["revision_id", "TEXT", 0, 0], ["revision_node_id", "TEXT", 0, 0],
      ["revision_artifact_ref", "TEXT", 0, 0],
      ["revision_artifact_digest", "TEXT", 0, 0],
      ["evidence_ref", "TEXT", 1, 0], ["evidence_digest", "TEXT", 1, 0],
      ["risk_accepted_by", "TEXT", 0, 0],
      ["risk_accepted_scope_id", "TEXT", 0, 0],
      ["canonical_sha256", "TEXT", 1, 0],
    ]);
    verifyTableForeignKeys(db, "loop_finding_proofs", "finding proof table", [
      { from: "finding_id", references: "loop_findings", to: "finding_id" },
      { from: "revision_id", references: "loop_artifact_revisions", to: "revision_id" },
    ]);
    const proofTableSql = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'loop_finding_proofs'",
    ).get() as { sql?: unknown } | undefined;
    if (
      typeof proofTableSql?.sql !== "string" ||
      !proofTableSql.sql.includes("CHECK (proof_kind IN ('RESOLUTION', 'RISK_ACCEPTANCE'))")
    ) {
      corrupt("finding proof table kind constraint is missing");
    }
    verifyTableColumns(db, "loop_finding_scopes", "finding scope table", [
      ["finding_id", "TEXT", 0, 1], ["edge_count", "INTEGER", 1, 0],
      ["scope_digest", "TEXT", 1, 0], ["canonical_sha256", "TEXT", 1, 0],
    ]);
    verifyTableForeignKeys(db, "loop_finding_scopes", "finding scope table", [
      { from: "finding_id", references: "loop_findings", to: "finding_id" },
    ]);
  }

  /**
   * Read and verify the complete artifact revision set for one run. Beyond
   * per-record validation and canonical hash recomputation, every record is
   * cross-bound to the verified run identity, the chain rules are enforced,
   * and the current pointer table is checked bidirectionally: each pointer
   * must target the latest revision of its node and every node chain must
   * have exactly one pointer.
   */
  private readArtifactRevisionsInTransaction(
    db: Database.Database,
    runId: string,
    verifiedRequirementId: string,
  ): readonly LoopArtifactRevision[] {
    const rows = db.prepare(
      "SELECT * FROM loop_artifact_revisions WHERE run_id = ? ORDER BY node_id ASC, sequence ASC",
    ).all(runId) as ArtifactRevisionRow[];
    const records = rows.map((row) => {
      const record = rowToArtifactRevision(db, row);
      try {
        validateLoopArtifactRevision(record);
        if (sha256Hex(canonicalizeLoopArtifactRevision(record)) !== row.canonical_sha256) {
          corrupt("artifact revision canonical hash mismatch");
        }
      } catch (error) {
        if (error instanceof LoopRunJournalError && error.code === "STORE_CORRUPT") throw error;
        if (error instanceof LoopRunJournalError) corrupt("persisted artifact revision is invalid");
        throw error;
      }
      return record;
    });
    // Cross-bind every revision to the owning run identity: the canonical
    // hash only proves a revision is internally consistent, so a tampered row
    // with a recomputed hash must still fail closed when its requirementId
    // drifts from the verified run identity. The identity is ALWAYS supplied
    // by the caller from a snapshot verified inside the same transaction —
    // the persisted loop_runs.requirement_id column is never re-queried here.
    for (const record of records) {
      if (record.requirementId !== verifiedRequirementId) {
        corrupt("artifact revision does not match the run identity");
      }
    }
    // Re-verify the producer execution binding on every read (Decision-040
    // item 4). The canonical hash only proves a row is internally consistent;
    // a rehashed tampered row must still fail closed when its producer
    // execution is missing, not succeeded, or its node, output triple or Gate
    // result drifted from the verified capability execution stream.
    const capabilityExecutions = this.readCapabilityExecutionsInTransaction(db, runId);
    for (const record of records) {
      const producer = capabilityExecutions.find(
        (item) => item.executionEventId === record.producerExecutionId,
      );
      if (producer === undefined || producer.status !== "succeeded") {
        corrupt("artifact revision producer execution is missing or not succeeded");
      }
      if (producer.capability !== record.nodeId) {
        corrupt("artifact revision node does not match the producer execution");
      }
      if (
        producer.outputArtifactRef !== record.artifactRef ||
        producer.outputArtifactVersion !== record.semver ||
        producer.outputDigest !== record.digest
      ) {
        corrupt("artifact revision does not match the producer execution output");
      }
      if (producer.gateResult !== record.gateResult) {
        corrupt("artifact revision Gate result does not match the producer execution");
      }
      // v2 (A2): the persisted producing role must match the execution stream.
      if (producer.executionRole !== record.producerExecutionRole) {
        corrupt("artifact revision producing role does not match the producer execution");
      }
    }
    // Re-verify the blob binding on every read: a persisted revision whose
    // physical blob never existed, was deleted after the append, or no longer
    // matches the persisted digest must fail closed on every read path.
    for (const record of records) {
      this.verifyRevisionBlob(record, "read");
    }
    try {
      validateLoopArtifactRevisionChain(records, runId);
    } catch (error) {
      if (error instanceof LoopRunJournalError) corrupt("persisted artifact revision chain is invalid");
      throw error;
    }
    const byNode = new Map<string, LoopArtifactRevision[]>();
    for (const record of records) {
      const group = byNode.get(record.nodeId);
      if (group === undefined) byNode.set(record.nodeId, [record]);
      else group.push(record);
    }
    const currentRows = db.prepare(
      "SELECT * FROM loop_artifact_current WHERE run_id = ?",
    ).all(runId) as ArtifactCurrentRow[];
    const pointerNodes = new Set<string>();
    for (const currentRow of currentRows) {
      if (pointerNodes.has(currentRow.node_id)) corrupt("duplicate current artifact pointer");
      pointerNodes.add(currentRow.node_id);
      const group = byNode.get(currentRow.node_id);
      if (group === undefined) corrupt("current artifact pointer has no revision chain");
      if (currentRow.revision_id !== group[group.length - 1]!.revisionId) {
        corrupt("current artifact pointer does not target the latest revision");
      }
      if (
        typeof currentRow.updated_at !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(currentRow.updated_at) ||
        Number.isNaN(Date.parse(currentRow.updated_at))
      ) {
        corrupt("current artifact pointer timestamp is invalid");
      }
    }
    for (const nodeId of byNode.keys()) {
      if (!pointerNodes.has(nodeId)) corrupt("artifact revision chain is missing its current pointer");
    }
    return Object.freeze(records);
  }

  /**
   * Read and verify the complete finding chain with its invalidation edges
   * for one run (C02-WP3). Beyond per-record validation and canonical hash
   * recomputation, every record is cross-bound to the verified run identity,
   * and every invalidation edge is re-verified against the verified revision
   * chain: the referenced revision must exist, belong to the named node and
   * still be STALE (the validity machine has no STALE exit edge, so a drifted
   * edge always fails closed). Every finding's persisted append-time
   * invalidation scope is recomputed from the surviving edges (contract 0.1.1
   * §4), and every closed finding's durable closure proof is re-verified
   * against the finding row, the verified revision chain and the bound
   * artifact store (contract 0.1.1 §5). The chain rules (sequence contiguity,
   * single Requirement identity, supersede linkage, edge consistency) are
   * enforced last. The verified requirementId is ALWAYS supplied by the
   * caller from a snapshot verified inside the same transaction — the
   * persisted loop_runs.requirement_id column is never re-queried here.
   */
  private readFindingChainInTransaction(
    db: Database.Database,
    runId: string,
    verifiedRequirementId: string,
  ): Readonly<{
    findings: readonly LoopFinding[];
    invalidations: readonly LoopFindingInvalidation[];
  }> {
    const rows = db.prepare(
      "SELECT * FROM loop_findings WHERE run_id = ? ORDER BY sequence ASC",
    ).all(runId) as FindingRow[];
    const findings = rows.map((row) => {
      const record = rowToFinding(row);
      try {
        validateLoopFinding(record);
        if (sha256Hex(canonicalizeLoopFinding(record)) !== row.canonical_sha256) {
          corrupt("finding canonical hash mismatch");
        }
      } catch (error) {
        if (error instanceof LoopRunJournalError && error.code === "STORE_CORRUPT") throw error;
        if (error instanceof LoopRunJournalError) corrupt("persisted finding is invalid");

        throw error;
      }
      return record;
    });
    for (const record of findings) {
      if (record.requirementId !== verifiedRequirementId) {
        corrupt("finding does not match the run identity");
      }
    }
    // Round 1 (H1-4): re-verify the STATIC node binding of every finding's
    // source revision on every read path (currency may legitimately change
    // later; the node binding never can).
    const readRevisions = this.readArtifactRevisionsInTransaction(db, runId, verifiedRequirementId);
    for (const record of findings) {
      const source = readRevisions.find((item) => item.revisionId === record.sourceRevisionId);
      if (source === undefined || source.nodeId !== record.sourceCapability) {
        corrupt("finding source revision does not match the source capability");
      }
    }
    // Round 2 re-review F2: replay-boundary re-verification of DIRECT causal
    // evidence — a persisted REGRESSION whose introducing revision has
    // vanished from the verified revision chain is corruption.
    for (const record of findings) {
      if (
        record.causeKind === "REGRESSION" &&
        !readRevisions.some((item) => item.revisionId === record.introducedByRevisionId)
      ) {
        corrupt("regression finding references a missing introducing revision");
      }
    }
    const invalidations: LoopFindingInvalidation[] = [];
    const invalidationQuery = db.prepare(
      "SELECT * FROM loop_finding_invalidations WHERE finding_id = ? ORDER BY invalidation_index ASC",
    );
    for (const finding of findings) {
      const invalidationRows = invalidationQuery.all(finding.findingId) as FindingInvalidationRow[];
      invalidationRows.forEach((invalidationRow, index) => {
        if (asPersistedSafeInteger(invalidationRow.invalidation_index) !== index) {
          corrupt("persisted finding invalidations are not contiguous");
        }
        const invalidation: LoopFindingInvalidation = Object.freeze({
          findingId: invalidationRow.finding_id,
          invalidationIndex: index,
          revisionId: invalidationRow.revision_id,
          nodeId: invalidationRow.node_id as LoopFindingInvalidation["nodeId"],
        });
        try {
          validateLoopFindingInvalidation(invalidation);
        } catch (error) {
          if (error instanceof LoopRunJournalError) corrupt("persisted finding invalidation is invalid");
          throw error;
        }
        invalidations.push(invalidation);
      });
    }
    // Re-verify every invalidation edge against the verified revision chain:
    // a tampered edge row must fail closed even though it carries no hash.
    const revisions = this.readArtifactRevisionsInTransaction(db, runId, verifiedRequirementId);
    const revisionById = new Map(revisions.map((revision) => [revision.revisionId, revision]));
    for (const invalidation of invalidations) {
      const revision = revisionById.get(invalidation.revisionId);
      if (revision === undefined) {
        corrupt("finding invalidation revision is missing");
      }
      if (revision.nodeId !== invalidation.nodeId) {
        corrupt("finding invalidation node does not match the revision");
      }
      if (revision.validity !== "STALE") {
        corrupt("finding invalidation revision is not stale");
      }
    }
    // Re-verify the persisted append-time invalidation scope of every finding
    // (contract 0.1.1 §4): the scope row must exist, hash-verify and match the
    // complete SURVIVING edge set — deleting the first, middle, last or every
    // edge leaves the remaining edges contiguous, so only the scope digest and
    // edge count comparison fails closed. An empty scope is verified the same
    // way.
    const scopeQuery = db.prepare(
      "SELECT * FROM loop_finding_scopes WHERE finding_id = ?",
    );
    for (const finding of findings) {
      const scopeRow = scopeQuery.get(finding.findingId) as FindingScopeRow | undefined;
      if (scopeRow === undefined) {
        corrupt("finding invalidation scope is missing");
      }
      const scope = rowToFindingScope(scopeRow);
      try {
        if (
          sha256Hex(canonicalizeLoopFindingInvalidationScope(scope, runId)) !==
          scopeRow.canonical_sha256
        ) {
          corrupt("finding invalidation scope canonical hash mismatch");
        }
      } catch (error) {
        if (error instanceof LoopRunJournalError && error.code === "STORE_CORRUPT") throw error;
        if (error instanceof LoopRunJournalError) corrupt("persisted finding invalidation scope is invalid");
        throw error;
      }
      const findingEdges = invalidations.filter((edge) => edge.findingId === finding.findingId);
      if (scope.edgeCount !== findingEdges.length) {
        corrupt("finding invalidation scope edge count does not match the persisted edges");
      }
      if (scope.scopeDigest !== sha256Hex(canonicalizeLoopFindingInvalidationEdges(findingEdges))) {
        corrupt("finding invalidation scope digest does not match the persisted edges");
      }
    }
    // Re-verify the durable closure proofs (contract 0.1.1 §5): every RESOLVED
    // / ACCEPTED_RISK finding must carry exactly one hash-verified proof whose
    // fields equal the finding row's closure fields; OPEN / SUPERSEDED
    // findings must carry none. A RESOLUTION proof is re-bound to the verified
    // revision chain: the referenced revision must exist and still carry the
    // immutable content binding (node + artifact ref + digest) captured at
    // transition time, so a rehashed finding row pointing at a different
    // revision fails closed. Revision VALIDITY is deliberately not re-checked
    // here — a legitimately stale-later resolution is a Gate matter, not
    // corruption.
    const proofQuery = db.prepare(
      "SELECT * FROM loop_finding_proofs WHERE finding_id = ?",
    );
    const proofs: LoopFindingProof[] = [];
    for (const finding of findings) {
      const proofRow = proofQuery.get(finding.findingId) as FindingProofRow | undefined;
      if (finding.status !== "RESOLVED" && finding.status !== "ACCEPTED_RISK") {
        if (proofRow !== undefined) {
          corrupt("open or superseded finding carries a closure proof");
        }
        continue;
      }
      if (proofRow === undefined) {
        corrupt("finding closure proof is missing");
      }
      const proof = rowToFindingProof(proofRow);
      try {
        if (sha256Hex(canonicalizeLoopFindingProof(proof, runId)) !== proofRow.canonical_sha256) {
          corrupt("finding proof canonical hash mismatch");
        }
      } catch (error) {
        if (error instanceof LoopRunJournalError && error.code === "STORE_CORRUPT") throw error;
        if (error instanceof LoopRunJournalError) corrupt("persisted finding proof is invalid");
        throw error;
      }
      if (proof.proofKind === "RESOLUTION") {
        const revision = revisionById.get(proof.revisionId!);
        if (revision === undefined) {
          corrupt("finding resolution proof revision is missing");
        }
        if (revision.nodeId !== proof.revisionNodeId) {
          corrupt("finding resolution proof node does not match the revision");
        }
        if (
          revision.artifactRef !== proof.revisionArtifactRef ||
          revision.digest !== proof.revisionArtifactDigest
        ) {
          corrupt("finding resolution proof does not match the revision content binding");
        }
      }
      this.verifyFindingEvidenceBlob(proof.evidenceRef, proof.evidenceDigest, "read");
      proofs.push(proof);
    }
    try {
      validateLoopFindingProofs(findings, proofs, runId);
    } catch (error) {
      if (error instanceof LoopRunJournalError) corrupt("persisted finding proof set is invalid");
      throw error;
    }
    try {
      validateLoopFindingChain(findings, invalidations, runId);
    } catch (error) {
      if (error instanceof LoopRunJournalError) corrupt("persisted finding chain is invalid");
      throw error;
    }
    return Object.freeze({
      findings: Object.freeze(findings),
      invalidations: Object.freeze(invalidations),
    });
  }

  private readFindingsInTransaction(
    db: Database.Database,
    runId: string,
    verifiedRequirementId: string,
  ): readonly LoopFinding[] {
    return this.readFindingChainInTransaction(db, runId, verifiedRequirementId).findings;
  }

  private verifyCapabilityExecutionTableSchema(db: Database.Database): void {
    const expected: ReadonlyArray<readonly [string, string, number, number]> = [
      ["execution_event_id", "TEXT", 0, 1], ["run_id", "TEXT", 1, 0],
      ["sequence", "INTEGER", 1, 0], ["schema_version", "INTEGER", 1, 0],
      ["capability", "TEXT", 1, 0], ["execution_role", "TEXT", 1, 0],
      ["node_id", "TEXT", 1, 0],
      ["attempt", "INTEGER", 1, 0], ["status", "TEXT", 1, 0],
      ["created_at", "TEXT", 1, 0], ["binding_id", "TEXT", 1, 0],
      ["binding_version", "TEXT", 1, 0], ["binding_registry_version", "TEXT", 1, 0],
      ["executor_agent", "TEXT", 1, 0], ["executor_adapter", "TEXT", 1, 0],
      ["executor_version", "TEXT", 1, 0], ["input_artifact_ref", "TEXT", 1, 0],
      ["input_artifact_version", "TEXT", 1, 0], ["input_digest", "TEXT", 1, 0],
      ["output_artifact_ref", "TEXT", 0, 0], ["output_artifact_version", "TEXT", 0, 0],
      ["output_digest", "TEXT", 0, 0], ["gate_result", "TEXT", 0, 0],
      ["unresolved_findings_ref", "TEXT", 0, 0], ["unresolved_findings_digest", "TEXT", 0, 0],
      ["consumed_findings_ref", "TEXT", 0, 0], ["consumed_findings_digest", "TEXT", 0, 0],
      ["decision_depth", "TEXT", 0, 0], ["decision_scope_id", "TEXT", 0, 0],
      ["decision_delta_ref", "TEXT", 0, 0], ["decision_delta_digest", "TEXT", 0, 0],
      ["next_step_eligibility", "TEXT", 0, 0], ["error_code", "TEXT", 0, 0],
      ["retryable", "INTEGER", 0, 0], ["reason_code", "TEXT", 0, 0],
      ["process_invocation_digest", "TEXT", 0, 0], ["process_exit_code", "INTEGER", 0, 0],
      ["process_signal", "TEXT", 0, 0], ["process_duration_ms", "INTEGER", 0, 0],
      ["process_truncated", "INTEGER", 0, 0], ["staging_ref", "TEXT", 0, 0],
      ["staging_digest", "TEXT", 0, 0], ["promotion_ref", "TEXT", 0, 0],
      ["promotion_digest", "TEXT", 0, 0], ["human_action_ref", "TEXT", 0, 0],
      ["canonical_sha256", "TEXT", 1, 0],
    ];
    const actual = db.prepare("PRAGMA table_info(loop_capability_executions)").all() as Array<{
      name: string; type: string; notnull: number; pk: number;
    }>;
    if (actual.length !== expected.length) corrupt("capability execution table schema mismatch");
    for (let index = 0; index < expected.length; index += 1) {
      const row = actual[index]!;
      const [name, type, notnull, pk] = expected[index]!;
      if (row.name !== name || row.type.toUpperCase() !== type || row.notnull !== notnull || row.pk !== pk) {
        corrupt("capability execution table schema mismatch");
      }
    }
    const uniqueIndexes = db.prepare("PRAGMA index_list(loop_capability_executions)").all() as Array<{
      name: string; unique: number;
    }>;
    const hasRunSequenceUnique = uniqueIndexes.some((index) => {
      if (index.unique !== 1) return false;
      const columns = db.prepare(`PRAGMA index_info(${JSON.stringify(index.name)})`).all() as Array<{ name: string }>;
      return columns.length === 2 && columns[0]?.name === "run_id" && columns[1]?.name === "sequence";
    });
    if (!hasRunSequenceUnique) corrupt("capability execution table is missing run sequence uniqueness");
    const foreignKeys = db.prepare("PRAGMA foreign_key_list(loop_capability_executions)").all() as Array<{
      table: string; from: string; to: string; on_delete: string;
    }>;
    if (
      foreignKeys.length !== 1 || foreignKeys[0]?.table !== "loop_runs" ||
      foreignKeys[0]?.from !== "run_id" || foreignKeys[0]?.to !== "run_id" ||
      foreignKeys[0]?.on_delete.toUpperCase() !== "CASCADE"
    ) {
      corrupt("capability execution table foreign key mismatch");
    }
    const runIndex = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_loop_capability_executions_run_id'",
    ).get();
    if (runIndex === undefined) corrupt("capability execution run index is missing");
    const tableSql = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'loop_capability_executions'",
    ).get() as { sql?: unknown } | undefined;
    if (
      typeof tableSql?.sql !== "string" ||
      !tableSql.sql.includes("CHECK (retryable IS NULL OR retryable IN (0, 1))")
    ) {
      corrupt("capability execution retryable constraint is missing");
    }
    if (
      typeof tableSql?.sql !== "string" ||
      !tableSql.sql.includes("CHECK (process_truncated IS NULL OR process_truncated IN (0, 1))")
    ) {
      corrupt("capability execution process_truncated constraint is missing");
    }
  }

  private verifySnapshotInTransaction(db: Database.Database, row: RunRow): LoopRunSnapshot {
    const identity: LoopRunIdentity = Object.freeze({
      runId: row.run_id,
      requirementId: row.requirement_id,
      repository: row.repository,
      repositoryPath: row.repository_path,
      baseBranch: row.base_branch,
      expectedBaseSha: row.expected_base_sha,
      taskBranch: row.task_branch,
      controlRoot: row.control_root,
      createdAt: row.created_at,
    });
    validatePersistedIdentity(identity);
    if (sha256Hex(canonicalizePersistedIdentity(identity)) !== row.identity_sha256) {
      corrupt("identity hash mismatch");
    }

    const stageRows = db
      .prepare("SELECT stage, status, attempt, updated_at FROM loop_stage_states WHERE run_id = ?")
      .all(row.run_id) as Array<{ stage: string; status: string; attempt: number; updated_at: string }>;
    const canonicalStageSet = new Set<string>(LOOP_STAGE_NAMES);
    const seenStages = new Set<string>();
    for (const stageRow of stageRows) {
      if (!canonicalStageSet.has(stageRow.stage)) corrupt("unknown persisted stage row");
      seenStages.add(stageRow.stage);
      asPersistedSafeInteger(stageRow.attempt);
    }
    for (const stage of LOOP_STAGE_NAMES) {
      if (!seenStages.has(stage)) corrupt(`missing stage row ${stage}`);
    }

    const eventRows = db
      .prepare("SELECT * FROM loop_events WHERE run_id = ? ORDER BY sequence ASC")
      .all(row.run_id) as EventRow[];
    if (eventRows.length === 0) corrupt("run has no events");
    const events = eventRows.map((eventRow) => {
      const event = rowToEvent(eventRow);
      validatePersistedEvent(event);
      // Exactly one hash format (the extended canonical form) is valid in a
      // v6 journal — historical formats are rejected at init before any read.
      if (sha256Hex(canonicalizePersistedEvent(event)) !== eventRow.canonical_sha256) {
        corrupt("persisted event canonical hash mismatch");
      }
      return event;
    });
    for (let index = 0; index < events.length; index += 1) {
      if (events[index]!.sequence !== index + 1) {
        corrupt("event sequence is not contiguous from 1");
      }
    }
    const first = events[0]!;
    const expectedFirstEvent = createLoopRunCreatedEvent(identity);
    if (canonicalizePersistedEvent(first) !== canonicalizePersistedEvent(expectedFirstEvent)) {
      corrupt("sequence 1 is not the canonical run_created event");
    }
    const last = events[events.length - 1]!;
    if (last.eventId !== row.last_event_id) corrupt("last_event_id does not match the last persisted event");
    if (last.sequence !== row.last_sequence) corrupt("last_sequence does not match the last persisted event");

    asPersistedSafeInteger(row.current_attempt);
    asPersistedSafeInteger(row.fix_round);
    asPersistedSafeInteger(row.last_sequence);

    let replayed = createInitialLoopRunState(identity);
    try {
      for (const event of events.slice(1)) {
        replayed = applyLoopRunEvent(replayed, event);
      }
    } catch (error) {
      if (error instanceof LoopRunJournalError) corrupt("persisted history cannot be replayed");
      throw error;
    }

    if (
      replayed.status !== row.status ||
      replayed.currentStage !== (row.current_stage as LoopStageName | null) ||
      replayed.currentAttempt !== row.current_attempt ||
      replayed.fixRound !== row.fix_round ||
      replayed.lastSequence !== row.last_sequence ||
      replayed.lastEventId !== row.last_event_id ||
      replayed.blockingReasonCode !== row.blocking_reason_code ||
      replayed.failureReasonCode !== row.failure_reason_code ||
      replayed.updatedAt !== row.updated_at
    ) {
      corrupt("persisted run state does not match replayed state");
    }

    const stageByName = new Map(stageRows.map((stageRow) => [stageRow.stage, stageRow]));
    for (const stage of LOOP_STAGE_NAMES) {
      const persistedStage = stageByName.get(stage)!;
      const replayedStage: LoopStageState = replayed.stages[stage];
      if (
        persistedStage.status !== replayedStage.status ||
        persistedStage.attempt !== replayedStage.attempt ||
        persistedStage.updated_at !== replayedStage.updatedAt
      ) {
        corrupt(`stage ${stage} state does not match replayed state`);
      }
    }

    const stageMap = Object.create(null) as Record<LoopStageName, LoopStageState>;
    for (const stage of LOOP_STAGE_NAMES) {
      stageMap[stage] = replayed.stages[stage];
    }
    const state = Object.freeze({
      identity,
      status: replayed.status as LoopRunStatus,
      currentStage: replayed.currentStage,
      currentAttempt: replayed.currentAttempt,
      fixRound: replayed.fixRound,
      lastSequence: replayed.lastSequence,
      lastEventId: replayed.lastEventId,
      blockingReasonCode: replayed.blockingReasonCode,
      failureReasonCode: replayed.failureReasonCode,
      updatedAt: replayed.updatedAt,
      stages: Object.freeze(stageMap),
    });
    const frozenEvents = Object.freeze(events);
    if (state.lastSequence !== frozenEvents.length) {
      corrupt("snapshot sequence/event count invariant violated");
    }
    if (frozenEvents.length === 0 || frozenEvents[frozenEvents.length - 1]!.eventId !== state.lastEventId) {
      corrupt("snapshot last-event invariant violated");
    }
    // The capability-attempt stream is orthogonal to delivery stages but is
    // part of the same durable run. Snapshot reads verify both streams before
    // returning any business state.
    this.readCapabilityExecutionsInTransaction(db, row.run_id);
    // C02 WP-1: requirement change records are part of the same durable run;
    // every snapshot read verifies the change chain before returning state.
    this.readRequirementChangesInTransaction(db, row.run_id, identity.requirementId);
    // C02 WP-2: artifact revisions and the per-node current pointer are part
    // of the same durable run; every snapshot read verifies the revision
    // chain and pointer consistency (corruption-first) before returning state.
    this.readArtifactRevisionsInTransaction(db, row.run_id, identity.requirementId);
    // C02 WP-3: findings and their invalidation edges are part of the same
    // durable run; every snapshot read verifies the finding chain (including
    // edge/revision consistency) before returning state.
    this.readFindingsInTransaction(db, row.run_id, identity.requirementId);
    return Object.freeze({ state, events: frozenEvents });
  }
}
