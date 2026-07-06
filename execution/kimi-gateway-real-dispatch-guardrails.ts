// Kimi Gateway Real Dispatch Guardrails
// ========================================
// Operational safety: block large inputs, validate config, clamp outputs.
// Does NOT expand request types. Does NOT change Gateway/runtime behavior.

import type { ExecutionRequest } from "./types";
import type { CliAdapterConfig } from "./cli-adapter-contract-types";
import { sanitizeErrorSummary } from "./cli-adapter-audit";

export type KimiGatewayGuardrailDecision =
  | "allowed" | "request_too_large" | "prompt_too_large"
  | "invalid_cli_config" | "missing_cli_command"
  | "timeout_out_of_range" | "unsupported_request_type";

export interface KimiGatewayGuardrailResult {
  allowed: boolean;
  decision: KimiGatewayGuardrailDecision;
  requestId: string;
  requestType: string;
  maxPromptLength: number;
  maxSerializedInputLength: number;
  maxStdoutSummaryLength: number;
  maxStderrSummaryLength: number;
  maxErrorSummaryLength: number;
  affectsFinalStatus: false;
  affectsRuntimeRouting: false;
  writesFiles: false;
  persistsAudit: false;
  containsRawPrompt: false;
  containsRawArtifacts: false;
  containsSecrets: false;
  sanitizedMessage: string;
  warnings: string[];
}

export const KIMI_GATEWAY_GUARDRAIL_LIMITS = {
  maxPromptLength: 20000,
  maxSerializedInputLength: 50000,
  maxStdoutSummaryLength: 4000,
  maxStderrSummaryLength: 4000,
  maxErrorSummaryLength: 2000,
  minTimeoutMs: 1000,
  maxTimeoutMs: 300000,
} as const;

export type KimiGatewayGuardrailLimits = {
  maxPromptLength: number;
  maxSerializedInputLength: number;
  maxStdoutSummaryLength: number;
  maxStderrSummaryLength: number;
  maxErrorSummaryLength: number;
  minTimeoutMs: number;
  maxTimeoutMs: number;
};

function buildBase(request: ExecutionRequest, limits: KimiGatewayGuardrailLimits) {
  return {
    requestId: request.requirementId, requestType: request.type,
    maxPromptLength: limits.maxPromptLength,
    maxSerializedInputLength: limits.maxSerializedInputLength,
    maxStdoutSummaryLength: limits.maxStdoutSummaryLength,
    maxStderrSummaryLength: limits.maxStderrSummaryLength,
    maxErrorSummaryLength: limits.maxErrorSummaryLength,
    affectsFinalStatus: false as const, affectsRuntimeRouting: false as const,
    writesFiles: false as const, persistsAudit: false as const,
    containsRawPrompt: false as const, containsRawArtifacts: false as const,
    containsSecrets: false as const, warnings: [] as string[],
  };
}

export function evaluateKimiGatewayGuardrails(input: {
  request: ExecutionRequest;
  config?: CliAdapterConfig;
  limits?: Partial<KimiGatewayGuardrailLimits>;
}): KimiGatewayGuardrailResult {
  const limits = { ...KIMI_GATEWAY_GUARDRAIL_LIMITS, ...input.limits };
  const base = buildBase(input.request, limits);

  // Request type gate
  if (input.request.type !== "llm_task") {
    return { ...base, allowed: false, decision: "unsupported_request_type",
      sanitizedMessage: `Unsupported request type: ${input.request.type}`, warnings: [`Unsupported: ${input.request.type}`] };
  }

  // Prompt size
  const prompt = input.request.input?.["prompt"];
  if (typeof prompt === "string" && prompt.length > limits.maxPromptLength) {
    return { ...base, allowed: false, decision: "prompt_too_large",
      sanitizedMessage: `Prompt exceeds ${limits.maxPromptLength} chars`, warnings: ["Prompt too large"] };
  }

  // Serialized input size
  const serialized = JSON.stringify(input.request.input);
  if (serialized.length > limits.maxSerializedInputLength) {
    return { ...base, allowed: false, decision: "request_too_large",
      sanitizedMessage: `Request input exceeds ${limits.maxSerializedInputLength} chars`, warnings: ["Request too large"] };
  }

  // Config validation
  if (!input.config || input.config.enabled !== true) {
    return { ...base, allowed: false, decision: "invalid_cli_config",
      sanitizedMessage: "Kimi CLI config missing or disabled", warnings: ["Invalid CLI config"] };
  }
  if (!input.config.command || input.config.command.trim() === "") {
    return { ...base, allowed: false, decision: "missing_cli_command",
      sanitizedMessage: "Kimi CLI command not configured", warnings: ["Missing CLI command"] };
  }

  // Timeout range
  const timeout = input.config.timeoutMs;
  if (timeout !== undefined && (timeout < limits.minTimeoutMs || timeout > limits.maxTimeoutMs)) {
    return { ...base, allowed: false, decision: "timeout_out_of_range",
      sanitizedMessage: `Timeout ${timeout}ms out of range [${limits.minTimeoutMs}, ${limits.maxTimeoutMs}]`, warnings: ["Timeout out of range"] };
  }

  return { ...base, allowed: true, decision: "allowed", sanitizedMessage: "Guardrails passed" };
}

export function clampKimiGatewaySummary(input: {
  value?: string;
  maxLength: number;
}): string | undefined {
  if (!input.value || input.value.trim() === "") return undefined;
  const sanitized = sanitizeErrorSummary(input.value);
  if (!sanitized) return undefined;
  return sanitized.length > input.maxLength
    ? sanitized.slice(0, input.maxLength) + "…[truncated]"
    : sanitized;
}
