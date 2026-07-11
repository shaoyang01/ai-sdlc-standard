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
  | "missing_prompt"
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

const SECRET_KEY_PATTERNS = ["token=", "api_key=", "apikey=", "secret=", "password="];
const SECRET_PREFIX = "sk-";
const MAX_ERROR_LENGTH = 300;

function isSecretLikeToken(value: string): boolean {
  const lower = value.toLowerCase();
  for (const key of SECRET_KEY_PATTERNS) {
    if (lower.includes(key)) return true;
  }
  return lower.startsWith(SECRET_PREFIX);
}

export function sanitizeCliArgs(args: string[]): string[] {
  return args.map((a) => isSecretLikeToken(a) ? "[REDACTED]" : a);
}

const REDACTED_PROMPT_PLACEHOLDER = "[REDACTED_PROMPT]";
const REDACTED_INPUT_PLACEHOLDER = "[REDACTED_INPUT]";
const MIN_REDACT_LENGTH = 8;

/**
 * Build sanitized args for display/audit when the dynamic prompt is passed
 * as a CLI argument. Replaces the prompt value with a placeholder while
 * preserving the static args and the prompt flag (e.g. "-p").
 */
export function buildSanitizedPromptArgs(
  staticArgs: string[],
  promptArg?: string,
): string[] {
  if (!promptArg) return sanitizeCliArgs(staticArgs);
  return [...sanitizeCliArgs(staticArgs), promptArg, REDACTED_PROMPT_PLACEHOLDER];
}

/**
 * Redact every exact occurrence of the dynamic prompt from a string.
 * Must be applied to stderr and stdout summaries before they reach
 * audit events, observability, fallback classification, or returned errors.
 *
 * Uses exact string matching (not regex) to avoid injection risks.
 */
export function redactDynamicPrompt(
  value: string | undefined,
  prompt: string | undefined,
): string | undefined {
  if (!value || !prompt || prompt.length === 0) return value;
  const parts = value.split(prompt);
  return parts.join(REDACTED_PROMPT_PLACEHOLDER);
}

/**
 * Redact every exact occurrence of the original raw requirement/input
 * from a string. Uses `[REDACTED_INPUT]` placeholder.
 *
 * Only redacts inputs with length >= MIN_REDACT_LENGTH (8 chars)
 * to avoid over-redaction of short common words.
 *
 * Uses exact string matching (not regex) to avoid injection risks.
 */
export function redactRawInput(
  value: string | undefined,
  rawInput: string | undefined,
): string | undefined {
  if (!value || !rawInput || rawInput.length < MIN_REDACT_LENGTH) return value;
  const parts = value.split(rawInput);
  return parts.join(REDACTED_INPUT_PLACEHOLDER);
}

export function sanitizeErrorSummary(input: string | undefined): string | undefined {
  if (!input || input.trim() === "") return undefined;
  const normalized = input.replace(/\n/g, " ");
  const tokens = normalized.split(/\s+/);
  const sanitized = tokens.map((t) => isSecretLikeToken(t) ? "[REDACTED]" : t).join(" ");
  return sanitized.length > MAX_ERROR_LENGTH ? sanitized.slice(0, MAX_ERROR_LENGTH) + "…" : sanitized;
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
  reason: "disabled" | "missing_cli_command" | "unsupported_request_type" | "skipped_contract_only" | "missing_prompt";
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
