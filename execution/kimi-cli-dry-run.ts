// Kimi CLI Adapter Dry-run Harness
// ==================================
// Safe command preview and dry-run decision without CLI execution.
// Does NOT spawn processes. Does NOT call CLI. Does NOT read API keys.

import type { ExecutionRequest } from "./types";
import type { CliAdapterConfig } from "./cli-adapter-contract-types";
import {
  getKimiCliAdapterConfig,
  getKimiCliAdapterSupportMatrix,
  isKimiCliRequestPlanned,
} from "./kimi-cli-adapter-contract";

// ─── Types ────────────────────────────────────────────

export type KimiCliDryRunDecision =
  | "disabled"
  | "missing_cli_command"
  | "unsupported_request_type"
  | "dry_run_ready";

export interface KimiCliCommandPreview {
  command: string;
  args: string[];
  workingDirectory?: string;
  timeoutMs: number;
  sanitized: true;
}

export interface KimiCliDryRunAudit {
  adapter: "kimi";
  mode: "dry_run";
  featureFlag: "SDLC_KIMI_CLI_ADAPTER";
  enabled: boolean;
  requestType: string;
  plannedRequestType: boolean;
  hasCommand: boolean;
  commandPreviewCreated: boolean;
  invokesCli: false;
  spawnsProcess: false;
  readsApiKeys: false;
  writesFiles: false;
  affectsRuntime: false;
  affectsGateway: false;
  warnings: string[];
}

export interface KimiCliDryRunResult {
  success: boolean;
  decision: KimiCliDryRunDecision;
  requestId: string;
  commandPreview?: KimiCliCommandPreview;
  audit: KimiCliDryRunAudit;
  error?: string;
}

// ─── Secret sanitizer ─────────────────────────────────

const SECRET_PATTERNS = [
  /token=/i,
  /api_key=/i,
  /apikey=/i,
  /secret=/i,
  /password=/i,
  /^sk-/,
];

function sanitizeArg(arg: string): string {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(arg)) return "[REDACTED]";
  }
  return arg;
}

// ─── Command Preview ──────────────────────────────────

export function buildKimiCliCommandPreview(
  config: CliAdapterConfig,
  _request: ExecutionRequest
): KimiCliCommandPreview | undefined {
  if (!config.command) return undefined;
  return {
    command: config.command,
    args: config.args.map(sanitizeArg),
    workingDirectory: config.workingDirectory,
    timeoutMs: config.timeoutMs,
    sanitized: true,
  };
}

// ─── Dry-run ──────────────────────────────────────────

export function dryRunKimiCliAdapter(input: {
  request: ExecutionRequest;
  config?: CliAdapterConfig;
}): KimiCliDryRunResult {
  const config = input.config ?? getKimiCliAdapterConfig();
  const requestId = input.request.requirementId;

  const baseAudit: KimiCliDryRunAudit = {
    adapter: "kimi",
    mode: "dry_run",
    featureFlag: "SDLC_KIMI_CLI_ADAPTER",
    enabled: config.enabled,
    requestType: input.request.type,
    plannedRequestType: isKimiCliRequestPlanned(input.request.type),
    hasCommand: Boolean(config.command),
    commandPreviewCreated: false,
    invokesCli: false,
    spawnsProcess: false,
    readsApiKeys: false,
    writesFiles: false,
    affectsRuntime: false,
    affectsGateway: false,
    warnings: [],
  };

  // Disabled
  if (!config.enabled) {
    return {
      success: false,
      decision: "disabled",
      requestId,
      audit: baseAudit,
      error: "Kimi CLI adapter is disabled",
    };
  }

  // Missing command
  if (!config.command) {
    return {
      success: false,
      decision: "missing_cli_command",
      requestId,
      audit: baseAudit,
      error: "Kimi CLI adapter: no CLI command configured",
    };
  }

  // Unsupported request type
  if (!isKimiCliRequestPlanned(input.request.type)) {
    return {
      success: false,
      decision: "unsupported_request_type",
      requestId,
      audit: baseAudit,
      error: `Kimi CLI adapter does not support request type: ${input.request.type}`,
    };
  }

  // Dry-run ready
  const preview = buildKimiCliCommandPreview(config, input.request);
  return {
    success: true,
    decision: "dry_run_ready",
    requestId,
    commandPreview: preview,
    audit: {
      ...baseAudit,
      commandPreviewCreated: preview !== undefined,
    },
  };
}
