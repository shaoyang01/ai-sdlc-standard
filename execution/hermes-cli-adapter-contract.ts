// Hermes CLI Adapter Contract Stub
// ==================================
// Contract-only. No CLI execution. No process spawn.
// Does NOT manage API keys — CLI handles auth internally.

import type { ExecutionRequest, ExecutionResult } from "./types";
import {
  CliAdapterConfig,
  CliAdapterSupportMatrix,
  CliAdapterMockParseResult,
} from "./cli-adapter-contract-types";

// ─── Config ───────────────────────────────────────────

export function getHermesCliAdapterConfig(
  env: NodeJS.ProcessEnv = process.env
): CliAdapterConfig {
  const raw = env.SDLC_HERMES_CLI_ADAPTER;
  if (raw !== "enabled") {
    return {
      adapter: "hermes",
      enabled: false,
      source: raw === undefined || raw === "" ? "default" : "environment",
      args: [],
      timeoutMs: 120000,
      rawMode: raw,
    };
  }

  const timeoutRaw = env.SDLC_HERMES_CLI_TIMEOUT_MS;
  let timeoutMs = 120000;
  if (timeoutRaw) {
    const parsed = parseInt(timeoutRaw, 10);
    if (!isNaN(parsed) && parsed > 0) timeoutMs = parsed;
  }

  const argsRaw = env.SDLC_HERMES_CLI_ARGS;
  const args = argsRaw ? argsRaw.split(/\s+/).filter(Boolean) : [];

  return {
    adapter: "hermes",
    enabled: true,
    source: "environment",
    command: env.SDLC_HERMES_CLI_COMMAND,
    args,
    workingDirectory: env.SDLC_HERMES_CLI_WORKING_DIR,
    timeoutMs,
  };
}

// ─── Support Matrix ───────────────────────────────────

export function getHermesCliAdapterSupportMatrix(): CliAdapterSupportMatrix {
  return {
    adapter: "hermes",
    supportedRequestTypes: [],
    plannedRequestTypes: ["validation", "review"],
    unsupportedRequestTypes: ["llm_task", "code_generation", "code_review", "bugfix"],
    contractOnly: true,
    invokesCli: false,
    spawnsProcess: false,
    readsApiKeys: false,
  };
}

export function isHermesCliRequestPlanned(type: string): boolean {
  return getHermesCliAdapterSupportMatrix().plannedRequestTypes.includes(type as never);
}

// ─── Mock CLI Output Parser ───────────────────────────

export function parseHermesCliMockOutput(input: {
  request: ExecutionRequest;
  stdout: string;
  stderr?: string;
  exitCode: number;
}): CliAdapterMockParseResult {
  if (input.exitCode !== 0) {
    return {
      success: false,
      status: "mock_parse_failure",
      output: {},
      error: `CLI exited with code ${input.exitCode}: ${input.stderr ?? input.stdout}`,
    };
  }

  if (!input.stdout || input.stdout.trim() === "") {
    return {
      success: false,
      status: "mock_parse_failure",
      output: {},
      error: "Empty stdout from CLI",
    };
  }

  // Try JSON parse
  try {
    const json = JSON.parse(input.stdout);
    if (typeof json === "object" && json !== null) {
      return {
        success: true,
        status: "mock_parse_success",
        output: {
          ...json,
          adapter: "hermes",
          parsed: true,
          exitCode: input.exitCode,
        },
      };
    }
  } catch {
    // Not JSON — treat as plain text
  }

  return {
    success: true,
    status: "mock_parse_success",
    output: {
      verdict: "UNKNOWN",
      summary: input.stdout,
      adapter: "hermes",
      parsed: true,
      exitCode: input.exitCode,
    },
  };
}

// ─── Contract-only Executor ───────────────────────────

export async function executeHermesCliAdapterContractOnly(
  request: ExecutionRequest,
  config: CliAdapterConfig = getHermesCliAdapterConfig()
): Promise<ExecutionResult> {
  if (!config.enabled) {
    return {
      success: false,
      node: request.node,
      agent: "hermes",
      output: { error: "Hermes CLI adapter is disabled" },
      artifacts: [],
      error: "disabled",
    };
  }

  if (!config.command) {
    return {
      success: false,
      node: request.node,
      agent: "hermes",
      output: { error: "Hermes CLI adapter: no CLI command configured" },
      artifacts: [],
      error: "missing_cli_command",
    };
  }

  const matrix = getHermesCliAdapterSupportMatrix();
  const allSupported = [...matrix.supportedRequestTypes, ...matrix.plannedRequestTypes];
  if (!allSupported.includes(request.type)) {
    return {
      success: false,
      node: request.node,
      agent: "hermes",
      output: { error: `Hermes CLI adapter does not support request type: ${request.type}` },
      artifacts: [],
      error: "unsupported_request_type",
    };
  }

  // Contract-only — never executes CLI
  return {
    success: false,
    node: request.node,
    agent: "hermes",
    output: { error: "Hermes CLI adapter is contract-only; no real execution" },
    artifacts: [],
    error: "contract_only",
  };
}
