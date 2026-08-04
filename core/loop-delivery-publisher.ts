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
import {
  LOOP_GOVERNANCE_TAIL_RESULT_MAX_BYTES,
  parseLoopGovernanceTailResultBytes,
  type LoopGovernanceTailResult,
} from "./loop-governance-tail-result";

// ═══════════════════════════════════════ Types

export type LoopDeliveryPublishStatus = "succeeded" | "failed" | "blocked";

export type LoopDeliveryPublishMode = "standalone" | "governed";

export type LoopDeliveryPublishReasonCode =
  | "PUBLISH_SUCCEEDED"
  | "INVALID_INPUT"
  | "DELIVERY_NOT_READY"
  | "GOVERNANCE_TAIL_NOT_READY"
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
  | "governance_verified"
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
  readonly governanceTailResultArtifactRef?: string;
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
  readonly governanceTailResultArtifactRef?: string;
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
  "governanceTailResultArtifactRef",
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

// Canonical trace stages actually emitted by this module (single authority —
// consumed by the producer-owned `parseLoopDeliveryPublishResultBytes`).
const PUBLISH_TRACE_STAGES = [
  "delivery", "workspace", "staging", "intent", "governance_tail", "commit", "push", "draft_pr", "terminal",
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

// Parse name-status output (-z format: status\0path\0)
// Only A, M, D are allowed. Reject rename (R), copy (C), unmerged (U),
// unknown (X), type-change (T). Fail closed on any malformed/incomplete token.
// Final NUL contract: empty output is a valid empty result; any non-empty
// output must end with \x00 — a missing final NUL is rejected before any
// token is parsed (no partial results).
function parseNameStatusZ(output: string, label: string): Set<string> {
  if (output.length > 0 && !output.endsWith("\x00")) {
    throw new Error(`malformed ${label}: missing final NUL`);
  }
  const paths = new Set<string>();
  const parts = output.split("\x00");
  // Last empty token after final NUL is not a token
  const len = parts.length > 0 && parts[parts.length - 1] === "" ? parts.length - 1 : parts.length;
  for (let i = 0; i < len; i++) {
    const part = parts[i]!;
    if (part.length === 1 && /[ACDMRTUX]/.test(part)) {
      // Status letter — expect path at next position
      if (i + 1 >= len) {
        throw new Error(`malformed ${label}: status without path`);
      }
      const statusChar = part;
      const pathToken = parts[i + 1]!;
      i++; // consume path

      // Reject rename (R), copy (C), unmerged (U), unknown (X), type-change (T)
      if (/[RCTUX]/.test(statusChar)) {
        throw new Error(`malformed ${label}: forbidden status '${statusChar}' for path '${pathToken}'`);
      }
      // Only A, M, D allowed
      if (!/[AMD]/.test(statusChar)) {
        throw new Error(`malformed ${label}: unknown status '${statusChar}' for path '${pathToken}'`);
      }

      // Validate path: non-empty, no NUL, no backslash, no absolute
      if (pathToken.length === 0) {
        throw new Error(`malformed ${label}: empty path after status '${statusChar}'`);
      }
      if (pathToken.startsWith("/")) {
        throw new Error(`malformed ${label}: absolute path '${pathToken}'`);
      }
      if (pathToken.includes("\x00")) {
        throw new Error(`malformed ${label}: NUL in path`);
      }
      if (pathToken.includes("\\")) {
        throw new Error(`malformed ${label}: backslash in path '${pathToken}'`);
      }
      // Check for dot segments and traversal
      const segs = pathToken.split("/");
      for (const seg of segs) {
        if (seg.length === 0 || seg === "." || seg === "..") {
          throw new Error(`malformed ${label}: bad segment in path '${pathToken}'`);
        }
      }
      // Check for duplicate
      if (paths.has(pathToken)) {
        throw new Error(`malformed ${label}: duplicate path '${pathToken}'`);
      }
      paths.add(pathToken);
    } else {
      // Not a valid status letter — malformed token
      throw new Error(`malformed ${label}: unexpected token '${part.slice(0, 20)}'`);
    }
  }
  return paths;
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

// ═══════════════════════════════════════ Governed Markdown escaping

// Deterministic scalar escaping used ONLY for the governed Draft PR body.
// Fixed escape order: & → &amp;, \ → &#92;, ` → &#96;, < → &lt;, > → &gt;.
// No double escaping: each character is replaced exactly once in a single
// pass. Control characters (NUL, CR, LF, C0, DEL, C1) are rejected.
function escapeMarkdownScalar(value: string): string {
  if (NON_CONTROL_RE.test(value)) {
    throw new Error("governed body value must not contain control characters");
  }
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!;
    if (ch === "&") out += "&amp;";
    else if (ch === "\\") out += "&#92;";
    else if (ch === "`") out += "&#96;";
    else if (ch === "<") out += "&lt;";
    else if (ch === ">") out += "&gt;";
    else out += ch;
  }
  return out;
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
  // Real class identity only. A forged plain Error carrying the same `name`
  // and `code` must NOT be recognized as a D02 typed error.
  if (!(e instanceof LoopPosixProcessRunnerError)) return false;
  const code = (e as LoopPosixProcessRunnerError).code;
  if (typeof code !== "string" || !D02_CANONICAL_CODES.has(code)) return false;
  return true;
}

// Internal marker for malformed/truncated dependency results — mapped to
// DEPENDENCY_RESULT_INVALID by the top-level handler. Never exposed publicly.
class DependencyResultInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DependencyResultInvalidError";
  }
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
  // Publish mode: standalone consumes D06 only; governed consumes A1
  mode: LoopDeliveryPublishMode;
  // Source observation (fixed after first inspect)
  sourceHeadSha: string | null;
  sourceBranch: string | null;
  sourceWipDigestSha256: string | null;
  currentBaseSha: string | null;
  // Delivery artifact binding
  deliveryResult: Record<string, unknown> | null;
  deliveryFiles: string[] | null;
  deliveryFinalWorkspace: Record<string, unknown> | null;
  // Governance tail artifact binding (governed mode only)
  governanceRef: string | null;
  governanceValue: LoopGovernanceTailResult | null;
  governanceOrchestrationRef: string | null;
  governanceExecutorInputRef: string | null;
  // Effective publish authority (standalone: D06; governed: A1)
  effectiveFiles: string[] | null;
  effectiveFinalWorkspace: Record<string, unknown> | null;
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

    // Deep-freeze identity before first await — mutations after this
    // must not affect current invocation
    let frozenIdentity: LoopRunIdentity;
    try {
      frozenIdentity = deepFreeze({
        runId: identity.runId,
        requirementId: identity.requirementId,
        repository: identity.repository,
        repositoryPath: identity.repositoryPath,
        baseBranch: identity.baseBranch,
        expectedBaseSha: identity.expectedBaseSha,
        taskBranch: identity.taskBranch,
        controlRoot: identity.controlRoot,
        createdAt: identity.createdAt,
      }) as unknown as LoopRunIdentity;
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

    // Mode determination: only the presence of the governance-tail ref selects
    // governed mode. `undefined`/missing property → standalone. Any other value
    // (null, non-string, empty, malformed, wrong kind) selects governed mode and
    // is rejected later by the governance phase with GOVERNANCE_TAIL_NOT_READY.
    // There is no independent `mode` field: a governed request always carries
    // the ref, and a standalone request never carries it.
    const mode: LoopDeliveryPublishMode =
      req.governanceTailResultArtifactRef === undefined ? "standalone" : "governed";
    const governanceTailRaw = req.governanceTailResultArtifactRef as string | undefined;

    // Clock init
    const startMs = this._nowMs();
    if (startMs === null) {
      return this._zeroStateResult("INTERNAL_ERROR", "clock error at start");
    }

    const deadlineMs = startMs + this.maxTotalDurationMs;

    // Build internal state
    const state: InternalState = {
      request: freeze({
        identity: frozenIdentity,
        deliveryResultArtifactRef: deliveryArtifactRef,
        commitSubject,
        prTitle,
        recoveryPublishIntentArtifactRef: recoveryIntentRef,
        governanceTailResultArtifactRef: governanceTailRaw,
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
      mode,
      sourceHeadSha: null,
      sourceBranch: null,
      sourceWipDigestSha256: null,
      currentBaseSha: null,
      deliveryResult: null,
      deliveryFiles: null,
      deliveryFinalWorkspace: null,
      governanceRef: null,
      governanceValue: null,
      governanceOrchestrationRef: null,
      governanceExecutorInputRef: null,
      effectiveFiles: null,
      effectiveFinalWorkspace: null,
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
      // D02 taxonomy mapping: distinguish typed errors from unexpected exceptions
      if (e instanceof DependencyResultInvalidError) {
        // Malformed/truncated dependency result → DEPENDENCY_RESULT_INVALID
        result = await this._terminalize(state, "DEPENDENCY_RESULT_INVALID", safeMessage(e.message), null);
      } else if (isTypedRunnerError(e)) {
        const code = e.code;
        if (D02_BLOCKED_CODES.has(code)) {
          result = await this._terminalize(state, "EXECUTION_BLOCKED", safeMessage(e.message), null);
        } else if (D02_FAILED_CODES.has(code)) {
          result = await this._terminalize(state, "INTERNAL_ERROR", safeMessage(e.message), null);
        } else {
          result = await this._terminalize(state, "INTERNAL_ERROR", safeMessage(e.message), null);
        }
      } else {
        // Non-typed error: unexpected
        result = await this._terminalize(state, "INTERNAL_ERROR", safeMessage("unexpected publisher error"), null);
      }
    }

    return result;
  }

  // ═══════════════════════════════════════ State Machine

  private async _executeStateMachine(state: InternalState): Promise<LoopDeliveryPublishResult> {
    // Phase 1: Read and validate delivery artifact
    const deliveryOutcome = await this._phaseDelivery(state);
    if (deliveryOutcome !== null) return deliveryOutcome;

    // Phase 2: Governed mode — read and validate the governance-tail artifact (A1).
    // Standalone mode never enters this phase and never produces a
    // `governance_tail` trace entry.
    if (state.mode === "governed") {
      const governanceOutcome = await this._phaseGovernanceTail(state);
      if (governanceOutcome !== null) return governanceOutcome;
    }

    // Phase 3: Inspect workspace
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
    // Standalone effective authority is D06 itself. Governed mode only saves
    // the D06 facts (deliveryResult / deliveryFiles / deliveryFinalWorkspace)
    // here and establishes its effective authority EXCLUSIVELY from the A1
    // canonical value after full governance validation — so a governed request
    // that fails before A1 verification completes can never surface D06 files
    // as governed final files (implementation_files/files stay empty, and
    // precommit/workspace facts stay unfabricated).
    if (state.mode === "standalone") {
      if (state.effectiveFiles === null) {
        state.effectiveFiles = freeze([...fileList]) as unknown as string[];
      }
      if (state.effectiveFinalWorkspace === null) {
        state.effectiveFinalWorkspace = freeze({
          workspace_path: finalWs.workspace_path,
          task_branch: finalWs.task_branch,
          task_head_sha: finalWs.task_head_sha,
          status_digest_sha256: finalWs.status_digest_sha256,
          task_has_changes: finalWs.task_has_changes,
        });
      }
    }

    const elapsed = Math.max(0, this._nowMsChecked(state) - t0);
    this._addTrace(state, "delivery", "succeeded", null, null, null, null, elapsed);
    state.recoveryStage = "delivery_verified";

    return null;
  }

  // ═══════════════════════════════════════ Phase: Governance Tail Artifact

  // Governed mode only. Consumes the A1 `loop-governance-tail-result-v1`
  // artifact that has already entered the Source. Reuses the A1 parser —
  // never copies or rewrites its validators. Fail-closed with
  // GOVERNANCE_TAIL_NOT_READY for any governance-specific mismatch:
  // malformed/wrong-kind ref, oversize bytes, digest mismatch, parser
  // failure, identity/delivery/implementation-files/workspace binding
  // mismatch. Artifact Store read/put failures keep ARTIFACT_STORE_FAILED.
  // Evidence files referenced by A1 are never read or executed.
  private async _phaseGovernanceTail(state: InternalState): Promise<LoopDeliveryPublishResult | null> {
    const gateResult = this._checkGate(state);
    if (gateResult !== null) return gateResult;

    const t0 = this._nowMsChecked(state);
    const rawRef = state.request.governanceTailResultArtifactRef;
    const id = state.request.identity;

    // Ref format + exact kind. Any non-string/empty/malformed/wrong-kind
    // value is a governance-specific failure.
    let governanceRef: string;
    try {
      governanceRef = validateArtifactRef(rawRef, "governance_tail_result", "governanceTailResultArtifactRef");
    } catch (e) {
      return await this._terminalize(state, "GOVERNANCE_TAIL_NOT_READY", safeMessage((e as Error).message), null);
    }

    // Validated governance ref boundary: the value has passed the string /
    // non-empty / artifact-ref format / exact-kind gates and keeps its
    // canonical string semantics. From this point on the validated string may
    // be recorded even when a LATER gate (store read, digest, A1 content)
    // fails; a raw null/number/object/empty/malformed/wrong-kind input is
    // never promoted to a validated ref and never leaks into results.
    state.governanceRef = governanceRef;

    // Read artifact bytes (store failure keeps ARTIFACT_STORE_FAILED)
    let bytes: Buffer;
    try {
      bytes = this.artifactStore.read(governanceRef);
    } catch {
      return await this._terminalize(state, "ARTIFACT_STORE_FAILED", safeMessage("failed to read governance tail artifact"), null);
    }

    // Size gate BEFORE any full copy or parse
    if (bytes.length > LOOP_GOVERNANCE_TAIL_RESULT_MAX_BYTES) {
      return await this._terminalize(state, "GOVERNANCE_TAIL_NOT_READY", safeMessage("governance tail artifact too large"), null);
    }

    // Digest extracted from the ref must equal the actual bytes SHA-256
    const refMatch = ARTIFACT_REF_RE.exec(governanceRef);
    const actualDigest = sha256Hex(bytes);
    if (refMatch === null || refMatch[2] !== actualDigest) {
      return await this._terminalize(state, "GOVERNANCE_TAIL_NOT_READY", safeMessage("governance tail artifact digest mismatch"), null);
    }

    // Reuse the A1 parser on the exact bytes (Buffer is a genuine Uint8Array).
    // Parser failure fails closed; only the parser-returned canonical frozen
    // value is ever used afterwards.
    const parsed = parseLoopGovernanceTailResultBytes(bytes as unknown as Uint8Array);
    if (!parsed.ok) {
      return await this._terminalize(state, "GOVERNANCE_TAIL_NOT_READY", safeMessage("governance tail artifact invalid"), null);
    }
    const a1 = parsed.value;

    // ── Identity full-field binding (all nine fields, never a subset) ──
    const ai = a1.identity;
    if (
      ai.runId !== id.runId ||
      ai.requirementId !== id.requirementId ||
      ai.repository !== id.repository ||
      ai.repositoryPath !== id.repositoryPath ||
      ai.baseBranch !== id.baseBranch ||
      ai.expectedBaseSha !== id.expectedBaseSha ||
      ai.taskBranch !== id.taskBranch ||
      ai.controlRoot !== id.controlRoot ||
      ai.createdAt !== id.createdAt
    ) {
      return await this._terminalize(state, "GOVERNANCE_TAIL_NOT_READY", safeMessage("governance tail identity mismatch"), null);
    }

    // ── Delivery binding ──
    if (a1.delivery_result_artifact_ref !== state.request.deliveryResultArtifactRef) {
      return await this._terminalize(state, "GOVERNANCE_TAIL_NOT_READY", safeMessage("governance tail delivery ref mismatch"), null);
    }

    // ── Implementation files binding: exact array equality with D06 ──
    const d06Files = state.deliveryFiles!;
    if (a1.implementation_files.length !== d06Files.length) {
      return await this._terminalize(state, "GOVERNANCE_TAIL_NOT_READY", safeMessage("governance tail implementation files length mismatch"), null);
    }
    for (let i = 0; i < d06Files.length; i++) {
      if (a1.implementation_files[i] !== d06Files[i]) {
        return await this._terminalize(state, "GOVERNANCE_TAIL_NOT_READY", safeMessage("governance tail implementation files mismatch"), null);
      }
    }

    // ── D06/A1 workspace provenance ──
    // workspace_path / task_branch / task_head_sha / task_has_changes must be
    // equal; status_digest_sha256 MAY differ (D06 digest is
    // post-implementation, A1 digest is post-Shared-Tail).
    const d06Fw = state.deliveryFinalWorkspace!;
    const a1Fw = a1.final_workspace;
    if (
      a1Fw.workspace_path !== d06Fw.workspace_path ||
      a1Fw.task_branch !== d06Fw.task_branch ||
      a1Fw.task_head_sha !== d06Fw.task_head_sha ||
      a1Fw.task_has_changes !== true
    ) {
      return await this._terminalize(state, "GOVERNANCE_TAIL_NOT_READY", safeMessage("governance tail workspace provenance mismatch"), null);
    }

    // ── Effective files: A1 canonical `files` order, unchanged ──
    // A1 parser already guarantees implementation_files ⊆ files and strict
    // ascending order; re-confirm the subset and never modify the arrays.
    const a1Files = a1.files;
    const a1FilesSet = new Set<string>(a1Files);
    for (const implementationFile of a1.implementation_files) {
      if (!a1FilesSet.has(implementationFile)) {
        return await this._terminalize(state, "GOVERNANCE_TAIL_NOT_READY", safeMessage("governance tail files subset violated"), null);
      }
    }

    // ── Store governed facts separately from D06 facts ──
    // governanceRef was recorded at the validated-ref boundary above; the A1
    // value becomes the verified governance value only now, after EVERY gate
    // passed (identity, delivery ref, implementation files, provenance,
    // subset binding). Partially validated A1 values never reach this point.
    state.governanceValue = a1;
    // The orchestration and executor-input refs are evidence chain only;
    // their bytes are never read.
    state.governanceOrchestrationRef = a1.orchestration_result_artifact_ref;
    state.governanceExecutorInputRef = a1.executor_input_artifact_ref;
    state.effectiveFiles = freeze([...a1Files]) as unknown as string[];
    state.effectiveFinalWorkspace = freeze({
      workspace_path: a1Fw.workspace_path,
      task_branch: a1Fw.task_branch,
      task_head_sha: a1Fw.task_head_sha,
      status_digest_sha256: a1Fw.status_digest_sha256,
      task_has_changes: a1Fw.task_has_changes,
    });
    state.recoveryStage = "governance_verified";

    const elapsed = Math.max(0, this._nowMsChecked(state) - t0);
    const outcome = state.request.recoveryPublishIntentArtifactRef !== undefined ? "recovered" : "succeeded";
    this._addTrace(state, "governance_tail", outcome, governanceRef, null, null, null, elapsed);

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
    const fw = state.effectiveFinalWorkspace!;

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
    const effectiveFiles = state.effectiveFiles!;

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

    // Parse porcelain status (XY path\0 format) — fail closed on any malformed token
    const statusStr = statusResult.stdout;
    const statusTokens = statusStr.split("\x00");
    const stLen = statusTokens.length > 0 && statusTokens[statusTokens.length - 1] === "" ? statusTokens.length - 1 : statusTokens.length;
    for (let i = 0; i < stLen; i++) {
      const token = statusTokens[i]!;
      if (token.length >= 4 && token[1] !== undefined) {
        const x = token[0]!;
        const y = token[1]!;
        // Both chars must be valid status chars — reject unknown tokens
        const validX = /[. MADRCU?!]/.test(x);
        const validY = /[. MADRCU?!]/.test(y);
        if (!validX || !validY) {
          // Malformed status: reject instead of skip
          return await this._terminalize(state, "EXECUTION_BLOCKED", safeMessage(`malformed porcelain status: '${x}${y}'`), null);
        }
        if (x === " " && y === " ") continue; // unmodified
        // Both chars are valid status chars
        const spaceIdx = token.indexOf(" ");
        if (spaceIdx >= 2 && spaceIdx < token.length - 1) {
          const filePath = token.slice(spaceIdx + 1);
          if (filePath.length === 0) {
            return await this._terminalize(state, "EXECUTION_BLOCKED", safeMessage("malformed porcelain: empty path"), null);
          }
          if (filePath.startsWith("/") || filePath.includes("\\") || filePath.includes("\x00")) {
            return await this._terminalize(state, "EXECUTION_BLOCKED", safeMessage("malformed porcelain: unsafe path"), null);
          }
          // Reject rename (R) and copy (C) — these have scores and indicate complex operations
          if (x === "R" || x === "C" || y === "R" || y === "C") {
            return await this._terminalize(state, "EXECUTION_BLOCKED", safeMessage("porcelain rename/copy rejected"), null);
          }
          // Reject unmerged (U)
          if (x === "U" || y === "U") {
            return await this._terminalize(state, "EXECUTION_BLOCKED", safeMessage("porcelain unmerged rejected"), null);
          }
          allPaths.add(filePath);
        } else {
          // Status line without proper space separator
          return await this._terminalize(state, "EXECUTION_BLOCKED", safeMessage("malformed porcelain: bad format"), null);
        }
      } else if (token.length > 0) {
        // Non-empty token that doesn't look like a status line — malformed
        return await this._terminalize(state, "EXECUTION_BLOCKED", safeMessage("malformed porcelain: unexpected token"), null);
      }
    }

    // Parse name-status outputs using strict module-level parser

    let diffPaths: Set<string>;
    let cachedPaths: Set<string>;
    try {
      diffPaths = parseNameStatusZ(diffResult.stdout, "diff name-status");
      cachedPaths = parseNameStatusZ(cachedDiffResult.stdout, "cached name-status");
    } catch (e) {
      return await this._terminalize(state, "EXECUTION_BLOCKED", safeMessage((e as Error).message), null);
    }
    const othersPaths = new Set(othersResult.stdout.split("\x00").filter(Boolean));

    // Collect all changed paths
    for (const p of diffPaths) allPaths.add(p);
    for (const p of cachedPaths) allPaths.add(p);
    for (const p of othersPaths) allPaths.add(p);

    // Verify exact effective files
    const expectedSet = new Set(effectiveFiles);
    for (const p of allPaths) {
      if (!expectedSet.has(p)) {
        return await this._terminalize(state, "WORKSPACE_STATE_CONFLICT", safeMessage("extra path in workspace"), null);
      }
    }

    // Stage exact files
    const addArgs = ["-c", "core.hooksPath=/dev/null", "add", "--", ...effectiveFiles];
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
    let postDiffPaths: Set<string>;
    try {
      postDiffPaths = parseNameStatusZ(postDiffResult.stdout, "post-add diff");
    } catch (e) {
      return await this._terminalize(state, "EXECUTION_BLOCKED", safeMessage((e as Error).message), null);
    }
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
    let postCachedPaths: Set<string>;
    try {
      postCachedPaths = parseNameStatusZ(postCachedResult.stdout, "post-add cached");
    } catch (e) {
      return await this._terminalize(state, "EXECUTION_BLOCKED", safeMessage((e as Error).message), null);
    }

    // Check cached path set equals effective files
    for (const p of effectiveFiles) {
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

    // Build canonical publish intent. Standalone keeps the D07 schema and
    // byte contract; governed uses the fixed governed schema and field order.
    const intentObj: Record<string, unknown> = Object.create(null);
    if (state.mode === "governed") {
      intentObj.schema = "loop-governed-publish-intent-v1";
      intentObj.run_id = id.runId;
      intentObj.requirement_id = id.requirementId;
      intentObj.repository = id.repository;
      intentObj.base_branch = id.baseBranch;
      intentObj.expected_base_sha = id.expectedBaseSha;
      intentObj.task_branch = id.taskBranch;
      intentObj.precommit_head_sha = state.precommitHeadSha;
      intentObj.precommit_status_digest_sha256 = state.precommitStatusDigestSha256;
      intentObj.staged_tree_sha = state.stagedTreeSha;
      intentObj.orchestration_result_artifact_ref = state.governanceOrchestrationRef;
      intentObj.executor_input_artifact_ref = state.governanceExecutorInputRef;
      intentObj.delivery_result_artifact_ref = state.request.deliveryResultArtifactRef;
      intentObj.governance_tail_result_artifact_ref = state.governanceRef;
      intentObj.implementation_files = [...(state.governanceValue!.implementation_files as readonly string[])];
      intentObj.files = [...state.effectiveFiles!];
      intentObj.commit_subject = state.request.commitSubject;
      intentObj.commit_author_name = this.commitAuthorName;
      intentObj.commit_author_email = this.commitAuthorEmail;
      intentObj.pr_title = state.request.prTitle;
      intentObj.pr_body_schema = "loop-governed-publish-pr-body-v1";
    } else {
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
      intentObj.files = [...state.effectiveFiles!];
      intentObj.commit_subject = state.request.commitSubject;
      intentObj.commit_author_name = this.commitAuthorName;
      intentObj.commit_author_email = this.commitAuthorEmail;
      intentObj.pr_title = state.request.prTitle;
      intentObj.pr_body_schema = "loop-publish-pr-body-v1";
    }

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
          // HEAD is an unproven non-precommit SHA — do NOT create a second
          // commit. Fail closed with the commit-stage reason code.
          return await this._terminalize(state, "COMMIT_FAILED", safeMessage("recovery commit verification failed"), null);
        }
      }
    }

    // Not already committed — perform commit
    if (state.commitAttempted) {
      return await this._terminalize(state, "INTERNAL_ERROR", safeMessage("commit already attempted"), null);
    }
    state.commitAttempted = true;

    // Build canonical commit message. Standalone keeps the D07 bytes;
    // governed adds the governance-tail artifact trailer line.
    const commitMsg = state.mode === "governed"
      ? `${state.request.commitSubject}\n\nLoop-Run-Id: ${id.runId}\nLoop-Delivery-Artifact: ${state.request.deliveryResultArtifactRef}\nLoop-Governance-Tail-Artifact: ${state.governanceRef}\nLoop-Publish-Intent: ${state.publishIntentArtifactRef}\n`
      : `${state.request.commitSubject}\n\nLoop-Run-Id: ${id.runId}\nLoop-Delivery-Artifact: ${state.request.deliveryResultArtifactRef}\nLoop-Publish-Intent: ${state.publishIntentArtifactRef}\n`;

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
    const expectedMsg = state.mode === "governed"
      ? `${state.request.commitSubject}\n\nLoop-Run-Id: ${id.runId}\nLoop-Delivery-Artifact: ${state.request.deliveryResultArtifactRef}\nLoop-Governance-Tail-Artifact: ${state.governanceRef}\nLoop-Publish-Intent: ${state.publishIntentArtifactRef}\n`
      : `${state.request.commitSubject}\n\nLoop-Run-Id: ${id.runId}\nLoop-Delivery-Artifact: ${state.request.deliveryResultArtifactRef}\nLoop-Publish-Intent: ${state.publishIntentArtifactRef}\n`;
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

    // Read commit files using strict parser
    let commitFiles: Set<string>;
    try {
      commitFiles = parseNameStatusZ(filesResult.stdout, "diff-tree commit");
    } catch {
      return false;
    }

    const expectedFiles = new Set(state.effectiveFiles!);
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

    // Build canonical PR body. Standalone keeps the D07 body bytes (raw
    // interpolation, no governed escaping helper); governed uses the fixed
    // governed section order with deterministic scalar escaping.
    const canonicalBody = state.mode === "governed"
      ? this._buildGovernedPrBody(state, commitSha)
      : this._buildStandalonePrBody(state, commitSha);
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

  // ═══════════════════════════════════════ PR Body Builders

  // Standalone body — byte-identical to the D07 contract. Raw interpolation
  // only; must never invoke the governed escaping helper.
  private _buildStandalonePrBody(state: InternalState, commitSha: string): string {
    const id = state.request.identity;
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
    for (const f of state.effectiveFiles!) {
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
    return bodyLines.join("\n") + "\n";
  }

  // Governed body — fixed LOOP-DELIVERY-09 section order. Every scalar is
  // passed through the deterministic Markdown escaping; unknown exception /
  // runner stdout/stderr text is never written; the seven free-form Decision
  // Basis fields are never copied verbatim (null evidence renders
  // `basis recorded in governance-tail artifact`).
  private _buildGovernedPrBody(state: InternalState, commitSha: string): string {
    const a1 = state.governanceValue!;
    const id = state.request.identity;
    const esc = escapeMarkdownScalar;
    const evidenceRef = (e: { path: string; version: string; digest_sha256: string } | null): string =>
      e !== null
        ? `\`<${esc(e.path)}>\` v\`${esc(e.version)}\` sha256 \`${esc(e.digest_sha256)}\``
        : "basis recorded in governance-tail artifact";

    const lines: string[] = [];
    lines.push("## LOOP-DELIVERY-09 — Governed Delivery Publish");
    lines.push("");
    lines.push("### Identity And Publish");
    lines.push("");
    lines.push(`- Run ID: \`<${esc(id.runId)}>\``);
    lines.push(`- Requirement ID: \`<${esc(id.requirementId)}>\``);
    lines.push(`- Repository: \`<${esc(id.repository)}>\``);
    lines.push(`- Base branch: \`<${esc(id.baseBranch)}>\``);
    lines.push(`- Expected base SHA: \`<${esc(id.expectedBaseSha)}>\``);
    lines.push(`- Task branch: \`<${esc(id.taskBranch)}>\``);
    lines.push(`- Commit SHA: \`<${esc(commitSha)}>\``);
    lines.push(`- Publish intent: \`<${esc(state.publishIntentArtifactRef!)}>\``);
    lines.push("");
    lines.push("### Artifact Chain");
    lines.push("");
    lines.push(`- Orchestration result artifact: \`<${esc(a1.orchestration_result_artifact_ref)}>\``);
    lines.push(`- Executor-input artifact: \`<${esc(a1.executor_input_artifact_ref)}>\``);
    lines.push(`- Delivery result artifact: \`<${esc(a1.delivery_result_artifact_ref)}>\``);
    lines.push(`- Governance-tail result artifact: \`<${esc(state.governanceRef!)}>\``);
    lines.push("");
    lines.push("### DocFlow Evidence");
    lines.push("");
    lines.push(`- Implementation record: ${evidenceRef(a1.docflow.implementation_record)}`);
    lines.push(`- Code review: ${evidenceRef({ path: a1.docflow.code_review.path, version: a1.docflow.code_review.version, digest_sha256: a1.docflow.code_review.digest_sha256 })} result \`${esc(a1.docflow.code_review.result)}\``);
    lines.push(`- Test acceptance: ${evidenceRef({ path: a1.docflow.test_acceptance.path, version: a1.docflow.test_acceptance.version, digest_sha256: a1.docflow.test_acceptance.digest_sha256 })} result \`${esc(a1.docflow.test_acceptance.result)}\``);
    lines.push("");
    lines.push("### Conditional Governance Evidence");
    lines.push("");
    const sync = a1.business_domain_sync;
    lines.push(`- Sync decision: \`${esc(sync.decision)}\``);
    lines.push(`- Sync write authorization: \`${sync.write_authorized ? "true" : "false"}\``);
    lines.push(`- Sync execution status: \`${esc(sync.execution_status)}\``);
    lines.push(`- Sync evidence: ${evidenceRef(sync.evidence)}`);
    const reconcile = a1.reconcile;
    lines.push(`- Reconcile decision: \`${esc(reconcile.decision)}\``);
    lines.push(`- Reconcile execution status: \`${esc(reconcile.execution_status)}\``);
    lines.push(`- Reconcile evidence: ${evidenceRef(reconcile.evidence)}`);
    const entry = a1.entry_coverage;
    lines.push(`- Entry Coverage status: \`${esc(entry.status)}\``);
    lines.push(`- Entry Coverage evidence: ${evidenceRef(entry.evidence)}`);
    const regate = a1.regate;
    lines.push(`- Re-Gate status: \`${esc(regate.status)}\``);
    lines.push(`- Re-Gate evidence: ${evidenceRef(regate.evidence)}`);
    lines.push("");
    lines.push("### Manifest And Tail Gate");
    lines.push("");
    const manifest = a1.manifest;
    lines.push(`- Manifest path: \`<${esc(manifest.path)}>\``);
    lines.push(`- Manifest version: \`${esc(manifest.version)}\``);
    lines.push(`- Manifest digest: \`${esc(manifest.digest_sha256)}\``);
    lines.push(`- Manifest tail status: \`${esc(manifest.tail_status)}\``);
    lines.push(`- Completion decision source: ${evidenceRef(manifest.completion_decision_source)}`);
    const gate = a1.tail_gate;
    lines.push(`- Tail Gate path: \`<${esc(gate.path)}>\``);
    lines.push(`- Tail Gate version: \`${esc(gate.version)}\``);
    lines.push(`- Tail Gate digest: \`${esc(gate.digest_sha256)}\``);
    lines.push(`- Tail Gate result: \`${esc(gate.result)}\``);
    lines.push(`- Tail Gate persisted: \`${gate.persisted ? "true" : "false"}\``);
    lines.push(`- Tail Gate read back verified: \`${gate.read_back_verified ? "true" : "false"}\``);
    lines.push(`- Tail Gate reviewed manifest version: \`${esc(gate.reviewed_manifest_version)}\``);
    lines.push("");
    lines.push("### Implementation Files");
    lines.push("");
    for (const f of a1.implementation_files) {
      lines.push(`- \`<${esc(f)}>\``);
    }
    lines.push("");
    lines.push("### Final Governed Files");
    lines.push("");
    for (const f of a1.files) {
      lines.push(`- \`<${esc(f)}>\``);
    }
    lines.push("");
    lines.push("### Governance");
    lines.push("");
    lines.push("- Draft: true");
    lines.push("- Review: pending project controller review");
    lines.push("- Merge: not authorized");
    lines.push("- Requirement completion: not established by this PR");
    lines.push("- D09 overall: pending coordinator terminal result");
    lines.push("- Exchange: not published");
    lines.push("- Personal KB: not published");
    return lines.join("\n") + "\n";
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

    // Build result object in canonical fixed order (per mode)
    const status: LoopDeliveryPublishStatus =
      finalReasonCode === "PUBLISH_SUCCEEDED" ? "succeeded" :
      finalReasonCode === "BASE_BRANCH_DRIFT" || finalReasonCode === "WORKSPACE_DRIFT" ||
      finalReasonCode === "WORKSPACE_STATE_CONFLICT" || finalReasonCode === "REMOTE_BRANCH_CONFLICT" ||
      finalReasonCode === "PR_STATE_CONFLICT" || finalReasonCode === "EXECUTION_BLOCKED" ? "blocked" : "failed";

    const finalStage = recoveryStage ?? state.recoveryStage;

    // Add terminal trace entry
    this._addTrace(state, "terminal", finalReasonCode === "PUBLISH_SUCCEEDED" ? "succeeded" : "failed",
      null, state.commitSha, state.remoteBranchSha, state.prNumber, elapsed);

    const resultObj = this._buildResultRecord(state, status, finalReasonCode, finalStage, elapsed);

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

    // If store failed, override to ARTIFACT_STORE_FAILED. The governed field
    // set is preserved — never degraded to the standalone field set.
    let finalResult: Record<string, unknown>;
    if (storeFailed) {
      finalResult = this._buildResultRecord(state, "failed", "ARTIFACT_STORE_FAILED", finalStage, elapsed);
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
    // The governed runtime result must OWN the governance ref key ONLY when a
    // validated ref exists, and the value must be exactly the validated
    // string. Raw null/number/object/empty/malformed/wrong-kind inputs never
    // surface as an own property (no `undefined` own property either). The
    // standalone runtime result must NOT gain any new own property
    // (byte/own-key compatibility with the authorized Source).
    if (state.mode === "governed" && state.governanceRef !== null) {
      (publishResult as any).governanceTailResultArtifactRef = state.governanceRef;
    }

    return deepFreeze(publishResult) as LoopDeliveryPublishResult;
  }

  // Canonical persisted result record in fixed property order.
  // Standalone: `loop-publish-result-v1` (D07 byte contract).
  // Governed: `loop-governed-publish-result-v1` with the evidence chain refs.
  private _buildResultRecord(
    state: InternalState,
    status: LoopDeliveryPublishStatus,
    reasonCode: string,
    recoveryStage: string,
    elapsedMs: number,
  ): Record<string, unknown> {
    const record: Record<string, unknown> = Object.create(null);
    const trace = state.trace.map((te) => ({
      sequence: te.sequence,
      stage: te.stage,
      outcome: te.outcome,
      artifact_ref: te.artifactRef,
      commit_sha: te.commitSha,
      remote_branch_sha: te.remoteBranchSha,
      pr_number: te.prNumber,
      elapsed_ms: te.elapsedMs,
    }));
    if (state.mode === "governed") {
      record.schema = "loop-governed-publish-result-v1";
      record.status = status;
      record.reason_code = reasonCode;
      record.cause_code = null;
      record.recovery_stage = recoveryStage;
      record.orchestration_result_artifact_ref = state.governanceOrchestrationRef ?? null;
      record.executor_input_artifact_ref = state.governanceExecutorInputRef ?? null;
      record.delivery_result_artifact_ref = state.request.deliveryResultArtifactRef;
      // Persisted contract: governance_tail_result_artifact_ref is the
      // validated string or null. Raw malformed/non-string request values are
      // never written as an artifact ref; pre-validation failures write null;
      // a validated ref may be written even when a later gate failed.
      record.governance_tail_result_artifact_ref = state.governanceRef !== null ? state.governanceRef : null;
      record.publish_intent_artifact_ref = state.publishIntentArtifactRef ?? null;
      record.precommit_head_sha = state.precommitHeadSha ?? null;
      record.commit_sha = state.commitSha ?? null;
      record.remote_branch_sha = state.remoteBranchSha ?? null;
      record.pr_number = state.prNumber ?? null;
      record.pr_url = state.prUrl ?? null;
      record.implementation_files = state.governanceValue !== null
        ? [...(state.governanceValue.implementation_files as readonly string[])]
        : [];
      record.files = state.effectiveFiles ? [...state.effectiveFiles] : [];
      record.commit_created = state.commitCreated;
      record.commit_recovered = state.commitRecovered;
      record.push_created = state.pushCreated;
      record.push_recovered = state.pushRecovered;
      record.pr_created = state.prCreated;
      record.pr_recovered = state.prRecovered;
      record.pr_body_sha256 = state.prBodySha256 ?? null;
      record.elapsed_ms = elapsedMs;
      record.trace = trace;
    } else {
      record.schema = "loop-publish-result-v1";
      record.status = status;
      record.reason_code = reasonCode;
      record.cause_code = null;
      record.recovery_stage = recoveryStage;
      record.delivery_result_artifact_ref = state.request.deliveryResultArtifactRef;
      record.publish_intent_artifact_ref = state.publishIntentArtifactRef ?? null;
      record.precommit_head_sha = state.precommitHeadSha ?? null;
      record.commit_sha = state.commitSha ?? null;
      record.remote_branch_sha = state.remoteBranchSha ?? null;
      record.pr_number = state.prNumber ?? null;
      record.pr_url = state.prUrl ?? null;
      record.files = state.effectiveFiles ? [...state.effectiveFiles] : [];
      record.commit_created = state.commitCreated;
      record.commit_recovered = state.commitRecovered;
      record.push_created = state.pushCreated;
      record.push_recovered = state.pushRecovered;
      record.pr_created = state.prCreated;
      record.pr_recovered = state.prRecovered;
      record.pr_body_sha256 = state.prBodySha256 ?? null;
      record.elapsed_ms = elapsedMs;
      record.trace = trace;
    }
    return record;
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
        if (typeof n !== "number" || !Number.isSafeInteger(n) || !isFinite(n)) return null;
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
      return state.lastClockMs;
    }
    // Detect backward clock movement
    if (n < state.lastClockMs) {
      state.clockError = true;
      state.deadlineGate = "clock_error";
      return state.lastClockMs;
    }
    state.lastClockMs = n;
    return n;
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

    // Governed pre-staging gate. The first D03 reconciliation before staging
    // (governed mode, staging not yet started — stagedTreeSha still empty —
    // and HEAD still at the effective precommit HEAD) re-verifies that the
    // CURRENT snapshot still matches the A1 final workspace authority. A
    // matching changed-path set alone cannot prove the bytes still correspond
    // to the A1 final workspace: bytes may drift while HEAD and the changed
    // path set stay unchanged. The status digest is therefore re-checked
    // against the A1 final workspace digest (never the D06 digest) before any
    // `git add`. Fails closed with WORKSPACE_STATE_CONFLICT with zero write
    // side-effects. Paths that already entered publish-commit recovery with
    // HEAD advanced past precommit are excluded by the stage-aware condition
    // above and keep the existing commit verification contract.
    if (
      state.mode === "governed" &&
      state.stagedTreeSha === null &&
      snapshot.taskHeadSha === state.precommitHeadSha
    ) {
      const finalWs = state.effectiveFinalWorkspace;
      if (finalWs === null) {
        return await this._terminalize(state, "WORKSPACE_STATE_CONFLICT", safeMessage("effective final workspace missing"), null);
      }
      if (!snapshot.taskHasChanges) {
        return await this._terminalize(state, "WORKSPACE_STATE_CONFLICT", safeMessage("final workspace changes lost"), null);
      }
      if (snapshot.taskStatusDigestSha256 !== finalWs.status_digest_sha256) {
        return await this._terminalize(state, "WORKSPACE_STATE_CONFLICT", safeMessage("final workspace status digest drift"), null);
      }
      if (snapshot.taskHeadSha !== finalWs.task_head_sha) {
        return await this._terminalize(state, "WORKSPACE_STATE_CONFLICT", safeMessage("final workspace task head drift"), null);
      }
    }

    return null;
  }

  private async _runGit(
    state: InternalState,
    args: readonly string[],
    allowNonZero: boolean,
  ): Promise<LoopPosixProcessResult | null> {
    try {
      return await this._runCommand(state, this.gitExecutableId, args, allowNonZero);
    } catch (e) {
      if (isTypedRunnerError(e) || e instanceof DependencyResultInvalidError) {
        // Propagate typed/malformed errors — callers must handle taxonomy
        throw e;
      }
      // Unexpected errors (including forged lookalikes): propagate to
      // the unexpected-error path → INTERNAL_ERROR
      throw e;
    }
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
        throw new DependencyResultInvalidError(`invalid runner result: ${(val as { ok: false; reason: string }).reason}`);
      }
      if (result.stdoutTruncated || result.stderrTruncated) {
        throw new DependencyResultInvalidError("runner result truncated");
      }

      return result;
    } catch (e) {
      if (isTypedRunnerError(e) || e instanceof DependencyResultInvalidError) {
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
    try {
      return await this._runCommand(state, this.ghExecutableId, args, allowNonZero);
    } catch (e) {
      if (isTypedRunnerError(e) || e instanceof DependencyResultInvalidError) {
        // Propagate typed/malformed errors — callers must handle taxonomy
        throw e;
      }
      // Unexpected errors (including forged lookalikes): propagate to
      // the unexpected-error path → INTERNAL_ERROR
      throw e;
    }
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
        throw new DependencyResultInvalidError(`invalid runner result: ${(val as { ok: false; reason: string }).reason}`);
      }
      if (result.stdoutTruncated || result.stderrTruncated) {
        throw new DependencyResultInvalidError("runner result truncated");
      }

      return result;
    } catch (e) {
      if (isTypedRunnerError(e) || e instanceof DependencyResultInvalidError) {
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

      // Validate result — malformed ones are DEPENDENCY_RESULT_INVALID
      const val = validateRunnerResult(result, this.maxCommandOutputBytes, this.maxCommandOutputBytes);
      if (!val.ok) {
        // Malformed result: fail closed as DEPENDENCY_RESULT_INVALID
        throw new DependencyResultInvalidError(
          `malformed runner result: ${(val as { ok: false; reason: string }).reason}`);
      }

      // Truncated output: fail closed before acting on content
      if (result.stdoutTruncated || result.stderrTruncated) {
        throw new DependencyResultInvalidError("runner result truncated");
      }

      // Non-zero exit when not allowed
      if (!allowNonZero && result.exitCode !== 0) {
        return null;
      }

      // timed_out: treat as failure
      if (result.status === "timed_out") {
        return null;
      }

      return result;
    } catch (e) {
      if (isTypedRunnerError(e)) {
        // Real D02 typed error: propagate for taxonomy mapping
        throw e;
      }
      if (e instanceof DependencyResultInvalidError) {
        // Malformed/truncated dependency result: fail closed
        throw e;
      }
      // Any other unexpected error (including forged lookalikes with
      // name/code set on a plain Error): propagate to the unexpected-error
      // path → INTERNAL_ERROR. Never collapse into a generic null here.
      throw e;
    }
  }
}

