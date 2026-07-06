// Hermes Runtime Shadow Attachment Wiring Contract
// ====================================================
// Contract-only. Defines how Hermes runtime shadow attachment
// may later be wired into RuntimeResult.
// Does NOT modify runtime.ts. Does NOT change RuntimeResult shape.

import type { HermesRuntimeShadowAttachmentBuildResult } from "./hermes-runtime-shadow-attachment";
import {
  isHermesRuntimeAttachmentEnabled,
  HERMES_RUNTIME_ATTACHMENT_FLAG,
} from "../execution/hermes-runtime-attachment-contract";

export const HERMES_RUNTIME_WIRING_CONTRACT_STATUS = "contract_only";
export const HERMES_RUNTIME_ATTACHMENT_FIELD = "hermes_runtime_shadow_attachment";
export const HERMES_RUNTIME_ATTACHMENT_WIRING_FLAG = HERMES_RUNTIME_ATTACHMENT_FLAG;

export type HermesRuntimeWiringDecision =
  | "wiring_disabled"
  | "missing_attachment"
  | "safe_to_attach_contract_only"
  | "unsafe_attachment";

export interface HermesRuntimeWiringContractResult {
  adapter: "hermes";
  source: "hermes_runtime_shadow_attachment_wiring_contract";
  contractOnly: true;
  decision: HermesRuntimeWiringDecision;
  runtimeField: "hermes_runtime_shadow_attachment";
  enabled: boolean;
  mayAttach: boolean;
  attachmentPresent: boolean;
  affectsRuntimeFinalStatus: false;
  affectsRuntimeRouting: false;
  affectsPrimaryGatewayResult: false;
  changesRuntimeResultShapeNow: false;
  writesFiles: false;
  persistsAudit: false;
  containsRawPrompt: false;
  containsRawArtifacts: false;
  containsSecrets: false;
  warnings: string[];
}

export const HERMES_RUNTIME_ATTACHMENT_WIRING_RULES = {
  fieldName: "hermes_runtime_shadow_attachment",
  conditionalFieldOnly: true,
  omitWhenDisabled: true,
  neverUseUndefinedKey: true,
  mustNotChangeFinalStatus: true,
  mustNotChangeRuntimeRouting: true,
  mustNotAffectPrimaryGatewayResult: true,
  mustNotMergeIntoArtifacts: true,
  mustNotPersistAudit: true,
  mustNotWriteFiles: true,
  requiresFeatureFlag: "SDLC_HERMES_RUNTIME_ATTACHMENT=enabled",
} as const;

export function evaluateHermesRuntimeShadowAttachmentWiringContract(input: {
  attachment?: HermesRuntimeShadowAttachmentBuildResult;
  env?: Record<string, string | undefined>;
}): HermesRuntimeWiringContractResult {
  const env = input.env ?? process.env;

  const base = {
    adapter: "hermes" as const,
    source: "hermes_runtime_shadow_attachment_wiring_contract" as const,
    contractOnly: true as const,
    runtimeField: "hermes_runtime_shadow_attachment" as const,
    affectsRuntimeFinalStatus: false as const,
    affectsRuntimeRouting: false as const,
    affectsPrimaryGatewayResult: false as const,
    changesRuntimeResultShapeNow: false as const,
    writesFiles: false as const,
    persistsAudit: false as const,
    containsRawPrompt: false as const,
    containsRawArtifacts: false as const,
    containsSecrets: false as const,
  };

  // Wiring disabled
  if (!isHermesRuntimeAttachmentEnabled(env)) {
    return {
      ...base,
      decision: "wiring_disabled", enabled: false,
      mayAttach: false, attachmentPresent: false,
      warnings: ["Hermes runtime attachment wiring disabled"],
    };
  }

  // Missing attachment
  if (!input.attachment) {
    return {
      ...base,
      decision: "missing_attachment", enabled: true,
      mayAttach: false, attachmentPresent: false,
      warnings: ["No attachment result available"],
    };
  }

  const a = input.attachment;

  // Unsafe attachment check
  const unsafeWarnings: string[] = [];
  if (a.affectsRuntimeFinalStatus !== false) unsafeWarnings.push("affectsRuntimeFinalStatus not false");
  if (a.affectsRuntimeRouting !== false) unsafeWarnings.push("affectsRuntimeRouting not false");
  if (a.affectsPrimaryGatewayResult !== false) unsafeWarnings.push("affectsPrimaryGatewayResult not false");
  if (a.writesFiles !== false) unsafeWarnings.push("writesFiles not false");
  if (a.persistsAudit !== false) unsafeWarnings.push("persistsAudit not false");
  if (a.containsRawPrompt !== false) unsafeWarnings.push("containsRawPrompt not false");
  if (a.containsRawArtifacts !== false) unsafeWarnings.push("containsRawArtifacts not false");
  if (a.containsSecrets !== false) unsafeWarnings.push("containsSecrets not false");

  if (unsafeWarnings.length > 0) {
    return {
      ...base,
      decision: "unsafe_attachment", enabled: true,
      mayAttach: false, attachmentPresent: true,
      warnings: unsafeWarnings,
    };
  }

  // Safe to attach (contract-only)
  return {
    ...base,
    decision: "safe_to_attach_contract_only", enabled: true,
    mayAttach: true, attachmentPresent: true,
    warnings: ["Contract only; not wired to Runtime"],
  };
}
