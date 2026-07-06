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
import { createArtifact } from "../core/artifact";
import { classifyKimiGatewayRealDispatchFallback } from "./kimi-gateway-real-dispatch-fallback-policy";
import {
  buildKimiGatewayRealDispatchObservabilityEvent,
  buildObservabilitySummary,
  type KimiGatewayRealDispatchObservabilityEvent,
} from "./kimi-gateway-real-dispatch-observability";
import {
  evaluateKimiGatewayGuardrails,
  clampKimiGatewaySummary,
  KIMI_GATEWAY_GUARDRAIL_LIMITS,
  type KimiGatewayGuardrailLimits,
  type KimiGatewayGuardrailDecision,
} from "./kimi-gateway-real-dispatch-guardrails";

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
  observabilityEvents: KimiGatewayRealDispatchObservabilityEvent[];
  guardrailDecision?: KimiGatewayGuardrailDecision;
}

export async function dispatchKimiGatewayReal(input: {
  request: ExecutionRequest;
  config?: CliAdapterConfig;
  env?: Record<string, string | undefined>;
  runner?: KimiCliProcessRunner;
  guardrailLimits?: Partial<KimiGatewayGuardrailLimits>;
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
    return { ...base, status: statusMap[contract.decision] ?? "disabled", executed: false,
      observabilityEvents: [buildKimiGatewayRealDispatchObservabilityEvent({
        stage: "contract_rejected", request: input.request,
        contractDecision: contract.decision,
        dispatchStatus: statusMap[contract.decision] ?? "disabled",
      })],
    };
    }

  // ── Operational Guardrails (before CLI execution) ───
  const guardrail = evaluateKimiGatewayGuardrails({
    request: input.request,
    config: input.config,
    limits: input.guardrailLimits,
  });
  if (!guardrail.allowed) {
    return {
      ...base,
      status: guardrail.decision === "unsupported_request_type" ? "unsupported" : "contract_rejected",
      executed: false,
      error: guardrail.sanitizedMessage,
      warnings: [...base.warnings, ...guardrail.warnings],
      guardrailDecision: guardrail.decision,
      observabilityEvents: [
        buildKimiGatewayRealDispatchObservabilityEvent({
          stage: "contract_rejected", request: input.request,
          contractDecision: guardrail.decision,
          dispatchStatus: guardrail.decision,
          warnings: guardrail.warnings,
        }),
      ],
    };
  }

  const limits = { ...KIMI_GATEWAY_GUARDRAIL_LIMITS, ...input.guardrailLimits };

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
      stdoutSummary: clampKimiGatewaySummary({ value: execResult.stdoutSummary, maxLength: limits.maxStdoutSummaryLength }),
      stderrSummary: clampKimiGatewaySummary({ value: execResult.stderrSummary, maxLength: limits.maxStderrSummaryLength }),
      error: clampKimiGatewaySummary({ value: execResult.error, maxLength: limits.maxErrorSummaryLength }),
      auditEvents: [...base.auditEvents, ...execResult.auditEvents],
      observabilityEvents: [
        buildKimiGatewayRealDispatchObservabilityEvent({
          stage: "execution_started", request: input.request,
          contractDecision: contract.decision,
        }),
        buildKimiGatewayRealDispatchObservabilityEvent({
          stage: statusMap[execResult.decision] === "executed_success" ? "execution_success"
            : statusMap[execResult.decision] === "executed_timeout" ? "execution_timeout"
            : "execution_failure",
          request: input.request,
          contractDecision: contract.decision,
          dispatchStatus: statusMap[execResult.decision],
          executed: execResult.decision.startsWith("executed"),
          invokesCli: true,
          spawnsProcess: execResult.decision === "executed_success",
        }),
      ],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      status: "executed_failure",
      executed: false,
      error: sanitizeErrorSummary(msg) ?? "Unknown error",
      observabilityEvents: [buildKimiGatewayRealDispatchObservabilityEvent({
        stage: "execution_failure", request: input.request,
        contractDecision: contract.decision,
        executed: false,
      })],
    };
  }
}

export async function executeKimiGatewayRequest(
  request: ExecutionRequest,
  config?: CliAdapterConfig,
  runner?: KimiCliProcessRunner,
  guardrailLimits?: Partial<KimiGatewayGuardrailLimits>,
): Promise<ExecutionResult> {
  const resolvedConfig = config ?? getKimiCliAdapterConfig();
  const dispatch = await dispatchKimiGatewayReal({ request, config: resolvedConfig, runner, guardrailLimits });

  if (dispatch.status === "executed_success") {
    const artifact = createArtifact({
      requirementId: dispatch.requestId, node: request.node, type: "shadow_output",
      content: { result: `kimi_llm_task_completed`, summary: dispatch.stdoutSummary ?? "" },
      agent: "kimi", source: "execution_gateway", id: `${dispatch.requestId}:kimi:shadow_output`,
    });
    return {
      success: true, node: request.node, agent: "kimi",
      output: {
        result: "kimi_executed_success", summary: dispatch.stdoutSummary,
        observability: buildObservabilitySummary(dispatch.observabilityEvents),
      },
      artifacts: [artifact],
    };
  }

  const fallback = classifyKimiGatewayRealDispatchFallback({
    contractDecision: dispatch.contractDecision,
    dispatchStatus: dispatch.status,
    error: dispatch.error ?? dispatch.stderrSummary,
  });
  return {
    success: false, node: request.node, agent: "kimi",
    output: {
      error: fallback.sanitizedMessage,
      fallback_action: fallback.action,
      fallback_reason: fallback.reason,
      observability: buildObservabilitySummary(dispatch.observabilityEvents),
      ...(dispatch.guardrailDecision ? { guardrail_decision: dispatch.guardrailDecision } : {}),
    },
    artifacts: [],
    error: fallback.sanitizedMessage,
  };
}
