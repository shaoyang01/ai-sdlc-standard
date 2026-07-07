// Hermes Gateway Real Dispatch Phase-2 Expansion Contract
// =========================================================
// Contract-only static artifact. No Runtime, Gateway, CLI, filesystem, network, or process imports.
// This module does not execute phase-2 expansion.

export type HermesGatewayRealDispatchPhase2ExpansionContractStatus =
  | "contract_only"
  | "not_started";

export type HermesGatewayRealDispatchPhase2ExpansionTarget =
  | "code_review"
  | "validation";

export type HermesGatewayRealDispatchPhase2ExpansionGateCategory =
  | "post_enablement_review"
  | "request_scope"
  | "sidecar_safety"
  | "gateway_runtime_safety"
  | "ownership_boundary"
  | "operator_approval"
  | "rollback";

export interface HermesGatewayRealDispatchPhase2ExpansionGate {
  id: string;
  category: HermesGatewayRealDispatchPhase2ExpansionGateCategory;
  status: "required";
  requiredBeforeExpansion: true;
  executingNow: false;
  expandsRequestTypesNow: false;
  enablesFeatureFlagsNow: false;
  changesRuntimeBehaviorNow: false;
  changesGatewayBehaviorNow: false;
  targetRequestTypes: readonly HermesGatewayRealDispatchPhase2ExpansionTarget[];
  description: string;
  passCriteria: readonly string[];
  failCriteria: readonly string[];
}

export interface HermesGatewayRealDispatchPhase2TargetContract {
  requestType: HermesGatewayRealDispatchPhase2ExpansionTarget;
  status: "contracted_not_enabled";
  eligibleForFutureOperatorValidation: true;
  enabledNow: false;
  executesNow: false;
  finalDecisionOwner: false;
  sidecarOnly: true;
  requiresSeparateOperatorApproval: true;
  requiresPostEnablementReviewForReviewScope: true;
  passCriteria: readonly string[];
  failCriteria: readonly string[];
}

export interface HermesGatewayRealDispatchPhase2ExpansionContract {
  name: "Hermes Gateway Real Dispatch Phase-2 Expansion Contract";
  adapter: "hermes";
  scope: "gateway_real_dispatch_sidecar_phase_2_expansion_contract";
  status: HermesGatewayRealDispatchPhase2ExpansionContractStatus;
  contractOnly: true;
  executingNow: false;
  expandsRequestTypesNow: false;
  enablesFeatureFlagsNow: false;
  changesRuntimeBehaviorNow: false;
  changesGatewayBehaviorNow: false;
  addsEnablementScripts: false;
  changesCiBehavior: false;
  readinessVerdictRequired: "READY_WITH_CONSTRAINTS";
  rolloutPlanStatusRequired: "plan_only";
  rolloutValidationChecklistStatusRequired: "checklist_only";
  operatorRunbookStatusRequired: "runbook_only";
  postEnablementReviewTemplateStatusRequired: "template_only";
  currentReadinessVerdict: "READY_WITH_CONSTRAINTS";
  currentRolloutPlanStatus: "plan_only";
  currentRolloutValidationChecklistStatus: "checklist_only";
  currentOperatorRunbookStatus: "runbook_only";
  currentPostEnablementReviewTemplateStatus: "template_only";
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
  currentValidatedRequestTypes: readonly ["review"];
  phase2ExpansionTargets: readonly ["code_review", "validation"];
  supportedRequestTypes: readonly ["review", "code_review", "validation"];
  unsupportedRequestTypes: readonly ["llm_task", "code_generation", "bugfix"];
  operatorApprovalRequired: true;
  automaticEnablementAllowed: false;
  rolloutMayProceedAutomatically: false;
  phase2MayProceedAutomatically: false;
  changesGatewayPrimaryDispatch: false;
  changesGatewayFinalResult: false;
  changesRuntimeFinalStatus: false;
  changesRuntimeRouting: false;
  affectsPrimaryGatewayResult: false;
  makesHermesDefault: false;
  makesHermesFinalReviewOwner: false;
  makesHermesFinalCodeReviewOwner: false;
  makesHermesFinalValidationOwner: false;
  writesFiles: false;
  persistsExpansionLogs: false;
  persistsReviewLogs: false;
  persistsRolloutLogs: false;
  persistsAudit: false;
  persistsObservability: false;
  persistsGuardrails: false;
  containsRawPrompt: false;
  containsRawArtifacts: false;
  containsSecrets: false;
  expansionTargets: readonly HermesGatewayRealDispatchPhase2TargetContract[];
  expansionGates: readonly HermesGatewayRealDispatchPhase2ExpansionGate[];
  requiredGateCount: number;
  contractConstraints: readonly string[];
  requiredPostEnablementEvidence: readonly string[];
  disallowedExpansionEvidence: readonly string[];
  allowedPhase2Outcomes: readonly string[];
  evidence: readonly string[];
  recommendedNextPr: "Hermes Gateway Real Dispatch Phase-2 Validation Checklist";
}

