// Real Adapter Contract Types
// =============================
// Shared types for future real Kimi/Hermes adapters.
// Contract-only in this PR — no network calls, no real execution.

import type { ExecutionRequestType, AgentName } from "./types";

export type RealAdapterName = "kimi" | "hermes";

export type RealAdapterContractStatus =
  | "contract_only"
  | "disabled"
  | "missing_config"
  | "unsupported_request_type"
  | "mock_parse_success"
  | "mock_parse_failure";

export interface RealAdapterConfig {
  adapter: RealAdapterName;
  enabled: boolean;
  source: "default" | "environment" | "test_override";
  baseUrl?: string;
  model?: string;
  hasApiKey: boolean;
  timeoutMs: number;
  rawMode?: string;
}

export interface RealAdapterSupportMatrix {
  adapter: RealAdapterName;
  supportedRequestTypes: ExecutionRequestType[];
  plannedRequestTypes: ExecutionRequestType[];
  unsupportedRequestTypes: ExecutionRequestType[];
  contractOnly: true;
  invokesNetwork: false;
  readsSecretsDuringExecution: false;
}

export interface RealAdapterMockParseResult {
  success: boolean;
  status: RealAdapterContractStatus;
  output: Record<string, unknown>;
  error?: string;
}
