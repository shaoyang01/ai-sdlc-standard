// Real Capability Adapter — C03-E E2 (Decision-071, plan §6 E2 / §4.2)
// ============================================================================
// ONE place that turns a single real Agent CLI invocation into a canonical
// ExecutionResult — or a deterministically classified failure. It is the only
// production path that talks to a CLI; it REUSES LoopPosixProcessRunner
// (allowlist / canonical realpath / cwd containment / bounded streams /
// process-group TERM→KILL) instead of spawning child processes itself.
//
// Hard properties:
//   - the runner is INJECTED. Production wires the real LoopPosixProcessRunner;
//     tests inject a fake. This module spawns NOTHING and touches NO filesystem.
//   - the dynamic prompt travels over STDIN ONLY; the argv is the profile's
//     fully static args. A caller cannot smuggle a prompt into argv.
//   - the adapter enforces the Q1 binding: the provider must be the one bound
//     to the requested (capability, role).
//   - every non-clean process outcome is a distinct fail-closed code with
//     evidence. Truncation, malformed output and suspected secrets are NEVER
//     silently promoted to success. Raw stdout/stderr are never echoed into an
//     error message nor a journal field.
//   - this module does NOT decide retries (Q3) nor write the journal: it reports
//     facts + an `infrastructure` hint; the recovery layer (E4) owns retry after
//     side-effect verification. It builds NO artifact — the gateway materializes
//     node artifacts from `output`, exactly like the deterministic path.
//
// Evidence boundary (INV-E13): with a FAKE runner this proves adapter logic
// only. Real-CLI canary is the separately authorized E5.

import { createHash } from "node:crypto";
import type { CapabilityExecutionPoint, CapabilityExecutionRole, NodeCapabilityId } from "../loop/types";
import type { CapabilityProcessEvidence, ExecutionResult } from "./types";
import {
  AGENT_CLI_BOUNDS,
  AgentCliProfileError,
  getAgentCliProfile,
  bindingProviderForPoint,
  type AgentCliProviderId,
} from "./agent-cli-profile";
import type {
  LoopPosixProcessRequest,
  LoopPosixProcessResult,
} from "../core/loop-posix-process-runner";
import { LoopPosixProcessRunnerError } from "../core/loop-posix-process-runner";

/** Structural subset the adapter needs — satisfied by LoopPosixProcessRunner. */
export interface CapabilityProcessRunner {
  run(req: LoopPosixProcessRequest): Promise<LoopPosixProcessResult>;
}

export interface RealCapabilityAdapterRequest {
  readonly providerId: AgentCliProviderId;
  readonly runId: string;
  readonly invocationId: string;
  readonly requirementId: string;
  /** ExecutionRequest.node — the canonical node name used on the result. */
  readonly node: string;
  readonly capability: NodeCapabilityId;
  readonly executionRole: CapabilityExecutionRole;
  readonly attempt: number;
  /** Dynamic requirement text — stdin only. */
  readonly prompt: string;
  /** Attempt workspace dir; must already be an allowed cwd root of the runner. */
  readonly cwd: string;
  /**
   * Executable policy id inside the injected runner's allowlist. Defaults to
   * the provider id.
   */
  readonly executableId?: string;
}

export type RealCapabilityAdapterFailureCode =
  | "REAL_ADAPTER_INVALID_INPUT"
  | "REAL_ADAPTER_BINDING_MISMATCH"
  | "REAL_ADAPTER_MISSING_COMMAND"
  | "REAL_ADAPTER_SPAWN_FAILED"
  | "REAL_ADAPTER_NONZERO_EXIT"
  | "REAL_ADAPTER_SIGNAL_KILLED"
  | "REAL_ADAPTER_TIMEOUT"
  | "REAL_ADAPTER_OUTPUT_TRUNCATED"
  | "REAL_ADAPTER_SECRET_LEAK"
  | "REAL_ADAPTER_MALFORMED_OUTPUT"
  | "REAL_ADAPTER_CLEANUP_FAILED";

/** Bounded, non-sensitive evidence about one failed attempt. */
export interface RealCapabilityFailureEvidence {
  readonly status: LoopPosixProcessResult["status"];
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly durationMs: number;
  readonly stdoutBytesReceived: number;
  readonly stderrBytesReceived: number;
  readonly stdoutTruncated: boolean;
  readonly stderrTruncated: boolean;
  readonly termSignalSent: boolean;
  readonly killSignalSent: boolean;
  /** E5-W1 (G-S09b): sha256 of the normalized invocation shape (no dynamic content). */
  readonly invocationDigest: string;
}