const commonTargetGuards = {
  status: "contracted_not_enabled" as const,
  eligibleForFutureOperatorValidation: true as const,
  enabledNow: false as const,
  executesNow: false as const,
  finalDecisionOwner: false as const,
  sidecarOnly: true as const,
  requiresSeparateOperatorApproval: true as const,
  requiresPostEnablementReviewForReviewScope: true as const,
};

const commonGateGuards = {
  status: "required" as const,
  requiredBeforeExpansion: true as const,
  executingNow: false as const,
  expandsRequestTypesNow: false as const,
  enablesFeatureFlagsNow: false as const,
  changesRuntimeBehaviorNow: false as const,
  changesGatewayBehaviorNow: false as const,
  targetRequestTypes: ["code_review", "validation"] as const,
};

const expansionTargets: readonly HermesGatewayRealDispatchPhase2TargetContract[] = [
  {
    requestType: "code_review",
    ...commonTargetGuards,
    passCriteria: [
      "code_review remains sidecar-only.",
      "Hermes does not become final code review owner.",
      "Gateway primary/final result remains unchanged.",
      "Runtime final_status/routing remains unchanged.",
    ],
    failCriteria: [
      "code_review expansion enables Hermes by default.",
      "Hermes output becomes final code review decision.",
      "Hermes sidecar changes Gateway primary/final result.",
    ],
  },
  {
    requestType: "validation",
    ...commonTargetGuards,
    passCriteria: [
      "validation remains sidecar-only.",
      "Hermes does not become final validation owner.",
      "Gateway primary/final result remains unchanged.",
      "Runtime final_status/routing remains unchanged.",
    ],
    failCriteria: [
      "validation expansion enables Hermes by default.",
      "Hermes output becomes final validation decision.",
      "Hermes sidecar changes Gateway primary/final result.",
    ],
  },
];

