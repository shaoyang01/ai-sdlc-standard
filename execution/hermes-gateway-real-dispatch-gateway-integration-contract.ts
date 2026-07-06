// Hermes Gateway Real Dispatch Gateway Integration Contract
// =========================================================
// Contract-only. Defines safe future Gateway attachment rules for Hermes real dispatch.
// Does NOT wire into ExecutionGateway. Does NOT execute CLI. Does NOT change runtime.

import type { HermesGatewayRealDispatchResult } from "./hermes-gateway-real-dispatch";
import {
  HERMES_GATEWAY_REAL_DISPATCH_FLAG,
  HERMES_GATEWAY_REAL_DISPATCH_SUPPORTED_REQUEST_TYPES,
  HERMES_GATEWAY_REAL_DISPATCH_UNSUPPORTED_REQUEST_TYPES,
  isHermesGatewayRealDispatchEnabled,
} from "./hermes-gateway-real-dispatch-contract";

export const HERMES_GATEWAY_REAL_DISPATCH_GATEWAY_INTEGRATION_CONTRACT_STATUS = "contract_only";
export const HERMES_GATEWAY_REAL_DISPATCH_GATEWAY_FIELD: "hermes_gateway_real_dispatch" = "hermes_gateway_real_dispatch";
export const HERMES_GATEWAY_REAL_DISPATCH_GATEWAY_INTEGRATION_FLAG = HERMES_GATEWAY_REAL_DISPATCH_FLAG;

export type HermesGatewayRealDispatchGatewayIntegrationDecision =
  | "integration_disabled"
  | "missing_dispatch_result"
  | "safe_to_attach_contract_only"
  | "unsafe_dispatch_result";

export interface HermesGatewayRealDispatchGatewayIntegrationContractResult {
  adapter: "hermes";
  source: "hermes_gateway_real_dispatch_gateway_integration_contract";
  contractOnly: true;
  decision: HermesGatewayRealDispatchGatewayIntegrationDecision;
  gatewayField: "hermes_gateway_real_dispatch";
  enabled: boolean;
  mayAttach: boolean;
  dispatchResultPresent: boolean;
  changesGatewayPrimaryDispatchNow: false;
  changesGatewayFinalResultNow: false;
  changesRuntimeFinalStatus: false;
  changesRuntimeRouting: false;
  affectsPrimaryGatewayResult: false;
  writesFiles: false;
  persistsAudit: false;
  containsRawPrompt: false;
  containsRawArtifacts: false;
  containsSecrets: false;
  warnings: string[];
}

export const HERMES_GATEWAY_REAL_DISPATCH_GATEWAY_INTEGRATION_RULES = {
  fieldName: HERMES_GATEWAY_REAL_DISPATCH_GATEWAY_FIELD,
  conditionalFieldOnly: true,
  omitWhenDisabled: true,
  neverUseUndefinedKey: true,
  mustNotChangePrimaryGatewayResult: true,
  mustNotChangeGatewayFinalResultNow: true,
  mustNotChangeRuntimeFinalStatus: true,
  mustNotChangeRuntimeRouting: true,
  mustNotMergeIntoArtifacts: true,
  mustNotPersistAudit: true,
  mustNotWriteFiles: true,
  requiresFeatureFlag: `${HERMES_GATEWAY_REAL_DISPATCH_GATEWAY_INTEGRATION_FLAG}=enabled`,
  supportedRequestTypes: [...HERMES_GATEWAY_REAL_DISPATCH_SUPPORTED_REQUEST_TYPES],
  unsupportedRequestTypes: [...HERMES_GATEWAY_REAL_DISPATCH_UNSUPPORTED_REQUEST_TYPES],
} as const;

function findUnsafeDispatchResultFields(
  dispatchResult: HermesGatewayRealDispatchResult
): string[] {
  const unsafeFields: string[] = [];
  if (dispatchResult.changesGatewayPrimaryDispatch !== false) {
    unsafeFields.push("changesGatewayPrimaryDispatch");
  }
  if (dispatchResult.changesRuntimeFinalStatus !== false) {
    unsafeFields.push("changesRuntimeFinalStatus");
  }
  if (dispatchResult.changesRuntimeRouting !== false) {
    unsafeFields.push("changesRuntimeRouting");
  }
  if (dispatchResult.affectsPrimaryGatewayResult !== false) {
    unsafeFields.push("affectsPrimaryGatewayResult");
  }
  if (dispatchResult.writesFiles !== false) {
    unsafeFields.push("writesFiles");
  }
  if (dispatchResult.persistsAudit !== false) {
    unsafeFields.push("persistsAudit");
  }
  if (dispatchResult.containsRawPrompt !== false) {
    unsafeFields.push("containsRawPrompt");
  }
  if (dispatchResult.containsRawArtifacts !== false) {
    unsafeFields.push("containsRawArtifacts");
  }
  if (dispatchResult.containsSecrets !== false) {
    unsafeFields.push("containsSecrets");
  }
  return unsafeFields;
}

export function evaluateHermesGatewayRealDispatchGatewayIntegrationContract(input: {
  dispatchResult?: HermesGatewayRealDispatchResult;
  env?: Record<string, string | undefined>;
}): HermesGatewayRealDispatchGatewayIntegrationContractResult {
  const base = {
    adapter: "hermes" as const,
    source: "hermes_gateway_real_dispatch_gateway_integration_contract" as const,
    contractOnly: true as const,
    gatewayField: HERMES_GATEWAY_REAL_DISPATCH_GATEWAY_FIELD,
    changesGatewayPrimaryDispatchNow: false as const,
    changesGatewayFinalResultNow: false as const,
    changesRuntimeFinalStatus: false as const,
    changesRuntimeRouting: false as const,
    affectsPrimaryGatewayResult: false as const,
    writesFiles: false as const,
    persistsAudit: false as const,
    containsRawPrompt: false as const,
    containsRawArtifacts: false as const,
    containsSecrets: false as const,
  };

  if (!isHermesGatewayRealDispatchEnabled(input.env)) {
    return {
      ...base,
      decision: "integration_disabled",
      enabled: false,
      mayAttach: false,
      dispatchResultPresent: false,
      warnings: ["Hermes Gateway real dispatch Gateway integration disabled"],
    };
  }

  if (!input.dispatchResult) {
    return {
      ...base,
      decision: "missing_dispatch_result",
      enabled: true,
      mayAttach: false,
      dispatchResultPresent: false,
      warnings: ["Missing Hermes Gateway real dispatch result"],
    };
  }

  const unsafeFields = findUnsafeDispatchResultFields(input.dispatchResult);
  if (unsafeFields.length > 0) {
    return {
      ...base,
      decision: "unsafe_dispatch_result",
      enabled: true,
      mayAttach: false,
      dispatchResultPresent: true,
      warnings: unsafeFields.map((field) => `Unsafe dispatch result field: ${field}`),
    };
  }

  return {
    ...base,
    decision: "safe_to_attach_contract_only",
    enabled: true,
    mayAttach: true,
    dispatchResultPresent: true,
    warnings: ["Safe to attach contract-only metadata in a future Gateway PR"],
  };
}
