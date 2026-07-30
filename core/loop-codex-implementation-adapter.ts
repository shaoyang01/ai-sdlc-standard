// LOOP Executor Kernel — Codex Multi-File Implementation Adapter
// ================================================================
// Standalone LOOP kernel adapter that:
//   1. Validates the request (fail-closed input validation)
//   2. Inspects the D03 workspace for drift
//   3. Reads bounded repair evidence when required
//   4. Builds a bounded phase-specific prompt
//   5. Invokes Codex through the injected D02 runner
//   6. Parses exactly one multi-file unified diff
//   7. Persists the exact patch bytes through D01 Artifact Store
//   8. Applies the exact persisted patch through D04 manager
//   9. Returns explicit succeeded or failed
//
// No shadow success. No fallback patches. No child_process, Git, or
// network access. All dependencies are injected.
//
// R1: Known-only D04 causeCode, structured prompt failure taxonomy,
// result immutability, correct INVALID_INPUT/PROMPT_TOO_LARGE/INTERNAL_ERROR
// classification.

import type { LoopRunIdentity } from "./loop-executor-types";
import { validateLoopRunIdentity } from "./loop-run-state";
import type { LoopPosixProcessRunner, LoopPosixProcessResult } from "./loop-posix-process-runner";
import type { LoopGitWorkspaceManager, LoopGitWorkspaceSnapshot } from "./loop-git-workspace";
import type { LoopArtifactStore, LoopArtifactKind } from "./loop-artifact-store";
import type { LoopPatchApplicationManager, LoopPatchApplicationResult } from "./loop-patch-application";
import { LoopPatchApplicationError } from "./loop-patch-application";
import {
  buildLoopCodexPrompt,
  DEFAULT_PROMPT_LIMITS,
  isPromptFailure,
  type LoopCodexImplementationPhase,
  type LoopCodexPromptInput,
  type LoopCodexPromptLimits,
  type LoopCodexPromptFailureReason,
} from "./loop-codex-prompt";
import {
  parseLoopCodexOutput,
  DEFAULT_OUTPUT_LIMITS,
  type LoopCodexOutputLimits,
  type LoopCodexOutputResult,
} from "./loop-codex-output";

// ═══════════════════════════════════════ Types

export type { LoopCodexImplementationPhase };

export interface LoopCodexImplementationWorkspace {
  readonly workspacePath: string;
  readonly taskBranch: string;
  readonly expectedTaskHeadSha: string;
  readonly expectedPreStatusDigestSha256: string;
}

export interface LoopCodexImplementationRequest {
  readonly identity: LoopRunIdentity;
  readonly workspace: LoopCodexImplementationWorkspace;
  readonly phase: LoopCodexImplementationPhase;
  readonly attempt: number;
  readonly requirement: string;
  readonly designSummary?: string;
  readonly implementationConstraints?: readonly string[];
  readonly allowedPaths: readonly string[];
  readonly repairEvidenceArtifactRef?: string;
}

export type LoopCodexImplementationErrorCode =
  | "INVALID_INPUT"
  | "WORKSPACE_DRIFT"
  | "REPAIR_EVIDENCE_REQUIRED"
  | "REPAIR_EVIDENCE_INVALID"
  | "PROMPT_TOO_LARGE"
  | "CODEX_SPAWN_FAILED"
  | "CODEX_TIMED_OUT"
  | "CODEX_NON_ZERO_EXIT"
  | "CODEX_OUTPUT_TOO_LARGE"
  | "CODEX_OUTPUT_INVALID"
  | "ARTIFACT_STORE_FAILED"
  | "PATCH_APPLICATION_FAILED"
  | "INTERNAL_ERROR";

export type LoopCodexImplementationApplicationState = "applied" | "already_applied";

export interface LoopCodexImplementationSuccess {
  readonly status: "succeeded";
  readonly phase: LoopCodexImplementationPhase;
  readonly attempt: number;
  readonly patchArtifactRef: string;
  readonly patchDigestSha256: string;
  readonly patchSizeBytes: number;
  readonly applicationState: LoopCodexImplementationApplicationState;
  readonly files: readonly string[];
  readonly preTaskHeadSha: string;
  readonly postTaskHeadSha: string;
  readonly preStatusDigestSha256: string;
  readonly postStatusDigestSha256: string;
  readonly preTargetStateDigestSha256: string;
  readonly postTargetStateDigestSha256: string;
}

