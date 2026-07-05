// Kimi Adapter Contract Stub
// ============================
// Contract-only. No network calls. No real execution.
// Defines config, support matrix, mock parser, and contract-only executor.

import type { ExecutionRequest, ExecutionResult } from "./types";
import {
  RealAdapterConfig,
  RealAdapterSupportMatrix,
  RealAdapterMockParseResult,
} from "./real-adapter-contract-types";

// ─── Config ───────────────────────────────────────────

export function getKimiAdapterConfig(
  env: NodeJS.ProcessEnv = process.env
): RealAdapterConfig {
  const raw = env.SDLC_KIMI_ADAPTER;
  if (raw !== "enabled") {
    return {
      adapter: "kimi",
      enabled: false,
      source: raw === undefined || raw === "" ? "default" : "environment",
      hasApiKey: false,
      timeoutMs: 120000,
      rawMode: raw,
    };
  }

  const timeoutRaw = env.KIMI_TIMEOUT_MS;
  let timeoutMs = 120000;
  if (timeoutRaw) {
    const parsed = parseInt(timeoutRaw, 10);
    if (!isNaN(parsed) && parsed > 0) timeoutMs = parsed;
  }

  return {
    adapter: "kimi",
    enabled: true,
    source: "environment",
    baseUrl: env.KIMI_BASE_URL,
    model: env.KIMI_MODEL,
    hasApiKey: Boolean(env.KIMI_API_KEY),
    timeoutMs,
  };
}

// ─── Support Matrix ───────────────────────────────────

export function getKimiAdapterSupportMatrix(): RealAdapterSupportMatrix {
  return {
    adapter: "kimi",
    supportedRequestTypes: [],
    plannedRequestTypes: ["llm_task", "review", "code_generation"],
    unsupportedRequestTypes: ["validation", "code_review", "bugfix"],
    contractOnly: true,
    invokesNetwork: false,
    readsSecretsDuringExecution: false,
  };
}

export function isKimiRequestSupported(type: string): boolean {
  const matrix = getKimiAdapterSupportMatrix();
  return matrix.plannedRequestTypes.includes(type as never);
}

// ─── Mock Parser ──────────────────────────────────────

export function parseKimiMockResponse(input: {
  request: ExecutionRequest;
  mockResponse: unknown;
}): RealAdapterMockParseResult {
  const data = input.mockResponse as Record<string, unknown> | null;
  if (!data || typeof data !== "object" || typeof data["text"] !== "string") {
    return {
      success: false,
      status: "mock_parse_failure",
      output: {},
      error: "Invalid mock response shape: expected { text: string }",
    };
  }

  return {
    success: true,
    status: "mock_parse_success",
    output: {
      text: data["text"],
      adapter: "kimi",
      parsed: true,
    },
  };
}

// ─── Contract-only Executor ───────────────────────────

export async function executeKimiAdapterContractOnly(
  request: ExecutionRequest,
  config: RealAdapterConfig = getKimiAdapterConfig()
): Promise<ExecutionResult> {
  if (!config.enabled) {
    return {
      success: false,
      node: request.node,
      agent: "kimi",
      output: { error: "Kimi adapter is disabled" },
      artifacts: [],
      error: "disabled",
    };
  }

  if (!config.hasApiKey) {
    return {
      success: false,
      node: request.node,
      agent: "kimi",
      output: { error: "Kimi adapter missing API key configuration" },
      artifacts: [],
      error: "missing_config",
    };
  }

  const matrix = getKimiAdapterSupportMatrix();
  const allSupported = [...matrix.supportedRequestTypes, ...matrix.plannedRequestTypes];
  if (!allSupported.includes(request.type)) {
    return {
      success: false,
      node: request.node,
      agent: "kimi",
      output: { error: `Kimi adapter does not support request type: ${request.type}` },
      artifacts: [],
      error: "unsupported_request_type",
    };
  }

  // Contract-only — never executes real calls
  return {
    success: false,
    node: request.node,
    agent: "kimi",
    output: { error: "Kimi adapter is contract-only; no real execution" },
    artifacts: [],
    error: "contract_only",
  };
}
