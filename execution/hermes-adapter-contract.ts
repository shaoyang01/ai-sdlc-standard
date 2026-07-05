// Hermes Adapter Contract Stub
// ==============================
// Contract-only. No network calls. No real execution.
// Defines config, support matrix, mock parser, and contract-only executor.

import type { ExecutionRequest, ExecutionResult } from "./types";
import {
  RealAdapterConfig,
  RealAdapterSupportMatrix,
  RealAdapterMockParseResult,
} from "./real-adapter-contract-types";

// ─── Config ───────────────────────────────────────────

export function getHermesAdapterConfig(
  env: NodeJS.ProcessEnv = process.env
): RealAdapterConfig {
  const raw = env.SDLC_HERMES_ADAPTER;
  if (raw !== "enabled") {
    return {
      adapter: "hermes",
      enabled: false,
      source: raw === undefined || raw === "" ? "default" : "environment",
      hasApiKey: false,
      timeoutMs: 120000,
      rawMode: raw,
    };
  }

  const timeoutRaw = env.HERMES_TIMEOUT_MS;
  let timeoutMs = 120000;
  if (timeoutRaw) {
    const parsed = parseInt(timeoutRaw, 10);
    if (!isNaN(parsed) && parsed > 0) timeoutMs = parsed;
  }

  return {
    adapter: "hermes",
    enabled: true,
    source: "environment",
    baseUrl: env.HERMES_BASE_URL,
    model: env.HERMES_MODEL,
    hasApiKey: Boolean(env.HERMES_API_KEY),
    timeoutMs,
  };
}

// ─── Support Matrix ───────────────────────────────────

export function getHermesAdapterSupportMatrix(): RealAdapterSupportMatrix {
  return {
    adapter: "hermes",
    supportedRequestTypes: [],
    plannedRequestTypes: ["validation", "review"],
    unsupportedRequestTypes: ["llm_task", "code_generation", "code_review", "bugfix"],
    contractOnly: true,
    invokesNetwork: false,
    readsSecretsDuringExecution: false,
  };
}

export function isHermesRequestSupported(type: string): boolean {
  const matrix = getHermesAdapterSupportMatrix();
  return matrix.plannedRequestTypes.includes(type as never);
}

// ─── Mock Parser ──────────────────────────────────────

export function parseHermesMockResponse(input: {
  request: ExecutionRequest;
  mockResponse: unknown;
}): RealAdapterMockParseResult {
  const data = input.mockResponse as Record<string, unknown> | null;
  if (!data || typeof data !== "object" || typeof data["verdict"] !== "string") {
    return {
      success: false,
      status: "mock_parse_failure",
      output: {},
      error: "Invalid mock response shape: expected { verdict: string }",
    };
  }

  return {
    success: true,
    status: "mock_parse_success",
    output: {
      verdict: data["verdict"],
      adapter: "hermes",
      parsed: true,
      summary: data["summary"] ?? null,
      checks: data["checks"] ?? [],
    },
  };
}

// ─── Contract-only Executor ───────────────────────────

export async function executeHermesAdapterContractOnly(
  request: ExecutionRequest,
  config: RealAdapterConfig = getHermesAdapterConfig()
): Promise<ExecutionResult> {
  if (!config.enabled) {
    return {
      success: false,
      node: request.node,
      agent: "hermes",
      output: { error: "Hermes adapter is disabled" },
      artifacts: [],
      error: "disabled",
    };
  }

  if (!config.hasApiKey) {
    return {
      success: false,
      node: request.node,
      agent: "hermes",
      output: { error: "Hermes adapter missing API key configuration" },
      artifacts: [],
      error: "missing_config",
    };
  }

  const matrix = getHermesAdapterSupportMatrix();
  const allSupported = [...matrix.supportedRequestTypes, ...matrix.plannedRequestTypes];
  if (!allSupported.includes(request.type)) {
    return {
      success: false,
      node: request.node,
      agent: "hermes",
      output: { error: `Hermes adapter does not support request type: ${request.type}` },
      artifacts: [],
      error: "unsupported_request_type",
    };
  }

  // Contract-only — never executes real calls
  return {
    success: false,
    node: request.node,
    agent: "hermes",
    output: { error: "Hermes adapter is contract-only; no real execution" },
    artifacts: [],
    error: "contract_only",
  };
}
