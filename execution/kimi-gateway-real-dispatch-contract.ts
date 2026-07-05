// Kimi Gateway Real Dispatch Contract
// ======================================
// Contract-only. Defines when/if Kimi may become a real Gateway adapter.
// Does NOT modify Gateway dispatch. Does NOT invoke CLI.

import type { ExecutionRequest } from "./types";
import type { CliAdapterConfig } from "./cli-adapter-contract-types";
import { getKimiCliAdapterConfig } from "./kimi-cli-adapter-contract";

export type KimiGatewayRealDispatchDecision =
  | "real_dispatch_disabled"
  | "gateway_integration_disabled"
  | "command_execution_disabled"
  | "adapter_disabled"
  | "missing_cli_command"
  | "unsupported_request_type"
  | "real_dispatch_eligible_contract_only";

export interface KimiGatewayRealDispatchContract {
  eligible: boolean;
  decision: KimiGatewayRealDispatchDecision;
  requestId: string;
  supportedRequestTypes: string[];
  requiredFlags: string[];
  futureDispatchFlag: "SDLC_KIMI_GATEWAY_REAL_DISPATCH=enabled";
  primaryGatewayUnchanged: true;
  affectsRuntimeRouting: false;
  affectsFinalStatus: false;
  invokesCli: false;
  spawnsProcess: false;
  writesFiles: false;
  persistsAudit: false;
  warnings: string[];
  auditEvents: Array<{
    source: "kimi_gateway_real_dispatch_contract";
    decision: KimiGatewayRealDispatchDecision;
    invokesCli: false;
    spawnsProcess: false;
    affectsGateway: false;
    affectsRuntime: false;
    affectsFinalStatus: false;
    writesFiles: false;
    persistsAudit: false;
    containsRawPrompt: false;
    containsRawArtifacts: false;
  }>;
}

export const KIMI_REAL_DISPATCH_REQUIRED_FLAGS = [
  "SDLC_KIMI_GATEWAY_REAL_DISPATCH=enabled",
  "SDLC_KIMI_GATEWAY_INTEGRATION=enabled",
  "SDLC_KIMI_CLI_COMMAND_EXECUTION=enabled",
] as const;

export const KIMI_REAL_DISPATCH_SUPPORTED_REQUEST_TYPES = ["llm_task"] as const;

function buildAudit(decision: KimiGatewayRealDispatchDecision) {
  return [{
    source: "kimi_gateway_real_dispatch_contract" as const,
    decision,
    invokesCli: false as const, spawnsProcess: false as const,
    affectsGateway: false as const, affectsRuntime: false as const,
    affectsFinalStatus: false as const, writesFiles: false as const,
    persistsAudit: false as const, containsRawPrompt: false as const,
    containsRawArtifacts: false as const,
  }];
}

export function isKimiGatewayRealDispatchEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.SDLC_KIMI_GATEWAY_REAL_DISPATCH === "enabled";
}

export function evaluateKimiGatewayRealDispatchContract(input: {
  request: ExecutionRequest;
  config?: CliAdapterConfig;
  env?: Record<string, string | undefined>;
}): KimiGatewayRealDispatchContract {
  const env = input.env ?? process.env;
  const config = input.config ?? getKimiCliAdapterConfig();

  const base = {
    requestId: input.request.requirementId,
    supportedRequestTypes: [...KIMI_REAL_DISPATCH_SUPPORTED_REQUEST_TYPES],
    requiredFlags: [...KIMI_REAL_DISPATCH_REQUIRED_FLAGS],
    futureDispatchFlag: "SDLC_KIMI_GATEWAY_REAL_DISPATCH=enabled" as const,
    primaryGatewayUnchanged: true as const,
    affectsRuntimeRouting: false as const,
    affectsFinalStatus: false as const,
    invokesCli: false as const,
    spawnsProcess: false as const,
    writesFiles: false as const,
    persistsAudit: false as const,
    warnings: [] as string[],
  };

  if (!isKimiGatewayRealDispatchEnabled(env)) {
    return { ...base, eligible: false, decision: "real_dispatch_disabled", auditEvents: buildAudit("real_dispatch_disabled"), warnings: ["Real dispatch disabled"] };
  }
  if (env.SDLC_KIMI_GATEWAY_INTEGRATION !== "enabled") {
    return { ...base, eligible: false, decision: "gateway_integration_disabled", auditEvents: buildAudit("gateway_integration_disabled"), warnings: ["Gateway integration disabled"] };
  }
  if (env.SDLC_KIMI_CLI_COMMAND_EXECUTION !== "enabled") {
    return { ...base, eligible: false, decision: "command_execution_disabled", auditEvents: buildAudit("command_execution_disabled"), warnings: ["Command execution disabled"] };
  }
  if (!config.enabled) {
    return { ...base, eligible: false, decision: "adapter_disabled", auditEvents: buildAudit("adapter_disabled"), warnings: ["Kimi adapter disabled"] };
  }
  if (!config.command) {
    return { ...base, eligible: false, decision: "missing_cli_command", auditEvents: buildAudit("missing_cli_command"), warnings: ["Missing CLI command"] };
  }
  if (!KIMI_REAL_DISPATCH_SUPPORTED_REQUEST_TYPES.includes(input.request.type as never)) {
    return { ...base, eligible: false, decision: "unsupported_request_type", auditEvents: buildAudit("unsupported_request_type"), warnings: [`Unsupported request type: ${input.request.type}`] };
  }

  return { ...base, eligible: true, decision: "real_dispatch_eligible_contract_only", auditEvents: buildAudit("real_dispatch_eligible_contract_only"), warnings: ["Eligible — contract only; Gateway not wired for real dispatch"] };
}
