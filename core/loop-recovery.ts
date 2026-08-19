// LOOP Execution Provenance and Recovery (C01 WP-4)
// ===================================================
// Cross-entry recovery and per-execution provenance on top of the run
// journal (WP-1 requirementId query API):
// - recordNodeExecution appends a stage event carrying binding provenance
//   (binding id, binding version, input artifact reference);
// - recoverRunContext resolves the latest verified run for a requirement and
//   extracts the recovery context (current stage, attempt, fix round,
//   blocking/failure reasons and the last execution provenance).
// The checkpoint machinery (D10-A) keeps its fresh/recovery semantics but its
// publish phases stay out of C01 (LOOP Core Contract §8).

import { types as utilTypes } from "node:util";

import { LoopRunJournalError, type LoopRunEvent, type LoopRunSnapshot } from "./loop-executor-types";
import { readPlainDataRecord } from "./loop-run-state";
import type { LoopRunStore } from "./loop-run-store";

export interface NodeExecutionProvenance {
  bindingId: string;
  bindingVersion: string;
  inputArtifactRef: string | null;
}

export interface NodeExecutionRecord {
  runId: string;
  stage: string;
  attempt: number;
  kind: "stage_started" | "stage_succeeded" | "stage_failed";
  createdAt: string;
  provenance: NodeExecutionProvenance;
  errorCode?: string | null;
  retryable?: boolean | null;
  reasonCode?: string | null;
  inputDigest?: string | null;
  outputArtifactRef?: string | null;
  outputDigest?: string | null;
}

export interface RunRecoveryContext {
  snapshot: LoopRunSnapshot;
  currentStage: string | null;
  currentAttempt: number;
  fixRound: number;
  status: string;
  blockingReasonCode: string | null;
  failureReasonCode: string | null;
  lastExecution: Readonly<{
    stage: string | null;
    kind: string;
    attempt: number;
    bindingId: string | null;
    bindingVersion: string | null;
    inputArtifactRef: string | null;
    outputArtifactRef: string | null;
    reasonCode: string | null;
  }> | null;
}

const NODE_EXECUTION_KINDS = ["stage_started", "stage_succeeded", "stage_failed"] as const;

function requireRecordString(value: unknown, label: string): void {
  if (typeof value !== "string") {
    throw new LoopRunJournalError("INVALID_INPUT", `${label} must be a string`);
  }
}

function requireRecordNullableString(value: unknown, label: string): void {
  if (value !== null && value !== undefined && typeof value !== "string") {
    throw new LoopRunJournalError("INVALID_INPUT", `${label} must be a string or null`);
  }
}

/**
 * Validates every field recordNodeExecution consumes, before the journal is
 * touched. Content-level rules (non-empty, control characters, digest
 * formats, transition legality) stay with the journal's own fail-closed
 * validation in appendEvent.
 */
function validateNodeExecutionRecordShape(
  rec: NodeExecutionRecord,
  provenance: NodeExecutionProvenance,
): void {
  requireRecordString(rec.runId, "record.runId");
  requireRecordString(rec.stage, "record.stage");
  if (!NODE_EXECUTION_KINDS.includes(rec.kind)) {
    throw new LoopRunJournalError("INVALID_INPUT", "record.kind must be a stage execution kind");
  }
  if (typeof rec.attempt !== "number" || !Number.isSafeInteger(rec.attempt)) {
    throw new LoopRunJournalError("INVALID_INPUT", "record.attempt must be a safe integer");
  }
  requireRecordString(rec.createdAt, "record.createdAt");
  requireRecordString(provenance.bindingId, "record.provenance.bindingId");
  requireRecordString(provenance.bindingVersion, "record.provenance.bindingVersion");
  if (provenance.inputArtifactRef !== null && typeof provenance.inputArtifactRef !== "string") {
    throw new LoopRunJournalError("INVALID_INPUT", "record.provenance.inputArtifactRef must be a string or null");
  }
  requireRecordNullableString(rec.inputDigest, "record.inputDigest");
  requireRecordNullableString(rec.outputArtifactRef, "record.outputArtifactRef");
  requireRecordNullableString(rec.outputDigest, "record.outputDigest");
  requireRecordNullableString(rec.errorCode, "record.errorCode");
  requireRecordNullableString(rec.reasonCode, "record.reasonCode");
  if (rec.retryable !== null && rec.retryable !== undefined && typeof rec.retryable !== "boolean") {
    throw new LoopRunJournalError("INVALID_INPUT", "record.retryable must be a boolean or null");
  }
}

