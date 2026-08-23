// LOOP Executor Kernel — Pure Run State Machine (LOOP-MVP-01A)
// =============================================================
// Pure functions only. No filesystem, SQLite, child_process, Git, network,
// process.env, ExecutionGateway, or Agent adapter imports.

import {
  LOOP_STAGE_NAMES,
  LOOP_RUN_EVENT_KINDS,
  LoopRunJournalError,
  type LoopRunEvent,
  type LoopRunEventKind,
  type LoopRunIdentity,
  type LoopRunState,
  type LoopStageName,
  type LoopStageState,
} from "./loop-executor-types";

// ── plain data record scan (fail-closed) ──
// Accepts only plain objects (Object.prototype or null prototype). Rejects
// arrays, class instances, accessor descriptors, symbol keys, "__proto__"
// keys, and any object whose reflection throws (e.g. Proxy traps). Never
// invokes getters; never leaks the original exception text.

export function readPlainDataRecord(value: unknown, label: string): Record<string, unknown> {
  const fail = (): never => {
    throw new LoopRunJournalError("INVALID_INPUT", `${label} must be a plain data record`);
  };
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail();
  let proto: unknown;
  try {
    proto = Object.getPrototypeOf(value);
  } catch {
    fail();
  }
  if (proto !== Object.prototype && proto !== null) fail();
  let descriptors: PropertyDescriptorMap;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail();
  }
  const out = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") fail();
    if (key === "__proto__") fail();
    const stringKey = key as string;
    const descriptor = (descriptors as Record<string, PropertyDescriptor>)[stringKey];
    if ("get" in descriptor || "set" in descriptor) fail();
    if (!("value" in descriptor)) fail();
    Object.defineProperty(out, stringKey, {
      value: descriptor.value,
      enumerable: true,
      writable: false,
      configurable: false,
    });
  }
  return out;
}

function requireFields(record: Record<string, unknown>, fields: readonly string[], label: string): void {
  const keys = Object.keys(record);
  for (const field of fields) {
    if (!(field in record)) {
      throw new LoopRunJournalError("INVALID_INPUT", `${label} is missing required field ${field}`);
    }
  }
  for (const key of keys) {
    if (!fields.includes(key)) {
      // Unknown field names are external input and are never echoed.
      throw new LoopRunJournalError("INVALID_INPUT", `${label} has unknown fields`);
    }
  }
}

