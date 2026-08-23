// LOOP Capability Execution Attempt Model (C01 WP-4B)
// =====================================================
// Orthogonal to the legacy delivery-stage state machine. These immutable,
// fixed-scalar events describe executions of the seven C01 node capabilities.
// They never persist prompts, stdout/stderr, patches, credentials or arbitrary
// JSON. Multi-value inputs/findings are represented by immutable artifact refs.

import type { AgentName } from "../execution/types";
import { types as utilTypes } from "node:util";
import { CAPABILITY_ARTIFACT_TYPES } from "./agent-capability-bindings";
import {
  LOOP_CAPABILITY_EXECUTION_POINTS,
  NODE_CAPABILITY_EXECUTION_ROLES,
  NODE_CAPABILITY_IDS,
  type CapabilityExecutionRole,
  type NodeCapabilityId,
} from "../loop/types";
import { LoopRunJournalError } from "./loop-executor-types";
import { readPlainDataRecord } from "./loop-run-state";
import { historicalRestartAuthorized } from "./loop-regate";

// v2 (C02-WP3.5-B, A2): every execution event records its executionRole.
// v3 (Round 1 corrections): the adversarial_scan role MUST persist its
// Finding Ledger (an empty ledger is still an immutable artifact) and the
// formal_verdict role MUST record the exact ledger ref/digest it consumed —
// the chain validator binds them to the same solution-gate round. The v2
// schema is not silently accepted.
export const LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION = 3 as const;

export type LoopCapabilityExecutionStatus = "started" | "succeeded" | "failed";
export type LoopCapabilityGateResult = "PASS" | "FAIL" | "PASS_WITH_RISK" | "NOT_APPLICABLE";
export type LoopNextStepEligibility = "ELIGIBLE" | "INELIGIBLE" | "BLOCKED";

export type LoopCapabilityExecutionEvent = Readonly<{
  schemaVersion: typeof LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION;
  executionEventId: string;
  runId: string;
  sequence: number;
  capability: NodeCapabilityId;
  executionRole: CapabilityExecutionRole;
  nodeId: string;
  attempt: number;
  status: LoopCapabilityExecutionStatus;
  createdAt: string;
  bindingId: string;
  bindingVersion: string;
  bindingRegistryVersion: string;
  executorAgent: AgentName;
  executorAdapter: string;
  executorVersion: string;
  inputArtifactRef: string;
  inputArtifactVersion: string;
  inputDigest: string;
  outputArtifactRef: string | null;
  outputArtifactVersion: string | null;
  outputDigest: string | null;
  gateResult: LoopCapabilityGateResult | null;
  unresolvedFindingsRef: string | null;
  unresolvedFindingsDigest: string | null;
  /** v3: the Finding Ledger this formal_verdict execution consumed. */
  consumedFindingsRef: string | null;
  consumedFindingsDigest: string | null;
  nextStepEligibility: LoopNextStepEligibility | null;
  errorCode: string | null;
  retryable: boolean | null;
  reasonCode: string | null;
}>;

const EVENT_FIELDS = [
  "schemaVersion", "executionEventId", "runId", "sequence", "capability", "executionRole", "nodeId",
  "attempt", "status", "createdAt", "bindingId", "bindingVersion",
  "bindingRegistryVersion", "executorAgent", "executorAdapter", "executorVersion",
  "inputArtifactRef", "inputArtifactVersion", "inputDigest", "outputArtifactRef",
  "outputArtifactVersion", "outputDigest", "gateResult", "unresolvedFindingsRef",
  "unresolvedFindingsDigest", "consumedFindingsRef", "consumedFindingsDigest",
  "nextStepEligibility", "errorCode", "retryable", "reasonCode",
] as const;

