// [FROZEN: PATH A RETIREMENT (C03-E W4 / Decision-073)]
// Legacy Path-A module (first-generation sdlc-* D0x runtime / Agent direct-drive).
// FROZEN: do not evolve; new Path-B assembly must not import it (enforced by
// scripts/validate-skill-contracts.rb section B-7). Physical deletion is a
// separate decision after the Path-B periphery is complete and the E5 real
// canary passes. See docs/reports/c03-e-w4-spawn-reference-graph.md

// Hermes Gateway Shadow Sidecar
// ===============================
// Standalone shadow/sidecar helper for future Hermes Gateway wiring.
// Does NOT modify execution/gateway.ts. Does NOT change runtime.
// Requires three explicit flags for real execution.
// Default off. Sidecar only.

import type { ExecutionRequest } from "./types";
import type { CliAdapterConfig } from "./cli-adapter-contract-types";
import {
  evaluateHermesGatewayIntegrationContract,
  type HermesGatewayIntegrationDecision,
} from "./hermes-gateway-integration-contract";
import {
  executeHermesCliCommand,
  type HermesCliProcessRunner,
} from "./hermes-cli-command-executor";

export type HermesGatewayShadowSidecarStatus =
  | "shadow_disabled"
  | "integration_ineligible"
  | "shadow_executed_success"
  | "shadow_executed_failure"
  | "shadow_executed_timeout";

export interface HermesGatewayShadowSidecarAuditEvent {
  adapter: "hermes";
  source: "hermes_gateway_shadow_sidecar";
  requestId: string;
  requestType: string;
  status: HermesGatewayShadowSidecarStatus;
  enabled: boolean;
  executed: boolean;
  integrationDecision?: string;
  commandDecision?: string;
  affectsPrimaryGatewayResult: false;
  affectsRuntimeRouting: false;
  affectsFinalStatus: false;
  writesFiles: false;
  persistsAudit: false;
  containsRawPrompt: false;
  containsRawArtifacts: false;
  containsSecrets: false;
  warnings: string[];
}

export interface HermesGatewayShadowSidecarResult {
  adapter: "hermes";
  source: "hermes_gateway_shadow_sidecar";
  status: HermesGatewayShadowSidecarStatus;
  requestId: string;
  requestType: string;
  enabled: boolean;
  executed: boolean;
  integrationDecision?: string;
  commandDecision?: string;
  outputSummary?: string;
  errorSummary?: string;
  affectsPrimaryGatewayResult: false;
  affectsRuntimeRouting: false;
  affectsFinalStatus: false;
  writesFiles: false;
  persistsAudit: false;
  containsRawPrompt: false;
  containsRawArtifacts: false;
  containsSecrets: false;
  auditEvents: HermesGatewayShadowSidecarAuditEvent[];
  warnings: string[];
}

export const HERMES_GATEWAY_SHADOW_FLAG = "SDLC_HERMES_GATEWAY_SHADOW";

export function isHermesGatewayShadowEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env[HERMES_GATEWAY_SHADOW_FLAG] === "enabled";
}

const REQUIRED_FLAGS = [
  "SDLC_HERMES_GATEWAY_SHADOW=enabled",
  "SDLC_HERMES_GATEWAY_INTEGRATION=enabled",
  "SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled",
];

function buildAudit(input: {
  requestId: string; requestType: string;
  status: HermesGatewayShadowSidecarStatus; enabled: boolean; executed: boolean;
  integrationDecision?: string; commandDecision?: string;
  warnings: string[];
}): HermesGatewayShadowSidecarAuditEvent {
  return {
    adapter: "hermes",
    source: "hermes_gateway_shadow_sidecar",
    requestId: input.requestId, requestType: input.requestType,
    status: input.status, enabled: input.enabled, executed: input.executed,
    integrationDecision: input.integrationDecision,
    commandDecision: input.commandDecision,
    affectsPrimaryGatewayResult: false,
    affectsRuntimeRouting: false, affectsFinalStatus: false,
    writesFiles: false, persistsAudit: false,
    containsRawPrompt: false, containsRawArtifacts: false, containsSecrets: false,
    warnings: input.warnings,
  };
}

export async function runHermesGatewayShadowSidecar(input: {
  request: ExecutionRequest;
  config?: CliAdapterConfig;
  env?: Record<string, string | undefined>;
  runner?: HermesCliProcessRunner;
}): Promise<HermesGatewayShadowSidecarResult> {
  const env = input.env ?? process.env;

  const baseResult = {
    adapter: "hermes" as const,
    source: "hermes_gateway_shadow_sidecar" as const,
    requestId: input.request.requirementId,
    requestType: input.request.type,
    affectsPrimaryGatewayResult: false as const,
    affectsRuntimeRouting: false as const,
    affectsFinalStatus: false as const,
    writesFiles: false as const,
    persistsAudit: false as const,
    containsRawPrompt: false as const,
    containsRawArtifacts: false as const,
    containsSecrets: false as const,
  };

  // Shadow flag disabled
  if (!isHermesGatewayShadowEnabled(env)) {
    return {
      ...baseResult,
      status: "shadow_disabled", enabled: false, executed: false,
      auditEvents: [buildAudit({
        requestId: input.request.requirementId, requestType: input.request.type,
        status: "shadow_disabled", enabled: false, executed: false,
        warnings: ["Hermes Gateway shadow disabled"],
      })],
      warnings: ["Hermes Gateway shadow disabled"],
    };
  }

  // Shadow enabled — check integration eligibility
  const eligibility = evaluateHermesGatewayIntegrationContract({
    request: input.request, config: input.config, env,
  });

  if (!eligibility.eligible) {
    return {
      ...baseResult,
      status: "integration_ineligible", enabled: true, executed: false,
      integrationDecision: eligibility.decision,
      auditEvents: [buildAudit({
        requestId: input.request.requirementId, requestType: input.request.type,
        status: "integration_ineligible", enabled: true, executed: false,
        integrationDecision: eligibility.decision,
        warnings: eligibility.warnings,
      })],
      warnings: eligibility.warnings,
    };
  }

  // All three flags enabled and eligible — execute via command executor
  const execResult = await executeHermesCliCommand({
    request: input.request, config: input.config, env, runner: input.runner,
  });

  const statusMap: Record<string, HermesGatewayShadowSidecarStatus> = {
    executed_success: "shadow_executed_success",
    executed_failure: "shadow_executed_failure",
    executed_timeout: "shadow_executed_timeout",
  };
  const status = statusMap[execResult.decision] ?? "shadow_executed_failure";

  return {
    ...baseResult,
    status, enabled: true, executed: execResult.decision.startsWith("executed"),
    integrationDecision: eligibility.decision,
    commandDecision: execResult.decision,
    outputSummary: execResult.stdoutSummary,
    errorSummary: execResult.stderrSummary ?? execResult.error,
    auditEvents: [buildAudit({
      requestId: input.request.requirementId, requestType: input.request.type,
      status, enabled: true, executed: execResult.decision.startsWith("executed"),
      integrationDecision: eligibility.decision,
      commandDecision: execResult.decision,
      warnings: eligibility.warnings,
    })],
    warnings: eligibility.warnings,
  };
}
