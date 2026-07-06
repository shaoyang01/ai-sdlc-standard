// Hermes Gateway Real Dispatch Guardrails
// =======================================
// In-memory sidecar metadata guardrails only. No persistence, no raw text.

import type { HermesGatewayRealDispatchResult } from "./hermes-gateway-real-dispatch";
import type { HermesGatewayRealDispatchFallbackPolicyResult } from "./hermes-gateway-real-dispatch-fallback-policy";
import type { HermesGatewayRealDispatchObservability } from "./hermes-gateway-real-dispatch-observability";

export type HermesGatewayRealDispatchGuardrailDecision =
  | "allow_attach"
  | "reject_disabled"
  | "reject_unsupported_request_type"
  | "reject_missing_dispatch_result"
  | "reject_unsafe_dispatch_result"
  | "reject_unexpected_status"
  | "reject_warning_limit_exceeded"
  | "reject_missing_fallback_policy"
  | "reject_missing_observability"
  | "reject_raw_prompt_risk"
  | "reject_secret_risk"
  | "reject_artifact_risk";

export interface HermesGatewayRealDispatchGuardrailLimits {
  maxWarnings: number;
  allowedRequestTypes: readonly string[];
  allowedStatuses: readonly string[];
}

export const DEFAULT_HERMES_GATEWAY_REAL_DISPATCH_GUARDRAIL_LIMITS: HermesGatewayRealDispatchGuardrailLimits = {
  maxWarnings: 20,
  allowedRequestTypes: ["review", "code_review", "validation"],
  allowedStatuses: [
    "dispatch_executed_success",
    "dispatch_executed_failure",
    "dispatch_executed_timeout",
    "dispatch_guarded_fallback",
  ],
};

export interface HermesGatewayRealDispatchGuardrailResult {
  adapter: "hermes";
  source: "hermes_gateway_real_dispatch_guardrails";
  guardrailVersion: 1;
  decision: HermesGatewayRealDispatchGuardrailDecision;
  allowed: boolean;
  shouldAttachSidecar: boolean;
  requestType: string;
  dispatchStatus?: string;
  warningCount: number;
  maxWarnings: number;
  checks: {
    requestTypeAllowed: boolean;
    statusAllowed: boolean;
    warningLimitOk: boolean;
    fallbackPolicyPresent: boolean;
    observabilityPresent: boolean;
    noRawPrompt: boolean;
    noRawArtifacts: boolean;
    noSecrets: boolean;
    noGatewayPrimaryChange: boolean;
    noGatewayFinalResultChange: boolean;
    noRuntimeFinalStatusChange: boolean;
    noRuntimeRoutingChange: boolean;
    noFileWrites: boolean;
    noAuditPersistence: boolean;
    noObservabilityPersistence: boolean;
  };
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
  persistsGuardrails: false;
  persistsObservability: false;
  persistsAudit: false;
  containsRawPrompt: false;
  containsRawArtifacts: false;
  containsSecrets: false;
}

function resolveLimits(
  limits?: Partial<HermesGatewayRealDispatchGuardrailLimits>
): HermesGatewayRealDispatchGuardrailLimits {
  return {
    ...DEFAULT_HERMES_GATEWAY_REAL_DISPATCH_GUARDRAIL_LIMITS,
    ...limits,
  };
}

function buildResult(input: {
  decision: HermesGatewayRealDispatchGuardrailDecision;
  requestType: string;
  dispatchStatus?: string;
  warningCount: number;
  maxWarnings: number;
  checks: HermesGatewayRealDispatchGuardrailResult["checks"];
}): HermesGatewayRealDispatchGuardrailResult {
  const allowed = input.decision === "allow_attach";
  return {
    adapter: "hermes",
    source: "hermes_gateway_real_dispatch_guardrails",
    guardrailVersion: 1,
    decision: input.decision,
    allowed,
    shouldAttachSidecar: allowed,
    requestType: input.requestType,
    dispatchStatus: input.dispatchStatus,
    warningCount: input.warningCount,
    maxWarnings: input.maxWarnings,
    checks: input.checks,
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
    persistsGuardrails: false,
    persistsObservability: false,
    persistsAudit: false,
    containsRawPrompt: false,
    containsRawArtifacts: false,
    containsSecrets: false,
  };
}

