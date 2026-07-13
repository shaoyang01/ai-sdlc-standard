// Hermes Gateway Real Dispatch Final Readiness Review
// ===================================================
// Review-only static artifact. No Runtime, Gateway, CLI, filesystem, or network imports.

export type HermesGatewayRealDispatchReadinessVerdict =
  | "READY_WITH_CONSTRAINTS"
  | "NOT_READY";

export interface HermesGatewayRealDispatchReadinessReview {
  name: "Hermes Gateway Real Dispatch Final Readiness Review";
  adapter: "hermes";
  scope: "gateway_real_dispatch_sidecar";
  verdict: HermesGatewayRealDispatchReadinessVerdict;
  runtimeActiveByDefault: false;
  gatewayActiveByDefault: false;
  wiredToGateway: true;
  wiredToRuntime: false;
  gatewayField: "hermes_gateway_real_dispatch";
  fallbackPolicyField: "fallbackPolicy";
  observabilityField: "observability";
  guardrailsField: "guardrails";
  defaultDisabled: true;
  featureFlagged: true;
  requiresMultipleFlags: true;
  supportedRequestTypes: readonly ["review", "code_review", "validation"];
  unsupportedRequestTypes: readonly ["llm_task", "code_generation", "bugfix"];
  disabledDoesNotCallDispatcher: true;
  unsupportedDoesNotCallDispatcher: true;
  unsafeResultOmitted: true;
  dispatcherExceptionOmitted: true;
  neverUndefinedKey: true;
  topLevelFallbackField: false;
  topLevelObservabilityField: false;
  topLevelGuardrailsField: false;
  changesGatewayPrimaryDispatch: false;
  changesGatewayFinalResult: false;
  changesRuntimeFinalStatus: false;
  changesRuntimeRouting: false;
  affectsPrimaryGatewayResult: false;
  makesHermesDefault: false;
  makesHermesFinalReviewOwner: false;
  makesHermesFinalValidationOwner: false;
  usesFakeDispatcherInTests: true;
  usesFakeRunnerInTests: true;
  invokesRealHermesCliInTests: false;
  writesFiles: false;
  persistsAudit: false;
  persistsObservability: false;
  persistsGuardrails: false;
  containsRawPrompt: false;
  containsRawArtifacts: false;
  containsSecrets: false;
  fallbackPolicyImplemented: true;
  observabilityImplemented: true;
  guardrailsImplemented: true;
  readinessConstraints: string[];
  evidence: string[];
  recommendedNextPr: "Hermes Gateway Real Dispatch Controlled Rollout Plan";
}

export const HERMES_GATEWAY_REAL_DISPATCH_READINESS_REVIEW: HermesGatewayRealDispatchReadinessReview = {
  name: "Hermes Gateway Real Dispatch Final Readiness Review",
  adapter: "hermes",
  scope: "gateway_real_dispatch_sidecar",
  verdict: "READY_WITH_CONSTRAINTS",
  runtimeActiveByDefault: false,
  gatewayActiveByDefault: false,
  wiredToGateway: true,
  wiredToRuntime: false,
  gatewayField: "hermes_gateway_real_dispatch",
  fallbackPolicyField: "fallbackPolicy",
  observabilityField: "observability",
  guardrailsField: "guardrails",
  defaultDisabled: true,
  featureFlagged: true,
  requiresMultipleFlags: true,
  supportedRequestTypes: ["review", "code_review", "validation"],
  unsupportedRequestTypes: ["llm_task", "code_generation", "bugfix"],
  disabledDoesNotCallDispatcher: true,
  unsupportedDoesNotCallDispatcher: true,
  unsafeResultOmitted: true,
  dispatcherExceptionOmitted: true,
  neverUndefinedKey: true,
  topLevelFallbackField: false,
  topLevelObservabilityField: false,
  topLevelGuardrailsField: false,
  changesGatewayPrimaryDispatch: false,
  changesGatewayFinalResult: false,
  changesRuntimeFinalStatus: false,
  changesRuntimeRouting: false,
  affectsPrimaryGatewayResult: false,
  makesHermesDefault: false,
  makesHermesFinalReviewOwner: false,
  makesHermesFinalValidationOwner: false,
  usesFakeDispatcherInTests: true,
  usesFakeRunnerInTests: true,
  invokesRealHermesCliInTests: false,
  writesFiles: false,
  persistsAudit: false,
  persistsObservability: false,
  persistsGuardrails: false,
  containsRawPrompt: false,
  containsRawArtifacts: false,
  containsSecrets: false,
  fallbackPolicyImplemented: true,
  observabilityImplemented: true,
  guardrailsImplemented: true,
  readinessConstraints: [
    "Hermes remains sidecar metadata only and does not own primary Gateway result.",
    "Hermes must remain default-off and feature-flagged.",
    "Hermes may only run for review/code_review/validation request types.",
    "Hermes output must not become final review or validation decision without a separate contract.",
    "Unsafe or unbounded Hermes sidecar metadata must be omitted.",
    "No persisted audit, observability, or guardrail logs are allowed without a separate contract.",
    "No Runtime final_status or routing may depend on Hermes Gateway sidecar output.",
  ],
  evidence: [
    "execution/gateway.ts",
    "execution/hermes-gateway-real-dispatch.ts",
    "execution/hermes-gateway-real-dispatch-contract.ts",
    "execution/hermes-gateway-real-dispatch-gateway-integration-contract.ts",
    "execution/hermes-gateway-real-dispatch-fallback-policy.ts",
    "execution/hermes-gateway-real-dispatch-observability.ts",
    "execution/hermes-gateway-real-dispatch-guardrails.ts",
    "tests/hermes-gateway-real-dispatch.test.ts",
    "tests/hermes-gateway-real-dispatch-gateway-integration.test.ts",
    "tests/hermes-gateway-real-dispatch-fallback-policy.test.ts",
    "tests/hermes-gateway-real-dispatch-observability.test.ts",
    "tests/hermes-gateway-real-dispatch-guardrails.test.ts",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_READINESS_REVIEW.md",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-readiness-review.json",
  ],
  recommendedNextPr: "Hermes Gateway Real Dispatch Controlled Rollout Plan",
};
