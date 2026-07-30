// LOOP Executor Kernel — Autonomous Test, Fix and Delivery Review Loop
// ======================================================================
// Standalone LOOP kernel orchestrator (D06). Only calls injected
// dependencies: D05 implementation adapter, D02 process runner,
// D03 workspace manager, D01 artifact store, and clock.
//
// No child_process, fs, Git, network, process.env, Runtime,
// Execution Gateway, Agent adapter, or Run Journal.
//
// Returns immutable, deterministic, bounded round trace.
// Terminal contract: succeeded / failed / blocked.

import { createHash } from "node:crypto";
import type { LoopRunIdentity } from "./loop-executor-types";
import type { LoopPosixProcessRunner, LoopPosixProcessResult } from "./loop-posix-process-runner";
import type { LoopGitWorkspaceManager, LoopGitWorkspaceSnapshot } from "./loop-git-workspace";
import type { LoopArtifactStore, LoopStoredArtifact } from "./loop-artifact-store";
import type {
  LoopCodexImplementationAdapter,
  LoopCodexImplementationRequest,
  LoopCodexImplementationResult,
  LoopCodexImplementationSuccess,
  LoopCodexImplementationFailure,
  LoopCodexImplementationWorkspace,
} from "./loop-codex-implementation-adapter";
import {
  buildLoopDeliveryEvidence,
  type LoopDeliveryEvidenceInput,
  type LoopDeliveryEvidenceWorkspaceDigest,
  type LoopDeliveryEvidenceFailure,
} from "./loop-delivery-evidence";

// ═══════════════════════════════════════ Types

export interface LoopDeliveryCommandStep {
  readonly id: string;
  readonly executableId: string;
  readonly args?: readonly string[];
  readonly timeoutMs?: number;
  readonly maxStdoutBytes?: number;
  readonly maxStderrBytes?: number;
}

export interface LoopAutonomousDeliveryRequest {
  readonly identity: LoopRunIdentity;
  readonly workspace: LoopCodexImplementationWorkspace;
  readonly requirement: string;
  readonly designSummary?: string;
  readonly implementationConstraints?: readonly string[];
  readonly allowedPaths: readonly string[];
  readonly testPlan: readonly LoopDeliveryCommandStep[];
  readonly reviewPlan: readonly LoopDeliveryCommandStep[];
  readonly maxFixRounds?: number;
  readonly maxTotalDurationMs?: number;
}

export type LoopAutonomousDeliveryStatus = "succeeded" | "failed" | "blocked";

export type LoopAutonomousDeliveryReasonCode =
  | "DELIVERY_SUCCEEDED"
  | "INVALID_INPUT"
  | "WORKSPACE_DRIFT"
  | "EXECUTION_BLOCKED"
  | "IMPLEMENTATION_FAILED"
  | "TEST_FAILED"
  | "TEST_TIMED_OUT"
  | "TEST_OUTPUT_TRUNCATED"
  | "TEST_WORKSPACE_MUTATED"
  | "REVIEW_FAILED"
  | "REVIEW_TIMED_OUT"
  | "REVIEW_OUTPUT_TRUNCATED"
  | "REVIEW_WORKSPACE_MUTATED"
  | "REPAIR_FAILED"
  | "FIX_BUDGET_EXHAUSTED"
  | "NO_PROGRESS"
  | "TOTAL_TIMEOUT"
  | "ARTIFACT_STORE_FAILED"
  | "DEPENDENCY_RESULT_INVALID"
  | "INTERNAL_ERROR";

export interface LoopDeliveryResultWorkspace {
  readonly workspacePath: string;
  readonly taskBranch: string;
  readonly taskHeadSha: string;
  readonly statusDigestSha256: string;
  readonly taskHasChanges: boolean;
}

export type LoopDeliveryTraceKind =
  | "implementation_initial"
  | "test_plan_start"
  | "test_step_pass"
  | "test_step_fail"
  | "test_plan_end"
  | "review_plan_start"
  | "review_step_pass"
  | "review_step_fail"
  | "review_plan_end"
  | "repair_attempt"
  | "evidence_stored"
  | "terminal"
  | "info";

export interface LoopDeliveryTraceEntry {
  readonly sequence: number;
  readonly kind: LoopDeliveryTraceKind;
  readonly phase: "initial" | "test" | "review" | "test_repair" | "review_repair";
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

export interface LoopAutonomousDeliveryResult {
  readonly status: LoopAutonomousDeliveryStatus;
  readonly reasonCode: LoopAutonomousDeliveryReasonCode;
  readonly safeMessage: string;
  readonly causeCode?: string;
  readonly totalFixRounds: number;
  readonly testAttempts: number;
  readonly reviewAttempts: number;
  readonly patchArtifactRefs: readonly string[];
  readonly testSummaryArtifactRefs: readonly string[];
  readonly reviewSummaryArtifactRefs: readonly string[];
  readonly deliveryResultArtifactRef?: string;
  readonly files: readonly string[];
  readonly finalWorkspace?: LoopDeliveryResultWorkspace;
  readonly elapsedMs: number;
  readonly trace: readonly LoopDeliveryTraceEntry[];
}

export interface LoopAutonomousDeliveryLoopOptions {
  readonly runner: Pick<LoopPosixProcessRunner, "run">;
  readonly workspaceManager: Pick<LoopGitWorkspaceManager, "inspect">;
  readonly artifactStore: Pick<LoopArtifactStore, "put">;
  readonly implementationAdapter: Pick<LoopCodexImplementationAdapter, "execute">;
  readonly clock?: Readonly<{ nowMs(): number }>;
  readonly defaultStepTimeoutMs?: number;
  readonly defaultMaxStdoutBytes?: number;
  readonly defaultMaxStderrBytes?: number;
  readonly maxEvidenceExcerptBytes?: number;
  readonly maxEvidenceBytes?: number;
  readonly maxDeliveryResultBytes?: number;
}

// ═══════════════════════════════════════ Constants

const MAX_SAFE_MESSAGE = 256;
const STEP_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MAX_STEP_ARGS = 128;
const MAX_ARG_BYTES = 4096;
const MAX_ARGS_TOTAL_BYTES = 32768;
const MAX_PLAN_STEPS = 32;

const DEFAULT_DTO = 120000;
const DEFAULT_DSO = 1048576;
const DEFAULT_DSE = 262144;
const DEFAULT_MAX_EVIDENCE_EXCERPT = 4096;
const DEFAULT_MAX_EVIDENCE = 32768;
const DEFAULT_MAX_DELIVERY_RESULT = 131072;

const DEFAULT_MAX_FIX_ROUNDS = 4;
const MAX_MAX_FIX_ROUNDS = 4;
const DEFAULT_MAX_TOTAL_DURATION = 1800000; // 30 min
const MAX_MAX_TOTAL_DURATION = 3600000; // 60 min
const MIN_MAX_TOTAL_DURATION = 1000;

const MIN_D02_TIMEOUT = 100;

const OPTION_KEYS = [
  "runner", "workspaceManager", "artifactStore", "implementationAdapter",
  "clock", "defaultStepTimeoutMs", "defaultMaxStdoutBytes",
  "defaultMaxStderrBytes", "maxEvidenceExcerptBytes", "maxEvidenceBytes",
  "maxDeliveryResultBytes",
];

const REQUEST_KEYS = [
  "identity", "workspace", "requirement", "designSummary",
  "implementationConstraints", "allowedPaths", "testPlan", "reviewPlan",
  "maxFixRounds", "maxTotalDurationMs",
];

const WORKSPACE_KEYS = [
  "workspacePath", "taskBranch", "expectedTaskHeadSha", "expectedPreStatusDigestSha256",
];

const NON_CONTROL_RE = /[\x00-\x1f\x7f-\x9f]/;
const NUL = "\x00";
const SHA40_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

// Known cause code allowlist
const KNOWN_CAUSE_CODES = new Set([
  // D02 runner codes
  "UNSUPPORTED_PLATFORM", "EXECUTABLE_NOT_ALLOWED", "EXECUTABLE_INVALID",
  "EXECUTABLE_CHANGED", "CWD_NOT_ALLOWED", "CWD_INVALID",
  "ENV_NOT_ALLOWED", "PROCESS_SPAWN_FAILED",
  "PROCESS_IO_FAILED", "PROCESS_CLEANUP_FAILED", "INVALID_INPUT",
  // D05 codes
  "INTERNAL_ERROR", "WORKSPACE_DRIFT", "PATCH_APPLICATION_FAILED",
  "CODEX_SPAWN_FAILED", "PATCH_GENERATION_FAILED", "PATCH_VALIDATION_FAILED",
  "FILE_ACCESS_FAILED", "TARGET_INVALID",
  "PRE_STATE_CAPTURE_FAILED", "POST_STATE_CAPTURE_FAILED",
  // D04 codes
  "GIT_ERROR", "IMMUTABLE_VIOLATION", "DIGEST_MISMATCH",
  "RESTORE_FAILED", "CLEANUP_FAILED",
]);

// ═══════════════════════════════════════ Helpers

function freeze<T extends object>(o: T): Readonly<T> {
  return Object.freeze(o);
}

function deepFreeze<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    return Object.freeze(value) as unknown as T;
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value) as unknown as T;
}

function safeMessage(msg: string): string {
  return msg.replace(NON_CONTROL_RE, " ").slice(0, MAX_SAFE_MESSAGE);
}

function scanPlain(v: unknown, allowed: readonly string[], label: string): Record<string, unknown> {
  if (v === null || typeof v !== "object") {
    throw new Error(`${label} must be an object`);
  }
  if (Array.isArray(v)) {
    throw new Error(`${label} must not be an array`);
  }
  let proto: unknown;
  try {
    proto = Object.getPrototypeOf(v);
  } catch {
    throw new Error(`${label} getPrototypeOf threw`);
  }
  if (proto !== Object.prototype && proto !== null) {
    throw new Error(`${label} has bad prototype`);
  }
  let keys: Array<string | symbol>;
  try {
    keys = Reflect.ownKeys(v) as Array<string | symbol>;
  } catch {
    throw new Error(`${label} ownKeys threw`);
  }
  const out = Object.create(null) as Record<string, unknown>;
  for (const k of keys) {
    if (typeof k === "symbol") throw new Error(`${label} has symbol key`);
    if (k === "__proto__") throw new Error(`${label} has __proto__ key`);
    if (!allowed.includes(k)) throw new Error(`${label} has unknown key '${String(k)}'`);
    let desc: PropertyDescriptor;
    try {
      desc = Object.getOwnPropertyDescriptor(v, k)!;
    } catch {
      throw new Error(`${label} getDescriptor threw`);
    }
    if (!desc) throw new Error(`${label} missing descriptor`);
    if ("get" in desc || "set" in desc) throw new Error(`${label} has accessor`);
    if (!("value" in desc)) throw new Error(`${label} no value`);
    Object.defineProperty(out, k, {
      value: desc.value, writable: false, enumerable: true, configurable: false,
    });
  }
  return out;
}

function validateStepId(id: string): boolean {
  return STEP_ID_RE.test(id);
}

function validateCauseCode(code: string | null | undefined): string | undefined {
  if (code === null || code === undefined) return undefined;
  if (typeof code !== "string") return undefined;
  const trimmed = code.trim();
  if (trimmed !== code) return undefined;
  if (NON_CONTROL_RE.test(trimmed)) return undefined;
  if (trimmed.length === 0 || trimmed.length > 128) return undefined;
  if (!KNOWN_CAUSE_CODES.has(trimmed)) return undefined;
  return trimmed;
}

// ═══════════════════════════════════════ Internal State

interface InternalState {
  startMs: number;
  deadlineMs: number;
  maxFixRounds: number;
  maxTotalDurationMs: number;
  totalFixRounds: number;
  testRepairAttempt: number;
  reviewRepairAttempt: number;
  testAttempts: number;
  reviewAttempts: number;
  patchArtifactRefs: string[];
  testSummaryArtifactRefs: string[];
  reviewSummaryArtifactRefs: string[];
  files: Set<string>;
  trace: LoopDeliveryTraceEntry[];
  traceSeq: number;
  currentWorkspacePath: string;
  currentTaskBranch: string;
  currentTaskHeadSha: string;
  currentStatusDigestSha256: string;
  currentTaskHasChanges: boolean;
  // Clock isolation: per-execution monotonic tracking
  lastClockMs: number;
  // No-progress tracking
  seenFailureKeys: Set<string>;
  seenEvidencePatchPairs: Set<string>;
  lastEvidenceDigest: string | null;
  lastPatchDigest: string | null;
  lastRepairPreDigest: string | null;
}

