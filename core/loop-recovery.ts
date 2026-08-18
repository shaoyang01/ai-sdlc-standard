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

import { LoopRunJournalError, type LoopRunEvent, type LoopRunSnapshot } from "./loop-executor-types";
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

/**
 * Appends a stage execution event with binding provenance. The sequence is
 * derived from the journal state machine (lastSequence + 1) so the event
 * passes the journal's transition validation. Provenance fields are
 * nullable-validated by the journal (fail-closed, never echoed).
 */
export function recordNodeExecution(
  store: LoopRunStore,
  record: NodeExecutionRecord,
): LoopRunEvent {
  const snapshot = store.getSnapshot(record.runId);
  if (snapshot === undefined) {
    throw new LoopRunJournalError("RUN_NOT_FOUND", "run not found");
  }
  const sequence = snapshot.state.lastSequence + 1;
  const event: LoopRunEvent = {
    eventId: `${record.runId}:${sequence}:${record.kind}`,
    runId: record.runId,
    sequence,
    kind: record.kind,
    stage: record.stage as LoopRunEvent["stage"],
    attempt: record.attempt,
    createdAt: record.createdAt,
    inputDigest: record.inputDigest ?? null,
    outputArtifactRef: record.outputArtifactRef ?? null,
    outputDigest: record.outputDigest ?? null,
    errorCode: record.errorCode ?? null,
    retryable: record.retryable ?? null,
    reasonCode: record.reasonCode ?? null,
    bindingId: record.provenance.bindingId,
    bindingVersion: record.provenance.bindingVersion,
    inputArtifactRef: record.provenance.inputArtifactRef,
  };
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
