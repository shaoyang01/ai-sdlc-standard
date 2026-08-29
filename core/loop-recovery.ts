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
import {
  bootstrapSourceVersion,
  readPlainDataRecord,
  validateBootstrapSourceProvenance,
} from "./loop-run-state";
import type { LoopRunStore } from "./loop-run-store";
import {
  LOOP_CAPABILITY_EXECUTION_POINTS,
  NODE_CAPABILITY_IDS,
  type CapabilityExecutionRole,
  type NodeCapabilityId,
} from "../loop/types";
import { planRegateFromFacts, type CurrentRevisionFacts, type RegatePlan } from "./loop-regate";
import {
  findPendingRevisionProducerExecution,
  type LoopCapabilityExecutionEvent,
  type LoopCapabilityExecutionStatus,
  type LoopCapabilityGateResult,
  type LoopNextStepEligibility,
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

/**
 * E4-T2 durable recovery classification. A fresh operator (or a resuming
 * entry) decides the next move from the journal alone; this is the single
 * machine-readable answer to "what kind of recovery does the interrupted
 * attempt require". Null only when there is nothing to recover (a completed
 * chain or a run that has not dispatched a capability yet).
 */
export type RecoveryClassification =
  | "SAFE_RETRY"
  | "VERIFY_STAGED"
  | "HUMAN_INPUT_REQUIRED"
  | "CLEANUP_REQUIRED"
  | "TERMINAL_FAILED_BLOCKED";

export const RECOVERY_CLASSIFICATIONS: readonly RecoveryClassification[] = Object.freeze([
  "SAFE_RETRY",
  "VERIFY_STAGED",
  "HUMAN_INPUT_REQUIRED",
  "CLEANUP_REQUIRED",
  "TERMINAL_FAILED_BLOCKED",
]);

/**
 * Pure classifier (unit-tested directly). The ordering is the precedence:
 * an explicit human request and a staged-but-unpromoted result outrank a
 * generic cleanup, and only a REAL process (non-null invocation digest) that
 * failed without staging anything implies a possibly-dirty attempt workspace
 * that must be isolated/cleaned rather than blindly retried. A deterministic
 * shadow failure carries no process evidence and is therefore SAFE_RETRY
 * when retryable — the pre-E4 "no side effects ⇒ retry" assumption stays
 * valid ONLY while no real process ran.
 */
export function classifyCapabilityRecovery(input: {
  chainStatus: RunRecoveryContext["capabilityChainStatus"];
  last: LoopCapabilityExecutionEvent | null;
  hasPendingRevisionMaterialization: boolean;
}): RecoveryClassification | null {
  const { chainStatus, last, hasPendingRevisionMaterialization } = input;
  if (chainStatus === "COMPLETED") return null;
  // An open terminal→revision window is closed by replaying materialization
  // from journal facts (no re-dispatch, no external side effect): safe.
  if (hasPendingRevisionMaterialization) return "SAFE_RETRY";
  if (last === null) return null;
  if (last.humanActionRef !== null) return "HUMAN_INPUT_REQUIRED";
  if (last.status === "failed" && last.stagingRef !== null && last.promotionRef === null) {
    return "VERIFY_STAGED";
  }
  if (last.status === "failed" && last.processInvocationDigest !== null && last.stagingRef === null) {
    return "CLEANUP_REQUIRED";
  }
  if (last.status === "started") return "SAFE_RETRY";
  if (last.status === "failed" && last.retryable === true) return "SAFE_RETRY";
  if (last.status === "failed") return "TERMINAL_FAILED_BLOCKED";
  // A succeeded tail whose forward pointer was cut (e.g. BLOCKED gate /
  // depth decision) cannot self-advance: terminal-blocked, needs adjudication.
  return "TERMINAL_FAILED_BLOCKED";
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
   * E4-T2: the single machine-readable recovery class of the interrupted
   * attempt, or null when nothing needs recovery (COMPLETED / not started).
   */
  recoveryClassification: RecoveryClassification | null;
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
  /**
   * Round 3 review F2: the earliest succeeded producer execution whose node
   * revision has not been materialized yet, or null. While this is non-null
   * the terminal→revision window is still open: callers MUST finalize (or
   * replay) this producer's revision materialization instead of dispatching
   * the agent again, and the dispatch permit denies new work.
   */
  pendingRevisionMaterialization: Readonly<{
    producerExecution: LoopCapabilityExecutionEvent;
  }> | null;
  /**
   * C02-WP5 (G6): the run's orchestration generation authority derived from
   * the verified change chain — generation 1 baseline, or the latest
   * CLASSIFIED FEEDBACK_DRIVEN_CHANGE record's previousGeneration + 1.
   */
  generation: number;
  /**
   * C02-WP5 (G6): the latest WP1 change record in the run (sequence order),
   * reduced to the facts another entry needs to resume without
   * reinterpreting confirmed facts. Null before the first change lands.
   */
  latestChangeRecord: Readonly<{
    changeRecordId: string;
    sequence: number;
    status: string;
    changeKind: string | null;
    payloadForm: string | null;
    previousGeneration: number | null;
    currentChangeScope: string | null;
    confirmedFactsPreserved: readonly string[];
  }> | null;
  /**
   * C02-WP5 (G6): per-node CURRENT artifact revision identity map — stable
   * path, internal SemVer, immutable ref/digest, validity and Gate — read
   * through the verified regate-facts reader. This is the machine-checkable
   * answer to "which artifact version is currently authoritative per node".
   */
  currentArtifactMap: readonly CurrentArtifactFact[];
  /** C02-WP5 (G6): all OPEN findings bound to their earliest affected node. */
  openFindings: readonly OpenFindingFact[];
  /**
   * C02-WP5 (G6): every revision that has lost current eligibility — STALE
   * via finding invalidation or SUPERSEDED by a newer generation — so a
   * resuming entry can see exactly which historical versions are non-current.
   */
  invalidatedRevisions: readonly InvalidatedRevisionFact[];
  /**
   * C02-WP5: the Re-Gate plan projection over the recovered facts — the
   * governing findings, reused upstream nodes and rebuild scope a fresh
   * agent needs to continue an interrupted wave.
   */
  regatePlan: RegatePlan;
  /**
   * C02-WP5 F2: the input triple the run's FIRST requirement-intake claim
   * consumed — the persisted normalized Requirement source and therefore the
   * confirmed-facts anchor of generation 1. Non-null for every recovered
   * run; a recovery dispatch at the intake point MUST consume exactly this
   * triple instead of caller-supplied replacement content.
   */
  originRequirementInput: Readonly<{
    inputArtifactRef: string;
    inputArtifactVersion: string;
    inputDigest: string;
  }> | null;
}

/** Reduced CURRENT-revision fact of one canonical node (C02-WP5). */
export interface CurrentArtifactFact {
  nodeId: NodeCapabilityId;
  revisionId: string;
  stablePath: string;
  semver: string;
  artifactKind: string;
  artifactRef: string;
  digest: string;
  validity: string;
  generation: number | null;
  gateResult: LoopCapabilityGateResult | null;
}

/** Reduced OPEN-finding fact (C02-WP5). */
export interface OpenFindingFact {
  findingId: string;
  severity: string;
  category: string;
  causeKind: string;
  sourceCapability: NodeCapabilityId;
  sourceRevisionId: string;
  earliestAffectedNodeId: NodeCapabilityId;
  createdAt: string;
}

/** Reduced STALE-revision fact (C02-WP5). */
export interface InvalidatedRevisionFact {
  nodeId: NodeCapabilityId;
  revisionId: string;
  semver: string;
  artifactRef: string;
  digest: string;
  supersededBy: string | null;
}

/**
 * C02-WP5: the dispatch command an entry must execute next, derived ONLY
 * from the recovery context. `inputArtifactRef === null` marks the intake
 * point, where the normalized Requirement source is caller-supplied content
 * (kind-checked at the entry); every later point pins the exact input triple
 * to the predecessor point's effective output AND — when that predecessor
 * authors a node revision — to that node's ACTIVE current.
 */
export interface DispatchCommand {
  capability: NodeCapabilityId;
  executionRole: CapabilityExecutionRole;
  /**
   * The next attempt number for the point (`lastAttempt + 1`). Started
   * events carry no output version (schema requires null result fields), so
   * the attempt number is the claim-time comparable form of the
   * attempt-scoped N.0.0 output contract.
   */
  attempt: number;
  inputArtifactRef: string | null;
  inputArtifactVersion: string | null;
  inputDigest: string | null;
  outputArtifactVersion: string;
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
  // C02-WP5 F1: the whole projection is assembled against ONE consistent
  // transaction — a concurrent writer can no longer produce a mixed context
  // (e.g., findings read before its commit, generation read after it).
  return store.readConsistent(() => recoverRunContextInTransaction(store, requirementId));
}

function recoverRunContextInTransaction(
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
  // Round 3 review F2: derive the pending revision materialization from the
  // same verified reads the rest of this context consumes — a succeeded
  // producer without its node revision keeps the terminal→revision window
  // open and must be finalized before any further dispatch.
  const artifactRevisions = capabilityExecutions.length > 0
    ? store.listArtifactRevisions(state.identity.runId)
    : [];
  const pendingRevisionProducer = findPendingRevisionProducerExecution(
    capabilityExecutions,
    artifactRevisions,
  );
  const currentByNode = new Map<NodeCapabilityId, CurrentRevisionFacts>();
  const regateFacts = capabilityExecutions.length > 0
    ? store.listRegateCurrentFacts(state.identity.runId)
    : [];
  for (const fact of regateFacts) {
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
    // Round 2 review H2: the binding is IDENTITY-based, not content-based —
    // the current must BE the revision that verdict authored (revision id +
    // producer execution id), so an equal-content older current cannot
    // impersonate the decision's anchor.
    const gateCurrentRevision = gateCurrentFact === undefined
      ? undefined
      : artifactRevisions
        .find((item) => item.revisionId === gateCurrentFact.revisionId);
    const boundToCurrentGate =
      lastVerdict.status === "succeeded" &&
      gateCurrentFact !== undefined &&
      gateCurrentFact.validity === "ACTIVE" &&
      gateCurrentFact.artifactRef === lastVerdict.outputArtifactRef &&
      gateCurrentFact.digest === lastVerdict.outputDigest &&
      gateCurrentRevision !== undefined &&
      gateCurrentRevision.producerExecutionId === lastVerdict.executionEventId;
    const boundRef = lastVerdict.status === "succeeded" ? lastVerdict.outputArtifactRef : null;
    // PASS_WITH_RISK is DECIDED only with an ACCEPTED_RISK proof from the
    // SAME decision scope: the risk-accepted finding's source revision must
    // carry the same generation as the verdict round (same wave).
    let pwrProofSameScope = false;
    if (lastVerdict.status === "succeeded" && lastVerdict.gateResult === "PASS_WITH_RISK") {
      // Round 2 review H2: same decision scope means the ACCEPTED_RISK
      // closure names THIS verdict round's decisionScopeId — a generation
      // comparison alone would let any old acceptance authorize any new
      // verdict on equal-generation products.
      pwrProofSameScope =
        lastVerdict.decisionScopeId !== null &&
        findings.some((finding) =>
          finding.status === "ACCEPTED_RISK" &&
          finding.riskAcceptedScopeId !== null &&
          finding.riskAcceptedScopeId === lastVerdict.decisionScopeId);
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
  // E4-T2: derive the single recovery class from the already-finalized chain
  // status, last event and pending-revision window.
  const recoveryClassification = classifyCapabilityRecovery({
    chainStatus: capabilityChainStatus,
    last: lastCapabilityExecution,
    hasPendingRevisionMaterialization: pendingRevisionProducer !== null,
  });
  // C02-WP5 (G6): surface the full recovery facts — generation authority,
  // latest change record, per-node current revision identity map, open
  // findings, invalidated revisions and the Re-Gate plan projection — so a
  // fresh entry can resume from the journal alone without reinterpreting
  // confirmed facts.
  const currentArtifactMap: CurrentArtifactFact[] = regateFacts.map((fact) => {
    const record = artifactRevisions.find((item) => item.revisionId === fact.revisionId);
    if (record === undefined) {
      throw new LoopRunJournalError(
        "STORE_CORRUPT",
        "recovery context: current pointer target is missing from the verified revision chain",
      );
    }
    return Object.freeze({
      nodeId: fact.nodeId,
      revisionId: fact.revisionId,
      stablePath: record.stablePath,
      semver: record.semver,
      artifactKind: record.artifactKind,
      artifactRef: fact.artifactRef,
      digest: fact.digest,
      validity: fact.validity,
      generation: fact.generation,
      gateResult: record.gateResult,
    });
  });
  const openFindings: OpenFindingFact[] = findings
    .filter((finding) => finding.status === "OPEN")
    .map((finding) => Object.freeze({
      findingId: finding.findingId,
      severity: finding.severity,
      category: finding.category,
      causeKind: finding.causeKind,
      sourceCapability: finding.sourceCapability,
      sourceRevisionId: finding.sourceRevisionId,
      earliestAffectedNodeId: finding.earliestAffectedNodeId,
      createdAt: finding.createdAt,
    }));
  // Invariant 5: invalidation is not deletion — a historical revision loses
  // current eligibility by being marked STALE (finding invalidation) or
  // SUPERSEDED (a newer generation's rebuild); both stay fully auditable.
  const invalidatedRevisions: InvalidatedRevisionFact[] = artifactRevisions
    .filter((record) => record.validity !== "ACTIVE")
    .map((record) => Object.freeze({
      nodeId: record.nodeId,
      revisionId: record.revisionId,
      semver: record.semver,
      artifactRef: record.artifactRef,
      digest: record.digest,
      supersededBy: record.supersededBy,
    }));
  const latestChange = changeRecords.length === 0 ? null : changeRecords[changeRecords.length - 1]!;
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
    recoveryClassification,
    findingGate: { status: findingGate.status, blockingFindingIds: findingGate.blockingFindings },
    solutionGateDecision,
    pendingRevisionMaterialization: pendingRevisionProducer === null
      ? null
      : Object.freeze({ producerExecution: pendingRevisionProducer }),
    generation: store.getRunGeneration(state.identity.runId),
    latestChangeRecord: latestChange === null
      ? null
      : Object.freeze({
          changeRecordId: latestChange.changeRecordId,
          sequence: latestChange.sequence,
          status: latestChange.status,
          changeKind: latestChange.changeKind,
          payloadForm: latestChange.payloadForm,
          previousGeneration: latestChange.previousGeneration,
          currentChangeScope: latestChange.currentChangeScope,
          confirmedFactsPreserved: latestChange.confirmedFactsPreserved,
        }),
    currentArtifactMap: Object.freeze(currentArtifactMap),
    openFindings: Object.freeze(openFindings),
    invalidatedRevisions: Object.freeze(invalidatedRevisions),
    regatePlan: plan,
    originRequirementInput: (() => {
      // B1: prefer the ATOMIC BOOTSTRAP provenance carried on run_started —
      // it exists before the first claim, so even a crash between bootstrap
      // and the intake dispatch leaves the confirmed-facts anchor durable.
      const startedEvent = snapshot.events.find((event) => event.kind === "run_started");
      if (
        startedEvent !== undefined &&
        (startedEvent.inputArtifactRef !== null) !== (startedEvent.inputDigest !== null)
      ) {
        throw new LoopRunJournalError(
          "STORE_CORRUPT",
          "persisted run_started provenance is a partial tuple",
        );
      }
      if (
        startedEvent !== undefined &&
        startedEvent.inputArtifactRef !== null && startedEvent.inputDigest !== null
      ) {
        // B1-2: persisted provenance MUST satisfy the same closed validator
        // the write path used. A writer-accepted but reader-rejected value is
        // tampered history — corruption-first, never silently ignored.
        let origin;
        try {
          origin = validateBootstrapSourceProvenance({
            artifactRef: startedEvent.inputArtifactRef,
            digest: startedEvent.inputDigest,
          });
        } catch (error) {
          if (error instanceof LoopRunJournalError) {
            throw new LoopRunJournalError(
              "STORE_CORRUPT",
              "persisted run_started provenance is not a canonical bootstrap source",
            );
          }
          throw error;
        }
        return Object.freeze({
          inputArtifactRef: origin.artifactRef,
          inputArtifactVersion: bootstrapSourceVersion(),
          inputDigest: origin.digest,
        });
      }
      const first = capabilityExecutions[0];
      if (
        first === undefined || first.capability !== "requirement-intake" ||
        first.executionRole !== "primary"
      ) {
        return null;
      }
      return Object.freeze({
        inputArtifactRef: first.inputArtifactRef,
        inputArtifactVersion: first.inputArtifactVersion,
        inputDigest: first.inputDigest,
      });
    })(),
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

/**
 * C02-WP5: derive the unique next dispatch command from a recovered context.
 * This is the ONLY sanctioned way to obtain what an entry may execute next —
 * callers cannot self-select a non-current node or a stale input. Returns
 * null when nothing is dispatchable (blocked / running / completed / pending
 * materialization). Throws ILLEGAL_TRANSITION when the derived input would
 * violate current-pointer authority: the predecessor point's effective
 * output must BE that node's ACTIVE current revision.
 */
export function deriveDispatchCommand(recovery: RunRecoveryContext): DispatchCommand | null {
  const next = recovery.nextExecutionPoint;
  if (next === null || recovery.pendingRevisionMaterialization !== null) {
    return null;
  }
  const pointIndex = LOOP_CAPABILITY_EXECUTION_POINTS.findIndex(
    (point) => point.capability === next.capability && point.executionRole === next.executionRole,
  );
  if (pointIndex < 0) {
    throw new LoopRunJournalError("STORE_CORRUPT", "recovery context holds a non-canonical execution point");
  }
  if (pointIndex === 0) {
    // C02-WP5 F2: a recovered run pins the intake dispatch to the ORIGINAL
    // persisted normalized Requirement source — the confirmed-facts anchor.
    // Only a genuinely fresh run (no claim yet) leaves the source to the
    // caller, kind-checked by the entry and the chain validator.
    const origin = recovery.originRequirementInput;
    if (origin !== null) {
      return Object.freeze({
        capability: next.capability,
        executionRole: next.executionRole,
        attempt: recovery.executionPointStates[pointIndex]!.lastAttempt + 1,
        inputArtifactRef: origin.inputArtifactRef,
        inputArtifactVersion: origin.inputArtifactVersion,
        inputDigest: origin.inputDigest,
        outputArtifactVersion: `${recovery.executionPointStates[pointIndex]!.lastAttempt + 1}.0.0`,
      });
    }
    return Object.freeze({
      capability: next.capability,
      executionRole: next.executionRole,
      attempt: recovery.executionPointStates[pointIndex]!.lastAttempt + 1,
      inputArtifactRef: null,
      inputArtifactVersion: null,
      inputDigest: null,
      outputArtifactVersion: `${recovery.executionPointStates[pointIndex]!.lastAttempt + 1}.0.0`,
    });
  }
  const predecessor = LOOP_CAPABILITY_EXECUTION_POINTS[pointIndex - 1]!;
  const predecessorState = recovery.executionPointStates[pointIndex - 1]!;
  if (
    predecessorState.status !== "succeeded" ||
    predecessorState.nextStepEligibility !== "ELIGIBLE" ||
    predecessorState.effectiveOutputArtifactRef === null ||
    predecessorState.effectiveOutputArtifactVersion === null ||
    predecessorState.effectiveOutputDigest === null
  ) {
    throw new LoopRunJournalError(
      "ILLEGAL_TRANSITION",
      "dispatch command requires an eligible predecessor execution point",
    );
  }
  // Claim-time current-pointer binding: when the predecessor point authors a
  // node revision (every point except the scan round, whose product is its
  // Finding Ledger), the consumed input must be EXACTLY that node's ACTIVE
  // current — path/version/ref/digest authority, fail-closed on stale.
  const predecessorAuthorsNodeRevision =
    !(predecessor.capability === "solution-gate" && predecessor.executionRole === "adversarial_scan");
  if (predecessorAuthorsNodeRevision) {
    const fact = recovery.currentArtifactMap.find((item) => item.nodeId === predecessor.capability);
    if (
      fact === undefined || fact.validity !== "ACTIVE" ||
      fact.artifactRef !== predecessorState.effectiveOutputArtifactRef ||
      fact.digest !== predecessorState.effectiveOutputDigest ||
      fact.semver !== predecessorState.effectiveOutputArtifactVersion
    ) {
      throw new LoopRunJournalError(
        "ILLEGAL_TRANSITION",
        "predecessor output is not the node's ACTIVE current revision",
      );
    }
  }
  return Object.freeze({
    capability: next.capability,
    executionRole: next.executionRole,
    attempt: recovery.executionPointStates[pointIndex]!.lastAttempt + 1,
    inputArtifactRef: predecessorState.effectiveOutputArtifactRef,
    inputArtifactVersion: predecessorState.effectiveOutputArtifactVersion,
    inputDigest: predecessorState.effectiveOutputDigest,
    outputArtifactVersion: `${recovery.executionPointStates[pointIndex]!.lastAttempt + 1}.0.0`,
  });
}

export { LoopRunJournalError };
