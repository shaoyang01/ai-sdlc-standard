// Hermes Gateway Real Dispatch Observability
// ==========================================
// Sanitized in-memory sidecar metadata only. No persistence, no raw text.

import type { HermesGatewayRealDispatchResult } from "./hermes-gateway-real-dispatch";
import type { HermesGatewayRealDispatchFallbackPolicyResult } from "./hermes-gateway-real-dispatch-fallback-policy";
import {
  isHermesGatewayRealDispatchRequestTypeSupported,
} from "./hermes-gateway-real-dispatch-contract";

export type HermesGatewayRealDispatchObservabilityOutcome =
  | "disabled"
  | "unsupported_request_type"
  | "omitted"
  | "attached_success"
  | "attached_failure"
  | "attached_timeout"
  | "attached_guarded_fallback"
  | "unsafe_omitted"
  | "dispatcher_exception";

export interface HermesGatewayRealDispatchObservability {
  adapter: "hermes";
  source: "hermes_gateway_real_dispatch_observability";
  observabilityVersion: 1;
  gatewayField: "hermes_gateway_real_dispatch";
  outcome: HermesGatewayRealDispatchObservabilityOutcome;
  requestType: string;
  dispatchStatus?: string;
  contractDecision?: string;
  fallbackReason?: string;
  fallbackAction?: string;
  attached: boolean;
  omitted: boolean;
  safeToAttach: boolean;
  warningCount: number;
  hasWarnings: boolean;
  timestamp: string;
  preservesGatewayPrimaryResult: true;
  preservesGatewayFinalResult: true;
  preservesRuntimeFinalStatus: true;
  preservesRuntimeRouting: true;
  affectsPrimaryGatewayResult: false;
  changesGatewayPrimaryDispatch: false;
  changesGatewayFinalResult: false;
  changesRuntimeFinalStatus: false;
  changesRuntimeRouting: false;
  writesFiles: false;
  persistsObservability: false;
  persistsAudit: false;
  containsRawPrompt: false;
  containsRawArtifacts: false;
  containsSecrets: false;
}

function mapOutcome(input: {
  requestType: string;
  dispatchResult?: HermesGatewayRealDispatchResult;
  fallbackPolicy?: HermesGatewayRealDispatchFallbackPolicyResult;
  attached: boolean;
  dispatcherException?: unknown;
  realDispatchEnabled: boolean;
}): HermesGatewayRealDispatchObservabilityOutcome {
  if (!input.realDispatchEnabled) return "disabled";
  if (!isHermesGatewayRealDispatchRequestTypeSupported(input.requestType)) {
    return "unsupported_request_type";
  }
  if (input.dispatcherException !== undefined) return "dispatcher_exception";
  if (input.fallbackPolicy?.reason === "unsafe_dispatch_result") return "unsafe_omitted";
  if (input.attached && input.dispatchResult?.status === "dispatch_executed_success") {
    return "attached_success";
  }
  if (input.attached && input.dispatchResult?.status === "dispatch_executed_failure") {
    return "attached_failure";
  }
  if (input.attached && input.dispatchResult?.status === "dispatch_executed_timeout") {
    return "attached_timeout";
  }
  if (input.attached && input.dispatchResult?.status === "dispatch_guarded_fallback") {
    return "attached_guarded_fallback";
  }
  return "omitted";
}

export function buildHermesGatewayRealDispatchObservability(input: {
  requestType: string;
  dispatchResult?: HermesGatewayRealDispatchResult;
  fallbackPolicy?: HermesGatewayRealDispatchFallbackPolicyResult;
  attached: boolean;
  omitted: boolean;
  safeToAttach: boolean;
  dispatcherException?: unknown;
  realDispatchEnabled: boolean;
  now?: () => Date;
}): HermesGatewayRealDispatchObservability {
  const warningCount =
    (input.dispatchResult?.warnings?.length ?? 0)
    + (input.fallbackPolicy?.warnings?.length ?? 0)
    + (input.dispatcherException !== undefined ? 1 : 0);

  return {
    adapter: "hermes",
    source: "hermes_gateway_real_dispatch_observability",
    observabilityVersion: 1,
    gatewayField: "hermes_gateway_real_dispatch",
    outcome: mapOutcome(input),
    requestType: input.requestType,
    dispatchStatus: input.dispatchResult?.status,
    contractDecision: input.dispatchResult?.contractDecision,
    fallbackReason: input.fallbackPolicy?.reason,
    fallbackAction: input.fallbackPolicy?.action,
    attached: input.attached,
    omitted: input.omitted,
    safeToAttach: input.safeToAttach,
    warningCount,
    hasWarnings: warningCount > 0,
    timestamp: (input.now ?? (() => new Date()))().toISOString(),
    preservesGatewayPrimaryResult: true,
    preservesGatewayFinalResult: true,
    preservesRuntimeFinalStatus: true,
    preservesRuntimeRouting: true,
    affectsPrimaryGatewayResult: false,
    changesGatewayPrimaryDispatch: false,
    changesGatewayFinalResult: false,
    changesRuntimeFinalStatus: false,
    changesRuntimeRouting: false,
    writesFiles: false,
    persistsObservability: false,
    persistsAudit: false,
    containsRawPrompt: false,
    containsRawArtifacts: false,
    containsSecrets: false,
  };
}
