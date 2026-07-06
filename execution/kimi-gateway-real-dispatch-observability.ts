// Kimi Gateway Real Dispatch Observability
// ===========================================
// Structured in-memory observability metadata. Not persisted.
// No raw prompt, artifacts, secrets, or stdout/stderr.

import type { ExecutionRequest } from "./types";
import { sanitizeErrorSummary } from "./cli-adapter-audit";

export type KimiGatewayRealDispatchObservabilityStage =
  | "pre_execution" | "contract_rejected" | "execution_started"
  | "execution_success" | "execution_failure" | "execution_timeout"
  | "fallback";

export interface KimiGatewayRealDispatchObservabilityEvent {
  source: "kimi_gateway_real_dispatch";
  stage: KimiGatewayRealDispatchObservabilityStage;
  requestId: string;
  requestType: string;
  agent: "kimi";
  node: string;
  contractDecision?: string;
  dispatchStatus?: string;
  fallbackReason?: string;
  fallbackAction?: string;
  executed: boolean;
  invokesCli: boolean;
  spawnsProcess: boolean;
  affectsFinalStatus: false;
  affectsRuntimeRouting: false;
  writesFiles: false;
  persistsAudit: false;
  containsRawPrompt: false;
  containsRawArtifacts: false;
  containsSecrets: false;
  warnings: string[];
}

export function buildKimiGatewayRealDispatchObservabilityEvent(input: {
  stage: KimiGatewayRealDispatchObservabilityStage;
  request: ExecutionRequest;
  contractDecision?: string;
  dispatchStatus?: string;
  fallbackReason?: string;
  fallbackAction?: string;
  executed?: boolean;
  invokesCli?: boolean;
  spawnsProcess?: boolean;
  warnings?: string[];
}): KimiGatewayRealDispatchObservabilityEvent {
  return {
    source: "kimi_gateway_real_dispatch",
    stage: input.stage,
    requestId: input.request.requirementId,
    requestType: input.request.type,
    agent: "kimi",
    node: input.request.node,
    contractDecision: input.contractDecision,
    dispatchStatus: input.dispatchStatus,
    fallbackReason: input.fallbackReason,
    fallbackAction: input.fallbackAction,
    executed: input.executed ?? false,
    invokesCli: input.invokesCli ?? false,
    spawnsProcess: input.spawnsProcess ?? false,
    affectsFinalStatus: false,
    affectsRuntimeRouting: false,
    writesFiles: false,
    persistsAudit: false,
    containsRawPrompt: false,
    containsRawArtifacts: false,
    containsSecrets: false,
    warnings: (input.warnings ?? []).map((w) => sanitizeErrorSummary(w) ?? w.slice(0, 100)),
  };
}

// Compact observability summary for Gateway output (no full events)
export function buildObservabilitySummary(events: KimiGatewayRealDispatchObservabilityEvent[]) {
  return {
    source: "kimi_gateway_real_dispatch" as const,
    stages: events.map((e) => e.stage),
    containsRawPrompt: false as const,
    containsRawArtifacts: false as const,
    containsSecrets: false as const,
    affectsFinalStatus: false as const,
    affectsRuntimeRouting: false as const,
    persistsAudit: false as const,
  };
}