const AGENTS: readonly AgentName[] = ["kimi", "codex", "hermes"];
const ADAPTER_BY_AGENT: Readonly<Record<AgentName, string>> = Object.freeze({
  kimi: "kimi-cli",
  codex: "codex-real-dispatch",
  hermes: "hermes-cli",
});
const STATUSES: readonly LoopCapabilityExecutionStatus[] = ["started", "succeeded", "failed"];
const GATE_RESULTS: readonly LoopCapabilityGateResult[] = ["PASS", "FAIL", "PASS_WITH_RISK", "NOT_APPLICABLE"];
const ELIGIBILITY_VALUES: readonly LoopNextStepEligibility[] = ["ELIGIBLE", "INELIGIBLE", "BLOCKED"];
const CONTROL_RE = /[\x00-\x1f\x7f-\x9f]/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const REGISTRY_VERSION_RE = /^[1-9][0-9]*$/;
const ARTIFACT_REF_RE = /^loop-artifact:v1:([a-z_]+):sha256:([0-9a-f]{64})$/;

function invalid(message: string): never {
  throw new LoopRunJournalError("INVALID_INPUT", message);
}

function exactFields(record: Record<string, unknown>): void {
  const keys = Object.keys(record);
  if (
    keys.length !== EVENT_FIELDS.length ||
    EVENT_FIELDS.some((field) => !(field in record)) ||
    keys.some((key) => !(EVENT_FIELDS as readonly string[]).includes(key))
  ) {
    invalid("capability execution event must contain exactly the canonical fields");
  }
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value || CONTROL_RE.test(value)) {
    invalid(`${label} must be a safe trimmed non-empty string`);
  }
  return value;
}

function nullableText(value: unknown, label: string): string | null {
  return value === null ? null : text(value, label);
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    invalid(`${label} must be a positive safe integer`);
  }
  return value;
}

function digest(value: unknown, label: string): string {
  const result = text(value, label);
  if (!SHA256_RE.test(result)) invalid(`${label} must be a lowercase SHA-256 hex`);
  return result;
}

function nullableDigest(value: unknown, label: string): string | null {
  return value === null ? null : digest(value, label);
}

function version(value: unknown, label: string): string {
  const result = text(value, label);
  if (!VERSION_RE.test(result)) invalid(`${label} must be a semantic version`);
  return result;
}

function nullableVersion(value: unknown, label: string): string | null {
  return value === null ? null : version(value, label);
}

function artifactRef(value: unknown, label: string): { value: string; kind: string; digest: string } {
  const result = text(value, label);
  const match = ARTIFACT_REF_RE.exec(result);
  if (match === null) invalid(`${label} must be a canonical content-addressed artifact reference`);
  return { value: result, kind: match[1]!, digest: match[2]! };
}

function nullableArtifactRef(value: unknown, label: string): ReturnType<typeof artifactRef> | null {
  return value === null ? null : artifactRef(value, label);
}