export interface LoopCodexImplementationFailure {
  readonly status: "failed";
  readonly phase: LoopCodexImplementationPhase;
  readonly attempt: number;
  readonly errorCode: LoopCodexImplementationErrorCode;
  readonly retryable: boolean;
  readonly safeMessage: string;
  readonly causeCode?: string;
  readonly patchArtifactRef?: string;
  readonly patchDigestSha256?: string;
  readonly patchSizeBytes?: number;
}

export type LoopCodexImplementationResult =
  | LoopCodexImplementationSuccess
  | LoopCodexImplementationFailure;

export interface LoopCodexImplementationAdapterOptions {
  readonly runner: Pick<LoopPosixProcessRunner, "run">;
  readonly workspaceManager: Pick<LoopGitWorkspaceManager, "inspect">;
  readonly artifactStore: Pick<LoopArtifactStore, "read" | "put">;
  readonly patchApplicationManager: Pick<LoopPatchApplicationManager, "apply">;
  readonly codexExecutableId: string;
  readonly timeoutMs?: number;
  readonly maxPromptBytes?: number;
  readonly maxStdoutBytes?: number;
  readonly maxStderrBytes?: number;
  readonly maxPatchBytes?: number;
  readonly maxRepairEvidenceBytes?: number;
}

// ═══════════════════════════════════════ Constants

const MAX_SAFE_MESSAGE = 256;
const MAX_ATTEMPT = 1_000_000; // Reasonable upper bound — D06 sets the real limit
const ARTIFACT_REF_RE = /^loop-artifact:v1:([a-z_]+):sha256:([0-9a-f]{64})$/;
const NON_CONTROL_RE = /[\x00-\x1f\x7f-\x9f]/;

const OPTION_KEYS = [
  "runner", "workspaceManager", "artifactStore", "patchApplicationManager",
  "codexExecutableId", "timeoutMs", "maxPromptBytes", "maxStdoutBytes",
  "maxStderrBytes", "maxPatchBytes", "maxRepairEvidenceBytes",
];

const REQUEST_KEYS = [
  "identity", "workspace", "phase", "attempt", "requirement",
  "designSummary", "implementationConstraints", "allowedPaths",
  "repairEvidenceArtifactRef",
];

const WORKSPACE_KEYS = [
  "workspacePath", "taskBranch", "expectedTaskHeadSha", "expectedPreStatusDigestSha256",
];

// ═══════════════════════════════════════ Helpers

function safeMessage(msg: string): string {
  return msg.replace(NON_CONTROL_RE, " ").slice(0, MAX_SAFE_MESSAGE);
}

function freeze<T extends object>(o: T): Readonly<T> {
  return Object.freeze(o);
}

