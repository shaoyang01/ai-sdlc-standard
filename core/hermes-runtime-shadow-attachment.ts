// Hermes Runtime Shadow Attachment Helper
// ==========================================
// Builds optional Hermes runtime sidecar metadata behind explicit flags.
// Does NOT change final_status, routing, agent selection, or Gateway dispatch.
// Default off. Sidecar only.

import type { ExecutionRequest } from "../execution/types";
import type { CliAdapterConfig } from "../execution/cli-adapter-contract-types";
import type { HermesCliProcessRunner } from "../execution/hermes-cli-command-executor";
import { runHermesGatewayShadowSidecar } from "../execution/hermes-gateway-shadow-sidecar";
import {
  buildHermesRuntimeShadowAttachment,
  validateHermesRuntimeAttachment,
  isHermesRuntimeAttachmentEnabled,
  type HermesRuntimeShadowAttachment,
} from "../execution/hermes-runtime-attachment-contract";
import { sanitizeErrorSummary } from "../execution/cli-adapter-audit";

export interface HermesRuntimeShadowAttachmentAuditMetadata {
  adapter: "hermes";
  source: "hermes_runtime_shadow_attachment_audit";
  auditVersion: 1;
  runtimeAttachmentField: "hermes_runtime_shadow_attachment";
  featureFlag: "SDLC_HERMES_RUNTIME_ATTACHMENT";
  enabled: boolean;
  attached: boolean;
  sidecarExecuted: boolean;
  attachmentBuilt: boolean;
  sidecarStatus?: string;
  validationReason?: string;
  requestId: string;
  requestType: string;
  timestamp: string;
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

export interface HermesRuntimeShadowAttachmentBuildResult {
  adapter: "hermes";
  source: "hermes_runtime_shadow_attachment_helper";
  requestId: string;
  requestType: string;
  enabled: boolean;
  sidecarExecuted: boolean;
  attachmentBuilt: boolean;
  sidecarStatus?: string;
  validationReason?: string;
  attachment?: HermesRuntimeShadowAttachment;
  auditMetadata?: HermesRuntimeShadowAttachmentAuditMetadata;
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

function sanitizeHermesRuntimeShadowAuditText(value?: string): string | undefined {
  if (!value || value.trim() === "") return undefined;
  const sanitized = sanitizeErrorSummary(value) ?? value;
  const scrubbed = sanitized
    .replace(/THIS_HERMES_RUNTIME_PROMPT_MUST_NOT_LEAK/g, "[REDACTED_RAW_PROMPT]")
    .replace(/THIS_HERMES_SHADOW_PROMPT_MUST_NOT_LEAK/g, "[REDACTED_RAW_PROMPT]");
  return scrubbed.length > 1000
    ? scrubbed.slice(0, 1000) + "…[truncated]"
    : scrubbed;
}

export function buildHermesRuntimeShadowAttachmentAuditMetadata(input: {
  requestId: string;
  requestType: string;
  enabled: boolean;
  attached: boolean;
  sidecarExecuted: boolean;
  attachmentBuilt: boolean;
  sidecarStatus?: string;
  validationReason?: string;
  warnings: string[];
  now?: () => Date;
}): HermesRuntimeShadowAttachmentAuditMetadata {
  const clock = input.now ?? (() => new Date());
  return {
    adapter: "hermes",
    source: "hermes_runtime_shadow_attachment_audit",
    auditVersion: 1,
    runtimeAttachmentField: "hermes_runtime_shadow_attachment",
    featureFlag: "SDLC_HERMES_RUNTIME_ATTACHMENT",
    enabled: input.enabled,
    attached: input.attached,
    sidecarExecuted: input.sidecarExecuted,
    attachmentBuilt: input.attachmentBuilt,
    sidecarStatus: input.sidecarStatus,
    validationReason: input.validationReason,
    requestId: input.requestId,
    requestType: input.requestType,
    timestamp: clock().toISOString(),
    affectsRuntimeFinalStatus: false,
    affectsRuntimeRouting: false,
    affectsPrimaryGatewayResult: false,
    writesFiles: false,
    persistsAudit: false,
    containsRawPrompt: false,
    containsRawArtifacts: false,
    containsSecrets: false,
    warnings: input.warnings
      .map(sanitizeHermesRuntimeShadowAuditText)
      .filter((w): w is string => Boolean(w)),
  };
}

export async function buildHermesRuntimeShadowAttachmentFromRequest(input: {
  request: ExecutionRequest;
  config?: CliAdapterConfig;
  env?: Record<string, string | undefined>;
  runner?: HermesCliProcessRunner;
}): Promise<HermesRuntimeShadowAttachmentBuildResult | undefined> {
  const env = input.env ?? process.env;

  if (!isHermesRuntimeAttachmentEnabled(env)) {
    return undefined;
  }

  const sidecarResult = await runHermesGatewayShadowSidecar({
    request: input.request,
    config: input.config,
    env,
    runner: input.runner,
  });

  const attachment = buildHermesRuntimeShadowAttachment({
    sidecarResult,
    env,
  });

  const validation = validateHermesRuntimeAttachment({
    sidecarResult,
    env,
  });

  return {
    adapter: "hermes",
    source: "hermes_runtime_shadow_attachment_helper",
    requestId: input.request.requirementId,
    requestType: input.request.type,
    enabled: true,
    sidecarExecuted: sidecarResult.executed,
    attachmentBuilt: Boolean(attachment),
    sidecarStatus: sidecarResult.status,
    validationReason: validation.reason,
    attachment,
    auditMetadata: buildHermesRuntimeShadowAttachmentAuditMetadata({
      requestId: input.request.requirementId,
      requestType: input.request.type,
      enabled: true,
      attached: Boolean(attachment),
      sidecarExecuted: sidecarResult.executed,
      attachmentBuilt: Boolean(attachment),
      sidecarStatus: sidecarResult.status,
      validationReason: validation.reason,
      warnings: [...sidecarResult.warnings, ...validation.warnings],
    }),
    affectsRuntimeFinalStatus: false,
    affectsRuntimeRouting: false,
    affectsPrimaryGatewayResult: false,
    writesFiles: false,
    persistsAudit: false,
    containsRawPrompt: false,
    containsRawArtifacts: false,
    containsSecrets: false,
    warnings: [...sidecarResult.warnings, ...validation.warnings],
  };
}