/** Validate the exact fixed-scalar event contract and status-specific rules. */
export function validateLoopCapabilityExecutionEvent(value: unknown): void {
  if (utilTypes.isProxy(value)) invalid("capability execution event must not be a Proxy");
  const event = readPlainDataRecord(value, "capability execution event");
  exactFields(event);
  if (event.schemaVersion !== LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION) {
    invalid("capability execution schema version is unsupported");
  }
  text(event.executionEventId, "executionEventId");
  const runId = text(event.runId, "runId");
  const sequence = positiveInteger(event.sequence, "sequence");
  if (typeof event.capability !== "string" || !NODE_CAPABILITY_IDS.includes(event.capability as NodeCapabilityId)) {
    invalid("capability must be a canonical NodeCapabilityId");
  }
  // v2 (A2): the execution role must be one of the capability's required
  // roles — primary everywhere except solution-gate's two fixed roles.
  const requiredRoles = NODE_CAPABILITY_EXECUTION_ROLES[event.capability as NodeCapabilityId];
  if (
    typeof event.executionRole !== "string" ||
    requiredRoles === undefined ||
    !(requiredRoles as readonly string[]).includes(event.executionRole)
  ) {
    invalid("executionRole must be a required role of the capability");
  }
  const nodeId = text(event.nodeId, "nodeId");
  if (nodeId !== event.capability) {
    invalid("nodeId must match the canonical capability execution point");
  }
  positiveInteger(event.attempt, "attempt");
  if (typeof event.status !== "string" || !STATUSES.includes(event.status as LoopCapabilityExecutionStatus)) {
    invalid("status must be a canonical capability execution status");
  }
  const createdAt = text(event.createdAt, "createdAt");
  if (!ISO_RE.test(createdAt) || Number.isNaN(Date.parse(createdAt))) invalid("createdAt must be an ISO-8601 timestamp");
  const bindingId = text(event.bindingId, "bindingId");
  version(event.bindingVersion, "bindingVersion");
  const registryVersion = text(event.bindingRegistryVersion, "bindingRegistryVersion");
  if (!REGISTRY_VERSION_RE.test(registryVersion)) invalid("bindingRegistryVersion must be a positive integer string");
  if (typeof event.executorAgent !== "string" || !AGENTS.includes(event.executorAgent as AgentName)) {
    invalid("executorAgent must be a supported agent");
  }
  const executorAgent = event.executorAgent as AgentName;
  if (bindingId !== `binding-${executorAgent}-${event.capability}-${event.executionRole}`) {
    invalid("bindingId must match the executor, capability and execution role");
  }
  const executorAdapter = text(event.executorAdapter, "executorAdapter");
  if (executorAdapter !== ADAPTER_BY_AGENT[executorAgent]) {
    invalid("executorAdapter must match the executor Agent");
  }
  version(event.executorVersion, "executorVersion");
  const inputRef = artifactRef(event.inputArtifactRef, "inputArtifactRef");
  version(event.inputArtifactVersion, "inputArtifactVersion");
  const inputDigest = digest(event.inputDigest, "inputDigest");
  if (inputRef.digest !== inputDigest) invalid("input artifact reference and digest must match");
  const outputRef = nullableArtifactRef(event.outputArtifactRef, "outputArtifactRef");
  const outputVersion = nullableVersion(event.outputArtifactVersion, "outputArtifactVersion");
  const outputDigest = nullableDigest(event.outputDigest, "outputDigest");
  // v2 (A4): the execution output reference kind is the node's canonical
  // product kind for BOTH solution-gate roles — the scan's Finding Ledger
  // rides in unresolvedFindingsRef (capability_findings) while the node
  // product remains solution_review.
  if (outputRef !== null &&
      (outputRef.kind !== CAPABILITY_ARTIFACT_TYPES[event.capability] || outputRef.digest !== outputDigest)) {
    invalid("output artifact reference must be a matching capability output");
  }
  const findingRef = nullableArtifactRef(event.unresolvedFindingsRef, "unresolvedFindingsRef");
  const findingDigest = nullableDigest(event.unresolvedFindingsDigest, "unresolvedFindingsDigest");
  if (findingRef !== null && (findingRef.kind !== "capability_findings" || findingRef.digest !== findingDigest)) {
    invalid("unresolved findings reference and digest must match");
  }
  if ((findingRef === null) !== (findingDigest === null)) invalid("unresolved finding ref and digest must appear together");
  // v3 (Round 1): the formal_verdict role must record the exact Finding
  // Ledger it consumed; every other role must leave the binding empty.
  const isVerdictRole = event.capability === "solution-gate" && event.executionRole === "formal_verdict";
  const isScanRole = event.capability === "solution-gate" && event.executionRole === "adversarial_scan";
  const consumedRef = nullableArtifactRef(event.consumedFindingsRef, "consumedFindingsRef");
  const consumedDigest = nullableDigest(event.consumedFindingsDigest, "consumedFindingsDigest");
  if ((consumedRef === null) !== (consumedDigest === null)) invalid("consumed ledger ref and digest must appear together");
  if (consumedRef !== null && (consumedRef.kind !== "capability_findings" || consumedRef.digest !== consumedDigest)) {
    invalid("consumed ledger reference and digest must match");
  }
  if (isVerdictRole && consumedRef === null) {
    invalid("formal_verdict must record the Finding Ledger it consumes");
  }
  if (!isVerdictRole && (event.consumedFindingsRef !== null || event.consumedFindingsDigest !== null)) {
    invalid("only the formal_verdict role may bind a consumed Finding Ledger");
  }
  if (event.gateResult !== null && (typeof event.gateResult !== "string" || !GATE_RESULTS.includes(event.gateResult as LoopCapabilityGateResult))) {
    invalid("gateResult must be canonical or null");
  }
  if (
    event.nextStepEligibility !== null &&
    (typeof event.nextStepEligibility !== "string" || !ELIGIBILITY_VALUES.includes(event.nextStepEligibility as LoopNextStepEligibility))
  ) {
    invalid("nextStepEligibility must be canonical or null");
  }
  const errorCode = nullableText(event.errorCode, "errorCode");
  const reasonCode = nullableText(event.reasonCode, "reasonCode");
  if (event.retryable !== null && typeof event.retryable !== "boolean") invalid("retryable must be boolean or null");
  if (event.executionEventId !== `${runId}:capability:${sequence}:${event.status}`) {
    invalid("executionEventId must match run, sequence and status");
  }

  if (event.status === "started") {
    if (
      outputRef !== null || outputVersion !== null || outputDigest !== null || event.gateResult !== null ||
      findingRef !== null || event.nextStepEligibility !== null || errorCode !== null ||
      event.retryable !== null || reasonCode !== null
    ) {
      invalid("started capability execution must not contain result fields");
    }
    // The consumed-ledger claim is part of the dispatch claim itself so a
    // recovered verdict cannot swap ledgers between start and terminal.
    void consumedRef;
  } else if (event.status === "succeeded") {
    if (outputRef === null || outputVersion === null || outputDigest === null) {
      invalid("succeeded capability execution requires output ref, version and digest");
    }
    if (event.gateResult === null || event.nextStepEligibility === null) {
      invalid("succeeded capability execution requires Gate and next-step eligibility");
    }
    if (errorCode !== null || event.retryable !== null || reasonCode !== null) {
      invalid("succeeded capability execution must not contain failure fields");
    }
    // v2 role-level Gate rules (A2): only formal_verdict may write a
    // conclusive Gate result; the adversarial_scan role always records
    // NOT_APPLICABLE; every non-Gate capability stays NOT_APPLICABLE.
    const gateRole = event.capability === "solution-gate" ? event.executionRole : null;
    if (gateRole === "formal_verdict" && event.gateResult === "NOT_APPLICABLE") {
      invalid("formal_verdict requires a conclusive Gate result");
    }
    if (gateRole !== "formal_verdict" && event.gateResult !== "NOT_APPLICABLE") {
      invalid("non-verdict execution roles must use NOT_APPLICABLE");
    }
    if (event.gateResult === "FAIL" && event.nextStepEligibility === "ELIGIBLE") {
      invalid("failed Gate must not make the next step eligible");
    }
    // v3: the scan round always persists an immutable Finding Ledger — an
    // empty ledger is still an artifact. Its findings do not block the chain:
    // they are the formal_verdict execution's input.
    if (isScanRole && findingRef === null) {
      invalid("adversarial_scan must persist its Finding Ledger");
    }
    if (gateRole !== "adversarial_scan" && findingRef !== null && event.nextStepEligibility === "ELIGIBLE") {
      invalid("unresolved findings must not make the next step eligible");
    }
  } else {
    if (outputRef !== null || outputVersion !== null || outputDigest !== null || event.gateResult !== null || findingRef !== null) {
      invalid("failed capability execution must not contain successful result fields");
    }
    if (errorCode === null && reasonCode === null) invalid("failed capability execution requires an error or reason code");
    if (event.nextStepEligibility !== "BLOCKED") invalid("failed capability execution must block the next step");
    if (typeof event.retryable !== "boolean") invalid("failed capability execution requires retryable");
  }
}

