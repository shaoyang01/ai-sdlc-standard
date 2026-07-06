// Hermes Gateway Real Dispatch Fallback Policy
// ============================================
// Sidecar metadata policy only. Does not execute CLI, write files, or alter Gateway/Runtime results.

import type { HermesGatewayRealDispatchResult } from "./hermes-gateway-real-dispatch";
import {
  isHermesGatewayRealDispatchRequestTypeSupported,
} from "./hermes-gateway-real-dispatch-contract";

export type HermesGatewayRealDispatchFallbackReason =
  | "disabled"
  | "unsupported_request_type"
  | "contract_ineligible"
  | "dispatch_success"
  | "dispatch_failure"
  | "dispatch_timeout"
  | "dispatch_guarded_fallback"
  | "unsafe_dispatch_result"
  | "dispatcher_exception"
  | "missing_dispatch_result";

export type HermesGatewayRealDispatchFallbackAction =
  | "attach_sidecar_metadata"
  | "omit_sidecar_metadata"
  | "preserve_existing_gateway_behavior"
  | "fallback_without_final_status_change";

export interface HermesGatewayRealDispatchFallbackPolicyResult {
  adapter: "hermes";
  source: "hermes_gateway_real_dispatch_fallback_policy";
  policyVersion: 1;
  reason: HermesGatewayRealDispatchFallbackReason;
  action: HermesGatewayRealDispatchFallbackAction;
  shouldAttachSidecar: boolean;
  shouldOmitSidecar: boolean;
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
  persistsAudit: false;
  containsRawPrompt: false;
  containsRawArtifacts: false;
  containsSecrets: false;
  warnings: string[];
}

function buildPolicy(input: {
  reason: HermesGatewayRealDispatchFallbackReason;
  action: HermesGatewayRealDispatchFallbackAction;
  shouldAttachSidecar: boolean;
  warnings?: string[];
}): HermesGatewayRealDispatchFallbackPolicyResult {
  return {
    adapter: "hermes",
    source: "hermes_gateway_real_dispatch_fallback_policy",
    policyVersion: 1,
    reason: input.reason,
    action: input.action,
    shouldAttachSidecar: input.shouldAttachSidecar,
    shouldOmitSidecar: !input.shouldAttachSidecar,
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
    persistsAudit: false,
    containsRawPrompt: false,
    containsRawArtifacts: false,
    containsSecrets: false,
    warnings: input.warnings ?? [],
  };
}

export function evaluateHermesGatewayRealDispatchFallbackPolicy(input: {
  requestType: string;
  dispatchResult?: HermesGatewayRealDispatchResult;
  integrationMayAttach?: boolean;
  dispatcherException?: unknown;
  realDispatchEnabled: boolean;
}): HermesGatewayRealDispatchFallbackPolicyResult {
  if (!input.realDispatchEnabled) {
    return buildPolicy({
      reason: "disabled",
      action: "preserve_existing_gateway_behavior",
      shouldAttachSidecar: false,
      warnings: ["Hermes Gateway real dispatch disabled"],
    });
  }

  if (!isHermesGatewayRealDispatchRequestTypeSupported(input.requestType)) {
    return buildPolicy({
      reason: "unsupported_request_type",
      action: "preserve_existing_gateway_behavior",
      shouldAttachSidecar: false,
      warnings: ["Hermes Gateway real dispatch unsupported request type"],
    });
  }

  if (input.dispatcherException !== undefined) {
    return buildPolicy({
      reason: "dispatcher_exception",
      action: "fallback_without_final_status_change",
      shouldAttachSidecar: false,
      warnings: ["Hermes Gateway real dispatch dispatcher raised an exception"],
    });
  }

  if (!input.dispatchResult) {
    return buildPolicy({
      reason: "missing_dispatch_result",
      action: "preserve_existing_gateway_behavior",
      shouldAttachSidecar: false,
      warnings: ["Hermes Gateway real dispatch result missing"],
    });
  }

  if (input.dispatchResult.eligible === false) {
    return buildPolicy({
      reason: "contract_ineligible",
      action: "preserve_existing_gateway_behavior",
      shouldAttachSidecar: false,
      warnings: ["Hermes Gateway real dispatch contract ineligible"],
    });
  }

  if (input.integrationMayAttach !== true) {
    return buildPolicy({
      reason: "unsafe_dispatch_result",
      action: "fallback_without_final_status_change",
      shouldAttachSidecar: false,
      warnings: ["Hermes Gateway real dispatch result rejected by integration contract"],
    });
  }

  if (input.dispatchResult.status === "dispatch_executed_success") {
    return buildPolicy({
      reason: "dispatch_success",
      action: "attach_sidecar_metadata",
      shouldAttachSidecar: true,
    });
  }

  if (input.dispatchResult.status === "dispatch_executed_failure") {
    return buildPolicy({
      reason: "dispatch_failure",
      action: "fallback_without_final_status_change",
      shouldAttachSidecar: true,
    });
  }

  if (input.dispatchResult.status === "dispatch_executed_timeout") {
    return buildPolicy({
      reason: "dispatch_timeout",
      action: "fallback_without_final_status_change",
      shouldAttachSidecar: true,
    });
  }

  if (input.dispatchResult.status === "dispatch_guarded_fallback") {
    return buildPolicy({
      reason: "dispatch_guarded_fallback",
      action: "fallback_without_final_status_change",
      shouldAttachSidecar: true,
    });
  }

  return buildPolicy({
    reason: "contract_ineligible",
    action: "preserve_existing_gateway_behavior",
    shouldAttachSidecar: false,
    warnings: ["Hermes Gateway real dispatch status is not attachable"],
  });
}