const expansionGates: readonly HermesGatewayRealDispatchPhase2ExpansionGate[] = [
  {
    id: "post_enablement_review_gate",
    category: "post_enablement_review",
    ...commonGateGuards,
    description: "Confirm review-only post-enablement evidence is sanitized and complete before phase-2 expansion.",
    passCriteria: [
      "Review-only post-enablement review is completed.",
      "Review outcomes do not include rollback.",
      "Evidence contains no raw prompt, artifact, secret, stdout, stderr, or full CLI output.",
    ],
    failCriteria: [
      "Review-only phase is not reviewed.",
      "Review-only phase requires rollback.",
      "Raw or sensitive evidence is required for phase-2 decision.",
    ],
  },
  {
    id: "request_scope_gate",
    category: "request_scope",
    ...commonGateGuards,
    description: "Confirm phase-2 targets are only code_review and validation.",
    passCriteria: [
      "Expansion targets are exactly code_review and validation.",
      "llm_task, code_generation, and bugfix remain unsupported.",
    ],
    failCriteria: [
      "Any unsupported request type is added.",
      "bugfix is included in phase-2 expansion.",
    ],
  },
  {
    id: "sidecar_safety_gate",
    category: "sidecar_safety",
    ...commonGateGuards,
    description: "Confirm sidecar metadata remains bounded and nested.",
    passCriteria: [
      "fallbackPolicy, observability, and guardrails remain nested under hermes_gateway_real_dispatch.",
      "No top-level fallback/observability/guardrails fields are introduced.",
      "Raw prompt/artifact/secret collection remains disallowed.",
    ],
    failCriteria: [
      "Metadata is promoted to top-level fields.",
      "Raw prompt/artifact/secret is collected or persisted.",
    ],
  },
  {
    id: "gateway_runtime_safety_gate",
    category: "gateway_runtime_safety",
    ...commonGateGuards,
    description: "Confirm phase-2 expansion cannot affect Gateway or Runtime outcomes.",
    passCriteria: [
      "Gateway primary result remains unchanged.",
      "Gateway final result remains unchanged.",
      "Runtime final_status/routing remains unchanged.",
    ],
    failCriteria: [
      "Hermes sidecar changes Gateway primary/final result.",
      "Hermes sidecar changes Runtime final_status or routing.",
    ],
  },
  {
    id: "ownership_boundary_gate",
    category: "ownership_boundary",
    ...commonGateGuards,
    description: "Confirm Hermes remains advisory sidecar metadata, not final decision owner.",
    passCriteria: [
      "Hermes is not final review owner.",
      "Hermes is not final code_review owner.",
      "Hermes is not final validation owner.",
    ],
    failCriteria: [
      "Hermes output becomes final review/code_review/validation decision.",
      "Hermes becomes default or primary Gateway owner.",
    ],
  },
  {
    id: "operator_approval_gate",
    category: "operator_approval",
    ...commonGateGuards,
    description: "Confirm phase-2 expansion requires separate operator approval.",
    passCriteria: [
      "Operator approval is required before phase-2 validation.",
      "Phase-2 cannot proceed automatically.",
      "Automatic enablement is disallowed.",
    ],
    failCriteria: [
      "Any automatic expansion path is introduced.",
      "Any flag becomes enabled by default.",
    ],
  },
  {
    id: "rollback_gate",
    category: "rollback",
    ...commonGateGuards,
    description: "Confirm rollback criteria exist before phase-2 validation.",
    passCriteria: [
      "Rollback triggers include Gateway primary/final result changes.",
      "Rollback triggers include Runtime final_status/routing changes.",
      "Rollback triggers include raw prompt/artifact/secret leakage.",
      "Rollback triggers include repeated guardrail rejection.",
    ],
    failCriteria: [
      "Rollback criteria are missing.",
      "Rollback depends on raw sensitive evidence.",
    ],
  },
];

