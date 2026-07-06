// Hermes Gateway Real Dispatch Rollout Validation Checklist
// =========================================================
// Checklist-only static artifact. No Runtime, Gateway, CLI, filesystem, or network imports.

export type HermesGatewayRealDispatchRolloutValidationChecklistStatus =
  | "checklist_only"
  | "not_started";

export type HermesGatewayRealDispatchRolloutValidationGateStatus =
  | "required"
  | "planned";

export type HermesGatewayRealDispatchRolloutValidationGateCategory =
  | "non_execution"
  | "feature_flags"
  | "request_scope"
  | "gateway_runtime_safety"
  | "sidecar_metadata_safety"
  | "test_safety"
  | "rollback_readiness"
  | "operator_approval";

export interface HermesGatewayRealDispatchRolloutValidationGate {
  id: string;
  category: HermesGatewayRealDispatchRolloutValidationGateCategory;
  status: HermesGatewayRealDispatchRolloutValidationGateStatus;
  requiredBeforeOperatorEnablement: true;
  executingNow: false;
  enablesFeatureFlagsNow: false;
  changesRuntimeBehaviorNow: false;
  changesGatewayBehaviorNow: false;
  description: string;
  validationMethod: string;
  passCriteria: readonly string[];
  failCriteria: readonly string[];
}

export interface HermesGatewayRealDispatchRolloutValidationChecklist {
  name: "Hermes Gateway Real Dispatch Rollout Validation Checklist";
  adapter: "hermes";
  scope: "gateway_real_dispatch_sidecar_rollout_validation";
  status: HermesGatewayRealDispatchRolloutValidationChecklistStatus;
  checklistOnly: true;
  executingNow: false;
  enablesFeatureFlagsNow: false;
  changesRuntimeBehaviorNow: false;
  changesGatewayBehaviorNow: false;
  readinessVerdictRequired: "READY_WITH_CONSTRAINTS";
  rolloutPlanStatusRequired: "plan_only";
  currentReadinessVerdict: "READY_WITH_CONSTRAINTS";
  currentRolloutPlanStatus: "plan_only";
  gatewayField: "hermes_gateway_real_dispatch";
  fallbackPolicyField: "fallbackPolicy";
  observabilityField: "observability";
  guardrailsField: "guardrails";
  defaultDisabled: true;
  featureFlagged: true;
  requiresMultipleFlags: true;
  requiredFlags: readonly [
    "SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled",
    "SDLC_HERMES_GATEWAY_INTEGRATION=enabled",
    "SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled"
  ];
  initialValidationRequestTypes: readonly ["review"];
  supportedRequestTypes: readonly ["review", "code_review", "validation"];
  unsupportedRequestTypes: readonly ["llm_task", "code_generation", "bugfix"];
  changesGatewayPrimaryDispatch: false;
  changesGatewayFinalResult: false;
  changesRuntimeFinalStatus: false;
  changesRuntimeRouting: false;
  affectsPrimaryGatewayResult: false;
  makesHermesDefault: false;
  makesHermesFinalReviewOwner: false;
  makesHermesFinalValidationOwner: false;
  writesFiles: false;
  persistsValidationLogs: false;
  persistsRolloutLogs: false;
  persistsAudit: false;
  persistsObservability: false;
  persistsGuardrails: false;
  containsRawPrompt: false;
  containsRawArtifacts: false;
  containsSecrets: false;
  validationGates: readonly HermesGatewayRealDispatchRolloutValidationGate[];
  requiredGateCount: number;
  operatorApprovalRequired: true;
  rolloutMayProceedAutomatically: false;
  automaticEnablementAllowed: false;
  globalFailureCriteria: readonly string[];
  checklistConstraints: readonly string[];
  evidence: readonly string[];
  recommendedNextPr: "Hermes Gateway Real Dispatch Operator Runbook";
}

const commonGateGuards = {
  status: "required" as const,
  requiredBeforeOperatorEnablement: true as const,
  executingNow: false as const,
  enablesFeatureFlagsNow: false as const,
  changesRuntimeBehaviorNow: false as const,
  changesGatewayBehaviorNow: false as const,
};

