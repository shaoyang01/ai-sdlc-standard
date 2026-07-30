// LOOP Executor Kernel — Delivery Failure Evidence Builder
// ===========================================================
// Pure module. No fs, child_process, Git, network, process.env,
// Runtime, or Artifact Store direct calls.
//
// Builds canonical, byte-identical failure evidence for test/repair
// and review/repair phases. Fixed property order, trailing LF, UTF-8,
// SHA-256 digest. All outputs are frozen.

import { createHash } from "node:crypto";

// ═══════════════════════════════════════ Types

export type LoopDeliveryEvidencePhase = "test" | "review";

export type LoopDeliveryEvidenceOutcomeCategory =
  | "TEST_FAILED"
  | "TEST_TIMED_OUT"
  | "TEST_OUTPUT_TRUNCATED"
  | "REVIEW_FAILED"
  | "REVIEW_TIMED_OUT"
  | "REVIEW_OUTPUT_TRUNCATED";

export interface LoopDeliveryEvidenceWorkspaceDigest {
  readonly task_branch: string;
  readonly task_head_sha: string;
  readonly status_digest_sha256: string;
}

export interface LoopDeliveryFailureEvidence {
  readonly schema: "loop-delivery-failure-evidence-v1";
  readonly phase: LoopDeliveryEvidencePhase;
  readonly fix_round: number;
  readonly plan_attempt: number;
  readonly failed_step_id: string;
  readonly outcome_category: LoopDeliveryEvidenceOutcomeCategory;
  readonly exit_code: number | null;
  readonly signal: string | null;
  readonly duration_ms: number;
  readonly stdout_truncated: boolean;
  readonly stderr_truncated: boolean;
  readonly stdout_excerpt: string;
  readonly stderr_excerpt: string;
  readonly workspace_before: LoopDeliveryEvidenceWorkspaceDigest;
  readonly workspace_after: LoopDeliveryEvidenceWorkspaceDigest;
}

export interface LoopDeliveryEvidenceInput {
  readonly phase: LoopDeliveryEvidencePhase;
  readonly fixRound: number;
  readonly planAttempt: number;
  readonly failedStepId: string;
  readonly outcomeCategory: LoopDeliveryEvidenceOutcomeCategory;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly durationMs: number;
  readonly stdoutTruncated: boolean;
  readonly stderrTruncated: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly workspaceBefore: LoopDeliveryEvidenceWorkspaceDigest;
  readonly workspaceAfter: LoopDeliveryEvidenceWorkspaceDigest;
}

export interface LoopDeliveryEvidenceSuccess {
  readonly ok: true;
  readonly text: string;
  readonly bytes: Uint8Array;
  readonly digestSha256: string;
  readonly sizeBytes: number;
}

export interface LoopDeliveryEvidenceFailure {
  readonly ok: false;
  readonly reason: "invalid_input" | "too_large";
}

export type LoopDeliveryEvidenceResult =
  | LoopDeliveryEvidenceSuccess
  | LoopDeliveryEvidenceFailure;

// ═══════════════════════════════════════ Constants

const EVIDENCE_SCHEMA = "loop-delivery-failure-evidence-v1" as const;

const VALID_PHASES: readonly string[] = ["test", "review"];

const VALID_OUTCOMES: readonly string[] = [
  "TEST_FAILED", "TEST_TIMED_OUT", "TEST_OUTPUT_TRUNCATED",
  "REVIEW_FAILED", "REVIEW_TIMED_OUT", "REVIEW_OUTPUT_TRUNCATED",
];

const NUL = "\x00";
const REPLACEMENT = "\uFFFD";
const SPACE = " ";

// Control character ranges for sanitization
// We keep LF (\n = 0x0a), TAB (\t = 0x09)
const C0_KEEP = new Set([0x09, 0x0a]); // TAB, LF

const STEP_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SHA40_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

// ═══════════════════════════════════════ Helpers

function freeze<T extends object>(o: T): Readonly<T> {
  return Object.freeze(o);
}