/**
 * Appends a stage execution event with binding provenance. The sequence is
 * derived from the journal state machine (lastSequence + 1) so the event
 * passes the journal's transition validation. Provenance fields are
 * nullable-validated by the journal (fail-closed, never echoed).
 *
 * Fail-closed input boundary: record and provenance must be plain data
 * records, and every field is shape-validated before the journal is read or
 * written — null, missing fields, accessor properties, or any Proxy
 * (transparent, revoked, or trapping; detected via util.types.isProxy
 * before any reflection) surface as INVALID_INPUT (no event, no state
 * change, never a raw TypeError).
 * The returned event is frozen, matching the immutability contract of
 * persisted events.
 */
export function recordNodeExecution(
  store: LoopRunStore,
  record: NodeExecutionRecord,
): LoopRunEvent {
  if (utilTypes.isProxy(record)) {
    throw new LoopRunJournalError("INVALID_INPUT", "record must not be a Proxy");
  }
  const rec = readPlainDataRecord(record, "record") as unknown as NodeExecutionRecord;
  if (utilTypes.isProxy(rec.provenance)) {
    throw new LoopRunJournalError("INVALID_INPUT", "record.provenance must not be a Proxy");
  }
  const provenance = readPlainDataRecord(rec.provenance, "record.provenance") as unknown as NodeExecutionProvenance;
  validateNodeExecutionRecordShape(rec, provenance);
  const snapshot = store.getSnapshot(rec.runId);
  if (snapshot === undefined) {
    throw new LoopRunJournalError("RUN_NOT_FOUND", "run not found");
  }
  const sequence = snapshot.state.lastSequence + 1;
  const event: LoopRunEvent = Object.freeze({
    eventId: `${rec.runId}:${sequence}:${rec.kind}`,
    runId: rec.runId,
    sequence,
    kind: rec.kind,
    stage: rec.stage as LoopRunEvent["stage"],
    attempt: rec.attempt,
    createdAt: rec.createdAt,
    inputDigest: rec.inputDigest ?? null,
    outputArtifactRef: rec.outputArtifactRef ?? null,
    outputDigest: rec.outputDigest ?? null,
    errorCode: rec.errorCode ?? null,
    retryable: rec.retryable ?? null,
    reasonCode: rec.reasonCode ?? null,
    bindingId: provenance.bindingId,
    bindingVersion: provenance.bindingVersion,
    inputArtifactRef: provenance.inputArtifactRef,
  });
  store.appendEvent(event);
  return event;
}

/**
 * Recovers the run context for a requirement via the latest verified run
 * (WP-1 API), extracting the state needed by an entry to resume without
 * reinterpreting confirmed facts. Returns undefined when the requirement has
 * no run yet.
 */
export function recoverRunContext(
  store: LoopRunStore,
  requirementId: string,
): RunRecoveryContext | undefined {
  const snapshot = store.findLatestRunByRequirement(requirementId);
  if (snapshot === undefined) {
    return undefined;
  }
  const state = snapshot.state;
  const lastExecutionEvent = [...snapshot.events].reverse().find(
    (event) => event.kind === "stage_started" || event.kind === "stage_succeeded" || event.kind === "stage_failed",
  );
  return Object.freeze({
    snapshot,
    currentStage: state.currentStage,
    currentAttempt: state.currentAttempt,
    fixRound: state.fixRound,
    status: state.status,
    blockingReasonCode: state.blockingReasonCode,
    failureReasonCode: state.failureReasonCode,
    lastExecution:
      lastExecutionEvent === undefined
        ? null
        : Object.freeze({
            stage: lastExecutionEvent.stage,
            kind: lastExecutionEvent.kind,
            attempt: lastExecutionEvent.attempt,
            bindingId: lastExecutionEvent.bindingId,
            bindingVersion: lastExecutionEvent.bindingVersion,
            inputArtifactRef: lastExecutionEvent.inputArtifactRef,
            outputArtifactRef: lastExecutionEvent.outputArtifactRef,
            reasonCode: lastExecutionEvent.reasonCode,
          }),
  });
}

export { LoopRunJournalError };
