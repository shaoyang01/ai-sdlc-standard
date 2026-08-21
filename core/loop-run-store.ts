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
  canonicalizeLoopRunEventLegacy,
  canonicalizeLoopRunIdentity,
  createInitialLoopRunState,
  createLoopRunCreatedEvent,
  validateLoopRunEvent,
  validateLoopRunIdentity,
  validateRequirementId,
} from "./loop-run-state";
import {
  canonicalizeLoopCapabilityExecutionEvent,
  validateLoopCapabilityExecutionChain,
  validateLoopCapabilityExecutionEvent,
  type LoopCapabilityExecutionEvent,
} from "./loop-capability-execution";
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
import { LoopArtifactStore, LoopArtifactStoreError } from "./loop-artifact-store";
import { NODE_CAPABILITY_IDS } from "../loop/types";

const DEFAULT_BUSY_TIMEOUT_MS = 2000;
const MAX_BUSY_TIMEOUT_MS = 5000;
const LOOP_RUN_STORE_FORMAT_VERSION = 4;

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

function canonicalizePersistedEventLegacy(event: LoopRunEvent): string {
  try {
    return canonicalizeLoopRunEventLegacy(event);
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
  next_step_eligibility: string | null;
  error_code: string | null;
  retryable: number | null;
  reason_code: string | null;
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
    // C01 WP-4: legacy rows without the columns map to null; their stored
    // hash is verified against the legacy form and rewritten to the extended
    // form by the init() migration.
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
    schemaVersion: asPersistedSafeInteger(row.schema_version) as 1,
    executionEventId: row.execution_event_id,
    runId: row.run_id,
    sequence: asPersistedSafeInteger(row.sequence),
    capability: row.capability as LoopCapabilityExecutionEvent["capability"],
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
    nextStepEligibility: row.next_step_eligibility as LoopCapabilityExecutionEvent["nextStepEligibility"],
    errorCode: row.error_code,
    retryable: asPersistedRetryable(row.retryable),
    reasonCode: row.reason_code,
  });
}