export class RealCapabilityAdapterError extends Error {
  readonly code: RealCapabilityAdapterFailureCode;
  readonly evidence: RealCapabilityFailureEvidence | null;
  /** Infrastructure (env/process) failure vs. an agent business failure. */
  readonly infrastructure: boolean;
  constructor(
    code: RealCapabilityAdapterFailureCode,
    message: string,
    evidence: RealCapabilityFailureEvidence | null,
    infrastructure: boolean,
  ) {
    super(message);
    this.name = "RealCapabilityAdapterError";
    this.code = code;
    this.evidence = evidence;
    this.infrastructure = infrastructure;
  }
}

// ── secret red-team: a final answer that looks like a leaked credential must
// never be promoted into a journal artifact. Conservative, well-known shapes. ─
const SECRET_PATTERNS: readonly RegExp[] = Object.freeze([
  /AKIA[0-9A-Z]{16}/, // AWS access key id
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/, // bearer-style secret
  /(?:"|')?(?:api[_-]?key|access[_-]?token|secret|password)(?:"|')?\s*[:=]\s*["']?[A-Za-z0-9/+=_-]{16,}/i,
]);

function looksLikeSecret(text: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(text));
}

function asTrimmedString(v: unknown, label: string): string {
  if (typeof v !== "string") {
    throw new RealCapabilityAdapterError("REAL_ADAPTER_INVALID_INPUT", `${label} must be a string`, null, false);
  }
  // Reject (not silently trim) surrounding whitespace: callers must hand in a
  // already-trimmed value, consistent with this package's fail-closed style.
  if (v.length === 0 || v !== v.trim()) {
    throw new RealCapabilityAdapterError("REAL_ADAPTER_INVALID_INPUT", `${label} must be trimmed non-empty`, null, false);
  }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v)) {
    throw new RealCapabilityAdapterError("REAL_ADAPTER_INVALID_INPUT", `${label} has control chars`, null, false);
  }
  return v;
}

/**
 * Extract the final assistant text from Codex `--json` JSONL: the LAST line
 * that parses and carries a string final message. Fail-closed — a stream we
 * cannot structurally read is MALFORMED, never a guessed substring.
 */
export function extractCodexFinalText(stdout: string): string {
  const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    throw new RealCapabilityAdapterError("REAL_ADAPTER_MALFORMED_OUTPUT", "codex jsonl empty", null, false);
  }
  let finalText: string | null = null;
  for (const line of lines) {
    let rec: unknown;
    try {
      rec = JSON.parse(line);
    } catch {
      // A non-JSON line in --json output makes the stream untrustworthy.
      throw new RealCapabilityAdapterError("REAL_ADAPTER_MALFORMED_OUTPUT", "codex jsonl has non-json line", null, false);
    }
    const text = readFinalMessage(rec);
    if (text !== null) finalText = text;
  }
  if (finalText === null || finalText.trim().length === 0) {
    throw new RealCapabilityAdapterError("REAL_ADAPTER_MALFORMED_OUTPUT", "codex jsonl has no final message", null, false);
  }
  return finalText.trim();
}

function readFinalMessage(rec: unknown): string | null {
  if (rec === null || typeof rec !== "object") return null;
  const r = rec as Record<string, unknown>;
  // Common codex JSONL shapes: {type:"message",role:"assistant",content:[{type:"output_text",text}]}
  // or a terminal record {last_message|final|text:"..."}.
  const content = r.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part && typeof part === "object") {
        const p = part as Record<string, unknown>;
        if (typeof p.text === "string" && p.text.trim().length > 0) return p.text;
      }
    }
  }
  for (const key of ["last_message", "final", "text"] as const) {
    if (typeof r[key] === "string" && (r[key] as string).trim().length > 0) return r[key] as string;
  }
  return null;
}

export class RealCapabilityAdapter {
  constructor(private readonly runner: CapabilityProcessRunner) {}