const validationGates: readonly HermesGatewayRealDispatchRolloutValidationGate[] = [
  {
    id: "non_execution_guard",
    category: "non_execution",
    ...commonGateGuards,
    description: "Validate this checklist does not execute rollout, enable flags, call CLI, or mutate runtime state.",
    validationMethod: "Static review of checklist artifacts, metadata, package scripts, and forbidden implementation files.",
    passCriteria: [
      "Checklist PR contains only checklist artifacts, metadata, and tests.",
      "Runtime and Gateway implementation files are unchanged.",
      "No feature flags are enabled by default.",
    ],
    failCriteria: [
      "Runtime or Gateway behavior changes.",
      "Any rollout execution is introduced.",
      "Any CLI invocation is added to tests.",
    ],
  },
  {
    id: "feature_flag_gate",
    category: "feature_flags",
    ...commonGateGuards,
    description: "Validate Hermes dispatch still requires all explicit Hermes flags.",
    validationMethod: "Compare required flag metadata and checklist artifacts against the three-flag dispatch contract.",
    passCriteria: [
      "Required flags remain exactly three.",
      "No default-on flag behavior exists.",
      "Operator enablement requires explicit environment configuration.",
    ],
    failCriteria: [
      "Any required flag is removed.",
      "Any flag becomes default enabled.",
      "Any new production flag path bypasses the three-flag gate.",
    ],
  },
  {
    id: "request_scope_gate",
    category: "request_scope",
    ...commonGateGuards,
    description: "Validate initial validation is review-only and unsupported request types never call dispatcher.",
    validationMethod: "Static metadata review plus existing fake dispatcher coverage for supported and unsupported request types.",
    passCriteria: [
      "Initial validation request types equal review only.",
      "Supported request types remain review/code_review/validation.",
      "Unsupported request types remain llm_task/code_generation/bugfix.",
    ],
    failCriteria: [
      "Initial validation includes code_review or validation without approval.",
      "llm_task/code_generation/bugfix can trigger Hermes dispatcher.",
    ],
  },
  {
    id: "gateway_runtime_safety_gate",
    category: "gateway_runtime_safety",
    ...commonGateGuards,
    description: "Validate Hermes sidecar cannot affect Gateway primary/final result or Runtime final_status/routing.",
    validationMethod: "Review sidecar-only metadata contracts and Gateway integration tests for primary result preservation.",
    passCriteria: [
      "Gateway primary dispatch remains unchanged.",
      "Gateway final result remains unchanged.",
      "Runtime final_status and routing remain independent of Hermes sidecar.",
    ],
    failCriteria: [
      "Hermes sidecar output changes primary Gateway result.",
      "Hermes sidecar output changes Runtime final_status/routing.",
    ],
  },
  {
    id: "sidecar_metadata_safety_gate",
    category: "sidecar_metadata_safety",
    ...commonGateGuards,
    description: "Validate fallbackPolicy, observability, and guardrails remain nested sidecar metadata only.",
    validationMethod: "Static artifact review plus existing sidecar field and raw-leak regression tests.",
    passCriteria: [
      "Sidecar field remains hermes_gateway_real_dispatch.",
      "fallbackPolicy/observability/guardrails are nested under sidecar only.",
      "No top-level fallback/observability/guardrails fields exist.",
      "No raw prompt/artifact/secret appears in sidecar metadata.",
    ],
    failCriteria: [
      "Any top-level metadata field appears.",
      "Any raw prompt/artifact/secret appears.",
    ],
  },
  {
    id: "test_safety_gate",
    category: "test_safety",
    ...commonGateGuards,
    description: "Validate tests use fake dispatcher/fake runner only and never call real Hermes CLI.",
    validationMethod: "Review test runners, injected fakes, and forbidden CLI invocation assertions.",
    passCriteria: [
      "Fake dispatcher tests remain present.",
      "Fake runner tests remain present.",
      "No real Hermes CLI is invoked in tests.",
    ],
    failCriteria: [
      "Tests invoke real Hermes CLI.",
      "Tests require external services.",
    ],
  },
  {
    id: "rollback_readiness_gate",
    category: "rollback_readiness",
    ...commonGateGuards,
    description: "Validate rollback criteria are defined before any operator enablement.",
    validationMethod: "Review global failure criteria and rollout plan rollback criteria coverage.",
    passCriteria: [
      "Rollback criteria include primary Gateway result change.",
      "Rollback criteria include Runtime final_status/routing change.",
      "Rollback criteria include raw prompt/artifact/secret leakage.",
      "Rollback criteria include unsupported request type dispatcher invocation.",
    ],
    failCriteria: [
      "Rollback criteria are absent.",
      "Rollback criteria omit Gateway/Runtime safety violations.",
    ],
  },
  {
    id: "operator_approval_gate",
    category: "operator_approval",
    ...commonGateGuards,
    description: "Validate no rollout can proceed automatically.",
    validationMethod: "Review checklist metadata for explicit operator approval and automatic enablement denial.",
    passCriteria: [
      "Operator approval is required.",
      "rolloutMayProceedAutomatically is false.",
      "automaticEnablementAllowed is false.",
    ],
    failCriteria: [
      "Any automatic enablement path is introduced.",
      "Any phase proceeds without operator approval.",
    ],
  },
];

