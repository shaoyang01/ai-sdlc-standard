// Hermes CLI Command Executor Contract
// =======================================
// Contract-only executor. No process spawn. No CLI execution.
// Builds command input, audit events, and mock results.

import type { ExecutionRequest } from "./types";
import type { CliAdapterConfig } from "./cli-adapter-contract-types";
import {
  buildCliCommandPreviewAudit,
  buildCliExecutionSkippedAudit,
  buildCliExecutionResultAudit,
  sanitizeCliArgs,
  type CliAdapterAuditEvent,
} from "./cli-adapter-audit";
import {
  getHermesCliAdapterConfig,
  isHermesCliRequestPlanned,
} from "./hermes-cli-adapter-contract";

export type HermesCliExecutorDecision =
  | "disabled" | "missing_cli_command" | "unsupported_request_type"
  | "contract_ready" | "mock_success" | "mock_failure" | "mock_timeout";

export interface HermesCliExecutorCommandInput {
  adapter: "hermes"; requestId: string; requestType: string;
  command: string; args: string[]; workingDirectory?: string;
  timeoutMs: number; sanitized: true;
}

export interface HermesCliExecutorContractResult {
  success: boolean; decision: HermesCliExecutorDecision;
  requestId: string; commandInput?: HermesCliExecutorCommandInput;
  auditEvents: CliAdapterAuditEvent[]; error?: string;
}

export function buildHermesCliExecutorCommandInput(input: {
  request: ExecutionRequest; config: CliAdapterConfig;
}): HermesCliExecutorCommandInput | undefined {
  if (!input.config.command || !isHermesCliRequestPlanned(input.request.type)) return undefined;
  return {
    adapter: "hermes", requestId: input.request.requirementId, requestType: input.request.type,
    command: input.config.command, args: sanitizeCliArgs(input.config.args),
    workingDirectory: input.config.workingDirectory, timeoutMs: input.config.timeoutMs, sanitized: true,
  };
}

export function prepareHermesCliExecutorContract(input: {
  request: ExecutionRequest; config?: CliAdapterConfig;
}): HermesCliExecutorContractResult {
  const config = input.config ?? getHermesCliAdapterConfig();
  const requestId = input.request.requirementId;

  if (!config.enabled) return { success: false, decision: "disabled", requestId, auditEvents: [buildCliExecutionSkippedAudit({ adapter: "hermes", requestId, requestType: input.request.type, reason: "disabled", config })], error: "Hermes CLI adapter is disabled" };
  if (!config.command) return { success: false, decision: "missing_cli_command", requestId, auditEvents: [buildCliCommandPreviewAudit({ adapter: "hermes", requestId, requestType: input.request.type, config }), buildCliExecutionSkippedAudit({ adapter: "hermes", requestId, requestType: input.request.type, reason: "missing_cli_command", config })], error: "Hermes CLI adapter: no CLI command configured" };
  if (!isHermesCliRequestPlanned(input.request.type)) return { success: false, decision: "unsupported_request_type", requestId, auditEvents: [buildCliExecutionSkippedAudit({ adapter: "hermes", requestId, requestType: input.request.type, reason: "unsupported_request_type", config })], error: `Hermes CLI adapter does not support request type: ${input.request.type}` };

  const cmdInput = buildHermesCliExecutorCommandInput({ request: input.request, config });
  return { success: true, decision: "contract_ready", requestId, commandInput: cmdInput!, auditEvents: [buildCliCommandPreviewAudit({ adapter: "hermes", requestId, requestType: input.request.type, config })] };
}

export function buildHermesCliMockExecutorResult(input: {
  request: ExecutionRequest; config: CliAdapterConfig;
  exitCode?: number; durationMs?: number; errorSummary?: string; timedOut?: boolean;
}): HermesCliExecutorContractResult {
  const contract = prepareHermesCliExecutorContract({ request: input.request, config: input.config });
  if (!contract.success) return contract;
  const resultAudit = buildCliExecutionResultAudit({ adapter: "hermes", requestId: input.request.requirementId, requestType: input.request.type, config: input.config, exitCode: input.exitCode, durationMs: input.durationMs, errorSummary: input.errorSummary, timedOut: input.timedOut });
  if (input.timedOut) return { success: false, decision: "mock_timeout", requestId: input.request.requirementId, commandInput: contract.commandInput, auditEvents: [...contract.auditEvents, resultAudit] };
  if (input.exitCode === 0) return { success: true, decision: "mock_success", requestId: input.request.requirementId, commandInput: contract.commandInput, auditEvents: [...contract.auditEvents, resultAudit] };
  return { success: false, decision: "mock_failure", requestId: input.request.requirementId, commandInput: contract.commandInput, auditEvents: [...contract.auditEvents, resultAudit] };
}