function asNonEmptyString(value: unknown, label: string, noControlChars: boolean): string {
  if (typeof value !== "string") {
    throw new LoopRunJournalError("INVALID_INPUT", `${label} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed !== value) {
    throw new LoopRunJournalError("INVALID_INPUT", `${label} must be a trimmed non-empty string`);
  }
  if (noControlChars && /[\x00-\x1f\x7f]/.test(value)) {
    throw new LoopRunJournalError("INVALID_INPUT", `${label} must not contain control characters`);
  }
  return value;
}

const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function asIsoTimestamp(value: unknown, label: string): string {
  const text = asNonEmptyString(value, label, false);
  if (!ISO_TIMESTAMP_RE.test(text) || Number.isNaN(Date.parse(text))) {
    throw new LoopRunJournalError("INVALID_INPUT", `${label} must be a valid ISO-8601 timestamp`);
  }
  return text;
}

function asAbsolutePath(value: unknown, label: string): string {
  const text = asNonEmptyString(value, label, false);
  if (!text.startsWith("/")) {
    throw new LoopRunJournalError("INVALID_INPUT", `${label} must be an absolute path`);
  }
  return text;
}

function asSha256Hex(value: unknown, label: string): string {
  const text = asNonEmptyString(value, label, false);
  if (!/^[0-9a-f]{64}$/.test(text)) {
    throw new LoopRunJournalError("INVALID_INPUT", `${label} must be a 64-char lowercase SHA-256 hex`);
  }
  return text;
}

function asNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new LoopRunJournalError("INVALID_INPUT", `${label} must be a non-negative integer`);
  }
  return value;
}

function asPositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new LoopRunJournalError("INVALID_INPUT", `${label} must be a positive integer`);
  }
  return value;
}

const IDENTITY_FIELDS = [
  "runId",
  "requirementId",
  "repository",
  "repositoryPath",
  "baseBranch",
  "expectedBaseSha",
  "taskBranch",
  "controlRoot",
  "createdAt",
] as const;

const EVENT_FIELDS = [
  "eventId",
  "runId",
  "sequence",
  "kind",
  "stage",
  "attempt",
  "createdAt",
  "inputDigest",
  "outputArtifactRef",
  "outputDigest",
  "errorCode",
  "retryable",
  "reasonCode",
  "bindingId",
  "bindingVersion",
  "inputArtifactRef",
] as const;

const RUN_LEVEL_KINDS: readonly LoopRunEventKind[] = [
  "run_created",
  "run_started",
  "run_paused",
  "run_resumed",
  "run_blocked",
  "run_failed",
  "run_completed",
  "run_cancelled",
];

const STAGE_LEVEL_KINDS: readonly LoopRunEventKind[] = [
  "stage_started",
  "stage_succeeded",
  "stage_failed",
];

// ── identity validation ──

/**
 * Shared requirementId validator used by BOTH identity validation (createRun)
 * and the requirement query API (recovery lookup). A single implementation
 * guarantees that any run creatable with an ID can be looked up by the same
 * ID. External input is never echoed into errors.
 * Rejects: non-string, blank or untrimmed values, and C0/C1/DEL control
 * characters (\x00-\x1f, \x7f-\x9f).
 */
export function validateRequirementId(requirementId: unknown, label = "requirementId"): void {
  if (typeof requirementId !== "string") {
    throw new LoopRunJournalError("INVALID_INPUT", `${label} must be a string`);
  }
  const trimmed = requirementId.trim();
  if (trimmed.length === 0 || trimmed !== requirementId) {
    throw new LoopRunJournalError("INVALID_INPUT", `${label} must be a non-empty trimmed string`);
  }
  if (/[\x00-\x1f\x7f-\x9f]/.test(requirementId)) {
    throw new LoopRunJournalError("INVALID_INPUT", `${label} must not contain control characters`);
  }
}

export function validateLoopRunIdentity(identity: unknown): void {
  const record = readPlainDataRecord(identity, "identity");
  requireFields(record, IDENTITY_FIELDS, "identity");
  asNonEmptyString(record.runId, "identity.runId", true);
  validateRequirementId(record.requirementId, "identity.requirementId");
  asNonEmptyString(record.repository, "identity.repository", true);
  asNonEmptyString(record.baseBranch, "identity.baseBranch", true);
  const sha = asNonEmptyString(record.expectedBaseSha, "identity.expectedBaseSha", true);
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new LoopRunJournalError("INVALID_INPUT", "identity.expectedBaseSha must be a 40-char lowercase SHA hex");
  }
  asNonEmptyString(record.taskBranch, "identity.taskBranch", true);
  const repositoryPath = asAbsolutePath(record.repositoryPath, "identity.repositoryPath");
  const controlRoot = asAbsolutePath(record.controlRoot, "identity.controlRoot");
  if (repositoryPath === controlRoot) {
    throw new LoopRunJournalError("INVALID_INPUT", "identity.repositoryPath and identity.controlRoot must differ");
  }
  asIsoTimestamp(record.createdAt, "identity.createdAt");
}

// ── event validation ──

export function validateLoopRunEvent(event: unknown): void {
  const record = readPlainDataRecord(event, "event");
  requireFields(record, EVENT_FIELDS, "event");
  asNonEmptyString(record.eventId, "event.eventId", true);
  asNonEmptyString(record.runId, "event.runId", true);
  asPositiveInteger(record.sequence, "event.sequence");
  const kind = record.kind;
  if (typeof kind !== "string" || !LOOP_RUN_EVENT_KINDS.includes(kind as LoopRunEventKind)) {
    throw new LoopRunJournalError("INVALID_INPUT", "event.kind must be a canonical LoopRunEventKind");
  }
  const stage = record.stage;
  if (stage !== null && (typeof stage !== "string" || !LOOP_STAGE_NAMES.includes(stage as LoopStageName))) {
    throw new LoopRunJournalError("INVALID_INPUT", "event.stage must be a canonical LoopStageName or null");
  }
  const attempt = asNonNegativeInteger(record.attempt, "event.attempt");
  asIsoTimestamp(record.createdAt, "event.createdAt");
  if (record.inputDigest !== null) asSha256Hex(record.inputDigest, "event.inputDigest");
  if (record.outputArtifactRef !== null) asNonEmptyString(record.outputArtifactRef, "event.outputArtifactRef", false);
  if (record.outputDigest !== null) asSha256Hex(record.outputDigest, "event.outputDigest");
  if (record.errorCode !== null) asNonEmptyString(record.errorCode, "event.errorCode", false);
  if (record.retryable !== null && typeof record.retryable !== "boolean") {
    throw new LoopRunJournalError("INVALID_INPUT", "event.retryable must be a boolean or null");
  }
  if (record.reasonCode !== null) asNonEmptyString(record.reasonCode, "event.reasonCode", false);
  // C01 WP-4 provenance fields: nullable strings, never echoed.
  if (record.bindingId !== null) asNonEmptyString(record.bindingId, "event.bindingId", true);
  if (record.bindingVersion !== null) asNonEmptyString(record.bindingVersion, "event.bindingVersion", true);
  if (record.inputArtifactRef !== null) asNonEmptyString(record.inputArtifactRef, "event.inputArtifactRef", true);

  const canonicalKind = kind as LoopRunEventKind;
  if (RUN_LEVEL_KINDS.includes(canonicalKind)) {
    if (stage !== null) {
      throw new LoopRunJournalError("INVALID_INPUT", "run-level event must have stage null");
    }
    if (attempt !== 0) {
      throw new LoopRunJournalError("INVALID_INPUT", "run-level event must have attempt 0");
    }
  }
  if (STAGE_LEVEL_KINDS.includes(canonicalKind)) {
    if (stage === null) {
      throw new LoopRunJournalError("INVALID_INPUT", "stage-level event must have a stage");
    }
    if (attempt < 1) {
      throw new LoopRunJournalError("INVALID_INPUT", "stage-level event attempt must be a positive integer");
    }
  }
}

// ── canonical serialization (fixed field order, validation first) ──

export function canonicalizeLoopRunIdentity(identity: LoopRunIdentity): string {
  validateLoopRunIdentity(identity);
  const ordered = {
    runId: identity.runId,
    requirementId: identity.requirementId,
    repository: identity.repository,
    repositoryPath: identity.repositoryPath,
    baseBranch: identity.baseBranch,
    expectedBaseSha: identity.expectedBaseSha,
    taskBranch: identity.taskBranch,
    controlRoot: identity.controlRoot,
    createdAt: identity.createdAt,
  };
  return JSON.stringify(ordered);
}

export function canonicalizeLoopRunEvent(event: LoopRunEvent): string {
  validateLoopRunEvent(event);
  const ordered = {
    eventId: event.eventId,
    runId: event.runId,
    sequence: event.sequence,
    kind: event.kind,
    stage: event.stage,
    attempt: event.attempt,
    createdAt: event.createdAt,
    inputDigest: event.inputDigest,
    outputArtifactRef: event.outputArtifactRef,
    outputDigest: event.outputDigest,
    errorCode: event.errorCode,
    retryable: event.retryable,
    reasonCode: event.reasonCode,
    bindingId: event.bindingId,
    bindingVersion: event.bindingVersion,
    inputArtifactRef: event.inputArtifactRef,
  };
  return JSON.stringify(ordered);
}

/**
 * C01 WP-4 legacy canonical form: journals persisted before the provenance
 * schema extension hashed events over the 13 pre-extension fields only. This
 * form exists solely so the init() migration can verify those historical
 * rows (valid only when every provenance field is null) before atomically
 * rewriting their stored hash to the extended form; new writes always use
 * canonicalizeLoopRunEvent.
 */
export function canonicalizeLoopRunEventLegacy(event: LoopRunEvent): string {
  validateLoopRunEvent(event);
  const ordered = {
    eventId: event.eventId,
    runId: event.runId,
    sequence: event.sequence,
    kind: event.kind,
    stage: event.stage,
    attempt: event.attempt,
    createdAt: event.createdAt,
    inputDigest: event.inputDigest,
    outputArtifactRef: event.outputArtifactRef,
    outputDigest: event.outputDigest,
    errorCode: event.errorCode,
    retryable: event.retryable,
    reasonCode: event.reasonCode,
  };
  return JSON.stringify(ordered);
}

// ── run_created and initial state ──

export function createLoopRunCreatedEvent(identity: LoopRunIdentity): LoopRunEvent {
  validateLoopRunIdentity(identity);
  return Object.freeze({
    eventId: `${identity.runId}:1:run_created`,
    runId: identity.runId,
    sequence: 1,
    kind: "run_created",
    stage: null,
    attempt: 0,
    createdAt: identity.createdAt,
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
}

export function createInitialLoopRunState(identity: LoopRunIdentity): LoopRunState {
  validateLoopRunIdentity(identity);
  const createdEvent = createLoopRunCreatedEvent(identity);
  const stages = Object.create(null) as Record<LoopStageName, LoopStageState>;
  for (const stage of LOOP_STAGE_NAMES) {
    stages[stage] = Object.freeze({
      stage,
      status: "pending",
      attempt: 0,
      updatedAt: identity.createdAt,
    });
  }
  return Object.freeze({
    identity: Object.freeze({ ...identity }),
    status: "created",
    currentStage: null,
    currentAttempt: 0,
    fixRound: 0,
    lastSequence: createdEvent.sequence,
    lastEventId: createdEvent.eventId,
    blockingReasonCode: null,
    failureReasonCode: null,
    updatedAt: identity.createdAt,
    stages: Object.freeze(stages),
  });
}

// ── transitions ──

const TERMINAL_STATUSES: readonly string[] = ["completed", "failed", "cancelled"];

function illegal(message: string): never {
  throw new LoopRunJournalError("ILLEGAL_TRANSITION", message);
}

function withStage(
  state: LoopRunState,
  stage: LoopStageName,
  next: LoopStageState,
): Readonly<Record<LoopStageName, LoopStageState>> {
  return Object.freeze({ ...state.stages, [stage]: next });
}

const STAGE_PREREQUISITES: Readonly<Record<LoopStageName, readonly LoopStageName[]>> = {
  prepare_workspace: [],
  generate_patch: ["prepare_workspace"],
  validate_patch: ["generate_patch"],
  apply_patch: ["validate_patch"],
  run_tests: ["apply_patch"],
  review: ["run_tests"],
  fix: [],
  finalize: ["prepare_workspace", "generate_patch", "validate_patch", "apply_patch", "run_tests"],
};

export function applyLoopRunEvent(state: LoopRunState, event: LoopRunEvent): LoopRunState {
  validateLoopRunEvent(event);

  if (event.runId !== state.identity.runId) {
    throw new LoopRunJournalError("ILLEGAL_TRANSITION", "event runId does not match run identity");
  }
  if (TERMINAL_STATUSES.includes(state.status)) {
    throw new LoopRunJournalError("TERMINAL_RUN", "terminal run must not accept new events");
  }
  if (event.kind === "run_created") {
    illegal("run_created may only be applied once by createLoopRunState");
  }
  if (event.sequence !== state.lastSequence + 1) {
    throw new LoopRunJournalError("EVENT_SEQUENCE_CONFLICT", "event sequence must be lastSequence + 1");
  }
  if (event.eventId === state.lastEventId) {
    throw new LoopRunJournalError("EVENT_ID_CONFLICT", "event eventId duplicates last event");
  }

  const base = {
    identity: state.identity,
    stages: state.stages,
    lastSequence: event.sequence,
    lastEventId: event.eventId,
    updatedAt: event.createdAt,
  };

  switch (event.kind) {
    case "run_started": {
      if (state.status !== "created") illegal("run_started is only allowed from created");
      return Object.freeze({
        ...base,
        status: "running",
        currentStage: null,
        currentAttempt: 0,
        fixRound: state.fixRound,
        blockingReasonCode: null,
        failureReasonCode: null,
      });
    }
    case "run_paused": {
      if (state.status !== "running") illegal("run_paused is only allowed from running");
      if (state.currentStage !== null) illegal("run_paused requires no active stage");
      return Object.freeze({
        ...base,
        status: "paused",
        currentStage: null,
        currentAttempt: 0,
        fixRound: state.fixRound,
        blockingReasonCode: state.blockingReasonCode,
        failureReasonCode: state.failureReasonCode,
      });
    }
    case "run_resumed": {
      // Round 2 review H4: a durably BLOCKED run is releasable ONLY by an
      // explicit decision event carrying the release code — the projection
      // clears blockingReasonCode so fresh agents resume into running.
      if (state.status === "blocked") {
        if (
          event.reasonCode !== "RISK_ACCEPTED" &&
          event.reasonCode !== "SCOPE_RESET"
        ) {
          illegal("releasing a blocked run requires a RISK_ACCEPTED or SCOPE_RESET decision");
        }
        return Object.freeze({
          ...base,
          status: "running",
          currentStage: null,
          currentAttempt: 0,
          fixRound: state.fixRound,
          blockingReasonCode: null,
          failureReasonCode: state.failureReasonCode,
        });
      }
      if (state.status !== "paused") illegal("run_resumed is only allowed from paused or blocked");
      return Object.freeze({
        ...base,
        status: "running",
        currentStage: null,
        currentAttempt: 0,
        fixRound: state.fixRound,
        blockingReasonCode: state.blockingReasonCode,
        failureReasonCode: state.failureReasonCode,
      });
    }
    case "run_blocked": {
      if (state.status !== "created" && state.status !== "running" && state.status !== "paused") {
        illegal("run_blocked is only allowed from created, running, or paused");
      }
      if (state.currentStage !== null) illegal("run_blocked requires no active stage");
      if (event.reasonCode === null) illegal("run_blocked requires reasonCode");
      return Object.freeze({
        ...base,
        status: "blocked",
        currentStage: null,
        currentAttempt: 0,
        fixRound: state.fixRound,
        blockingReasonCode: event.reasonCode,
        failureReasonCode: state.failureReasonCode,
      });
    }
    case "run_failed": {
      if (
        state.status !== "created" &&
        state.status !== "running" &&
        state.status !== "paused" &&
        state.status !== "blocked"
      ) {
        illegal("run_failed is only allowed from created, running, paused, or blocked");
      }
      if (state.currentStage !== null) illegal("run_failed requires no active stage");
      if (event.errorCode === null && event.reasonCode === null) {
        illegal("run_failed requires errorCode or reasonCode");
      }
      return Object.freeze({
        ...base,
        status: "failed",
        currentStage: null,
        currentAttempt: 0,
        fixRound: state.fixRound,
        blockingReasonCode: state.blockingReasonCode,
        failureReasonCode: event.errorCode !== null ? event.errorCode : event.reasonCode,
      });
    }
    case "run_cancelled": {
      if (
        state.status !== "created" &&
        state.status !== "running" &&
        state.status !== "paused" &&
        state.status !== "blocked"
      ) {
        illegal("run_cancelled is only allowed from created, running, paused, or blocked");
      }
      if (state.currentStage !== null) illegal("run_cancelled requires no active stage");
      return Object.freeze({
        ...base,
        status: "cancelled",
        currentStage: null,
        currentAttempt: 0,
        fixRound: state.fixRound,
        blockingReasonCode: state.blockingReasonCode,
        failureReasonCode: state.failureReasonCode,
      });
    }
    case "run_completed": {
      if (state.status !== "running") illegal("run_completed is only allowed from running");
      if (state.currentStage !== null) illegal("run_completed requires no active stage");
      if (state.stages.finalize.status !== "succeeded") {
        illegal("run_completed requires finalize stage succeeded");
      }
      return Object.freeze({
        ...base,
        status: "completed",
        currentStage: null,
        currentAttempt: 0,
        fixRound: state.fixRound,
        blockingReasonCode: state.blockingReasonCode,
        failureReasonCode: state.failureReasonCode,
      });
    }
    case "stage_started": {
      const stage = event.stage as LoopStageName;
      if (state.status !== "running") illegal("stage_started requires run status running");
      if (state.currentStage !== null) illegal("only one stage may be running at a time");
      const current = state.stages[stage];
      if (stage === "fix") {
        // The fix loop re-enters after every failed review while fixRound < 2;
        // a previously succeeded fix stage may be re-entered on a new review
        // failure, other stages may only start from pending or failed.
        if (state.stages.review.status !== "failed") illegal("fix requires review stage failed");
        if (state.fixRound >= 2) illegal("fixRound must stay below 2 before fix starts");
        if (current.status !== "pending" && current.status !== "failed" && current.status !== "succeeded") {
          illegal("fix may only start from pending, failed, or a previously succeeded fix");
        }
      } else {
        if (current.status !== "pending" && current.status !== "failed") {
          illegal("stage may only start from pending or failed");
        }
        for (const prerequisite of STAGE_PREREQUISITES[stage]) {
          if (state.stages[prerequisite].status !== "succeeded") {
            illegal(`stage ${stage} requires prerequisite ${prerequisite} succeeded`);
          }
        }
      }
      if (event.attempt !== current.attempt + 1) {
        illegal("stage_started attempt must equal previous attempt + 1");
      }
      const runningStage: LoopStageState = Object.freeze({
        stage,
        status: "running",
        attempt: event.attempt,
        updatedAt: event.createdAt,
      });
      return Object.freeze({
        ...base,
        status: "running",
        currentStage: stage,
        currentAttempt: event.attempt,
        fixRound: state.fixRound,
        blockingReasonCode: state.blockingReasonCode,
        failureReasonCode: state.failureReasonCode,
        stages: withStage(state, stage, runningStage),
      });
    }
    case "stage_succeeded": {
      const stage = event.stage as LoopStageName;
      if (state.status !== "running") illegal("stage_succeeded requires run status running");
      if (state.currentStage !== stage) illegal("stage_succeeded must match current stage");
      if (event.attempt !== state.currentAttempt) illegal("stage_succeeded must match current attempt");
      if (state.stages[stage].status !== "running") illegal("stage_succeeded requires stage running");
      const nextFixRound = stage === "fix" ? state.fixRound + 1 : state.fixRound;
      if (nextFixRound > 2) illegal("fixRound must not exceed 2");
      const succeededStage: LoopStageState = Object.freeze({
        stage,
        status: "succeeded",
        attempt: event.attempt,
        updatedAt: event.createdAt,
      });
      return Object.freeze({
        ...base,
        status: "running",
        currentStage: null,
        currentAttempt: 0,
        fixRound: nextFixRound,
        blockingReasonCode: state.blockingReasonCode,
        failureReasonCode: state.failureReasonCode,
        stages: withStage(state, stage, succeededStage),
      });
    }
    case "stage_failed": {
      const stage = event.stage as LoopStageName;
      if (state.status !== "running") illegal("stage_failed requires run status running");
      if (state.currentStage !== stage) illegal("stage_failed must match current stage");
      if (event.attempt !== state.currentAttempt) illegal("stage_failed must match current attempt");
      if (state.stages[stage].status !== "running") illegal("stage_failed requires stage running");
      if (event.errorCode === null && event.reasonCode === null) {
        illegal("stage_failed requires errorCode or reasonCode");
      }
      const failedStage: LoopStageState = Object.freeze({
        stage,
        status: "failed",
        attempt: event.attempt,
        updatedAt: event.createdAt,
      });
      return Object.freeze({
        ...base,
        status: "running",
        currentStage: null,
        currentAttempt: 0,
        fixRound: state.fixRound,
        blockingReasonCode: state.blockingReasonCode,
        failureReasonCode: state.failureReasonCode,
        stages: withStage(state, stage, failedStage),
      });
    }
    default:
      return illegal("unknown event kind");
  }
}