/** Fixed-order canonical representation used by the run-journal hash. */
export function canonicalizeLoopCapabilityExecutionEvent(event: LoopCapabilityExecutionEvent): string {
  validateLoopCapabilityExecutionEvent(event);
  return JSON.stringify({
    schemaVersion: event.schemaVersion,
    executionEventId: event.executionEventId,
    runId: event.runId,
    sequence: event.sequence,
    capability: event.capability,
    executionRole: event.executionRole,
    nodeId: event.nodeId,
    attempt: event.attempt,
    status: event.status,
    createdAt: event.createdAt,
    bindingId: event.bindingId,
    bindingVersion: event.bindingVersion,
    bindingRegistryVersion: event.bindingRegistryVersion,
    executorAgent: event.executorAgent,
    executorAdapter: event.executorAdapter,
    executorVersion: event.executorVersion,
    inputArtifactRef: event.inputArtifactRef,
    inputArtifactVersion: event.inputArtifactVersion,
    inputDigest: event.inputDigest,
    outputArtifactRef: event.outputArtifactRef,
    outputArtifactVersion: event.outputArtifactVersion,
    outputDigest: event.outputDigest,
    gateResult: event.gateResult,
    unresolvedFindingsRef: event.unresolvedFindingsRef,
    unresolvedFindingsDigest: event.unresolvedFindingsDigest,
    consumedFindingsRef: event.consumedFindingsRef,
    consumedFindingsDigest: event.consumedFindingsDigest,
    nextStepEligibility: event.nextStepEligibility,
    errorCode: event.errorCode,
    retryable: event.retryable,
    reasonCode: event.reasonCode,
  });
}

