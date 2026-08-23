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
import {
  LOOP_CAPABILITY_EXECUTION_POINTS,
  NODE_CAPABILITY_IDS,
  type CapabilityExecutionRole,
  type NodeCapabilityId,
} from "../loop/types";
import { planRegateFromFacts, type CurrentRevisionFacts } from "./loop-regate";
import type {
  LoopCapabilityExecutionEvent,
  LoopCapabilityExecutionStatus,
  LoopCapabilityGateResult,
  LoopNextStepEligibility,
} from "./loop-capability-execution";

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
  capabilityStates: readonly CapabilityRecoveryState[];
  capabilityChainStatus: "READY" | "RUNNING" | "BLOCKED" | "COMPLETED";
  nextCapability: NodeCapabilityId | null;
  /**
   * v2 (A2): the next dispatchable (capability, executionRole) point of the
   * eight-point chain, or null when the chain is blocked/running/complete.
   * The capability-level `nextCapability` is derived from it.
   */
  nextExecutionPoint: Readonly<{ capability: NodeCapabilityId; executionRole: CapabilityExecutionRole }> | null;
  /** Point-wise recovery states of the eight v2 execution points. */
  executionPointStates: readonly ExecutionPointRecoveryState[];
  lastCapabilityExecution: LoopCapabilityExecutionEvent | null;
  /**
   * WP4: durable convergence projection — the v2 finding gate over ALL
   * open/closed findings and current validity. COMPLETED chains with a
   * BLOCKED gate are not done.
   */
  findingGate: { status: "ELIGIBLE" | "BLOCKED"; blockingFindingIds: readonly string[] };
  /**
   * WP4: depth decision bound to the latest formal_verdict round.
   * PASS → DECIDED; FAIL / missing / PASS_WITH_RISK without a current
   * ACCEPTED_RISK proof → BLOCKED_UNKNOWN (implementation must not start).
   */
  solutionGateDecision: {
    status: "DECIDED" | "BLOCKED_UNKNOWN";
    boundVerdictArtifactRef: string | null;
  } | null;
}

export interface CapabilityRecoveryState {
  capability: NodeCapabilityId;
  status: LoopCapabilityExecutionStatus | "not_started";
  lastAttempt: number;
  lastExecutionRole: CapabilityExecutionRole | null;
  bindingId: string | null;
  bindingVersion: string | null;
  bindingRegistryVersion: string | null;
  executorAgent: string | null;
  executorAdapter: string | null;
  executorVersion: string | null;
  effectiveOutputArtifactRef: string | null;
  effectiveOutputArtifactVersion: string | null;
  effectiveOutputDigest: string | null;
  gateResult: LoopCapabilityGateResult | null;
  unresolvedFindingsRef: string | null;
  unresolvedFindingsDigest: string | null;
  nextStepEligibility: LoopNextStepEligibility | null;
  errorCode: string | null;
  retryable: boolean | null;
  reasonCode: string | null;
}

/**
 * Recovery projection of one v2 execution point (capability + executionRole):
 * the per-capability state grouped across roles cannot distinguish
 * solution-gate's scan and verdict progress, so dispatch decisions consume
 * this point-wise projection.
 */