  async execute(req: RealCapabilityAdapterRequest): Promise<ExecutionResult> {
    // ── validate request (fail-closed) ──
    const providerId = asTrimmedString(req.providerId, "providerId") as AgentCliProviderId;
    const requirementId = asTrimmedString(req.requirementId, "requirementId");
    const node = asTrimmedString(req.node, "node");
    // runId is validated for shape but never used to build argv or file names
    // (usage file is derived from closed enums — see usageFileName below).
    asTrimmedString(req.runId, "runId");
    const cwd = asTrimmedString(req.cwd, "cwd");
    const prompt = asTrimmedString(req.prompt, "prompt");
    if (!Number.isSafeInteger(req.attempt) || req.attempt < 1) {
      throw new RealCapabilityAdapterError("REAL_ADAPTER_INVALID_INPUT", "attempt must be >=1 safe int", null, false);
    }

    let profile;
    try {
      profile = getAgentCliProfile(providerId);
    } catch (e) {
      if (e instanceof AgentCliProfileError) {
        throw new RealCapabilityAdapterError("REAL_ADAPTER_INVALID_INPUT", "unknown provider profile", null, false);
      }
      throw e;
    }
    if (Buffer.byteLength(prompt, "utf8") > profile.bounds.maxStdinBytes) {
      throw new RealCapabilityAdapterError("REAL_ADAPTER_INVALID_INPUT", "prompt exceeds stdin bound", null, false);
    }

    // ── enforce Q1 binding: this provider IS the bound one for this point ──
    const point: CapabilityExecutionPoint = { capability: req.capability, executionRole: req.executionRole };
    let bound: AgentCliProviderId;
    try {
      bound = bindingProviderForPoint(point);
    } catch (e) {
      if (e instanceof AgentCliProfileError) {
        throw new RealCapabilityAdapterError("REAL_ADAPTER_INVALID_INPUT", "invalid execution point", null, false);
      }
      throw e;
    }
    if (bound !== providerId) {
      throw new RealCapabilityAdapterError(
        "REAL_ADAPTER_BINDING_MISMATCH",
        `provider ${providerId} is not the Q1 binding for ${req.capability}/${req.executionRole}`,
        null,
        false,
      );
    }

    const capabilityClass = req.capability === "implementation" ? "implementation" : "non-implementation";
    const timeoutMs = profile.timeoutMsByCapabilityClass[capabilityClass];

    // Hermes writes a usage/cost file inside the attempt workspace. The name is
    // derived ONLY from closed enums + the safe-int attempt, never from a
    // caller free-text field such as runId, so argv stays fully static (Round 1
    // B1: a runId carrying "/" or ".." previously reached argv here).
    const usageFileName = `.usage-${req.capability}-${req.executionRole}-${req.attempt}.json`;
    const args: string[] = [...profile.staticArgs];
    if (profile.usageFileArg !== null) {
      args.push(...profile.usageFileArg, usageFileName);
    }

    const processReq: LoopPosixProcessRequest = Object.freeze({
      executableId: req.executableId ?? providerId,
      args,
      cwd,
      stdin: prompt,
      timeoutMs,
      maxStdoutBytes: AGENT_CLI_BOUNDS.maxStdoutBytes,
      maxStderrBytes: AGENT_CLI_BOUNDS.maxStderrBytes,
    });

    // E5-W1 (G-S09b): sha256 over the NORMALIZED invocation shape only —
    // static argv, bounded streams, no dynamic content (the prompt travels on
    // stdin and is never hashed here). The journal validator requires this
    // digest on any terminal event that persists process evidence, so the
    // same digest anchors both the success result and failure evidence.
    const invocationDigest = createHash("sha256").update(JSON.stringify({
      executableId: processReq.executableId,
      args: processReq.args,
      cwd: processReq.cwd,
      timeoutMs: processReq.timeoutMs,
      maxStdoutBytes: processReq.maxStdoutBytes,
      maxStderrBytes: processReq.maxStderrBytes,
    })).digest("hex");

    // ── run ──
    let res: LoopPosixProcessResult;
    try {
      res = await this.runner.run(processReq);
    } catch (e) {
      if (e instanceof LoopPosixProcessRunnerError) {
        const infra = true;
        if (e.code === "PROCESS_CLEANUP_FAILED") {
          throw new RealCapabilityAdapterError("REAL_ADAPTER_CLEANUP_FAILED", "process cleanup uncertain", null, infra);
        }
        if (
          e.code === "EXECUTABLE_NOT_ALLOWED" ||
          e.code === "EXECUTABLE_INVALID" ||
          e.code === "EXECUTABLE_CHANGED"
        ) {
          throw new RealCapabilityAdapterError("REAL_ADAPTER_MISSING_COMMAND", "agent cli unavailable", null, infra);
        }
        if (e.code === "PROCESS_SPAWN_FAILED") {
          throw new RealCapabilityAdapterError("REAL_ADAPTER_SPAWN_FAILED", "agent cli spawn failed", null, infra);
        }
        // INVALID_INPUT / CWD / ENV / IO / platform: a wiring defect, not an agent result.
        throw new RealCapabilityAdapterError("REAL_ADAPTER_INVALID_INPUT", `runner rejected request (${e.code})`, null, false);
      }
      throw e;
    }

    const evidence: RealCapabilityFailureEvidence = Object.freeze({
      status: res.status,
      exitCode: res.exitCode,
      signal: res.signal,
      durationMs: res.durationMs,
      stdoutBytesReceived: res.stdoutBytesReceived,
      stderrBytesReceived: res.stderrBytesReceived,
      stdoutTruncated: res.stdoutTruncated,
      stderrTruncated: res.stderrTruncated,
      termSignalSent: res.termSignalSent,
      killSignalSent: res.killSignalSent,
      invocationDigest,
    });

    const fail = (
      code: RealCapabilityAdapterFailureCode,
      message: string,
      infrastructure: boolean,
    ): never => {
      throw new RealCapabilityAdapterError(code, message, evidence, infrastructure);
    };

    // ── ordered fail-closed classification ──
    if (res.status === "timed_out") {
      fail("REAL_ADAPTER_TIMEOUT", "agent cli attempt timed out", true);
    }
    if (res.stdoutTruncated || res.stderrTruncated) {
      // Truncation means the Agent output exceeded its bound — a business/output
      // condition, not a side-effect-free infrastructure fault, so it must not
      // be auto-retried under Q3 (infrastructure=false).
      fail("REAL_ADAPTER_OUTPUT_TRUNCATED", "bounded stream was truncated", false);
    }
    if (res.signal !== null) {
      fail("REAL_ADAPTER_SIGNAL_KILLED", "agent cli killed by signal", true);
    }
    if (res.exitCode !== 0) {
      fail("REAL_ADAPTER_NONZERO_EXIT", "agent cli exited non-zero", false);
    }

    // ── parse final text by dialect ──
    let finalText: string;
    if (profile.outputDialect === "jsonl-final") {
      try {
        finalText = extractCodexFinalText(res.stdout);
      } catch (e) {
        if (e instanceof RealCapabilityAdapterError) {
          // attach process evidence to the parse failure
          throw new RealCapabilityAdapterError(e.code, e.message, evidence, false);
        }
        throw e;
      }
    } else {
      finalText = res.stdout.trim();
      if (finalText.length === 0) {
        fail("REAL_ADAPTER_MALFORMED_OUTPUT", "empty final text", false);
      }
    }

    if (looksLikeSecret(finalText)) {
      fail("REAL_ADAPTER_SECRET_LEAK", "final text matches a credential pattern", false);
    }

    // E5-W1 (G-S09b): durable process evidence for the journal terminal. By
    // this point the fail-closed classification above guarantees exit 0, no
    // terminating signal and no truncation (a truncated stream fails earlier
    // and carries its evidence on the FAILED event instead).
    const processEvidence: CapabilityProcessEvidence = Object.freeze({
      invocationDigest,
      exitCode: 0,
      signal: null,
      durationMs: res.durationMs >= 1 ? res.durationMs : null,
      truncated: false,
    });

    const result: ExecutionResult = Object.freeze({
      success: true,
      node,
      agent: providerId,
      output: Object.freeze({
        text: finalText,
        cliVersion: profile.pinnedCliVersion,
        capability: req.capability,
        executionRole: req.executionRole,
        attempt: req.attempt,
        durationMs: res.durationMs,
        stdoutBytes: res.stdoutBytesReceived,
        outputDialect: profile.outputDialect,
        promptTransport: "stdin",
      }) as Record<string, unknown>,
      artifacts: [],
      processEvidence,
    });
    return result;
  }
}