function isControlCharExceptTabLf(code: number): boolean {
  // C0: 0x00-0x1f (except TAB=0x09, LF=0x0a)
  // C1: 0x7f-0x9f
  if (C0_KEEP.has(code)) return false;
  return (code >= 0x00 && code <= 0x1f) || (code >= 0x7f && code <= 0x9f);
}

function sanitizeExcerptChar(code: number): string {
  if (code === 0x0d /* CR */) return "\n";
  if (code === 0x00 /* NUL */) return SPACE;
  if (code === 0xfffd /* U+FFFD */) return SPACE;
  if (isControlCharExceptTabLf(code)) return SPACE;
  return String.fromCodePoint(code);
}

/**
 * Sanitize a string for evidence excerpt.
 * - CR → LF
 * - NUL → space
 * - U+FFFD → space
 * - Other C0/C1 (except TAB, LF) → space
 * - Keep LF and TAB
 * - No credential or env map (caller's responsibility to not include them)
 */
function sanitizeExcerpt(input: string): string {
  const chars: string[] = [];
  // Use Array.from to properly handle surrogate pairs and code points
  const codePoints = Array.from(input, (c) => c.codePointAt(0) ?? 0xfffd);
  for (const cp of codePoints) {
    chars.push(sanitizeExcerptChar(cp));
  }
  return chars.join("");
}

/**
 * Take tail excerpt bounded by maxBytes (UTF-8 byte count).
 * Takes from the end, preserving Unicode code point boundaries.
 */
function tailExcerpt(input: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";

  // Encode to UTF-8 to get byte count
  const encoder = new TextEncoder();
  const encoded = encoder.encode(input);
  if (encoded.length <= maxBytes) return input;

  // Take last maxBytes bytes
  const tail = encoded.subarray(encoded.length - maxBytes);

  // Find the first complete UTF-8 sequence start in the tail
  // We might have cut into the middle of a multi-byte sequence
  let start = 0;
  while (start < tail.length) {
    const byte = tail[start]!;
    // Check if this is a continuation byte (10xxxxxx)
    if ((byte & 0xc0) === 0x80) {
      start++;
    } else {
      break;
    }
  }

  const safeTail = tail.subarray(start);
  const decoder = new TextDecoder("utf-8", { fatal: false });
  return decoder.decode(safeTail);
}

function validateWorkspaceDigest(
  v: unknown,
  label: string,
): { ok: true; value: LoopDeliveryEvidenceWorkspaceDigest } | { ok: false; reason: string } {
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    return { ok: false, reason: `${label} must be plain object` };
  }
  const o = v as Record<string, unknown>;

  const tb = o.task_branch;
  if (typeof tb !== "string" || tb.trim().length === 0 || tb !== tb.trim()) {
    return { ok: false, reason: `${label}.task_branch invalid` };
  }
  if (/[\x00-\x1f\x7f-\x9f]/.test(tb)) {
    return { ok: false, reason: `${label}.task_branch has control chars` };
  }

  const th = o.task_head_sha;
  if (typeof th !== "string" || !SHA40_RE.test(th)) {
    return { ok: false, reason: `${label}.task_head_sha must be 40-char hex` };
  }

  const sd = o.status_digest_sha256;
  if (typeof sd !== "string" || !SHA256_RE.test(sd)) {
    return { ok: false, reason: `${label}.status_digest_sha256 must be 64-char hex` };
  }

  return {
    ok: true,
    value: freeze({
      task_branch: tb,
      task_head_sha: th,
      status_digest_sha256: sd,
    }),
  };
}