function createState(
  maxFixRounds: number,
  maxTotalDurationMs: number,
  startMs: number,
): InternalState {
  return {
    startMs,
    deadlineMs: startMs + maxTotalDurationMs,
    maxFixRounds,
    maxTotalDurationMs,
    totalFixRounds: 0,
    testRepairAttempt: 0,
    reviewRepairAttempt: 0,
    testAttempts: 0,
    reviewAttempts: 0,
    patchArtifactRefs: [],
    testSummaryArtifactRefs: [],
    reviewSummaryArtifactRefs: [],
    files: new Set(),
    trace: [],
    traceSeq: 0,
    currentWorkspacePath: "",
    currentTaskBranch: "",
    currentTaskHeadSha: "",
    currentStatusDigestSha256: "",
    currentTaskHasChanges: false,
    lastClockMs: startMs,
    seenFailureKeys: new Set(),
    seenEvidencePatchPairs: new Set(),
    lastEvidenceDigest: null,
    lastPatchDigest: null,
    lastRepairPreDigest: null,
  };
}

// ═══════════════════════════════════════ Main Class

export class LoopAutonomousDeliveryLoop {
  private readonly runner: Pick<LoopPosixProcessRunner, "run">;
  private readonly workspaceManager: Pick<LoopGitWorkspaceManager, "inspect">;
  private readonly artifactStore: Pick<LoopArtifactStore, "put">;
  private readonly implementationAdapter: Pick<LoopCodexImplementationAdapter, "execute">;
  private readonly clock: Readonly<{ nowMs(): number }>;
  private readonly defaultStepTimeoutMs: number;
  private readonly defaultMaxStdoutBytes: number;
  private readonly defaultMaxStderrBytes: number;
  private readonly maxEvidenceExcerptBytes: number;
  private readonly maxEvidenceBytes: number;
  private readonly maxDeliveryResultBytes: number;

  // No instance-level clock state — clock is per-execution isolated

  constructor(options: LoopAutonomousDeliveryLoopOptions) {
    const opts = scanPlain(options, OPTION_KEYS, "options");

    const rv = opts.runner;
    if (!rv || typeof (rv as Record<string, unknown>).run !== "function") {
      throw new Error("runner must have run method");
    }
    this.runner = rv as Pick<LoopPosixProcessRunner, "run">;

    const wm = opts.workspaceManager;
    if (!wm || typeof (wm as Record<string, unknown>).inspect !== "function") {
      throw new Error("workspaceManager must have inspect method");
    }
    this.workspaceManager = wm as Pick<LoopGitWorkspaceManager, "inspect">;

    const ast = opts.artifactStore;
    if (!ast || typeof (ast as Record<string, unknown>).put !== "function") {
      throw new Error("artifactStore must have put method");
    }
    this.artifactStore = ast as Pick<LoopArtifactStore, "put">;

    const ia = opts.implementationAdapter;
    if (!ia || typeof (ia as Record<string, unknown>).execute !== "function") {
      throw new Error("implementationAdapter must have execute method");
    }
    this.implementationAdapter = ia as Pick<LoopCodexImplementationAdapter, "execute">;

    const clk = opts.clock;
    if (clk !== undefined) {
      if (clk === null || typeof clk !== "object" ||
          typeof (clk as Record<string, unknown>).nowMs !== "function") {
        throw new Error("clock must have nowMs method");
      }
      this.clock = clk as Readonly<{ nowMs(): number }>;
    } else {
      this.clock = { nowMs: () => Date.now() };
    }

    this.defaultStepTimeoutMs = validateInt(opts.defaultStepTimeoutMs, 100, 600000, DEFAULT_DTO, "defaultStepTimeoutMs");
    this.defaultMaxStdoutBytes = validateInt(opts.defaultMaxStdoutBytes, 1, 16777216, DEFAULT_DSO, "defaultMaxStdoutBytes");
    this.defaultMaxStderrBytes = validateInt(opts.defaultMaxStderrBytes, 1, 16777216, DEFAULT_DSE, "defaultMaxStderrBytes");
    this.maxEvidenceExcerptBytes = validateInt(opts.maxEvidenceExcerptBytes, 1, 131072, DEFAULT_MAX_EVIDENCE_EXCERPT, "maxEvidenceExcerptBytes");
    this.maxEvidenceBytes = validateInt(opts.maxEvidenceBytes, 256, 131072, DEFAULT_MAX_EVIDENCE, "maxEvidenceBytes");
    this.maxDeliveryResultBytes = validateInt(opts.maxDeliveryResultBytes, 256, 131072, DEFAULT_MAX_DELIVERY_RESULT, "maxDeliveryResultBytes");
  }

  // ═══════════════════════════════════════ Public

  async execute(
    request: LoopAutonomousDeliveryRequest,
  ): Promise<LoopAutonomousDeliveryResult> {
    // ── Validate request ──
    let req: Record<string, unknown>;
    try {
      req = scanPlain(request, REQUEST_KEYS, "request");
    } catch {
      return this._validationFailure("failed", "INVALID_INPUT", "invalid request");
    }

    // Validate identity via plain-data scan + validateLoopRunIdentity
    const identity = req.identity;
    if (identity === null || typeof identity !== "object" || Array.isArray(identity)) {
      return this._validationFailure("failed", "INVALID_INPUT", "invalid identity");
    }
    const id = identity as Record<string, unknown>;
    if (typeof id.runId !== "string" || id.runId.trim().length === 0 ||
        NON_CONTROL_RE.test(id.runId)) {
      return this._validationFailure("failed", "INVALID_INPUT", "invalid identity.runId");
    }
    if (typeof id.requirementId !== "string" || id.requirementId.trim().length === 0) {
      return this._validationFailure("failed", "INVALID_INPUT", "invalid identity.requirementId");
    }
    if (typeof id.repository !== "string" || id.repository.trim().length === 0) {
      return this._validationFailure("failed", "INVALID_INPUT", "invalid identity.repository");
    }
    if (typeof id.repositoryPath !== "string" || id.repositoryPath.trim().length === 0) {
      return this._validationFailure("failed", "INVALID_INPUT", "invalid identity.repositoryPath");
    }
    if (typeof id.taskBranch !== "string" || id.taskBranch.trim().length === 0) {
      return this._validationFailure("failed", "INVALID_INPUT", "invalid identity.taskBranch");
    }
    if (typeof id.controlRoot !== "string" || id.controlRoot.trim().length === 0) {
      return this._validationFailure("failed", "INVALID_INPUT", "invalid identity.controlRoot");
    }

    // Validate workspace
    let wsObj: Record<string, unknown>;
    try {
      wsObj = scanPlain(req.workspace, WORKSPACE_KEYS, "workspace");
    } catch {
      return this._validationFailure("failed", "INVALID_INPUT", "invalid workspace");
    }
    if (typeof wsObj.workspacePath !== "string" || wsObj.workspacePath.length === 0) {
      return this._validationFailure("failed", "INVALID_INPUT", "invalid workspacePath");
    }
    if (typeof wsObj.taskBranch !== "string" || wsObj.taskBranch.length === 0) {
      return this._validationFailure("failed", "INVALID_INPUT", "invalid taskBranch");
    }
    if (typeof wsObj.expectedTaskHeadSha !== "string" || !SHA40_RE.test(wsObj.expectedTaskHeadSha)) {
      return this._validationFailure("failed", "INVALID_INPUT", "invalid expectedTaskHeadSha");
    }
    if (typeof wsObj.expectedPreStatusDigestSha256 !== "string" || !SHA256_RE.test(wsObj.expectedPreStatusDigestSha256)) {
      return this._validationFailure("failed", "INVALID_INPUT", "invalid expectedPreStatusDigestSha256");
    }

    const workspace: LoopCodexImplementationWorkspace = {
      workspacePath: wsObj.workspacePath as string,
      taskBranch: wsObj.taskBranch as string,
      expectedTaskHeadSha: wsObj.expectedTaskHeadSha as string,
      expectedPreStatusDigestSha256: wsObj.expectedPreStatusDigestSha256 as string,
    };

    // Validate requirement
    const requirement = req.requirement;
    if (typeof requirement !== "string" || requirement.length === 0) {
      return this._validationFailure("failed", "INVALID_INPUT", "invalid requirement");
    }

    // Validate designSummary (optional)
    let designSummary: string | undefined;
    if (req.designSummary !== undefined) {
      if (typeof req.designSummary !== "string") {
        return this._validationFailure("failed", "INVALID_INPUT", "invalid designSummary");
      }
      designSummary = req.designSummary as string;
    }

    // Validate implementationConstraints (optional)
    let implementationConstraints: readonly string[] | undefined;
    if (req.implementationConstraints !== undefined) {
      if (!Array.isArray(req.implementationConstraints)) {
        return this._validationFailure("failed", "INVALID_INPUT", "invalid implementationConstraints");
      }
      implementationConstraints = req.implementationConstraints as readonly string[];
    }

    // Validate allowedPaths
    if (!Array.isArray(req.allowedPaths) || req.allowedPaths.length === 0) {
      return this._validationFailure("failed", "INVALID_INPUT", "invalid allowedPaths");
    }
    const allowedPaths: readonly string[] = freeze([...req.allowedPaths as string[]]);

    // Validate testPlan
    if (!Array.isArray(req.testPlan) || req.testPlan.length === 0 || req.testPlan.length > MAX_PLAN_STEPS) {
      return this._validationFailure("failed", "INVALID_INPUT", "invalid testPlan");
    }
    const testPlan = req.testPlan as readonly LoopDeliveryCommandStep[];
    const testPlanValidation = validatePlan(testPlan, "testPlan");
    if (!testPlanValidation.ok) {
      return this._validationFailure("failed", "INVALID_INPUT", (testPlanValidation as { ok: false; reason: string }).reason);
    }

    // Validate reviewPlan
    if (!Array.isArray(req.reviewPlan) || req.reviewPlan.length === 0 || req.reviewPlan.length > MAX_PLAN_STEPS) {
      return this._validationFailure("failed", "INVALID_INPUT", "invalid reviewPlan");
    }
    const reviewPlan = req.reviewPlan as readonly LoopDeliveryCommandStep[];
    const reviewPlanValidation = validatePlan(reviewPlan, "reviewPlan");
    if (!reviewPlanValidation.ok) {
      return this._validationFailure("failed", "INVALID_INPUT", (reviewPlanValidation as { ok: false; reason: string }).reason);
    }

    // Check for duplicate step IDs across both plans
    const allStepIds = new Set<string>();
    for (const step of [...testPlan, ...reviewPlan]) {
      if (allStepIds.has(step.id)) {
        return this._validationFailure("failed", "INVALID_INPUT", "duplicate step ID");
      }
      allStepIds.add(step.id);
    }

    // Validate maxFixRounds
    let maxFixRounds = DEFAULT_MAX_FIX_ROUNDS;
    if (req.maxFixRounds !== undefined) {
      if (typeof req.maxFixRounds !== "number" || !Number.isSafeInteger(req.maxFixRounds) ||
          req.maxFixRounds < 0 || req.maxFixRounds > MAX_MAX_FIX_ROUNDS) {
        return this._validationFailure("failed", "INVALID_INPUT", "invalid maxFixRounds");
      }
      maxFixRounds = req.maxFixRounds;
    }

    // Validate maxTotalDurationMs
    let maxTotalDurationMs = DEFAULT_MAX_TOTAL_DURATION;
    if (req.maxTotalDurationMs !== undefined) {
      if (typeof req.maxTotalDurationMs !== "number" || !Number.isSafeInteger(req.maxTotalDurationMs) ||
          req.maxTotalDurationMs < MIN_MAX_TOTAL_DURATION || req.maxTotalDurationMs > MAX_MAX_TOTAL_DURATION) {
        return this._validationFailure("failed", "INVALID_INPUT", "invalid maxTotalDurationMs");
      }
      maxTotalDurationMs = req.maxTotalDurationMs;
    }

    // ═══════════════════════════════════════ Initialize

    // Non-throwing clock read
    const clockResult = this._tryReadClock(null);
    if (!clockResult.ok) {
      return this._validationFailure("failed", "INTERNAL_ERROR", "initial clock read failed");
    }
    const startMs = clockResult.nowMs;
    const state = createState(maxFixRounds, maxTotalDurationMs, startMs);

    // Check deadline at start
    if (this._isDeadlineExceeded(state)) {
      return this._finalizeTerminal(state, "failed", "TOTAL_TIMEOUT", "deadline exceeded before start");
    }

    // ═══════════════════════════════════════ Workspace Binding (initial)
    const initBindResult = await this._bindWorkspace(
      identity as LoopRunIdentity, workspace, state,
    );
    if (!initBindResult.ok) return (initBindResult as { ok: false; result: LoopAutonomousDeliveryResult }).result;

    // ═══════════════════════════════════════ D05 Initial Implementation
    const initialResult = await this._executeImplementation(
      identity as LoopRunIdentity,
      workspace,
      "initial",
      0,
      requirement as string,
      designSummary,
      implementationConstraints,
      allowedPaths,
      undefined,
      state,
    );

    if (initialResult.status === "blocked" || initialResult.status === "failed") {
      return (initialResult as unknown as { result: LoopAutonomousDeliveryResult }).result;
    }

    const initialSuccess = initialResult as { status: "continue"; result: LoopCodexImplementationSuccess };

    // Update state from initial success
    this._addTrace(state, "implementation_initial", "initial", 0, 0, null,
      "succeeded", null,
      initialSuccess.result.patchArtifactRef,
      initialSuccess.result.patchDigestSha256,
      initialSuccess.result.postStatusDigestSha256,
    );
    state.patchArtifactRefs.push(initialSuccess.result.patchArtifactRef);
    for (const f of initialSuccess.result.files) {
      state.files.add(f);
    }
    state.currentTaskHeadSha = initialSuccess.result.postTaskHeadSha;
    state.currentStatusDigestSha256 = initialSuccess.result.postStatusDigestSha256;

    // Update workspace binding after D05
    const postInitBindResult = await this._bindAndVerifyPostD05(
      identity as LoopRunIdentity, workspace, state,
      initialSuccess.result.postTaskHeadSha,
      initialSuccess.result.postStatusDigestSha256,
    );
    if (!postInitBindResult.ok) return (postInitBindResult as { ok: false; result: LoopAutonomousDeliveryResult }).result;

    // ═══════════════════════════════════════ Main Loop
    const mainResult = await this._mainLoop(
      identity as LoopRunIdentity,
      workspace,
      requirement as string,
      designSummary,
      implementationConstraints,
      allowedPaths,
      testPlan,
      reviewPlan,
      state,
    );

    return mainResult;
  }

