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
