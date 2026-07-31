// LOOP Executor Kernel — Recoverable Delivery Publisher
// =======================================================
// Standalone LOOP kernel publisher (D07). Only calls injected
// dependencies: D01 artifact store, D02 process runner,
// D03 workspace manager, and clock.
//
// No child_process, fs, Git, network, process.env, Runtime,
// Execution Gateway, Agent adapter, or Run Journal.
//
// Produces exactly one commit, one normal push, one Draft PR.
// Fail-closed with commit/push/PR recovery. No force, amend, merge.

import { createHash } from "node:crypto";
import type { LoopRunIdentity } from "./loop-executor-types";
import { validateLoopRunIdentity } from "./loop-run-state";
import {
  LoopPosixProcessRunnerError,
  type LoopPosixProcessRunner,
  type LoopPosixProcessResult,
  type LoopPosixProcessRunnerErrorCode,
} from "./loop-posix-process-runner";
import type { LoopGitWorkspaceManager, LoopGitWorkspaceSnapshot } from "./loop-git-workspace";
import type { LoopArtifactStore, LoopStoredArtifact } from "./loop-artifact-store";

// ═══════════════════════════════════════ Types

export type LoopDeliveryPublishStatus = "succeeded" | "failed" | "blocked";

export type LoopDeliveryPublishReasonCode =
  | "PUBLISH_SUCCEEDED"
  | "INVALID_INPUT"
  | "DELIVERY_NOT_READY"
  | "WORKSPACE_DRIFT"
  | "WORKSPACE_STATE_CONFLICT"
  | "BASE_BRANCH_DRIFT"
  | "DEPENDENCY_RESULT_INVALID"
  | "ARTIFACT_STORE_FAILED"
  | "COMMIT_FAILED"
  | "REMOTE_BRANCH_CONFLICT"
  | "PUSH_FAILED"
  | "PR_STATE_CONFLICT"
  | "PR_CREATE_FAILED"
  | "EXECUTION_BLOCKED"
  | "TOTAL_TIMEOUT"
  | "INTERNAL_ERROR";

export type LoopDeliveryPublishRecoveryStage =
  | "not_started"
  | "delivery_verified"
  | "intent_persisted"
  | "commit_created"
  | "branch_pushed"
  | "draft_pr_created"
  | "completed";

export interface LoopDeliveryPublishRequest {
  readonly identity: LoopRunIdentity;
  readonly deliveryResultArtifactRef: string;
  readonly commitSubject: string;
  readonly prTitle: string;
  readonly recoveryPublishIntentArtifactRef?: string;
}

export interface LoopDeliveryPublisherOptions {
  readonly runner: Pick<LoopPosixProcessRunner, "run">;
  readonly workspaceManager: Pick<LoopGitWorkspaceManager, "inspect">;
  readonly artifactStore: Pick<LoopArtifactStore, "read" | "put">;
  readonly gitExecutableId: string;
  readonly ghExecutableId: string;
  readonly commitAuthorName: string;
  readonly commitAuthorEmail: string;
  readonly defaultCommandTimeoutMs?: number;
  readonly maxCommandOutputBytes?: number;
  readonly maxDeliveryArtifactBytes?: number;
  readonly maxIntentArtifactBytes?: number;
  readonly maxResultArtifactBytes?: number;
  readonly maxTotalDurationMs?: number;
  readonly clock?: Readonly<{ nowMs(): number }>;
}

export interface LoopDeliveryPublishTraceEntry {
  readonly sequence: number;
  readonly stage: string;
  readonly outcome: string;
  readonly artifactRef: string | null;
  readonly commitSha: string | null;
  readonly remoteBranchSha: string | null;
  readonly prNumber: number | null;
  readonly elapsedMs: number;
}

export interface LoopDeliveryPublishResult {
  readonly status: LoopDeliveryPublishStatus;
  readonly reasonCode: LoopDeliveryPublishReasonCode;
  readonly safeMessage: string;
  readonly causeCode?: string;
  readonly recoveryStage: LoopDeliveryPublishRecoveryStage;
  readonly deliveryResultArtifactRef: string;
  readonly publishIntentArtifactRef?: string;
  readonly publishResultArtifactRef?: string;
  readonly precommitHeadSha?: string;
  readonly commitSha?: string;
  readonly remoteBranchSha?: string;
  readonly prNumber?: number;
  readonly prUrl?: string;
  readonly files: readonly string[];
  readonly commitCreated: boolean;
  readonly commitRecovered: boolean;
  readonly pushCreated: boolean;
  readonly pushRecovered: boolean;
  readonly prCreated: boolean;
  readonly prRecovered: boolean;
  readonly prBodySha256?: string;
  readonly elapsedMs: number;
  readonly trace: readonly LoopDeliveryPublishTraceEntry[];
}

// ═══════════════════════════════════════ Constants

const MAX_SAFE_MESSAGE = 256;
const NON_CONTROL_RE = /[\x00-\x1f\x7f-\x9f]/;
const SHA40_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const ARTIFACT_REF_RE = /^loop-artifact:v1:([a-z_]+):sha256:([0-9a-f]{64})$/;
const GH_SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const NUL = "\x00";

const DEFAULT_DTO = 120000;
const DEFAULT_MCO = 1048576;
const DEFAULT_MDA = 131072;
const DEFAULT_MIA = 32768;
const DEFAULT_MRA = 65536;
const DEFAULT_MTD = 1800000;

const MIN_TO = 100;
const MAX_TO = 600000;
const MIN_OUT = 1;
const MAX_OUT = 16777216;
const MIN_ART = 1;
const MAX_ART = 16777216;
const MIN_TD = 1000;
const MAX_TD = 3600000;

const OPTION_KEYS = [
  "runner", "workspaceManager", "artifactStore",
  "gitExecutableId", "ghExecutableId",
  "commitAuthorName", "commitAuthorEmail",
  "defaultCommandTimeoutMs", "maxCommandOutputBytes",
  "maxDeliveryArtifactBytes", "maxIntentArtifactBytes",
  "maxResultArtifactBytes", "maxTotalDurationMs", "clock",
];

const REQUEST_KEYS = [
  "identity", "deliveryResultArtifactRef",
  "commitSubject", "prTitle",
  "recoveryPublishIntentArtifactRef",
];

// D06 delivery result fields (canonical)
const DELIVERY_RESULT_KEYS = [
  "schema", "status", "reason_code", "cause_code",
  "total_fix_rounds", "test_attempts", "review_attempts",
  "patch_artifact_refs", "test_summary_artifact_refs",
  "review_summary_artifact_refs", "files", "final_workspace",
  "elapsed_ms", "trace",
];

const FINAL_WORKSPACE_KEYS = [
  "workspace_path", "task_branch", "task_head_sha",
  "status_digest_sha256", "task_has_changes",
];

const TRACE_ENTRY_KEYS = [
  "sequence", "kind", "phase", "fix_round", "attempt",
  "step_id", "outcome", "artifact_ref", "patch_artifact_ref",
  "patch_digest_sha256", "workspace_status_digest_sha256", "elapsed_ms",
];

const SNAPSHOT_KEYS = [
  "state", "runId", "repository", "repositoryPath", "controlRoot",
  "gitCommonDir", "workspacePath", "baseBranch", "expectedBaseSha",
  "currentBaseSha", "baseDrifted", "taskBranch", "taskHeadSha",
  "taskHasChanges", "taskStatusDigestSha256",
  "sourceHeadSha", "sourceBranch", "sourceWipDigestSha256",
];

const RUNNER_RESULT_KEYS = [
  "status", "exitCode", "signal", "durationMs",
  "stdout", "stderr", "stdoutBytesReceived", "stderrBytesReceived",
  "stdoutTruncated", "stderrTruncated", "termSignalSent", "killSignalSent",
];

const STORED_ARTIFACT_KEYS = ["artifactRef", "kind", "digest", "sizeBytes"];

const PUBLISH_TRACE_STAGES = [
  "delivery", "workspace", "staging", "intent", "commit", "push", "draft_pr", "terminal",
];

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

// D02 canonical codes
const D02_CANONICAL_CODES = new Set<string>([
  "INVALID_INPUT", "UNSUPPORTED_PLATFORM", "EXECUTABLE_NOT_ALLOWED",
  "EXECUTABLE_INVALID", "EXECUTABLE_CHANGED", "CWD_NOT_ALLOWED",
  "CWD_INVALID", "ENV_NOT_ALLOWED", "PROCESS_SPAWN_FAILED",
  "PROCESS_IO_FAILED", "PROCESS_CLEANUP_FAILED",
]);

// Platform signals
const PLATFORM_SIGNALS: Set<string> = (() => {
  const s = new Set<string>(["SIGTERM", "SIGKILL", "SIGINT", "SIGHUP", "SIGQUIT",
    "SIGILL", "SIGTRAP", "SIGABRT", "SIGFPE", "SIGBUS", "SIGSEGV",
    "SIGPIPE", "SIGALRM", "SIGUSR1", "SIGUSR2", "SIGCHLD",
    "SIGCONT", "SIGSTOP", "SIGTSTP", "SIGTTIN", "SIGTTOU"]);
  return s;
})();

// ═══════════════════════════════════════ Helpers

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function safeMessage(msg: string): string {
  return msg.replace(NON_CONTROL_RE, " ").slice(0, MAX_SAFE_MESSAGE);
}

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
    if (!allowed.includes(k)) throw new Error(`${label} has unknown key`);
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

function copyArray(v: unknown, label: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`${label} must be an array`);
  return [...v];
}

function copyStringRecord(v: unknown, label: string): Record<string, unknown> {
  const rec = scanPlain(v, Object.keys(v as object), label);
  return { ...rec };
}

function asNonEmptyString(v: unknown, label: string, noControl: boolean): string {
  if (typeof v !== "string") throw new Error(`${label} must be a string`);
  const trimmed = v.trim();
  if (trimmed.length === 0 || trimmed !== v) throw new Error(`${label} must be trimmed non-empty`);
  if (noControl && NON_CONTROL_RE.test(v)) throw new Error(`${label} must not contain control chars`);
  return v;
}

function asSafeInt(v: unknown, min: number, max: number, label: string): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max) {
    throw new Error(`${label} out of range`);
  }
  return v;
}

function asBoolean(v: unknown, label: string): boolean {
  if (typeof v !== "boolean") throw new Error(`${label} must be boolean`);
  return v;
}

function validateArtifactRef(ref: unknown, expectedKind: string | null, label: string): string {
  const s = asNonEmptyString(ref, label, false);
  const m = ARTIFACT_REF_RE.exec(s);
  if (!m) throw new Error(`${label} must match loop-artifact:v1 format`);
  if (expectedKind !== null && m[1] !== expectedKind) throw new Error(`${label} kind must be ${expectedKind}`);
  return s;
}

function validateRepository(repo: string): void {
  if (!GH_SLUG_RE.test(repo)) throw new Error("repository must be owner/repository format");
}

function validateCommitSubject(s: string): void {
  const b = Buffer.byteLength(s, "utf8");
  if (b < 1 || b > 72) throw new Error("commitSubject UTF-8 length must be 1–72 bytes");
  if (s.includes("\x00") || s.includes("\r") || s.includes("\n") || s.includes("\ufffd")) {
    throw new Error("commitSubject must not contain NUL, CR, LF, or U+FFFD");
  }
}

function validatePrTitle(s: string): void {
  const b = Buffer.byteLength(s, "utf8");
  if (b < 1 || b > 128) throw new Error("prTitle UTF-8 length must be 1–128 bytes");
  if (s.includes("\x00") || s.includes("\r") || s.includes("\n") || s.includes("\ufffd")) {
    throw new Error("prTitle must not contain control chars, CR, LF, or U+FFFD");
  }
  if (NON_CONTROL_RE.test(s)) throw new Error("prTitle must not contain control chars");
}

function validateAuthorName(s: string): void {
  const b = Buffer.byteLength(s, "utf8");
  if (b > 128) throw new Error("author name UTF-8 length must be <= 128 bytes");
  if (NON_CONTROL_RE.test(s.replace(/[\x00-\x1f\x7f]/g, "")) || s.includes("\x00") || s.includes("\r") || s.includes("\n")) {
    // Already checked — control chars not allowed
  }
  // We check that it's trimmed and has no control chars
  const trimmed = s.trim();
  if (trimmed.length === 0 || trimmed !== s) throw new Error("author name must be trimmed non-empty");
  if (NON_CONTROL_RE.test(s)) throw new Error("author name must not contain control chars");
}

