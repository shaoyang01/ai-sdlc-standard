// Kimi Gateway Real Dispatch
// =============================
// Real Kimi dispatch behind explicit feature flags.
// Supports llm_task only. Default off. Gateway-controlled.

import type { ExecutionRequest, ExecutionResult } from "./types";
import type { CliAdapterConfig } from "./cli-adapter-contract-types";
import type { KimiCliProcessRunner } from "./kimi-cli-command-executor";
import { evaluateKimiGatewayRealDispatchContract, type KimiGatewayRealDispatchDecision } from "./kimi-gateway-real-dispatch-contract";
import { executeKimiCliCommand } from "./kimi-cli-command-executor";
import { getKimiCliAdapterConfig } from "./kimi-cli-adapter-contract";
import { sanitizeErrorSummary } from "./cli-adapter-audit";

export type KimiGatewayRealDispatchResultStatus =
  | "disabled" | "unsupported" | "executed_success"
  | "executed_failure" | "executed_timeout" | "contract_rejected";

export interface KimiGatewayRealDispatchResult {
  adapter: "kimi";
  status: KimiGatewayRealDispatchResultStatus;
  requestId: string;
  requestType: string;
  contractDecision: KimiGatewayRealDispatchDecision;
  executed: boolean;
  primaryGatewayControlled: true;
  affectsRuntimeRouting: false;
  affectsFinalStatus: false;
  writesFiles: false;
  persistsAudit: false;
  stdoutSummary?: string;
  stderrSummary?: string;
  error?: string;
  warnings: string[];
  auditEvents: unknown[];
}

export async function dispatchKimiGatewayReal(input: {
  request: ExecutionRequest;
  config?: CliAdapterConfig;
  env?: Record<string, string | undefined>;
  runner?: KimiCliProcessRunner;
}): Promise<KimiGatewayRealDispatchResult> {
  const contract = evaluateKimiGatewayRealDispatchContract({
    request: input.request, config: input.config, env: input.env,
  });

  const base = {
    adapter: "kimi" as const,
    requestId: input.request.requirementId,
    requestType: input.request.type,
    contractDecision: contract.decision,
    primaryGatewayControlled: true as const,
    affectsRuntimeRouting: false as const,
    affectsFinalStatus: false as const,
    writesFiles: false as const,
    persistsAudit: false as const,
    warnings: [...contract.warnings],
    auditEvents: [...contract.auditEvents],
  };

  if (!contract.eligible) {
    const statusMap: Record<string, KimiGatewayRealDispatchResultStatus> = {
      real_dispatch_disabled: "disabled",
      gateway_integration_disabled: "disabled",
      command_execution_disabled: "disabled",
      adapter_disabled: "disabled",
      missing_cli_command: "disabled",
      unsupported_request_type: "unsupported",
    };
    return { ...base, status: statusMap[contract.decision] ?? "disabled", executed: false };
  }

  try {
    const execResult = await executeKimiCliCommand({
      request: input.request, config: input.config, env: input.env, runner: input.runner,
    });

    const statusMap: Record<string, KimiGatewayRealDispatchResultStatus> = {
      executed_success: "executed_success",
      executed_failure: "executed_failure",
      executed_timeout: "executed_timeout",
    };

    return {
      ...base,
      status: statusMap[execResult.decision] ?? "executed_failure",
      executed: execResult.decision.startsWith("executed"),
      stdoutSummary: execResult.stdoutSummary,
      stderrSummary: execResult.stderrSummary,
      error: execResult.error,
      auditEvents: [...base.auditEvents, ...execResult.auditEvents],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      status: "executed_failure",
      executed: false,
      error: sanitizeErrorSummary(msg) ?? "Unknown error",
    };
  }
}

export async function executeKimiGatewayRequest(
  request: ExecutionRequest,
  config?: CliAdapterConfig,
  runner?: KimiCliProcessRunner,
): Promise<ExecutionResult> {
  const resolvedConfig = config ?? getKimiCliAdapterConfig();
  const dispatch = await dispatchKimiGatewayReal({ request, config: resolvedConfig, runner });

  if (dispatch.status === "executed_success") {
    const artifact = createArtifact({
      requirementId: dispatch.requestId, node: request.node, type: "shadow_output",
      content: { result: `kimi_llm_task_completed`, summary: dispatch.stdoutSummary ?? "" },
      agent: "kimi", source: "execution_gateway", id: `${dispatch.requestId}:kimi:shadow_output`,
    });
    return { success: true, node: request.node, agent: "kimi", output: { result: "kimi_executed_success", summary: dispatch.stdoutSummary }, artifacts: [artifact] };
  }

  return {
    success: false, node: request.node, agent: "kimi",
    output: { error: dispatch.error ?? `Kimi dispatch: ${dispatch.status}` },
    artifacts: [], error: dispatch.error ?? dispatch.status,
  };
}
