// Kimi CLI Command Executor Contract
// =====================================
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
  getKimiCliAdapterConfig,
  isKimiCliRequestPlanned,
} from "./kimi-cli-adapter-contract";

export type KimiCliExecutorDecision =
  | "disabled"
  | "missing_cli_command"
  | "unsupported_request_type"
  | "contract_ready"
  | "mock_success"
  | "mock_failure"
  | "mock_timeout";

export interface KimiCliExecutorCommandInput {
  adapter: "kimi";
  requestId: string;
  requestType: string;
  command: string;
  args: string[];
  workingDirectory?: string;
  timeoutMs: number;
  sanitized: true;
  stdin?: string;
  maxStdoutPayloadChars?: number;
}

export interface KimiCliExecutorContractResult {
  success: boolean;
  decision: KimiCliExecutorDecision;
  requestId: string;
  commandInput?: KimiCliExecutorCommandInput;
  auditEvents: CliAdapterAuditEvent[];
  error?: string;
}

export function buildKimiCliExecutorCommandInput(input: {
  request: ExecutionRequest;
  config: CliAdapterConfig;
}): KimiCliExecutorCommandInput | undefined {
  if (!input.config.command) return undefined;
  if (!isKimiCliRequestPlanned(input.request.type)) return undefined;
  return {
    adapter: "kimi",
    requestId: input.request.requirementId,
    requestType: input.request.type,
    command: input.config.command,
    args: sanitizeCliArgs(input.config.args),
    workingDirectory: input.config.workingDirectory,
    timeoutMs: input.config.timeoutMs,
    sanitized: true,
  };
}

export function prepareKimiCliExecutorContract(input: {
  request: ExecutionRequest;
  config?: CliAdapterConfig;
}): KimiCliExecutorContractResult {
  const config = input.config ?? getKimiCliAdapterConfig();
  const requestId = input.request.requirementId;

  if (!config.enabled) {
    return {
      success: false, decision: "disabled", requestId,
      auditEvents: [buildCliExecutionSkippedAudit({ adapter: "kimi", requestId, requestType: input.request.type, reason: "disabled", config })],
      error: "Kimi CLI adapter is disabled",
    };
  }

  if (!config.command) {
    return {
      success: false, decision: "missing_cli_command", requestId,
      auditEvents: [
        buildCliCommandPreviewAudit({ adapter: "kimi", requestId, requestType: input.request.type, config }),
        buildCliExecutionSkippedAudit({ adapter: "kimi", requestId, requestType: input.request.type, reason: "missing_cli_command", config }),
      ],
      error: "Kimi CLI adapter: no CLI command configured",
    };
  }

  if (!isKimiCliRequestPlanned(input.request.type)) {
    return {
      success: false, decision: "unsupported_request_type", requestId,
      auditEvents: [buildCliExecutionSkippedAudit({ adapter: "kimi", requestId, requestType: input.request.type, reason: "unsupported_request_type", config })],
      error: `Kimi CLI adapter does not support request type: ${input.request.type}`,
    };
  }

  const cmdInput = buildKimiCliExecutorCommandInput({ request: input.request, config });
  return {
    success: true, decision: "contract_ready", requestId,
    commandInput: cmdInput!,
    auditEvents: [buildCliCommandPreviewAudit({ adapter: "kimi", requestId, requestType: input.request.type, config })],
  };
}

export function buildKimiCliMockExecutorResult(input: {
  request: ExecutionRequest;
  config: CliAdapterConfig;
  exitCode?: number;
  durationMs?: number;
  errorSummary?: string;
  timedOut?: boolean;
}): KimiCliExecutorContractResult {
  const contract = prepareKimiCliExecutorContract({ request: input.request, config: input.config });
  if (!contract.success) return contract;

  const resultAudit = buildCliExecutionResultAudit({
    adapter: "kimi", requestId: input.request.requirementId, requestType: input.request.type,
    config: input.config, exitCode: input.exitCode, durationMs: input.durationMs,
    errorSummary: input.errorSummary, timedOut: input.timedOut,
  });

  if (input.timedOut) {
    return { success: false, decision: "mock_timeout", requestId: input.request.requirementId, commandInput: contract.commandInput, auditEvents: [...contract.auditEvents, resultAudit] };
  }
  if (input.exitCode === 0) {
    return { success: true, decision: "mock_success", requestId: input.request.requirementId, commandInput: contract.commandInput, auditEvents: [...contract.auditEvents, resultAudit] };
  }
  return { success: false, decision: "mock_failure", requestId: input.request.requirementId, commandInput: contract.commandInput, auditEvents: [...contract.auditEvents, resultAudit] };
}