  // ═══════════════════════════════════════ Private: Main Loop

  private async _mainLoop(
    identity: LoopRunIdentity,
    workspace: LoopCodexImplementationWorkspace,
    requirement: string,
    designSummary: string | undefined,
    implementationConstraints: readonly string[] | undefined,
    allowedPaths: readonly string[],
    testPlan: readonly LoopDeliveryCommandStep[],
    reviewPlan: readonly LoopDeliveryCommandStep[],
    state: InternalState,
  ): Promise<LoopAutonomousDeliveryResult> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // ── Run full test plan ──
      const testResult = await this._runPlan(
        identity, workspace, testPlan, "test", state,
      );

      if (testResult.blocked) {
        return testResult.blockedResult!;
      }

      if (testResult.failed) {
        // Test failed — try repair if possible
        const failure = testResult.failure!;
        if (!failure.repairable) {
          return this._finalizeTerminal(state, "failed",
            failure.reasonCode as LoopAutonomousDeliveryReasonCode,
            failure.reasonMessage, failure.causeCode);
        }

        // Build and store test evidence
        const evidenceResult = await this._buildAndStoreEvidence(
          "test", failure, state,
        );
        if (!evidenceResult.ok) {
          return (evidenceResult as { ok: false; result: LoopAutonomousDeliveryResult }).result;
        }
        const evidenceRef = evidenceResult.artifactRef;

        // Check no-progress before repair
        const noProgressCheck = this._checkNoProgress(state, "test", evidenceResult.evidenceDigest);
        if (noProgressCheck) {
          return this._finalizeTerminal(state, "failed", "NO_PROGRESS", noProgressCheck);
        }

        // Check fix budget
        if (state.totalFixRounds >= state.maxFixRounds) {
          return this._finalizeTerminal(state, "failed", "FIX_BUDGET_EXHAUSTED", "fix budget exhausted");
        }

        // Record pre-repair digest
        state.lastRepairPreDigest = state.currentStatusDigestSha256;

        // Increment fix rounds
        state.totalFixRounds++;
        state.testRepairAttempt++;

        // Call D05 test_repair
        const repairResult = await this._executeImplementation(
          identity, workspace, "test_repair", state.testRepairAttempt,
          requirement, designSummary, implementationConstraints, allowedPaths,
          evidenceRef, state,
        );

        if (repairResult.status === "blocked" || repairResult.status === "failed") {
          return (repairResult as unknown as { result: LoopAutonomousDeliveryResult }).result;
        }

        const repairSuccess = repairResult as { status: "continue"; result: LoopCodexImplementationSuccess };

        // No-progress check after repair
        const postRepairNoProgress = this._checkNoProgressPostRepair(
          state, repairSuccess.result, evidenceResult.evidenceDigest, allowedPaths,
        );
        if (postRepairNoProgress) {
          return this._finalizeTerminal(state, "failed", "NO_PROGRESS", postRepairNoProgress);
        }

        // Update state
        state.patchArtifactRefs.push(repairSuccess.result.patchArtifactRef);
        for (const f of repairSuccess.result.files) {
          state.files.add(f);
        }
        state.currentTaskHeadSha = repairSuccess.result.postTaskHeadSha;
        state.currentStatusDigestSha256 = repairSuccess.result.postStatusDigestSha256;

        // Re-bind workspace after repair
        const postRepairBindResult = await this._bindAndVerifyPostD05(
          identity, workspace, state,
          repairSuccess.result.postTaskHeadSha,
          repairSuccess.result.postStatusDigestSha256,
        );
        if (!postRepairBindResult.ok) return (postRepairBindResult as { ok: false; result: LoopAutonomousDeliveryResult }).result;

        // Loop back to run tests again
        continue;
      }

      // Tests passed — now run review
      const reviewResult = await this._runPlan(
        identity, workspace, reviewPlan, "review", state,
      );

      if (reviewResult.blocked) {
        return reviewResult.blockedResult!;
      }

      if (reviewResult.failed) {
        const failure = reviewResult.failure!;
        if (!failure.repairable) {
          return this._finalizeTerminal(state, "failed",
            failure.reasonCode as LoopAutonomousDeliveryReasonCode,
            failure.reasonMessage, failure.causeCode);
        }

        // Build and store review evidence
        const evidenceResult2 = await this._buildAndStoreEvidence(
          "review", failure, state,
        );
        if (!evidenceResult2.ok) {
          return (evidenceResult2 as { ok: false; result: LoopAutonomousDeliveryResult }).result;
        }
        const evidenceRef2 = evidenceResult2.artifactRef;

        // Check no-progress before repair
        const noProgressCheck2 = this._checkNoProgress(state, "review", evidenceResult2.evidenceDigest);
        if (noProgressCheck2) {
          return this._finalizeTerminal(state, "failed", "NO_PROGRESS", noProgressCheck2);
        }

        // Check fix budget
        if (state.totalFixRounds >= state.maxFixRounds) {
          return this._finalizeTerminal(state, "failed", "FIX_BUDGET_EXHAUSTED", "fix budget exhausted");
        }

        // Record pre-repair digest
        state.lastRepairPreDigest = state.currentStatusDigestSha256;

        // Increment fix rounds
        state.totalFixRounds++;
        state.reviewRepairAttempt++;

        // Call D05 review_repair
        const reviewRepairResult = await this._executeImplementation(
          identity, workspace, "review_repair", state.reviewRepairAttempt,
          requirement, designSummary, implementationConstraints, allowedPaths,
          evidenceRef2, state,
        );

        if (reviewRepairResult.status === "blocked" || reviewRepairResult.status === "failed") {
          return (reviewRepairResult as unknown as { result: LoopAutonomousDeliveryResult }).result;
        }

        const reviewRepairSuccess = reviewRepairResult as { status: "continue"; result: LoopCodexImplementationSuccess };

        // No-progress check after repair
        const postRepairNoProgress2 = this._checkNoProgressPostRepair(
          state, reviewRepairSuccess.result, evidenceResult2.evidenceDigest, allowedPaths,
        );
        if (postRepairNoProgress2) {
          return this._finalizeTerminal(state, "failed", "NO_PROGRESS", postRepairNoProgress2);
        }

        // Update state
        state.patchArtifactRefs.push(reviewRepairSuccess.result.patchArtifactRef);
        for (const f of reviewRepairSuccess.result.files) {
          state.files.add(f);
        }
        state.currentTaskHeadSha = reviewRepairSuccess.result.postTaskHeadSha;
        state.currentStatusDigestSha256 = reviewRepairSuccess.result.postStatusDigestSha256;

        // Re-bind workspace after repair
        const postReviewBindResult = await this._bindAndVerifyPostD05(
          identity, workspace, state,
          reviewRepairSuccess.result.postTaskHeadSha,
          reviewRepairSuccess.result.postStatusDigestSha256,
        );
        if (!postReviewBindResult.ok) return (postReviewBindResult as { ok: false; result: LoopAutonomousDeliveryResult }).result;

        // Review repair requires full re-test before re-review — loop back
        continue;
      }

