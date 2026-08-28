// [FROZEN: PATH A RETIREMENT (C03-E W4 / Decision-073)]
// Legacy Path-A module (first-generation sdlc-* D0x runtime / Agent direct-drive).
// FROZEN: do not evolve; new Path-B assembly must not import it (enforced by
// scripts/validate-skill-contracts.rb section B-7). Physical deletion is a
// separate decision after the Path-B periphery is complete and the E5 real
// canary passes. See docs/reports/c03-e-w4-spawn-reference-graph.md

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
import * as os from "node:os";
import type { LoopRunIdentity } from "./loop-executor-types";
import {
  LoopPosixProcessRunnerError,
  type LoopPosixProcessRunner,
  type LoopPosixProcessResult,
  type LoopPosixProcessRunnerErrorCode,
} from "./loop-posix-process-runner";
import type { LoopGitWorkspaceManager, LoopGitWorkspaceSnapshot } from "./loop-git-workspace";
import type { LoopArtifactStore, LoopStoredArtifact } from "./loop-artifact-store";
import type {
  LoopCodexImplementationAdapter,
  LoopCodexImplementationRequest,
  LoopCodexImplementationResult,
  LoopCodexImplementationSuccess,
  LoopCodexImplementationFailure,
  LoopCodexImplementationWorkspace,
  LoopCodexImplementationErrorCode,
} from "./loop-codex-implementation-adapter";
import type { LoopPatchApplicationErrorCode } from "./loop-patch-application";
import { validateLoopRunIdentity } from "./loop-run-state";
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

// Canonical D02 runner error codes (from LoopPosixProcessRunnerErrorCode)
const D02_CANONICAL_CODES = new Set<string>([
  "INVALID_INPUT",
  "UNSUPPORTED_PLATFORM",
  "EXECUTABLE_NOT_ALLOWED",
  "EXECUTABLE_INVALID",
  "EXECUTABLE_CHANGED",
  "CWD_NOT_ALLOWED",
  "CWD_INVALID",
  "ENV_NOT_ALLOWED",
  "PROCESS_SPAWN_FAILED",
  "PROCESS_IO_FAILED",
  "PROCESS_CLEANUP_FAILED",
]);

// D02 blocked codes → blocked / EXECUTION_BLOCKED
const D02_BLOCKED_CODES = new Set<string>([
  "UNSUPPORTED_PLATFORM",
  "EXECUTABLE_NOT_ALLOWED",
  "EXECUTABLE_INVALID",
  "EXECUTABLE_CHANGED",
  "CWD_NOT_ALLOWED",
  "CWD_INVALID",
  "ENV_NOT_ALLOWED",
  "PROCESS_SPAWN_FAILED",
]);

// D02 failed codes → failed / INTERNAL_ERROR
const D02_FAILED_CODES = new Set<string>([
  "INVALID_INPUT",
  "PROCESS_IO_FAILED",
  "PROCESS_CLEANUP_FAILED",
]);

// Canonical D05 error codes (from LoopCodexImplementationErrorCode)
const D05_CANONICAL_ERROR_CODES = new Set<string>([
  "INVALID_INPUT",
  "WORKSPACE_DRIFT",
  "REPAIR_EVIDENCE_REQUIRED",
  "REPAIR_EVIDENCE_INVALID",
  "PROMPT_TOO_LARGE",
  "CODEX_SPAWN_FAILED",
  "CODEX_TIMED_OUT",
  "CODEX_NON_ZERO_EXIT",
  "CODEX_OUTPUT_TOO_LARGE",
  "CODEX_OUTPUT_INVALID",
  "ARTIFACT_STORE_FAILED",
  "PATCH_APPLICATION_FAILED",
  "INTERNAL_ERROR",
]);

// Canonical platform signals (from os.constants.signals)
const PLATFORM_SIGNALS: Set<string> = (() => {
  const sigs = new Set<string>();
  try {
    const signals = (os.constants as Record<string, unknown>).signals;
    if (signals && typeof signals === "object") {
      // Collect keys (signal names like SIGTERM, SIGKILL, etc.)
      for (const k of Object.keys(signals as Record<string, unknown>)) {
        if (typeof k === "string" && k.startsWith("SIG") && k.length >= 4 && k.length <= 15) {
          sigs.add(k);
        }
      }
    }
  } catch {
    // Fallback: common POSIX signals
    const fallback = ["SIGABRT","SIGALRM","SIGBUS","SIGCHLD","SIGCONT","SIGFPE","SIGHUP","SIGILL","SIGINT","SIGKILL","SIGPIPE","SIGQUIT","SIGSEGV","SIGSTOP","SIGTERM","SIGTRAP","SIGTSTP","SIGTTIN","SIGTTOU","SIGUSR1","SIGUSR2","SIGSYS","SIGURG","SIGVTALRM","SIGXCPU","SIGXFSZ","SIGWINCH","SIGINFO"];
    for (const s of fallback) sigs.add(s);
  }
  return sigs;
})();
const D04_CANONICAL_CAUSE_CODES = new Set<string>([
  "INVALID_INPUT",
  "PATCH_TOO_LARGE",
  "PATCH_INVALID_ENCODING",
  "PATCH_DIGEST_MISMATCH",
  "PATCH_MALFORMED",
  "PATCH_PATH_NOT_ALLOWED",
  "PATCH_UNSAFE_PATH",
  "PATCH_UNSUPPORTED_CHANGE",
  "PATCH_BINARY",
  "PATCH_SYMLINK",
  "PATCH_NOT_APPLICABLE",
  "PATCH_APPLY_FAILED",
  "PATCH_RECONCILIATION_FAILED",
  "WORKSPACE_DRIFT",
  "GIT_COMMAND_FAILED",
  "WORKSPACE_IO_FAILED",
]);

