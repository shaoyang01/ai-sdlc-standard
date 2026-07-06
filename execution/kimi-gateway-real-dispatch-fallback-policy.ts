// Kimi Gateway Real Dispatch Fallback Policy
// ============================================
// Defines structured fallback behavior for all Kimi dispatch outcomes.
// Contract/policy only. No CLI execution. No Gateway modification.

import type { KimiGatewayRealDispatchDecision } from "./kimi-gateway-real-dispatch-contract";
import type { KimiGatewayRealDispatchResultStatus } from "./kimi-gateway-real-dispatch";
import { sanitizeErrorSummary } from "./cli-adapter-audit";

export type KimiGatewayRealDispatchFallbackReason =
  | "real_dispatch_disabled" | "gateway_integration_disabled"
  | "command_execution_disabled" | "adapter_disabled"
  | "missing_cli_command" | "unsupported_request_type"
  | "cli_failure" | "cli_timeout" | "guardrail_rejected"
  | "unexpected_error";

export type KimiGatewayRealDispatchFallbackAction =
  | "fall_through_to_shadow" | "return_structured_disabled"
  | "return_structured_unsupported" | "return_structured_failure"
  | "return_structured_timeout";

export interface KimiGatewayRealDispatchFallbackPolicy {
  reason: KimiGatewayRealDispatchFallbackReason;
  action: KimiGatewayRealDispatchFallbackAction;
  success: false;
  affectsFinalStatus: false;
  affectsRuntimeRouting: false;
  writesFiles: false;
  persistsAudit: false;
  sanitizedMessage: string;
  warnings: string[];
}

const FALLBACK_MAP: Record<string, { reason: KimiGatewayRealDispatchFallbackReason; action: KimiGatewayRealDispatchFallbackAction }> = {
  real_dispatch_disabled: { reason: "real_dispatch_disabled", action: "fall_through_to_shadow" },
  gateway_integration_disabled: { reason: "gateway_integration_disabled", action: "return_structured_disabled" },
  command_execution_disabled: { reason: "command_execution_disabled", action: "return_structured_disabled" },
  adapter_disabled: { reason: "adapter_disabled", action: "return_structured_disabled" },
  missing_cli_command: { reason: "missing_cli_command", action: "return_structured_disabled" },
  unsupported_request_type: { reason: "unsupported_request_type", action: "return_structured_unsupported" },
  executed_failure: { reason: "cli_failure", action: "return_structured_failure" },
  executed_timeout: { reason: "cli_timeout", action: "return_structured_timeout" },
};

export function classifyKimiGatewayRealDispatchFallback(input: {
  contractDecision?: KimiGatewayRealDispatchDecision;
  dispatchStatus?: KimiGatewayRealDispatchResultStatus;
  guardrailDecision?: string;
  error?: string;
}): KimiGatewayRealDispatchFallbackPolicy {
  // Guardrail rejection takes precedence — it is a structured, intentional block
  if (input.guardrailDecision) {
    const rawMessage = input.error ?? `Kimi dispatch: guardrail_rejected (${input.guardrailDecision})`;
    const sanitizedMessage = sanitizeErrorSummary(rawMessage) ?? rawMessage.slice(0, 100);
    return {
      reason: "guardrail_rejected", action: "return_structured_failure", success: false,
      affectsFinalStatus: false, affectsRuntimeRouting: false,
      writesFiles: false, persistsAudit: false,
      sanitizedMessage, warnings: [sanitizedMessage],
    };
  }

  // Prefer dispatch status for executed_* outcomes; contract decision for pre-execution
  const key = (input.dispatchStatus && input.dispatchStatus.startsWith("executed"))
    ? input.dispatchStatus
    : (input.contractDecision ?? input.dispatchStatus);
  const entry = key ? FALLBACK_MAP[key] : undefined;
  const reason = entry?.reason ?? "unexpected_error";
  const action = entry?.action ?? "return_structured_failure";
  const rawMessage = input.error ?? `Kimi dispatch: ${reason}`;
  const sanitizedMessage = sanitizeErrorSummary(rawMessage) ?? rawMessage.slice(0, 100);

  return {
    reason, action, success: false,
    affectsFinalStatus: false, affectsRuntimeRouting: false,
    writesFiles: false, persistsAudit: false,
    sanitizedMessage, warnings: [sanitizedMessage],
  };
}
