// Kimi Gateway Shadow Sidecar
// =============================
// Standalone shadow/sidecar helper for future Kimi Gateway wiring.
// Does NOT modify execution/gateway.ts. Does NOT change runtime.
// Requires three explicit flags for real execution.
// Default off. Sidecar only.

import type { ExecutionRequest } from "./types";
import type { CliAdapterConfig } from "./cli-adapter-contract-types";
import type { CliAdapterAuditEvent } from "./cli-adapter-audit";
import {
  evaluateKimiGatewayIntegrationEligibility,
} from "./kimi-gateway-integration-contract";
import {
  executeKimiCliCommand,
  type KimiCliProcessRunner,
} from "./kimi-cli-command-executor";

export type KimiGatewayShadowDecision =
  | "shadow_disabled"
  | "gateway_integration_disabled"
  | "command_execution_disabled"
  | "adapter_disabled"
  | "missing_cli_command"
  | "unsupported_request_type"
  | "shadow_eligible_not_executed"
  | "shadow_executed_success"
  | "shadow_executed_failure"
  | "shadow_executed_timeout";

export interface KimiGatewayShadowSidecar {
  enabled: boolean;
  executed: boolean;
  decision: KimiGatewayShadowDecision;
  requestId: string;
  primaryGatewayUnchanged: true;
  affectsFinalStatus: false;
  affectsRouting: false;
  wiredToRuntime: false;
  requiresFlags: string[];
  commandInput?: Record<string, unknown>;
  auditEvents?: CliAdapterAuditEvent[];
  stdoutSummary?: string;
  stderrSummary?: string;
  error?: string;
  warnings: string[];
}

export function isKimiGatewayShadowEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.SDLC_KIMI_GATEWAY_SHADOW === "enabled";
}

export async function buildKimiGatewayShadowSidecar(input: {
  request: ExecutionRequest;
  config?: CliAdapterConfig;
  env?: Record<string, string | undefined>;
  runner?: KimiCliProcessRunner;
}): Promise<KimiGatewayShadowSidecar> {
  const env = input.env ?? process.env;
  const flags = [
    "SDLC_KIMI_GATEWAY_SHADOW=enabled",
    "SDLC_KIMI_GATEWAY_INTEGRATION=enabled",
    "SDLC_KIMI_CLI_COMMAND_EXECUTION=enabled",
  ];

  if (!isKimiGatewayShadowEnabled(env)) {
    return {
      enabled: false, executed: false, decision: "shadow_disabled",
      requestId: input.request.requirementId,
      primaryGatewayUnchanged: true, affectsFinalStatus: false,
      affectsRouting: false, wiredToRuntime: false,
      requiresFlags: flags,
      warnings: ["Kimi Gateway shadow disabled"],
    };
  }

  const eligibility = evaluateKimiGatewayIntegrationEligibility({
    request: input.request, config: input.config, env,
  });

  if (!eligibility.eligible) {
    const decisionMap: Record<string, KimiGatewayShadowDecision> = {
      gateway_integration_disabled: "gateway_integration_disabled",
      command_execution_disabled: "command_execution_disabled",
      adapter_disabled: "adapter_disabled",
      missing_cli_command: "missing_cli_command",
      unsupported_request_type: "unsupported_request_type",
    };
    return {
      enabled: true, executed: false,
      decision: decisionMap[eligibility.decision] ?? "gateway_integration_disabled",
      requestId: eligibility.requestId,
      primaryGatewayUnchanged: true, affectsFinalStatus: false,
      affectsRouting: false, wiredToRuntime: false,
      requiresFlags: eligibility.requiredFlags,
      auditEvents: eligibility.auditEvents,
      warnings: eligibility.warnings,
    };
  }

  // All three flags enabled; eligible — execute via command executor
  const execResult = await executeKimiCliCommand({
    request: input.request, config: input.config, env, runner: input.runner,
  });

  const decisionMap: Record<string, KimiGatewayShadowDecision> = {
    executed_success: "shadow_executed_success",
    executed_failure: "shadow_executed_failure",
    executed_timeout: "shadow_executed_timeout",
  };

  return {
    enabled: true, executed: execResult.decision.startsWith("executed"),
    decision: decisionMap[execResult.decision] ?? "shadow_eligible_not_executed",
    requestId: execResult.requestId,
    primaryGatewayUnchanged: true, affectsFinalStatus: false,
    affectsRouting: false, wiredToRuntime: false,
    requiresFlags: eligibility.requiredFlags,
    commandInput: execResult.commandInput as unknown as Record<string, unknown> | undefined,
    auditEvents: execResult.auditEvents,
    stdoutSummary: execResult.stdoutSummary,
    stderrSummary: execResult.stderrSummary,
    error: execResult.error,
    warnings: eligibility.warnings,
  };
}
