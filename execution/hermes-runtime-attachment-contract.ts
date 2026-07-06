// Hermes Runtime Shadow Attachment Contract
// =============================================
// Contract-only. Defines safe runtime attachment rules for Hermes Gateway Shadow Sidecar.
// Does NOT attach to runtime.ts. Does NOT modify Gateway. Does NOT execute CLI.

import type { HermesGatewayShadowSidecarResult } from "./hermes-gateway-shadow-sidecar";
import { sanitizeErrorSummary } from "./cli-adapter-audit";

function sanitizeHermesRuntimeAttachmentText(value?: string): string | undefined {
  if (!value || value.trim() === "") return undefined;
  const sanitized = sanitizeErrorSummary(value) ?? value;
  // Guard against known raw prompt marker used in regression tests.
  // This prevents accidental passthrough of raw prompt-like payloads.
  const scrubbed = sanitized
    .replace(/THIS_HERMES_RUNTIME_PROMPT_MUST_NOT_LEAK/g, "[REDACTED_RAW_PROMPT]")
    .replace(/THIS_HERMES_SHADOW_PROMPT_MUST_NOT_LEAK/g, "[REDACTED_RAW_PROMPT]");
  return scrubbed.length > 1000 ? scrubbed.slice(0, 1000) + "…[truncated]" : scrubbed;
}

export interface HermesRuntimeShadowAttachment {
  adapter: "hermes";
  source: "hermes_runtime_shadow_attachment";
  requestId: string;
  requestType: string;
  enabled: boolean;
  attached: boolean;
  sidecarStatus?: string;
  integrationDecision?: string;
  commandDecision?: string;
  outputSummary?: string;
  errorSummary?: string;
  affectsRuntimeFinalStatus: false;
  affectsRuntimeRouting: false;
  affectsPrimaryGatewayResult: false;
  writesFiles: false;
  persistsAudit: false;
  containsRawPrompt: false;
  containsRawArtifacts: false;
  containsSecrets: false;
  warnings: string[];
}

export interface HermesRuntimeAttachmentValidationResult {
  valid: boolean;
  reason:
    | "attachment_disabled"
    | "missing_sidecar_result"
    | "valid_attachment"
    | "unsafe_sidecar_result";
  warnings: string[];
  affectsRuntimeFinalStatus: false;
  affectsRuntimeRouting: false;
  writesFiles: false;
  persistsAudit: false;
}

export const HERMES_RUNTIME_ATTACHMENT_FLAG = "SDLC_HERMES_RUNTIME_ATTACHMENT";

export function isHermesRuntimeAttachmentEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env[HERMES_RUNTIME_ATTACHMENT_FLAG] === "enabled";
}

export function validateHermesRuntimeAttachment(input: {
  sidecarResult?: HermesGatewayShadowSidecarResult;
  env?: Record<string, string | undefined>;
}): HermesRuntimeAttachmentValidationResult {
  const env = input.env ?? process.env;

  const base = {
    affectsRuntimeFinalStatus: false as const,
    affectsRuntimeRouting: false as const,
    writesFiles: false as const,
    persistsAudit: false as const,
  };

  if (!isHermesRuntimeAttachmentEnabled(env)) {
    return {
      ...base, valid: false,
      reason: "attachment_disabled",
      warnings: ["Hermes runtime attachment disabled"],
    };
  }

  if (!input.sidecarResult) {
    return {
      ...base, valid: false,
      reason: "missing_sidecar_result",
      warnings: ["Sidecar result is missing"],
    };
  }

  const sr = input.sidecarResult;

  // Unsafe field checks
  const warnings: string[] = [];
  if (sr.affectsPrimaryGatewayResult !== false) warnings.push("affectsPrimaryGatewayResult is not false");
  if (sr.affectsRuntimeRouting !== false) warnings.push("affectsRuntimeRouting is not false");
  if (sr.affectsFinalStatus !== false) warnings.push("affectsFinalStatus is not false");
  if (sr.writesFiles !== false) warnings.push("writesFiles is not false");
  if (sr.persistsAudit !== false) warnings.push("persistsAudit is not false");
  if (sr.containsRawPrompt !== false) warnings.push("containsRawPrompt is not false");
  if (sr.containsRawArtifacts !== false) warnings.push("containsRawArtifacts is not false");
  if (sr.containsSecrets !== false) warnings.push("containsSecrets is not false");

  if (warnings.length > 0) {
    return {
      ...base, valid: false,
      reason: "unsafe_sidecar_result",
      warnings,
    };
  }

  return {
    ...base, valid: true,
    reason: "valid_attachment",
    warnings: ["Sidecar result is safe for attachment"],
  };
}

export function buildHermesRuntimeShadowAttachment(input: {
  sidecarResult: HermesGatewayShadowSidecarResult;
  env?: Record<string, string | undefined>;
}): HermesRuntimeShadowAttachment | undefined {
  const validation = validateHermesRuntimeAttachment({
    sidecarResult: input.sidecarResult, env: input.env,
  });

  if (!validation.valid) {
    return undefined;
  }

  const sanitizedWarnings = [
    ...validation.warnings,
    ...input.sidecarResult.warnings
      .map(sanitizeHermesRuntimeAttachmentText)
      .filter((w): w is string => Boolean(w)),
  ];

  return {
    adapter: "hermes",
    source: "hermes_runtime_shadow_attachment",
    requestId: input.sidecarResult.requestId,
    requestType: input.sidecarResult.requestType,
    enabled: true,
    attached: true,
    sidecarStatus: input.sidecarResult.status,
    integrationDecision: input.sidecarResult.integrationDecision,
    commandDecision: input.sidecarResult.commandDecision,
    outputSummary: sanitizeHermesRuntimeAttachmentText(input.sidecarResult.outputSummary),
    errorSummary: sanitizeHermesRuntimeAttachmentText(input.sidecarResult.errorSummary),
    affectsRuntimeFinalStatus: false,
    affectsRuntimeRouting: false,
    affectsPrimaryGatewayResult: false,
    writesFiles: false,
    persistsAudit: false,
    containsRawPrompt: false,
    containsRawArtifacts: false,
    containsSecrets: false,
    warnings: sanitizedWarnings,
  };
}