function validateInput(
  input: unknown,
): { ok: true; value: LoopDeliveryEvidenceInput } | { ok: false; reason: string } {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, reason: "input must be plain object" };
  }

  let proto: unknown;
  try {
    proto = Object.getPrototypeOf(input);
  } catch {
    return { ok: false, reason: "getPrototypeOf threw" };
  }
  if (proto !== Object.prototype && proto !== null) {
    return { ok: false, reason: "input has bad prototype" };
  }

  const o = input as Record<string, unknown>;

  // phase
  const phase = o.phase;
  if (typeof phase !== "string" || !VALID_PHASES.includes(phase)) {
    return { ok: false, reason: "phase must be 'test' or 'review'" };
  }

  // fixRound
  const fixRound = o.fixRound;
  if (typeof fixRound !== "number" || !Number.isSafeInteger(fixRound) || fixRound < 0 || fixRound > 4) {
    return { ok: false, reason: "fixRound must be 0-4" };
  }

  // planAttempt
  const planAttempt = o.planAttempt;
  if (typeof planAttempt !== "number" || !Number.isSafeInteger(planAttempt) || planAttempt < 1 || planAttempt > 128) {
    return { ok: false, reason: "planAttempt must be 1-128" };
  }

  // failedStepId
  const failedStepId = o.failedStepId;
  if (typeof failedStepId !== "string" || !STEP_ID_RE.test(failedStepId)) {
    return { ok: false, reason: "failedStepId invalid" };
  }

  // outcomeCategory
  const outcomeCategory = o.outcomeCategory;
  if (typeof outcomeCategory !== "string" || !VALID_OUTCOMES.includes(outcomeCategory)) {
    return { ok: false, reason: "outcomeCategory invalid" };
  }

  // exitCode
  const exitCode = o.exitCode;
  if (exitCode !== null && (typeof exitCode !== "number" || !Number.isSafeInteger(exitCode) || exitCode < 0 || exitCode > 255)) {
    return { ok: false, reason: "exitCode must be null or 0-255" };
  }

  // signal
  const signal = o.signal;
  if (signal !== null && typeof signal !== "string") {
    return { ok: false, reason: "signal must be null or string" };
  }
  if (typeof signal === "string" && (signal.length === 0 || signal.length > 31 || /[\x00-\x1f\x7f-\x9f]/.test(signal))) {
    return { ok: false, reason: "signal invalid" };
  }

  // durationMs
  const durationMs = o.durationMs;
  if (typeof durationMs !== "number" || !Number.isSafeInteger(durationMs) || durationMs < 0 || durationMs > 600000) {
    return { ok: false, reason: "durationMs must be 0-600000" };
  }

  // stdoutTruncated
  const stdoutTruncated = o.stdoutTruncated;
  if (typeof stdoutTruncated !== "boolean") {
    return { ok: false, reason: "stdoutTruncated must be boolean" };
  }

  // stderrTruncated
  const stderrTruncated = o.stderrTruncated;
  if (typeof stderrTruncated !== "boolean") {
    return { ok: false, reason: "stderrTruncated must be boolean" };
  }

  // stdout
  const stdout = o.stdout;
  if (typeof stdout !== "string") {
    return { ok: false, reason: "stdout must be string" };
  }
  if (stdout.includes(NUL)) {
    return { ok: false, reason: "stdout contains NUL" };
  }

  // stderr
  const stderr = o.stderr;
  if (typeof stderr !== "string") {
    return { ok: false, reason: "stderr must be string" };
  }
  if (stderr.includes(NUL)) {
    return { ok: false, reason: "stderr contains NUL" };
  }

  // workspaceBefore
  const wbResult = validateWorkspaceDigest(o.workspaceBefore, "workspaceBefore");
  if (!wbResult.ok) {
    return { ok: false, reason: (wbResult as { ok: false; reason: string }).reason } as { ok: false; reason: string };
  }

  // workspaceAfter
  const waResult = validateWorkspaceDigest(o.workspaceAfter, "workspaceAfter");
  if (!waResult.ok) {
    return { ok: false, reason: (waResult as { ok: false; reason: string }).reason } as { ok: false; reason: string };
  }

  return {
    ok: true,
    value: {
      phase: phase as LoopDeliveryEvidencePhase,
      fixRound: fixRound as number,
      planAttempt: planAttempt as number,
      failedStepId: failedStepId as string,
      outcomeCategory: outcomeCategory as LoopDeliveryEvidenceOutcomeCategory,
      exitCode: exitCode as number | null,
      signal: signal as string | null,
      durationMs: durationMs as number,
      stdoutTruncated: stdoutTruncated as boolean,
      stderrTruncated: stderrTruncated as boolean,
      stdout: stdout as string,
      stderr: stderr as string,
      workspaceBefore: wbResult.value,
      workspaceAfter: waResult.value,
    },
  };
}

