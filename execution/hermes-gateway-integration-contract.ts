// Hermes Gateway Integration Contract
// =======================================
// Contract-only. Evaluates eligibility for future Gateway wiring.
// Does NOT wire into ExecutionGateway. Does NOT execute CLI.
// Does NOT spawn processes. Does NOT change runtime behavior.

import type { ExecutionRequest } from "./types";
import type { CliAdapterConfig } from "./cli-adapter-contract-types";
import {
  getHermesCliAdapterConfig,
} from "./hermes-cli-adapter-contract";
import {
  prepareHermesCliExecutorContract,
  type HermesCliExecutorCommandInput,
} from "./hermes-cli-executor-contract";
import {
  isHermesCliCommandExecutionEnabled,
} from "./hermes-cli-command-executor";

export type HermesGatewayIntegrationDecision =
  | "gateway_integration_disabled"
  | "command_execution_disabled"
  | "adapter_disabled"
  | "missing_cli_command"
  | "unsupported_request_type"
  | "eligible_contract_only";

export interface HermesGatewayIntegrationAuditEvent {
  adapter: "hermes";
  source: "hermes_gateway_integration_contract";
  requestId: string;
  requestType: string;
  decision: HermesGatewayIntegrationDecision;
  eligible: boolean;
  contractOnly: true;
  invokesCli: false;
  spawnsProcess: false;
  writesFiles: false;
  persistsAudit: false;
  containsRawPrompt: false;
  containsRawArtifacts: false;
  containsSecrets: false;
  warnings: string[];
}

export interface HermesGatewayIntegrationContractResult {
  adapter: "hermes";
  decision: HermesGatewayIntegrationDecision;
  eligible: boolean;
  contractOnly: true;
  requestId: string;
  requestType: string;
  supportedRequestTypes: string[];
  requiredFlags: string[];
  invokesCli: false;
  spawnsProcess: false;
  writesFiles: false;
  persistsAudit: false;
  changesGatewayRouting: false;
  changesRuntimeRouting: false;
  changesFinalStatus: false;
  warnings: string[];
  auditEvents: HermesGatewayIntegrationAuditEvent[];
}

export const HERMES_GATEWAY_INTEGRATION_FLAG = "SDLC_HERMES_GATEWAY_INTEGRATION";

export function isHermesGatewayIntegrationEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env[HERMES_GATEWAY_INTEGRATION_FLAG] === "enabled";
}

export function getHermesGatewayIntegrationRequiredFlags(): string[] {
  return [
    "SDLC_HERMES_GATEWAY_INTEGRATION=enabled",
    "SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled",
  ];
}

const SUPPORTED_TYPES = ["review", "code_review", "validation"];

export function isHermesGatewayRequestTypeSupportedByContract(type: string): boolean {
  return SUPPORTED_TYPES.includes(type);
}

function buildAudit(input: {
  requestId: string; requestType: string;
  decision: HermesGatewayIntegrationDecision; eligible: boolean;
  warnings: string[];
}): HermesGatewayIntegrationAuditEvent {
  return {
    adapter: "hermes",
    source: "hermes_gateway_integration_contract",
    requestId: input.requestId, requestType: input.requestType,
    decision: input.decision, eligible: input.eligible,
    contractOnly: true,
    invokesCli: false, spawnsProcess: false,
    writesFiles: false, persistsAudit: false,
    containsRawPrompt: false, containsRawArtifacts: false, containsSecrets: false,
    warnings: input.warnings,
  };
}

export function evaluateHermesGatewayIntegrationContract(input: {
  request: ExecutionRequest;
  config?: CliAdapterConfig;
  env?: Record<string, string | undefined>;
}): HermesGatewayIntegrationContractResult {
  const requiredFlags = getHermesGatewayIntegrationRequiredFlags();
  const env = input.env ?? process.env;
  const config = input.config ?? getHermesCliAdapterConfig();

  const base = {
    adapter: "hermes" as const,
    requestId: input.request.requirementId,
    requestType: input.request.type,
    supportedRequestTypes: SUPPORTED_TYPES,
    requiredFlags,
    invokesCli: false as const,
    spawnsProcess: false as const,
    writesFiles: false as const,
    persistsAudit: false as const,
    changesGatewayRouting: false as const,
    changesRuntimeRouting: false as const,
    changesFinalStatus: false as const,
    contractOnly: true as const,
  };

  // Gateway integration flag missing
  if (!isHermesGatewayIntegrationEnabled(env)) {
    return {
      ...base,
      decision: "gateway_integration_disabled", eligible: false,
      warnings: ["Gateway integration disabled"],
      auditEvents: [buildAudit({
        requestId: input.request.requirementId, requestType: input.request.type,
        decision: "gateway_integration_disabled", eligible: false,
        warnings: ["Gateway integration disabled"],
      })],
    };
  }

  // Command execution flag missing
  if (!isHermesCliCommandExecutionEnabled(env)) {
    return {
      ...base,
      decision: "command_execution_disabled", eligible: false,
      warnings: ["Command execution disabled"],
      auditEvents: [buildAudit({
        requestId: input.request.requirementId, requestType: input.request.type,
        decision: "command_execution_disabled", eligible: false,
        warnings: ["Command execution disabled"],
      })],
    };
  }

  // Unsupported request type
  if (!isHermesGatewayRequestTypeSupportedByContract(input.request.type)) {
    return {
      ...base,
      decision: "unsupported_request_type", eligible: false,
      warnings: [`Unsupported request type: ${input.request.type}`],
      auditEvents: [buildAudit({
        requestId: input.request.requirementId, requestType: input.request.type,
        decision: "unsupported_request_type", eligible: false,
        warnings: [`Unsupported: ${input.request.type}`],
      })],
    };
  }

  // Adapter disabled
  if (!config.enabled) {
    return {
      ...base,
      decision: "adapter_disabled", eligible: false,
      warnings: ["Adapter disabled"],
      auditEvents: [buildAudit({
        requestId: input.request.requirementId, requestType: input.request.type,
        decision: "adapter_disabled", eligible: false,
        warnings: ["Adapter disabled"],
      })],
    };
  }

  // Missing command
  if (!config.command || config.command.trim() === "") {
    return {
      ...base,
      decision: "missing_cli_command", eligible: false,
      warnings: ["Missing CLI command"],
      auditEvents: [buildAudit({
        requestId: input.request.requirementId, requestType: input.request.type,
        decision: "missing_cli_command", eligible: false,
        warnings: ["Missing CLI command"],
      })],
    };
  }

  // Eligible — contract only, not wired
  return {
    ...base,
    decision: "eligible_contract_only", eligible: true,
    warnings: ["Eligibility only; Gateway not wired"],
    auditEvents: [buildAudit({
      requestId: input.request.requirementId, requestType: input.request.type,
      decision: "eligible_contract_only", eligible: true,
      warnings: ["Eligibility only; Gateway not wired"],
    })],
  };
}
