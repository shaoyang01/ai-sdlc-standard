// Hermes Runtime Shadow Attachment Final Readiness Review
// =========================================================
// Review-only. Summarizes the Hermes runtime shadow attachment stack
// and declares readiness verdict and constraints.
// No runtime, no Gateway, no CLI.

export type HermesRuntimeShadowAttachmentReadinessVerdict =
  | "READY_WITH_CONSTRAINTS"
  | "NOT_READY";

export interface HermesRuntimeShadowAttachmentReadinessReview {
  name: "Hermes Runtime Shadow Attachment Final Readiness Review";
  adapter: "hermes";
  scope: "runtime_shadow_attachment";
  verdict: HermesRuntimeShadowAttachmentReadinessVerdict;
  runtimeActiveByDefault: false;
  wiredToRuntime: true;
  wiredToGateway: false;
  gatewayPrimaryDispatchChanged: false;
  runtimeFinalStatusChanged: false;
  runtimeRoutingChanged: false;
  primaryGatewayResultAffected: false;
  defaultDisabled: true;
  omittedWhenDisabled: true;
  neverUndefinedKey: true;
  usesFakeBuilderInTests: true;
  usesFakeRunnerInTests: true;
  invokesRealHermesCliInTests: false;
  persistsAudit: false;
  writesFiles: false;
  containsRawPrompt: false;
  containsRawArtifacts: false;
  containsSecrets: false;
  hasAuditMetadata: true;
  hasObservabilitySummary: true;
  recommendedNextPr: "Hermes Gateway Real Dispatch Contract";
  constraints: string[];
  evidence: string[];
}

export const HERMES_RUNTIME_SHADOW_ATTACHMENT_READINESS_REVIEW: HermesRuntimeShadowAttachmentReadinessReview = {
  name: "Hermes Runtime Shadow Attachment Final Readiness Review",
  adapter: "hermes",
  scope: "runtime_shadow_attachment",
  verdict: "READY_WITH_CONSTRAINTS",
  runtimeActiveByDefault: false,
  wiredToRuntime: true,
  wiredToGateway: false,
  gatewayPrimaryDispatchChanged: false,
  runtimeFinalStatusChanged: false,
  runtimeRoutingChanged: false,
  primaryGatewayResultAffected: false,
  defaultDisabled: true,
  omittedWhenDisabled: true,
  neverUndefinedKey: true,
  usesFakeBuilderInTests: true,
  usesFakeRunnerInTests: true,
  invokesRealHermesCliInTests: false,
  persistsAudit: false,
  writesFiles: false,
  containsRawPrompt: false,
  containsRawArtifacts: false,
  containsSecrets: false,
  hasAuditMetadata: true,
  hasObservabilitySummary: true,
  recommendedNextPr: "Hermes Gateway Real Dispatch Contract",
  constraints: [
    "Hermes is still not wired to primary Gateway dispatch.",
    "Hermes real dispatch must remain behind separate Gateway real dispatch contract.",
    "Runtime sidecar metadata must remain optional and omitted when disabled.",
    "No Runtime final_status or routing may depend on Hermes sidecar output.",
    "No persisted audit or observability is allowed without a separate contract.",
  ],
  evidence: [
    "core/hermes-runtime-shadow-attachment.ts",
    "tests/hermes-runtime-shadow-attachment.test.ts",
    "tests/runtime-hermes-shadow-attachment.test.ts",
    "core/hermes-runtime-shadow-attachment-wiring-contract.ts",
    "tests/hermes-runtime-shadow-attachment-wiring-contract.test.ts",
    "HERMES_RUNTIME_SHADOW_ATTACHMENT_READINESS_REVIEW.md",
    "hermes-runtime-shadow-attachment-readiness-review.json",
  ],
};