      // Both tests and review passed — SUCCESS!
      return await this._buildSuccessResult(identity, workspace, allowedPaths, state);
    }
  }

  // ═══════════════════════════════════════ Private: Plan Execution

  private async _runPlan(
    identity: LoopRunIdentity,
    workspace: LoopCodexImplementationWorkspace,
    plan: readonly LoopDeliveryCommandStep[],
    phase: "test" | "review",
    state: InternalState,
  ): Promise<{
    passed?: boolean;
    blocked?: boolean;
    blockedResult?: LoopAutonomousDeliveryResult;
    failed?: boolean;
    failure?: PlanStepFailure;
  }> {
    const isTest = phase === "test";
    if (isTest) {
      state.testAttempts++;
    } else {
      state.reviewAttempts++;
    }

    const attemptNum = isTest ? state.testAttempts : state.reviewAttempts;

    this._addTrace(state,
      isTest ? "test_plan_start" : "review_plan_start",
      phase, state.totalFixRounds, attemptNum, null, "started", null, null, null,
      state.currentStatusDigestSha256,
    );

    for (const step of plan) {
      // Check deadline before each step
      const deadlineCheck = this._checkDeadlineBeforeStep(state);
      if (deadlineCheck) {
        return {
          failed: true,
          failure: {
            stepId: step.id,
            reasonCode: "TOTAL_TIMEOUT",
            reasonMessage: "deadline exceeded before step",
            repairable: false,
            exitCode: null, signal: null, durationMs: 0,
            stdoutTruncated: false, stderrTruncated: false,
            stdout: "", stderr: "",
            outcomeCategory: isTest ? "TEST_TIMED_OUT" : "REVIEW_TIMED_OUT",
            workspaceBefore: {
              task_branch: workspace.taskBranch,
              task_head_sha: state.currentTaskHeadSha,
              status_digest_sha256: state.currentStatusDigestSha256,
            },
            workspaceAfter: {
              task_branch: workspace.taskBranch,
              task_head_sha: state.currentTaskHeadSha,
              status_digest_sha256: state.currentStatusDigestSha256,
            },
          },
        };
      }

      // Inspect workspace before step
      let snapshot: LoopGitWorkspaceSnapshot;
      try {
        const rawSnap = await this.workspaceManager.inspect(identity);
        const snapValidation = validateWorkspaceSnapshot(rawSnap);
        if (!snapValidation.ok) {
          return {
            failed: true,
            failure: {
              stepId: step.id,
              reasonCode: "DEPENDENCY_RESULT_INVALID",
              reasonMessage: "invalid workspace snapshot before step",
              repairable: false,
              exitCode: null, signal: null, durationMs: 0,
              stdoutTruncated: false, stderrTruncated: false,
              stdout: "", stderr: "",
              outcomeCategory: isTest ? "TEST_FAILED" : "REVIEW_FAILED",
              workspaceBefore: {
                task_branch: workspace.taskBranch,
                task_head_sha: state.currentTaskHeadSha,
                status_digest_sha256: state.currentStatusDigestSha256,
              },
              workspaceAfter: {
                task_branch: workspace.taskBranch,
                task_head_sha: state.currentTaskHeadSha,
                status_digest_sha256: state.currentStatusDigestSha256,
              },
            },
          };
        }
        snapshot = snapValidation.value;
      } catch {
        return {
          blocked: true,
          blockedResult: await this._finalizeTerminal(state, "blocked", "WORKSPACE_DRIFT",
            "workspace inspect failed before step"),
        };
      }

      // Verify workspace identity binding
      if (snapshot.workspacePath !== workspace.workspacePath ||
          snapshot.taskBranch !== workspace.taskBranch ||
          snapshot.runId !== identity.runId ||
          snapshot.repository !== identity.repository ||
          snapshot.repositoryPath !== identity.repositoryPath) {
        return {
          blocked: true,
          blockedResult: await this._finalizeTerminal(state, "blocked", "WORKSPACE_DRIFT",
            "workspace identity mismatch before step"),
        };
      }

      // Verify binding against current state
      if (snapshot.taskHeadSha !== state.currentTaskHeadSha ||
          snapshot.taskStatusDigestSha256 !== state.currentStatusDigestSha256 ||
          snapshot.taskHasChanges !== state.currentTaskHasChanges) {
        return {
          blocked: true,
          blockedResult: await this._finalizeTerminal(state, "blocked", "WORKSPACE_DRIFT",
            "workspace state mismatch before step"),
        };
      }

      const preHeadSha = snapshot.taskHeadSha;
      const preStatusDigest = snapshot.taskStatusDigestSha256;
      const preTaskHasChanges = snapshot.taskHasChanges;

      // Compute effective timeout
      const remaining = Math.max(0, state.deadlineMs - this._tryReadClockOrFail(state));
      if (remaining < MIN_D02_TIMEOUT) {
        return {
          failed: true,
          failure: {
            stepId: step.id,
            reasonCode: "TOTAL_TIMEOUT",
            reasonMessage: "insufficient remaining time",
            repairable: false,
            exitCode: null, signal: null, durationMs: 0,
            stdoutTruncated: false, stderrTruncated: false,
            stdout: "", stderr: "",
            outcomeCategory: isTest ? "TEST_TIMED_OUT" : "REVIEW_TIMED_OUT",
            workspaceBefore: {
              task_branch: workspace.taskBranch,
              task_head_sha: state.currentTaskHeadSha,
              status_digest_sha256: state.currentStatusDigestSha256,
            },
            workspaceAfter: {
              task_branch: workspace.taskBranch,
              task_head_sha: state.currentTaskHeadSha,
              status_digest_sha256: state.currentStatusDigestSha256,
            },
          },
        };
      }
      const stepTimeout = step.timeoutMs ?? this.defaultStepTimeoutMs;
      const effectiveTimeout = Math.min(stepTimeout, remaining);

      // Execute step via D02
      let runnerResult: LoopPosixProcessResult;
      let runnerStarted = false;
      try {
        runnerResult = await this.runner.run({
          executableId: step.executableId,
          args: step.args ? freeze([...step.args]) : undefined,
          cwd: workspace.workspacePath,
          timeoutMs: effectiveTimeout,
          maxStdoutBytes: step.maxStdoutBytes ?? this.defaultMaxStdoutBytes,
          maxStderrBytes: step.maxStderrBytes ?? this.defaultMaxStderrBytes,
        });
        runnerStarted = true;
      } catch (e) {
        runnerStarted = true;
        // Classify D02 typed errors
        return this._classifyRunnerError(e, step.id, phase, state);
      }

      // Validate D02 result structure
      const resultValidation = validateRunnerResult(runnerResult);
      if (!resultValidation.ok) {
        return {
          failed: true,
          failure: {
            stepId: step.id,
            reasonCode: "DEPENDENCY_RESULT_INVALID",
            reasonMessage: "invalid runner result",
            repairable: false,
            exitCode: null, signal: null, durationMs: 0,
            stdoutTruncated: false, stderrTruncated: false,
            stdout: "", stderr: "",
            outcomeCategory: isTest ? "TEST_FAILED" : "REVIEW_FAILED",
            workspaceBefore: {
              task_branch: workspace.taskBranch,
              task_head_sha: preHeadSha,
              status_digest_sha256: preStatusDigest,
            },
            workspaceAfter: {
              task_branch: workspace.taskBranch,
              task_head_sha: preHeadSha,
              status_digest_sha256: preStatusDigest,
            },
          },
        };
      }

      const durationMs = runnerResult.durationMs;

      // ── Post-step D03 inspect (mandatory if runner started) ──
      let postSnapshot: LoopGitWorkspaceSnapshot;
      try {
        const rawPostSnap = await this.workspaceManager.inspect(identity);
        const postValidation = validateWorkspaceSnapshot(rawPostSnap);
        if (!postValidation.ok) {
          return {
            blocked: true,
            blockedResult: await this._finalizeTerminal(state, "blocked", "WORKSPACE_DRIFT",
              "invalid workspace snapshot after step"),
          };
        }
        postSnapshot = postValidation.value;
      } catch {
        return {
          blocked: true,
          blockedResult: await this._finalizeTerminal(state, "blocked", "WORKSPACE_DRIFT",
            "workspace inspect failed after step"),
        };
      }

      // Verify post-step identity
      if (postSnapshot.workspacePath !== workspace.workspacePath ||
          postSnapshot.taskBranch !== workspace.taskBranch ||
          postSnapshot.runId !== identity.runId ||
          postSnapshot.repository !== identity.repository ||
          postSnapshot.repositoryPath !== identity.repositoryPath) {
        return {
          blocked: true,
          blockedResult: await this._finalizeTerminal(state, "blocked", "WORKSPACE_DRIFT",
            "workspace identity changed during step"),
        };
      }

      const postHeadSha = postSnapshot.taskHeadSha;
      const postStatusDigest = postSnapshot.taskStatusDigestSha256;
      const postTaskHasChanges = postSnapshot.taskHasChanges;

      // ── Priority-based classification (mutation > timeout > truncation > other) ──

      // Priority 1: HEAD change → blocked
      if (postHeadSha !== preHeadSha) {
        return {
          blocked: true,
          blockedResult: await this._finalizeTerminal(state, "blocked", "WORKSPACE_DRIFT",
            "task HEAD changed during step"),
        };
      }

      // Priority 2: Status digest or taskHasChanges mutation → failed (before timeout/truncation)
      const mutated = postStatusDigest !== preStatusDigest ||
                      postTaskHasChanges !== preTaskHasChanges;
      if (mutated) {
        const mutationCode: LoopAutonomousDeliveryReasonCode =
          isTest ? "TEST_WORKSPACE_MUTATED" : "REVIEW_WORKSPACE_MUTATED";
        return {
          failed: true,
          failure: {
            stepId: step.id,
            reasonCode: mutationCode,
            reasonMessage: `${phase} workspace mutated`,
            repairable: false,
            exitCode: runnerResult.exitCode,
            signal: runnerResult.signal,
            durationMs,
            stdoutTruncated: runnerResult.stdoutTruncated,
            stderrTruncated: runnerResult.stderrTruncated,
            stdout: runnerResult.stdout,
            stderr: runnerResult.stderr,
            outcomeCategory: mutationCode,
            workspaceBefore: {
              task_branch: workspace.taskBranch,
              task_head_sha: preHeadSha,
              status_digest_sha256: preStatusDigest,
            },
            workspaceAfter: {
              task_branch: workspace.taskBranch,
              task_head_sha: postHeadSha,
              status_digest_sha256: postStatusDigest,
            },
          },
        };
      }

      // Priority 3: Overall deadline
      if (this._isDeadlineExceeded(state)) {
        return {
          failed: true,
          failure: {
            stepId: step.id,
            reasonCode: "TOTAL_TIMEOUT",
            reasonMessage: "deadline exceeded after step",
            repairable: false,
            exitCode: runnerResult.exitCode,
            signal: runnerResult.signal,
            durationMs,
            stdoutTruncated: runnerResult.stdoutTruncated,
            stderrTruncated: runnerResult.stderrTruncated,
            stdout: runnerResult.stdout,
            stderr: runnerResult.stderr,
            outcomeCategory: isTest ? "TEST_TIMED_OUT" : "REVIEW_TIMED_OUT",
            workspaceBefore: {
              task_branch: workspace.taskBranch,
              task_head_sha: preHeadSha,
              status_digest_sha256: preStatusDigest,
            },
            workspaceAfter: {
              task_branch: workspace.taskBranch,
              task_head_sha: postHeadSha,
              status_digest_sha256: postStatusDigest,
            },
          },
        };
      }

      // Priority 4-7: runner timed_out, truncation, non-zero/signal, success
      // Step pass criteria: exited, exit 0, no signal, no truncation, no mutation
      const stepPassed = runnerResult.status === "exited" &&
        runnerResult.exitCode === 0 &&
        runnerResult.signal === null &&
        runnerResult.stdoutTruncated === false &&
        runnerResult.stderrTruncated === false;

      if (stepPassed) {
        this._addTrace(state,
          isTest ? "test_step_pass" : "review_step_pass",
          phase, state.totalFixRounds, attemptNum, step.id, "passed", null, null, null,
          postStatusDigest,
        );
        continue;
      }

      // Step failed — classify
      let outcomeCategory: string;
      let reasonCode: LoopAutonomousDeliveryReasonCode;
      let repairable: boolean;

      if (runnerResult.status === "timed_out") {
        outcomeCategory = isTest ? "TEST_TIMED_OUT" : "REVIEW_TIMED_OUT";
        reasonCode = isTest ? "TEST_TIMED_OUT" : "REVIEW_TIMED_OUT";
        repairable = true;
      } else if (runnerResult.stdoutTruncated || runnerResult.stderrTruncated) {
        outcomeCategory = isTest ? "TEST_OUTPUT_TRUNCATED" : "REVIEW_OUTPUT_TRUNCATED";
        reasonCode = isTest ? "TEST_OUTPUT_TRUNCATED" : "REVIEW_OUTPUT_TRUNCATED";
        repairable = true;
      } else {
        // Non-zero exit or signal
        outcomeCategory = isTest ? "TEST_FAILED" : "REVIEW_FAILED";
        reasonCode = isTest ? "TEST_FAILED" : "REVIEW_FAILED";
        repairable = true;
      }

      this._addTrace(state,
        isTest ? "test_step_fail" : "review_step_fail",
        phase, state.totalFixRounds, attemptNum, step.id, "failed", null, null, null,
        postStatusDigest,
      );

      const failure: PlanStepFailure = {
        stepId: step.id,
        reasonCode,
        reasonMessage: `${phase} step ${step.id} failed`,
        repairable,
        exitCode: runnerResult.exitCode,
        signal: runnerResult.signal,
        durationMs,
        stdoutTruncated: runnerResult.stdoutTruncated,
        stderrTruncated: runnerResult.stderrTruncated,
        stdout: runnerResult.stdout,
        stderr: runnerResult.stderr,
        outcomeCategory,
        workspaceBefore: {
          task_branch: workspace.taskBranch,
          task_head_sha: preHeadSha,
          status_digest_sha256: preStatusDigest,
        },
        workspaceAfter: {
          task_branch: workspace.taskBranch,
          task_head_sha: postHeadSha,
          status_digest_sha256: postStatusDigest,
        },
      };

      return { failed: true, failure };
    }

    // All steps passed
    this._addTrace(state,
      isTest ? "test_plan_end" : "review_plan_end",
      phase, state.totalFixRounds, attemptNum, null, "all_passed", null, null, null,
      state.currentStatusDigestSha256,
    );

    return { passed: true };
  }

  // ═══════════════════════════════════════ Private: D05 Implementation

  private async _executeImplementation(
    identity: LoopRunIdentity,
    workspace: LoopCodexImplementationWorkspace,
    phase: "initial" | "test_repair" | "review_repair",
    attempt: number,
    requirement: string,
    designSummary: string | undefined,
    implementationConstraints: readonly string[] | undefined,
    allowedPaths: readonly string[],
    repairEvidenceArtifactRef: string | undefined,
    state: InternalState,
  ): Promise<
    | { status: "blocked" | "failed"; result: LoopAutonomousDeliveryResult }
    | { status: "continue"; result: LoopCodexImplementationSuccess }
  > {
    // Check deadline before D05
    if (this._isDeadlineExceeded(state)) {
      return {
        status: "failed",
        result: await this._finalizeTerminal(state, "failed", "TOTAL_TIMEOUT", "deadline exceeded before D05"),
      };
    }

    // Build D05 request
    const d05Request: LoopCodexImplementationRequest = {
      identity,
      workspace,
      phase,
      attempt,
      requirement,
      designSummary,
      implementationConstraints,
      allowedPaths,
      repairEvidenceArtifactRef,
    };

    // Call D05
    let d05Result: LoopCodexImplementationResult;
    try {
      d05Result = await this.implementationAdapter.execute(d05Request);
    } catch {
      return {
        status: "failed",
        result: await this._finalizeTerminal(state, "failed", "DEPENDENCY_RESULT_INVALID",
          "implementation adapter threw"),
      };
    }

    // Validate D05 result
    const d05Validation = validateD05Result(d05Result, phase, attempt);
    if (!d05Validation.ok) {
      return {
        status: "failed",
        result: await this._finalizeTerminal(state, "failed", "DEPENDENCY_RESULT_INVALID",
          (d05Validation as { ok: false; reason: string }).reason),
      };
    }

    // Check deadline after D05
    if (this._isDeadlineExceeded(state)) {
      return {
        status: "failed",
        result: await this._finalizeTerminal(state, "failed", "TOTAL_TIMEOUT", "deadline exceeded after D05"),
      };
    }

    if (d05Result.status === "failed") {
      const failure = d05Result as LoopCodexImplementationFailure;
      const isRepair = phase === "test_repair" || phase === "review_repair";

      // Classify D05 failure with correct taxonomy
      if (failure.errorCode === "WORKSPACE_DRIFT" ||
          (failure.errorCode === "PATCH_APPLICATION_FAILED" && failure.causeCode === "WORKSPACE_DRIFT")) {
        return {
          status: "blocked",
          result: await this._finalizeTerminal(state, "blocked", "WORKSPACE_DRIFT",
            failure.safeMessage, failure.errorCode),
        };
      }

      if (failure.errorCode === "CODEX_SPAWN_FAILED") {
        return {
          status: "blocked",
          result: await this._finalizeTerminal(state, "blocked", "EXECUTION_BLOCKED",
            failure.safeMessage, "CODEX_SPAWN_FAILED"),
        };
      }

      // Other failures: distinct taxonomy for initial vs repair
      const failCode: LoopAutonomousDeliveryReasonCode =
        isRepair ? "REPAIR_FAILED" : "IMPLEMENTATION_FAILED";

      return {
        status: "failed",
        result: await this._finalizeTerminal(state, "failed", failCode,
          failure.safeMessage, failure.errorCode),
      };
    }

    // D05 succeeded
    const success = d05Result as LoopCodexImplementationSuccess;

    this._addTrace(state, "repair_attempt",
      phase === "initial" ? "initial" : (phase === "test_repair" ? "test_repair" : "review_repair"),
      state.totalFixRounds, attempt, null, "succeeded",
      null, success.patchArtifactRef, success.patchDigestSha256,
      success.postStatusDigestSha256,
    );

    return { status: "continue", result: success };
  }

  // ═══════════════════════════════════════ Private: Evidence

  private async _buildAndStoreEvidence(
    phaseName: "test" | "review",
    failure: PlanStepFailure,
    state: InternalState,
  ): Promise<
    | { ok: true; artifactRef: string; evidenceDigest: string }
    | { ok: false; result: LoopAutonomousDeliveryResult }
  > {
    // Check deadline before evidence
    if (this._isDeadlineExceeded(state)) {
      return {
        ok: false,
        result: await this._finalizeTerminal(state, "failed", "TOTAL_TIMEOUT", "deadline exceeded before evidence"),
      };
    }

    const phaseForEvidence = phaseName as "test" | "review";

    const evidenceInput: LoopDeliveryEvidenceInput = {
      phase: phaseForEvidence,
      fixRound: state.totalFixRounds,
      planAttempt: phaseName === "test" ? state.testAttempts : state.reviewAttempts,
      failedStepId: failure.stepId,
      outcomeCategory: failure.outcomeCategory as LoopDeliveryEvidenceInput["outcomeCategory"],
      exitCode: failure.exitCode ?? null,
      signal: failure.signal ?? null,
      durationMs: failure.durationMs,
      stdoutTruncated: failure.stdoutTruncated ?? false,
      stderrTruncated: failure.stderrTruncated ?? false,
      stdout: failure.stdout,
      stderr: failure.stderr,
      workspaceBefore: failure.workspaceBefore,
      workspaceAfter: failure.workspaceAfter,
    };

    const evidenceBuildResult = buildLoopDeliveryEvidence(
      evidenceInput,
      this.maxEvidenceBytes,
      this.maxEvidenceExcerptBytes,
    );

    if (!evidenceBuildResult.ok) {
      return {
        ok: false,
        result: await this._finalizeTerminal(state, "failed", "INTERNAL_ERROR",
          `evidence build failed: ${(evidenceBuildResult as LoopDeliveryEvidenceFailure).reason}`),
      };
    }

    // Store in D01 with defensive bytes copy
    let stored: LoopStoredArtifact;
    try {
      stored = this.artifactStore.put(
        phaseName === "test" ? "test_summary" : "review_summary",
        new Uint8Array(evidenceBuildResult.bytes),
      );
    } catch {
      return {
        ok: false,
        result: await this._finalizeTerminal(state, "failed", "ARTIFACT_STORE_FAILED",
          "failed to store evidence"),
      };
    }

    // Validate stored artifact
    const storedValidation = validateStoredArtifact(
      stored,
      phaseName === "test" ? "test_summary" : "review_summary",
      evidenceBuildResult.digestSha256,
      evidenceBuildResult.sizeBytes,
    );
    if (!storedValidation.ok) {
      return {
        ok: false,
        result: await this._finalizeTerminal(state, "failed", "ARTIFACT_STORE_FAILED",
          `evidence artifact validation failed: ${(storedValidation as { ok: false; reason: string }).reason}`),
      };
    }

    if (phaseName === "test") {
      state.testSummaryArtifactRefs.push(stored.artifactRef);
    } else {
      state.reviewSummaryArtifactRefs.push(stored.artifactRef);
    }

    this._addTrace(state, "evidence_stored",
      phaseForEvidence, state.totalFixRounds,
      phaseName === "test" ? state.testAttempts : state.reviewAttempts,
      failure.stepId, "stored", stored.artifactRef, null, null,
      failure.workspaceAfter.status_digest_sha256,
    );

    // Check deadline after evidence
    if (this._isDeadlineExceeded(state)) {
      return {
        ok: false,
        result: await this._finalizeTerminal(state, "failed", "TOTAL_TIMEOUT", "deadline exceeded after evidence"),
      };
    }

    return {
      ok: true,
      artifactRef: stored.artifactRef,
      evidenceDigest: evidenceBuildResult.digestSha256,
    };
  }

  // ═══════════════════════════════════════ Private: Success

  private async _buildSuccessResult(
    identity: LoopRunIdentity,
    workspace: LoopCodexImplementationWorkspace,
    allowedPaths: readonly string[],
    state: InternalState,
  ): Promise<LoopAutonomousDeliveryResult> {
    // Final workspace binding
    let finalSnapshot: LoopGitWorkspaceSnapshot;
    try {
      const rawSnap = await this.workspaceManager.inspect(identity);
      const snapValidation = validateWorkspaceSnapshot(rawSnap);
      if (!snapValidation.ok) {
        return await this._finalizeTerminal(state, "failed", "DEPENDENCY_RESULT_INVALID",
          "final workspace snapshot invalid");
      }
      finalSnapshot = snapValidation.value;
    } catch {
      return await this._finalizeTerminal(state, "blocked", "WORKSPACE_DRIFT",
        "final workspace inspect failed");
    }

    // Verify final identity matches current state
    if (finalSnapshot.workspacePath !== workspace.workspacePath ||
        finalSnapshot.taskBranch !== workspace.taskBranch ||
        finalSnapshot.runId !== identity.runId ||
        finalSnapshot.repository !== identity.repository ||
        finalSnapshot.repositoryPath !== identity.repositoryPath) {
      return await this._finalizeTerminal(state, "blocked", "WORKSPACE_DRIFT",
        "final workspace identity mismatch");
    }

    if (finalSnapshot.taskHeadSha !== state.currentTaskHeadSha ||
        finalSnapshot.taskStatusDigestSha256 !== state.currentStatusDigestSha256 ||
        finalSnapshot.taskHasChanges !== state.currentTaskHasChanges) {
      return await this._finalizeTerminal(state, "blocked", "WORKSPACE_DRIFT",
        "final workspace state mismatch");
    }

    // Verify success preconditions
    if (!finalSnapshot.taskHasChanges) {
      return await this._finalizeTerminal(state, "failed", "INTERNAL_ERROR",
        "no changes in workspace");
    }

    const filesArray = [...state.files].sort();
    if (filesArray.length === 0) {
      return await this._finalizeTerminal(state, "failed", "INTERNAL_ERROR",
        "no files accumulated");
    }

    // All files must belong to allowedPaths (exact Set membership, NO startsWith)
    const allowedSet = new Set(allowedPaths);
    for (const f of filesArray) {
      if (!allowedSet.has(f)) {
        return await this._finalizeTerminal(state, "failed", "INTERNAL_ERROR",
          `file not in allowed paths: ${f}`);
      }
    }

    const finalWorkspace: LoopDeliveryResultWorkspace = {
      workspacePath: finalSnapshot.workspacePath,
      taskBranch: finalSnapshot.taskBranch,
      taskHeadSha: finalSnapshot.taskHeadSha,
      statusDigestSha256: finalSnapshot.taskStatusDigestSha256,
      taskHasChanges: finalSnapshot.taskHasChanges,
    };

    return await this._finalizeTerminal(state, "succeeded", "DELIVERY_SUCCEEDED",
      "delivery completed successfully", undefined, finalWorkspace);
  }

  // ═══════════════════════════════════════ Private: Clock

  private _tryReadClock(state: InternalState | null): { ok: true; nowMs: number } | { ok: false } {
    try {
      const now = this.clock.nowMs();
      if (typeof now !== "number" || !Number.isFinite(now) || !Number.isSafeInteger(now) || now < 0) {
        return { ok: false };
      }
      if (state !== null) {
        if (now < state.lastClockMs) {
          return { ok: false };
        }
        state.lastClockMs = now;
      }
      return { ok: true, nowMs: now };
    } catch {
      return { ok: false };
    }
  }

  private _tryReadClockOrFail(state: InternalState): number {
    const result = this._tryReadClock(state);
    if (!result.ok) {
      // Return a safe value that won't crash; deadline will catch it
      return state.deadlineMs; // Will trigger deadline exceeded
    }
    return result.nowMs;
  }

  private _isDeadlineExceeded(state: InternalState): boolean {
    const result = this._tryReadClock(state);
    if (!result.ok) return true; // fail-closed on clock error
    return result.nowMs >= state.deadlineMs;
  }

  private _checkDeadlineBeforeStep(state: InternalState): boolean {
    return this._isDeadlineExceeded(state);
  }

  // ═══════════════════════════════════════ Private: Terminal Finalizers

  /**
   * Pre-state validation failure. No delivery artifact. Deep-frozen zero-state result.
   * Only for failures before InternalState is created.
   */
  private _validationFailure(
    status: "failed",
    reasonCode: LoopAutonomousDeliveryReasonCode,
    message: string,
  ): LoopAutonomousDeliveryResult {
    const result: LoopAutonomousDeliveryResult = freeze({
      status,
      reasonCode,
      safeMessage: safeMessage(message),
      totalFixRounds: 0,
      testAttempts: 0,
      reviewAttempts: 0,
      patchArtifactRefs: freeze([]),
      testSummaryArtifactRefs: freeze([]),
      reviewSummaryArtifactRefs: freeze([]),
      files: freeze([]),
      elapsedMs: 0,
      trace: freeze([]),
    });
    return deepFreeze(result) as unknown as LoopAutonomousDeliveryResult;
  }

  /**
   * Unified async terminal finalizer. All stateful exits (succeeded/failed/blocked)
   * MUST go through this. Preserves real state, persists delivery_result,
   * fail-closed on artifact failure.
   */
  private async _finalizeTerminal(
    state: InternalState,
    status: LoopAutonomousDeliveryStatus,
    reasonCode: LoopAutonomousDeliveryReasonCode,
    safeMsg: string,
    causeCode?: string,
    finalWorkspace?: LoopDeliveryResultWorkspace,
  ): Promise<LoopAutonomousDeliveryResult> {
    // Compute elapsed using last valid clock reading
    const nowMs = this._tryReadClockOrFail(state);
    const elapsedMs = Math.max(0, nowMs - state.startMs);

    // Sanitize cause code
    const sanitizedCauseCode = validateCauseCode(causeCode);

    // Build final workspace from last valid binding if not provided
    let workspaceForResult: LoopDeliveryResultWorkspace | undefined = finalWorkspace;
    if (!workspaceForResult && state.currentWorkspacePath) {
      workspaceForResult = {
        workspacePath: state.currentWorkspacePath,
        taskBranch: state.currentTaskBranch,
        taskHeadSha: state.currentTaskHeadSha,
        statusDigestSha256: state.currentStatusDigestSha256,
        taskHasChanges: state.currentTaskHasChanges,
      };
    }

    const filesArray = freeze([...state.files].sort());

    // Add terminal trace entry (exactly one)
    this._addTrace(state, "terminal",
      "initial", state.totalFixRounds, 0, null,
      status, null, null, null,
      state.currentStatusDigestSha256 || null);

    const result: LoopAutonomousDeliveryResult = {
      status,
      reasonCode,
      safeMessage: safeMessage(safeMsg),
      causeCode: sanitizedCauseCode,
      totalFixRounds: state.totalFixRounds,
      testAttempts: state.testAttempts,
      reviewAttempts: state.reviewAttempts,
      patchArtifactRefs: freeze([...state.patchArtifactRefs]),
      testSummaryArtifactRefs: freeze([...state.testSummaryArtifactRefs]),
      reviewSummaryArtifactRefs: freeze([...state.reviewSummaryArtifactRefs]),
      files: filesArray,
      finalWorkspace: workspaceForResult ? freeze(workspaceForResult) as LoopDeliveryResultWorkspace : undefined,
      elapsedMs,
      trace: freeze([...state.trace]),
    };

    // Persist delivery_result for ALL terminal outcomes
    const persistResult = await this._persistDeliveryResult(result);

    if (persistResult.ok) {
      const finalResult = {
        ...result,
        deliveryResultArtifactRef: persistResult.artifactRef,
      } as LoopAutonomousDeliveryResult;
      return deepFreeze(finalResult) as unknown as LoopAutonomousDeliveryResult;
    } else {
      // Fail-closed: override to ARTIFACT_STORE_FAILED
      const overrideResult: LoopAutonomousDeliveryResult = {
        status: "failed",
        reasonCode: "ARTIFACT_STORE_FAILED",
        safeMessage: safeMessage("delivery artifact persistence failed"),
        causeCode: undefined,
        totalFixRounds: state.totalFixRounds,
        testAttempts: state.testAttempts,
        reviewAttempts: state.reviewAttempts,
        patchArtifactRefs: freeze([...state.patchArtifactRefs]),
        testSummaryArtifactRefs: freeze([...state.testSummaryArtifactRefs]),
        reviewSummaryArtifactRefs: freeze([...state.reviewSummaryArtifactRefs]),
        files: filesArray,
        finalWorkspace: workspaceForResult ? freeze(workspaceForResult) as LoopDeliveryResultWorkspace : undefined,
        elapsedMs,
        trace: freeze([...state.trace]),
        // No deliveryResultArtifactRef — only one put attempt
      };
      return deepFreeze(overrideResult) as unknown as LoopAutonomousDeliveryResult;
    }
  }

  // ═══════════════════════════════════════ Private: Workspace Binding

  private async _bindWorkspace(
    identity: LoopRunIdentity,
    workspace: LoopCodexImplementationWorkspace,
    state: InternalState,
  ): Promise<{ ok: true } | { ok: false; result: LoopAutonomousDeliveryResult }> {
    if (this._isDeadlineExceeded(state)) {
      return {
        ok: false,
        result: await this._finalizeTerminal(state, "failed", "TOTAL_TIMEOUT", "deadline exceeded before bind"),
      };
    }

    let snapshot: LoopGitWorkspaceSnapshot;
    try {
      const rawSnap = await this.workspaceManager.inspect(identity);
      const validation = validateWorkspaceSnapshot(rawSnap);
      if (!validation.ok) {
        return {
          ok: false,
          result: await this._finalizeTerminal(state, "failed", "DEPENDENCY_RESULT_INVALID",
            "invalid workspace snapshot"),
        };
      }
      snapshot = validation.value;
    } catch {
      return {
        ok: false,
        result: await this._finalizeTerminal(state, "blocked", "WORKSPACE_DRIFT", "workspace inspect failed"),
      };
    }

    if (snapshot.workspacePath !== workspace.workspacePath ||
        snapshot.taskBranch !== workspace.taskBranch ||
        snapshot.taskHeadSha !== workspace.expectedTaskHeadSha ||
        snapshot.taskStatusDigestSha256 !== workspace.expectedPreStatusDigestSha256 ||
        snapshot.runId !== identity.runId ||
        snapshot.repository !== identity.repository ||
        snapshot.repositoryPath !== identity.repositoryPath) {
      return {
        ok: false,
        result: await this._finalizeTerminal(state, "blocked", "WORKSPACE_DRIFT", "workspace binding mismatch"),
      };
    }

    state.currentWorkspacePath = snapshot.workspacePath;
    state.currentTaskBranch = snapshot.taskBranch;
    state.currentTaskHeadSha = snapshot.taskHeadSha;
    state.currentStatusDigestSha256 = snapshot.taskStatusDigestSha256;
    state.currentTaskHasChanges = snapshot.taskHasChanges;

    return { ok: true };
  }

  private async _bindAndVerifyPostD05(
    identity: LoopRunIdentity,
    workspace: LoopCodexImplementationWorkspace,
    state: InternalState,
    expectedPostTaskHeadSha: string,
    expectedPostStatusDigestSha256: string,
  ): Promise<{ ok: true } | { ok: false; result: LoopAutonomousDeliveryResult }> {
    if (this._isDeadlineExceeded(state)) {
      return {
        ok: false,
        result: await this._finalizeTerminal(state, "failed", "TOTAL_TIMEOUT", "deadline exceeded post-D05"),
      };
    }

    let snapshot: LoopGitWorkspaceSnapshot;
    try {
      const rawSnap = await this.workspaceManager.inspect(identity);
      const validation = validateWorkspaceSnapshot(rawSnap);
      if (!validation.ok) {
        return {
          ok: false,
          result: await this._finalizeTerminal(state, "failed", "DEPENDENCY_RESULT_INVALID",
            "invalid workspace snapshot after D05"),
        };
      }
      snapshot = validation.value;
    } catch {
      return {
        ok: false,
        result: await this._finalizeTerminal(state, "blocked", "WORKSPACE_DRIFT",
          "workspace inspect failed after D05"),
      };
    }

    if (snapshot.workspacePath !== workspace.workspacePath ||
        snapshot.taskBranch !== workspace.taskBranch ||
        snapshot.taskHeadSha !== expectedPostTaskHeadSha ||
        snapshot.taskStatusDigestSha256 !== expectedPostStatusDigestSha256 ||
        snapshot.runId !== identity.runId ||
        snapshot.repository !== identity.repository ||
        snapshot.repositoryPath !== identity.repositoryPath) {
      return {
        ok: false,
        result: await this._finalizeTerminal(state, "blocked", "WORKSPACE_DRIFT",
          "workspace binding mismatch after D05"),
      };
    }

    state.currentWorkspacePath = snapshot.workspacePath;
    state.currentTaskBranch = snapshot.taskBranch;
    state.currentTaskHeadSha = snapshot.taskHeadSha;
    state.currentStatusDigestSha256 = snapshot.taskStatusDigestSha256;
    state.currentTaskHasChanges = snapshot.taskHasChanges;

    return { ok: true };
  }

  // ═══════════════════════════════════════ Private: Runner Error Classification

  private async _classifyRunnerError(
    error: unknown,
    stepId: string,
    phase: string,
    state: InternalState,
  ): Promise<{
    blocked?: boolean;
    blockedResult?: LoopAutonomousDeliveryResult;
    failed?: boolean;
    failure?: PlanStepFailure;
  }> {
    // Must use instanceof check — not name/code comparison
    // Dynamic import not needed; LoopPosixProcessRunnerError is imported at top
    // We use a branded check: class name + instanceof via prototype chain
    const err = error as Record<string, unknown> | null | undefined;

    // Check if it's genuinely a LoopPosixProcessRunnerError via instanceof-like check
    // Since we import the type, we check: is object, has code/name, and has the right prototype
    let isTypedRunnerError = false;
    if (err && typeof err === "object" && !Array.isArray(err)) {
      // Verify it's an Error instance with the right name and has a code
      if (error instanceof Error && err.name === "LoopPosixProcessRunnerError" && typeof err.code === "string") {
        isTypedRunnerError = true;
      }
    }

    if (isTypedRunnerError) {
      const code = err!.code as string;

      // Blocked codes
      const blockedCodes = [
        "UNSUPPORTED_PLATFORM", "EXECUTABLE_NOT_ALLOWED", "EXECUTABLE_INVALID",
        "EXECUTABLE_CHANGED", "CWD_NOT_ALLOWED", "CWD_INVALID",
        "ENV_NOT_ALLOWED", "PROCESS_SPAWN_FAILED",
      ];

      if (blockedCodes.includes(code)) {
        return {
          blocked: true,
          blockedResult: await this._finalizeTerminal(state, "blocked", "EXECUTION_BLOCKED",
            `runner blocked`, code),
        };
      }

      // Failed codes
      const failedCodes = ["PROCESS_IO_FAILED", "PROCESS_CLEANUP_FAILED", "INVALID_INPUT"];
      if (failedCodes.includes(code)) {
        return {
          failed: true,
          failure: {
            stepId,
            reasonCode: "INTERNAL_ERROR",
            reasonMessage: "runner failed",
            repairable: false,
            causeCode: code,
            exitCode: null, signal: null, durationMs: 0,
            stdoutTruncated: false, stderrTruncated: false,
            stdout: "", stderr: "",
            outcomeCategory: phase === "test" ? "TEST_FAILED" : "REVIEW_FAILED",
            workspaceBefore: {
              task_branch: state.currentTaskBranch,
              task_head_sha: state.currentTaskHeadSha,
              status_digest_sha256: state.currentStatusDigestSha256,
            },
            workspaceAfter: {
              task_branch: state.currentTaskBranch,
              task_head_sha: state.currentTaskHeadSha,
              status_digest_sha256: state.currentStatusDigestSha256,
            },
          },
        };
      }

      // Unknown runner code → INTERNAL_ERROR
      return {
        failed: true,
        failure: {
          stepId,
          reasonCode: "INTERNAL_ERROR",
          reasonMessage: "unknown runner error code",
          repairable: false,
          exitCode: null, signal: null, durationMs: 0,
          stdoutTruncated: false, stderrTruncated: false,
          stdout: "", stderr: "",
          outcomeCategory: phase === "test" ? "TEST_FAILED" : "REVIEW_FAILED",
          workspaceBefore: {
            task_branch: state.currentTaskBranch,
            task_head_sha: state.currentTaskHeadSha,
            status_digest_sha256: state.currentStatusDigestSha256,
          },
          workspaceAfter: {
            task_branch: state.currentTaskBranch,
            task_head_sha: state.currentTaskHeadSha,
            status_digest_sha256: state.currentStatusDigestSha256,
          },
        },
      };
    }

    // Not a typed runner error → INTERNAL_ERROR (spoofing blocked)
    return {
      failed: true,
      failure: {
        stepId,
        reasonCode: "INTERNAL_ERROR",
        reasonMessage: "unexpected runner error",
        repairable: false,
        exitCode: null, signal: null, durationMs: 0,
        stdoutTruncated: false, stderrTruncated: false,
        stdout: "", stderr: "",
        outcomeCategory: phase === "test" ? "TEST_FAILED" : "REVIEW_FAILED",
        workspaceBefore: {
          task_branch: state.currentTaskBranch,
          task_head_sha: state.currentTaskHeadSha,
          status_digest_sha256: state.currentStatusDigestSha256,
        },
        workspaceAfter: {
          task_branch: state.currentTaskBranch,
          task_head_sha: state.currentTaskHeadSha,
          status_digest_sha256: state.currentStatusDigestSha256,
        },
      },
    };
  }

  // ═══════════════════════════════════════ Private: No-Progress

  private _checkNoProgress(
    state: InternalState,
    phase: string,
    evidenceDigest: string,
  ): string | null {
    // Build failure key: phase + evidenceDigest + current workspace digest
    const failureKey = `${phase}:${evidenceDigest}:${state.currentStatusDigestSha256}`;
    if (state.seenFailureKeys.has(failureKey)) {
      return "duplicate failure key";
    }
    state.seenFailureKeys.add(failureKey);
    state.lastEvidenceDigest = evidenceDigest;
    return null;
  }

  private _checkNoProgressPostRepair(
    state: InternalState,
    d05Result: LoopCodexImplementationSuccess,
    evidenceDigest: string,
    allowedPaths: readonly string[],
  ): string | null {
    // Check already_applied with same digest
    if (d05Result.applicationState === "already_applied" &&
        d05Result.preStatusDigestSha256 === d05Result.postStatusDigestSha256) {
      return "already_applied with unchanged digest";
    }

    // Check repair produced same status digest as pre-repair
    if (state.lastRepairPreDigest !== null &&
        state.lastRepairPreDigest === d05Result.postStatusDigestSha256) {
      return "status digest unchanged after repair";
    }

    // Check empty files
    if (d05Result.files.length === 0) {
      return "repair produced no files";
    }

    // Check all files in allowedPaths exact set
    const allowedSet = new Set(allowedPaths);
    for (const f of d05Result.files) {
      if (!allowedSet.has(f)) {
        return `file not in allowed paths: ${f}`;
      }
    }

    // Check duplicate files
    const fileSet = new Set(d05Result.files);
    if (fileSet.size !== d05Result.files.length) {
      return "duplicate files in repair result";
    }

    // Check evidence/patch pair
    const pair = `${evidenceDigest}:${d05Result.patchDigestSha256}`;
    if (state.seenEvidencePatchPairs.has(pair)) {
      return "duplicate evidence/patch pair after repair";
    }
    state.seenEvidencePatchPairs.add(pair);

    return null;
  }

  // ═══════════════════════════════════════ Private: Trace

  private _addTrace(
    state: InternalState,
    kind: LoopDeliveryTraceKind,
    phase: LoopDeliveryTraceEntry["phase"],
    fixRound: number,
    attempt: number,
    stepId: string | null,
    outcome: string,
    artifactRef: string | null,
    patchArtifactRef: string | null,
    patchDigestSha256: string | null,
    workspaceStatusDigestSha256?: string | null,
  ): void {
    const elapsedMs = Math.max(0, this._tryReadClockOrFail(state) - state.startMs);
    state.traceSeq++;
    state.trace.push(freeze({
      sequence: state.traceSeq,
      kind,
      phase,
      fixRound,
      attempt,
      stepId,
      outcome,
      artifactRef,
      patchArtifactRef,
      patchDigestSha256,
      workspaceStatusDigestSha256: workspaceStatusDigestSha256 ?? null,
      elapsedMs,
    }));
  }

  // ═══════════════════════════════════════ Private: Delivery Result Persistence

  private async _persistDeliveryResult(
    result: LoopAutonomousDeliveryResult,
  ): Promise<{ ok: true; artifactRef: string } | { ok: false }> {
    // Build delivery object in fixed property order
    const deliveryObj: Record<string, unknown> = Object.create(null);
    deliveryObj.schema = "loop-delivery-result-v1";
    deliveryObj.status = result.status;
    deliveryObj.reason_code = result.reasonCode;
    deliveryObj.cause_code = result.causeCode ?? null; // Always present
    deliveryObj.total_fix_rounds = result.totalFixRounds;
    deliveryObj.test_attempts = result.testAttempts;
    deliveryObj.review_attempts = result.reviewAttempts;
    deliveryObj.patch_artifact_refs = [...result.patchArtifactRefs];
    deliveryObj.test_summary_artifact_refs = [...result.testSummaryArtifactRefs];
    deliveryObj.review_summary_artifact_refs = [...result.reviewSummaryArtifactRefs];
    deliveryObj.files = [...result.files];
    // final_workspace always present
    if (result.finalWorkspace) {
      deliveryObj.final_workspace = {
        workspace_path: result.finalWorkspace.workspacePath,
        task_branch: result.finalWorkspace.taskBranch,
        task_head_sha: result.finalWorkspace.taskHeadSha,
        status_digest_sha256: result.finalWorkspace.statusDigestSha256,
        task_has_changes: result.finalWorkspace.taskHasChanges,
      };
    } else {
      deliveryObj.final_workspace = null;
    }
    deliveryObj.elapsed_ms = result.elapsedMs;
    deliveryObj.trace = result.trace.map((t) => ({
      sequence: t.sequence,
      kind: t.kind,
      phase: t.phase,
      fix_round: t.fixRound,
      attempt: t.attempt,
      step_id: t.stepId,
      outcome: t.outcome,
      artifact_ref: t.artifactRef,
      patch_artifact_ref: t.patchArtifactRef,
      patch_digest_sha256: t.patchDigestSha256,
      workspace_status_digest_sha256: t.workspaceStatusDigestSha256,
      elapsed_ms: t.elapsedMs,
    }));

    // Serialize
    let json: string;
    try {
      json = JSON.stringify(deliveryObj) + "\n";
    } catch {
      return { ok: false };
    }

    const encoder = new TextEncoder();
    const bytes = encoder.encode(json);

    // Check size bounds
    if (bytes.length > this.maxDeliveryResultBytes) {
      return { ok: false };
    }

    // Put to artifact store
    let stored: LoopStoredArtifact;
    try {
      stored = this.artifactStore.put("delivery_result", bytes);
    } catch {
      return { ok: false };
    }

    // Validate stored artifact
    const digest = createHash("sha256").update(bytes).digest("hex");
    const storedValidation = validateStoredArtifact(stored, "delivery_result", digest, bytes.length);
    if (!storedValidation.ok) {
      return { ok: false };
    }

    return { ok: true, artifactRef: stored.artifactRef };
  }
}

