// Hermes Gateway Real Dispatch Contract
// =========================================
// Contract-only. Evaluates eligibility for future Hermes Gateway real dispatch.
// Does NOT wire into ExecutionGateway. Does NOT execute CLI.
// Does NOT spawn processes. Does NOT change runtime behavior.

import type { ExecutionRequest } from "./types";
import type { CliAdapterConfig } from "./cli-adapter-contract-types";
import {
  getHermesCliAdapterConfig,
} from "./hermes-cli-adapter-contract";
import {
  isHermesCliCommandExecutionEnabled,
} from "./hermes-cli-command-executor";
import {
  isHermesGatewayIntegrationEnabled,
} from "./hermes-gateway-integration-contract";

export const HERMES_GATEWAY_REAL_DISPATCH_FLAG = "SDLC_HERMES_GATEWAY_REAL_DISPATCH";

export function isHermesGatewayRealDispatchEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env[HERMES_GATEWAY_REAL_DISPATCH_FLAG] === "enabled";
}

export function getHermesGatewayRealDispatchRequiredFlags(): string[] {
  return [
    "SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled",
    "SDLC_HERMES_GATEWAY_INTEGRATION=enabled",
    "SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled",
  ];
}

export const HERMES_GATEWAY_REAL_DISPATCH_SUPPORTED_REQUEST_TYPES = [
  "review",
  "code_review",
  "validation",
] as const;

export const HERMES_GATEWAY_REAL_DISPATCH_UNSUPPORTED_REQUEST_TYPES = [
  "llm_task",
  "code_generation",
  "bugfix",
] as const;

export function isHermesGatewayRealDispatchRequestTypeSupported(type: string): boolean {
  return (HERMES_GATEWAY_REAL_DISPATCH_SUPPORTED_REQUEST_TYPES as readonly string[]).includes(type);
}

export type HermesGatewayRealDispatchContractDecision =
  | "real_dispatch_disabled"
  | "gateway_integration_disabled"
  | "command_execution_disabled"
  | "adapter_disabled"
  | "missing_cli_command"
  | "unsupported_request_type"
  | "eligible_contract_only";

export interface HermesGatewayRealDispatchContractResult {
  adapter: "hermes";
  source: "hermes_gateway_real_dispatch_contract";
  contractOnly: true;
  decision: HermesGatewayRealDispatchContractDecision;
  eligible: boolean;
  requestId: string;
  requestType: string;
  supportedRequestTypes: string[];
  unsupportedRequestTypes: string[];
  requiredFlags: string[];
  invokesCli: false;
  spawnsProcess: false;
  writesFiles: false;
  persistsAudit: false;
  changesGatewayPrimaryDispatchNow: false;
  changesRuntimeFinalStatus: false;
  changesRuntimeRouting: false;
  affectsPrimaryGatewayResult: false;
  containsRawPrompt: false;
  containsRawArtifacts: false;
  containsSecrets: false;
  fallbackPolicy: {
    onIneligible: "preserve_existing_gateway_behavior";
    onUnsupportedRequestType: "preserve_existing_gateway_behavior";
    onMissingCommand: "preserve_existing_gateway_behavior";
    onFutureExecutionFailure: "fallback_without_final_status_change";
  };
  warnings: string[];
}

export function evaluateHermesGatewayRealDispatchContract(input: {
  request: ExecutionRequest;
  config?: CliAdapterConfig;
  env?: Record<string, string | undefined>;
}): HermesGatewayRealDispatchContractResult {
  const env = input.env ?? process.env;
  const config = input.config ?? getHermesCliAdapterConfig();
  const requiredFlags = getHermesGatewayRealDispatchRequiredFlags();

  const base = {
    adapter: "hermes" as const,
    source: "hermes_gateway_real_dispatch_contract" as const,
    contractOnly: true as const,
    requestId: input.request.requirementId,
    requestType: input.request.type,
    supportedRequestTypes: [...HERMES_GATEWAY_REAL_DISPATCH_SUPPORTED_REQUEST_TYPES],
    unsupportedRequestTypes: [...HERMES_GATEWAY_REAL_DISPATCH_UNSUPPORTED_REQUEST_TYPES],
    requiredFlags,
    invokesCli: false as const,
    spawnsProcess: false as const,
    writesFiles: false as const,
    persistsAudit: false as const,
    changesGatewayPrimaryDispatchNow: false as const,
    changesRuntimeFinalStatus: false as const,
    changesRuntimeRouting: false as const,
    affectsPrimaryGatewayResult: false as const,
    containsRawPrompt: false as const,
    containsRawArtifacts: false as const,
    containsSecrets: false as const,
    fallbackPolicy: {
      onIneligible: "preserve_existing_gateway_behavior" as const,
      onUnsupportedRequestType: "preserve_existing_gateway_behavior" as const,
      onMissingCommand: "preserve_existing_gateway_behavior" as const,
      onFutureExecutionFailure: "fallback_without_final_status_change" as const,
    },
  };

  // 1. Real dispatch disabled
  if (!isHermesGatewayRealDispatchEnabled(env)) {
    return { ...base, decision: "real_dispatch_disabled", eligible: false,
      warnings: ["Hermes Gateway real dispatch disabled"] };
  }

  // 2. Gateway integration disabled
  if (!isHermesGatewayIntegrationEnabled(env)) {
    return { ...base, decision: "gateway_integration_disabled", eligible: false,
      warnings: ["Gateway integration disabled"] };
  }

  // 3. Command execution disabled
  if (!isHermesCliCommandExecutionEnabled(env)) {
    return { ...base, decision: "command_execution_disabled", eligible: false,
      warnings: ["Command execution disabled"] };
  }

  // 4. Unsupported request type
  if (!isHermesGatewayRealDispatchRequestTypeSupported(input.request.type)) {
    return { ...base, decision: "unsupported_request_type", eligible: false,
      warnings: [`Unsupported request type: ${input.request.type}`] };
  }

  // 5. Adapter disabled
  if (!config.enabled) {
    return { ...base, decision: "adapter_disabled", eligible: false,
      warnings: ["Adapter disabled"] };
  }

  // 6. Missing CLI command
  if (!config.command || config.command.trim() === "") {
    return { ...base, decision: "missing_cli_command", eligible: false,
      warnings: ["Missing CLI command"] };
  }

  // 7. Eligible — contract only
  return { ...base, decision: "eligible_contract_only", eligible: true,
    warnings: ["Eligibility only; Gateway not wired"] };
}
