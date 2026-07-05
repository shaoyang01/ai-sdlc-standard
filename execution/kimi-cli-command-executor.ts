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
} from "./cli-adapter-audit";
import {
  prepareKimiCliExecutorContract,
  type KimiCliExecutorCommandInput,
} from "./kimi-cli-executor-contract";

export type KimiCliCommandExecutorDecision =
  | "disabled" | "missing_cli_command" | "unsupported_request_type"
  | "execution_not_enabled" | "executed_success" | "executed_failure" | "executed_timeout";

export interface KimiCliProcessResult {
  exitCode?: number; stdout?: string; stderr?: string;
  durationMs: number; timedOut?: boolean;
}

export interface KimiCliProcessRunner {
  run(commandInput: KimiCliExecutorCommandInput): Promise<KimiCliProcessResult>;
}

export interface KimiCliCommandExecutorResult {
  success: boolean; decision: KimiCliCommandExecutorDecision;
  requestId: string; commandInput?: KimiCliExecutorCommandInput;
  auditEvents: CliAdapterAuditEvent[];
  stdoutSummary?: string; stderrSummary?: string; error?: string;
}

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
            stdout: stdout.slice(0, 4000),
            stderr: stderr.slice(0, 4000),
          });
        }, commandInput.timeoutMs);

        child.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
        child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });

        child.on("error", (err) => {
          finish({ durationMs: Date.now() - start, stderr: err.message });
        });

        child.on("close", (code) => {
          finish({ exitCode: code ?? undefined, durationMs: Date.now() - start, stdout: stdout.slice(0, 4000), stderr: stderr.slice(0, 4000) });
        });
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
  const processResult = await runner.run(contract.commandInput!);

  const resultAudit = buildCliExecutionResultAudit({
    adapter: "kimi", requestId: contract.requestId,
    requestType: input.request.type, config: input.config,
    exitCode: processResult.exitCode, durationMs: processResult.durationMs,
    errorSummary: processResult.stderr, timedOut: processResult.timedOut,
  });

  const stdoutSummary = summarizeOutput(processResult.stdout);
  const stderrSummary = summarizeOutput(processResult.stderr);

  if (processResult.timedOut) {
    return { success: false, decision: "executed_timeout", requestId: contract.requestId, commandInput: contract.commandInput, auditEvents: [...contract.auditEvents, resultAudit], stdoutSummary, stderrSummary, error: "Kimi CLI command timed out" };
  }
  if (processResult.exitCode === 0) {
    return { success: true, decision: "executed_success", requestId: contract.requestId, commandInput: contract.commandInput, auditEvents: [...contract.auditEvents, resultAudit], stdoutSummary, stderrSummary };
  }
  return { success: false, decision: "executed_failure", requestId: contract.requestId, commandInput: contract.commandInput, auditEvents: [...contract.auditEvents, resultAudit], stdoutSummary, stderrSummary, error: `Kimi CLI exited with code ${processResult.exitCode}` };
}
