// Kimi CLI Command Executor — Isolated, Feature-flagged
// =======================================================
// Real Kimi CLI process execution behind strict feature flag.
// NOT wired to runtime or ExecutionGateway.
// Disabled by default. Separates execution gating from adapter config.

import { spawn } from "child_process";
import type { ExecutionRequest } from "./types";
import type { CliAdapterConfig } from "./cli-adapter-contract-types";
import type { CliAdapterAuditEvent } from "./cli-adapter-audit";
import {
  buildCliExecutionResultAudit,
  buildCliExecutionSkippedAudit,
  sanitizeErrorSummary,
  buildSanitizedPromptArgs,
  redactDynamicPrompt,
} from "./cli-adapter-audit";
import {
  prepareKimiCliExecutorContract,
  type KimiCliExecutorCommandInput,
} from "./kimi-cli-executor-contract";

export type KimiCliCommandExecutorDecision =
  | "disabled" | "missing_cli_command" | "unsupported_request_type"
  | "execution_not_enabled" | "missing_prompt"
  | "executed_success" | "executed_failure" | "executed_timeout";

export interface KimiCliProcessResult {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  durationMs: number;
  timedOut?: boolean;
  stdoutPayload?: string;
  stdoutTruncated?: boolean;
}

export interface KimiCliProcessRunner {
  run(commandInput: KimiCliExecutorCommandInput): Promise<KimiCliProcessResult>;
}

export interface KimiCliCommandExecutorResult {
  success: boolean;
  decision: KimiCliCommandExecutorDecision;
  requestId: string;
  commandInput?: KimiCliExecutorCommandInput;
  auditEvents: CliAdapterAuditEvent[];
  stdoutSummary?: string;
  stderrSummary?: string;
  error?: string;
  stdoutPayload?: string;
  stdoutTruncated?: boolean;
}

const DEFAULT_MAX_STDOUT_PAYLOAD_CHARS = 16_000;
const SUMMARY_MAX_STDOUT_CHARS = 4000;
const SUMMARY_MAX_STDERR_CHARS = 4000;

// ─── Feature Flag ─────────────────────────────────────

export function isKimiCliCommandExecutionEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.SDLC_KIMI_CLI_COMMAND_EXECUTION === "enabled";
}

// ─── Output Summarization ─────────────────────────────

export function summarizeOutput(input: string | undefined, maxLength = 1000): string | undefined {
  if (!input || input.trim() === "") return undefined;
  const normalized = input.replace(/\n/g, " ");
  const sanitized = sanitizeErrorSummary(normalized);
  if (!sanitized) return undefined;
  return sanitized.length > maxLength ? sanitized.slice(0, maxLength) + "…" : sanitized;
}

// ─── Default Process Runner ───────────────────────────

export function createDefaultKimiCliProcessRunner(): KimiCliProcessRunner {
  return {
    async run(commandInput: KimiCliExecutorCommandInput): Promise<KimiCliProcessResult> {
      const start = Date.now();
      return new Promise<KimiCliProcessResult>((resolve) => {
        const child = spawn(commandInput.command, commandInput.args, {
          shell: false,
          cwd: commandInput.workingDirectory,
        });

        let stdout = "";
        let stderr = "";
        let settled = false;
        let timer: ReturnType<typeof setTimeout>;

        const finish = (result: KimiCliProcessResult) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try { child.kill(); } catch {}
          resolve(result);
        };

        timer = setTimeout(() => {
          finish({
            timedOut: true,
            durationMs: Date.now() - start,
            stdout: stdout.slice(0, SUMMARY_MAX_STDOUT_CHARS),
            stderr: stderr.slice(0, SUMMARY_MAX_STDERR_CHARS),
          });
        }, commandInput.timeoutMs);

        child.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
        child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });

        child.on("error", (err) => {
          finish({ durationMs: Date.now() - start, stderr: err.message });
        });

        child.on("close", (code) => {
          const maxPayload = commandInput.maxStdoutPayloadChars ?? DEFAULT_MAX_STDOUT_PAYLOAD_CHARS;
          const stdoutTruncated = stdout.length > maxPayload;
          const stdoutPayload = stdout.slice(0, maxPayload);
          finish({
            exitCode: code ?? undefined,
            durationMs: Date.now() - start,
            stdout: stdout.slice(0, SUMMARY_MAX_STDOUT_CHARS),
            stderr: stderr.slice(0, SUMMARY_MAX_STDERR_CHARS),
            stdoutPayload,
            stdoutTruncated,
          });
        });

        if (commandInput.stdin && child.stdin) {
          child.stdin.write(commandInput.stdin);
          child.stdin.end();
        } else if (commandInput.stdin) {
          finish({
            exitCode: undefined,
            durationMs: Date.now() - start,
            stderr: "Kimi CLI stdin is unavailable",
            stdoutPayload: "",
            stdoutTruncated: false,
          });
        }
      });
    },
  };
}

// ─── Executor ─────────────────────────────────────────

