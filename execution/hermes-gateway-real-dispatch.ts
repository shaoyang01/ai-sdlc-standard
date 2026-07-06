// Hermes Gateway Real Dispatch
// ===============================
// Feature-flagged standalone real dispatch helper for Hermes.
// Does NOT wire into ExecutionGateway. Does NOT change runtime.
// Requires three explicit flags for real execution.
// Default off. Sidecar only. Fake-runner tested.

import type { ExecutionRequest } from "./types";
import type { CliAdapterConfig } from "./cli-adapter-contract-types";
import type { HermesCliProcessRunner } from "./hermes-cli-command-executor";
import {
  evaluateHermesGatewayRealDispatchContract,
  type HermesGatewayRealDispatchContractDecision,
} from "./hermes-gateway-real-dispatch-contract";
import {
  executeHermesCliCommand,
} from "./hermes-cli-command-executor";
import { sanitizeErrorSummary } from "./cli-adapter-audit";

export type HermesGatewayRealDispatchStatus =
  | "dispatch_disabled"
  | "dispatch_ineligible"
  | "dispatch_executed_success"
  | "dispatch_executed_failure"
  | "dispatch_executed_timeout"
  | "dispatch_guarded_fallback";

export interface HermesGatewayRealDispatchResult {
  adapter: "hermes";
  source: "hermes_gateway_real_dispatch";
  status: HermesGatewayRealDispatchStatus;
  requestId: string;
  requestType: string;
  enabled: boolean;
  eligible: boolean;
  executed: boolean;
  contractDecision: HermesGatewayRealDispatchContractDecision;
  commandDecision?: string;
  outputSummary?: string;
  errorSummary?: string;
  fallbackAction:
    | "preserve_existing_gateway_behavior"
    | "fallback_without_final_status_change";
  affectsPrimaryGatewayResult: false;
  changesGatewayPrimaryDispatch: false;
  changesRuntimeFinalStatus: false;
  changesRuntimeRouting: false;
  writesFiles: false;
  persistsAudit: false;
  containsRawPrompt: false;
  containsRawArtifacts: false;
  containsSecrets: false;
  warnings: string[];
}

function sanitizeHermesDispatchText(value?: string): string | undefined {
  if (!value || value.trim() === "") return undefined;
  const sanitized = sanitizeErrorSummary(value) ?? value;
  const scrubbed = sanitized
    .replace(/THIS_HERMES_GATEWAY_REAL_DISPATCH_PROMPT_MUST_NOT_LEAK/g, "[REDACTED_RAW_PROMPT]");
  return scrubbed.length > 1000 ? scrubbed.slice(0, 1000) + "…[truncated]" : scrubbed;
}

export async function dispatchHermesGatewayReal(input: {
  request: ExecutionRequest;
  config?: CliAdapterConfig;
  env?: Record<string, string | undefined>;
  runner?: HermesCliProcessRunner;
}): Promise<HermesGatewayRealDispatchResult> {
  const contract = evaluateHermesGatewayRealDispatchContract({
    request: input.request, config: input.config, env: input.env,
  });

  const base = {
    adapter: "hermes" as const,
    source: "hermes_gateway_real_dispatch" as const,
    requestId: input.request.requirementId,
    requestType: input.request.type,
    contractDecision: contract.decision,
    affectsPrimaryGatewayResult: false as const,
    changesGatewayPrimaryDispatch: false as const,
    changesRuntimeFinalStatus: false as const,
    changesRuntimeRouting: false as const,
    writesFiles: false as const,
    persistsAudit: false as const,
    containsRawPrompt: false as const,
    containsRawArtifacts: false as const,
    containsSecrets: false as const,
    warnings: [...contract.warnings],
  };

  // Contract ineligible — real dispatch disabled
  if (contract.decision === "real_dispatch_disabled") {
    return {
      ...base,
      status: "dispatch_disabled", enabled: false, eligible: false, executed: false,
      fallbackAction: "preserve_existing_gateway_behavior",
    };
  }

  // Contract ineligible — other reasons
  if (!contract.eligible) {
    return {
      ...base,
      status: "dispatch_ineligible", enabled: true, eligible: false, executed: false,
      fallbackAction: "preserve_existing_gateway_behavior",
    };
  }

  // Contract eligible — execute CLI
  try {
    const execResult = await executeHermesCliCommand({
      request: input.request, config: input.config, env: input.env, runner: input.runner,
    });

    const statusMap: Record<string, HermesGatewayRealDispatchStatus> = {
      executed_success: "dispatch_executed_success",
      executed_failure: "dispatch_executed_failure",
      executed_timeout: "dispatch_executed_timeout",
    };
    const status = statusMap[execResult.decision] ?? "dispatch_guarded_fallback";
    const isSuccess = status === "dispatch_executed_success";

    return {
      ...base,
      status, enabled: true, eligible: true,
      executed: execResult.decision.startsWith("executed"),
      commandDecision: execResult.decision,
      outputSummary: sanitizeHermesDispatchText(execResult.stdoutSummary),
      errorSummary: sanitizeHermesDispatchText(execResult.stderrSummary) ?? sanitizeHermesDispatchText(execResult.error),
      fallbackAction: isSuccess
        ? "preserve_existing_gateway_behavior"
        : "fallback_without_final_status_change",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      status: "dispatch_guarded_fallback", enabled: true, eligible: true, executed: false,
      errorSummary: sanitizeErrorSummary(msg) ?? "Unknown error",
      fallbackAction: "fallback_without_final_status_change",
    };
  }
}
