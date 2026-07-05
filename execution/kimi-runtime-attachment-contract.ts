// Kimi Runtime Attachment Contract
// ====================================
// Contract-only. Defines safe runtime attachment rules for Kimi Gateway Shadow Sidecar.
// Does NOT attach to runtime.ts. Does NOT modify Gateway. Does NOT execute CLI.

import type { ExecutionRequest } from "./types";
import type { KimiGatewayShadowSidecar } from "./kimi-gateway-shadow-sidecar";

export type KimiRuntimeAttachmentDecision =
  | "attachment_disabled"
  | "sidecar_absent"
  | "sidecar_attached_contract_only"
  | "sidecar_rejected_invalid";

export interface KimiRuntimeShadowAttachment {
  enabled: boolean;
  decision: KimiRuntimeAttachmentDecision;
  requestId: string;
  sidecar?: KimiGatewayShadowSidecar;
  primaryRuntimeUnchanged: true;
  primaryGatewayUnchanged: true;
  affectsFinalStatus: false;
  affectsRouting: false;
  affectsAgentSelection: false;
  persistsAudit: false;
  writesFiles: false;
  warnings: string[];
}

export function isKimiRuntimeAttachmentEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.SDLC_KIMI_RUNTIME_ATTACHMENT === "enabled";
}

export function validateKimiGatewayShadowSidecarForRuntimeAttachment(
  sidecar: KimiGatewayShadowSidecar | undefined
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (!sidecar) {
    return { valid: false, warnings: ["Sidecar is undefined"] };
  }
  if (sidecar.primaryGatewayUnchanged !== true) {
    warnings.push("primaryGatewayUnchanged is not true");
  }
  if (sidecar.affectsFinalStatus !== false) {
    warnings.push("affectsFinalStatus is not false");
  }
  if (sidecar.affectsRouting !== false) {
    warnings.push("affectsRouting is not false");
  }
  if (sidecar.wiredToRuntime !== false) {
    warnings.push("wiredToRuntime is not false");
  }
  return { valid: warnings.length === 0, warnings };
}

export function buildKimiRuntimeShadowAttachment(input: {
  request: ExecutionRequest;
  sidecar?: KimiGatewayShadowSidecar;
  env?: Record<string, string | undefined>;
}): KimiRuntimeShadowAttachment {
  const env = input.env ?? process.env;
  const base = {
    requestId: input.request.requirementId,
    primaryRuntimeUnchanged: true as const,
    primaryGatewayUnchanged: true as const,
    affectsFinalStatus: false as const,
    affectsRouting: false as const,
    affectsAgentSelection: false as const,
    persistsAudit: false as const,
    writesFiles: false as const,
    warnings: [] as string[],
  };

  if (!isKimiRuntimeAttachmentEnabled(env)) {
    return {
      ...base, enabled: false, decision: "attachment_disabled",
      warnings: ["Kimi runtime attachment disabled"],
    };
  }

  if (!input.sidecar) {
    return {
      ...base, enabled: true, decision: "sidecar_absent",
      warnings: ["Kimi sidecar absent"],
    };
  }

  const validation = validateKimiGatewayShadowSidecarForRuntimeAttachment(input.sidecar);
  if (!validation.valid) {
    return {
      ...base, enabled: true, decision: "sidecar_rejected_invalid",
      warnings: validation.warnings,
    };
  }

  return {
    ...base, enabled: true, decision: "sidecar_attached_contract_only",
    sidecar: input.sidecar,
    warnings: ["Contract only; runtime attachment not wired"],
  };
}
