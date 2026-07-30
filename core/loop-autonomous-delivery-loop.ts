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
import type { LoopPosixProcessRunner, LoopPosixProcessResult, LoopPosixProcessRunnerError } from "./loop-posix-process-runner";
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

// ═══════════════════════════════════════ Helpers

function freeze<T extends object>(o: T): Readonly<T> {
  return Object.freeze(o);
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
  // No-progress tracking
  seenEvidencePatchPairs: Set<string>;
  lastEvidenceDigest: string | null;
  lastPatchDigest: string | null;
  lastRepairPreDigest: string | null;
  lastRepairPostDigest: string | null;
  lastFailedStepId: string | null;
  lastOutcomeCategory: string | null;
  lastExitCode: number | null;
  lastSignal: string | null;
  lastStdoutTruncated: boolean | null;
  lastStderrTruncated: boolean | null;
  lastSanitizedExcerptPair: string | null;
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
    seenEvidencePatchPairs: new Set(),
    lastEvidenceDigest: null,
    lastPatchDigest: null,
    lastRepairPreDigest: null,
    lastRepairPostDigest: null,
    lastFailedStepId: null,
    lastOutcomeCategory: null,
    lastExitCode: null,
    lastSignal: null,
    lastStdoutTruncated: null,
    lastStderrTruncated: null,
    lastSanitizedExcerptPair: null,
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

  private lastClockReading: number = 0;

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
      return this._terminal("failed", "INVALID_INPUT", "invalid request", []);
    }

    // Validate identity
    const identity = req.identity;
    if (identity === null || typeof identity !== "object" || Array.isArray(identity)) {
      return this._terminal("failed", "INVALID_INPUT", "invalid identity", []);
    }
    const id = identity as Record<string, unknown>;
    if (typeof id.runId !== "string" || id.runId.trim().length === 0 ||
        NON_CONTROL_RE.test(id.runId)) {
      return this._terminal("failed", "INVALID_INPUT", "invalid identity.runId", []);
    }
    if (typeof id.requirementId !== "string" || id.requirementId.trim().length === 0) {
      return this._terminal("failed", "INVALID_INPUT", "invalid identity.requirementId", []);
    }
    if (typeof id.repository !== "string" || id.repository.trim().length === 0) {
      return this._terminal("failed", "INVALID_INPUT", "invalid identity.repository", []);
    }
    if (typeof id.repositoryPath !== "string" || id.repositoryPath.trim().length === 0) {
      return this._terminal("failed", "INVALID_INPUT", "invalid identity.repositoryPath", []);
    }
    if (typeof id.taskBranch !== "string" || id.taskBranch.trim().length === 0) {
      return this._terminal("failed", "INVALID_INPUT", "invalid identity.taskBranch", []);
    }
    if (typeof id.controlRoot !== "string" || id.controlRoot.trim().length === 0) {
      return this._terminal("failed", "INVALID_INPUT", "invalid identity.controlRoot", []);
    }

    // Validate workspace
    let wsObj: Record<string, unknown>;
    try {
      wsObj = scanPlain(req.workspace, WORKSPACE_KEYS, "workspace");
    } catch {
      return this._terminal("failed", "INVALID_INPUT", "invalid workspace", []);
    }
    if (typeof wsObj.workspacePath !== "string" || wsObj.workspacePath.length === 0) {
      return this._terminal("failed", "INVALID_INPUT", "invalid workspacePath", []);
    }
    if (typeof wsObj.taskBranch !== "string" || wsObj.taskBranch.length === 0) {
      return this._terminal("failed", "INVALID_INPUT", "invalid taskBranch", []);
    }
    if (typeof wsObj.expectedTaskHeadSha !== "string" || !SHA40_RE.test(wsObj.expectedTaskHeadSha)) {
      return this._terminal("failed", "INVALID_INPUT", "invalid expectedTaskHeadSha", []);
    }
    if (typeof wsObj.expectedPreStatusDigestSha256 !== "string" || !SHA256_RE.test(wsObj.expectedPreStatusDigestSha256)) {
      return this._terminal("failed", "INVALID_INPUT", "invalid expectedPreStatusDigestSha256", []);
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
      return this._terminal("failed", "INVALID_INPUT", "invalid requirement", []);
    }

    // Validate designSummary (optional)
    let designSummary: string | undefined;
    if (req.designSummary !== undefined) {
      if (typeof req.designSummary !== "string") {
        return this._terminal("failed", "INVALID_INPUT", "invalid designSummary", []);
      }
      designSummary = req.designSummary as string;
    }

    // Validate implementationConstraints (optional)
    let implementationConstraints: readonly string[] | undefined;
    if (req.implementationConstraints !== undefined) {
      if (!Array.isArray(req.implementationConstraints)) {
        return this._terminal("failed", "INVALID_INPUT", "invalid implementationConstraints", []);
      }
      implementationConstraints = req.implementationConstraints as readonly string[];
    }

    // Validate allowedPaths
    if (!Array.isArray(req.allowedPaths) || req.allowedPaths.length === 0) {
      return this._terminal("failed", "INVALID_INPUT", "invalid allowedPaths", []);
    }
    const allowedPaths: readonly string[] = req.allowedPaths as readonly string[];

    // Validate testPlan
    if (!Array.isArray(req.testPlan) || req.testPlan.length === 0 || req.testPlan.length > MAX_PLAN_STEPS) {
      return this._terminal("failed", "INVALID_INPUT", "invalid testPlan", []);
    }
    const testPlan = req.testPlan as readonly LoopDeliveryCommandStep[];
    const testPlanValidation = validatePlan(testPlan, "testPlan");
    if (!testPlanValidation.ok) {
      return this._terminal("failed", "INVALID_INPUT", (testPlanValidation as { ok: false; reason: string }).reason, []);
    }

    // Validate reviewPlan
    if (!Array.isArray(req.reviewPlan) || req.reviewPlan.length === 0 || req.reviewPlan.length > MAX_PLAN_STEPS) {
      return this._terminal("failed", "INVALID_INPUT", "invalid reviewPlan", []);
    }
    const reviewPlan = req.reviewPlan as readonly LoopDeliveryCommandStep[];
    const reviewPlanValidation = validatePlan(reviewPlan, "reviewPlan");
    if (!reviewPlanValidation.ok) {
      return this._terminal("failed", "INVALID_INPUT", (reviewPlanValidation as { ok: false; reason: string }).reason, []);
    }

    // Check for duplicate step IDs across both plans
    const allStepIds = new Set<string>();
    for (const step of [...testPlan, ...reviewPlan]) {
      if (allStepIds.has(step.id)) {
        return this._terminal("failed", "INVALID_INPUT", "duplicate step ID", []);
      }
      allStepIds.add(step.id);
    }

    // Validate maxFixRounds
    let maxFixRounds = DEFAULT_MAX_FIX_ROUNDS;
    if (req.maxFixRounds !== undefined) {
      if (typeof req.maxFixRounds !== "number" || !Number.isSafeInteger(req.maxFixRounds) ||
          req.maxFixRounds < 0 || req.maxFixRounds > MAX_MAX_FIX_ROUNDS) {
        return this._terminal("failed", "INVALID_INPUT", "invalid maxFixRounds", []);
      }
      maxFixRounds = req.maxFixRounds;
    }

    // Validate maxTotalDurationMs
    let maxTotalDurationMs = DEFAULT_MAX_TOTAL_DURATION;
    if (req.maxTotalDurationMs !== undefined) {
      if (typeof req.maxTotalDurationMs !== "number" || !Number.isSafeInteger(req.maxTotalDurationMs) ||
          req.maxTotalDurationMs < MIN_MAX_TOTAL_DURATION || req.maxTotalDurationMs > MAX_MAX_TOTAL_DURATION) {
        return this._terminal("failed", "INVALID_INPUT", "invalid maxTotalDurationMs", []);
      }
      maxTotalDurationMs = req.maxTotalDurationMs;
    }

    // ═══════════════════════════════════════ Initialize

    const startMs = this._readClock();
    const state = createState(maxFixRounds, maxTotalDurationMs, startMs);

    // Check deadline at start
    if (this._isDeadlineExceeded(state)) {
      return this._terminal("failed", "TOTAL_TIMEOUT", "deadline exceeded before start", state.trace);
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
          // Non-repairable test failure
          return this._terminal("failed", failure.reasonCode as LoopAutonomousDeliveryReasonCode,
            failure.reasonMessage, state.trace, failure.causeCode);
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
        const noProgressCheck = this._checkNoProgress(state, evidenceResult.evidenceDigest, null, null);
        if (noProgressCheck) {
          return this._terminal("failed", "NO_PROGRESS", noProgressCheck, state.trace);
        }

        // Check fix budget
        if (state.totalFixRounds >= state.maxFixRounds) {
          return this._terminal("failed", "FIX_BUDGET_EXHAUSTED", "fix budget exhausted", state.trace);
        }

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
          state, repairSuccess.result, evidenceResult.evidenceDigest,
        );
        if (postRepairNoProgress) {
          return this._terminal("failed", "NO_PROGRESS", postRepairNoProgress, state.trace);
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
          return this._terminal("failed", failure.reasonCode as LoopAutonomousDeliveryReasonCode,
            failure.reasonMessage, state.trace, failure.causeCode);
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
        const noProgressCheck2 = this._checkNoProgress(state, evidenceResult2.evidenceDigest, null, null);
        if (noProgressCheck2) {
          return this._terminal("failed", "NO_PROGRESS", noProgressCheck2, state.trace);
        }

        // Check fix budget
        if (state.totalFixRounds >= state.maxFixRounds) {
          return this._terminal("failed", "FIX_BUDGET_EXHAUSTED", "fix budget exhausted", state.trace);
        }

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
          state, reviewRepairSuccess.result, evidenceResult2.evidenceDigest,
        );
        if (postRepairNoProgress2) {
          return this._terminal("failed", "NO_PROGRESS", postRepairNoProgress2, state.trace);
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
        snapshot = await this.workspaceManager.inspect(identity);
      } catch {
        return {
          blocked: true,
          blockedResult: this._terminal("blocked", "WORKSPACE_DRIFT",
            "workspace inspect failed", state.trace),
        };
      }

      // Verify workspace binding
      if (snapshot.workspacePath !== workspace.workspacePath ||
          snapshot.taskBranch !== workspace.taskBranch ||
          snapshot.runId !== identity.runId ||
          snapshot.repository !== identity.repository ||
          snapshot.repositoryPath !== identity.repositoryPath) {
        return {
          blocked: true,
          blockedResult: this._terminal("blocked", "WORKSPACE_DRIFT",
            "workspace identity mismatch before step", state.trace),
        };
      }

      const preHeadSha = snapshot.taskHeadSha;
      const preStatusDigest = snapshot.taskStatusDigestSha256;

      // Compute effective timeout
      const remaining = Math.max(0, state.deadlineMs - this._readClock());
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
      try {
        runnerResult = await this.runner.run({
          executableId: step.executableId,
          args: step.args ? freeze([...step.args]) : undefined,
          cwd: workspace.workspacePath,
          timeoutMs: effectiveTimeout,
          maxStdoutBytes: step.maxStdoutBytes ?? this.defaultMaxStdoutBytes,
          maxStderrBytes: step.maxStderrBytes ?? this.defaultMaxStderrBytes,
        });
      } catch (e) {
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
          causeCode: (resultValidation as { ok: false; reason: string }).reason,
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

      // Inspect workspace after step
      let postSnapshot: LoopGitWorkspaceSnapshot;
      try {
        postSnapshot = await this.workspaceManager.inspect(identity);
      } catch {
        return {
          blocked: true,
          blockedResult: this._terminal("blocked", "WORKSPACE_DRIFT",
            "workspace inspect failed after step", state.trace),
        };
      }

      const postHeadSha = postSnapshot.taskHeadSha;
      const postStatusDigest = postSnapshot.taskStatusDigestSha256;

      // Check for HEAD change (workspace drift)
      if (postHeadSha !== preHeadSha) {
        return {
          blocked: true,
          blockedResult: this._terminal("blocked", "WORKSPACE_DRIFT",
            "task HEAD changed during step", state.trace),
        };
      }

      // Check step pass criteria
      const stepPassed = runnerResult.status === "exited" &&
        runnerResult.exitCode === 0 &&
        runnerResult.signal === null &&
        runnerResult.stdoutTruncated === false &&
        runnerResult.stderrTruncated === false &&
        postStatusDigest === preStatusDigest;

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
      } else if (postStatusDigest !== preStatusDigest) {
        // Workspace mutated — not repairable
        outcomeCategory = isTest ? "TEST_WORKSPACE_MUTATED" : "REVIEW_WORKSPACE_MUTATED";
        reasonCode = isTest ? "TEST_WORKSPACE_MUTATED" : "REVIEW_WORKSPACE_MUTATED";
        repairable = false;
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
        result: this._terminal("failed", "TOTAL_TIMEOUT", "deadline exceeded before D05", state.trace),
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
        result: this._terminal("failed", "DEPENDENCY_RESULT_INVALID",
          "implementation adapter threw", state.trace),
      };
    }

    // Validate D05 result
    const d05Validation = validateD05Result(d05Result);
    if (!d05Validation.ok) {
      return {
        status: "failed",
        result: this._terminal("failed", "DEPENDENCY_RESULT_INVALID",
          (d05Validation as { ok: false; reason: string }).reason, state.trace),
      };
    }

    // Check deadline after D05
    if (this._isDeadlineExceeded(state)) {
      return {
        status: "failed",
        result: this._terminal("failed", "TOTAL_TIMEOUT", "deadline exceeded after D05", state.trace),
      };
    }

    if (d05Result.status === "failed") {
      const failure = d05Result as LoopCodexImplementationFailure;

      // Classify D05 failure
      if (failure.errorCode === "WORKSPACE_DRIFT" ||
          failure.errorCode === "CODEX_SPAWN_FAILED" ||
          (failure.errorCode === "PATCH_APPLICATION_FAILED" && failure.causeCode === "WORKSPACE_DRIFT")) {
        return {
          status: "blocked",
          result: this._terminal("blocked", "WORKSPACE_DRIFT",
            failure.safeMessage, state.trace, failure.errorCode),
        };
      }

      return {
        status: "failed",
        result: this._terminal("failed", "IMPLEMENTATION_FAILED",
          failure.safeMessage, state.trace, failure.errorCode),
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
        result: this._terminal("failed", "INTERNAL_ERROR",
          `evidence build failed: ${(evidenceBuildResult as LoopDeliveryEvidenceFailure).reason}`, state.trace),
      };
    }

    // Store in D01
    let stored: LoopStoredArtifact;
    try {
      stored = this.artifactStore.put(
        phaseName === "test" ? "test_summary" : "review_summary",
        evidenceBuildResult.bytes,
      );
    } catch {
      return {
        ok: false,
        result: this._terminal("failed", "ARTIFACT_STORE_FAILED",
          "failed to store evidence", state.trace),
      };
    }

    if (stored.digest !== evidenceBuildResult.digestSha256) {
      return {
        ok: false,
        result: this._terminal("failed", "ARTIFACT_STORE_FAILED",
          "evidence digest mismatch", state.trace),
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
      finalSnapshot = await this.workspaceManager.inspect(identity);
    } catch {
      return this._terminal("failed", "WORKSPACE_DRIFT",
        "final workspace inspect failed", state.trace);
    }

    if (finalSnapshot.workspacePath !== workspace.workspacePath ||
        finalSnapshot.taskBranch !== workspace.taskBranch) {
      return this._terminal("failed", "WORKSPACE_DRIFT",
        "final workspace identity mismatch", state.trace);
    }

    // Verify success preconditions
    if (!finalSnapshot.taskHasChanges) {
      return this._terminal("failed", "INTERNAL_ERROR",
        "no changes in workspace", state.trace);
    }

    const filesArray = [...state.files].sort();
    if (filesArray.length === 0) {
      return this._terminal("failed", "INTERNAL_ERROR",
        "no files accumulated", state.trace);
    }

    // All files must belong to allowedPaths
    for (const f of filesArray) {
      if (!allowedPaths.some((ap) => f === ap || f.startsWith(ap + "/") || f.startsWith(ap))) {
        return this._terminal("failed", "INTERNAL_ERROR",
          `file ${f} not in allowed paths`, state.trace);
      }
    }

    const finalWorkspace: LoopDeliveryResultWorkspace = {
      workspacePath: finalSnapshot.workspacePath,
      taskBranch: finalSnapshot.taskBranch,
      taskHeadSha: finalSnapshot.taskHeadSha,
      statusDigestSha256: finalSnapshot.taskStatusDigestSha256,
      taskHasChanges: finalSnapshot.taskHasChanges,
    };

    const elapsedMs = this._readClock() - state.startMs;

    this._addTrace(state, "terminal", "initial", state.totalFixRounds, 0, null,
      "succeeded", null, null, null, finalSnapshot.taskStatusDigestSha256);

    const result = this._buildResult(
      "succeeded",
      "DELIVERY_SUCCEEDED",
      "delivery completed successfully",
      undefined,
      state,
      freeze(filesArray),
      freeze(finalWorkspace),
      elapsedMs,
    );

    // Persist delivery_result
    const deliveryResultArtifact = await this._persistDeliveryResult(result);
    const finalResult = {
      ...result,
      deliveryResultArtifactRef: deliveryResultArtifact,
    } as LoopAutonomousDeliveryResult;

    return freeze(finalResult) as unknown as LoopAutonomousDeliveryResult;
  }

  // ═══════════════════════════════════════ Private: Helpers

  private _readClock(): number {
    const now = this.clock.nowMs();
    if (typeof now !== "number" || !Number.isFinite(now) || !Number.isSafeInteger(now) || now < 0) {
      throw new Error("invalid clock reading");
    }
    if (now < this.lastClockReading) {
      throw new Error("clock went backwards");
    }
    this.lastClockReading = now;
    return now;
  }

  private _isDeadlineExceeded(state: InternalState): boolean {
    try {
      return this._readClock() >= state.deadlineMs;
    } catch {
      return true; // fail-closed on clock error
    }
  }

  private _checkDeadlineBeforeStep(state: InternalState): boolean {
    return this._isDeadlineExceeded(state);
  }

  private async _bindWorkspace(
    identity: LoopRunIdentity,
    workspace: LoopCodexImplementationWorkspace,
    state: InternalState,
  ): Promise<{ ok: true } | { ok: false; result: LoopAutonomousDeliveryResult }> {
    if (this._isDeadlineExceeded(state)) {
      return {
        ok: false,
        result: this._terminal("failed", "TOTAL_TIMEOUT", "deadline exceeded before bind", state.trace),
      };
    }

    let snapshot: LoopGitWorkspaceSnapshot;
    try {
      snapshot = await this.workspaceManager.inspect(identity);
    } catch {
      return {
        ok: false,
        result: this._terminal("blocked", "WORKSPACE_DRIFT", "workspace inspect failed", state.trace),
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
        result: this._terminal("blocked", "WORKSPACE_DRIFT", "workspace binding mismatch", state.trace),
      };
    }

    state.currentWorkspacePath = snapshot.workspacePath;
    state.currentTaskBranch = snapshot.taskBranch;
    state.currentTaskHeadSha = snapshot.taskHeadSha;
    state.currentStatusDigestSha256 = snapshot.taskStatusDigestSha256;

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
        result: this._terminal("failed", "TOTAL_TIMEOUT", "deadline exceeded post-D05", state.trace),
      };
    }

    let snapshot: LoopGitWorkspaceSnapshot;
    try {
      snapshot = await this.workspaceManager.inspect(identity);
    } catch {
      return {
        ok: false,
        result: this._terminal("blocked", "WORKSPACE_DRIFT",
          "workspace inspect failed after D05", state.trace),
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
        result: this._terminal("blocked", "WORKSPACE_DRIFT",
          "workspace binding mismatch after D05", state.trace),
      };
    }

    state.currentWorkspacePath = snapshot.workspacePath;
    state.currentTaskBranch = snapshot.taskBranch;
    state.currentTaskHeadSha = snapshot.taskHeadSha;
    state.currentStatusDigestSha256 = snapshot.taskStatusDigestSha256;

    return { ok: true };
  }

  private _classifyRunnerError(
    error: unknown,
    stepId: string,
    phase: string,
    state: InternalState,
  ): {
    blocked?: boolean;
    blockedResult?: LoopAutonomousDeliveryResult;
    failed?: boolean;
    failure?: PlanStepFailure;
  } {
    // Check if it's a LoopPosixProcessRunnerError
    const err = error as Record<string, unknown> | null | undefined;
    if (err && typeof err === "object" && !Array.isArray(err) &&
        typeof err.code === "string" && typeof err.name === "string" &&
        err.name === "LoopPosixProcessRunnerError") {
      const code = err.code as string;

      // Blocked codes
      const blockedCodes = [
        "UNSUPPORTED_PLATFORM", "EXECUTABLE_NOT_ALLOWED", "EXECUTABLE_INVALID",
        "EXECUTABLE_CHANGED", "CWD_NOT_ALLOWED", "CWD_INVALID",
        "ENV_NOT_ALLOWED", "PROCESS_SPAWN_FAILED",
      ];

      if (blockedCodes.includes(code)) {
        return {
          blocked: true,
          blockedResult: this._terminal("blocked", "EXECUTION_BLOCKED",
            `runner blocked: ${code}`, state.trace, code),
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
            reasonMessage: `runner failed: ${code}`,
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
    }

    // Unknown error
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

  private _checkNoProgress(
    state: InternalState,
    evidenceDigest: string,
    patchDigest: string | null,
    postStatusDigest: string | null,
  ): string | null {
    // Check evidence/patch pair
    if (patchDigest) {
      const pair = `${evidenceDigest}:${patchDigest}`;
      if (state.seenEvidencePatchPairs.has(pair)) {
        return "duplicate evidence/patch pair";
      }
      state.seenEvidencePatchPairs.add(pair);
    }

    // Update tracking
    state.lastEvidenceDigest = evidenceDigest;

    return null;
  }

  private _checkNoProgressPostRepair(
    state: InternalState,
    d05Result: LoopCodexImplementationSuccess,
    evidenceDigest: string,
  ): string | null {
    // Check already_applied with same digest
    if (d05Result.applicationState === "already_applied" &&
        d05Result.preStatusDigestSha256 === d05Result.postStatusDigestSha256) {
      return "already_applied with unchanged digest";
    }

    // Check repair produced same status digest
    if (state.lastRepairPreDigest !== null &&
        state.lastRepairPreDigest === d05Result.postStatusDigestSha256) {
      return "status digest unchanged after repair";
    }

    // Check empty files
    if (d05Result.files.length === 0) {
      return "repair produced no files";
    }

    // Check evidence/patch pair
    const pair = `${evidenceDigest}:${d05Result.patchDigestSha256}`;
    if (state.seenEvidencePatchPairs.has(pair)) {
      return "duplicate evidence/patch pair after repair";
    }
    state.seenEvidencePatchPairs.add(pair);

    return null;
  }

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
    workspaceStatusDigestSha256: string | null,
  ): void {
    const elapsedMs = Math.max(0, this._readClock() - state.startMs);
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
      workspaceStatusDigestSha256,
      elapsedMs,
    }));
  }

  private _terminal(
    status: LoopAutonomousDeliveryStatus,
    reasonCode: LoopAutonomousDeliveryReasonCode,
    message: string,
    trace: LoopDeliveryTraceEntry[],
    causeCode?: string,
  ): LoopAutonomousDeliveryResult {
    const elapsedMs = 0; // Will be recomputed
    // We need to compute elapsed based on state
    const result = this._buildResult(
      status, reasonCode, message, causeCode,
      null as unknown as InternalState,
      freeze([]),
      undefined,
      elapsedMs,
    );
    // Override trace with what we have
    const mutableResult = { ...result } as Record<string, unknown>;
    mutableResult.trace = freeze([...trace]);
    return freeze(mutableResult) as unknown as LoopAutonomousDeliveryResult;
  }

  private _buildResult(
    status: LoopAutonomousDeliveryStatus,
    reasonCode: LoopAutonomousDeliveryReasonCode,
    message: string,
    causeCode: string | undefined,
    state: InternalState | null,
    files: readonly string[],
    finalWorkspace: LoopDeliveryResultWorkspace | undefined,
    elapsedMs: number,
  ): LoopAutonomousDeliveryResult {
    const base: Record<string, unknown> = {
      status,
      reasonCode,
      safeMessage: safeMessage(message),
      totalFixRounds: state?.totalFixRounds ?? 0,
      testAttempts: state?.testAttempts ?? 0,
      reviewAttempts: state?.reviewAttempts ?? 0,
      patchArtifactRefs: freeze([...(state?.patchArtifactRefs ?? [])]) as readonly string[],
      testSummaryArtifactRefs: freeze([...(state?.testSummaryArtifactRefs ?? [])]) as readonly string[],
      reviewSummaryArtifactRefs: freeze([...(state?.reviewSummaryArtifactRefs ?? [])]) as readonly string[],
      files: files,
      elapsedMs,
      trace: freeze([...(state?.trace ?? [])]) as readonly LoopDeliveryTraceEntry[],
    };

    if (causeCode !== undefined) {
      base.causeCode = causeCode;
    }
    if (finalWorkspace !== undefined) {
      base.finalWorkspace = finalWorkspace;
    }

    return freeze(base) as unknown as LoopAutonomousDeliveryResult;
  }

  private async _persistDeliveryResult(
    result: LoopAutonomousDeliveryResult,
  ): Promise<string | undefined> {
    const deliveryObj: Record<string, unknown> = Object.create(null);
    deliveryObj.schema = "loop-delivery-result-v1";
    deliveryObj.status = result.status;
    deliveryObj.reason_code = result.reasonCode;
    if (result.causeCode !== undefined) {
      deliveryObj.cause_code = result.causeCode;
    }
    deliveryObj.total_fix_rounds = result.totalFixRounds;
    deliveryObj.test_attempts = result.testAttempts;
    deliveryObj.review_attempts = result.reviewAttempts;
    deliveryObj.patch_artifact_refs = [...result.patchArtifactRefs];
    deliveryObj.test_summary_artifact_refs = [...result.testSummaryArtifactRefs];
    deliveryObj.review_summary_artifact_refs = [...result.reviewSummaryArtifactRefs];
    deliveryObj.files = [...result.files];
    if (result.finalWorkspace) {
      deliveryObj.final_workspace = {
        workspace_path: result.finalWorkspace.workspacePath,
        task_branch: result.finalWorkspace.taskBranch,
        task_head_sha: result.finalWorkspace.taskHeadSha,
        status_digest_sha256: result.finalWorkspace.statusDigestSha256,
        task_has_changes: result.finalWorkspace.taskHasChanges,
      };
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

    const json = JSON.stringify(deliveryObj) + "\n";
    const encoder = new TextEncoder();
    const bytes = encoder.encode(json);

    if (bytes.length > this.maxDeliveryResultBytes) {
      return undefined; // Too large to persist
    }

    try {
      const stored = this.artifactStore.put("delivery_result", bytes);
      return stored.artifactRef;
    } catch {
      return undefined;
    }
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

    // Validate step is a plain object
    if (step === null || typeof step !== "object" || Array.isArray(step)) {
      return { ok: false, reason: `${label}[${i}] not a plain object` };
    }

    // Validate id
    if (typeof step.id !== "string" || !validateStepId(step.id)) {
      return { ok: false, reason: `${label}[${i}].id invalid` };
    }
    if (stepIds.has(step.id)) {
      return { ok: false, reason: `${label}[${i}].id duplicate` };
    }
    stepIds.add(step.id);

    // Validate executableId
    if (typeof step.executableId !== "string" || step.executableId.trim().length === 0 ||
        NON_CONTROL_RE.test(step.executableId)) {
      return { ok: false, reason: `${label}[${i}].executableId invalid` };
    }

    // Validate args
    if (step.args !== undefined) {
      if (!Array.isArray(step.args)) {
        return { ok: false, reason: `${label}[${i}].args not an array` };
      }
      if (step.args.length > MAX_STEP_ARGS) {
        return { ok: false, reason: `${label}[${i}].args too many` };
      }
      let totalBytes = 0;
      for (let j = 0; j < step.args.length; j++) {
        const arg = step.args[j]!;
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
    if (step.timeoutMs !== undefined) {
      if (typeof step.timeoutMs !== "number" || !Number.isSafeInteger(step.timeoutMs) ||
          step.timeoutMs < 100 || step.timeoutMs > 600000) {
        return { ok: false, reason: `${label}[${i}].timeoutMs out of range` };
      }
    }

    // Validate maxStdoutBytes
    if (step.maxStdoutBytes !== undefined) {
      if (typeof step.maxStdoutBytes !== "number" || !Number.isSafeInteger(step.maxStdoutBytes) ||
          step.maxStdoutBytes < 1 || step.maxStdoutBytes > 16777216) {
        return { ok: false, reason: `${label}[${i}].maxStdoutBytes out of range` };
      }
    }

    // Validate maxStderrBytes
    if (step.maxStderrBytes !== undefined) {
      if (typeof step.maxStderrBytes !== "number" || !Number.isSafeInteger(step.maxStderrBytes) ||
          step.maxStderrBytes < 1 || step.maxStderrBytes > 16777216) {
        return { ok: false, reason: `${label}[${i}].maxStderrBytes out of range` };
      }
    }
  }

  return { ok: true };
}

function validateRunnerResult(
  result: unknown,
): { ok: true } | { ok: false; reason: string } {
  if (result === null || typeof result !== "object" || Array.isArray(result)) {
    return { ok: false, reason: "result not a plain object" };
  }
  const r = result as Record<string, unknown>;

  if (r.status !== "exited" && r.status !== "timed_out") {
    return { ok: false, reason: "invalid status" };
  }

  if (r.exitCode !== null && r.exitCode !== undefined &&
      (typeof r.exitCode !== "number" || !Number.isSafeInteger(r.exitCode))) {
    return { ok: false, reason: "invalid exitCode" };
  }

  if (r.signal !== null && r.signal !== undefined && typeof r.signal !== "string") {
    return { ok: false, reason: "invalid signal" };
  }

  if (typeof r.stdout !== "string" || typeof r.stderr !== "string") {
    return { ok: false, reason: "stdout/stderr not string" };
  }

  if (typeof r.stdoutTruncated !== "boolean" || typeof r.stderrTruncated !== "boolean") {
    return { ok: false, reason: "truncated flags not boolean" };
  }

  return { ok: true };
}

function validateD05Result(
  result: unknown,
): { ok: true } | { ok: false; reason: string } {
  if (result === null || typeof result !== "object" || Array.isArray(result)) {
    return { ok: false, reason: "D05 result not a plain object" };
  }
  const r = result as Record<string, unknown>;

  if (r.status !== "succeeded" && r.status !== "failed") {
    return { ok: false, reason: "D05 invalid status" };
  }

  if (r.status === "succeeded") {
    if (typeof r.patchArtifactRef !== "string" ||
        typeof r.patchDigestSha256 !== "string" || !SHA256_RE.test(r.patchDigestSha256 as string) ||
        typeof r.patchSizeBytes !== "number" ||
        typeof r.applicationState !== "string" ||
        !Array.isArray(r.files) ||
        typeof r.postTaskHeadSha !== "string" ||
        typeof r.postStatusDigestSha256 !== "string") {
      return { ok: false, reason: "D05 success missing required fields" };
    }
    // Verify files are strings
    const filesArr = r.files as unknown[];
    for (const f of filesArr) {
      if (typeof f !== "string") {
        return { ok: false, reason: "D05 files entry not string" };
      }
    }
  }

  if (r.status === "failed") {
    if (typeof r.errorCode !== "string") {
      return { ok: false, reason: "D05 failure missing errorCode" };
    }
  }

  return { ok: true };
}