function validateAuthorEmail(s: string): void {
  const b = Buffer.byteLength(s, "utf8");
  if (b > 254) throw new Error("author email UTF-8 length must be <= 254 bytes");
  const trimmed = s.trim();
  if (trimmed.length === 0 || trimmed !== s) throw new Error("author email must be trimmed non-empty");
  if (NON_CONTROL_RE.test(s)) throw new Error("author email must not contain control chars");
  const atIdx = s.indexOf("@");
  if (atIdx <= 0 || atIdx >= s.length - 1) throw new Error("author email must contain @ not at start or end");
}

// ═══════════════════════════════════════ Validators

function validateStoredArtifact(
  value: unknown, expectedKind: string, expectedDigest: string, expectedSizeBytes: number,
): { ok: true } | { ok: false; reason: string } {
  let a: Record<string, unknown>;
  try {
    a = scanPlain(value, STORED_ARTIFACT_KEYS, "stored artifact");
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
  if (a.kind !== expectedKind) return { ok: false, reason: "kind mismatch" };
  if (typeof a.digest !== "string" || !SHA256_RE.test(a.digest)) return { ok: false, reason: "invalid digest" };
  if (a.digest !== expectedDigest) return { ok: false, reason: "digest mismatch" };
  if (typeof a.sizeBytes !== "number" || !Number.isSafeInteger(a.sizeBytes) || a.sizeBytes < 0) {
    return { ok: false, reason: "invalid sizeBytes" };
  }
  if (a.sizeBytes !== expectedSizeBytes) return { ok: false, reason: "sizeBytes mismatch" };
  const expectedRef = `loop-artifact:v1:${expectedKind}:sha256:${expectedDigest}`;
  if (typeof a.artifactRef !== "string" || a.artifactRef !== expectedRef) return { ok: false, reason: "artifactRef mismatch" };
  return { ok: true };
}

function validateRunnerResult(
  result: unknown, maxStdoutBytes: number, maxStderrBytes: number,
): { ok: true } | { ok: false; reason: string } {
  let r: Record<string, unknown>;
  try {
    r = scanPlain(result, RUNNER_RESULT_KEYS, "runner result");
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
  for (const key of RUNNER_RESULT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(r, key)) {
      return { ok: false, reason: `missing field: ${key}` };
    }
  }
  if (r.status !== "exited" && r.status !== "timed_out") return { ok: false, reason: "invalid status" };
  const ec = r.exitCode;
  if (ec !== null && (ec === undefined || typeof ec !== "number" || !Number.isSafeInteger(ec))) {
    return { ok: false, reason: "invalid exitCode" };
  }
  const sig = r.signal;
  if (sig !== null) {
    if (sig === undefined || typeof sig !== "string" || !PLATFORM_SIGNALS.has(sig)) {
      return { ok: false, reason: "invalid signal" };
    }
  }
  if (typeof r.durationMs !== "number" || !Number.isSafeInteger(r.durationMs) || r.durationMs < 0) {
    return { ok: false, reason: "invalid durationMs" };
  }
  if (typeof r.stdout !== "string" || typeof r.stderr !== "string") return { ok: false, reason: "stdout/stderr not string" };
  if (typeof r.stdoutBytesReceived !== "number" || !Number.isSafeInteger(r.stdoutBytesReceived) || r.stdoutBytesReceived < 0) {
    return { ok: false, reason: "invalid stdoutBytesReceived" };
  }
  if (typeof r.stderrBytesReceived !== "number" || !Number.isSafeInteger(r.stderrBytesReceived) || r.stderrBytesReceived < 0) {
    return { ok: false, reason: "invalid stderrBytesReceived" };
  }
  if (typeof r.stdoutTruncated !== "boolean" || typeof r.stderrTruncated !== "boolean") {
    return { ok: false, reason: "truncated not boolean" };
  }
  if (typeof r.termSignalSent !== "boolean" || typeof r.killSignalSent !== "boolean") {
    return { ok: false, reason: "signal flags not boolean" };
  }
  const retainedOut = Buffer.byteLength(r.stdout as string, "utf8");
  const retainedErr = Buffer.byteLength(r.stderr as string, "utf8");
  if (retainedOut > maxStdoutBytes) return { ok: false, reason: "stdout exceeds max" };
  if (retainedErr > maxStderrBytes) return { ok: false, reason: "stderr exceeds max" };
  if ((r.stdoutBytesReceived as number) < retainedOut) return { ok: false, reason: "stdoutBytesReceived < retained" };
  if ((r.stderrBytesReceived as number) < retainedErr) return { ok: false, reason: "stderrBytesReceived < retained" };
  return { ok: true };
}

function isTypedRunnerError(e: unknown): e is LoopPosixProcessRunnerError {
  if (!(e instanceof Error)) return false;
  if (e.name !== "LoopPosixProcessRunnerError") return false;
  const code = (e as LoopPosixProcessRunnerError).code;
  if (typeof code !== "string" || !D02_CANONICAL_CODES.has(code)) return false;
  return true;
}

function validateWorkspaceSnapshot(
  value: unknown,
): { ok: true; value: LoopGitWorkspaceSnapshot } | { ok: false; reason: string } {
  let s: Record<string, unknown>;
  try {
    s = scanPlain(value, SNAPSHOT_KEYS, "workspace snapshot");
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
  if (s.state !== "created" && s.state !== "recovered" && s.state !== "inspected") {
    return { ok: false, reason: "invalid state" };
  }
  if (typeof s.runId !== "string" || s.runId.trim().length === 0) return { ok: false, reason: "invalid runId" };
  if (typeof s.repository !== "string" || s.repository.trim().length === 0) return { ok: false, reason: "invalid repository" };
  if (typeof s.repositoryPath !== "string" || s.repositoryPath.trim().length === 0) return { ok: false, reason: "invalid repositoryPath" };
  if (typeof s.controlRoot !== "string" || s.controlRoot.trim().length === 0) return { ok: false, reason: "invalid controlRoot" };
  if (typeof s.gitCommonDir !== "string") return { ok: false, reason: "invalid gitCommonDir" };
  if (typeof s.workspacePath !== "string" || s.workspacePath.trim().length === 0) return { ok: false, reason: "invalid workspacePath" };
  if (typeof s.baseBranch !== "string" || s.baseBranch.trim().length === 0) return { ok: false, reason: "invalid baseBranch" };
  if (typeof s.expectedBaseSha !== "string" || !SHA40_RE.test(s.expectedBaseSha)) return { ok: false, reason: "invalid expectedBaseSha" };
  if (typeof s.currentBaseSha !== "string" || !SHA40_RE.test(s.currentBaseSha)) return { ok: false, reason: "invalid currentBaseSha" };
  if (typeof s.baseDrifted !== "boolean") return { ok: false, reason: "invalid baseDrifted" };
  if (typeof s.taskBranch !== "string" || s.taskBranch.trim().length === 0) return { ok: false, reason: "invalid taskBranch" };
  if (typeof s.taskHeadSha !== "string" || !SHA40_RE.test(s.taskHeadSha)) return { ok: false, reason: "invalid taskHeadSha" };
  if (typeof s.taskHasChanges !== "boolean") return { ok: false, reason: "invalid taskHasChanges" };
  if (typeof s.taskStatusDigestSha256 !== "string" || !SHA256_RE.test(s.taskStatusDigestSha256)) {
    return { ok: false, reason: "invalid taskStatusDigestSha256" };
  }
  if (typeof s.sourceHeadSha !== "string" || !SHA40_RE.test(s.sourceHeadSha)) return { ok: false, reason: "invalid sourceHeadSha" };
  if (s.sourceBranch !== null && typeof s.sourceBranch !== "string") return { ok: false, reason: "invalid sourceBranch" };
  if (typeof s.sourceWipDigestSha256 !== "string" || !SHA256_RE.test(s.sourceWipDigestSha256)) {
    return { ok: false, reason: "invalid sourceWipDigestSha256" };
  }
  return { ok: true, value: s as unknown as LoopGitWorkspaceSnapshot };
}

// ═══════════════════════════════════════ Internal State

interface InternalState {
  // Request snapshot
  readonly request: LoopDeliveryPublishRequest;
  readonly options: LoopDeliveryPublisherOptions;
  // Start time
  readonly startMs: number;
  // Trace
  trace: LoopDeliveryPublishTraceEntry[];
  traceSeq: number;
  // Stage tracking
  recoveryStage: LoopDeliveryPublishRecoveryStage;
  // Source observation (fixed after first inspect)
  sourceHeadSha: string | null;
  sourceBranch: string | null;
  sourceWipDigestSha256: string | null;
  currentBaseSha: string | null;
  // Delivery artifact binding
  deliveryResult: Record<string, unknown> | null;
  deliveryFiles: string[] | null;
  deliveryFinalWorkspace: Record<string, unknown> | null;
  // Workspace binding
  workspacePath: string | null;
  precommitHeadSha: string | null;
  precommitStatusDigestSha256: string | null;
  // Staging
  stagedTreeSha: string | null;
  // Intent
  publishIntentBytes: Buffer | null;
  publishIntentArtifactRef: string | null;
  // Commit
  commitSha: string | null;
  commitCreated: boolean;
  commitRecovered: boolean;
  commitAttempted: boolean;
  // Push
  remoteBranchSha: string | null;
  pushCreated: boolean;
  pushRecovered: boolean;
  pushAttempted: boolean;
  // PR
  prNumber: number | null;
  prUrl: string | null;
  prCreated: boolean;
  prRecovered: boolean;
  prCreateAttempted: boolean;
  prBodySha256: string | null;
  // Clock
  lastClockMs: number;
  clockError: boolean;
  // Gate
  deadlineMs: number;
  deadlineGate: "active" | "expired" | "clock_error";
}

// ═══════════════════════════════════════ Publisher

export class LoopDeliveryPublisher {
  private readonly runner: Pick<LoopPosixProcessRunner, "run">;
  private readonly workspaceManager: Pick<LoopGitWorkspaceManager, "inspect">;
  private readonly artifactStore: Pick<LoopArtifactStore, "read" | "put">;
  private readonly gitExecutableId: string;
  private readonly ghExecutableId: string;
  private readonly commitAuthorName: string;
  private readonly commitAuthorEmail: string;
  private readonly defaultCommandTimeoutMs: number;
  private readonly maxCommandOutputBytes: number;
  private readonly maxDeliveryArtifactBytes: number;
  private readonly maxIntentArtifactBytes: number;
  private readonly maxResultArtifactBytes: number;
  private readonly maxTotalDurationMs: number;
  private readonly clock?: Readonly<{ nowMs(): number }>;

  constructor(options: LoopDeliveryPublisherOptions) {
    // Validate options with plain data scan
    let opts: Record<string, unknown>;
    try {
      opts = scanPlain(options, OPTION_KEYS, "options");
    } catch (e) {
      throw new Error(safeMessage(`Publisher: ${(e as Error).message}`));
    }

    // runner
    const rv = opts.runner;
    if (!rv || typeof (rv as any).run !== "function") {
      throw new Error(safeMessage("Publisher: runner missing run"));
    }
    this.runner = rv as Pick<LoopPosixProcessRunner, "run">;

    // workspaceManager
    const wm = opts.workspaceManager;
    if (!wm || typeof (wm as any).inspect !== "function") {
      throw new Error(safeMessage("Publisher: workspaceManager missing inspect"));
    }
    this.workspaceManager = wm as Pick<LoopGitWorkspaceManager, "inspect">;

    // artifactStore
    const ast = opts.artifactStore;
    if (!ast || typeof (ast as any).read !== "function" || typeof (ast as any).put !== "function") {
      throw new Error(safeMessage("Publisher: artifactStore missing read/put"));
    }
    this.artifactStore = ast as Pick<LoopArtifactStore, "read" | "put">;

    // String options
    this.gitExecutableId = asNonEmptyString(opts.gitExecutableId, "gitExecutableId", false);
    this.ghExecutableId = asNonEmptyString(opts.ghExecutableId, "ghExecutableId", false);

    // Author
    const an = asNonEmptyString(opts.commitAuthorName, "commitAuthorName", false);
    validateAuthorName(an);
    this.commitAuthorName = an;

    const ae = asNonEmptyString(opts.commitAuthorEmail, "commitAuthorEmail", false);
    validateAuthorEmail(ae);
    this.commitAuthorEmail = ae;

    // Numeric options with defaults and bounds
    this.defaultCommandTimeoutMs = asSafeInt(
      opts.defaultCommandTimeoutMs ?? DEFAULT_DTO, MIN_TO, MAX_TO, "defaultCommandTimeoutMs");
    this.maxCommandOutputBytes = asSafeInt(
      opts.maxCommandOutputBytes ?? DEFAULT_MCO, MIN_OUT, MAX_OUT, "maxCommandOutputBytes");
    this.maxDeliveryArtifactBytes = asSafeInt(
      opts.maxDeliveryArtifactBytes ?? DEFAULT_MDA, MIN_ART, MAX_ART, "maxDeliveryArtifactBytes");
    this.maxIntentArtifactBytes = asSafeInt(
      opts.maxIntentArtifactBytes ?? DEFAULT_MIA, MIN_ART, MAX_ART, "maxIntentArtifactBytes");
    this.maxResultArtifactBytes = asSafeInt(
      opts.maxResultArtifactBytes ?? DEFAULT_MRA, MIN_ART, MAX_ART, "maxResultArtifactBytes");
    this.maxTotalDurationMs = asSafeInt(
      opts.maxTotalDurationMs ?? DEFAULT_MTD, MIN_TD, MAX_TD, "maxTotalDurationMs");

    // Clock
    if (opts.clock !== undefined && opts.clock !== null) {
      const c = opts.clock;
      if (typeof c !== "object" || c === null || typeof (c as any).nowMs !== "function") {
        throw new Error(safeMessage("Publisher: clock must have nowMs function"));
      }
      this.clock = c as Readonly<{ nowMs(): number }>;
    }
  }

  // ═══════════════════════════════════════ Public: execute

  async execute(request: LoopDeliveryPublishRequest): Promise<LoopDeliveryPublishResult> {
    // Validate request
    let req: Record<string, unknown>;
    try {
      req = scanPlain(request, REQUEST_KEYS, "request");
    } catch (e) {
      return this._zeroStateResult("INVALID_INPUT", (e as Error).message);
    }

    // Validate identity
    try {
      validateLoopRunIdentity(req.identity);
    } catch (e) {
      return this._zeroStateResult("INVALID_INPUT", (e as Error).message);
    }
    const identity = req.identity as LoopRunIdentity;

    // Validate repository format
    try {
      validateRepository(identity.repository);
    } catch (e) {
      return this._zeroStateResult("INVALID_INPUT", (e as Error).message);
    }

    // Validate commitSubject
    let commitSubject: string;
    try {
      commitSubject = asNonEmptyString(req.commitSubject, "commitSubject", false);
      validateCommitSubject(commitSubject);
    } catch (e) {
      return this._zeroStateResult("INVALID_INPUT", (e as Error).message);
    }

    // Validate prTitle
    let prTitle: string;
    try {
      prTitle = asNonEmptyString(req.prTitle, "prTitle", false);
      validatePrTitle(prTitle);
    } catch (e) {
      return this._zeroStateResult("INVALID_INPUT", (e as Error).message);
    }

    // Validate deliveryResultArtifactRef
    let deliveryArtifactRef: string;
    try {
      deliveryArtifactRef = validateArtifactRef(req.deliveryResultArtifactRef, "delivery_result", "deliveryResultArtifactRef");
    } catch (e) {
      return this._zeroStateResult("INVALID_INPUT", (e as Error).message);
    }

    // Validate recoveryPublishIntentArtifactRef if provided
    let recoveryIntentRef: string | undefined;
    if (req.recoveryPublishIntentArtifactRef !== undefined && req.recoveryPublishIntentArtifactRef !== null) {
      try {
        recoveryIntentRef = validateArtifactRef(
          req.recoveryPublishIntentArtifactRef, "workspace_metadata", "recoveryPublishIntentArtifactRef");
      } catch (e) {
        return this._zeroStateResult("INVALID_INPUT", (e as Error).message);
      }
    }

    // Clock init
    const startMs = this._nowMs();
    if (startMs === null) {
      return this._zeroStateResult("INTERNAL_ERROR", "clock error at start");
    }

    const deadlineMs = startMs + this.maxTotalDurationMs;

    // Build internal state
    const state: InternalState = {
      request: freeze({
        identity,
        deliveryResultArtifactRef: deliveryArtifactRef,
        commitSubject,
        prTitle,
        recoveryPublishIntentArtifactRef: recoveryIntentRef,
      }),
      options: freeze({
        runner: this.runner,
        workspaceManager: this.workspaceManager,
        artifactStore: this.artifactStore,
        gitExecutableId: this.gitExecutableId,
        ghExecutableId: this.ghExecutableId,
        commitAuthorName: this.commitAuthorName,
        commitAuthorEmail: this.commitAuthorEmail,
        defaultCommandTimeoutMs: this.defaultCommandTimeoutMs,
        maxCommandOutputBytes: this.maxCommandOutputBytes,
        maxDeliveryArtifactBytes: this.maxDeliveryArtifactBytes,
        maxIntentArtifactBytes: this.maxIntentArtifactBytes,
        maxResultArtifactBytes: this.maxResultArtifactBytes,
        maxTotalDurationMs: this.maxTotalDurationMs,
        clock: this.clock,
      }),
      startMs,
      trace: [],
      traceSeq: 0,
      recoveryStage: "not_started",
      sourceHeadSha: null,
      sourceBranch: null,
      sourceWipDigestSha256: null,
      currentBaseSha: null,
      deliveryResult: null,
      deliveryFiles: null,
      deliveryFinalWorkspace: null,
      workspacePath: null,
      precommitHeadSha: null,
      precommitStatusDigestSha256: null,
      stagedTreeSha: null,
      publishIntentBytes: null,
      publishIntentArtifactRef: null,
      commitSha: null,
      commitCreated: false,
      commitRecovered: false,
      commitAttempted: false,
      remoteBranchSha: null,
      pushCreated: false,
      pushRecovered: false,
      pushAttempted: false,
      prNumber: null,
      prUrl: null,
      prCreated: false,
      prRecovered: false,
      prCreateAttempted: false,
      prBodySha256: null,
      lastClockMs: startMs,
      clockError: false,
      deadlineMs,
      deadlineGate: "active",
    };

    // Execute state machine
    let result: LoopDeliveryPublishResult;
    try {
      result = await this._executeStateMachine(state);
    } catch (e) {
      // Catch-all: terminalize with INTERNAL_ERROR
      result = await this._terminalize(state, "INTERNAL_ERROR", safeMessage("unexpected publisher error"), null);
    }

    return result;
  }

  // ═══════════════════════════════════════ State Machine

  private async _executeStateMachine(state: InternalState): Promise<LoopDeliveryPublishResult> {
    // Phase 1: Read and validate delivery artifact
    const deliveryOutcome = await this._phaseDelivery(state);
    if (deliveryOutcome !== null) return deliveryOutcome;

    // Phase 2: Inspect workspace
    const wsOutcome = await this._phaseWorkspace(state);
    if (wsOutcome !== null) return wsOutcome;

    // Phase 3: Remote base gate (pre-intent)
    const baseOutcome = await this._phaseRemoteBaseGate(state);
    if (baseOutcome !== null) return baseOutcome;

    // Phase 4: Exact change staging gate
    // D03 reconciliation before staging
    const preStagingReconcile = await this._reconcileD03(state);
    if (preStagingReconcile !== null) return preStagingReconcile;

    const stagingOutcome = await this._phaseStaging(state);
    if (stagingOutcome !== null) return stagingOutcome;

    // D03 reconciliation after staging
    const postStagingReconcile = await this._reconcileD03(state);
    if (postStagingReconcile !== null) return postStagingReconcile;

    // Phase 5: Canonical publish intent
    const intentOutcome = await this._phaseIntent(state);
    if (intentOutcome !== null) return intentOutcome;

    // D03 reconciliation after intent
    const postIntentReconcile = await this._reconcileD03(state);
    if (postIntentReconcile !== null) return postIntentReconcile;

    // Phase 6: Commit
    const commitOutcome = await this._phaseCommit(state);
    if (commitOutcome !== null) return commitOutcome;

    // D03 reconciliation after commit
    const postCommitReconcile = await this._reconcileD03(state);
    if (postCommitReconcile !== null) return postCommitReconcile;

    // Phase 7: Remote base gate (pre-push)
    const prePushBaseOutcome = await this._phaseRemoteBaseGate(state);
    if (prePushBaseOutcome !== null) return prePushBaseOutcome;

    // Phase 8: Push
    const pushOutcome = await this._phasePush(state);
    if (pushOutcome !== null) return pushOutcome;

    // D03 reconciliation after push
    const postPushReconcile = await this._reconcileD03(state);
    if (postPushReconcile !== null) return postPushReconcile;

    // Phase 9: Remote base gate (pre-PR)
    const prePrBaseOutcome = await this._phaseRemoteBaseGate(state);
    if (prePrBaseOutcome !== null) return prePrBaseOutcome;

    // Phase 10: Draft PR
    const prOutcome = await this._phasePr(state);
    if (prOutcome !== null) return prOutcome;

    // Terminalize success
    // Final D03 reconciliation before terminal success
    const finalReconcile = await this._reconcileD03(state);
    if (finalReconcile !== null) return finalReconcile;

    // Clock/deadline gate before terminal
    const finalGateResult = this._checkGate(state);
    if (finalGateResult !== null) return finalGateResult;

    return await this._terminalize(state, "PUBLISH_SUCCEEDED", safeMessage("publish completed"), "completed");
  }

  // ═══════════════════════════════════════ Phase: Delivery Artifact

  private async _phaseDelivery(state: InternalState): Promise<LoopDeliveryPublishResult | null> {
    const gateResult = this._checkGate(state);
    if (gateResult !== null) return gateResult;

    const t0 = this._nowMsChecked(state);

    // Read delivery artifact
    let deliveryBytes: Buffer;
    try {
      deliveryBytes = this.artifactStore.read(state.request.deliveryResultArtifactRef);
    } catch (e) {
      return await this._terminalize(state, "ARTIFACT_STORE_FAILED", safeMessage("failed to read delivery artifact"), null);
    }

    if (deliveryBytes.length > this.maxDeliveryArtifactBytes) {
      return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("delivery artifact too large"), null);
    }

    // Verify digest from artifact ref against actual bytes
    const actualDigest = sha256Hex(deliveryBytes);
    const refMatch = ARTIFACT_REF_RE.exec(state.request.deliveryResultArtifactRef);
    if (refMatch && refMatch[2] !== actualDigest) {
      return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("delivery artifact digest mismatch"), null);
    }

    // Verify byte length against ref metadata (ref contains digest only, not length)
    // The byte length is verified implicitly by validation

    // Verify bytes: no BOM, no CR, no NUL, single trailing LF
    const deliveryStr = deliveryBytes.toString("utf8");
    if (deliveryStr.includes("\x00") || deliveryStr.includes("\r")) {
      return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("delivery artifact has NUL or CR"), null);
    }
    if (deliveryBytes[0] === 0xef && deliveryBytes[1] === 0xbb && deliveryBytes[2] === 0xbf) {
      return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("delivery artifact has BOM"), null);
    }
    if (!deliveryStr.endsWith("\n")) {
      return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("delivery artifact missing trailing LF"), null);
    }
    if (deliveryStr.endsWith("\n\n")) {
      return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("delivery artifact has extra trailing LF"), null);
    }

    // Parse JSON
    let deliveryObj: unknown;
    try {
      deliveryObj = JSON.parse(deliveryStr);
    } catch {
      return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("delivery artifact not valid JSON"), null);
    }

    // Validate canonical fields
    let dr: Record<string, unknown>;
    try {
      dr = scanPlain(deliveryObj, DELIVERY_RESULT_KEYS, "delivery result");
    } catch (e) {
      return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage((e as Error).message), null);
    }

    // Schema
    if (dr.schema !== "loop-delivery-result-v1") {
      return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("wrong delivery schema"), null);
    }

    // Status
    if (dr.status !== "succeeded") {
      return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("delivery not succeeded"), null);
    }

    // Reason code
    if (dr.reason_code !== "DELIVERY_SUCCEEDED") {
      return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("delivery reason not succeeded"), null);
    }

    // Cause code must be null
    if (dr.cause_code !== null) {
      return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("delivery has cause code"), null);
    }

    // Final workspace
    const fw = dr.final_workspace;
    if (fw === null || fw === undefined || typeof fw !== "object") {
      return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("delivery missing final workspace"), null);
    }

    let finalWs: Record<string, unknown>;
    try {
      finalWs = scanPlain(fw, FINAL_WORKSPACE_KEYS, "final_workspace");
    } catch (e) {
      return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage((e as Error).message), null);
    }

    if (finalWs.task_has_changes !== true) {
      return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("delivery task_has_changes not true"), null);
    }

    // Files
    const files = dr.files;
    if (!Array.isArray(files) || files.length === 0) {
      return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("delivery files empty or not array"), null);
    }

    const fileList: string[] = [];
    for (const f of files) {
      if (typeof f !== "string") {
        return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("delivery file not string"), null);
      }
      const trimmed = f.trim();
      if (trimmed.length === 0 || trimmed !== f) {
        return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("delivery file not trimmed"), null);
      }
      // No absolute, ., .., NUL, backslash, empty segment
      if (f.startsWith("/")) return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("delivery file absolute"), null);
      if (f.includes("\x00")) return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("delivery file has NUL"), null);
      if (f.includes("\\")) return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("delivery file has backslash"), null);
      const segments = f.split("/");
      for (const seg of segments) {
        if (seg.length === 0 || seg === "." || seg === "..") {
          return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("delivery file bad segment"), null);
        }
      }
      fileList.push(f);
    }

    // Check files sorted and unique
    for (let i = 1; i < fileList.length; i++) {
      if (fileList[i]! <= fileList[i - 1]!) {
        return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("delivery files not sorted/unique"), null);
      }
    }

    // Trace validation
    const trace = dr.trace;
    if (!Array.isArray(trace) || trace.length === 0) {
      return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("delivery trace missing"), null);
    }

    const traceEntries: Record<string, unknown>[] = [];
    for (const te of trace) {
      let entry: Record<string, unknown>;
      try {
        entry = scanPlain(te, TRACE_ENTRY_KEYS, "trace entry");
      } catch (e) {
        return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage((e as Error).message), null);
      }
      traceEntries.push(entry);
    }

    // Trace sequence from 1, contiguous
    for (let i = 0; i < traceEntries.length; i++) {
      const seq = traceEntries[i]!.sequence;
      if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq !== i + 1) {
        return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("trace sequence not contiguous"), null);
      }
    }

    // Exactly one terminal, last entry
    let terminalCount = 0;
    let lastIsTerminal = false;
    for (let i = 0; i < traceEntries.length; i++) {
      if (traceEntries[i]!.kind === "terminal") {
        terminalCount++;
        if (i === traceEntries.length - 1) lastIsTerminal = true;
      }
    }
    if (terminalCount !== 1 || !lastIsTerminal) {
      return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("trace terminal not single/last"), null);
    }

    // Terminal outcome must be succeeded
    const terminalEntry = traceEntries[traceEntries.length - 1]!;
    if (terminalEntry.outcome !== "succeeded") {
      return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("trace terminal not succeeded"), null);
    }

    // Verify workspace digest consistency
    if (terminalEntry.workspace_status_digest_sha256 !== finalWs.status_digest_sha256) {
      return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("workspace digest mismatch"), null);
    }

    // Canonical reserialization check
    // Build in exact D06 property order and compare
    const reorderObj: Record<string, unknown> = Object.create(null);
    reorderObj.schema = "loop-delivery-result-v1";
    reorderObj.status = dr.status;
    reorderObj.reason_code = dr.reason_code;
    reorderObj.cause_code = dr.cause_code;
    reorderObj.total_fix_rounds = dr.total_fix_rounds;
    reorderObj.test_attempts = dr.test_attempts;
    reorderObj.review_attempts = dr.review_attempts;
    reorderObj.patch_artifact_refs = [...(dr.patch_artifact_refs as unknown[])];
    reorderObj.test_summary_artifact_refs = [...(dr.test_summary_artifact_refs as unknown[])];
    reorderObj.review_summary_artifact_refs = [...(dr.review_summary_artifact_refs as unknown[])];
    reorderObj.files = [...fileList];
    reorderObj.final_workspace = {
      workspace_path: finalWs.workspace_path,
      task_branch: finalWs.task_branch,
      task_head_sha: finalWs.task_head_sha,
      status_digest_sha256: finalWs.status_digest_sha256,
      task_has_changes: finalWs.task_has_changes,
    };
    reorderObj.elapsed_ms = dr.elapsed_ms;
    reorderObj.trace = traceEntries.map((te) => ({
      sequence: te.sequence,
      kind: te.kind,
      phase: te.phase,
      fix_round: te.fix_round,
      attempt: te.attempt,
      step_id: te.step_id,
      outcome: te.outcome,
      artifact_ref: te.artifact_ref,
      patch_artifact_ref: te.patch_artifact_ref,
      patch_digest_sha256: te.patch_digest_sha256,
      workspace_status_digest_sha256: te.workspace_status_digest_sha256,
      elapsed_ms: te.elapsed_ms,
    }));

    const reSerialized = JSON.stringify(reorderObj) + "\n";
    if (reSerialized !== deliveryStr) {
      return await this._terminalize(state, "DELIVERY_NOT_READY", safeMessage("delivery artifact not canonical"), null);
    }

    // Store delivery binding
    state.deliveryResult = deepFreeze(reorderObj);
    state.deliveryFiles = freeze(fileList) as unknown as string[];
    state.deliveryFinalWorkspace = freeze({
      workspace_path: finalWs.workspace_path,
      task_branch: finalWs.task_branch,
      task_head_sha: finalWs.task_head_sha,
      status_digest_sha256: finalWs.status_digest_sha256,
      task_has_changes: finalWs.task_has_changes,
    });

    const elapsed = Math.max(0, this._nowMsChecked(state) - t0);
    this._addTrace(state, "delivery", "succeeded", null, null, null, null, elapsed);
    state.recoveryStage = "delivery_verified";

    return null;
  }

  // ═══════════════════════════════════════ Phase: Workspace

  private async _phaseWorkspace(state: InternalState): Promise<LoopDeliveryPublishResult | null> {
    const gateResult = this._checkGate(state);
    if (gateResult !== null) return gateResult;

    const t0 = this._nowMsChecked(state);

    // Inspect workspace
    let snapshot: LoopGitWorkspaceSnapshot;
    try {
      snapshot = await this.workspaceManager.inspect(state.request.identity);
    } catch (e) {
      if (e instanceof Error && e.message.includes("WORKSPACE_DRIFT")) {
        return await this._terminalize(state, "WORKSPACE_DRIFT", safeMessage("workspace drift"), null);
      }
      return await this._terminalize(state, "WORKSPACE_DRIFT", safeMessage("workspace inspect failed"), null);
    }

    // Validate snapshot
    const snapVal = validateWorkspaceSnapshot(snapshot);
    if (!snapVal.ok) {
      return await this._terminalize(state, "DEPENDENCY_RESULT_INVALID", safeMessage((snapVal as { ok: false; reason: string }).reason), null);
    }

    const id = state.request.identity;
    const fw = state.deliveryFinalWorkspace!;

    // Verify binding
    if (snapshot.workspacePath !== fw.workspace_path) {
      return await this._terminalize(state, "WORKSPACE_DRIFT", safeMessage("workspace path mismatch"), null);
    }
    if (snapshot.taskBranch !== id.taskBranch) {
      return await this._terminalize(state, "WORKSPACE_DRIFT", safeMessage("task branch mismatch"), null);
    }
    if (snapshot.runId !== id.runId) {
      return await this._terminalize(state, "WORKSPACE_DRIFT", safeMessage("runId mismatch"), null);
    }
    if (snapshot.repository !== id.repository) {
      return await this._terminalize(state, "WORKSPACE_DRIFT", safeMessage("repository mismatch"), null);
    }
    if (snapshot.repositoryPath !== id.repositoryPath) {
      return await this._terminalize(state, "WORKSPACE_DRIFT", safeMessage("repositoryPath mismatch"), null);
    }
    if (snapshot.currentBaseSha !== id.expectedBaseSha) {
      return await this._terminalize(state, "BASE_BRANCH_DRIFT", safeMessage("base sha drifted"), null);
    }
    if (snapshot.baseDrifted) {
      return await this._terminalize(state, "BASE_BRANCH_DRIFT", safeMessage("base drifted flag set"), null);
    }
    if (snapshot.sourceHeadSha !== id.expectedBaseSha) {
      return await this._terminalize(state, "WORKSPACE_DRIFT", safeMessage("source head sha mismatch"), null);
    }
    if (snapshot.sourceBranch !== id.baseBranch) {
      return await this._terminalize(state, "WORKSPACE_DRIFT", safeMessage("source branch mismatch"), null);
    }

    // Record fixed source observation
    state.workspacePath = snapshot.workspacePath;
    state.sourceHeadSha = snapshot.sourceHeadSha;
    state.sourceBranch = snapshot.sourceBranch;
    state.sourceWipDigestSha256 = snapshot.sourceWipDigestSha256;
    state.currentBaseSha = snapshot.currentBaseSha;

    // Classify workspace start
    const deliveryHead = fw.task_head_sha as string;
    const deliveryStatusDigest = fw.status_digest_sha256 as string;

    const isFresh = state.request.recoveryPublishIntentArtifactRef === undefined;

    if (isFresh) {
      // Fresh: must have changes and HEAD must equal delivery final task HEAD
      if (!snapshot.taskHasChanges) {
        return await this._terminalize(state, "WORKSPACE_STATE_CONFLICT", safeMessage("task has no changes"), null);
      }
      if (snapshot.taskHeadSha !== deliveryHead) {
        return await this._terminalize(state, "WORKSPACE_STATE_CONFLICT", safeMessage("task head not delivery head"), null);
      }
      if (snapshot.taskStatusDigestSha256 !== deliveryStatusDigest) {
        return await this._terminalize(state, "WORKSPACE_STATE_CONFLICT", safeMessage("status digest mismatch"), null);
      }
    } else {
      // Recovery mode: may have taskHasChanges=false if commit already created
      // Verify recovery intent will be done in intent phase
      if (snapshot.taskHeadSha !== deliveryHead) {
        // Could be a prior publish commit — will be checked in commit phase
        if (!SHA40_RE.test(snapshot.taskHeadSha)) {
          return await this._terminalize(state, "WORKSPACE_STATE_CONFLICT", safeMessage("invalid task head"), null);
        }
      }
      // Do NOT reject on taskHasChanges=false in recovery mode
      // In recovery mode, precommitHeadSha should be the delivery's task_head_sha
      // (the original precommit), not the potentially-advanced current HEAD
      state.precommitHeadSha = deliveryHead;
      state.precommitStatusDigestSha256 = deliveryStatusDigest;
    }

    // Only set precommit from snapshot for fresh mode; recovery mode already set above
    if (isFresh) {
      state.precommitHeadSha = snapshot.taskHeadSha;
      state.precommitStatusDigestSha256 = snapshot.taskStatusDigestSha256;
    }

    const elapsed = Math.max(0, this._nowMsChecked(state) - t0);
    this._addTrace(state, "workspace", "succeeded", null, null, null, null, elapsed);

    return null;
  }

  // ═══════════════════════════════════════ Phase: Remote Base Gate

  private async _phaseRemoteBaseGate(state: InternalState): Promise<LoopDeliveryPublishResult | null> {
    const gateResult = this._checkGate(state);
    if (gateResult !== null) return gateResult;

    const id = state.request.identity;

    // Execute git ls-remote
    const result = await this._runGit(
      state,
      ["ls-remote", "--heads", "origin", `refs/heads/${id.baseBranch}`],
      false,
    );

    if (result === null) {
      return await this._terminalize(state, "EXECUTION_BLOCKED", safeMessage("ls-remote failed"), null);
    }

    const stdout = result.stdout.trim();
    const expectedLine = `${id.expectedBaseSha}\trefs/heads/${id.baseBranch}`;

    if (stdout !== expectedLine) {
      return await this._terminalize(state, "BASE_BRANCH_DRIFT", safeMessage("remote base drifted"), null);
    }

    return null;
  }

  // ═══════════════════════════════════════ Phase: Exact Change Staging

  private async _phaseStaging(state: InternalState): Promise<LoopDeliveryPublishResult | null> {
    const gateResult = this._checkGate(state);
    if (gateResult !== null) return gateResult;

    const t0 = this._nowMsChecked(state);
    const deliveryFiles = state.deliveryFiles!;

    // Run git status --porcelain=v1 -z --untracked-files=all
    const statusResult = await this._runGit(
      state,
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      false,
    );
    if (statusResult === null) {
      return await this._terminalize(state, "EXECUTION_BLOCKED", safeMessage("git status failed"), null);
    }

    // Run git diff --name-status -z --no-renames --
    const diffResult = await this._runGit(
      state,
      ["diff", "--name-status", "-z", "--no-renames", "--"],
      false,
    );
    if (diffResult === null) {
      return await this._terminalize(state, "EXECUTION_BLOCKED", safeMessage("git diff failed"), null);
    }

    // Run git diff --cached --name-status -z --no-renames HEAD --
    const cachedDiffResult = await this._runGit(
      state,
      ["diff", "--cached", "--name-status", "-z", "--no-renames", "HEAD", "--"],
      false,
    );
    if (cachedDiffResult === null) {
      return await this._terminalize(state, "EXECUTION_BLOCKED", safeMessage("git diff cached failed"), null);
    }

    // Run git ls-files --others --exclude-standard -z
    const othersResult = await this._runGit(
      state,
      ["ls-files", "--others", "--exclude-standard", "-z"],
      false,
    );
    if (othersResult === null) {
      return await this._terminalize(state, "EXECUTION_BLOCKED", safeMessage("git ls-files failed"), null);
    }

    // Parse all paths from all outputs
    const allPaths = new Set<string>();

    // Parse porcelain status (XY path\0 format)
    const statusStr = statusResult.stdout;
    const statusTokens = statusStr.split("\x00");
    const stLen = statusTokens.length > 0 && statusTokens[statusTokens.length - 1] === "" ? statusTokens.length - 1 : statusTokens.length;
    for (let i = 0; i < stLen; i++) {
      const token = statusTokens[i]!;
      // Porcelain v1 -z: first char is index status, second is worktree status
      // Valid status chars: [ MADRCU?!] for each position
      // Format: "XY path" — space after the 2 status chars, then path
      if (token.length >= 4 && token[1] !== undefined) {
        const x = token[0]!;
        const y = token[1]!;
        if (/[. MADRCU?!]/.test(x) && /[. MADRCU?!]/.test(y) && x !== " " && y !== " ") {
          // Both status chars are valid — this is a status line
          const spaceIdx = token.indexOf(" ");
          if (spaceIdx >= 2 && spaceIdx < token.length - 1) {
            const filePath = token.slice(spaceIdx + 1);
            if (filePath.length > 0 && !filePath.startsWith("/") && !filePath.includes("\\") && !filePath.includes("\x00")) {
              // Reject rename (R) and copy (C) — these have scores
              if (x === "R" || x === "C" || y === "R" || y === "C") continue;
              allPaths.add(filePath);
            }
          }
        }
      }
    }

    // Parse name-status outputs (-z format: status\0path\0)
    // Only A, M, D are allowed. Reject rename (R), copy (C), unmerged (U), unknown (X), type-change (T).
    function parseNameStatusZ(output: string): Set<string> {
      const paths = new Set<string>();
      const parts = output.split("\x00");
      // Last empty token after final NUL is not a token
      const len = parts.length > 0 && parts[parts.length - 1] === "" ? parts.length - 1 : parts.length;
      for (let i = 0; i < len; i++) {
        const part = parts[i]!;
        if (part.length === 1 && /[ACDMRTUX]/.test(part)) {
          // Status letter
          if (/[RCTUX]/.test(part)) {
            // Rename, copy, type-change, unmerged, unknown — all rejected
            // Signal malformed for staging; will be caught downstream
            continue;
          }
          if (i + 1 < len) {
            const pathToken = parts[i + 1]!;
            // Validate path: non-empty, no NUL, no backslash, no absolute
            if (pathToken.length === 0) continue;
            if (pathToken.startsWith("/")) continue;
            if (pathToken.includes("\x00")) continue;
            if (pathToken.includes("\\")) continue;
            // Check for dot segments
            const segs = pathToken.split("/");
            let bad = false;
            for (const seg of segs) {
              if (seg.length === 0 || seg === "." || seg === "..") { bad = true; break; }
            }
            if (bad) continue;
            paths.add(pathToken);
            i++;
          }
        }
      }
      return paths;
    }

    const diffPaths = parseNameStatusZ(diffResult.stdout);
    const cachedPaths = parseNameStatusZ(cachedDiffResult.stdout);
    const othersPaths = new Set(othersResult.stdout.split("\x00").filter(Boolean));

    // Collect all changed paths
    for (const p of diffPaths) allPaths.add(p);
    for (const p of cachedPaths) allPaths.add(p);
    for (const p of othersPaths) allPaths.add(p);

    // Verify exact delivery files
    const expectedSet = new Set(deliveryFiles);
    for (const p of allPaths) {
      if (!expectedSet.has(p)) {
        return await this._terminalize(state, "WORKSPACE_STATE_CONFLICT", safeMessage("extra path in workspace"), null);
      }
    }

    // Stage exact files
    const addArgs = ["-c", "core.hooksPath=/dev/null", "add", "--", ...deliveryFiles];
    const addResult = await this._runGit(state, addArgs, false);
    if (addResult === null || addResult.exitCode !== 0) {
      return await this._terminalize(state, "EXECUTION_BLOCKED", safeMessage("git add failed"), null);
    }

    // Verify after add: unstaged diff empty
    const postDiffResult = await this._runGit(
      state,
      ["diff", "--name-status", "-z", "--no-renames", "--"],
      false,
    );
    if (postDiffResult === null) {
      return await this._terminalize(state, "EXECUTION_BLOCKED", safeMessage("post-add diff failed"), null);
    }
    const postDiffPaths = parseNameStatusZ(postDiffResult.stdout);
    if (postDiffPaths.size > 0) {
      return await this._terminalize(state, "WORKSPACE_STATE_CONFLICT", safeMessage("unstaged changes after add"), null);
    }

    // Verify untracked empty
    const postOthersResult = await this._runGit(
      state,
      ["ls-files", "--others", "--exclude-standard", "-z"],
      false,
    );
    if (postOthersResult === null) {
      return await this._terminalize(state, "EXECUTION_BLOCKED", safeMessage("post-add ls-files failed"), null);
    }
    const postOthersPaths = new Set(postOthersResult.stdout.split("\x00").filter((t) => t.length > 0));
    if (postOthersPaths.size > 0) {
      return await this._terminalize(state, "WORKSPACE_STATE_CONFLICT", safeMessage("untracked files after add"), null);
    }

    // Verify cached exact
    const postCachedResult = await this._runGit(
      state,
      ["diff", "--cached", "--name-status", "-z", "--no-renames", "HEAD", "--"],
      false,
    );
    if (postCachedResult === null) {
      return await this._terminalize(state, "EXECUTION_BLOCKED", safeMessage("post-add cached diff failed"), null);
    }
    const postCachedPaths = parseNameStatusZ(postCachedResult.stdout);

    // Check cached path set equals delivery files
    for (const p of deliveryFiles) {
      if (!postCachedPaths.has(p)) {
        return await this._terminalize(state, "WORKSPACE_STATE_CONFLICT", safeMessage("missing file in staging"), null);
      }
    }
    for (const p of postCachedPaths) {
      if (!expectedSet.has(p)) {
        return await this._terminalize(state, "WORKSPACE_STATE_CONFLICT", safeMessage("extra staged file"), null);
      }
    }

    // Verify git diff --cached --check exit 0
    const checkResult = await this._runGit(
      state,
      ["diff", "--cached", "--check"],
      true,
    );
    if (checkResult === null || checkResult.exitCode !== 0) {
      return await this._terminalize(state, "WORKSPACE_STATE_CONFLICT", safeMessage("cached check failed"), null);
    }

    // Write tree
    const treeResult = await this._runGit(
      state,
      ["write-tree"],
      false,
    );
    if (treeResult === null || treeResult.exitCode !== 0) {
      return await this._terminalize(state, "EXECUTION_BLOCKED", safeMessage("write-tree failed"), null);
    }
    const treeSha = treeResult.stdout.trim();
    if (!SHA40_RE.test(treeSha)) {
      return await this._terminalize(state, "EXECUTION_BLOCKED", safeMessage("write-tree malformed"), null);
    }
    state.stagedTreeSha = treeSha;

    const elapsed = Math.max(0, this._nowMsChecked(state) - t0);
    this._addTrace(state, "staging", "succeeded", null, null, null, null, elapsed);

    return null;
  }

  // ═══════════════════════════════════════ Phase: Canonical Publish Intent

  private async _phaseIntent(state: InternalState): Promise<LoopDeliveryPublishResult | null> {
    const gateResult = this._checkGate(state);
    if (gateResult !== null) return gateResult;

    const t0 = this._nowMsChecked(state);
    const id = state.request.identity;

    // Build canonical publish intent
    const intentObj: Record<string, unknown> = Object.create(null);
    intentObj.schema = "loop-publish-intent-v1";
    intentObj.run_id = id.runId;
    intentObj.requirement_id = id.requirementId;
    intentObj.repository = id.repository;
    intentObj.base_branch = id.baseBranch;
    intentObj.expected_base_sha = id.expectedBaseSha;
    intentObj.task_branch = id.taskBranch;
    intentObj.precommit_head_sha = state.precommitHeadSha;
    intentObj.precommit_status_digest_sha256 = state.precommitStatusDigestSha256;
    intentObj.staged_tree_sha = state.stagedTreeSha;
    intentObj.delivery_result_artifact_ref = state.request.deliveryResultArtifactRef;
    intentObj.files = [...state.deliveryFiles!];
    intentObj.commit_subject = state.request.commitSubject;
    intentObj.commit_author_name = this.commitAuthorName;
    intentObj.commit_author_email = this.commitAuthorEmail;
    intentObj.pr_title = state.request.prTitle;
    intentObj.pr_body_schema = "loop-publish-pr-body-v1";

    const intentJson = JSON.stringify(intentObj) + "\n";
    const intentBytes = Buffer.from(intentJson, "utf8");

    if (intentBytes.length > this.maxIntentArtifactBytes) {
      return await this._terminalize(state, "INTERNAL_ERROR", safeMessage("intent too large"), null);
    }

    // If recovery intent provided, verify byte-identical
    if (state.request.recoveryPublishIntentArtifactRef) {
      let recoveryBytes: Buffer;
      try {
        recoveryBytes = this.artifactStore.read(state.request.recoveryPublishIntentArtifactRef);
      } catch {
        return await this._terminalize(state, "ARTIFACT_STORE_FAILED", safeMessage("failed to read recovery intent"), null);
      }

      if (!recoveryBytes.equals(intentBytes)) {
        return await this._terminalize(state, "WORKSPACE_STATE_CONFLICT", safeMessage("recovery intent mismatch"), null);
      }

      // Recovery intent is valid — use existing artifact ref, don't put again
      state.publishIntentBytes = intentBytes;
      state.publishIntentArtifactRef = state.request.recoveryPublishIntentArtifactRef;
      state.recoveryStage = "intent_persisted";
      const elapsedRec = Math.max(0, this._nowMsChecked(state) - t0);
      this._addTrace(state, "intent", "recovered", state.publishIntentArtifactRef, null, null, null, elapsedRec);
      return null;
    }

    // Fresh: persist intent before commit
    let stored: LoopStoredArtifact;
    try {
      stored = this.artifactStore.put("workspace_metadata", intentBytes);
    } catch {
      return await this._terminalize(state, "ARTIFACT_STORE_FAILED", safeMessage("intent persist failed"), null);
    }

    // Validate stored artifact
    const digest = sha256Hex(intentBytes);
    const storedVal = validateStoredArtifact(stored, "workspace_metadata", digest, intentBytes.length);
    if (!storedVal.ok) {
      return await this._terminalize(state, "ARTIFACT_STORE_FAILED", safeMessage("intent validation failed"), null);
    }

    state.publishIntentBytes = intentBytes;
    state.publishIntentArtifactRef = stored.artifactRef;
    state.recoveryStage = "intent_persisted";

    const elapsedFresh = Math.max(0, this._nowMsChecked(state) - t0);
    this._addTrace(state, "intent", "succeeded", stored.artifactRef, null, null, null, elapsedFresh);
    return null;
  }

  // ═══════════════════════════════════════ Phase: Commit

  private async _phaseCommit(state: InternalState): Promise<LoopDeliveryPublishResult | null> {
    const gateResult = this._checkGate(state);
    if (gateResult !== null) return gateResult;

    const t0 = this._nowMsChecked(state);
    const id = state.request.identity;

    // Check if HEAD is already a valid publish commit (retry scenario)
    if (state.request.recoveryPublishIntentArtifactRef) {
      // Check if HEAD is already the publish commit
      const headResult = await this._runGit(state, ["rev-parse", "--verify", "HEAD"], false);
      if (headResult !== null && headResult.exitCode === 0) {
        const currentHead = headResult.stdout.trim();
        if (currentHead !== state.precommitHeadSha && SHA40_RE.test(currentHead)) {
          // HEAD has changed — verify it's our publish commit
          const commitValid = await this._verifyPublishCommit(state, currentHead);
          if (commitValid) {
            state.commitSha = currentHead;
            state.commitRecovered = true;
            state.recoveryStage = "commit_created";
            const elapsed = Math.max(0, this._nowMsChecked(state) - t0);
            this._addTrace(state, "commit", "recovered", null, currentHead, null, null, elapsed);
            return null;
          }
        }
      }
    }

    // Not already committed — perform commit
    if (state.commitAttempted) {
      return await this._terminalize(state, "INTERNAL_ERROR", safeMessage("commit already attempted"), null);
    }
    state.commitAttempted = true;

    // Build canonical commit message
    const commitMsg = `${state.request.commitSubject}\n\nLoop-Run-Id: ${id.runId}\nLoop-Delivery-Artifact: ${state.request.deliveryResultArtifactRef}\nLoop-Publish-Intent: ${state.publishIntentArtifactRef}\n`;

    // Execute commit through runner
    let commitResult: LoopPosixProcessResult | null = null;
    let commitError: unknown = null;

    try {
      commitResult = await this._runGitWithStdin(
        state,
        ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgSign=false",
         "-c", `user.name=${this.commitAuthorName}`, "-c", `user.email=${this.commitAuthorEmail}`,
         "commit", "--no-verify", "--no-gpg-sign", "-F", "-"],
        commitMsg,
      );
    } catch (e) {
      commitError = e;
    }

    // Always reconcile
    const commitSha = await this._reconcileCommit(state, commitResult, commitError);

    if (commitSha !== null) {
      // Commit exists and is valid
      if (commitResult !== null && commitResult.exitCode === 0 && commitError === null) {
        state.commitCreated = true;
      } else {
        state.commitRecovered = true;
      }
      state.commitSha = commitSha;
      state.recoveryStage = "commit_created";

      const elapsed = Math.max(0, this._nowMsChecked(state) - t0);
      const outcome = state.commitRecovered ? "recovered" : "succeeded";
      this._addTrace(state, "commit", outcome, null, commitSha, null, null, elapsed);
      return null;
    }

    // Commit failed
    return await this._terminalize(state, "COMMIT_FAILED", safeMessage("commit failed"), null);
  }

  private async _reconcileCommit(
    state: InternalState,
    commitResult: LoopPosixProcessResult | null,
    commitError: unknown,
  ): Promise<string | null> {
    // Read HEAD
    const headResult = await this._runGit(state, ["rev-parse", "--verify", "HEAD"], true);
    if (headResult === null || headResult.exitCode !== 0) return null;

    const currentHead = headResult.stdout.trim();
    if (!SHA40_RE.test(currentHead)) return null;

    // HEAD must not be precommit HEAD
    if (currentHead === state.precommitHeadSha) return null;

    // Verify commit is valid
    const isValid = await this._verifyPublishCommit(state, currentHead);
    if (!isValid) return null;

    return currentHead;
  }

  private async _verifyPublishCommit(state: InternalState, sha: string): Promise<boolean> {
    // Read parent
    const parentsResult = await this._runGit(state, ["rev-list", "--parents", "-n", "1", sha], true);
    if (parentsResult === null || parentsResult.exitCode !== 0) return false;

    const parentsLine = parentsResult.stdout.trim();
    const parentParts = parentsLine.split(/\s+/);
    if (parentParts.length !== 2) return false; // Must have exactly one parent
    if (parentParts[1] !== state.precommitHeadSha) return false;

    // Read tree
    const treeResult = await this._runGit(state, ["show", "-s", "--format=%T", sha], true);
    if (treeResult === null || treeResult.exitCode !== 0) return false;
    const tree = treeResult.stdout.trim();
    if (tree !== state.stagedTreeSha) return false;

    // Read message
    const msgResult = await this._runGit(state, ["show", "-s", "--format=%B", sha], true);
    if (msgResult === null || msgResult.exitCode !== 0) return false;

    const id = state.request.identity;
    const expectedMsg = `${state.request.commitSubject}\n\nLoop-Run-Id: ${id.runId}\nLoop-Delivery-Artifact: ${state.request.deliveryResultArtifactRef}\nLoop-Publish-Intent: ${state.publishIntentArtifactRef}\n`;
    // git show --format=%B adds trailing LF; trim for comparison
    const actualMsg = msgResult.stdout.replace(/\n+$/, "\n");
    if (actualMsg !== expectedMsg) return false;

    // Read author
    const authorResult = await this._runGit(state, ["show", "-s", "--format=%an%x00%ae", sha], true);
    if (authorResult === null || authorResult.exitCode !== 0) return false;
    const authorParts = authorResult.stdout.split("\x00");
    if (authorParts.length !== 2) return false;
    // Trim trailing LF that real git appends to output
    const authorEmail = authorParts[1]!.replace(/\n$/, "");
    if (authorParts[0] !== this.commitAuthorName || authorEmail !== this.commitAuthorEmail) return false;

    // Read commit files
    const filesResult = await this._runGit(
      state, ["diff-tree", "--root", "--no-commit-id", "--name-status", "-z", "-r", "--no-renames", sha], true);
    if (filesResult === null || filesResult.exitCode !== 0) return false;

    const commitFiles = new Set<string>();
    const parts = filesResult.stdout.split("\x00");
    const flen = parts.length > 0 && parts[parts.length - 1] === "" ? parts.length - 1 : parts.length;
    for (let i = 0; i < flen; i++) {
      const part = parts[i]!;
      if (part.length === 1 && /[ACDMRTUX]/.test(part)) {
        if (/[RCTUX]/.test(part)) return false; // Reject rename, copy, type-change, unmerged, unknown
        if (!/[AMD]/.test(part)) return false; // Only A, M, D allowed
        if (i + 1 < flen) {
          const pathToken = parts[i + 1]!;
          if (pathToken.length === 0) return false;
          commitFiles.add(pathToken);
          i++;
        }
      }
    }

    const expectedFiles = new Set(state.deliveryFiles!);
    if (commitFiles.size !== expectedFiles.size) return false;
    for (const f of commitFiles) {
      if (!expectedFiles.has(f)) return false;
    }

    // Workspace must be clean
    const statusResult = await this._runGit(
      state, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], true);
    if (statusResult === null || statusResult.exitCode !== 0) return false;

    // With -z, clean repo produces empty output (or just trailing NUL)
    const cleanTokens = statusResult.stdout.split("\x00").filter((t) => t.length > 0);
    if (cleanTokens.length > 0) return false;

    return true;
  }

  // ═══════════════════════════════════════ Phase: Push

  private async _phasePush(state: InternalState): Promise<LoopDeliveryPublishResult | null> {
    const gateResult = this._checkGate(state);
    if (gateResult !== null) return gateResult;

    const t0 = this._nowMsChecked(state);
    const id = state.request.identity;
    const commitSha = state.commitSha!;

    // Query remote task branch
    const lsResult = await this._runGit(
      state,
      ["ls-remote", "--heads", "origin", `refs/heads/${id.taskBranch}`],
      false,
    );
    if (lsResult === null) {
      return await this._terminalize(state, "EXECUTION_BLOCKED", safeMessage("ls-remote task branch failed"), null);
    }

    const lsOutput = lsResult.stdout.trim();
    const lsLines = lsOutput.split("\n").filter((l) => l.trim().length > 0);

    // Parse remote SHA
    let remoteSha: string | null = null;
    if (lsLines.length === 1) {
      const parts = lsLines[0]!.split("\t");
      if (parts.length === 2 && SHA40_RE.test(parts[0]!)) {
        remoteSha = parts[0]!;
      } else {
        return await this._terminalize(state, "REMOTE_BRANCH_CONFLICT", safeMessage("malformed ls-remote"), null);
      }
    } else if (lsLines.length > 1) {
      return await this._terminalize(state, "REMOTE_BRANCH_CONFLICT", safeMessage("duplicate ls-remote lines"), null);
    }

    // Classify
    if (remoteSha === null) {
      // Absent — allow push
    } else if (remoteSha === state.precommitHeadSha) {
      // Precommit HEAD — allow fast-forward
    } else if (remoteSha === commitSha) {
      // Already pushed
      state.remoteBranchSha = remoteSha;
      state.pushRecovered = true;
      state.recoveryStage = "branch_pushed";
      const elapsed = Math.max(0, this._nowMsChecked(state) - t0);
      this._addTrace(state, "push", "recovered", null, commitSha, remoteSha, null, elapsed);
      return null;
    } else {
      return await this._terminalize(state, "REMOTE_BRANCH_CONFLICT", safeMessage("foreign remote SHA"), null);
    }

    // Perform push
    if (state.pushAttempted) {
      return await this._terminalize(state, "INTERNAL_ERROR", safeMessage("push already attempted"), null);
    }
    state.pushAttempted = true;

    let pushResult: LoopPosixProcessResult | null = null;
    let pushError: unknown = null;

    try {
      pushResult = await this._runGit(
        state,
        ["-c", "core.hooksPath=/dev/null", "push", "--no-verify", "--porcelain",
         "origin", `${commitSha}:refs/heads/${id.taskBranch}`],
        false,
      );
    } catch (e) {
      pushError = e;
    }

    // After push (regardless of outcome), re-query remote
    const postLsResult = await this._runGit(
      state,
      ["ls-remote", "--heads", "origin", `refs/heads/${id.taskBranch}`],
      false,
    );
    if (postLsResult === null) {
      // Can't verify — fail
      return await this._terminalize(state, "PUSH_FAILED", safeMessage("post-push ls-remote failed"), null);
    }

    const postOutput = postLsResult.stdout.trim();
    const postLines = postOutput.split("\n").filter((l) => l.trim().length > 0);
    let finalRemoteSha: string | null = null;
    if (postLines.length === 1) {
      const parts = postLines[0]!.split("\t");
      if (parts.length === 2 && SHA40_RE.test(parts[0]!)) {
        finalRemoteSha = parts[0]!;
      }
    }

    if (finalRemoteSha === commitSha) {
      state.remoteBranchSha = finalRemoteSha;
      if (pushResult !== null && pushResult.exitCode === 0 && pushError === null) {
        state.pushCreated = true;
      } else {
        state.pushRecovered = true;
      }
      state.recoveryStage = "branch_pushed";

      const elapsed = Math.max(0, this._nowMsChecked(state) - t0);
      const outcome = state.pushRecovered ? "recovered" : "succeeded";
      this._addTrace(state, "push", outcome, null, commitSha, finalRemoteSha, null, elapsed);
      return null;
    }

    if (finalRemoteSha === null || finalRemoteSha === state.precommitHeadSha) {
      return await this._terminalize(state, "PUSH_FAILED", safeMessage("remote not updated"), null);
    }

    return await this._terminalize(state, "REMOTE_BRANCH_CONFLICT", safeMessage("remote changed to foreign SHA"), null);
  }

  // ═══════════════════════════════════════ Phase: Draft PR

  private async _phasePr(state: InternalState): Promise<LoopDeliveryPublishResult | null> {
    const gateResult = this._checkGate(state);
    if (gateResult !== null) return gateResult;

    const t0 = this._nowMsChecked(state);
    const id = state.request.identity;
    const commitSha = state.commitSha!;
    const remoteSha = state.remoteBranchSha!;

    // Verify remote task SHA matches commit
    if (remoteSha !== commitSha) {
      return await this._terminalize(state, "REMOTE_BRANCH_CONFLICT", safeMessage("remote sha not commit"), null);
    }

    // Build canonical PR body
    const bodyLines: string[] = [];
    bodyLines.push("## LOOP-DELIVERY-07 — Recoverable Delivery Publish");
    bodyLines.push("");
    bodyLines.push(`- Run ID: \`<${id.runId}>\``);
    bodyLines.push(`- Requirement ID: \`<${id.requirementId}>\``);
    bodyLines.push(`- Repository: \`<${id.repository}>\``);
    bodyLines.push(`- Base branch: \`<${id.baseBranch}>\``);
    bodyLines.push(`- Expected base SHA: \`<${id.expectedBaseSha}>\``);
    bodyLines.push(`- Task branch: \`<${id.taskBranch}>\``);
    bodyLines.push(`- Commit SHA: \`<${commitSha}>\``);
    bodyLines.push(`- Delivery artifact: \`<${state.request.deliveryResultArtifactRef}>\``);
    bodyLines.push(`- Publish intent: \`<${state.publishIntentArtifactRef}>\``);
    bodyLines.push("");
    bodyLines.push("### Files");
    bodyLines.push("");
    for (const f of state.deliveryFiles!) {
      bodyLines.push(`- \`<${f}>\``);
    }
    bodyLines.push("");
    bodyLines.push("### Governance");
    bodyLines.push("");
    bodyLines.push("- Draft: true");
    bodyLines.push("- Review: pending project controller review");
    bodyLines.push("- Merge: not authorized");
    bodyLines.push("- D08: not authorized");
    bodyLines.push("- Exchange: not published");
    bodyLines.push("- Personal KB: not published");

    const canonicalBody = bodyLines.join("\n") + "\n";
    const bodySha256 = sha256Hex(canonicalBody);
    state.prBodySha256 = bodySha256;

    // Query existing PRs
    const prListResult = await this._runGh(
      state,
      ["pr", "list", "--repo", id.repository, "--state", "all",
       "--head", id.taskBranch,
       "--json", "number,url,state,isDraft,mergedAt,baseRefName,headRefName,headRefOid,title,body"],
      false,
    );

    // If pre-query failed (null result), fail closed — do not create PR
    if (prListResult === null) {
      return await this._terminalize(state, "PR_STATE_CONFLICT", safeMessage("gh pr list failed"), null);
    }

    if (prListResult.exitCode === 0) {
      let prList: unknown;
      try {
        prList = JSON.parse(prListResult.stdout.trim());
      } catch {
        return await this._terminalize(state, "PR_STATE_CONFLICT", safeMessage("malformed gh JSON"), null);
      }

      if (!Array.isArray(prList)) {
        return await this._terminalize(state, "PR_STATE_CONFLICT", safeMessage("gh output not array"), null);
      }

      if (prList.length > 1) {
        return await this._terminalize(state, "PR_STATE_CONFLICT", safeMessage("multiple PRs for task branch"), null);
      }

      if (prList.length === 1) {
        const pr = prList[0] as Record<string, unknown>;

        // Validate exact match
        if (pr.state !== "OPEN") {
          return await this._terminalize(state, "PR_STATE_CONFLICT", safeMessage("PR not open"), null);
        }
        if (pr.isDraft !== true) {
          return await this._terminalize(state, "PR_STATE_CONFLICT", safeMessage("PR not draft"), null);
        }
        if (pr.mergedAt !== null) {
          return await this._terminalize(state, "PR_STATE_CONFLICT", safeMessage("PR merged"), null);
        }
        if (pr.baseRefName !== id.baseBranch) {
          return await this._terminalize(state, "PR_STATE_CONFLICT", safeMessage("PR wrong base"), null);
        }
        if (pr.headRefName !== id.taskBranch) {
          return await this._terminalize(state, "PR_STATE_CONFLICT", safeMessage("PR wrong head"), null);
        }
        if (pr.headRefOid !== commitSha) {
          return await this._terminalize(state, "PR_STATE_CONFLICT", safeMessage("PR wrong head SHA"), null);
        }
        if (pr.title !== state.request.prTitle) {
          return await this._terminalize(state, "PR_STATE_CONFLICT", safeMessage("PR wrong title"), null);
        }
        if (pr.body !== canonicalBody) {
          return await this._terminalize(state, "PR_STATE_CONFLICT", safeMessage("PR wrong body"), null);
        }

        // Exact match — recovered
        state.prNumber = pr.number as number;
        state.prUrl = pr.url as string;
        state.prRecovered = true;
        state.recoveryStage = "draft_pr_created";

        const elapsed = Math.max(0, this._nowMsChecked(state) - t0);
        this._addTrace(state, "draft_pr", "recovered", null, null, null, state.prNumber, elapsed);
        return null;
      }
    }

    // No PR exists — create
    if (state.prCreateAttempted) {
      return await this._terminalize(state, "INTERNAL_ERROR", safeMessage("PR create already attempted"), null);
    }
    state.prCreateAttempted = true;

    let createResult: LoopPosixProcessResult | null = null;
    let createError: unknown = null;

    try {
      createResult = await this._runGhWithStdin(
        state,
        ["pr", "create", "--draft", "--repo", id.repository,
         "--base", id.baseBranch, "--head", id.taskBranch,
         "--title", state.request.prTitle, "--body-file", "-"],
        canonicalBody,
      );
    } catch (e) {
      createError = e;
    }

    // After create, re-query
    const postListResult = await this._runGh(
      state,
      ["pr", "list", "--repo", id.repository, "--state", "all",
       "--head", id.taskBranch,
       "--json", "number,url,state,isDraft,mergedAt,baseRefName,headRefName,headRefOid,title,body"],
      false,
    );

    if (postListResult !== null && postListResult.exitCode === 0) {
      let postList: unknown;
      try {
        postList = JSON.parse(postListResult.stdout.trim());
      } catch {
        // fall through
      }

      if (Array.isArray(postList) && postList.length === 1) {
        const pr = postList[0] as Record<string, unknown>;
        if (pr.state === "OPEN" && pr.isDraft === true && pr.mergedAt === null &&
            pr.baseRefName === id.baseBranch && pr.headRefName === id.taskBranch &&
            pr.headRefOid === commitSha && pr.title === state.request.prTitle &&
            pr.body === canonicalBody) {
          state.prNumber = pr.number as number;
          state.prUrl = pr.url as string;

          if (createResult !== null && createResult.exitCode === 0 && createError === null) {
            state.prCreated = true;
          } else {
            state.prRecovered = true;
          }
          state.recoveryStage = "draft_pr_created";

          const elapsed = Math.max(0, this._nowMsChecked(state) - t0);
          const outcome = state.prRecovered ? "recovered" : "succeeded";
          this._addTrace(state, "draft_pr", outcome, null, null, null, state.prNumber, elapsed);
          return null;
        }
      }
    }

    // No valid PR after create
    return await this._terminalize(state, "PR_CREATE_FAILED", safeMessage("PR create failed"), null);
  }

  // ═══════════════════════════════════════ Terminalize

  private async _terminalize(
    state: InternalState,
    reasonCode: LoopDeliveryPublishReasonCode,
    message: string,
    recoveryStage: LoopDeliveryPublishRecoveryStage | null,
  ): Promise<LoopDeliveryPublishResult> {
    const t0 = this._nowMs() ?? state.lastClockMs;
    const elapsed = Math.max(0, t0 - state.startMs);

    // Clock error in finalizer must override any original status to INTERNAL_ERROR
    let finalReasonCode = reasonCode;
    let finalMessage = message;
    if (state.clockError || state.deadlineGate === "clock_error" || t0 === state.lastClockMs && this._nowMs() === null) {
      finalReasonCode = "INTERNAL_ERROR";
      finalMessage = safeMessage("clock error in finalizer");
    }

    // Build result object in canonical fixed order
    const status: LoopDeliveryPublishStatus =
      finalReasonCode === "PUBLISH_SUCCEEDED" ? "succeeded" :
      finalReasonCode === "BASE_BRANCH_DRIFT" || finalReasonCode === "WORKSPACE_DRIFT" ||
      finalReasonCode === "WORKSPACE_STATE_CONFLICT" || finalReasonCode === "REMOTE_BRANCH_CONFLICT" ||
      finalReasonCode === "PR_STATE_CONFLICT" || finalReasonCode === "EXECUTION_BLOCKED" ? "blocked" : "failed";

    const finalStage = recoveryStage ?? state.recoveryStage;

    // Add terminal trace entry
    this._addTrace(state, "terminal", finalReasonCode === "PUBLISH_SUCCEEDED" ? "succeeded" : "failed",
      null, state.commitSha, state.remoteBranchSha, state.prNumber, elapsed);

    const resultObj: Record<string, unknown> = Object.create(null);
    resultObj.schema = "loop-publish-result-v1";
    resultObj.status = status;
    resultObj.reason_code = finalReasonCode;
    resultObj.cause_code = null;
    resultObj.recovery_stage = finalStage;
    resultObj.delivery_result_artifact_ref = state.request.deliveryResultArtifactRef;
    resultObj.publish_intent_artifact_ref = state.publishIntentArtifactRef ?? null;
    resultObj.precommit_head_sha = state.precommitHeadSha ?? null;
    resultObj.commit_sha = state.commitSha ?? null;
    resultObj.remote_branch_sha = state.remoteBranchSha ?? null;
    resultObj.pr_number = state.prNumber ?? null;
    resultObj.pr_url = state.prUrl ?? null;
    resultObj.files = state.deliveryFiles ? [...state.deliveryFiles] : [];
    resultObj.commit_created = state.commitCreated;
    resultObj.commit_recovered = state.commitRecovered;
    resultObj.push_created = state.pushCreated;
    resultObj.push_recovered = state.pushRecovered;
    resultObj.pr_created = state.prCreated;
    resultObj.pr_recovered = state.prRecovered;
    resultObj.pr_body_sha256 = state.prBodySha256 ?? null;
    resultObj.elapsed_ms = elapsed;
    resultObj.trace = state.trace.map((te) => ({
      sequence: te.sequence,
      stage: te.stage,
      outcome: te.outcome,
      artifact_ref: te.artifactRef,
      commit_sha: te.commitSha,
      remote_branch_sha: te.remoteBranchSha,
      pr_number: te.prNumber,
      elapsed_ms: te.elapsedMs,
    }));

    // Persist result artifact (attempt once)
    let resultRef: string | null = null;
    let storeFailed = false;

    const resultJson = JSON.stringify(resultObj) + "\n";
    const resultBytes = Buffer.from(resultJson, "utf8");

    if (resultBytes.length <= this.maxResultArtifactBytes) {
      try {
        const stored = this.artifactStore.put("workspace_metadata", resultBytes);
        const digest = sha256Hex(resultBytes);
        const storedVal = validateStoredArtifact(stored, "workspace_metadata", digest, resultBytes.length);
        if (storedVal.ok) {
          resultRef = stored.artifactRef;
        } else {
          storeFailed = true;
        }
      } catch {
        storeFailed = true;
      }
    } else {
      storeFailed = true;
    }

    // If store failed, override to ARTIFACT_STORE_FAILED
    let finalResult: Record<string, unknown>;
    if (storeFailed) {
      finalResult = Object.create(null);
      finalResult.schema = "loop-publish-result-v1";
      finalResult.status = "failed";
      finalResult.reason_code = "ARTIFACT_STORE_FAILED";
      finalResult.cause_code = null;
      finalResult.recovery_stage = finalStage;
      finalResult.delivery_result_artifact_ref = state.request.deliveryResultArtifactRef;
      finalResult.publish_intent_artifact_ref = state.publishIntentArtifactRef ?? null;
      finalResult.precommit_head_sha = state.precommitHeadSha ?? null;
      finalResult.commit_sha = state.commitSha ?? null;
      finalResult.remote_branch_sha = state.remoteBranchSha ?? null;
      finalResult.pr_number = state.prNumber ?? null;
      finalResult.pr_url = state.prUrl ?? null;
      finalResult.files = state.deliveryFiles ? [...state.deliveryFiles] : [];
      finalResult.commit_created = state.commitCreated;
      finalResult.commit_recovered = state.commitRecovered;
      finalResult.push_created = state.pushCreated;
      finalResult.push_recovered = state.pushRecovered;
      finalResult.pr_created = state.prCreated;
      finalResult.pr_recovered = state.prRecovered;
      finalResult.pr_body_sha256 = state.prBodySha256 ?? null;
      finalResult.elapsed_ms = elapsed;
      finalResult.trace = state.trace.map((te) => ({
        sequence: te.sequence,
        stage: te.stage,
        outcome: te.outcome,
        artifact_ref: te.artifactRef,
        commit_sha: te.commitSha,
        remote_branch_sha: te.remoteBranchSha,
        pr_number: te.prNumber,
        elapsed_ms: te.elapsedMs,
      }));
      // No publishResultArtifactRef
    } else {
      finalResult = resultObj;
      (finalResult as any).publishResultArtifactRef = resultRef;
    }

    const publishResult: LoopDeliveryPublishResult = {
      status: finalResult.status as LoopDeliveryPublishStatus,
      reasonCode: finalResult.reason_code as LoopDeliveryPublishReasonCode,
      safeMessage: message,
      causeCode: (finalResult.cause_code as string) ?? undefined,
      recoveryStage: finalResult.recovery_stage as LoopDeliveryPublishRecoveryStage,
      deliveryResultArtifactRef: finalResult.delivery_result_artifact_ref as string,
      publishIntentArtifactRef: finalResult.publish_intent_artifact_ref as string | undefined,
      publishResultArtifactRef: (finalResult as any).publishResultArtifactRef as string | undefined,
      precommitHeadSha: finalResult.precommit_head_sha as string | undefined,
      commitSha: finalResult.commit_sha as string | undefined,
      remoteBranchSha: finalResult.remote_branch_sha as string | undefined,
      prNumber: finalResult.pr_number as number | undefined,
      prUrl: finalResult.pr_url as string | undefined,
      files: freeze((finalResult.files as string[]) || []),
      commitCreated: finalResult.commit_created as boolean,
      commitRecovered: finalResult.commit_recovered as boolean,
      pushCreated: finalResult.push_created as boolean,
      pushRecovered: finalResult.push_recovered as boolean,
      prCreated: finalResult.pr_created as boolean,
      prRecovered: finalResult.pr_recovered as boolean,
      prBodySha256: finalResult.pr_body_sha256 as string | undefined,
      elapsedMs: finalResult.elapsed_ms as number,
      trace: freeze((finalResult.trace as LoopDeliveryPublishTraceEntry[]).map((te) => freeze(te))),
    };

    return deepFreeze(publishResult) as LoopDeliveryPublishResult;
  }

  private _zeroStateResult(
    reasonCode: LoopDeliveryPublishReasonCode,
    message: string,
  ): LoopDeliveryPublishResult {
    return deepFreeze({
      status: reasonCode === "INVALID_INPUT" ? "failed" as const : "failed" as const,
      reasonCode,
      safeMessage: safeMessage(message),
      causeCode: undefined,
      recoveryStage: "not_started" as const,
      deliveryResultArtifactRef: "",
      publishIntentArtifactRef: undefined,
      publishResultArtifactRef: undefined,
      precommitHeadSha: undefined,
      commitSha: undefined,
      remoteBranchSha: undefined,
      prNumber: undefined,
      prUrl: undefined,
      files: freeze([]),
      commitCreated: false,
      commitRecovered: false,
      pushCreated: false,
      pushRecovered: false,
      prCreated: false,
      prRecovered: false,
      prBodySha256: undefined,
      elapsedMs: 0,
      trace: freeze([]),
    }) as LoopDeliveryPublishResult;
  }

  // ═══════════════════════════════════════ Gate & Clock

  private _nowMs(): number | null {
    if (this.clock) {
      try {
        const n = this.clock.nowMs();
        if (typeof n !== "number" || !Number.isSafeInteger(n)) return null;
        return n;
      } catch {
        return null;
      }
    }
    return Date.now();
  }

  private _nowMsChecked(state: InternalState): number {
    const n = this._nowMs();
    if (n === null) {
      state.clockError = true;
      state.deadlineGate = "clock_error";
    }
    if (n !== null) state.lastClockMs = n;
    return n ?? state.lastClockMs;
  }

  private _checkGate(state: InternalState): LoopDeliveryPublishResult | null {
    if (state.clockError || state.deadlineGate === "clock_error") {
      return this._zeroStateResult("INTERNAL_ERROR", "clock error");
    }

    const now = this._nowMsChecked(state);

    if (now >= state.deadlineMs) {
      state.deadlineGate = "expired";
    }

    if (state.deadlineGate === "expired") {
      return this._zeroStateResult("TOTAL_TIMEOUT", "total timeout reached");
    }

    // Re-verify source observation if set
    if (state.sourceHeadSha !== null) {
      // Cannot re-inspect here without async — verified in workspace phase
      // The contract says to re-inspect before/after major side-effects
    }

    return null;
  }

  private _remainingMs(state: InternalState): number {
    const now = this._nowMsChecked(state);
    return Math.max(0, state.deadlineMs - now);
  }

  private _effectiveTimeoutMs(state: InternalState): number {
    return Math.min(this.defaultCommandTimeoutMs, this._remainingMs(state));
  }

  // ═══════════════════════════════════════ Trace

  private _addTrace(
    state: InternalState,
    stage: string,
    outcome: string,
    artifactRef: string | null,
    commitSha: string | null,
    remoteBranchSha: string | null,
    prNumber: number | null,
    elapsedMs: number,
  ): void {
    state.traceSeq++;
    state.trace.push(freeze({
      sequence: state.traceSeq,
      stage,
      outcome,
      artifactRef,
      commitSha,
      remoteBranchSha,
      prNumber,
      elapsedMs,
    }));
  }

  // ═══════════════════════════════════════ D03 Reconciliation

  private async _reconcileD03(state: InternalState): Promise<LoopDeliveryPublishResult | null> {
    let snapshot: LoopGitWorkspaceSnapshot;
    try {
      snapshot = await this.workspaceManager.inspect(state.request.identity);
    } catch {
      return await this._terminalize(state, "WORKSPACE_DRIFT", safeMessage("D03 inspect failed during reconciliation"), null);
    }

    const snapVal = validateWorkspaceSnapshot(snapshot);
    if (!snapVal.ok) {
      return await this._terminalize(state, "DEPENDENCY_RESULT_INVALID", safeMessage("D03 snapshot invalid during reconciliation"), null);
    }

    // Verify workspace identity hasn't changed
    if (snapshot.workspacePath !== state.workspacePath) {
      return await this._terminalize(state, "WORKSPACE_DRIFT", safeMessage("workspacePath changed"), null);
    }
    if (snapshot.repository !== state.request.identity.repository) {
      return await this._terminalize(state, "WORKSPACE_DRIFT", safeMessage("repository changed"), null);
    }
    if (snapshot.taskBranch !== state.request.identity.taskBranch) {
      return await this._terminalize(state, "WORKSPACE_DRIFT", safeMessage("taskBranch changed"), null);
    }

    // Verify Source invariance
    if (snapshot.sourceHeadSha !== state.sourceHeadSha) {
      return await this._terminalize(state, "WORKSPACE_DRIFT", safeMessage("sourceHeadSha changed"), null);
    }
    if (snapshot.sourceWipDigestSha256 !== state.sourceWipDigestSha256) {
      return await this._terminalize(state, "WORKSPACE_DRIFT", safeMessage("sourceWipDigest changed"), null);
    }

    // Verify base hasn't drifted
    if (snapshot.currentBaseSha !== state.currentBaseSha) {
      return await this._terminalize(state, "BASE_BRANCH_DRIFT", safeMessage("currentBaseSha changed"), null);
    }
    if (snapshot.baseDrifted) {
      return await this._terminalize(state, "BASE_BRANCH_DRIFT", safeMessage("baseDrifted flag set"), null);
    }

    // Verify task HEAD allowed transitions
    const currentHead = snapshot.taskHeadSha;
    if (currentHead !== state.precommitHeadSha && currentHead !== state.commitSha) {
      // Only allowed transition: precommit -> publish commit
      if (state.commitSha !== null && currentHead === state.commitSha) {
        // OK — expected transition to publish commit
      } else if (state.request.recoveryPublishIntentArtifactRef !== undefined) {
        // In recovery mode, allow HEAD to be at a commit beyond precommit
        // The commit phase will verify it's a valid publish commit
        if (!SHA40_RE.test(currentHead)) {
          return await this._terminalize(state, "WORKSPACE_STATE_CONFLICT", safeMessage("invalid task HEAD in recovery"), null);
        }
      } else {
        return await this._terminalize(state, "WORKSPACE_STATE_CONFLICT", safeMessage("unauthorized task HEAD transition"), null);
      }
    }

    return null;
  }

  private async _runGit(
    state: InternalState,
    args: readonly string[],
    allowNonZero: boolean,
  ): Promise<LoopPosixProcessResult | null> {
    return this._runCommand(state, this.gitExecutableId, args, allowNonZero);
  }

  private async _runGitWithStdin(
    state: InternalState,
    args: readonly string[],
    stdin: string,
  ): Promise<LoopPosixProcessResult> {
    const cwd = state.workspacePath;
    if (!cwd) throw new Error(safeMessage("workspacePath not set"));
    const remaining = this._remainingMs(state);
    if (remaining <= 0) throw new Error(safeMessage("deadline expired"));
    const effectiveTimeout = Math.min(this.defaultCommandTimeoutMs, remaining);
    try {
      const result = await this.runner.run({
        executableId: this.gitExecutableId,
        args,
        cwd,
        stdin,
        timeoutMs: effectiveTimeout,
        maxStdoutBytes: this.maxCommandOutputBytes,
        maxStderrBytes: this.maxCommandOutputBytes,
      });

      // Validate result
      const val = validateRunnerResult(result, this.maxCommandOutputBytes, this.maxCommandOutputBytes);
      if (!val.ok) {
        throw new Error(safeMessage(`invalid runner result: ${(val as { ok: false; reason: string }).reason}`));
      }

      return result;
    } catch (e) {
      if (isTypedRunnerError(e)) {
        throw e;
      }
      throw new Error(safeMessage(`git command failed`));
    }
  }

  private async _runGh(
    state: InternalState,
    args: readonly string[],
    allowNonZero: boolean,
  ): Promise<LoopPosixProcessResult | null> {
    return this._runCommand(state, this.ghExecutableId, args, allowNonZero);
  }

  private async _runGhWithStdin(
    state: InternalState,
    args: readonly string[],
    stdin: string,
  ): Promise<LoopPosixProcessResult> {
    const cwd = state.workspacePath;
    if (!cwd) throw new Error(safeMessage("workspacePath not set"));
    try {
      const result = await this.runner.run({
        executableId: this.ghExecutableId,
        args,
        cwd,
        stdin,
        timeoutMs: this.defaultCommandTimeoutMs,
        maxStdoutBytes: this.maxCommandOutputBytes,
        maxStderrBytes: this.maxCommandOutputBytes,
      });

      const val = validateRunnerResult(result, this.maxCommandOutputBytes, this.maxCommandOutputBytes);
      if (!val.ok) {
        throw new Error(safeMessage(`invalid runner result: ${(val as { ok: false; reason: string }).reason}`));
      }

      return result;
    } catch (e) {
      if (isTypedRunnerError(e)) {
        throw e;
      }
      throw new Error(safeMessage(`gh command failed`));
    }
  }

  private async _runCommand(
    state: InternalState,
    executableId: string,
    args: readonly string[],
    allowNonZero: boolean,
  ): Promise<LoopPosixProcessResult | null> {
    const cwd = state.workspacePath;
    if (!cwd) return null;
    const remaining = this._remainingMs(state);
    if (remaining <= 0) return null;
    const effectiveTimeout = Math.min(this.defaultCommandTimeoutMs, remaining);
    try {
      const result = await this.runner.run({
        executableId,
        args,
        cwd,
        timeoutMs: effectiveTimeout,
        maxStdoutBytes: this.maxCommandOutputBytes,
        maxStderrBytes: this.maxCommandOutputBytes,
      });

      // Validate result
      const val = validateRunnerResult(result, this.maxCommandOutputBytes, this.maxCommandOutputBytes);
      if (!val.ok) {
        return null;
      }

      if (!allowNonZero && result.exitCode !== 0) {
        return null;
      }

      return result;
    } catch (e) {
      if (isTypedRunnerError(e)) {
        const code = e.code;
        if (D02_BLOCKED_CODES.has(code)) {
          return null;
        }
        if (D02_FAILED_CODES.has(code)) {
          return null;
        }
      }
      return null;
    }
  }
}