// The consumed-ledger claim is part of the attempt's dispatch identity: a
// terminal event may not substitute a different Finding Ledger than the one
// its started event claimed, so the binding holds across the attempt's whole
// lifecycle — start, terminal and every retry — not just the start instant.
function sameAttemptIdentity(a: LoopCapabilityExecutionEvent, b: LoopCapabilityExecutionEvent): boolean {
  return a.runId === b.runId && a.capability === b.capability && a.executionRole === b.executionRole &&
    a.nodeId === b.nodeId &&
    a.attempt === b.attempt && a.bindingId === b.bindingId && a.bindingVersion === b.bindingVersion &&
    a.bindingRegistryVersion === b.bindingRegistryVersion && a.executorAgent === b.executorAgent &&
    a.executorAdapter === b.executorAdapter && a.executorVersion === b.executorVersion &&
    a.inputArtifactRef === b.inputArtifactRef && a.inputArtifactVersion === b.inputArtifactVersion &&
    a.inputDigest === b.inputDigest &&
    a.consumedFindingsRef === b.consumedFindingsRef &&
    a.consumedFindingsDigest === b.consumedFindingsDigest;
}

/**
 * Verify a complete per-run attempt chain. One capability execution may be
 * active at a time; attempts are strictly increasing per execution point and
 * every terminal event must close the exact preceding started snapshot. The
 * chain advances along the eight v2 execution points (the seven-node chain
 * expanded by solution-gate's adversarial_scan / formal_verdict roles); the
 * formal_verdict dispatch must target a different agent than the
 * adversarial_scan execution of the same solution-gate round (v2, A2/G1).
 *
 * WP4 generation restarts: a backward jump to a point earlier than the
 * canonical successor is rejected unless the caller proves a pending Re-Gate
 * plan authorizes exactly that target index via
 * `context.allowedRestartTargetIndex`. The store derives this authorization
 * from OPEN blocking findings and current-revision facts inside the same
 * transaction — callers can never self-authorize a restart, and with no
 * pending plan the strictly linear v2 chain rules apply unchanged.
 */
export interface LoopCapabilityChainValidationContext {
  /**
   * Live pending Re-Gate target point index. In append mode (see
   * historicalReplayMode) this is the ONLY authorized restart target and it
   * must equal the new event's point exactly.
   */
  allowedRestartTargetIndex?: number | null;
  /**
   * Reduced findings enabling historical restart re-validation of
   * already-recorded jumps (see historicalRestartAuthorized).
   */
  historicalFindings?: import("./loop-regate").RegateFindingFacts[];
  /**
   * Replay mode (read paths / full-history re-validation): backward jumps
   * are authorized by the immutable covering-finding rule alone. Append
   * mode leaves this false — a new jump must match the live target exactly,
   * so closed/resolved findings can never authorize fresh writes (Round 2
   * review H1).
   */
  historicalReplayMode?: boolean;
  /**
   * Latest verified FEEDBACK_DRIVEN_CHANGE record fact (WP1). A recorded
   * backward jump landing on requirement-intake (point 0) that opens the
   * record's next generation is authorized by this immutable change record
   * even when no finding covers the target.
   */
  feedbackChange?: { previousGeneration: number } | null;
}