// Public causeCode allowlist = D02 ∪ D05 ∪ D04
const PUBLIC_CAUSE_CODE_ALLOWLIST = new Set<string>([
  ...D02_CANONICAL_CODES,
  ...D05_CANONICAL_ERROR_CODES,
  ...D04_CANONICAL_CAUSE_CODES,
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
  if (!PUBLIC_CAUSE_CODE_ALLOWLIST.has(trimmed)) return undefined;
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

// ═══════════════════════════════════════ Clock Types

type ClockReadResult =
  | { ok: true; nowMs: number }
  | { ok: false };

type DeadlineCheck =
  | { status: "active"; nowMs: number; remainingMs: number }
  | { status: "expired"; nowMs: number }
  | { status: "clock_error" };

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

    // Validate identity via descriptor-based scan + validateLoopRunIdentity
    const IDENTITY_KEYS = [
      "runId", "requirementId", "repository", "repositoryPath",
      "baseBranch", "expectedBaseSha", "taskBranch", "controlRoot", "createdAt",
    ];
    const identity = req.identity;
    let scannedIdentity: Record<string, unknown>;
    try {
      scannedIdentity = scanPlain(identity, IDENTITY_KEYS, "identity");
    } catch (e) {
      return this._validationFailure("failed", "INVALID_INPUT", `invalid identity: ${(e as Error).message}`);
    }
    // Run validateLoopRunIdentity which does full validation (types, format, SHA format, ISO timestamp, path checks)
    try {
      validateLoopRunIdentity(scannedIdentity);
    } catch {
      return this._validationFailure("failed", "INVALID_INPUT", "invalid identity");
    }
    const id = scannedIdentity;

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
      // Per-item string validation
      for (let i = 0; i < req.implementationConstraints.length; i++) {
        if (typeof req.implementationConstraints[i] !== "string") {
          return this._validationFailure("failed", "INVALID_INPUT", `implementationConstraints[${i}] not a string`);
        }
      }
      implementationConstraints = freeze([...req.implementationConstraints as string[]]) as unknown as readonly string[];
    }

    // Validate allowedPaths
    if (!Array.isArray(req.allowedPaths) || req.allowedPaths.length === 0) {
      return this._validationFailure("failed", "INVALID_INPUT", "invalid allowedPaths");
    }
    // Per-item string validation (must be non-empty strings)
    for (let i = 0; i < req.allowedPaths.length; i++) {
      const p = req.allowedPaths[i];
      if (typeof p !== "string" || p.length === 0) {
        return this._validationFailure("failed", "INVALID_INPUT", `allowedPaths[${i}] not a non-empty string`);
      }
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
    const validatedTestPlan = testPlanValidation.plan;

    // Validate reviewPlan
    if (!Array.isArray(req.reviewPlan) || req.reviewPlan.length === 0 || req.reviewPlan.length > MAX_PLAN_STEPS) {
      return this._validationFailure("failed", "INVALID_INPUT", "invalid reviewPlan");
    }
    const reviewPlan = req.reviewPlan as readonly LoopDeliveryCommandStep[];
    const reviewPlanValidation = validatePlan(reviewPlan, "reviewPlan");
    if (!reviewPlanValidation.ok) {
      return this._validationFailure("failed", "INVALID_INPUT", (reviewPlanValidation as { ok: false; reason: string }).reason);
    }
    const validatedReviewPlan = reviewPlanValidation.plan;

    // Check for duplicate step IDs across both plans
    const allStepIds = new Set<string>();
    for (const step of [...validatedTestPlan, ...validatedReviewPlan]) {
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
    const clockResult = this._readClock(null);
    if (!clockResult.ok) {
      return this._validationFailure("failed", "INTERNAL_ERROR", "initial clock read failed");
    }
    const startMs = clockResult.nowMs;
    const state = createState(maxFixRounds, maxTotalDurationMs, startMs);

    // Check deadline at start (tri-state gate)
    const startDeadlineCheck = this._checkDeadline(state);
    if (startDeadlineCheck.status === "clock_error") {
      return this._finalizeTerminal(state, "failed", "INTERNAL_ERROR", "clock error before start");
    }
    if (startDeadlineCheck.status === "expired") {
      return this._finalizeTerminal(state, "failed", "TOTAL_TIMEOUT", "deadline exceeded before start");
    }

    // ═══════════════════════════════════════ Input Snapshot (before first await)
    // Deep-copy and freeze all inputs so mutations to the original request
    // after execute() returns a Promise cannot affect D05/D02 calls.

    const frozenIdentity = deepFreeze({ ...id }) as unknown as LoopRunIdentity;
    const frozenWorkspace = deepFreeze({
      workspacePath: wsObj.workspacePath as string,
      taskBranch: wsObj.taskBranch as string,
      expectedTaskHeadSha: wsObj.expectedTaskHeadSha as string,
      expectedPreStatusDigestSha256: wsObj.expectedPreStatusDigestSha256 as string,
    }) as LoopCodexImplementationWorkspace;

    const frozenRequirement = String(requirement);
    const frozenDesignSummary = designSummary !== undefined ? String(designSummary) : undefined;
    const frozenConstraints: readonly string[] | undefined = implementationConstraints
      ? deepFreeze([...implementationConstraints]) as unknown as readonly string[]
      : undefined;
    const frozenAllowedPaths = deepFreeze([...allowedPaths]) as unknown as readonly string[];

    // Use validated plans directly — they are already frozen, validated, and defensively copied
    const frozenTestPlan = validatedTestPlan;
    const frozenReviewPlan = validatedReviewPlan;

    // ═══════════════════════════════════════ Workspace Binding (initial)
    const initBindResult = await this._bindWorkspace(
      frozenIdentity, frozenWorkspace, state,
    );
    if (!initBindResult.ok) return (initBindResult as { ok: false; result: LoopAutonomousDeliveryResult }).result;

    // ═══════════════════════════════════════ D05 Initial Implementation
    const initialResult = await this._executeImplementation(
      frozenIdentity,
      frozenWorkspace,
      "initial",
      0,
      frozenRequirement,
      frozenDesignSummary,
      frozenConstraints,
      frozenAllowedPaths,
      undefined,
      state,
    );

    if (initialResult.status === "blocked" || initialResult.status === "failed") {
      return (initialResult as unknown as { result: LoopAutonomousDeliveryResult }).result;
    }

    const initialSuccess = initialResult as { status: "continue"; result: LoopCodexImplementationSuccess };

    // Record candidate patchArtifactRef (durable artifact fact, verified format)
    state.patchArtifactRefs.push(initialSuccess.result.patchArtifactRef);

    // ── R4: D03 reconciliation FIRST ──
    // Candidate postTaskHeadSha / postStatusDigestSha256 MUST NOT enter
    // current verified binding before D03 inspect confirms workspace state.
    const postInitBindResult = await this._bindAndVerifyPostD05(
      frozenIdentity, frozenWorkspace, state,
      initialSuccess.result.postTaskHeadSha,
      initialSuccess.result.postStatusDigestSha256,
    );
    if (!postInitBindResult.ok) return (postInitBindResult as { ok: false; result: LoopAutonomousDeliveryResult }).result;

    // Only after verified D03 reconciliation: add files, write success trace
    for (const f of initialSuccess.result.files) {
      state.files.add(f);
    }
    this._addTrace(state, "implementation_initial", "initial", 0, 0, null,
      "succeeded", null,
      initialSuccess.result.patchArtifactRef,
      initialSuccess.result.patchDigestSha256,
      initialSuccess.result.postStatusDigestSha256,
    );

    // ═══════════════════════════════════════ Main Loop
    const mainResult = await this._mainLoop(
      frozenIdentity,
      frozenWorkspace,
      frozenRequirement,
      frozenDesignSummary,
      frozenConstraints,
      frozenAllowedPaths,
      frozenTestPlan,
      frozenReviewPlan,
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

        // Build and store test evidence (no-progress check now inside _buildAndStoreEvidence)
        const evidenceResult = await this._buildAndStoreEvidence(
          "test", failure, state,
        );
        if (!evidenceResult.ok) {
          return (evidenceResult as { ok: false; result: LoopAutonomousDeliveryResult }).result;
        }
        const evidenceRef = evidenceResult.artifactRef;

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

        // Record candidate patchArtifactRef (durable artifact fact)
        state.patchArtifactRefs.push(repairSuccess.result.patchArtifactRef);

        // ── R4: D03 reconciliation FIRST ──
        // Candidate postTaskHeadSha / postStatusDigestSha256 MUST NOT enter
        // current verified binding before D03 inspect confirms workspace state.
        const postRepairBindResult = await this._bindAndVerifyPostD05(
          identity, workspace, state,
          repairSuccess.result.postTaskHeadSha,
          repairSuccess.result.postStatusDigestSha256,
        );
        if (!postRepairBindResult.ok) return (postRepairBindResult as { ok: false; result: LoopAutonomousDeliveryResult }).result;

        // No-progress check AFTER reconciliation, using verified binding
        const postRepairNoProgress = this._checkNoProgressPostRepair(
          state, repairSuccess.result, evidenceResult.evidenceDigest, allowedPaths,
        );
        if (postRepairNoProgress) {
          return this._finalizeTerminal(state, "failed", "NO_PROGRESS", postRepairNoProgress);
        }

        // Only after D03 + no-progress: add files and repair_attempt trace
        for (const f of repairSuccess.result.files) {
          state.files.add(f);
        }
        this._addTrace(state, "repair_attempt",
          "test_repair", state.totalFixRounds, state.testRepairAttempt, null, "succeeded",
          null, repairSuccess.result.patchArtifactRef,
          repairSuccess.result.patchDigestSha256,
          repairSuccess.result.postStatusDigestSha256,
        );

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

        // Build and store review evidence (no-progress check now inside _buildAndStoreEvidence)
        const evidenceResult2 = await this._buildAndStoreEvidence(
          "review", failure, state,
        );
        if (!evidenceResult2.ok) {
          return (evidenceResult2 as { ok: false; result: LoopAutonomousDeliveryResult }).result;
        }
        const evidenceRef2 = evidenceResult2.artifactRef;

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

        // Record candidate patchArtifactRef (durable artifact fact)
        state.patchArtifactRefs.push(reviewRepairSuccess.result.patchArtifactRef);

        // ── R4: D03 reconciliation FIRST ──
        // Candidate postTaskHeadSha / postStatusDigestSha256 MUST NOT enter
        // current verified binding before D03 inspect confirms workspace state.
        const postReviewBindResult = await this._bindAndVerifyPostD05(
          identity, workspace, state,
          reviewRepairSuccess.result.postTaskHeadSha,
          reviewRepairSuccess.result.postStatusDigestSha256,
        );
        if (!postReviewBindResult.ok) return (postReviewBindResult as { ok: false; result: LoopAutonomousDeliveryResult }).result;

        // No-progress check AFTER reconciliation, using verified binding
        const postRepairNoProgress2 = this._checkNoProgressPostRepair(
          state, reviewRepairSuccess.result, evidenceResult2.evidenceDigest, allowedPaths,
        );
        if (postRepairNoProgress2) {
          return this._finalizeTerminal(state, "failed", "NO_PROGRESS", postRepairNoProgress2);
        }

        // Only after D03 + no-progress: add files and repair_attempt trace
        for (const f of reviewRepairSuccess.result.files) {
          state.files.add(f);
        }
        this._addTrace(state, "repair_attempt",
          "review_repair", state.totalFixRounds, state.reviewRepairAttempt, null, "succeeded",
          null, reviewRepairSuccess.result.patchArtifactRef,
          reviewRepairSuccess.result.patchDigestSha256,
          reviewRepairSuccess.result.postStatusDigestSha256,
        );

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
      // Check deadline before each step (tri-state gate)
      const stepDeadlineCheck = this._checkDeadline(state);
      if (stepDeadlineCheck.status === "clock_error") {
        return {
          failed: true,
          failure: {
            stepId: step.id,
            reasonCode: "INTERNAL_ERROR",
            reasonMessage: "clock error before step",
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
      if (stepDeadlineCheck.status === "expired") {
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
      let remaining: number;
      try {
        remaining = Math.max(0, state.deadlineMs - this._readClockOrThrow(state));
      } catch {
        // Clock error → fail the step
        return {
          failed: true,
          failure: {
            stepId: step.id,
            reasonCode: "INTERNAL_ERROR",
            reasonMessage: "clock error computing remaining time",
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

      // Execute step via D02 — capture ALL outcomes
      let runnerResult: unknown = undefined;
      let runnerError: unknown = undefined;
      let runnerReturned = false;
      const requestedMaxStdout = step.maxStdoutBytes ?? this.defaultMaxStdoutBytes;
      const requestedMaxStderr = step.maxStderrBytes ?? this.defaultMaxStderrBytes;
      try {
        runnerResult = await this.runner.run({
          executableId: step.executableId,
          args: step.args ? freeze([...step.args]) : undefined,
          cwd: workspace.workspacePath,
          timeoutMs: effectiveTimeout,
          maxStdoutBytes: requestedMaxStdout,
          maxStderrBytes: requestedMaxStderr,
        });
        runnerReturned = true;
      } catch (e) {
        runnerError = e;
        runnerReturned = true;
      }

      // ── Mandatory post-step D03 inspect (ALWAYS after runner, regardless of outcome) ──
      let postSnapshot: LoopGitWorkspaceSnapshot;
      try {
        const rawPostSnap = await this.workspaceManager.inspect(identity);
        const postValidation = validateWorkspaceSnapshot(rawPostSnap);
        if (!postValidation.ok) {
          return {
            failed: true,
            failure: {
              stepId: step.id,
              reasonCode: "DEPENDENCY_RESULT_INVALID",
              reasonMessage: "invalid workspace snapshot after step",
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
        postSnapshot = postValidation.value;
      } catch {
        return {
          blocked: true,
          blockedResult: await this._finalizeTerminal(state, "blocked", "WORKSPACE_DRIFT",
            "workspace inspect failed after step"),
        };
      }

      // ── Priority-based post-step classification ──

      // Priority 1: Verify post-step identity binding
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

      // Priority 2: HEAD change → blocked
      if (postHeadSha !== preHeadSha) {
        return {
          blocked: true,
          blockedResult: await this._finalizeTerminal(state, "blocked", "WORKSPACE_DRIFT",
            "task HEAD changed during step"),
        };
      }

      // Priority 3: Status digest or taskHasChanges mutation → failed
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
            exitCode: null, signal: null, durationMs: 0,
            stdoutTruncated: false, stderrTruncated: false,
            stdout: "", stderr: "",
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

      // Priority 4: Clock error → failed
      const clockCheck = this._checkDeadline(state);
      if (clockCheck.status === "clock_error") {
        return {
          failed: true,
          failure: {
            stepId: step.id,
            reasonCode: "INTERNAL_ERROR",
            reasonMessage: "clock error after step",
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
              task_head_sha: postHeadSha,
              status_digest_sha256: postStatusDigest,
            },
          },
        };
      }

      // Priority 5: Overall deadline → failed
      if (clockCheck.status === "expired") {
        return {
          failed: true,
          failure: {
            stepId: step.id,
            reasonCode: "TOTAL_TIMEOUT",
            reasonMessage: "deadline exceeded after step",
            repairable: false,
            exitCode: null, signal: null, durationMs: 0,
            stdoutTruncated: false, stderrTruncated: false,
            stdout: "", stderr: "",
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

      // Priority 6: Runner threw → classify typed error
      if (runnerError !== undefined) {
        return this._classifyRunnerError(runnerError, step.id, phase, state);
      }

      // Priority 7: Runner result structure validation
      const resultValidation = validateRunnerResult(runnerResult, requestedMaxStdout, requestedMaxStderr);
      if (!resultValidation.ok) {
        return {
          failed: true,
          failure: {
            stepId: step.id,
            reasonCode: "DEPENDENCY_RESULT_INVALID",
            reasonMessage: (resultValidation as { ok: false; reason: string }).reason,
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
              task_head_sha: postHeadSha,
              status_digest_sha256: postStatusDigest,
            },
          },
        };
      }

      const validResult = runnerResult as LoopPosixProcessResult;
      const durationMs = validResult.durationMs;

      // Step classification: timed_out, truncation, non-zero/signal, or pass
      const stepPassed = validResult.status === "exited" &&
        validResult.exitCode === 0 &&
        validResult.signal === null &&
        validResult.stdoutTruncated === false &&
        validResult.stderrTruncated === false;

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

      if (validResult.status === "timed_out") {
        outcomeCategory = isTest ? "TEST_TIMED_OUT" : "REVIEW_TIMED_OUT";
        reasonCode = isTest ? "TEST_TIMED_OUT" : "REVIEW_TIMED_OUT";
        repairable = true;
      } else if (validResult.stdoutTruncated || validResult.stderrTruncated) {
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
        exitCode: validResult.exitCode,
        signal: validResult.signal,
        durationMs,
        stdoutTruncated: validResult.stdoutTruncated,
        stderrTruncated: validResult.stderrTruncated,
        stdout: validResult.stdout,
        stderr: validResult.stderr,
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
    // Check deadline before D05 (tri-state gate)
    const d05PreCheck = this._checkDeadline(state);
    if (d05PreCheck.status === "clock_error") {
      return {
        status: "failed",
        result: await this._finalizeTerminal(state, "failed", "INTERNAL_ERROR", "clock error before D05"),
      };
    }
    if (d05PreCheck.status === "expired") {
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

    // Check deadline after D05 (tri-state gate)
    const d05PostCheck = this._checkDeadline(state);
    if (d05PostCheck.status === "clock_error") {
      return {
        status: "failed",
        result: await this._finalizeTerminal(state, "failed", "INTERNAL_ERROR", "clock error after D05"),
      };
    }
    if (d05PostCheck.status === "expired") {
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

    // ── R4: Do NOT write repair_attempt "succeeded" trace here ──
    // The trace must only be written after D03 reconciliation confirms
    // the workspace binding. Callers are responsible for adding it.

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
    // Check deadline before evidence (tri-state gate)
    const evPreCheck = this._checkDeadline(state);
    if (evPreCheck.status === "clock_error") {
      return {
        ok: false,
        result: await this._finalizeTerminal(state, "failed", "INTERNAL_ERROR", "clock error before evidence"),
      };
    }
    if (evPreCheck.status === "expired") {
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

    // Build evidence
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

    const evidenceDigest = evidenceBuildResult.digestSha256;

    // ── No-progress check BEFORE put ──
    // Build failure key from phase + evidenceDigest + current workspace status
    const failureKey = `${phaseName}:${evidenceDigest}:${state.currentStatusDigestSha256}`;
    if (state.seenFailureKeys.has(failureKey)) {
      // Duplicate failure — do NOT put evidence, return NO_PROGRESS
      return {
        ok: false,
        result: await this._finalizeTerminal(state, "failed", "NO_PROGRESS", "duplicate failure key"),
      };
    }
    // Record key BEFORE put (first occurrence is allowed to put)
    state.seenFailureKeys.add(failureKey);
    state.lastEvidenceDigest = evidenceDigest;

    // Check deadline before put
    const deadlineCheck = this._checkDeadline(state);
    if (deadlineCheck.status === "clock_error") {
      return {
        ok: false,
        result: await this._finalizeTerminal(state, "failed", "INTERNAL_ERROR", "clock error before evidence put"),
      };
    }
    if (deadlineCheck.status === "expired") {
      return {
        ok: false,
        result: await this._finalizeTerminal(state, "failed", "TOTAL_TIMEOUT", "deadline exceeded before evidence put"),
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

    // Check deadline after evidence (tri-state gate)
    const evPostCheck = this._checkDeadline(state);
    if (evPostCheck.status === "clock_error") {
      return {
        ok: false,
        result: await this._finalizeTerminal(state, "failed", "INTERNAL_ERROR", "clock error after evidence"),
      };
    }
    if (evPostCheck.status === "expired") {
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
    // ── Gate 1: Check deadline before final inspect ──
    const preFinalCheck = this._checkDeadline(state);
    if (preFinalCheck.status === "clock_error") {
      return await this._finalizeTerminal(state, "failed", "INTERNAL_ERROR", "clock error before final inspect");
    }
    if (preFinalCheck.status === "expired") {
      return await this._finalizeTerminal(state, "failed", "TOTAL_TIMEOUT", "deadline exceeded before final inspect");
    }

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

    // ── Gate 2: Check deadline after final inspect, before returning success ──
    const postFinalCheck = this._checkDeadline(state);
    if (postFinalCheck.status === "clock_error") {
      return await this._finalizeTerminal(state, "failed", "INTERNAL_ERROR", "clock error after final inspect");
    }
    if (postFinalCheck.status === "expired") {
      return await this._finalizeTerminal(state, "failed", "TOTAL_TIMEOUT", "deadline exceeded after final inspect");
    }

    return await this._finalizeTerminal(state, "succeeded", "DELIVERY_SUCCEEDED",
      "delivery completed successfully", undefined, finalWorkspace);
  }

  // ═══════════════════════════════════════ Private: Clock

  private _readClock(state: InternalState | null): ClockReadResult {
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

  private _checkDeadline(state: InternalState): DeadlineCheck {
    const clockResult = this._readClock(state);
    if (!clockResult.ok) {
      return { status: "clock_error" };
    }
    const nowMs = clockResult.nowMs;
    if (nowMs >= state.deadlineMs) {
      return { status: "expired", nowMs };
    }
    const remainingMs = state.deadlineMs - nowMs;
    return { status: "active", nowMs, remainingMs };
  }

  /**
   * Read clock and fail on error. Returns nowMs for valid read.
   * Throws if clock is bad — caller must handle INTERNAL_ERROR.
   */
  private _readClockOrThrow(state: InternalState): number {
    const result = this._readClock(state);
    if (!result.ok) {
      throw new Error("clock error");
    }
    return result.nowMs;
  }

  /**
   * Safe clock read for traces — returns something non-negative even on error.
   * Clock errors are caught at structured checkpoints, not in traces.
   */
  private _tryReadClockForTrace(state: InternalState): number {
    const result = this._readClock(state);
    if (!result.ok) {
      return Math.max(0, state.lastClockMs);
    }
    return result.nowMs;
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
    // Compute elapsed using last valid clock reading (or state.lastClockMs on error)
    const clockResult2 = this._readClock(state);
    let nowMs: number;
    let elapsedMs: number;
    if (clockResult2.ok) {
      nowMs = clockResult2.nowMs;
      elapsedMs = Math.max(0, nowMs - state.startMs);
    } else {
      // Clock error in finalizer: use last known clock, set INTERNAL_ERROR
      nowMs = state.lastClockMs;
      elapsedMs = Math.max(0, nowMs - state.startMs);
      // Override to INTERNAL_ERROR if clock failed — covers succeeded, blocked, and non-INTERNAL_ERROR failed
      if (status !== "failed" || reasonCode !== "INTERNAL_ERROR") {
        status = "failed";
        reasonCode = "INTERNAL_ERROR";
        safeMsg = "clock error in finalizer";
      }
    }

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
      // Replace the terminal trace entry (exactly one) to reflect the override
      const traceCopy = [...state.trace];
      // Remove the last "terminal" entry that was just added
      for (let i = traceCopy.length - 1; i >= 0; i--) {
        if (traceCopy[i]!.kind === "terminal") {
          traceCopy.splice(i, 1);
          break;
        }
      }
      // Add the replacement terminal entry
      const terminalElapsed = Math.max(0, (clockResult2.ok ? clockResult2.nowMs : state.lastClockMs) - state.startMs);
      traceCopy.push(freeze({
        sequence: state.traceSeq + 1,
        kind: "terminal" as LoopDeliveryTraceKind,
        phase: "initial" as const,
        fixRound: state.totalFixRounds,
        attempt: 0,
        stepId: null,
        outcome: "failed",
        artifactRef: null,
        patchArtifactRef: null,
        patchDigestSha256: null,
        workspaceStatusDigestSha256: state.currentStatusDigestSha256 || null,
        elapsedMs: terminalElapsed,
      }));

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
        trace: freeze(traceCopy),
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
    // Check deadline before bind (tri-state gate)
    const bindCheck = this._checkDeadline(state);
    if (bindCheck.status === "clock_error") {
      return {
        ok: false,
        result: await this._finalizeTerminal(state, "failed", "INTERNAL_ERROR", "clock error before bind"),
      };
    }
    if (bindCheck.status === "expired") {
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
    // Check deadline post-D05 (tri-state gate)
    const postD05Check = this._checkDeadline(state);
    if (postD05Check.status === "clock_error") {
      return {
        ok: false,
        result: await this._finalizeTerminal(state, "failed", "INTERNAL_ERROR", "clock error post-D05"),
      };
    }
    if (postD05Check.status === "expired") {
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
    // Must use real instanceof LoopPosixProcessRunnerError — NOT name/code/prototype comparison
    const isTypedRunnerError = error instanceof LoopPosixProcessRunnerError;

    if (isTypedRunnerError) {
      const typedErr = error as LoopPosixProcessRunnerError;
      const code = typedErr.code;

      // D02 blocked codes → blocked / EXECUTION_BLOCKED
      if (D02_BLOCKED_CODES.has(code)) {
        return {
          blocked: true,
          blockedResult: await this._finalizeTerminal(state, "blocked", "EXECUTION_BLOCKED",
            `runner blocked: ${code}`, code),
        };
      }

      // D02 failed codes → failed / INTERNAL_ERROR
      if (D02_FAILED_CODES.has(code)) {
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

      // Unknown D02 code → must NOT map to blocked; treat as INTERNAL_ERROR
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

    // Not a LoopPosixProcessRunnerError → INTERNAL_ERROR (reject spoofing via name/code)
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
    const elapsedMs = Math.max(0, this._tryReadClockForTrace(state) - state.startMs);
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
): { ok: true; plan: readonly LoopDeliveryCommandStep[] } | { ok: false; reason: string } {
  const stepIds = new Set<string>();
  const validated: LoopDeliveryCommandStep[] = [];

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
    let stepArgs: readonly string[] | undefined;
    if (scanned.args !== undefined) {
      if (!Array.isArray(scanned.args)) {
        return { ok: false, reason: `${label}[${i}].args not an array` };
      }
      if (scanned.args.length > MAX_STEP_ARGS) {
        return { ok: false, reason: `${label}[${i}].args too many` };
      }
      let totalBytes = 0;
      const argsCopy: string[] = [];
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
        argsCopy.push(arg);
      }
      if (totalBytes > MAX_ARGS_TOTAL_BYTES) {
        return { ok: false, reason: `${label}[${i}].args total too large` };
      }
      stepArgs = freeze(argsCopy);
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

    // Build validated step (defensive copy)
    validated.push({
      id: scanned.id as string,
      executableId: scanned.executableId as string,
      args: stepArgs,
      timeoutMs: scanned.timeoutMs as number | undefined,
      maxStdoutBytes: scanned.maxStdoutBytes as number | undefined,
      maxStderrBytes: scanned.maxStderrBytes as number | undefined,
    });
  }

  return { ok: true, plan: freeze(validated) };
}

// ═══════════════════════════════════════ D02 Result Validator

const RUNNER_RESULT_KEYS = [
  "status", "exitCode", "signal", "durationMs",
  "stdout", "stderr", "stdoutBytesReceived", "stderrBytesReceived",
  "stdoutTruncated", "stderrTruncated", "termSignalSent", "killSignalSent",
];

function validateRunnerResult(
  result: unknown,
  maxStdoutBytes: number,
  maxStderrBytes: number,
): { ok: true } | { ok: false; reason: string } {
  let r: Record<string, unknown>;
  try {
    r = scanPlain(result, RUNNER_RESULT_KEYS, "runner result");
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }

  // ── All 12 own data properties MUST be present (hasOwnProperty check) ──
  for (const key of RUNNER_RESULT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(r, key)) {
      return { ok: false, reason: `missing required field: ${key}` };
    }
  }

  // status: only "exited" or "timed_out"
  if (r.status !== "exited" && r.status !== "timed_out") {
    return { ok: false, reason: "invalid status" };
  }

  // exitCode: safe integer or null (MUST be own property, not undefined)
  const exitCodeRaw = r.exitCode;
  if (exitCodeRaw !== null) {
    if (exitCodeRaw === undefined || typeof exitCodeRaw !== "number" || !Number.isSafeInteger(exitCodeRaw)) {
      return { ok: false, reason: "invalid exitCode" };
    }
  }

  // signal: null or canonical platform signal string (MUST be own property, not undefined)
  const signalRaw = r.signal;
  if (signalRaw !== null) {
    if (signalRaw === undefined || typeof signalRaw !== "string") {
      return { ok: false, reason: "invalid signal" };
    }
    if (!PLATFORM_SIGNALS.has(signalRaw)) {
      return { ok: false, reason: `signal not in platform canonical set: ${signalRaw}` };
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

  // Byte retention validation
  const retainedStdoutBytes = Buffer.byteLength(r.stdout as string, "utf8");
  const retainedStderrBytes = Buffer.byteLength(r.stderr as string, "utf8");

  if (retainedStdoutBytes > maxStdoutBytes) {
    return { ok: false, reason: "retained stdout exceeds requested max" };
  }
  if (retainedStderrBytes > maxStderrBytes) {
    return { ok: false, reason: "retained stderr exceeds requested max" };
  }
  if ((r.stdoutBytesReceived as number) < retainedStdoutBytes) {
    return { ok: false, reason: "stdoutBytesReceived less than retained bytes" };
  }
  if ((r.stderrBytesReceived as number) < retainedStderrBytes) {
    return { ok: false, reason: "stderrBytesReceived less than retained bytes" };
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

  // ── Discriminant safety: scan status descriptor BEFORE reading value ──
  let ownKeys: Array<string | symbol>;
  try {
    ownKeys = Reflect.ownKeys(result) as Array<string | symbol>;
  } catch {
    return { ok: false, reason: "D05 ownKeys threw" };
  }
  for (const k of ownKeys) {
    if (typeof k === "symbol") return { ok: false, reason: "D05 has symbol key" };
    if (k === "__proto__") return { ok: false, reason: "D05 has __proto__ key" };
  }

  // Validate status descriptor (must be data property, not accessor)
  let statusDesc: PropertyDescriptor;
  try {
    statusDesc = Object.getOwnPropertyDescriptor(result, "status")!;
  } catch {
    return { ok: false, reason: "D05 getDescriptor threw" };
  }
  if (!statusDesc) {
    return { ok: false, reason: "D05 missing status descriptor" };
  }
  if ("get" in statusDesc || "set" in statusDesc) {
    return { ok: false, reason: "D05 status is accessor" };
  }
  if (!("value" in statusDesc)) {
    return { ok: false, reason: "D05 status no value" };
  }

  const statusValue = statusDesc.value;

  if (statusValue !== "succeeded" && statusValue !== "failed") {
    return { ok: false, reason: "D05 invalid status" };
  }

  if (statusValue === "succeeded") {
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

    // files: unique, trimmed string array (must be non-empty)
    if (!Array.isArray(s.files)) {
      return { ok: false, reason: "D05 files not array" };
    }
    if (s.files.length < 1) {
      return { ok: false, reason: "D05 files empty" };
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

  // errorCode must be in D05 canonical set
  if (typeof f.errorCode !== "string") {
    return { ok: false, reason: "D05 failure missing errorCode" };
  }
  if (!D05_CANONICAL_ERROR_CODES.has(f.errorCode)) {
    return { ok: false, reason: `D05 errorCode not in canonical set: ${String(f.errorCode)}` };
  }

  // retryable must be boolean
  if (typeof f.retryable !== "boolean") {
    return { ok: false, reason: "D05 retryable not boolean" };
  }

  // safeMessage must be bounded string, no control chars
  if (typeof f.safeMessage !== "string" || f.safeMessage.length > MAX_SAFE_MESSAGE) {
    return { ok: false, reason: "D05 safeMessage invalid" };
  }
  if (NON_CONTROL_RE.test(f.safeMessage)) {
    return { ok: false, reason: "D05 safeMessage has control chars" };
  }

  // causeCode (if present) must be in D04 canonical set
  if (f.causeCode !== undefined && f.causeCode !== null) {
    if (typeof f.causeCode !== "string" || !D04_CANONICAL_CAUSE_CODES.has(f.causeCode)) {
      return { ok: false, reason: "D05 causeCode not in D04 canonical set" };
    }
  }

  // Optional patch fields: all-or-none
  const hasRef = f.patchArtifactRef !== undefined;
  const hasDigest = f.patchDigestSha256 !== undefined;
  const hasSize = f.patchSizeBytes !== undefined;

  if (hasRef || hasDigest || hasSize) {
    // All three must be present
    if (!hasRef || !hasDigest || !hasSize) {
      return { ok: false, reason: "D05 optional patch fields must be all-or-none" };
    }

    // patchArtifactRef must be string
    if (typeof f.patchArtifactRef !== "string") {
      return { ok: false, reason: "D05 patchArtifactRef not string" };
    }

    // patchDigestSha256 must be canonical SHA-256
    if (typeof f.patchDigestSha256 !== "string" || !SHA256_RE.test(f.patchDigestSha256)) {
      return { ok: false, reason: "D05 patchDigestSha256 invalid" };
    }

    // patchSizeBytes must be safe positive integer
    if (typeof f.patchSizeBytes !== "number" || !Number.isSafeInteger(f.patchSizeBytes) || f.patchSizeBytes <= 0) {
      return { ok: false, reason: "D05 patchSizeBytes invalid" };
    }

    // Ref must match digest
    const expectedRef = `loop-artifact:v1:code_patch:sha256:${f.patchDigestSha256}`;
    if (f.patchArtifactRef !== expectedRef) {
      return { ok: false, reason: "D05 patchArtifactRef does not match digest" };
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

// ═══════════════════════════════════════ Additive canonical parsers (D06-owned)
// =============================================================================
// The strict canonical parser for the artifact this module produces
// (`loop-delivery-result-v1`). It is the SINGLE authority for the serialized
// status/reason/trace vocabulary, canonical key order and canonical bytes of
// the delivery result artifact — it co-evolves with `_persistDeliveryResult`
// above and never duplicates another module's schema. No-throw, fail-closed,
// bounded defensive copy, strict UTF-8, exact keys, canonical property order,
// canonical-bytes rebuild with byte-identical round-trip, artifact-ref/digest/
// material binding.

export type LoopCanonicalParseFailureReason = "invalid_input" | "invalid_bytes" | "too_large";

export interface LoopCanonicalParseSuccess<T> {
  readonly ok: true;
  readonly value: Readonly<T>;
  readonly text: string;
  readonly bytes: Uint8Array;
  readonly digestSha256: string;
  readonly sizeBytes: number;
}

export interface LoopCanonicalParseFailure {
  readonly ok: false;
  readonly reason: LoopCanonicalParseFailureReason;
  readonly diagnostic: string;
}

export type LoopCanonicalParseResult<T> = LoopCanonicalParseSuccess<T> | LoopCanonicalParseFailure;

/** Canonical value parsed from `loop-delivery-result-v1` bytes. */
export interface LoopParsedDeliveryFinalWorkspace {
  readonly workspacePath: string;
  readonly taskBranch: string;
  readonly taskHeadSha: string;
  readonly statusDigestSha256: string;
  readonly taskHasChanges: boolean;
}

export interface LoopParsedDeliveryTraceEntry {
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

export interface LoopParsedDeliveryResult {
  readonly schema: "loop-delivery-result-v1";
  readonly status: LoopAutonomousDeliveryStatus;
  readonly reasonCode: LoopAutonomousDeliveryReasonCode;
  readonly causeCode: string | null;
  readonly totalFixRounds: number;
  readonly testAttempts: number;
  readonly reviewAttempts: number;
  readonly patchArtifactRefs: readonly string[];
  readonly testSummaryArtifactRefs: readonly string[];
  readonly reviewSummaryArtifactRefs: readonly string[];
  readonly files: readonly string[];
  readonly finalWorkspace: Readonly<LoopParsedDeliveryFinalWorkspace> | null;
  readonly elapsedMs: number;
  readonly trace: readonly LoopParsedDeliveryTraceEntry[];
}

export interface LoopParseDeliveryOptions {
  readonly maxBytes?: number;
  readonly expectedMaterial?: Readonly<{
    readonly workspacePath: string;
    readonly taskBranch: string;
    readonly taskHeadSha: string;
    readonly statusDigestSha256: string;
    readonly taskHasChanges: boolean;
  }>;
}

// Canonical serialized property order produced by `_persistDeliveryResult`.
const DELIVERY_RESULT_KEYS = [
  "schema", "status", "reason_code", "cause_code", "total_fix_rounds", "test_attempts", "review_attempts",
  "patch_artifact_refs", "test_summary_artifact_refs", "review_summary_artifact_refs", "files",
  "final_workspace", "elapsed_ms", "trace",
] as const;
const DELIVERY_FINAL_WORKSPACE_KEYS = [
  "workspace_path", "task_branch", "task_head_sha", "status_digest_sha256", "task_has_changes",
] as const;
const DELIVERY_TRACE_ENTRY_KEYS = [
  "sequence", "kind", "phase", "fix_round", "attempt", "step_id", "outcome", "artifact_ref",
  "patch_artifact_ref", "patch_digest_sha256", "workspace_status_digest_sha256", "elapsed_ms",
] as const;

// Canonical serialized unions of this module (same values as the public types).
const DELIVERY_STATUS_VALUES: readonly string[] = ["succeeded", "failed", "blocked"];
const DELIVERY_REASON_CODE_VALUES: readonly string[] = [
  "DELIVERY_SUCCEEDED", "INVALID_INPUT", "WORKSPACE_DRIFT", "EXECUTION_BLOCKED", "IMPLEMENTATION_FAILED",
  "TEST_FAILED", "TEST_TIMED_OUT", "TEST_OUTPUT_TRUNCATED", "TEST_WORKSPACE_MUTATED", "REVIEW_FAILED",
  "REVIEW_TIMED_OUT", "REVIEW_OUTPUT_TRUNCATED", "REVIEW_WORKSPACE_MUTATED", "REPAIR_FAILED",
  "FIX_BUDGET_EXHAUSTED", "NO_PROGRESS", "TOTAL_TIMEOUT", "ARTIFACT_STORE_FAILED",
  "DEPENDENCY_RESULT_INVALID", "INTERNAL_ERROR",
];
const DELIVERY_TRACE_KIND_VALUES: readonly string[] = [
  "implementation_initial", "test_plan_start", "test_step_pass", "test_step_fail", "test_plan_end",
  "review_plan_start", "review_step_pass", "review_step_fail", "review_plan_end", "repair_attempt",
  "evidence_stored", "terminal", "info",
];
const DELIVERY_TRACE_PHASE_VALUES: readonly string[] = ["initial", "test", "review", "test_repair", "review_repair"];

// ═══════════════════════════════════════ Parser toolkit

const PARSER_MAX_ARTIFACT_BYTES_BOUND = 16_777_216;
const PARSER_MAX_SAFE_MESSAGE_LENGTH = 256;
const PARSER_REF_RE = /^loop-artifact:v1:([a-z_]+):sha256:([0-9a-f]{64})$/;
const PARSER_SHA256_RE = /^[0-9a-f]{64}$/;
const PARSER_SHA40_RE = /^[0-9a-f]{40}$/;
const PARSER_CONTROL_RE = /[\x00-\x1f\x7f-\x9f]/;

function parserUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function parserSha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const PARSER_TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype);
const PARSER_BYTE_LENGTH_GETTER = Object.getOwnPropertyDescriptor(PARSER_TYPED_ARRAY_PROTOTYPE, "byteLength")!.get!;
const PARSER_TO_STRING_TAG_GETTER = Object.getOwnPropertyDescriptor(PARSER_TYPED_ARRAY_PROTOTYPE, Symbol.toStringTag)!.get!;

class ParserValidationError extends Error {
  readonly reason: LoopCanonicalParseFailureReason;
  readonly diagnostic: string;

  constructor(reason: LoopCanonicalParseFailureReason, diagnostic: string) {
    super(diagnostic);
    this.name = "ParserValidationError";
    this.reason = reason;
    this.diagnostic = diagnostic;
  }
}

function parserValidationFail(reason: LoopCanonicalParseFailureReason, diagnostic: string): never {
  throw new ParserValidationError(reason, diagnostic);
}

function parserAsFailure(error: unknown, fallbackDiagnostic: string): LoopCanonicalParseFailure {
  if (error instanceof ParserValidationError) {
    return { ok: false, reason: error.reason, diagnostic: error.diagnostic };
  }
  return { ok: false, reason: "invalid_input", diagnostic: fallbackDiagnostic };
}

function parserIsPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  let proto: unknown;
  try {
    proto = Object.getPrototypeOf(value);
  } catch {
    return false;
  }
  return proto === Object.prototype || proto === null;
}

/** Exact-key descriptor snapshot of a plain record (canonical count and order). */
function parserScanPlainObject(value: unknown, allowed: readonly string[], label: string): Record<string, unknown> {
  if (!parserIsPlainRecord(value)) parserValidationFail("invalid_input", `${label} must be a plain object`);
  let keys: Array<string | symbol>;
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    parserValidationFail("invalid_input", `${label} ownKeys reflection failed`);
  }
  if (keys.length !== allowed.length) {
    parserValidationFail("invalid_input", `${label} must have exactly the canonical keys`);
  }
  const out = Object.create(null) as Record<string, unknown>;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!;
    if (typeof key === "symbol") parserValidationFail("invalid_input", `${label} must not carry symbol keys`);
    if (key === "__proto__") parserValidationFail("invalid_input", `${label} must not carry __proto__`);
    if (key !== allowed[i]) {
      parserValidationFail("invalid_input", `${label} must have the canonical keys in canonical order`);
    }
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      parserValidationFail("invalid_input", `${label} descriptor reflection failed`);
    }
    if (descriptor === undefined) parserValidationFail("invalid_input", `${label} key descriptor is missing`);
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
      parserValidationFail("invalid_input", `${label} must not carry accessors`);
    }
    if (!("value" in descriptor)) parserValidationFail("invalid_input", `${label} key has no value`);
    Object.defineProperty(out, key, {
      value: descriptor.value,
      writable: false,
      enumerable: true,
      configurable: false,
    });
  }
  return out;
}

/** Dense descriptor-snapshot array scan; sparse/extra-key/over-cap arrays fail. */
function parserScanPlainArray(value: unknown, label: string, maxItems: number): unknown[] {
  let isArray: boolean;
  try {
    isArray = Array.isArray(value);
  } catch {
    parserValidationFail("invalid_input", `${label} array reflection failed`);
  }
  if (!isArray) parserValidationFail("invalid_input", `${label} must be an array`);
  let proto: unknown;
  try {
    proto = Object.getPrototypeOf(value as object);
  } catch {
    parserValidationFail("invalid_input", `${label} array prototype reflection failed`);
  }
  if (proto !== Array.prototype) parserValidationFail("invalid_input", `${label} has a non-plain array prototype`);
  let keys: Array<string | symbol>;
  try {
    keys = Reflect.ownKeys(value as object);
  } catch {
    parserValidationFail("invalid_input", `${label} ownKeys reflection failed`);
  }
  const snapshot = new Map<string | symbol, unknown>();
  for (const key of keys) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      parserValidationFail("invalid_input", `${label} descriptor reflection failed`);
    }
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined || !("value" in descriptor)) {
      parserValidationFail("invalid_input", `${label} has an invalid property descriptor`);
    }
    snapshot.set(key, descriptor.value);
  }
  const lengthValue = snapshot.get("length");
  if (typeof lengthValue !== "number" || !Number.isSafeInteger(lengthValue) || lengthValue < 0) {
    parserValidationFail("invalid_input", `${label} length must be a non-negative safe integer`);
  }
  if (lengthValue > maxItems) parserValidationFail("invalid_input", `${label} exceeds the element bound`);
  let indexCount = 0;
  for (const key of keys) {
    if (key === "length") continue;
    if (typeof key !== "string") parserValidationFail("invalid_input", `${label} must not carry extra own properties`);
    const idx = Number(key);
    if (!Number.isSafeInteger(idx) || idx < 0 || idx >= lengthValue || String(idx) !== key) {
      parserValidationFail("invalid_input", `${label} must not carry extra own properties`);
    }
    indexCount += 1;
  }
  if (indexCount !== lengthValue) parserValidationFail("invalid_input", `${label} must be a dense array`);
  const out: unknown[] = new Array(lengthValue);
  for (let i = 0; i < lengthValue; i++) {
    out[i] = snapshot.get(String(i));
  }
  return out;
}

function parserResolveMaxBytes(maxBytes: number | undefined, fallback: number): number {
  const resolved = maxBytes ?? fallback;
  if (typeof resolved !== "number" || !Number.isSafeInteger(resolved) || resolved < 1 || resolved > PARSER_MAX_ARTIFACT_BYTES_BOUND) {
    parserValidationFail("invalid_input", "maxBytes must be a safe positive integer within the allowed bound");
  }
  return resolved;
}

/** Bounded defensive copy + byte-level gates for the D06 delivery parser. */
function parserTakeCanonicalBytes(
  input: Uint8Array,
  maxBytes: number,
  trailingLf: boolean,
): { bytes: Uint8Array; text: string; parsed: unknown } {
  if (input === null || typeof input !== "object") parserValidationFail("invalid_input", "bytes must be a Uint8Array");
  let tag: unknown;
  let byteLength: unknown;
  try {
    tag = PARSER_TO_STRING_TAG_GETTER.call(input);
    byteLength = PARSER_BYTE_LENGTH_GETTER.call(input);
  } catch {
    parserValidationFail("invalid_input", "bytes must be a Uint8Array");
  }
  if (tag !== "Uint8Array") parserValidationFail("invalid_input", "bytes must be a Uint8Array");
  if (typeof byteLength !== "number" || !Number.isSafeInteger(byteLength) || byteLength < 0) {
    parserValidationFail("invalid_input", "bytes length must be a non-negative safe integer");
  }
  if (byteLength > maxBytes) parserValidationFail("too_large", "artifact bytes exceed the size limit");
  let snapshot: Uint8Array;
  try {
    snapshot = new Uint8Array(input);
  } catch {
    parserValidationFail("invalid_input", "bytes snapshot failed");
  }
  if (snapshot.length !== byteLength) parserValidationFail("invalid_input", "bytes snapshot length mismatch");
  if (snapshot.length >= 3 && snapshot[0] === 0xef && snapshot[1] === 0xbb && snapshot[2] === 0xbf) {
    parserValidationFail("invalid_bytes", "artifact bytes must not carry a BOM");
  }
  for (let i = 0; i < snapshot.length; i++) {
    if (snapshot[i] === 0x0d || snapshot[i] === 0x00) parserValidationFail("invalid_bytes", "artifact bytes must not contain CR or NUL");
  }
  if (trailingLf) {
    if (snapshot.length === 0 || snapshot[snapshot.length - 1] !== 0x0a) {
      parserValidationFail("invalid_bytes", "artifact bytes must end with exactly one LF");
    }
    for (let i = 0; i < snapshot.length - 1; i++) {
      if (snapshot[i] === 0x0a) parserValidationFail("invalid_bytes", "artifact bytes must not contain an embedded LF");
    }
  } else {
    for (let i = 0; i < snapshot.length; i++) {
      if (snapshot[i] === 0x0a) parserValidationFail("invalid_bytes", "artifact bytes must not contain an LF");
    }
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(snapshot);
  } catch {
    parserValidationFail("invalid_bytes", "artifact bytes are not strict UTF-8");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parserValidationFail("invalid_bytes", "artifact bytes are not valid JSON");
  }
  return { bytes: snapshot, text, parsed };
}

function parserAsNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    parserValidationFail("invalid_input", `${label} must be a trimmed non-empty string`);
  }
  return value;
}

function parserAsSafeInt(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    parserValidationFail("invalid_input", `${label} must be a safe integer within bounds`);
  }
  return value;
}

function parserAsNullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  const s = parserAsNonEmptyString(value, label);
  if (PARSER_CONTROL_RE.test(s)) parserValidationFail("invalid_input", `${label} must not contain control characters`);
  return s;
}

function parserAsSha256(value: unknown, label: string): string {
  const s = parserAsNonEmptyString(value, label);
  if (!PARSER_SHA256_RE.test(s)) parserValidationFail("invalid_input", `${label} must be a 64-char lowercase SHA-256 hex`);
  return s;
}

function parserAsNullableSha256(value: unknown, label: string): string | null {
  if (value === null) return null;
  return parserAsSha256(value, label);
}

function parserAsSha40(value: unknown, label: string): string {
  const s = parserAsNonEmptyString(value, label);
  if (!PARSER_SHA40_RE.test(s)) parserValidationFail("invalid_input", `${label} must be a 40-char lowercase SHA-1 hex`);
  return s;
}

function parserArtifactRefOf(value: unknown, label: string, expectedKind: string): { ref: string; kind: string; digest: string } {
  const s = parserAsNonEmptyString(value, label);
  const m = PARSER_REF_RE.exec(s);
  if (m === null || m[1] !== expectedKind) {
    parserValidationFail("invalid_input", `${label} must be a canonical ${expectedKind} artifact ref`);
  }
  return { ref: s, kind: m[1]!, digest: m[2]! };
}

function parserAsNullableRef(value: unknown, label: string, expectedKind: string): string | null {
  if (value === null) return null;
  return parserArtifactRefOf(value, label, expectedKind).ref;
}

function parserSafeMessageText(value: unknown, label: string): string {
  if (typeof value !== "string") parserValidationFail("invalid_input", `${label} must be a string`);
  if (PARSER_CONTROL_RE.test(value)) parserValidationFail("invalid_input", `${label} must not contain control characters`);
  if (value.length > PARSER_MAX_SAFE_MESSAGE_LENGTH) parserValidationFail("invalid_input", `${label} exceeds the safe length`);
  return value;
}

function parserValidatePathArray(value: unknown, label: string): string[] {
  const arr = parserScanPlainArray(value, label, 4096);
  const out: string[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = parserAsNonEmptyString(arr[i], `${label}[${i}]`);
    if (item.startsWith("/") || item.includes("\\") || PARSER_CONTROL_RE.test(item)) {
      parserValidationFail("invalid_input", `${label}[${i}] must be a repository-relative safe path`);
    }
    if (item === "." || item === ".." || item.includes("/./") || item.includes("/../")
      || item.endsWith("/.") || item.endsWith("/..") || item.split("/").includes(".git")) {
      parserValidationFail("invalid_input", `${label}[${i}] is not a safe repository-relative path`);
    }
    if (i > 0 && out[i - 1]! >= item) {
      parserValidationFail("invalid_input", `${label} must be strictly ascending without duplicates`);
    }
    out.push(item);
  }
  return out;
}

function parserByteEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function parserRequireRoundTrip(intake: { bytes: Uint8Array; text: string; parsed: unknown }, trailingLf: boolean): void {
  const rebuilt = parserUtf8(JSON.stringify(intake.parsed) + (trailingLf ? "\n" : ""));
  if (!parserByteEquals(intake.bytes, rebuilt)) {
    parserValidationFail("invalid_bytes", "artifact bytes are not canonical (round-trip mismatch)");
  }
}

function parserCanonicalParseSuccess<T>(
  value: Readonly<T>,
  canonicalText: string,
  digestSha256: string,
  sizeBytes: number,
): LoopCanonicalParseSuccess<T> {
  return {
    ok: true,
    value,
    text: canonicalText,
    bytes: parserUtf8(canonicalText),
    digestSha256,
    sizeBytes,
  };
}

function parserSameMaterial(
  a: Readonly<{ workspacePath: string; taskBranch: string; taskHeadSha: string; statusDigestSha256: string; taskHasChanges: boolean }>,
  b: Readonly<{ workspacePath: string; taskBranch: string; taskHeadSha: string; statusDigestSha256: string; taskHasChanges: boolean }>,
): boolean {
  return a.workspacePath === b.workspacePath && a.taskBranch === b.taskBranch && a.taskHeadSha === b.taskHeadSha
    && a.statusDigestSha256 === b.statusDigestSha256 && a.taskHasChanges === b.taskHasChanges;
}

// ═══════════════════════════════════════ Parser implementation

/**
 * Strict canonical parser for `loop-delivery-result-v1` (D06 delivery result
 * artifact). Fail-closed, no-throw. When `expectedMaterial` is provided, the
 * final workspace must match the expected workspace material exactly.
 */
export function parseLoopDeliveryResultBytes(
  bytes: Uint8Array,
  options?: Readonly<LoopParseDeliveryOptions>,
): LoopCanonicalParseResult<LoopParsedDeliveryResult> {
  try {
    const maxBytes = parserResolveMaxBytes(options?.maxBytes, DEFAULT_MAX_DELIVERY_RESULT);
    const intake = parserTakeCanonicalBytes(bytes, maxBytes, true);
    const rec = parserScanPlainObject(intake.parsed, DELIVERY_RESULT_KEYS, "delivery result");
    if (rec.schema !== "loop-delivery-result-v1") parserValidationFail("invalid_input", "delivery result schema mismatch");
    if (typeof rec.status !== "string" || !DELIVERY_STATUS_VALUES.includes(rec.status)) {
      parserValidationFail("invalid_input", "delivery result status is not canonical");
    }
    if (typeof rec.reason_code !== "string" || !DELIVERY_REASON_CODE_VALUES.includes(rec.reason_code)) {
      parserValidationFail("invalid_input", "delivery result reason_code is not canonical");
    }
    const causeCode = parserAsNullableString(rec.cause_code, "delivery result cause_code");
    const totalFixRounds = parserAsSafeInt(rec.total_fix_rounds, "delivery result total_fix_rounds", 0, 1000);
    const testAttempts = parserAsSafeInt(rec.test_attempts, "delivery result test_attempts", 0, 1000);
    const reviewAttempts = parserAsSafeInt(rec.review_attempts, "delivery result review_attempts", 0, 1000);
    const refList = (raw: unknown, label: string, kind: string): readonly string[] => {
      const arr = parserScanPlainArray(raw, `delivery result ${label}`, 4096);
      const out: string[] = [];
      for (let i = 0; i < arr.length; i++) {
        out.push(parserArtifactRefOf(arr[i], `delivery result ${label}[${i}]`, kind).ref);
      }
      return Object.freeze(out);
    };
    const patchRefs = refList(rec.patch_artifact_refs, "patch_artifact_refs", "code_patch");
    const testSummaryRefs = refList(rec.test_summary_artifact_refs, "test_summary_artifact_refs", "test_summary");
    const reviewSummaryRefs = refList(rec.review_summary_artifact_refs, "review_summary_artifact_refs", "review_summary");
    const files = Object.freeze(parserValidatePathArray(rec.files, "delivery result files"));
    let finalWorkspace: Readonly<LoopParsedDeliveryFinalWorkspace> | null = null;
    if (rec.final_workspace !== null) {
      const fw = parserScanPlainObject(rec.final_workspace, DELIVERY_FINAL_WORKSPACE_KEYS, "delivery result final_workspace");
      const workspacePath = parserAsNonEmptyString(fw.workspace_path, "delivery result final_workspace.workspace_path");
      const taskBranch = parserAsNonEmptyString(fw.task_branch, "delivery result final_workspace.task_branch");
      const taskHeadSha = parserAsSha40(fw.task_head_sha, "delivery result final_workspace.task_head_sha");
      const statusDigest = parserAsSha256(fw.status_digest_sha256, "delivery result final_workspace.status_digest_sha256");
      if (fw.task_has_changes !== true && fw.task_has_changes !== false) {
        parserValidationFail("invalid_input", "delivery result final_workspace.task_has_changes must be a boolean");
      }
      finalWorkspace = Object.freeze({
        workspacePath,
        taskBranch,
        taskHeadSha,
        statusDigestSha256: statusDigest,
        taskHasChanges: fw.task_has_changes as boolean,
      });
    }
    const elapsedMs = parserAsSafeInt(rec.elapsed_ms, "delivery result elapsed_ms", 0, MAX_MAX_TOTAL_DURATION);
    const traceArr = parserScanPlainArray(rec.trace, "delivery result trace", 4096);
    const trace: LoopParsedDeliveryTraceEntry[] = [];
    let lastSequence = 0;
    for (let i = 0; i < traceArr.length; i++) {
      const entry = parserScanPlainObject(traceArr[i], DELIVERY_TRACE_ENTRY_KEYS, `delivery result trace[${i}]`);
      const sequence = parserAsSafeInt(entry.sequence, `delivery result trace[${i}].sequence`, 1, 1_000_000);
      if (sequence <= lastSequence) parserValidationFail("invalid_input", "delivery result trace sequences must be strictly increasing");
      lastSequence = sequence;
      if (typeof entry.kind !== "string" || !DELIVERY_TRACE_KIND_VALUES.includes(entry.kind)) {
        parserValidationFail("invalid_input", `delivery result trace[${i}].kind is not canonical`);
      }
      if (typeof entry.phase !== "string" || !DELIVERY_TRACE_PHASE_VALUES.includes(entry.phase)) {
        parserValidationFail("invalid_input", `delivery result trace[${i}].phase is not canonical`);
      }
      const fixRound = parserAsSafeInt(entry.fix_round, `delivery result trace[${i}].fix_round`, 0, 1000);
      const attempt = parserAsSafeInt(entry.attempt, `delivery result trace[${i}].attempt`, 0, 1000);
      const stepId = parserAsNullableString(entry.step_id, `delivery result trace[${i}].step_id`);
      const outcome = parserSafeMessageText(entry.outcome, `delivery result trace[${i}].outcome`);
      const artifactRef = parserAsNullableRef(entry.artifact_ref, `delivery result trace[${i}].artifact_ref`, "workspace_metadata");
      const patchArtifactRef = parserAsNullableRef(entry.patch_artifact_ref, `delivery result trace[${i}].patch_artifact_ref`, "code_patch");
      const patchDigest = parserAsNullableSha256(entry.patch_digest_sha256, `delivery result trace[${i}].patch_digest_sha256`);
      const wsDigest = parserAsNullableSha256(entry.workspace_status_digest_sha256, `delivery result trace[${i}].workspace_status_digest_sha256`);
      const entryElapsed = parserAsSafeInt(entry.elapsed_ms, `delivery result trace[${i}].elapsed_ms`, 0, MAX_MAX_TOTAL_DURATION);
      trace.push(Object.freeze({
        sequence,
        kind: entry.kind as LoopDeliveryTraceKind,
        phase: entry.phase as "initial" | "test" | "review" | "test_repair" | "review_repair",
        fixRound,
        attempt,
        stepId,
        outcome,
        artifactRef,
        patchArtifactRef,
        patchDigestSha256: patchDigest,
        workspaceStatusDigestSha256: wsDigest,
        elapsedMs: entryElapsed,
      }));
    }
    if (options?.expectedMaterial !== undefined) {
      if (finalWorkspace === null || !parserSameMaterial(options.expectedMaterial, finalWorkspace)) {
        parserValidationFail("invalid_input", "delivery result workspace material binding mismatch");
      }
    }
    const value: Readonly<LoopParsedDeliveryResult> = deepFreeze({
      schema: "loop-delivery-result-v1",
      status: rec.status as LoopAutonomousDeliveryStatus,
      reasonCode: rec.reason_code as LoopAutonomousDeliveryReasonCode,
      causeCode,
      totalFixRounds,
      testAttempts,
      reviewAttempts,
      patchArtifactRefs: patchRefs,
      testSummaryArtifactRefs: testSummaryRefs,
      reviewSummaryArtifactRefs: reviewSummaryRefs,
      files,
      finalWorkspace,
      elapsedMs,
      trace: Object.freeze(trace),
    });
    parserRequireRoundTrip(intake, true);
    return parserCanonicalParseSuccess(value, JSON.stringify(intake.parsed) + "\n", parserSha256Hex(intake.bytes), intake.bytes.length);
  } catch (error) {
    return parserAsFailure(error, "unexpected failure while parsing delivery result");
  }
}
