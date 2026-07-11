// CLI Adapter Contract Types
// ============================
// Shared types for future real Kimi/Hermes CLI adapters.
// Contract-only in this PR — no process spawn, no CLI execution.
// Does NOT manage API keys, base URLs, or model config.
// The CLI tool itself handles auth/model configuration internally.

import type { ExecutionRequestType } from "./types";

export type CliAdapterName = "kimi" | "hermes";

export type KimiPromptTransport = "stdin" | "argument";

export type CliAdapterContractStatus =
  | "contract_only"
  | "disabled"
  | "missing_cli_command"
  | "unsupported_request_type"
  | "mock_parse_success"
  | "mock_parse_failure";

export interface CliAdapterConfig {
  adapter: CliAdapterName;
  enabled: boolean;
  source: "default" | "environment" | "test_override";
  command?: string;
  args: string[];
  workingDirectory?: string;
  timeoutMs: number;
  rawMode?: string;
  promptTransport?: KimiPromptTransport;
  promptArgument?: string;
}

export interface CliAdapterSupportMatrix {
  adapter: CliAdapterName;
  supportedRequestTypes: ExecutionRequestType[];
  plannedRequestTypes: ExecutionRequestType[];
  unsupportedRequestTypes: ExecutionRequestType[];
  contractOnly: true;
  invokesCli: false;
  spawnsProcess: false;
  readsApiKeys: false;
}

export interface CliAdapterMockParseResult {
  success: boolean;
  status: CliAdapterContractStatus;
  output: Record<string, unknown>;
  error?: string;
}