export const HERMES_GATEWAY_REAL_DISPATCH_ROLLOUT_VALIDATION_CHECKLIST: HermesGatewayRealDispatchRolloutValidationChecklist = {
  name: "Hermes Gateway Real Dispatch Rollout Validation Checklist",
  adapter: "hermes",
  scope: "gateway_real_dispatch_sidecar_rollout_validation",
  status: "checklist_only",
  checklistOnly: true,
  executingNow: false,
  enablesFeatureFlagsNow: false,
  changesRuntimeBehaviorNow: false,
  changesGatewayBehaviorNow: false,
  readinessVerdictRequired: "READY_WITH_CONSTRAINTS",
  rolloutPlanStatusRequired: "plan_only",
  currentReadinessVerdict: "READY_WITH_CONSTRAINTS",
  currentRolloutPlanStatus: "plan_only",
  gatewayField: "hermes_gateway_real_dispatch",
  fallbackPolicyField: "fallbackPolicy",
  observabilityField: "observability",
  guardrailsField: "guardrails",
  defaultDisabled: true,
  featureFlagged: true,
  requiresMultipleFlags: true,
  requiredFlags: [
    "SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled",
    "SDLC_HERMES_GATEWAY_INTEGRATION=enabled",
    "SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled",
  ],
  initialValidationRequestTypes: ["review"],
  supportedRequestTypes: ["review", "code_review", "validation"],
  unsupportedRequestTypes: ["llm_task", "code_generation", "bugfix"],
  changesGatewayPrimaryDispatch: false,
  changesGatewayFinalResult: false,
  changesRuntimeFinalStatus: false,
  changesRuntimeRouting: false,
  affectsPrimaryGatewayResult: false,
  makesHermesDefault: false,
  makesHermesFinalReviewOwner: false,
  makesHermesFinalValidationOwner: false,
  writesFiles: false,
  persistsValidationLogs: false,
  persistsRolloutLogs: false,
  persistsAudit: false,
  persistsObservability: false,
  persistsGuardrails: false,
  containsRawPrompt: false,
  containsRawArtifacts: false,
  containsSecrets: false,
  validationGates,
  requiredGateCount: validationGates.length,
  operatorApprovalRequired: true,
  rolloutMayProceedAutomatically: false,
  automaticEnablementAllowed: false,
  globalFailureCriteria: [
    "Runtime or Gateway implementation files change in this checklist PR.",
    "Any Hermes feature flag becomes enabled by default.",
    "Any real Hermes CLI invocation is introduced in tests.",
    "Any unsupported request type can invoke Hermes dispatcher.",
    "Any Hermes sidecar output changes Gateway primary result.",
    "Any Hermes sidecar output changes Gateway final result.",
    "Any Hermes sidecar output changes Runtime final_status or routing.",
    "Any raw prompt, raw artifact, or secret appears in sidecar metadata.",
    "Any validation, rollout, audit, observability, or guardrail log is persisted without a separate contract.",
    "Any automatic rollout or automatic feature flag enablement path is introduced.",
  ],
  checklistConstraints: [
    "This PR is checklist-only and does not execute rollout.",
    "This PR does not enable Hermes feature flags.",
    "Hermes remains Gateway sidecar metadata only.",
    "Hermes remains default-off and requires explicit flags.",
    "Initial validation is review-only.",
    "Expansion to code_review and validation requires operator approval.",
    "Hermes must not become final review or validation owner without a separate contract.",
    "Runtime final_status and routing must not depend on Hermes sidecar output.",
    "No validation, rollout, audit, observability, or guardrail logs may persist without a separate contract.",
    "No rollout may proceed automatically.",
  ],
  evidence: [
    "execution/hermes-gateway-real-dispatch-readiness-review.ts",
    "execution/hermes-gateway-real-dispatch-controlled-rollout-plan.ts",
    "HERMES_GATEWAY_REAL_DISPATCH_READINESS_REVIEW.md",
    "HERMES_GATEWAY_REAL_DISPATCH_CONTROLLED_ROLLOUT_PLAN.md",
    "hermes-gateway-real-dispatch-readiness-review.json",
    "hermes-gateway-real-dispatch-controlled-rollout-plan.json",
    "execution/hermes-gateway-real-dispatch-rollout-validation-checklist.ts",
    "tests/hermes-gateway-real-dispatch-rollout-validation-checklist.test.ts",
    "HERMES_GATEWAY_REAL_DISPATCH_ROLLOUT_VALIDATION_CHECKLIST.md",
    "hermes-gateway-real-dispatch-rollout-validation-checklist.json",
  ],
  recommendedNextPr: "Hermes Gateway Real Dispatch Operator Runbook",
};