// ═══════════════════════════════════════ Builder

export function buildLoopDeliveryEvidence(
  input: LoopDeliveryEvidenceInput,
  maxEvidenceBytes: number,
  maxEvidenceExcerptBytes: number,
): LoopDeliveryEvidenceResult {
  // Validate limits
  if (typeof maxEvidenceBytes !== "number" || !Number.isSafeInteger(maxEvidenceBytes) ||
      maxEvidenceBytes < 256 || maxEvidenceBytes > 131072) {
    return freeze({ ok: false as const, reason: "too_large" as const });
  }
  if (typeof maxEvidenceExcerptBytes !== "number" || !Number.isSafeInteger(maxEvidenceExcerptBytes) ||
      maxEvidenceExcerptBytes < 1 || maxEvidenceExcerptBytes > maxEvidenceBytes) {
    return freeze({ ok: false as const, reason: "too_large" as const });
  }

  // Validate input
  const validation = validateInput(input);
  if (!validation.ok) {
    return freeze({ ok: false as const, reason: "invalid_input" as const });
  }
  const v = validation.value;

  // Build excerpts
  let stdoutExcerpt = sanitizeExcerpt(v.stdout);
  stdoutExcerpt = tailExcerpt(stdoutExcerpt, maxEvidenceExcerptBytes);

  let stderrExcerpt = sanitizeExcerpt(v.stderr);
  stderrExcerpt = tailExcerpt(stderrExcerpt, maxEvidenceExcerptBytes);

  // Build evidence object in fixed property order
  // We construct the JSON manually to guarantee order
  const evidenceObj: Record<string, unknown> = Object.create(null);

  evidenceObj.schema = EVIDENCE_SCHEMA;
  evidenceObj.phase = v.phase;
  evidenceObj.fix_round = v.fixRound;
  evidenceObj.plan_attempt = v.planAttempt;
  evidenceObj.failed_step_id = v.failedStepId;
  evidenceObj.outcome_category = v.outcomeCategory;
  evidenceObj.exit_code = v.exitCode;
  evidenceObj.signal = v.signal;
  evidenceObj.duration_ms = v.durationMs;
  evidenceObj.stdout_truncated = v.stdoutTruncated;
  evidenceObj.stderr_truncated = v.stderrTruncated;
  evidenceObj.stdout_excerpt = stdoutExcerpt;
  evidenceObj.stderr_excerpt = stderrExcerpt;

  evidenceObj.workspace_before = Object.create(null);
  (evidenceObj.workspace_before as Record<string, unknown>).task_branch = v.workspaceBefore.task_branch;
  (evidenceObj.workspace_before as Record<string, unknown>).task_head_sha = v.workspaceBefore.task_head_sha;
  (evidenceObj.workspace_before as Record<string, unknown>).status_digest_sha256 = v.workspaceBefore.status_digest_sha256;

  evidenceObj.workspace_after = Object.create(null);
  (evidenceObj.workspace_after as Record<string, unknown>).task_branch = v.workspaceAfter.task_branch;
  (evidenceObj.workspace_after as Record<string, unknown>).task_head_sha = v.workspaceAfter.task_head_sha;
  (evidenceObj.workspace_after as Record<string, unknown>).status_digest_sha256 = v.workspaceAfter.status_digest_sha256;

  // Canonical JSON with trailing LF
  // We use explicit JSON serialization
  const json = JSON.stringify(evidenceObj);
  const text = json + "\n";
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);

  // Check bounds
  if (bytes.length > maxEvidenceBytes) {
    return freeze({ ok: false as const, reason: "too_large" as const });
  }

  const digestSha256 = createHash("sha256").update(bytes).digest("hex");
  const sizeBytes = bytes.length;

  return freeze({
    ok: true,
    text,
    bytes,
    digestSha256,
    sizeBytes,
  });
}

// ═══════════════════════════════════════ Re-exports for testing

export {
  EVIDENCE_SCHEMA,
  VALID_PHASES,
  VALID_OUTCOMES,
  sanitizeExcerpt,
  tailExcerpt,
  validateInput as _validateEvidenceInput,
};