export function validateLoopCapabilityExecutionChain(
  events: readonly LoopCapabilityExecutionEvent[],
  expectedRunId: string,
  context?: LoopCapabilityChainValidationContext,
): void {
  let active: LoopCapabilityExecutionEvent | null = null;
  const lastAttempts = new Map<string, number>();
  const ids = new Set<string>();
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    validateLoopCapabilityExecutionEvent(event);
    if (event.runId !== expectedRunId) invalid("capability execution run identity mismatch");
    if (event.sequence !== index + 1) invalid("capability execution sequence must be contiguous from one");
    if (index > 0 && Date.parse(event.createdAt) < Date.parse(events[index - 1]!.createdAt)) {
      invalid("capability execution timestamps must be monotonic");
    }
    if (ids.has(event.executionEventId)) invalid("capability execution event id must be unique");
    ids.add(event.executionEventId);
    if (event.status === "started") {
      process.stderr?.write?.(`VSTART ${event.executionEventId} idx=${LOOP_CAPABILITY_EXECUTION_POINTS.findIndex((pt) => pt.capability === event.capability && pt.executionRole === event.executionRole)}\n`);
      if (active !== null) invalid("only one capability execution may be active");
      const previous = index === 0 ? undefined : events[index - 1];
      if (previous === undefined) {
        const firstPoint = LOOP_CAPABILITY_EXECUTION_POINTS[0]!;
        if (event.capability !== firstPoint.capability || event.executionRole !== firstPoint.executionRole) {
          invalid("the first capability execution must be requirement intake");
        }
        if (!event.inputArtifactRef.startsWith("loop-artifact:v1:requirement_summary:sha256:")) {
          invalid("requirement intake must consume a normalized Requirement source");
        }
      } else if (previous.status === "failed") {
        if (
          previous.retryable !== true || event.capability !== previous.capability ||
          event.executionRole !== previous.executionRole ||
          event.inputArtifactRef !== previous.inputArtifactRef ||
          event.inputArtifactVersion !== previous.inputArtifactVersion ||
          event.inputDigest !== previous.inputDigest ||
          event.consumedFindingsRef !== previous.consumedFindingsRef ||
          event.consumedFindingsDigest !== previous.consumedFindingsDigest
        ) {
          invalid("only a retryable failed capability may be retried");
        }
      } else if (previous.status === "succeeded") {
        const previousIndex = LOOP_CAPABILITY_EXECUTION_POINTS.findIndex(
          (point) =>
            point.capability === previous.capability &&
            point.executionRole === previous.executionRole,
        );
        const nextPoint = LOOP_CAPABILITY_EXECUTION_POINTS[previousIndex + 1];
        const thisIndex = LOOP_CAPABILITY_EXECUTION_POINTS.findIndex(
          (point) =>
            point.capability === event.capability &&
            point.executionRole === event.executionRole,
        );
        const isCanonicalNext =
          previous.nextStepEligibility === "ELIGIBLE" && nextPoint !== undefined &&
          event.capability === nextPoint.capability &&
          event.executionRole === nextPoint.executionRole;
        // WP4: a backward jump is a generation restart and is legal only at
        // the exact point index authorized by the pending Re-Gate plan
        // (append time) or covered by an immutable historical finding
        // (read-path re-validation of an already-recorded jump).
        const restartTarget = context?.allowedRestartTargetIndex ?? null;
        const replayMode = context?.historicalReplayMode === true;
        // Recorded backward jumps are validated by immutable journal facts
        // (covering finding / feedback record) on every replay — they were
        // live-authorized when appended and stay authorized forever.
        const historicalOk =
          context?.historicalFindings !== undefined &&
          historicalRestartAuthorized(context.historicalFindings, thisIndex);
        const historicalFeedbackOk =
          thisIndex === 0 &&
          context?.feedbackChange !== null &&
          context?.feedbackChange !== undefined;
        // Round 2 H1: the NEWLY appended event (last position, append mode)
        // is authorized EXCLUSIVELY by the exact live pending Re-Gate target
        // derived in the appending transaction — resolved or risk-accepted
        // findings can never authorize fresh writes.
        const liveExact =
          index === events.length - 1 &&
          !context?.historicalReplayMode &&
          restartTarget !== null && thisIndex === restartTarget;
        const isAuthorizedRestart =
          !isCanonicalNext &&
          thisIndex < previousIndex + 1 &&
          (liveExact || historicalOk || historicalFeedbackOk);
        if (!isCanonicalNext && !isAuthorizedRestart) {
          process.stderr?.write?.(`REJECT_DBG idx=${thisIndex} prevIdx=${previousIndex} len=${events.length} index=${index} evId=${event.executionEventId} prevId=${previous.executionEventId} elig=${previous.nextStepEligibility} allowed=${String(restartTarget)} replay=${String(replayMode)}\n`);
          invalid("capability execution must follow the canonical eligible chain");
        }
        if (!isCanonicalNext) {
          // Generation restart: the rebuilt point consumes the REUSED
          // upstream output — the last succeeded execution of the point
          // immediately before the restart target. A restart landing on
          // requirement intake re-consumes the normalized source instead.
          if (thisIndex === 0) {
            if (!event.inputArtifactRef.startsWith("loop-artifact:v1:requirement_summary:sha256:")) {
              invalid("requirement intake must consume a normalized Requirement source");
            }
          } else {
            const upstreamPoint = LOOP_CAPABILITY_EXECUTION_POINTS[thisIndex - 1]!;
            let upstreamSucceeded: LoopCapabilityExecutionEvent | undefined;
            for (let j = index - 1; j >= 0; j -= 1) {
              const candidate = events[j]!;
              if (
                candidate.status === "succeeded" &&
                candidate.capability === upstreamPoint.capability &&
                candidate.executionRole === upstreamPoint.executionRole
              ) {
                upstreamSucceeded = candidate;
                break;
              }
            }
            if (
              upstreamSucceeded === undefined ||
              upstreamSucceeded.nextStepEligibility !== "ELIGIBLE"
            ) {
              invalid("generation restart requires an eligible reused upstream output");
            }
            if (
              event.inputArtifactRef !== upstreamSucceeded.outputArtifactRef ||
              event.inputArtifactVersion !== upstreamSucceeded.outputArtifactVersion ||
              event.inputDigest !== upstreamSucceeded.outputDigest
            ) {
              invalid("restart input must match the reused upstream output");
            }
          }
        } else {
        // v2 (A2, G1): the formal_verdict dispatch must go to a different
        // agent than the adversarial_scan that produced the consumed ledger.
        if (
          previous.capability === "solution-gate" &&
          previous.executionRole === "adversarial_scan" &&
          event.executorAgent === previous.executorAgent
        ) {
          invalid("formal_verdict must be executed by a different agent than adversarial_scan");
        }
        // v3 (Round 1): the verdict consumes exactly THIS round's persisted
        // Finding Ledger — no reuse of older rounds, no missing ledger.
        if (
          previous.capability === "solution-gate" &&
          previous.executionRole === "adversarial_scan"
        ) {
          if (previous.unresolvedFindingsRef === null) {
            invalid("adversarial_scan round without a persisted Finding Ledger cannot be consumed");
          }
          if (
            event.consumedFindingsRef !== previous.unresolvedFindingsRef ||
            event.consumedFindingsDigest !== previous.unresolvedFindingsDigest
          ) {
            invalid("formal_verdict must consume exactly this round's Finding Ledger");
          }
        }
        if (
          event.inputArtifactRef !== previous.outputArtifactRef ||
          event.inputArtifactVersion !== previous.outputArtifactVersion ||
          event.inputDigest !== previous.outputDigest
        ) {
          invalid("capability input must match the predecessor's effective output");
        }
        }
      } else {
        invalid("a new capability cannot start before the active attempt terminates");
      }
      const slot = `${event.capability}:${event.executionRole}`;
      const expectedAttempt = (lastAttempts.get(slot) ?? 0) + 1;
      if (event.attempt !== expectedAttempt) invalid("capability attempt must increment by one");
      active = event;
      lastAttempts.set(slot, event.attempt);
    } else {
      if (active === null || !sameAttemptIdentity(active, event)) {
        invalid("terminal capability event must close the active attempt");
      }
      active = null;
    }
  }
}
