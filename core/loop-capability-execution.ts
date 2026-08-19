// LOOP Capability Execution Attempt Model (C01 WP-4B)
// =====================================================
// Orthogonal to the legacy delivery-stage state machine. These immutable,
// fixed-scalar events describe executions of the seven C01 node capabilities.
// They never persist prompts, stdout/stderr, patches, credentials or arbitrary
// JSON. Multi-value inputs/findings are represented by immutable artifact refs.

import type { AgentName } from "../execution/types";
import { types as utilTypes } from "node:util";
import {
  NODE_CAPABILITY_IDS,
  type NodeCapabilityId,
} from "../loop/types";
import { LoopRunJournalError } from "./loop-executor-types";
import { readPlainDataRecord } from "./loop-run-state";
import { runtimeExecutionPointForCapability } from "./runtime-capability-map";

export const LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION = 1 as const;

export type LoopCapabilityExecutionStatus = "started" | "succeeded" | "failed";
export type LoopCapabilityGateResult = "PASS" | "FAIL" | "PASS_WITH_RISK" | "NOT_APPLICABLE";
export type LoopNextStepEligibility = "ELIGIBLE" | "INELIGIBLE" | "BLOCKED";

export type LoopCapabilityExecutionEvent = Readonly<{
  schemaVersion: typeof LOOP_CAPABILITY_EXECUTION_SCHEMA_VERSION;
  executionEventId: string;
  runId: string;
  sequence: number;
  capability: NodeCapabilityId;
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
  nextStepEligibility: LoopNextStepEligibility | null;
  errorCode: string | null;
  retryable: boolean | null;
  reasonCode: string | null;
}>;

const EVENT_FIELDS = [
  "schemaVersion", "executionEventId", "runId", "sequence", "capability", "nodeId",
  "attempt", "status", "createdAt", "bindingId", "bindingVersion",
  "bindingRegistryVersion", "executorAgent", "executorAdapter", "executorVersion",
  "inputArtifactRef", "inputArtifactVersion", "inputDigest", "outputArtifactRef",
  "outputArtifactVersion", "outputDigest", "gateResult", "unresolvedFindingsRef",
  "unresolvedFindingsDigest", "nextStepEligibility", "errorCode", "retryable", "reasonCode",
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
  const nodeId = text(event.nodeId, "nodeId");
  if (nodeId !== runtimeExecutionPointForCapability(event.capability as NodeCapabilityId)) {
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
  if (bindingId !== `binding-${executorAgent}-${event.capability}`) {
    invalid("bindingId must match the executor and capability");
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
  if (outputRef !== null && (outputRef.kind !== "capability_output" || outputRef.digest !== outputDigest)) {
    invalid("output artifact reference must be a matching capability output");
  }
  const findingRef = nullableArtifactRef(event.unresolvedFindingsRef, "unresolvedFindingsRef");
  const findingDigest = nullableDigest(event.unresolvedFindingsDigest, "unresolvedFindingsDigest");
  if (findingRef !== null && (findingRef.kind !== "capability_findings" || findingRef.digest !== findingDigest)) {
    invalid("unresolved findings reference and digest must match");
  }
  if ((findingRef === null) !== (findingDigest === null)) invalid("unresolved finding ref and digest must appear together");
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
    const gateCapability = event.capability === "solution-review" || event.capability === "test-validation";
    if (gateCapability && event.gateResult === "NOT_APPLICABLE") {
      invalid("Gate-producing capability requires a conclusive Gate result");
    }
    if (!gateCapability && event.gateResult !== "NOT_APPLICABLE") {
      invalid("non-Gate capability must use NOT_APPLICABLE");
    }
    if (event.gateResult === "FAIL" && event.nextStepEligibility === "ELIGIBLE") {
      invalid("failed Gate must not make the next step eligible");
    }
    if (findingRef !== null && event.nextStepEligibility === "ELIGIBLE") {
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
    nextStepEligibility: event.nextStepEligibility,
    errorCode: event.errorCode,
    retryable: event.retryable,
    reasonCode: event.reasonCode,
  });
}

function sameAttemptIdentity(a: LoopCapabilityExecutionEvent, b: LoopCapabilityExecutionEvent): boolean {
  return a.runId === b.runId && a.capability === b.capability && a.nodeId === b.nodeId &&
    a.attempt === b.attempt && a.bindingId === b.bindingId && a.bindingVersion === b.bindingVersion &&
    a.bindingRegistryVersion === b.bindingRegistryVersion && a.executorAgent === b.executorAgent &&
    a.executorAdapter === b.executorAdapter && a.executorVersion === b.executorVersion &&
    a.inputArtifactRef === b.inputArtifactRef && a.inputArtifactVersion === b.inputArtifactVersion &&
    a.inputDigest === b.inputDigest;
}

/**
 * Verify a complete per-run attempt chain. One capability execution may be
 * active at a time; attempts are strictly increasing per capability and every
 * terminal event must close the exact preceding started snapshot.
 */
export function validateLoopCapabilityExecutionChain(
  events: readonly LoopCapabilityExecutionEvent[],
  expectedRunId: string,
): void {
  let active: LoopCapabilityExecutionEvent | null = null;
  const lastAttempts = new Map<NodeCapabilityId, number>();
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
      if (active !== null) invalid("only one capability execution may be active");
      const previous = index === 0 ? undefined : events[index - 1];
      if (previous === undefined) {
        if (event.capability !== NODE_CAPABILITY_IDS[0]) {
          invalid("the first capability execution must be requirement intake");
        }
        if (!event.inputArtifactRef.startsWith("loop-artifact:v1:requirement_summary:sha256:")) {
          invalid("requirement intake must consume a normalized Requirement source");
        }
      } else if (previous.status === "failed") {
        if (
          previous.retryable !== true || event.capability !== previous.capability ||
          event.inputArtifactRef !== previous.inputArtifactRef ||
          event.inputArtifactVersion !== previous.inputArtifactVersion ||
          event.inputDigest !== previous.inputDigest
        ) {
          invalid("only a retryable failed capability may be retried");
        }
      } else if (previous.status === "succeeded") {
        const previousIndex = NODE_CAPABILITY_IDS.indexOf(previous.capability);
        if (
          previous.nextStepEligibility !== "ELIGIBLE" ||
          event.capability !== NODE_CAPABILITY_IDS[previousIndex + 1]
        ) {
          invalid("capability execution must follow the canonical eligible chain");
        }
        if (
          event.inputArtifactRef !== previous.outputArtifactRef ||
          event.inputArtifactVersion !== previous.outputArtifactVersion ||
          event.inputDigest !== previous.outputDigest
        ) {
          invalid("capability input must match the predecessor's effective output");
        }
      } else {
        invalid("a new capability cannot start before the active attempt terminates");
      }
      const expectedAttempt = (lastAttempts.get(event.capability) ?? 0) + 1;
      if (event.attempt !== expectedAttempt) invalid("capability attempt must increment by one");
      active = event;
      lastAttempts.set(event.capability, event.attempt);
    } else {
      if (active === null || !sameAttemptIdentity(active, event)) {
        invalid("terminal capability event must close the active attempt");
      }
      active = null;
    }
  }
}