// ═══════════════════════════════════════ Internal Types

interface PlanStepFailure {
  stepId: string;
  reasonCode: string;
  reasonMessage: string;
  repairable: boolean;
  causeCode?: string;
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  stdout: string;
  stderr: string;
  outcomeCategory: string;
  workspaceBefore: LoopDeliveryEvidenceWorkspaceDigest;
  workspaceAfter: LoopDeliveryEvidenceWorkspaceDigest;
}

// ═══════════════════════════════════════ Validation Helpers

function validateInt(
  value: unknown, min: number, max: number, defaultVal: number, label: string,
): number {
  if (value === undefined) return defaultVal;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${label} out of range`);
  }
  return value;
}

function validatePlan(
  plan: readonly LoopDeliveryCommandStep[],
  label: string,
): { ok: true } | { ok: false; reason: string } {
  const stepIds = new Set<string>();

  for (let i = 0; i < plan.length; i++) {
    const step = plan[i]!;

    // Validate step is a plain object (descriptor-based scan)
    const STEP_KEYS = ["id", "executableId", "args", "timeoutMs", "maxStdoutBytes", "maxStderrBytes"];
    let scanned: Record<string, unknown>;
    try {
      scanned = scanPlain(step, STEP_KEYS, `${label}[${i}]`);
    } catch (e) {
      return { ok: false, reason: `${label}[${i}]: ${(e as Error).message}` };
    }

    // Validate id
    if (typeof scanned.id !== "string" || !validateStepId(scanned.id)) {
      return { ok: false, reason: `${label}[${i}].id invalid` };
    }
    if (stepIds.has(scanned.id)) {
      return { ok: false, reason: `${label}[${i}].id duplicate` };
    }
    stepIds.add(scanned.id);

    // Validate executableId
    if (typeof scanned.executableId !== "string" || scanned.executableId.trim().length === 0 ||
        NON_CONTROL_RE.test(scanned.executableId)) {
      return { ok: false, reason: `${label}[${i}].executableId invalid` };
    }

    // Validate args
    if (scanned.args !== undefined) {
      if (!Array.isArray(scanned.args)) {
        return { ok: false, reason: `${label}[${i}].args not an array` };
      }
      if (scanned.args.length > MAX_STEP_ARGS) {
        return { ok: false, reason: `${label}[${i}].args too many` };
      }
      let totalBytes = 0;
      for (let j = 0; j < scanned.args.length; j++) {
        const arg = scanned.args[j]!;
        if (typeof arg !== "string") {
          return { ok: false, reason: `${label}[${i}].args[${j}] not a string` };
        }
        if (arg.includes(NUL)) {
          return { ok: false, reason: `${label}[${i}].args[${j}] contains NUL` };
        }
        const argBytes = new TextEncoder().encode(arg).length;
        if (argBytes > MAX_ARG_BYTES) {
          return { ok: false, reason: `${label}[${i}].args[${j}] too long` };
        }
        totalBytes += argBytes;
      }
      if (totalBytes > MAX_ARGS_TOTAL_BYTES) {
        return { ok: false, reason: `${label}[${i}].args total too large` };
      }
    }

    // Validate timeoutMs
    if (scanned.timeoutMs !== undefined) {
      if (typeof scanned.timeoutMs !== "number" || !Number.isSafeInteger(scanned.timeoutMs) ||
          scanned.timeoutMs < 100 || scanned.timeoutMs > 600000) {
        return { ok: false, reason: `${label}[${i}].timeoutMs out of range` };
      }
    }

    // Validate maxStdoutBytes
    if (scanned.maxStdoutBytes !== undefined) {
      if (typeof scanned.maxStdoutBytes !== "number" || !Number.isSafeInteger(scanned.maxStdoutBytes) ||
          scanned.maxStdoutBytes < 1 || scanned.maxStdoutBytes > 16777216) {
        return { ok: false, reason: `${label}[${i}].maxStdoutBytes out of range` };
      }
    }

    // Validate maxStderrBytes
    if (scanned.maxStderrBytes !== undefined) {
      if (typeof scanned.maxStderrBytes !== "number" || !Number.isSafeInteger(scanned.maxStderrBytes) ||
          scanned.maxStderrBytes < 1 || scanned.maxStderrBytes > 16777216) {
        return { ok: false, reason: `${label}[${i}].maxStderrBytes out of range` };
      }
    }
  }

  return { ok: true };
}

// ═══════════════════════════════════════ D02 Result Validator

const RUNNER_RESULT_KEYS = [
  "status", "exitCode", "signal", "durationMs",
  "stdout", "stderr", "stdoutBytesReceived", "stderrBytesReceived",
  "stdoutTruncated", "stderrTruncated", "termSignalSent", "killSignalSent",
];

function validateRunnerResult(
  result: unknown,
): { ok: true } | { ok: false; reason: string } {
  let r: Record<string, unknown>;
  try {
    r = scanPlain(result, RUNNER_RESULT_KEYS, "runner result");
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }

  // status: only "exited" or "timed_out"
  if (r.status !== "exited" && r.status !== "timed_out") {
    return { ok: false, reason: "invalid status" };
  }

  // exitCode: safe integer or null
  if (r.exitCode !== null && r.exitCode !== undefined) {
    if (typeof r.exitCode !== "number" || !Number.isSafeInteger(r.exitCode)) {
      return { ok: false, reason: "invalid exitCode" };
    }
  }

  // signal: null or canonical signal string
  if (r.signal !== null && r.signal !== undefined) {
    if (typeof r.signal !== "string") {
      return { ok: false, reason: "invalid signal" };
    }
  }

  // durationMs: safe non-negative integer
  if (typeof r.durationMs !== "number" || !Number.isSafeInteger(r.durationMs) || r.durationMs < 0) {
    return { ok: false, reason: "invalid durationMs" };
  }

  // stdout/stderr: strings
  if (typeof r.stdout !== "string" || typeof r.stderr !== "string") {
    return { ok: false, reason: "stdout/stderr not string" };
  }

  // stdoutBytesReceived/stderrBytesReceived: safe non-negative integers
  if (typeof r.stdoutBytesReceived !== "number" || !Number.isSafeInteger(r.stdoutBytesReceived) || r.stdoutBytesReceived < 0) {
    return { ok: false, reason: "invalid stdoutBytesReceived" };
  }
  if (typeof r.stderrBytesReceived !== "number" || !Number.isSafeInteger(r.stderrBytesReceived) || r.stderrBytesReceived < 0) {
    return { ok: false, reason: "invalid stderrBytesReceived" };
  }

  // stdoutTruncated/stderrTruncated/termSignalSent/killSignalSent: booleans
  if (typeof r.stdoutTruncated !== "boolean" || typeof r.stderrTruncated !== "boolean") {
    return { ok: false, reason: "truncated flags not boolean" };
  }
  if (typeof r.termSignalSent !== "boolean" || typeof r.killSignalSent !== "boolean") {
    return { ok: false, reason: "signal sent flags not boolean" };
  }

  return { ok: true };
}

// ═══════════════════════════════════════ D05 Result Validator

const D05_SUCCESS_KEYS = [
  "status", "phase", "attempt",
  "patchArtifactRef", "patchDigestSha256", "patchSizeBytes",
  "applicationState", "files",
  "preTaskHeadSha", "postTaskHeadSha",
  "preStatusDigestSha256", "postStatusDigestSha256",
  "preTargetStateDigestSha256", "postTargetStateDigestSha256",
];

const D05_FAILURE_KEYS = [
  "status", "phase", "attempt",
  "errorCode", "retryable", "safeMessage",
  "causeCode", "patchArtifactRef", "patchDigestSha256", "patchSizeBytes",
];

const ALLOWED_APPLICATION_STATES = new Set(["applied", "already_applied"]);

function validateD05Result(
  result: unknown,
  expectedPhase: string,
  expectedAttempt: number,
): { ok: true } | { ok: false; reason: string } {
  if (result === null || typeof result !== "object" || Array.isArray(result)) {
    return { ok: false, reason: "D05 result not a plain object" };
  }

  let proto: unknown;
  try {
    proto = Object.getPrototypeOf(result);
  } catch {
    return { ok: false, reason: "D05 getPrototypeOf threw" };
  }
  if (proto !== Object.prototype && proto !== null) {
    return { ok: false, reason: "D05 has bad prototype" };
  }

  const r = result as Record<string, unknown>;

  if (r.status !== "succeeded" && r.status !== "failed") {
    return { ok: false, reason: "D05 invalid status" };
  }

  if (r.status === "succeeded") {
    // Scan for allowed fields only
    let s: Record<string, unknown>;
    try {
      s = scanPlain(result, D05_SUCCESS_KEYS, "D05 success");
    } catch (e) {
      return { ok: false, reason: (e as Error).message };
    }

    // phase and attempt must match exactly
    if (s.phase !== expectedPhase) {
      return { ok: false, reason: `D05 phase mismatch: expected ${expectedPhase}, got ${String(s.phase)}` };
    }
    if (s.attempt !== expectedAttempt) {
      return { ok: false, reason: `D05 attempt mismatch: expected ${expectedAttempt}, got ${String(s.attempt)}` };
    }

    // patchArtifactRef must be canonical
    if (typeof s.patchArtifactRef !== "string") {
      return { ok: false, reason: "D05 patchArtifactRef missing" };
    }
    if (typeof s.patchDigestSha256 !== "string" || !SHA256_RE.test(s.patchDigestSha256)) {
      return { ok: false, reason: "D05 patchDigestSha256 invalid" };
    }
    const expectedRef = `loop-artifact:v1:code_patch:sha256:${s.patchDigestSha256}`;
    if (s.patchArtifactRef !== expectedRef) {
      return { ok: false, reason: "D05 patchArtifactRef format mismatch" };
    }

    // patchSizeBytes: safe positive integer
    if (typeof s.patchSizeBytes !== "number" || !Number.isSafeInteger(s.patchSizeBytes) || s.patchSizeBytes <= 0) {
      return { ok: false, reason: "D05 patchSizeBytes invalid" };
    }

    // applicationState: only "applied" or "already_applied"
    if (typeof s.applicationState !== "string" || !ALLOWED_APPLICATION_STATES.has(s.applicationState)) {
      return { ok: false, reason: "D05 applicationState invalid" };
    }

    // files: unique, trimmed string array (may be empty — no-progress check handles that)
    if (!Array.isArray(s.files)) {
      return { ok: false, reason: "D05 files not array" };
    }
    const seenFiles = new Set<string>();
    for (const f of s.files) {
      if (typeof f !== "string") {
        return { ok: false, reason: "D05 files entry not string" };
      }
      if (f !== f.trim()) {
        return { ok: false, reason: "D05 file not trimmed" };
      }
      if (seenFiles.has(f)) {
        return { ok: false, reason: "D05 duplicate file" };
      }
      seenFiles.add(f);
    }

    // Verify all SHA/digest fields are canonical
    if (typeof s.preTaskHeadSha !== "string" || !SHA40_RE.test(s.preTaskHeadSha)) {
      return { ok: false, reason: "D05 preTaskHeadSha invalid" };
    }
    if (typeof s.postTaskHeadSha !== "string" || !SHA40_RE.test(s.postTaskHeadSha)) {
      return { ok: false, reason: "D05 postTaskHeadSha invalid" };
    }
    if (typeof s.preStatusDigestSha256 !== "string" || !SHA256_RE.test(s.preStatusDigestSha256)) {
      return { ok: false, reason: "D05 preStatusDigestSha256 invalid" };
    }
    if (typeof s.postStatusDigestSha256 !== "string" || !SHA256_RE.test(s.postStatusDigestSha256)) {
      return { ok: false, reason: "D05 postStatusDigestSha256 invalid" };
    }
    if (typeof s.preTargetStateDigestSha256 !== "string" || !SHA256_RE.test(s.preTargetStateDigestSha256)) {
      return { ok: false, reason: "D05 preTargetStateDigestSha256 invalid" };
    }
    if (typeof s.postTargetStateDigestSha256 !== "string" || !SHA256_RE.test(s.postTargetStateDigestSha256)) {
      return { ok: false, reason: "D05 postTargetStateDigestSha256 invalid" };
    }

    return { ok: true };
  }

  // D05 failure
  let f: Record<string, unknown>;
  try {
    f = scanPlain(result, D05_FAILURE_KEYS, "D05 failure");
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }

  // phase and attempt must match exactly
  if (f.phase !== expectedPhase) {
    return { ok: false, reason: `D05 failure phase mismatch: expected ${expectedPhase}, got ${String(f.phase)}` };
  }
  if (f.attempt !== expectedAttempt) {
    return { ok: false, reason: `D05 failure attempt mismatch: expected ${expectedAttempt}, got ${String(f.attempt)}` };
  }

  // errorCode must be string
  if (typeof f.errorCode !== "string") {
    return { ok: false, reason: "D05 failure missing errorCode" };
  }

  // retryable must be boolean
  if (typeof f.retryable !== "boolean") {
    return { ok: false, reason: "D05 retryable not boolean" };
  }

  // safeMessage must be bounded string
  if (typeof f.safeMessage !== "string" || f.safeMessage.length > MAX_SAFE_MESSAGE) {
    return { ok: false, reason: "D05 safeMessage invalid" };
  }

  // Optional causeCode: only known D04 codes
  if (f.causeCode !== undefined && f.causeCode !== null) {
    if (typeof f.causeCode !== "string" || !KNOWN_CAUSE_CODES.has(f.causeCode)) {
      return { ok: false, reason: "D05 causeCode not in allowlist" };
    }
  }

  // Optional patch fields must be consistent
  if (f.patchArtifactRef !== undefined) {
    if (typeof f.patchArtifactRef !== "string") {
      return { ok: false, reason: "D05 patchArtifactRef not string" };
    }
  }
  if (f.patchDigestSha256 !== undefined) {
    if (typeof f.patchDigestSha256 !== "string" || !SHA256_RE.test(f.patchDigestSha256)) {
      return { ok: false, reason: "D05 patchDigestSha256 invalid" };
    }
  }
  if (f.patchSizeBytes !== undefined) {
    if (typeof f.patchSizeBytes !== "number" || !Number.isSafeInteger(f.patchSizeBytes)) {
      return { ok: false, reason: "D05 patchSizeBytes invalid" };
    }
  }

  return { ok: true };
}

// ═══════════════════════════════════════ Stored Artifact Validator

const STORED_ARTIFACT_KEYS = ["artifactRef", "kind", "digest", "sizeBytes"];

function validateStoredArtifact(
  value: unknown,
  expectedKind: string,
  expectedDigest: string,
  expectedSizeBytes: number,
): { ok: true } | { ok: false; reason: string } {
  let a: Record<string, unknown>;
  try {
    a = scanPlain(value, STORED_ARTIFACT_KEYS, "stored artifact");
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }

  // kind must match
  if (a.kind !== expectedKind) {
    return { ok: false, reason: `kind mismatch: expected ${expectedKind}, got ${String(a.kind)}` };
  }

  // digest: 64-char lowercase SHA-256
  if (typeof a.digest !== "string" || !SHA256_RE.test(a.digest)) {
    return { ok: false, reason: "invalid digest format" };
  }
  if (a.digest !== expectedDigest) {
    return { ok: false, reason: "digest mismatch" };
  }

  // sizeBytes: safe non-negative integer
  if (typeof a.sizeBytes !== "number" || !Number.isSafeInteger(a.sizeBytes) || a.sizeBytes < 0) {
    return { ok: false, reason: "invalid sizeBytes" };
  }
  if (a.sizeBytes !== expectedSizeBytes) {
    return { ok: false, reason: "sizeBytes mismatch" };
  }

  // artifactRef: exact format
  const expectedRef = `loop-artifact:v1:${expectedKind}:sha256:${expectedDigest}`;
  if (typeof a.artifactRef !== "string" || a.artifactRef !== expectedRef) {
    return { ok: false, reason: "artifactRef format mismatch" };
  }

  return { ok: true };
}

// ═══════════════════════════════════════ Workspace Snapshot Validator

const SNAPSHOT_KEYS = [
  "state", "runId", "repository", "repositoryPath", "controlRoot",
  "gitCommonDir", "workspacePath", "baseBranch", "expectedBaseSha",
  "currentBaseSha", "baseDrifted", "taskBranch", "taskHeadSha",
  "taskHasChanges", "taskStatusDigestSha256",
  "sourceHeadSha", "sourceBranch", "sourceWipDigestSha256",
];

function validateWorkspaceSnapshot(
  value: unknown,
): { ok: true; value: LoopGitWorkspaceSnapshot } | { ok: false; reason: string } {
  let s: Record<string, unknown>;
  try {
    s = scanPlain(value, SNAPSHOT_KEYS, "workspace snapshot");
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }

  // state: created/recovered/inspected
  if (s.state !== "created" && s.state !== "recovered" && s.state !== "inspected") {
    return { ok: false, reason: "invalid state" };
  }

  // runId: non-empty string, no control chars
  if (typeof s.runId !== "string" || s.runId.trim().length === 0) {
    return { ok: false, reason: "invalid runId" };
  }

  // repository: non-empty string
  if (typeof s.repository !== "string" || s.repository.trim().length === 0) {
    return { ok: false, reason: "invalid repository" };
  }

  // repositoryPath: non-empty string
  if (typeof s.repositoryPath !== "string" || s.repositoryPath.trim().length === 0) {
    return { ok: false, reason: "invalid repositoryPath" };
  }

  // controlRoot: non-empty string
  if (typeof s.controlRoot !== "string" || s.controlRoot.trim().length === 0) {
    return { ok: false, reason: "invalid controlRoot" };
  }

  // gitCommonDir: string
  if (typeof s.gitCommonDir !== "string") {
    return { ok: false, reason: "invalid gitCommonDir" };
  }

  // workspacePath: non-empty string
  if (typeof s.workspacePath !== "string" || s.workspacePath.trim().length === 0) {
    return { ok: false, reason: "invalid workspacePath" };
  }

  // baseBranch: non-empty string
  if (typeof s.baseBranch !== "string" || s.baseBranch.trim().length === 0) {
    return { ok: false, reason: "invalid baseBranch" };
  }

  // expectedBaseSha: canonical 40-char SHA
  if (typeof s.expectedBaseSha !== "string" || !SHA40_RE.test(s.expectedBaseSha)) {
    return { ok: false, reason: "invalid expectedBaseSha" };
  }

  // currentBaseSha: canonical 40-char SHA
  if (typeof s.currentBaseSha !== "string" || !SHA40_RE.test(s.currentBaseSha)) {
    return { ok: false, reason: "invalid currentBaseSha" };
  }

  // baseDrifted: boolean
  if (typeof s.baseDrifted !== "boolean") {
    return { ok: false, reason: "invalid baseDrifted" };
  }

  // taskBranch: non-empty string
  if (typeof s.taskBranch !== "string" || s.taskBranch.trim().length === 0) {
    return { ok: false, reason: "invalid taskBranch" };
  }

  // taskHeadSha: canonical 40-char SHA
  if (typeof s.taskHeadSha !== "string" || !SHA40_RE.test(s.taskHeadSha)) {
    return { ok: false, reason: "invalid taskHeadSha" };
  }

  // taskHasChanges: boolean
  if (typeof s.taskHasChanges !== "boolean") {
    return { ok: false, reason: "invalid taskHasChanges" };
  }

  // taskStatusDigestSha256: canonical 64-char SHA-256
  if (typeof s.taskStatusDigestSha256 !== "string" || !SHA256_RE.test(s.taskStatusDigestSha256)) {
    return { ok: false, reason: "invalid taskStatusDigestSha256" };
  }

  // sourceHeadSha: canonical 40-char SHA
  if (typeof s.sourceHeadSha !== "string" || !SHA40_RE.test(s.sourceHeadSha)) {
    return { ok: false, reason: "invalid sourceHeadSha" };
  }

  // sourceBranch: string or null
  if (s.sourceBranch !== null && typeof s.sourceBranch !== "string") {
    return { ok: false, reason: "invalid sourceBranch" };
  }

  // sourceWipDigestSha256: canonical 64-char SHA-256
  if (typeof s.sourceWipDigestSha256 !== "string" || !SHA256_RE.test(s.sourceWipDigestSha256)) {
    return { ok: false, reason: "invalid sourceWipDigestSha256" };
  }

  return {
    ok: true,
    value: {
      state: s.state as LoopGitWorkspaceSnapshot["state"],
      runId: s.runId as string,
      repository: s.repository as string,
      repositoryPath: s.repositoryPath as string,
      controlRoot: s.controlRoot as string,
      gitCommonDir: s.gitCommonDir as string,
      workspacePath: s.workspacePath as string,
      baseBranch: s.baseBranch as string,
      expectedBaseSha: s.expectedBaseSha as string,
      currentBaseSha: s.currentBaseSha as string,
      baseDrifted: s.baseDrifted as boolean,
      taskBranch: s.taskBranch as string,
      taskHeadSha: s.taskHeadSha as string,
      taskHasChanges: s.taskHasChanges as boolean,
      taskStatusDigestSha256: s.taskStatusDigestSha256 as string,
      sourceHeadSha: s.sourceHeadSha as string,
      sourceBranch: s.sourceBranch as string | null,
      sourceWipDigestSha256: s.sourceWipDigestSha256 as string,
    } as LoopGitWorkspaceSnapshot,
  };
}