export function evaluateHermesGatewayRealDispatchGuardrails(input: {
  requestType: string;
  dispatchResult?: HermesGatewayRealDispatchResult;
  fallbackPolicy?: HermesGatewayRealDispatchFallbackPolicyResult;
  observability?: HermesGatewayRealDispatchObservability;
  realDispatchEnabled: boolean;
  integrationMayAttach: boolean;
  limits?: Partial<HermesGatewayRealDispatchGuardrailLimits>;
}): HermesGatewayRealDispatchGuardrailResult {
  const limits = resolveLimits(input.limits);
  const warningCount =
    (input.dispatchResult?.warnings?.length ?? 0)
    + (input.fallbackPolicy?.warnings?.length ?? 0)
    + (input.observability?.warningCount ?? 0);
  const checks: HermesGatewayRealDispatchGuardrailResult["checks"] = {
    requestTypeAllowed: limits.allowedRequestTypes.includes(input.requestType),
    statusAllowed: input.dispatchResult
      ? limits.allowedStatuses.includes(input.dispatchResult.status)
      : false,
    warningLimitOk: warningCount <= limits.maxWarnings,
    fallbackPolicyPresent: input.fallbackPolicy !== undefined,
    observabilityPresent: input.observability !== undefined,
    noRawPrompt: input.dispatchResult?.containsRawPrompt === false
      && input.fallbackPolicy?.containsRawPrompt === false
      && input.observability?.containsRawPrompt === false,
    noRawArtifacts: input.dispatchResult?.containsRawArtifacts === false
      && input.fallbackPolicy?.containsRawArtifacts === false
      && input.observability?.containsRawArtifacts === false,
    noSecrets: input.dispatchResult?.containsSecrets === false
      && input.fallbackPolicy?.containsSecrets === false
      && input.observability?.containsSecrets === false,
    noGatewayPrimaryChange: input.dispatchResult?.changesGatewayPrimaryDispatch === false
      && input.dispatchResult?.affectsPrimaryGatewayResult === false
      && input.fallbackPolicy?.changesGatewayPrimaryDispatch === false
      && input.fallbackPolicy?.affectsPrimaryGatewayResult === false
      && input.observability?.changesGatewayPrimaryDispatch === false
      && input.observability?.affectsPrimaryGatewayResult === false,
    noGatewayFinalResultChange: input.fallbackPolicy?.changesGatewayFinalResult === false
      && input.observability?.changesGatewayFinalResult === false,
    noRuntimeFinalStatusChange: input.dispatchResult?.changesRuntimeFinalStatus === false
      && input.fallbackPolicy?.changesRuntimeFinalStatus === false
      && input.observability?.changesRuntimeFinalStatus === false,
    noRuntimeRoutingChange: input.dispatchResult?.changesRuntimeRouting === false
      && input.fallbackPolicy?.changesRuntimeRouting === false
      && input.observability?.changesRuntimeRouting === false,
    noFileWrites: input.dispatchResult?.writesFiles === false
      && input.fallbackPolicy?.writesFiles === false
      && input.observability?.writesFiles === false,
    noAuditPersistence: input.dispatchResult?.persistsAudit === false
      && input.fallbackPolicy?.persistsAudit === false
      && input.observability?.persistsAudit === false,
    noObservabilityPersistence: input.observability?.persistsObservability === false,
  };

  const common = {
    requestType: input.requestType,
    dispatchStatus: input.dispatchResult?.status,
    warningCount,
    maxWarnings: limits.maxWarnings,
    checks,
  };

  if (!input.realDispatchEnabled) return buildResult({ ...common, decision: "reject_disabled" });
  if (!checks.requestTypeAllowed) return buildResult({ ...common, decision: "reject_unsupported_request_type" });
  if (!input.dispatchResult) return buildResult({ ...common, decision: "reject_missing_dispatch_result" });
  if (input.integrationMayAttach !== true) return buildResult({ ...common, decision: "reject_unsafe_dispatch_result" });
  if (!checks.statusAllowed) return buildResult({ ...common, decision: "reject_unexpected_status" });
  if (!input.fallbackPolicy) return buildResult({ ...common, decision: "reject_missing_fallback_policy" });
  if (!input.observability) return buildResult({ ...common, decision: "reject_missing_observability" });
  if (!checks.warningLimitOk) return buildResult({ ...common, decision: "reject_warning_limit_exceeded" });
  if (!checks.noRawPrompt) return buildResult({ ...common, decision: "reject_raw_prompt_risk" });
  if (!checks.noRawArtifacts) return buildResult({ ...common, decision: "reject_artifact_risk" });
  if (!checks.noSecrets) return buildResult({ ...common, decision: "reject_secret_risk" });

  if (
    !checks.noGatewayPrimaryChange
    || !checks.noGatewayFinalResultChange
    || !checks.noRuntimeFinalStatusChange
    || !checks.noRuntimeRoutingChange
    || !checks.noFileWrites
    || !checks.noAuditPersistence
    || !checks.noObservabilityPersistence
  ) {
    return buildResult({ ...common, decision: "reject_unsafe_dispatch_result" });
  }

  return buildResult({ ...common, decision: "allow_attach" });
}