// ═══════════════════════════════════════ Additive canonical parser (D07-owned)
// =============================================================================
// The strict canonical parser for the artifacts this module produces
// (`loop-publish-result-v1` standalone and `loop-governed-publish-result-v1`
// governed). It is the SINGLE authority for the serialized status/reason/
// recovery/trace vocabulary, canonical key order and canonical bytes of the
// publish result artifact — it co-evolves with `_buildResultRecord` above and
// never duplicates another module's schema. No-throw, fail-closed, bounded
// defensive copy, strict UTF-8, exact keys, canonical property order,
// canonical-bytes rebuild with byte-identical round-trip, artifact-ref/digest/
// mode/material binding. When expected facts are provided they bind exactly.

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

/** Canonical value parsed from `loop-governed-publish-result-v1` / `loop-publish-result-v1` bytes. */
export interface LoopParsedPublishTraceEntry {
  readonly sequence: number;
  readonly stage: string;
  readonly outcome: string;
  readonly artifactRef: string | null;
  readonly commitSha: string | null;
  readonly remoteBranchSha: string | null;
  readonly prNumber: number | null;
  readonly elapsedMs: number;
}

export interface LoopParsedPublishResult {
  readonly schema: "loop-governed-publish-result-v1" | "loop-publish-result-v1";
  readonly status: LoopDeliveryPublishStatus;
  readonly reasonCode: LoopDeliveryPublishReasonCode;
  readonly causeCode: string | null;
  readonly recoveryStage: LoopDeliveryPublishRecoveryStage;
  readonly orchestrationResultArtifactRef: string | null;
  readonly executorInputArtifactRef: string | null;
  readonly deliveryResultArtifactRef: string;
  readonly governanceTailResultArtifactRef: string | null;
  readonly publishIntentArtifactRef: string | null;
  readonly precommitHeadSha: string | null;
  readonly commitSha: string | null;
  readonly remoteBranchSha: string | null;
  readonly prNumber: number | null;
  readonly prUrl: string | null;
  readonly implementationFiles: readonly string[];
  readonly files: readonly string[];
  readonly commitCreated: boolean;
  readonly commitRecovered: boolean;
  readonly pushCreated: boolean;
  readonly pushRecovered: boolean;
  readonly prCreated: boolean;
  readonly prRecovered: boolean;
  readonly prBodySha256: string | null;
  readonly elapsedMs: number;
  readonly trace: readonly LoopParsedPublishTraceEntry[];
}

