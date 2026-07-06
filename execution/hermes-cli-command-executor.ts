// Hermes CLI Command Executor — Isolated, Feature-flagged
// ==========================================================
// Real Hermes CLI process execution behind strict feature flag.
// NOT wired to runtime or ExecutionGateway.
// Disabled by default. Separates execution gating from adapter config.

import { spawn } from "child_process";
import type { ExecutionRequest } from "./types";
import type { CliAdapterConfig } from "./cli-adapter-contract-types";
import type { CliAdapterAuditEvent } from "./cli-adapter-audit";
import {
  buildCliExecutionSkippedAudit,
  sanitizeCliArgs,
  sanitizeErrorSummary,
} from "./cli-adapter-audit";
import {
  prepareHermesCliExecutorContract,
  type HermesCliExecutorCommandInput,
} from "./hermes-cli-executor-contract";

// ─── Feature Flag ─────────────────────────────────────

export const HERMES_CLI_COMMAND_EXECUTION_FLAG = "SDLC_HERMES_CLI_COMMAND_EXECUTION";

export function isHermesCliCommandExecutionEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env[HERMES_CLI_COMMAND_EXECUTION_FLAG] === "enabled";
}

// ─── Types ────────────────────────────────────────────

export type HermesCliCommandExecutionDecision =
  | "disabled"
  | "missing_config"
  | "missing_command"
  | "executed_success"
  | "executed_failure"
  | "executed_timeout";

export interface HermesCliCommandExecutionResult {
  adapter: "hermes";
  decision: HermesCliCommandExecutionDecision;
  executed: boolean;
  requestId: string;
  requestType: string;
  exitCode?: number;
  durationMs?: number;
  stdoutSummary?: string;
  stderrSummary?: string;
  error?: string;
  affectsRuntimeRouting: false;
  affectsFinalStatus: false;
  writesFiles: false;
  persistsAudit: false;
  invokesCli: boolean;
  spawnsProcess: boolean;
  auditEvents: HermesCliCommandAuditEvent[];
  warnings: string[];
}

export interface HermesCliCommandAuditEvent {
  adapter: "hermes";
  source: "hermes_cli_command_executor";
  requestId: string;
  requestType: string;
  decision: HermesCliCommandExecutionDecision;
  executed: boolean;
  invokesCli: boolean;
  spawnsProcess: boolean;
  writesFiles: false;
  persistsAudit: false;
  containsRawPrompt: false;
  containsRawArtifacts: false;
  containsSecrets: false;
  sanitizedCommandPreview?: string[];
  stdoutSummary?: string;
  stderrSummary?: string;
  error?: string;
}

// ─── Runner Abstraction ───────────────────────────────

export interface HermesCliProcessResult {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  durationMs?: number;
  timedOut?: boolean;
  error?: string;
}

export interface HermesCliProcessRunner {
  run(input: {
    command: string;
    args: string[];
    timeoutMs: number;
    inputText: string;
  }): Promise<HermesCliProcessResult>;
}

export function createDefaultHermesCliProcessRunner(): HermesCliProcessRunner {
  return {
    async run(input: {
      command: string;
      args: string[];
      timeoutMs: number;
      inputText: string;
    }): Promise<HermesCliProcessResult> {
      const start = Date.now();
      return new Promise<HermesCliProcessResult>((resolve) => {
        const child = spawn(input.command, input.args, {
          shell: false,
        });

        let stdout = "";
        let stderr = "";
        let settled = false;
        let timer: ReturnType<typeof setTimeout>;

        const finish = (result: HermesCliProcessResult) => {
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
            stdout: stdout.slice(0, 4000),
            stderr: stderr.slice(0, 4000),
          });
        }, input.timeoutMs);

        // Write input through stdin
        if (input.inputText) {
          child.stdin?.write(input.inputText);
          child.stdin?.end();
        }

        child.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
        child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });

        child.on("error", (err) => {
          finish({ durationMs: Date.now() - start, stderr: err.message, error: err.message });
        });

        child.on("close", (code) => {
          finish({ exitCode: code ?? undefined, durationMs: Date.now() - start, stdout: stdout.slice(0, 4000), stderr: stderr.slice(0, 4000) });
        });
      });
    },
  };
}

// ─── Output Summarization ─────────────────────────────

export function summarizeHermesOutput(input: string | undefined, maxLength = 1000): string | undefined {
  if (!input || input.trim() === "") return undefined;
  const normalized = input.replace(/\n/g, " ");
  const sanitized = sanitizeErrorSummary(normalized);
  if (!sanitized) return undefined;
  return sanitized.length > maxLength ? sanitized.slice(0, maxLength) + "…" : sanitized;
}

// ─── Audit Event Builder ──────────────────────────────

function buildHermesAudit(input: {
  requestId: string; requestType: string;
  decision: HermesCliCommandExecutionDecision; executed: boolean;
  invokesCli: boolean; spawnsProcess: boolean;
  commandPreview?: string[]; stdoutSummary?: string;
  stderrSummary?: string; error?: string;
}): HermesCliCommandAuditEvent {
  return {
    adapter: "hermes",
    source: "hermes_cli_command_executor",
    requestId: input.requestId, requestType: input.requestType,
    decision: input.decision, executed: input.executed,
    invokesCli: input.invokesCli, spawnsProcess: input.spawnsProcess,
    writesFiles: false, persistsAudit: false,
    containsRawPrompt: false, containsRawArtifacts: false, containsSecrets: false,
    sanitizedCommandPreview: input.commandPreview,
    stdoutSummary: input.stdoutSummary, stderrSummary: input.stderrSummary,
    error: input.error,
  };
}