export interface ExecutionPointRecoveryState {
  capability: NodeCapabilityId;
  executionRole: CapabilityExecutionRole;
  status: LoopCapabilityExecutionStatus | "not_started";
  lastAttempt: number;
  bindingId: string | null;
  bindingVersion: string | null;
  executorAgent: string | null;
  effectiveOutputArtifactRef: string | null;
  effectiveOutputArtifactVersion: string | null;
  effectiveOutputDigest: string | null;
  gateResult: LoopCapabilityGateResult | null;
  nextStepEligibility: LoopNextStepEligibility | null;
  retryable: boolean | null;
  /** v3 (Round 1): the persisted Finding Ledger of a scan round. */
  unresolvedFindingsRef: string | null;
  unresolvedFindingsDigest: string | null;
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
  const capabilityExecutions = store.listCapabilityExecutions(snapshot.state.identity.runId);
  const stateForEvents = (events: readonly LoopCapabilityExecutionEvent[]) => {
    const last = events.length === 0 ? undefined : events[events.length - 1];
    const lastSucceeded = [...events].reverse().find((event) => event.status === "succeeded");
    return { last, lastSucceeded };
  };
  // v2: point-wise projection over the eight execution points. Dispatch
  // decisions consume this; the capability-level states below aggregate both
  // solution-gate roles for compatibility.
  const executionPointStates = LOOP_CAPABILITY_EXECUTION_POINTS.map(
    ({ capability, executionRole }): ExecutionPointRecoveryState => {
      const events = capabilityExecutions.filter(
        (event) => event.capability === capability && event.executionRole === executionRole,
      );
      const { last, lastSucceeded } = stateForEvents(events);
      return Object.freeze({
        capability,
        executionRole,
        status: last?.status ?? "not_started",
        lastAttempt: last?.attempt ?? 0,
        bindingId: last?.bindingId ?? null,
        bindingVersion: last?.bindingVersion ?? null,
        executorAgent: last?.executorAgent ?? null,
        effectiveOutputArtifactRef: lastSucceeded?.outputArtifactRef ?? null,
        effectiveOutputArtifactVersion: lastSucceeded?.outputArtifactVersion ?? null,
        effectiveOutputDigest: lastSucceeded?.outputDigest ?? null,
        gateResult: lastSucceeded?.gateResult ?? null,
        nextStepEligibility: last?.nextStepEligibility ?? null,
        retryable: last?.retryable ?? null,
        unresolvedFindingsRef: lastSucceeded?.unresolvedFindingsRef ?? null,
        unresolvedFindingsDigest: lastSucceeded?.unresolvedFindingsDigest ?? null,
      });
    },
  );
  let nextExecutionPoint: RunRecoveryContext["nextExecutionPoint"] = null;
  let linearStopIdx: number | null = null;
  const pointIndexOf = (point: { capability: NodeCapabilityId; executionRole: CapabilityExecutionRole }): number =>
    LOOP_CAPABILITY_EXECUTION_POINTS.findIndex(
      (candidate) => candidate.capability === point.capability && candidate.executionRole === point.executionRole,
    );
  for (let i = 0; i < executionPointStates.length; i += 1) {
    const pointState = executionPointStates[i]!;
    const point = {
      capability: pointState.capability,
      executionRole: pointState.executionRole,
    };
    linearStopIdx = i;
    if (pointState.status === "failed") {
      nextExecutionPoint = pointState.retryable === true ? point : null;
      break;
    }
    if (pointState.status === "started") {
      nextExecutionPoint = null;
      break;
    }
    if (pointState.status === "not_started") {
      nextExecutionPoint = point;
      break;
    }
    if (pointState.nextStepEligibility !== "ELIGIBLE") {
      nextExecutionPoint = null;
      break;
    }
  }
  let regateTargetIndex: number | null = null;
  let regateOverrideApplied = false;
  const findings = capabilityExecutions.length > 0
    ? store.listFindings(state.identity.runId)
    : [];
  const currentByNode = new Map<NodeCapabilityId, CurrentRevisionFacts>();
  for (const fact of store.listRegateCurrentFacts(state.identity.runId)) {
    currentByNode.set(fact.nodeId, { validity: fact.validity, generation: fact.generation });
  }
  const pointLastAttempts = new Map<string, number>(
    executionPointStates.map((state) => [
      `${state.capability}:${state.executionRole}`,
      state.lastAttempt,
    ]),
  );
  // WP4 H3: external feedback re-enters ONLY through a verified WP1
  // FEEDBACK_DRIVEN_CHANGE record; it drives a full new generation
  // regardless of whether any finding exists.
  const changeRecords = store.listRequirementChanges(state.identity.runId);
  const latestFeedback = [...changeRecords]
    .reverse()
    .find(
      (record) =>
        record.changeKind === "FEEDBACK_DRIVEN_CHANGE" &&
        record.status === "CLASSIFIED" &&
        record.previousGeneration !== null,
    );
  const feedbackChange =
    latestFeedback === undefined || latestFeedback.previousGeneration === null
      ? null
      : { previousGeneration: latestFeedback.previousGeneration };
  const plan = planRegateFromFacts(
    findings.map((finding) => ({
      findingId: finding.findingId,
      severity: finding.severity,
      status: finding.status,
      earliestAffectedNodeId: finding.earliestAffectedNodeId,
      causeKind: finding.causeKind,
      createdAt: finding.createdAt,
    })),
    currentByNode,
    pointLastAttempts,
    feedbackChange,
  );
  if (plan.kind === "regate" && plan.restartPointIndex !== null) {
    regateTargetIndex = plan.restartPointIndex;
  }
  if (
    regateTargetIndex !== null &&
    (nextExecutionPoint === null || pointIndexOf(nextExecutionPoint) > regateTargetIndex) &&
    !(nextExecutionPoint === null && linearStopIdx !== null && linearStopIdx < regateTargetIndex)
  ) {
    const target = LOOP_CAPABILITY_EXECUTION_POINTS[regateTargetIndex]!;
    nextExecutionPoint = { capability: target.capability, executionRole: target.executionRole };
    regateOverrideApplied = true;
  }
  const capabilityStates = NODE_CAPABILITY_IDS.map((capability): CapabilityRecoveryState => {
    const events = capabilityExecutions.filter((event) => event.capability === capability);
    const { last, lastSucceeded } = stateForEvents(events);
    return Object.freeze({
      capability,
      status: last?.status ?? "not_started",
      lastAttempt: last?.attempt ?? 0,
      lastExecutionRole: last?.executionRole ?? null,
      bindingId: last?.bindingId ?? null,
      bindingVersion: last?.bindingVersion ?? null,
      bindingRegistryVersion: last?.bindingRegistryVersion ?? null,
      executorAgent: last?.executorAgent ?? null,
      executorAdapter: last?.executorAdapter ?? null,
      executorVersion: last?.executorVersion ?? null,
      effectiveOutputArtifactRef: lastSucceeded?.outputArtifactRef ?? null,
      effectiveOutputArtifactVersion: lastSucceeded?.outputArtifactVersion ?? null,
      effectiveOutputDigest: lastSucceeded?.outputDigest ?? null,
      gateResult: lastSucceeded?.gateResult ?? null,
      unresolvedFindingsRef: lastSucceeded?.unresolvedFindingsRef ?? null,
      unresolvedFindingsDigest: lastSucceeded?.unresolvedFindingsDigest ?? null,
      nextStepEligibility: last?.nextStepEligibility ?? null,
      errorCode: last?.errorCode ?? null,
      retryable: last?.retryable ?? null,
      reasonCode: last?.reasonCode ?? null,
    });
  });
  const lastCapabilityExecution = capabilityExecutions.length === 0
    ? null
    : capabilityExecutions[capabilityExecutions.length - 1]!;
  const lastExecutionEvent = [...snapshot.events].reverse().find(
    (event) => event.kind === "stage_started" || event.kind === "stage_succeeded" || event.kind === "stage_failed",
  );
  // WP4 convergence projection (H2): the finding gate over ALL findings and
  // the depth decision bound to the latest formal_verdict round. A
  // PASS_WITH_RISK verdict is DECIDED only with a current ACCEPTED_RISK
  // proof; everything else is BLOCKED_UNKNOWN and must not reach
  // task-planning or beyond.
  const findingGate = capabilityExecutions.length > 0
    ? store.computeFindingGate(state.identity.runId)
    : { status: "ELIGIBLE" as const, blockingFindings: [] as readonly string[], reasonCodes: [] as readonly string[] };
  const verdictEvents = capabilityExecutions.filter(
    (event) => event.capability === "solution-gate" && event.executionRole === "formal_verdict",
  );
  const lastVerdict = verdictEvents.length === 0 ? null : verdictEvents[verdictEvents.length - 1]!;
  let solutionGateDecision: RunRecoveryContext["solutionGateDecision"] = null;
  if (lastVerdict !== null) {
    // The decision binds to the CURRENT gate node revision: the verdict's
    // output must still be the ACTIVE current of solution-gate. A later
    // generation that superseded the verdict invalidates the decision.
    const gateCurrentFact = store
      .listRegateCurrentFacts(state.identity.runId)
      .find((fact) => fact.nodeId === "solution-gate");
    const boundToCurrentGate =
      lastVerdict.status === "succeeded" &&
      gateCurrentFact !== undefined &&
      gateCurrentFact.validity === "ACTIVE" &&
      gateCurrentFact.artifactRef === lastVerdict.outputArtifactRef &&
      gateCurrentFact.digest === lastVerdict.outputDigest;
    const boundRef = lastVerdict.status === "succeeded" ? lastVerdict.outputArtifactRef : null;
    // PASS_WITH_RISK is DECIDED only with an ACCEPTED_RISK proof from the
    // SAME decision scope: the risk-accepted finding's source revision must
    // carry the same generation as the verdict round (same wave).
    let pwrProofSameScope = false;
    if (lastVerdict.status === "succeeded" && lastVerdict.gateResult === "PASS_WITH_RISK") {
      // Same decision scope: the risk-accepted finding must originate from a
      // revision of the same wave as the verdict (generation <= verdict's).
      const verdictGen = store
        .listArtifactRevisions(state.identity.runId)
        .find((item) => item.artifactRef === lastVerdict.outputArtifactRef)
        ?.generation ?? null;
      pwrProofSameScope = findings.some((finding) => {
        if (finding.status !== "ACCEPTED_RISK") return false;
        const sourceRev = store
          .listArtifactRevisions(state.identity.runId)
          .find((item) => item.revisionId === finding.sourceRevisionId);
        return (
          sourceRev !== undefined &&
          verdictGen !== null &&
          sourceRev.generation !== null &&
          sourceRev.generation <= verdictGen
        );
      });
    }
    // Round 2 review H1: the depth choice must be MATERIALIZED on the
    // verdict event itself — gateResult alone never admits implementation.
    const decisionMaterialized =
      lastVerdict.decisionDepth !== null && lastVerdict.decisionScopeId !== null;
    if (lastVerdict.status === "succeeded" && !boundToCurrentGate) {
      solutionGateDecision = { status: "BLOCKED_UNKNOWN", boundVerdictArtifactRef: null };
    } else if (
      lastVerdict.status === "succeeded" && lastVerdict.gateResult === "PASS" &&
      decisionMaterialized
    ) {
      solutionGateDecision = { status: "DECIDED", boundVerdictArtifactRef: boundRef };
    } else if (
      lastVerdict.status === "succeeded" && lastVerdict.gateResult === "PASS_WITH_RISK" &&
      decisionMaterialized && pwrProofSameScope
    ) {
      solutionGateDecision = { status: "DECIDED", boundVerdictArtifactRef: boundRef };
    } else {
      solutionGateDecision = { status: "BLOCKED_UNKNOWN", boundVerdictArtifactRef: null };
    }
  }
  // BLOCKED_UNKNOWN must not enter implementation: once the chain has reached
  // task-planning, cut the next pointer so the run blocks honestly — UNLESS a
  // pending Re-Gate wave restarts at or before the formal-verdict point, in
  // which case the wave itself re-adjudicates the gate (Round 2 H2: the cut
  // must never deadlock the wave against a stale-bound verdict).
  const taskPlanningIdx = LOOP_CAPABILITY_EXECUTION_POINTS.findIndex(
    (point) => point.capability === "task-planning",
  );
  const formalVerdictIdx = LOOP_CAPABILITY_EXECUTION_POINTS.findIndex(
    (point) => point.capability === "solution-gate" && point.executionRole === "formal_verdict",
  );
  let depthDecisionBlocked = false;
  if (
    solutionGateDecision?.status === "BLOCKED_UNKNOWN" &&
    linearStopIdx !== null && linearStopIdx >= taskPlanningIdx &&
    !(regateTargetIndex !== null && regateTargetIndex <= formalVerdictIdx)
  ) {
    nextExecutionPoint = null;
    depthDecisionBlocked = true;
  }
  // Project all externally visible dispatch state only after Re-Gate and
  // depth-decision admission have both finalized the pointer. This keeps the
  // capability projection and chain status consistent with nextExecutionPoint.
  const capabilityChainStatus: RunRecoveryContext["capabilityChainStatus"] =
    depthDecisionBlocked
      ? "BLOCKED"
      : executionPointStates.every(
        (item) => item.status === "succeeded" && item.nextStepEligibility === "ELIGIBLE",
      )
        ? (regateOverrideApplied ? "READY" : "COMPLETED")
        : lastCapabilityExecution?.status === "started"
          ? "RUNNING"
          : lastCapabilityExecution !== null && nextExecutionPoint === null
            ? "BLOCKED"
            : "READY";
  const nextCapability = nextExecutionPoint?.capability ?? null;
  return Object.freeze({
    snapshot,
    currentStage: state.currentStage,
    currentAttempt: state.currentAttempt,
    fixRound: state.fixRound,
    status: state.status,
    blockingReasonCode: state.blockingReasonCode,
    failureReasonCode: state.failureReasonCode,
    capabilityStates: Object.freeze(capabilityStates),
    capabilityChainStatus,
    nextCapability,
    nextExecutionPoint: nextExecutionPoint === null ? null : Object.freeze(nextExecutionPoint),
    executionPointStates: Object.freeze(executionPointStates),
    lastCapabilityExecution,
    findingGate: { status: findingGate.status, blockingFindingIds: findingGate.blockingFindings },
    solutionGateDecision,
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