export const HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_EXPANSION_CONTRACT: HermesGatewayRealDispatchPhase2ExpansionContract = {
  name: "Hermes Gateway Real Dispatch Phase-2 Expansion Contract",
  adapter: "hermes",
  scope: "gateway_real_dispatch_sidecar_phase_2_expansion_contract",
  status: "contract_only",
  contractOnly: true,
  executingNow: false,
  expandsRequestTypesNow: false,
  enablesFeatureFlagsNow: false,
  changesRuntimeBehaviorNow: false,
  changesGatewayBehaviorNow: false,
  addsEnablementScripts: false,
  changesCiBehavior: false,
  readinessVerdictRequired: "READY_WITH_CONSTRAINTS",
  rolloutPlanStatusRequired: "plan_only",
  rolloutValidationChecklistStatusRequired: "checklist_only",
  operatorRunbookStatusRequired: "runbook_only",
  postEnablementReviewTemplateStatusRequired: "template_only",
  currentReadinessVerdict: "READY_WITH_CONSTRAINTS",
  currentRolloutPlanStatus: "plan_only",
  currentRolloutValidationChecklistStatus: "checklist_only",
  currentOperatorRunbookStatus: "runbook_only",
  currentPostEnablementReviewTemplateStatus: "template_only",
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
  currentValidatedRequestTypes: ["review"],
  phase2ExpansionTargets: ["code_review", "validation"],
  supportedRequestTypes: ["review", "code_review", "validation"],
  unsupportedRequestTypes: ["llm_task", "code_generation", "bugfix"],
  operatorApprovalRequired: true,
  automaticEnablementAllowed: false,
  rolloutMayProceedAutomatically: false,
  phase2MayProceedAutomatically: false,
  changesGatewayPrimaryDispatch: false,
  changesGatewayFinalResult: false,
  changesRuntimeFinalStatus: false,
  changesRuntimeRouting: false,
  affectsPrimaryGatewayResult: false,
  makesHermesDefault: false,
  makesHermesFinalReviewOwner: false,
  makesHermesFinalCodeReviewOwner: false,
  makesHermesFinalValidationOwner: false,
  writesFiles: false,
  persistsExpansionLogs: false,
  persistsReviewLogs: false,
  persistsRolloutLogs: false,
  persistsAudit: false,
  persistsObservability: false,
  persistsGuardrails: false,
  containsRawPrompt: false,
  containsRawArtifacts: false,
  containsSecrets: false,
  expansionTargets,
  expansionGates,
  requiredGateCount: expansionGates.length,
  contractConstraints: [
    "This PR is contract-only and does not execute phase-2 expansion.",
    "This PR does not change actual Gateway dispatch behavior.",
    "This PR does not enable Hermes feature flags.",
    "This PR does not add enablement scripts or CI behavior.",
    "Phase-2 targets are code_review and validation only.",
    "Current validated request type remains review only.",
    "Hermes remains Gateway sidecar metadata only.",
    "Hermes remains default-off and requires explicit flags.",
    "Hermes must not become final review, code_review, or validation owner without a separate ownership contract.",
    "Runtime final_status and routing must not depend on Hermes sidecar output.",
    "No expansion, review, rollout, audit, observability, or guardrail logs may persist without a separate contract.",
    "raw prompt, raw artifact, secret, stdout, stderr, full CLI output, and full warning text remain disallowed.",
    "No automatic phase-2 expansion or automatic enablement is allowed.",
  ],
  requiredPostEnablementEvidence: [
    "review-only post-enablement decision",
    "review-only attach/omit summary",
    "review-only fallbackPolicy reason/action summary",
    "review-only observability outcome/count summary",
    "review-only guardrail decision/check summary",
    "review-only rollback/escalation summary",
    "operator approval reference",
  ],
  disallowedExpansionEvidence: [
    "raw prompts",
    "raw artifacts",
    "secrets",
    "stdout",
    "stderr",
    "full Hermes CLI output",
    "full warning text",
    "customer data",
    "credentials",
    "tokens",
    "unsanitized review payloads",
  ],
  allowedPhase2Outcomes: [
    "remain_review_only",
    "proceed_to_phase_2_validation_checklist",
    "rollback",
  ],
  evidence: [
    "execution/hermes-gateway-real-dispatch-readiness-review.ts",
    "execution/hermes-gateway-real-dispatch-controlled-rollout-plan.ts",
    "execution/hermes-gateway-real-dispatch-rollout-validation-checklist.ts",
    "execution/hermes-gateway-real-dispatch-operator-runbook.ts",
    "execution/hermes-gateway-real-dispatch-post-enablement-review-template.ts",
    "HERMES_GATEWAY_REAL_DISPATCH_READINESS_REVIEW.md",
    "HERMES_GATEWAY_REAL_DISPATCH_CONTROLLED_ROLLOUT_PLAN.md",
    "HERMES_GATEWAY_REAL_DISPATCH_ROLLOUT_VALIDATION_CHECKLIST.md",
    "HERMES_GATEWAY_REAL_DISPATCH_OPERATOR_RUNBOOK.md",
    "HERMES_GATEWAY_REAL_DISPATCH_POST_ENABLEMENT_REVIEW_TEMPLATE.md",
    "hermes-gateway-real-dispatch-readiness-review.json",
    "hermes-gateway-real-dispatch-controlled-rollout-plan.json",
    "hermes-gateway-real-dispatch-rollout-validation-checklist.json",
    "hermes-gateway-real-dispatch-operator-runbook.json",
    "hermes-gateway-real-dispatch-post-enablement-review-template.json",
    "execution/hermes-gateway-real-dispatch-phase-2-expansion-contract.ts",
    "tests/hermes-gateway-real-dispatch-phase-2-expansion-contract.test.ts",
    "HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_EXPANSION_CONTRACT.md",
    "hermes-gateway-real-dispatch-phase-2-expansion-contract.json",
  ],
  recommendedNextPr: "Hermes Gateway Real Dispatch Phase-2 Validation Checklist",
};
