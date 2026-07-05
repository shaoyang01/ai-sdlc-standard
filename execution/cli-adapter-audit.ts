// CLI Adapter Audit Trail
// ========================
// Shared audit trail contract for future real CLI adapter execution.
// Metadata-only. No process spawn, no CLI execution, no persistence.
// Sanitizes secrets. Never includes raw prompts or artifacts.

import type { ExecutionRequestType } from "./types";
import type { CliAdapterName, CliAdapterConfig } from "./cli-adapter-contract-types";

export type CliAdapterAuditStage =
  | "config_loaded"
  | "request_gated"
  | "command_preview_built"
  | "dry_run_ready"
  | "execution_skipped"
  | "execution_started"
  | "execution_completed"
  | "execution_failed";

export type CliAdapterAuditOutcome =
  | "disabled"
  | "missing_cli_command"
  | "unsupported_request_type"
  | "dry_run_ready"
  | "skipped_contract_only"
  | "success"
  | "failure"
  | "timeout";

export interface CliAdapterAuditEvent {
  adapter: CliAdapterName;
  stage: CliAdapterAuditStage;
  outcome: CliAdapterAuditOutcome;
  requestId: string;
  requestType: ExecutionRequestType | string;
  timestampIso: string;
  command?: string;
  args?: string[];
  workingDirectory?: string;
  timeoutMs?: number;
  exitCode?: number;
  durationMs?: number;
  sanitized: true;
  invokesCli: boolean;
  spawnsProcess: boolean;
  persistsAudit: false;
  writesFiles: false;
  affectsRuntime: false;
  affectsGateway: false;
  containsRawPrompt: false;
  containsRawArtifacts: false;
  containsSecrets: false;
  warnings: string[];
  errorSummary?: string;
}

const SECRET_PATTERNS = [/token=/i, /api_key=/i, /apikey=/i, /secret=/i, /password=/i, /^sk-/];
const MAX_ERROR_LENGTH = 300;

export function sanitizeCliArgs(args: string[]): string[] {
  return args.map((a) => {
    for (const p of SECRET_PATTERNS) if (p.test(a)) return "[REDACTED]";
    return a;
  });
}

export function sanitizeErrorSummary(input: string | undefined): string | undefined {
  if (!input || input.trim() === "") return undefined;
  let out = input.replace(/\n/g, " ");
  for (const p of SECRET_PATTERNS) {
    out = out.replace(new RegExp(p.source.replace("^", ""), "gi"), "[REDACTED]");
  }
  return out.length > MAX_ERROR_LENGTH ? out.slice(0, MAX_ERROR_LENGTH) + "…" : out;
}

export function buildCliAdapterAuditEvent(input: {
  adapter: CliAdapterName;
  stage: CliAdapterAuditStage;
  outcome: CliAdapterAuditOutcome;
  requestId: string;
  requestType: ExecutionRequestType | string;
  config?: CliAdapterConfig;
  command?: string;
  args?: string[];
  workingDirectory?: string;
  timeoutMs?: number;
  exitCode?: number;
  durationMs?: number;
  errorSummary?: string;
  warnings?: string[];
  invokesCli?: boolean;
  spawnsProcess?: boolean;
}): CliAdapterAuditEvent {
  const cmd = input.command ?? input.config?.command;
  const args = input.args ?? input.config?.args;
  return {
    adapter: input.adapter, stage: input.stage, outcome: input.outcome,
    requestId: input.requestId, requestType: input.requestType,
    timestampIso: new Date().toISOString(),
    command: cmd, args: args ? sanitizeCliArgs(args) : undefined,
    workingDirectory: input.workingDirectory ?? input.config?.workingDirectory,
    timeoutMs: input.timeoutMs ?? input.config?.timeoutMs,
    exitCode: input.exitCode, durationMs: input.durationMs,
    sanitized: true,
    invokesCli: input.invokesCli ?? false,
    spawnsProcess: input.spawnsProcess ?? false,
    persistsAudit: false, writesFiles: false,
    affectsRuntime: false, affectsGateway: false,
    containsRawPrompt: false, containsRawArtifacts: false, containsSecrets: false,
    warnings: input.warnings ?? [],
    errorSummary: sanitizeErrorSummary(input.errorSummary),
  };
}

export function buildCliCommandPreviewAudit(input: {
  adapter: CliAdapterName;
  requestId: string;
  requestType: ExecutionRequestType | string;
  config: CliAdapterConfig;
}): CliAdapterAuditEvent {
  return buildCliAdapterAuditEvent({
    adapter: input.adapter, requestId: input.requestId, requestType: input.requestType,
    stage: "command_preview_built",
    outcome: input.config.command ? "dry_run_ready" : "missing_cli_command",
    config: input.config,
  });
}

export function buildCliExecutionSkippedAudit(input: {
  adapter: CliAdapterName;
  requestId: string;
  requestType: ExecutionRequestType | string;
  reason: "disabled" | "missing_cli_command" | "unsupported_request_type" | "skipped_contract_only";
  config?: CliAdapterConfig;
}): CliAdapterAuditEvent {
  return buildCliAdapterAuditEvent({
    adapter: input.adapter, requestId: input.requestId, requestType: input.requestType,
    stage: "execution_skipped", outcome: input.reason as CliAdapterAuditOutcome,
    config: input.config,
  });
}

export function buildCliExecutionResultAudit(input: {
  adapter: CliAdapterName;
  requestId: string;
  requestType: ExecutionRequestType | string;
  config?: CliAdapterConfig;
  exitCode?: number;
  durationMs?: number;
  errorSummary?: string;
  timedOut?: boolean;
}): CliAdapterAuditEvent {
  const success = !input.timedOut && input.exitCode === 0;
  return buildCliAdapterAuditEvent({
    adapter: input.adapter, requestId: input.requestId, requestType: input.requestType,
    stage: input.timedOut || (input.exitCode !== undefined && input.exitCode !== 0) ? "execution_failed" : "execution_completed",
    outcome: input.timedOut ? "timeout" : success ? "success" : "failure",
    config: input.config, exitCode: input.exitCode, durationMs: input.durationMs,
    errorSummary: input.errorSummary, invokesCli: true, spawnsProcess: true,
  });
}