// ─── Executor ─────────────────────────────────────────

export async function executeHermesCliCommand(input: {
  request: ExecutionRequest;
  config?: CliAdapterConfig;
  env?: Record<string, string | undefined>;
  runner?: HermesCliProcessRunner;
}): Promise<HermesCliCommandExecutionResult> {
  const executionEnabled = isHermesCliCommandExecutionEnabled(input.env);

  const base = {
    adapter: "hermes" as const,
    requestId: input.request.requirementId,
    requestType: input.request.type,
    affectsRuntimeRouting: false as const,
    affectsFinalStatus: false as const,
    writesFiles: false as const,
    persistsAudit: false as const,
    warnings: [] as string[],
  };

  // Flag disabled
  if (!executionEnabled) {
    return {
      ...base,
      decision: "disabled", executed: false,
      invokesCli: false, spawnsProcess: false,
      auditEvents: [buildHermesAudit({
        requestId: input.request.requirementId, requestType: input.request.type,
        decision: "disabled", executed: false,
        invokesCli: false, spawnsProcess: false,
      })],
    };
  }

  // Contract check
  const contract = prepareHermesCliExecutorContract({ request: input.request, config: input.config });
  if (!contract.success) {
    const decisionMap: Record<string, HermesCliCommandExecutionDecision> = {
      disabled: "missing_config",
      missing_cli_command: "missing_command",
      unsupported_request_type: "missing_config",
    };
    const decision = decisionMap[contract.decision] ?? "missing_config";
    return {
      ...base,
      decision, executed: false, error: contract.error,
      invokesCli: false, spawnsProcess: false,
      auditEvents: [
        buildHermesAudit({
          requestId: input.request.requirementId, requestType: input.request.type,
          decision, executed: false,
          invokesCli: false, spawnsProcess: false,
          commandPreview: contract.commandInput ? [contract.commandInput.command, ...contract.commandInput.args] : undefined,
          error: contract.error,
        }),
      ],
    };
  }

  // Execute
  const cmdInput = contract.commandInput!;
  const sanitizedPreview = [cmdInput.command, ...sanitizeCliArgs(cmdInput.args)];

  try {
    const serializedInput = JSON.stringify(input.request.input);
    const runner = input.runner ?? createDefaultHermesCliProcessRunner();
    const processResult = await runner.run({
      command: cmdInput.command,
      args: cmdInput.args,
      timeoutMs: cmdInput.timeoutMs,
      inputText: serializedInput,
    });

    const stdoutSummary = summarizeHermesOutput(processResult.stdout);
    const stderrSummary = summarizeHermesOutput(processResult.stderr);
    const errorSummary = processResult.error
      ? sanitizeErrorSummary(processResult.error)
      : undefined;

    if (processResult.timedOut) {
      return {
        ...base,
        decision: "executed_timeout", executed: true,
        exitCode: processResult.exitCode, durationMs: processResult.durationMs,
        stdoutSummary, stderrSummary,
        error: "Hermes CLI command timed out",
        invokesCli: true, spawnsProcess: true,
        auditEvents: [buildHermesAudit({
          requestId: input.request.requirementId, requestType: input.request.type,
          decision: "executed_timeout", executed: true,
          invokesCli: true, spawnsProcess: true,
          commandPreview: sanitizedPreview,
          stdoutSummary, stderrSummary,
          error: "Hermes CLI command timed out",
        })],
      };
    }

    if (processResult.exitCode === 0) {
      return {
        ...base,
        decision: "executed_success", executed: true,
        exitCode: processResult.exitCode, durationMs: processResult.durationMs,
        stdoutSummary, stderrSummary,
        invokesCli: true, spawnsProcess: true,
        auditEvents: [buildHermesAudit({
          requestId: input.request.requirementId, requestType: input.request.type,
          decision: "executed_success", executed: true,
          invokesCli: true, spawnsProcess: true,
          commandPreview: sanitizedPreview,
          stdoutSummary, stderrSummary,
        })],
      };
    }

    return {
      ...base,
      decision: "executed_failure", executed: true,
      exitCode: processResult.exitCode, durationMs: processResult.durationMs,
      stdoutSummary, stderrSummary,
      error: errorSummary ?? `Hermes CLI exited with code ${processResult.exitCode}`,
      invokesCli: true, spawnsProcess: true,
      auditEvents: [buildHermesAudit({
        requestId: input.request.requirementId, requestType: input.request.type,
        decision: "executed_failure", executed: true,
        invokesCli: true, spawnsProcess: true,
        commandPreview: sanitizedPreview,
        stdoutSummary, stderrSummary,
        error: errorSummary ?? `Hermes CLI exited with code ${processResult.exitCode}`,
      })],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const sanitizedError = sanitizeErrorSummary(msg) ?? "Unknown error";
    return {
      ...base,
      decision: "executed_failure", executed: true,
      error: sanitizedError,
      invokesCli: true, spawnsProcess: true,
      auditEvents: [buildHermesAudit({
        requestId: input.request.requirementId, requestType: input.request.type,
        decision: "executed_failure", executed: true,
        invokesCli: true, spawnsProcess: true,
        commandPreview: sanitizedPreview,
        error: sanitizedError,
      })],
    };
  }
}