export interface LoopParseDeliveryPublishOptions {
  readonly maxBytes?: number;
  readonly expectedMode?: LoopDeliveryPublishMode;
  readonly expectedOrchestrationResultArtifactRef?: string;
  readonly expectedExecutorInputArtifactRef?: string;
  readonly expectedDeliveryResultArtifactRef?: string;
  readonly expectedGovernanceTailResultArtifactRef?: string;
  readonly expectedImplementationFiles?: readonly string[];
  readonly expectedFiles?: readonly string[];
}

// Canonical serialized property orders produced by `_buildResultRecord`.
const GOVERNED_RESULT_KEYS = [
  "schema", "status", "reason_code", "cause_code", "recovery_stage", "orchestration_result_artifact_ref",
  "executor_input_artifact_ref", "delivery_result_artifact_ref", "governance_tail_result_artifact_ref",
  "publish_intent_artifact_ref", "precommit_head_sha", "commit_sha", "remote_branch_sha", "pr_number",
  "pr_url", "implementation_files", "files", "commit_created", "commit_recovered", "push_created",
  "push_recovered", "pr_created", "pr_recovered", "pr_body_sha256", "elapsed_ms", "trace",
] as const;
const STANDALONE_RESULT_KEYS = [
  "schema", "status", "reason_code", "cause_code", "recovery_stage", "delivery_result_artifact_ref",
  "publish_intent_artifact_ref", "precommit_head_sha", "commit_sha", "remote_branch_sha", "pr_number",
  "pr_url", "files", "commit_created", "commit_recovered", "push_created", "push_recovered",
  "pr_created", "pr_recovered", "pr_body_sha256", "elapsed_ms", "trace",
] as const;
const PUBLISH_TRACE_ENTRY_KEYS = [
  "sequence", "stage", "outcome", "artifact_ref", "commit_sha", "remote_branch_sha", "pr_number",
  "elapsed_ms",
] as const;