function capabilityExecutionToRow(event: LoopCapabilityExecutionEvent): CapabilityExecutionRow {
  return {
    execution_event_id: event.executionEventId,
    run_id: event.runId,
    sequence: event.sequence,
    schema_version: event.schemaVersion,
    capability: event.capability,
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
    next_step_eligibility: event.nextStepEligibility,
    error_code: event.errorCode,
    retryable: event.retryable === null ? null : event.retryable ? 1 : 0,
    reason_code: event.reasonCode,
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
    schemaVersion: asPersistedSafeInteger(row.schema_version) as 1,
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
      producer_execution_id, gate_result, validity, superseded_by, created_at,
      canonical_sha256
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.revisionId, record.runId, record.requirementId, record.nodeId,
    record.sequence, record.schemaVersion, record.generation, record.stablePath,
    record.artifactKind, record.semver, record.artifactRef, record.digest,
    record.producerExecutionId, record.gateResult, record.validity,
    record.supersededBy, record.createdAt,
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
    }
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

      // schema creation
      try {
        db.exec(`
          CREATE TABLE IF NOT EXISTS loop_runs (
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
          CREATE INDEX IF NOT EXISTS idx_loop_runs_status ON loop_runs(status);

          CREATE TABLE IF NOT EXISTS loop_stage_states (
            run_id TEXT NOT NULL,
            stage TEXT NOT NULL,
            status TEXT NOT NULL,
            attempt INTEGER NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (run_id, stage),
            FOREIGN KEY (run_id) REFERENCES loop_runs(run_id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS idx_loop_stage_states_run_id ON loop_stage_states(run_id);

          CREATE TABLE IF NOT EXISTS loop_events (
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
          CREATE INDEX IF NOT EXISTS idx_loop_events_run_id ON loop_events(run_id);
        `);

        // C01 WP-4/WP-4B and C02 WP-1/WP-2 migrations are one atomic unit. v0
        // adds the three legacy provenance columns and normalizes historical
        // event hashes (marker v1); v2 adds the orthogonal capability-attempt
        // journal; v3 adds the requirement change classification tables; v4 is
        // current and adds the artifact revision and current authority tables.
        // Any failure rolls back all migration DDL/data and user_version.
        db.transaction(() => {
          const formatVersion = db.pragma("user_version", { simple: true });
          if (
            typeof formatVersion !== "number" ||
            !Number.isSafeInteger(formatVersion) ||
            formatVersion < 0 ||
            formatVersion > LOOP_RUN_STORE_FORMAT_VERSION
          ) {
            corrupt("unknown journal format version");
          }
          const eventColumns = db.prepare("PRAGMA table_info(loop_events)").all() as Array<{ name: string }>;
          const existing = new Set(eventColumns.map((column) => column.name));
          const provenanceColumns: ReadonlyArray<{ name: string; ddl: string }> = [
            { name: "binding_id", ddl: "ALTER TABLE loop_events ADD COLUMN binding_id TEXT" },
            { name: "binding_version", ddl: "ALTER TABLE loop_events ADD COLUMN binding_version TEXT" },
            { name: "input_artifact_ref", ddl: "ALTER TABLE loop_events ADD COLUMN input_artifact_ref TEXT" },
          ];
          for (const column of provenanceColumns) {
            if (!existing.has(column.name)) {
              if (formatVersion !== 0) corrupt("normalized journal is missing provenance columns");
              db.exec(column.ddl);
            }
          }
          if (formatVersion === 0) {
            this.normalizeEventHashesToExtendedForm(db);
          }
          const capabilityTableExists = db.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'loop_capability_executions'",
          ).get() !== undefined;
          // v2 introduced the capability-attempt journal: any journal already
          // marked v2 or later must carry the table; only v0/v1 journals may
          // legitimately lack it (created below in the same transaction).
          if (formatVersion >= 2 && !capabilityTableExists) {
            corrupt("normalized journal is missing capability execution table");
          }
          if (!capabilityTableExists) {
            db.exec(`
              CREATE TABLE loop_capability_executions (
                execution_event_id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                sequence INTEGER NOT NULL,
                schema_version INTEGER NOT NULL,
                capability TEXT NOT NULL,
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
                next_step_eligibility TEXT,
                error_code TEXT,
                retryable INTEGER CHECK (retryable IS NULL OR retryable IN (0, 1)),
                reason_code TEXT,
                canonical_sha256 TEXT NOT NULL,
                UNIQUE (run_id, sequence),
                FOREIGN KEY (run_id) REFERENCES loop_runs(run_id) ON DELETE CASCADE
              );
              CREATE INDEX idx_loop_capability_executions_run_id
                ON loop_capability_executions(run_id);
            `);
          }
          this.verifyCapabilityExecutionTableSchema(db);
          const changeTableExists = db.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'loop_requirement_changes'",
          ).get() !== undefined;
          // v3 introduced the requirement change journal: any journal already
          // marked v3 or later must carry the table; only v0-v2 journals may
          // legitimately lack it (created above in the same transaction).
          if (formatVersion >= 3 && !changeTableExists) {
            corrupt("current journal is missing requirement change table");
          }
          if (!changeTableExists) {
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
          }
          this.verifyRequirementChangeTablesSchema(db);
          const revisionTableExists = db.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'loop_artifact_revisions'",
          ).get() !== undefined;
          // v4 introduced the artifact revision authority: any journal already
          // marked v4 must carry the tables; older journals get them below in
          // the same transaction. C01 and WP1 history is never rewritten.
          if (formatVersion === LOOP_RUN_STORE_FORMAT_VERSION && !revisionTableExists) {
            corrupt("current journal is missing artifact revision table");
          }
          if (!revisionTableExists) {
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
          }
          this.verifyArtifactRevisionTablesSchema(db);
          if (formatVersion < LOOP_RUN_STORE_FORMAT_VERSION) {
            db.exec(`PRAGMA user_version = ${LOOP_RUN_STORE_FORMAT_VERSION}`);
          }
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
      const snapshot = db.transaction((): LoopRunSnapshot => {
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
      }).immediate() as LoopRunSnapshot;
      return snapshot.state;
    } catch (error) {
      return this.translateWriterError(error, () => {
        return this.reclassifyCreateRunConstraint(db, identity.runId, identitySha);
      });
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
      return db.transaction((): CapabilityExecutionAppendResult => {
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
        try {
          validateLoopCapabilityExecutionChain([...current, event], event.runId);
        } catch (error) {
          if (error instanceof LoopRunJournalError) {
            throw new LoopRunJournalError("ILLEGAL_TRANSITION", "capability execution transition is invalid");
          }
          throw error;
        }
        this.insertCapabilityExecutionRow(db, row);
        return Object.freeze({ event: Object.freeze({ ...event }), appended: true });
      }).immediate() as CapabilityExecutionAppendResult;
    } catch (error) {
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
  }

  /**
   * Atomically close the exact active capability claim after a previous
   * process disappeared before recording its terminal event. The terminal
   * event copies the persisted started snapshot; callers cannot substitute a
   * binding, executor, capability, attempt or input lineage while recovering.
   */
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
          validateLoopCapabilityExecutionChain([...current, failed], runId);
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
        const marked: LoopArtifactRevision = Object.freeze({ ...target, validity: "STALE" });
        const updateResult = db.prepare(
          "UPDATE loop_artifact_revisions SET validity = ?, canonical_sha256 = ? WHERE revision_id = ? AND validity = ?",
        ).run("STALE", sha256Hex(canonicalizeLoopArtifactRevision(marked)), revisionId, "ACTIVE");
        if (updateResult.changes !== 1) {
          corrupt("artifact revision drifted during stale marking");
        }
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
        node_id, attempt, status, created_at, binding_id, binding_version,
        binding_registry_version, executor_agent, executor_adapter,
        executor_version, input_artifact_ref, input_artifact_version,
        input_digest, output_artifact_ref, output_artifact_version,
        output_digest, gate_result, unresolved_findings_ref,
        unresolved_findings_digest, next_step_eligibility, error_code,
        retryable, reason_code, canonical_sha256
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      row.execution_event_id, row.run_id, row.sequence, row.schema_version,
      row.capability, row.node_id, row.attempt, row.status, row.created_at,
      row.binding_id, row.binding_version, row.binding_registry_version,
      row.executor_agent, row.executor_adapter, row.executor_version,
      row.input_artifact_ref, row.input_artifact_version, row.input_digest,
      row.output_artifact_ref, row.output_artifact_version, row.output_digest,
      row.gate_result, row.unresolved_findings_ref, row.unresolved_findings_digest,
      row.next_step_eligibility, row.error_code, row.retryable, row.reason_code,
      row.canonical_sha256,
    );
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
      return event;
    });
    try {
      validateLoopCapabilityExecutionChain(events, runId);
    } catch (error) {
      if (error instanceof LoopRunJournalError) corrupt("persisted capability execution chain is invalid");
      throw error;
    }
    return Object.freeze(events);
  }

  /**
   * Verifies and rewrites persisted event hashes to the extended canonical
   * form. Runs inside the caller's migration transaction (init), so any
   * failure rolls back the column additions and hash rewrites together.
   * Every row whose stored hash does not match the extended form must match
   * the legacy 13-field form (and have all provenance fields null) — it is
   * then rewritten to the extended hash. Any other mismatch (including
   * tampered historical rows) aborts the migration with STORE_CORRUPT.
   * user_version flips to 1 as the last step of the legacy-event phase; the
   * caller then creates/verifies the capability table and publishes v2 in
   * the same outer transaction.
   */
  private normalizeEventHashesToExtendedForm(db: Database.Database): void {
    const rows = db.prepare("SELECT * FROM loop_events").all() as EventRow[];
    const update = db.prepare("UPDATE loop_events SET canonical_sha256 = ? WHERE event_id = ?");
    for (const row of rows) {
      const event = rowToEvent(row);
      validatePersistedEvent(event);
      const extendedSha = sha256Hex(canonicalizePersistedEvent(event));
      if (extendedSha === row.canonical_sha256) continue;
      const legacyCompatible =
        event.bindingId === null && event.bindingVersion === null && event.inputArtifactRef === null;
      if (!legacyCompatible || sha256Hex(canonicalizePersistedEventLegacy(event)) !== row.canonical_sha256) {
        corrupt("persisted event canonical hash mismatch");
      }
      update.run(extendedSha, row.event_id);
    }
    db.exec("PRAGMA user_version = 1");
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
      ["producer_execution_id", "TEXT", 1, 0], ["gate_result", "TEXT", 0, 0],
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

  private verifyCapabilityExecutionTableSchema(db: Database.Database): void {
    const expected: ReadonlyArray<readonly [string, string, number, number]> = [
      ["execution_event_id", "TEXT", 0, 1], ["run_id", "TEXT", 1, 0],
      ["sequence", "INTEGER", 1, 0], ["schema_version", "INTEGER", 1, 0],
      ["capability", "TEXT", 1, 0], ["node_id", "TEXT", 1, 0],
      ["attempt", "INTEGER", 1, 0], ["status", "TEXT", 1, 0],
      ["created_at", "TEXT", 1, 0], ["binding_id", "TEXT", 1, 0],
      ["binding_version", "TEXT", 1, 0], ["binding_registry_version", "TEXT", 1, 0],
      ["executor_agent", "TEXT", 1, 0], ["executor_adapter", "TEXT", 1, 0],
      ["executor_version", "TEXT", 1, 0], ["input_artifact_ref", "TEXT", 1, 0],
      ["input_artifact_version", "TEXT", 1, 0], ["input_digest", "TEXT", 1, 0],
      ["output_artifact_ref", "TEXT", 0, 0], ["output_artifact_version", "TEXT", 0, 0],
      ["output_digest", "TEXT", 0, 0], ["gate_result", "TEXT", 0, 0],
      ["unresolved_findings_ref", "TEXT", 0, 0], ["unresolved_findings_digest", "TEXT", 0, 0],
      ["next_step_eligibility", "TEXT", 0, 0], ["error_code", "TEXT", 0, 0],
      ["retryable", "INTEGER", 0, 0], ["reason_code", "TEXT", 0, 0],
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
      // init() has already normalized any legacy hashes to the extended
      // form, so exactly one hash format is valid here.
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
    return Object.freeze({ state, events: frozenEvents });
  }
}
