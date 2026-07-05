// Kimi Gateway Integration Contract
// =====================================
// Contract-only. Evaluates eligibility for future Gateway wiring.
// Does NOT wire into ExecutionGateway. Does NOT execute CLI.
// Does NOT spawn processes. Does NOT change runtime behavior.

import type { ExecutionRequest } from "./types";
import type { CliAdapterConfig } from "./cli-adapter-contract-types";
import type { CliAdapterAuditEvent } from "./cli-adapter-audit";
import {
  getKimiCliAdapterConfig,
} from "./kimi-cli-adapter-contract";
import {
  prepareKimiCliExecutorContract,
  type KimiCliExecutorCommandInput,
} from "./kimi-cli-executor-contract";
import {
  isKimiCliCommandExecutionEnabled,
} from "./kimi-cli-command-executor";

export type KimiGatewayIntegrationDecision =
  | "gateway_integration_disabled"
  | "command_execution_disabled"
  | "adapter_disabled"
  | "missing_cli_command"
  | "unsupported_request_type"
  | "eligible_contract_only";

export interface KimiGatewayIntegrationContractResult {
  eligible: boolean;
  decision: KimiGatewayIntegrationDecision;
  requestId: string;
  commandInput?: KimiCliExecutorCommandInput;
  requiredFlags: string[];
  auditEvents: CliAdapterAuditEvent[];
  warnings: string[];
}

export function isKimiGatewayIntegrationEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.SDLC_KIMI_GATEWAY_INTEGRATION === "enabled";
}

export function evaluateKimiGatewayIntegrationEligibility(input: {
  request: ExecutionRequest;
  config?: CliAdapterConfig;
  env?: Record<string, string | undefined>;
}): KimiGatewayIntegrationContractResult {
  const requiredFlags = [
    "SDLC_KIMI_GATEWAY_INTEGRATION=enabled",
    "SDLC_KIMI_CLI_COMMAND_EXECUTION=enabled",
  ];
  const env = input.env ?? process.env;
  const config = input.config ?? getKimiCliAdapterConfig();

  // Gateway integration disabled
  if (!isKimiGatewayIntegrationEnabled(env)) {
    const contract = prepareKimiCliExecutorContract({ request: input.request, config });
    return {
      eligible: false, decision: "gateway_integration_disabled",
      requestId: input.request.requirementId, requiredFlags,
      auditEvents: contract.auditEvents,
      warnings: ["Gateway integration disabled"],
    };
  }

  // Command execution disabled
  if (!isKimiCliCommandExecutionEnabled(env)) {
    const contract = prepareKimiCliExecutorContract({ request: input.request, config });
    return {
      eligible: false, decision: "command_execution_disabled",
      requestId: input.request.requirementId, requiredFlags,
      commandInput: contract.commandInput,
      auditEvents: contract.auditEvents,
      warnings: ["Command execution disabled"],
    };
  }

  // Delegate to contract for adapter/command/type checks
  const contract = prepareKimiCliExecutorContract({ request: input.request, config });
  if (!contract.success) {
    const decisionMap: Record<string, KimiGatewayIntegrationDecision> = {
      disabled: "adapter_disabled",
      missing_cli_command: "missing_cli_command",
      unsupported_request_type: "unsupported_request_type",
    };
    return {
      eligible: false,
      decision: decisionMap[contract.decision] ?? "adapter_disabled",
      requestId: contract.requestId, requiredFlags,
      auditEvents: contract.auditEvents,
      warnings: [contract.error ?? "Not eligible"],
    };
  }

  // Eligible — contract only, not wired
  return {
    eligible: true, decision: "eligible_contract_only",
    requestId: contract.requestId, requiredFlags,
    commandInput: contract.commandInput,
    auditEvents: contract.auditEvents,
    warnings: ["Eligibility only; Gateway not wired"],
  };
}