function scanPlain(v: unknown, allowed: readonly string[], label: string): Record<string, unknown> {
  if (v === null || typeof v !== "object") {
    throw new Error(`${label} must be an object`);
  }
  if (Array.isArray(v)) {
    throw new Error(`${label} must not be an array`);
  }
  let proto: unknown;
  try { proto = Object.getPrototypeOf(v); } catch {
    throw new Error(`${label} getPrototypeOf threw`);
  }
  if (proto !== Object.prototype && proto !== null) {
    throw new Error(`${label} has bad prototype`);
  }
  let keys: Array<string | symbol>;
  try { keys = Reflect.ownKeys(v) as Array<string | symbol>; } catch {
    throw new Error(`${label} ownKeys threw`);
  }
  const out = Object.create(null) as Record<string, unknown>;
  for (const k of keys) {
    if (typeof k === "symbol") throw new Error(`${label} has symbol key`);
    if (k === "__proto__") throw new Error(`${label} has __proto__ key`);
    if (!allowed.includes(k)) throw new Error(`${label} has unknown key`);
    let desc: PropertyDescriptor;
    try { desc = Object.getOwnPropertyDescriptor(v, k)!; } catch {
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

function validateWorkspaceField(
  v: unknown, label: string, shaPattern?: RegExp,
): { ok: true; value: string } | { ok: false } {
  if (typeof v !== "string") return { ok: false };
  if (v.length === 0) return { ok: false };
  if (v.trim().length === 0) return { ok: false };
  if (v !== v.trim()) return { ok: false };
  if (/[\x00-\x1f\x7f-\x9f]/.test(v)) return { ok: false };
  if (shaPattern && !shaPattern.test(v)) return { ok: false };
  return { ok: true, value: v };
}

function asInternalString(v: unknown, label: string): string {
  if (typeof v !== "string") throw new Error(`${label} must be a string`);
  const t = v.trim();
  if (t.length === 0 || t !== v) throw new Error(`${label} must be trimmed non-empty`);
  if (NON_CONTROL_RE.test(v)) throw new Error(`${label} contains control characters`);
  return v;
}

/**
 * Map prompt builder failure reason to adapter error code.
 * invalid_input → INVALID_INPUT
 * All size/overflow reasons → PROMPT_TOO_LARGE
 */
function mapPromptFailureReason(reason: LoopCodexPromptFailureReason): LoopCodexImplementationErrorCode {
  switch (reason) {
    case "invalid_input":
      return "INVALID_INPUT";
    case "requirement_too_large":
    case "design_summary_too_large":
    case "constraint_too_large":
    case "too_many_constraints":
    case "too_many_allowed_paths":
    case "repair_evidence_too_large":
    case "prompt_too_large":
      return "PROMPT_TOO_LARGE";
    default:
      return "INTERNAL_ERROR";
  }
}

// ═══════════════════════════════════════ Adapter

export class LoopCodexImplementationAdapter {
  private readonly runner: Pick<LoopPosixProcessRunner, "run">;
  private readonly workspaceManager: Pick<LoopGitWorkspaceManager, "inspect">;
  private readonly artifactStore: Pick<LoopArtifactStore, "read" | "put">;
  private readonly patchApplicationManager: Pick<LoopPatchApplicationManager, "apply">;
  private readonly codexExecutableId: string;
  private readonly timeoutMs: number;
  private readonly maxPromptBytes: number;
  private readonly maxStdoutBytes: number;
  private readonly maxStderrBytes: number;
  private readonly maxPatchBytes: number;
  private readonly maxRepairEvidenceBytes: number;

  constructor(options: LoopCodexImplementationAdapterOptions) {
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
    if (!ast || typeof (ast as Record<string, unknown>).read !== "function" ||
        typeof (ast as Record<string, unknown>).put !== "function") {
      throw new Error("artifactStore must have read and put methods");
    }
    this.artifactStore = ast as Pick<LoopArtifactStore, "read" | "put">;

    const pm = opts.patchApplicationManager;
    if (!pm || typeof (pm as Record<string, unknown>).apply !== "function") {
      throw new Error("patchApplicationManager must have apply method");
    }
    this.patchApplicationManager = pm as Pick<LoopPatchApplicationManager, "apply">;

    this.codexExecutableId = asInternalString(opts.codexExecutableId, "codexExecutableId");

    this.timeoutMs = validateInt(opts.timeoutMs, 100, 600000, 120000, "timeoutMs");
    this.maxPromptBytes = validateInt(opts.maxPromptBytes, 256, 1048576, 65536, "maxPromptBytes");
    this.maxStdoutBytes = validateInt(opts.maxStdoutBytes, 1, 16777216, 1048576, "maxStdoutBytes");
    this.maxStderrBytes = validateInt(opts.maxStderrBytes, 1, 16777216, 65536, "maxStderrBytes");
    this.maxPatchBytes = validateInt(opts.maxPatchBytes, 1, 16777216, 1048576, "maxPatchBytes");
    this.maxRepairEvidenceBytes = validateInt(opts.maxRepairEvidenceBytes, 1, 1048576, 32768, "maxRepairEvidenceBytes");
  }

  // ═══════════════════════════════════════ Public

  async execute(request: LoopCodexImplementationRequest): Promise<LoopCodexImplementationResult> {
    // ── Phase tracking for all result paths ──
    let phase: LoopCodexImplementationPhase = "initial";
    let attempt = 0;

    // ── Validate request ──
    let req: Record<string, unknown>;
    try {
      req = scanPlain(request, REQUEST_KEYS, "request");
    } catch {
      return this._fail("initial", 0, "INVALID_INPUT", "invalid request", false);
    }

    try {
      // Validate identity
      try { validateLoopRunIdentity(req.identity); } catch {
        return this._fail("initial", 0, "INVALID_INPUT", "invalid identity", false);
      }
      const identity = req.identity as LoopRunIdentity;

      // Validate workspace
      let ws: Record<string, unknown>;
      try {
        ws = scanPlain(req.workspace, WORKSPACE_KEYS, "workspace");
      } catch {
        return this._fail("initial", 0, "INVALID_INPUT", "invalid workspace", false);
      }
      const wpResult = validateWorkspaceField(ws.workspacePath, "workspacePath");
      if (!wpResult.ok) return this._fail("initial", 0, "INVALID_INPUT", "invalid workspacePath", false);
      const workspacePath = wpResult.value;

      const tbResult = validateWorkspaceField(ws.taskBranch, "taskBranch");
      if (!tbResult.ok) return this._fail("initial", 0, "INVALID_INPUT", "invalid taskBranch", false);
      const taskBranch = tbResult.value;

      const shaResult = validateWorkspaceField(ws.expectedTaskHeadSha, "expectedTaskHeadSha", /^[0-9a-f]{40}$/);
      if (!shaResult.ok) return this._fail("initial", 0, "INVALID_INPUT", "invalid taskHeadSha", false);
      const expectedTaskHeadSha = shaResult.value;

      const digestResult = validateWorkspaceField(
        ws.expectedPreStatusDigestSha256, "expectedPreStatusDigestSha256", /^[0-9a-f]{64}$/);
      if (!digestResult.ok) return this._fail("initial", 0, "INVALID_INPUT", "invalid preStatusDigestSha256", false);
      const expectedPreStatusDigestSha256 = digestResult.value;

      // Validate phase
      const rawPhase = req.phase;
      if (typeof rawPhase !== "string" ||
          !(["initial", "test_repair", "review_repair"] as string[]).includes(rawPhase)) {
        return this._fail("initial", 0, "INVALID_INPUT", "invalid phase", false);
      }
      phase = rawPhase as LoopCodexImplementationPhase;

      // Validate attempt
      const rawAttempt = req.attempt;
      if (typeof rawAttempt !== "number" || !Number.isSafeInteger(rawAttempt) ||
          rawAttempt < 0 || rawAttempt > MAX_ATTEMPT) {
        return this._fail(phase, 0, "INVALID_INPUT", "invalid attempt", false);
      }
      attempt = rawAttempt;

      // Phase × attempt × evidence rules
      const rawRef = req.repairEvidenceArtifactRef;
      if (phase === "initial") {
        if (attempt !== 0) {
          return this._fail(phase, attempt, "INVALID_INPUT", "initial attempt must be 0", false);
        }
        if (rawRef !== undefined) {
          return this._fail(phase, attempt, "INVALID_INPUT", "initial must not carry evidence", false);
        }
      } else {
        // repair phase
        if (attempt < 1) {
          return this._fail(phase, attempt, "INVALID_INPUT", "repair attempt must be >= 1", false);
        }
        if (rawRef === undefined) {
          return this._fail(phase, attempt, "REPAIR_EVIDENCE_REQUIRED", "repair requires evidence", false);
        }
      }

      // Validate requirement — minimal type check, Prompt Builder is the content authority
      const requirement = req.requirement;
      if (requirement === undefined || requirement === null || typeof requirement !== "string") {
        return this._fail(phase, attempt, "INVALID_INPUT", "invalid requirement", false);
      }

      // Validate designSummary (optional) — minimal type check, Prompt Builder is the content authority
      let designSummary: string | undefined;
      if (req.designSummary !== undefined) {
        if (typeof req.designSummary !== "string") {
          return this._fail(phase, attempt, "INVALID_INPUT", "invalid designSummary", false);
        }
        designSummary = req.designSummary as string;
      }

      // Validate implementationConstraints (optional) — minimal type check, Prompt Builder is the content authority
      let implementationConstraints: readonly string[] | undefined;
      if (req.implementationConstraints !== undefined) {
        if (!Array.isArray(req.implementationConstraints)) {
          return this._fail(phase, attempt, "INVALID_INPUT", "invalid constraints", false);
        }
        implementationConstraints = req.implementationConstraints;
      }

      // Validate allowedPaths — minimal type check, Prompt Builder is the content authority
      if (!Array.isArray(req.allowedPaths)) {
        return this._fail(phase, attempt, "INVALID_INPUT", "invalid allowedPaths", false);
      }
      if (req.allowedPaths.length === 0) {
        return this._fail(phase, attempt, "INVALID_INPUT", "empty allowedPaths", false);
      }
      const allowedPaths: readonly string[] = req.allowedPaths;

      // ═══════════════════════════════════════ D03 Workspace Binding
      let snapshot: LoopGitWorkspaceSnapshot;
      try {
        snapshot = await this.workspaceManager.inspect(identity);
      } catch {
        return this._fail(phase, attempt, "WORKSPACE_DRIFT", "workspace inspect failed", false);
      }

      if (snapshot.workspacePath !== workspacePath ||
          snapshot.taskBranch !== taskBranch) {
        return this._fail(phase, attempt, "WORKSPACE_DRIFT", "workspace identity mismatch", false);
      }
      if (snapshot.taskHeadSha !== expectedTaskHeadSha) {
        return this._fail(phase, attempt, "WORKSPACE_DRIFT", "task HEAD mismatch", false);
      }
      if (snapshot.taskStatusDigestSha256 !== expectedPreStatusDigestSha256) {
        return this._fail(phase, attempt, "WORKSPACE_DRIFT", "pre-status digest mismatch", false);
      }
      if (snapshot.runId !== identity.runId ||
          snapshot.repository !== identity.repository ||
          snapshot.repositoryPath !== identity.repositoryPath) {
        return this._fail(phase, attempt, "WORKSPACE_DRIFT", "workspace identity mismatch", false);
      }

      // ═══════════════════════════════════════ Repair Evidence (if needed)
      let repairEvidenceSummary: string | undefined;
      if (phase !== "initial") {
        const artifactRef = req.repairEvidenceArtifactRef as string;

        // Validate artifact ref format for the phase
        const refMatch = ARTIFACT_REF_RE.exec(artifactRef);
        if (!refMatch) {
          return this._fail(phase, attempt, "REPAIR_EVIDENCE_INVALID", "invalid artifact ref format", false);
        }
        const refKind = refMatch[1]!;
        const expectedKind = phase === "test_repair" ? "test_summary" : "review_summary";
        if (refKind !== expectedKind) {
          return this._fail(phase, attempt, "REPAIR_EVIDENCE_INVALID", "wrong evidence kind", false);
        }

        // Read evidence from artifact store
        let evidenceBytes: Buffer;
        try {
          evidenceBytes = this.artifactStore.read(artifactRef);
        } catch {
          return this._fail(phase, attempt, "REPAIR_EVIDENCE_INVALID", "evidence read failed", false);
        }

        // Validate evidence bytes
        if (evidenceBytes.length === 0) {
          return this._fail(phase, attempt, "REPAIR_EVIDENCE_INVALID", "empty evidence", false);
        }
        if (evidenceBytes.length > this.maxRepairEvidenceBytes) {
          return this._fail(phase, attempt, "REPAIR_EVIDENCE_INVALID", "evidence too large", false);
        }

        // UTF-8 validation
        let evidenceText: string;
        try {
          evidenceText = new TextDecoder("utf-8", { fatal: true }).decode(evidenceBytes);
        } catch {
          return this._fail(phase, attempt, "REPAIR_EVIDENCE_INVALID", "evidence not valid UTF-8", false);
        }
        if (evidenceText.includes("\uFFFD")) {
          return this._fail(phase, attempt, "REPAIR_EVIDENCE_INVALID", "evidence has replacement char", false);
        }
        if (evidenceText.includes("\x00")) {
          return this._fail(phase, attempt, "REPAIR_EVIDENCE_INVALID", "evidence contains NUL", false);
        }
        if (NON_CONTROL_RE.test(evidenceText.replace(/[\n\r\t]/g, ""))) {
          return this._fail(phase, attempt, "REPAIR_EVIDENCE_INVALID", "evidence has control chars", false);
        }

        repairEvidenceSummary = evidenceText;
      }

      // ═══════════════════════════════════════ Build Prompt
      const promptInput: LoopCodexPromptInput = {
        phase,
        attempt,
        requirementId: identity.requirementId,
        requirement,
        designSummary,
        implementationConstraints,
        allowedPaths,
        repairEvidenceSummary,
      };

      const promptLimits: LoopCodexPromptLimits = {
        ...DEFAULT_PROMPT_LIMITS,
        maxPromptBytes: this.maxPromptBytes,
        maxRepairEvidenceBytes: this.maxRepairEvidenceBytes,
      };

      const promptResult = buildLoopCodexPrompt(promptInput, promptLimits);

      if (isPromptFailure(promptResult)) {
        // Map the structured failure reason to the correct error code
        const reason = promptResult.reason;
        const mappedCode = mapPromptFailureReason(reason);
        if (mappedCode === "INTERNAL_ERROR") {
          return this._fail(phase, attempt, "INTERNAL_ERROR", "prompt build failed", false);
        }
        return this._fail(phase, attempt, mappedCode, "prompt build failed: " + reason, false);
      }

      const prompt = promptResult.prompt;
      const promptBytes = new TextEncoder().encode(prompt);

      // R2: Create and freeze defensive copy of allowedPaths for D04
      const frozenAllowedPaths = Object.freeze([...allowedPaths]) as readonly string[];

      // ═══════════════════════════════════════ Invoke Codex via D02 Runner
      let runnerResult: LoopPosixProcessResult;
      try {
        runnerResult = await this.runner.run({
          executableId: this.codexExecutableId,
          cwd: snapshot.workspacePath,
          stdin: promptBytes,
          args: Object.freeze([
            "exec", "--ephemeral", "--color", "never",
            "--sandbox", "read-only", "--cd", snapshot.workspacePath, "-",
          ]),
          timeoutMs: this.timeoutMs,
          maxStdoutBytes: this.maxStdoutBytes,
          maxStderrBytes: this.maxStderrBytes,
        });
      } catch {
        return this._fail(phase, attempt, "CODEX_SPAWN_FAILED", "codex spawn failed", false);
      }

      // ── Map runner failures ──
      if (runnerResult.status === "timed_out") {
        return this._fail(phase, attempt, "CODEX_TIMED_OUT", "codex timed out", true);
      }

      if (runnerResult.exitCode !== 0) {
        return this._fail(phase, attempt, "CODEX_NON_ZERO_EXIT", "codex non-zero exit", true);
      }

      if (runnerResult.stdoutTruncated || runnerResult.stderrTruncated) {
        return this._fail(phase, attempt, "CODEX_OUTPUT_TOO_LARGE", "codex output truncated", true);
      }

      // ═══════════════════════════════════════ Parse Output
      const stdoutBytes = new TextEncoder().encode(runnerResult.stdout);
      const outputLimits: LoopCodexOutputLimits = {
        maxStdoutBytes: this.maxStdoutBytes,
        maxPatchBytes: this.maxPatchBytes,
      };

      const parseResult = parseLoopCodexOutput(stdoutBytes, outputLimits);

      if (!parseResult.ok) {
        return this._fail(phase, attempt, "CODEX_OUTPUT_INVALID", "invalid output format", true);
      }

      const { patchBytes, patchDigestSha256, patchSizeBytes } = parseResult;

      // ═══════════════════════════════════════ D01 Persist
      let stored;
      try {
        stored = this.artifactStore.put("code_patch", patchBytes);
      } catch {
        return this._fail(phase, attempt, "ARTIFACT_STORE_FAILED", "artifact store put failed", false,
          undefined, undefined, patchDigestSha256, patchSizeBytes);
      }

      if (stored.kind !== "code_patch" ||
          stored.digest !== patchDigestSha256 ||
          stored.sizeBytes !== patchSizeBytes) {
        return this._fail(phase, attempt, "ARTIFACT_STORE_FAILED", "stored artifact mismatch", false,
          undefined, undefined, patchDigestSha256, patchSizeBytes);
      }

      const artifactRef = stored.artifactRef;

      // ═══════════════════════════════════════ D04 Apply
      let applyResult: LoopPatchApplicationResult;
      try {
        applyResult = await this.patchApplicationManager.apply({
          identity,
          workspace: {
            workspacePath,
            taskBranch,
            expectedTaskHeadSha,
            expectedPreStatusDigestSha256,
          },
          patchBytes,
          expectedPatchSha256: patchDigestSha256,
          allowedPaths: frozenAllowedPaths,
          artifactRef,
        });
      } catch (e) {
        // R1: Known-only D04 causeCode — only expose code from LoopPatchApplicationError instances
        let causeCode: string | undefined;
        if (e instanceof LoopPatchApplicationError) {
          causeCode = e.code;
        }
        // Any other exception (plain Error, malicious object with `code`, etc.) must NOT expose causeCode
        return this._fail(phase, attempt, "PATCH_APPLICATION_FAILED", "patch application failed", false,
          causeCode, artifactRef, patchDigestSha256, patchSizeBytes);
      }

      // ═══════════════════════════════════════ Success
      // R1: Construct immutable result — copy and freeze files array, freeze entire result
      const files = Object.freeze([...applyResult.files]) as readonly string[];
      return freeze({
        status: "succeeded" as const,
        phase,
        attempt,
        patchArtifactRef: artifactRef,
        patchDigestSha256,
        patchSizeBytes,
        applicationState: applyResult.state,
        files,
        preTaskHeadSha: applyResult.preTaskHeadSha,
        postTaskHeadSha: applyResult.postTaskHeadSha,
        preStatusDigestSha256: applyResult.preStatusDigestSha256,
        postStatusDigestSha256: applyResult.postStatusDigestSha256,
        preTargetStateDigestSha256: applyResult.preTargetStateDigestSha256,
        postTargetStateDigestSha256: applyResult.postTargetStateDigestSha256,
      });
    } catch {
      // Only truly unexpected internal exceptions after public input validation
      return this._fail(phase, attempt, "INTERNAL_ERROR", "unexpected error", false);
    }
  }

  // ═══════════════════════════════════════ Private

  private _fail(
    phase: LoopCodexImplementationPhase,
    attempt: number,
    errorCode: LoopCodexImplementationErrorCode,
    message: string,
    retryable: boolean,
    causeCode?: string,
    patchArtifactRef?: string,
    patchDigestSha256?: string,
    patchSizeBytes?: number,
  ): LoopCodexImplementationFailure {
    // R1: Construct failure result in one shot with type safety, then freeze
    const resultObj: Record<string, unknown> = {
      status: "failed",
      phase,
      attempt,
      errorCode,
      retryable,
      safeMessage: safeMessage(message),
    };
    if (causeCode !== undefined) {
      resultObj.causeCode = causeCode;
    }
    if (patchArtifactRef !== undefined) {
      resultObj.patchArtifactRef = patchArtifactRef;
    }
    if (patchDigestSha256 !== undefined) {
      resultObj.patchDigestSha256 = patchDigestSha256;
    }
    if (patchSizeBytes !== undefined) {
      resultObj.patchSizeBytes = patchSizeBytes;
    }
    return freeze(resultObj) as unknown as LoopCodexImplementationFailure;
  }
}

// ═══════════════════════════════════════ Private helpers

function validateInt(
  value: unknown, min: number, max: number, defaultVal: number, label: string,
): number {
  if (value === undefined) return defaultVal;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${label} out of range`);
  }
  return value;
}