export async function executeKimiCliCommand(input: {
  request: ExecutionRequest;
  config?: CliAdapterConfig;
  env?: Record<string, string | undefined>;
  runner?: KimiCliProcessRunner;
}): Promise<KimiCliCommandExecutorResult> {
  const contract = prepareKimiCliExecutorContract({ request: input.request, config: input.config });
  if (!contract.success) {
    return {
      success: false,
      decision: contract.decision as KimiCliCommandExecutorDecision,
      requestId: contract.requestId,
      auditEvents: contract.auditEvents,
      error: contract.error,
    };
  }

  const executionEnabled = isKimiCliCommandExecutionEnabled(input.env);

  if (!executionEnabled) {
    return {
      success: false,
      decision: "execution_not_enabled",
      requestId: contract.requestId,
      commandInput: contract.commandInput,
      auditEvents: [
        ...contract.auditEvents,
        buildCliExecutionSkippedAudit({
          adapter: "kimi", requestId: contract.requestId,
          requestType: input.request.type,
          reason: "skipped_contract_only",
          config: input.config,
        }),
      ],
      error: "Kimi CLI command execution is disabled",
    };
  }

  const runner = input.runner ?? createDefaultKimiCliProcessRunner();
  const dynamicPrompt = input.request.input?.["prompt"] as string | undefined;
  const transport = contract.commandInput?.promptTransport ?? "stdin";
  const promptArg = contract.commandInput?.promptArgument ?? "-p";

  // ── Reject missing or blank prompts before invoking runner ──
  if (!dynamicPrompt || dynamicPrompt.trim().length === 0) {
    return {
      success: false,
      decision: "missing_prompt",
      requestId: contract.requestId,
      commandInput: contract.commandInput,
      auditEvents: [
        ...contract.auditEvents,
        buildCliExecutionSkippedAudit({
          adapter: "kimi", requestId: contract.requestId,
          requestType: input.request.type,
          reason: "missing_prompt",
          config: input.config,
        }),
      ],
      error: "Kimi CLI: prompt is missing or blank",
    };
  }

  const runnerCommandInput: KimiCliExecutorCommandInput = {
    ...contract.commandInput!,
    maxStdoutPayloadChars: DEFAULT_MAX_STDOUT_PAYLOAD_CHARS,
  };

  // Build sanitized display commandInput (with [REDACTED_PROMPT] for argument mode)
  let displayCommandInput: KimiCliExecutorCommandInput;

  if (transport === "argument") {
    // Argument mode: prompt goes in args, not stdin
    runnerCommandInput.args = [
      ...contract.commandInput!.args,
      promptArg,
      dynamicPrompt,
    ];
    runnerCommandInput.stdin = undefined;
    displayCommandInput = {
      ...contract.commandInput!,
      args: buildSanitizedPromptArgs(contract.commandInput!.args, promptArg),
      stdin: undefined,
    };
  } else {
    // Stdin mode: existing behavior
    runnerCommandInput.stdin = dynamicPrompt;
    displayCommandInput = contract.commandInput!;
  }

  const processResult = await runner.run(runnerCommandInput);

  // ── Redact dynamic prompt from stderr and stdout summaries ──
  const safeStderr = redactDynamicPrompt(processResult.stderr, dynamicPrompt);
  const safeStdout = redactDynamicPrompt(processResult.stdout, dynamicPrompt);

  const resultAudit = buildCliExecutionResultAudit({
    adapter: "kimi", requestId: contract.requestId,
    requestType: input.request.type, config: input.config,
    exitCode: processResult.exitCode, durationMs: processResult.durationMs,
    errorSummary: safeStderr, timedOut: processResult.timedOut,
  });

  const stdoutSummary = summarizeOutput(safeStdout);
  const stderrSummary = summarizeOutput(safeStderr);
  const stdoutPayload = processResult.stdoutPayload;
  const stdoutTruncated = processResult.stdoutTruncated;

  if (stdoutTruncated) {
    return {
      success: false,
      decision: "executed_failure",
      requestId: contract.requestId,
      commandInput: displayCommandInput,
      auditEvents: [...contract.auditEvents, resultAudit],
      stdoutSummary,
      stderrSummary,
      stdoutPayload,
      stdoutTruncated,
      error: "Kimi CLI stdout exceeded structured output limit",
    };
  }
  if (processResult.timedOut) {
    return { success: false, decision: "executed_timeout", requestId: contract.requestId, commandInput: displayCommandInput, auditEvents: [...contract.auditEvents, resultAudit], stdoutSummary, stderrSummary, stdoutPayload, stdoutTruncated, error: "Kimi CLI command timed out" };
  }
  if (processResult.exitCode === 0) {
    return { success: true, decision: "executed_success", requestId: contract.requestId, commandInput: displayCommandInput, auditEvents: [...contract.auditEvents, resultAudit], stdoutSummary, stderrSummary, stdoutPayload, stdoutTruncated };
  }
  return { success: false, decision: "executed_failure", requestId: contract.requestId, commandInput: displayCommandInput, auditEvents: [...contract.auditEvents, resultAudit], stdoutSummary, stderrSummary, stdoutPayload, stdoutTruncated, error: `Kimi CLI exited with code ${processResult.exitCode}` };
}