// Canonical serialized unions of this module (same values as the public types).
const PUBLISH_STATUS_VALUES: readonly string[] = ["succeeded", "failed", "blocked"];
const PUBLISH_REASON_CODE_VALUES: readonly string[] = [
  "PUBLISH_SUCCEEDED", "INVALID_INPUT", "DELIVERY_NOT_READY", "GOVERNANCE_TAIL_NOT_READY",
  "WORKSPACE_DRIFT", "WORKSPACE_STATE_CONFLICT", "BASE_BRANCH_DRIFT", "DEPENDENCY_RESULT_INVALID",
  "ARTIFACT_STORE_FAILED", "COMMIT_FAILED", "REMOTE_BRANCH_CONFLICT", "PUSH_FAILED", "PR_STATE_CONFLICT",
  "PR_CREATE_FAILED", "EXECUTION_BLOCKED", "TOTAL_TIMEOUT", "INTERNAL_ERROR",
];
const PUBLISH_RECOVERY_STAGE_VALUES: readonly string[] = [
  "not_started", "delivery_verified", "governance_verified", "intent_persisted", "commit_created",
  "branch_pushed", "draft_pr_created", "completed",
];

// ═══════════════════════════════════════ Parser toolkit

const PARSER_MAX_ARTIFACT_BYTES_BOUND = 16_777_216;
const PARSER_MAX_SAFE_MESSAGE_LENGTH = 256;
const PARSER_MAX_STRING_UTF8_BYTES = 65_536;
const PARSER_REF_RE = /^loop-artifact:v1:([a-z_]+):sha256:([0-9a-f]{64})$/;
const PARSER_SHA256_RE = /^[0-9a-f]{64}$/;
const PARSER_SHA40_RE = /^[0-9a-f]{40}$/;
const PARSER_CONTROL_RE = /[\x00-\x1f\x7f-\x9f]/;

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

function parserUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function parserSha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function parserAsNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    parserValidationFail("invalid_input", `${label} must be a trimmed non-empty string`);
  }
  return value;
}

function parserAsBoundedString(value: unknown, label: string, maxUtf8Bytes: number): string {
  const text = parserAsNonEmptyString(value, label);
  if (PARSER_CONTROL_RE.test(text)) parserValidationFail("invalid_input", `${label} must not contain control characters`);
  if (text.length > maxUtf8Bytes) parserValidationFail("invalid_input", `${label} exceeds the byte bound`);
  return text;
}

function parserAsSafeInt(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    parserValidationFail("invalid_input", `${label} must be a safe integer within bounds`);
  }
  return value;
}

function parserAsNullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return parserAsNonEmptyString(value, label);
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

function parserAsNullableSha40(value: unknown, label: string): string | null {
  if (value === null) return null;
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

/**
 * Trace-stage artifact refs: in governed mode the `governance_tail` stage
 * carries the governance-tail artifact ref and every other stage carries a
 * workspace-metadata ref; standalone mode only ever emits workspace-metadata
 * refs. This mirrors exactly what `_addTrace` actually writes.
 */
function parserAsNullableTraceRef(value: unknown, label: string, governed: boolean): string | null {
  if (value === null) return null;
  const s = parserAsNonEmptyString(value, label);
  const m = PARSER_REF_RE.exec(s);
  if (m === null || (m[1] !== "workspace_metadata" && !(governed && m[1] === "governance_tail_result"))) {
    parserValidationFail("invalid_input", `${label} must be a canonical trace artifact ref for the mode`);
  }
  return s;
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

function parserSameStringArray(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ═══════════════════════════════════════ Parser implementation

/**
 * Strict canonical parser for `loop-governed-publish-result-v1` /
 * `loop-publish-result-v1` (D07 publish result artifact). Fail-closed,
 * no-throw. When `expectedMode` is provided, the schema must match the mode;
 * every provided expected fact must bind exactly. For governed results the
 * orchestration / executor-input / governance refs and implementation files
 * are bound when expected options are provided (and must be non-null then);
 * the standalone schema never carries those fields, so governed-only expected
 * options fail closed against standalone results.
 */
export function parseLoopDeliveryPublishResultBytes(
  bytes: Uint8Array,
  options?: Readonly<LoopParseDeliveryPublishOptions>,
): LoopCanonicalParseResult<LoopParsedPublishResult> {
  try {
    const maxBytes = parserResolveMaxBytes(options?.maxBytes, DEFAULT_MRA);
    const intake = parserTakeCanonicalBytes(bytes, maxBytes, true);
    const rawParsed = intake.parsed as Record<string, unknown> | null | undefined;
    const schema = rawParsed === null || rawParsed === undefined || typeof rawParsed !== "object"
      ? undefined
      : (rawParsed as Record<string, unknown>).schema;
    const governed = schema === "loop-governed-publish-result-v1";
    const standalone = schema === "loop-publish-result-v1";
    if (!governed && !standalone) parserValidationFail("invalid_input", "publish result schema is not canonical");
    if (options?.expectedMode !== undefined) {
      const modeMatches = (options.expectedMode === "governed" && governed) || (options.expectedMode === "standalone" && standalone);
      if (!modeMatches) parserValidationFail("invalid_input", "publish result mode binding mismatch");
    }
    if (standalone) {
      if (options?.expectedOrchestrationResultArtifactRef !== undefined
        || options?.expectedExecutorInputArtifactRef !== undefined
        || options?.expectedImplementationFiles !== undefined) {
        parserValidationFail("invalid_input", "standalone publish result cannot bind governed-only expected facts");
      }
    }
    const rec = parserScanPlainObject(intake.parsed, governed ? GOVERNED_RESULT_KEYS : STANDALONE_RESULT_KEYS, "publish result");
    if (typeof rec.status !== "string" || !PUBLISH_STATUS_VALUES.includes(rec.status)) {
      parserValidationFail("invalid_input", "publish result status is not canonical");
    }
    if (typeof rec.reason_code !== "string" || !PUBLISH_REASON_CODE_VALUES.includes(rec.reason_code)) {
      parserValidationFail("invalid_input", "publish result reason_code is not canonical");
    }
    const causeCode = parserAsNullableString(rec.cause_code, "publish result cause_code");
    if (typeof rec.recovery_stage !== "string" || !PUBLISH_RECOVERY_STAGE_VALUES.includes(rec.recovery_stage)) {
      parserValidationFail("invalid_input", "publish result recovery_stage is not canonical");
    }
    let orchestrationRef: string | null = null;
    let executorRef: string | null = null;
    let governanceRef: string | null = null;
    let implementationFiles: readonly string[] = Object.freeze([]);
    if (governed) {
      orchestrationRef = parserAsNullableRef(rec.orchestration_result_artifact_ref, "publish result orchestration_result_artifact_ref", "orchestration_result");
      executorRef = parserAsNullableRef(rec.executor_input_artifact_ref, "publish result executor_input_artifact_ref", "executor_input");
      governanceRef = parserAsNullableRef(rec.governance_tail_result_artifact_ref, "publish result governance_tail_result_artifact_ref", "governance_tail_result");
      implementationFiles = Object.freeze(parserValidatePathArray(rec.implementation_files, "publish result implementation_files"));
    }
    const deliveryRef = parserArtifactRefOf(rec.delivery_result_artifact_ref, "publish result delivery_result_artifact_ref", "delivery_result");
    const intentRef = parserAsNullableRef(rec.publish_intent_artifact_ref, "publish result publish_intent_artifact_ref", "workspace_metadata");
    const precommitHead = parserAsNullableSha40(rec.precommit_head_sha, "publish result precommit_head_sha");
    const commitSha = parserAsNullableSha40(rec.commit_sha, "publish result commit_sha");
    const remoteBranchSha = parserAsNullableSha40(rec.remote_branch_sha, "publish result remote_branch_sha");
    const prNumberRaw = rec.pr_number;
    if (prNumberRaw !== null) {
      parserAsSafeInt(prNumberRaw, "publish result pr_number", 1, 2_147_483_647);
    }
    const prUrl = parserAsNullableString(rec.pr_url, "publish result pr_url");
    const files = Object.freeze(parserValidatePathArray(rec.files, "publish result files"));
    for (const flag of ["commit_created", "commit_recovered", "push_created", "push_recovered", "pr_created", "pr_recovered"] as const) {
      if (typeof rec[flag] !== "boolean") parserValidationFail("invalid_input", `publish result ${flag} must be a boolean`);
    }
    const prBodySha256 = parserAsNullableSha256(rec.pr_body_sha256, "publish result pr_body_sha256");
    const elapsedMs = parserAsSafeInt(rec.elapsed_ms, "publish result elapsed_ms", 0, MAX_TD);
    const traceArr = parserScanPlainArray(rec.trace, "publish result trace", 4096);
    const trace: LoopParsedPublishTraceEntry[] = [];
    let lastSequence = 0;
    for (let i = 0; i < traceArr.length; i++) {
      const entry = parserScanPlainObject(traceArr[i], PUBLISH_TRACE_ENTRY_KEYS, `publish result trace[${i}]`);
      const sequence = parserAsSafeInt(entry.sequence, `publish result trace[${i}].sequence`, 1, 1_000_000);
      if (sequence <= lastSequence) parserValidationFail("invalid_input", "publish result trace sequences must be strictly increasing");
      lastSequence = sequence;
      if (typeof entry.stage !== "string" || !PUBLISH_TRACE_STAGES.includes(entry.stage)) {
        parserValidationFail("invalid_input", `publish result trace[${i}].stage is not canonical`);
      }
      const outcome = parserSafeMessageText(entry.outcome, `publish result trace[${i}].outcome`);
      const artifactRef = parserAsNullableTraceRef(entry.artifact_ref, `publish result trace[${i}].artifact_ref`, governed);
      const tCommitSha = parserAsNullableSha40(entry.commit_sha, `publish result trace[${i}].commit_sha`);
      const tRemoteSha = parserAsNullableSha40(entry.remote_branch_sha, `publish result trace[${i}].remote_branch_sha`);
      const tPrNumber = entry.pr_number;
      const prNumberValue: number | null = tPrNumber === null
        ? null
        : parserAsSafeInt(tPrNumber, `publish result trace[${i}].pr_number`, 1, 2_147_483_647);
      const entryElapsed = parserAsSafeInt(entry.elapsed_ms, `publish result trace[${i}].elapsed_ms`, 0, MAX_TD);
      trace.push(Object.freeze({
        sequence,
        stage: entry.stage as string,
        outcome,
        artifactRef,
        commitSha: tCommitSha,
        remoteBranchSha: tRemoteSha,
        prNumber: prNumberValue,
        elapsedMs: entryElapsed,
      }));
    }
    const value: Readonly<LoopParsedPublishResult> = deepFreeze({
      schema: governed ? "loop-governed-publish-result-v1" : "loop-publish-result-v1",
      status: rec.status as LoopDeliveryPublishStatus,
      reasonCode: rec.reason_code as LoopDeliveryPublishReasonCode,
      causeCode,
      recoveryStage: rec.recovery_stage as LoopDeliveryPublishRecoveryStage,
      orchestrationResultArtifactRef: orchestrationRef,
      executorInputArtifactRef: executorRef,
      deliveryResultArtifactRef: deliveryRef.ref,
      governanceTailResultArtifactRef: governanceRef,
      publishIntentArtifactRef: intentRef,
      precommitHeadSha: precommitHead,
      commitSha,
      remoteBranchSha,
      prNumber: prNumberRaw as number | null,
      prUrl,
      implementationFiles,
      files,
      commitCreated: rec.commit_created as boolean,
      commitRecovered: rec.commit_recovered as boolean,
      pushCreated: rec.push_created as boolean,
      pushRecovered: rec.push_recovered as boolean,
      prCreated: rec.pr_created as boolean,
      prRecovered: rec.pr_recovered as boolean,
      prBodySha256,
      elapsedMs,
      trace: Object.freeze(trace),
    });
    if (options?.expectedDeliveryResultArtifactRef !== undefined && value.deliveryResultArtifactRef !== options.expectedDeliveryResultArtifactRef) {
      parserValidationFail("invalid_input", "publish result delivery ref binding mismatch");
    }
    if (options?.expectedGovernanceTailResultArtifactRef !== undefined
      && (value.governanceTailResultArtifactRef === null || value.governanceTailResultArtifactRef !== options.expectedGovernanceTailResultArtifactRef)) {
      parserValidationFail("invalid_input", "publish result governance tail ref binding mismatch");
    }
    if (options?.expectedFiles !== undefined && !parserSameStringArray(value.files, options.expectedFiles)) {
      parserValidationFail("invalid_input", "publish result files binding mismatch");
    }
    if (options?.expectedOrchestrationResultArtifactRef !== undefined
      && (value.orchestrationResultArtifactRef === null || value.orchestrationResultArtifactRef !== options.expectedOrchestrationResultArtifactRef)) {
      parserValidationFail("invalid_input", "publish result orchestration ref binding mismatch");
    }
    if (options?.expectedExecutorInputArtifactRef !== undefined
      && (value.executorInputArtifactRef === null || value.executorInputArtifactRef !== options.expectedExecutorInputArtifactRef)) {
      parserValidationFail("invalid_input", "publish result executor input ref binding mismatch");
    }
    if (options?.expectedImplementationFiles !== undefined
      && !parserSameStringArray(value.implementationFiles, options.expectedImplementationFiles)) {
      parserValidationFail("invalid_input", "publish result implementation files binding mismatch");
    }
    parserRequireRoundTrip(intake, true);
    return parserCanonicalParseSuccess(value, JSON.stringify(intake.parsed) + "\n", parserSha256Hex(intake.bytes), intake.bytes.length);
  } catch (error) {
    return parserAsFailure(error, "unexpected failure while parsing publish result");
  }
}
