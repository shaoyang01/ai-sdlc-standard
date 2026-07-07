// Hermes Gateway Real Dispatch Phase-2 Validation Checklist
// ============================================================
// Checklist-only static artifact. No Runtime, Gateway, CLI, filesystem, network, or process imports.
// This module does not execute Phase-2 validation.

export type HermesGatewayRealDispatchPhase2ValidationChecklistStatus =
  | "checklist_only"
  | "not_started";

export type HermesGatewayRealDispatchPhase2ValidationTarget =
  | "code_review"
  | "validation";

export type HermesGatewayRealDispatchPhase2ValidationGateCategory =
  | "non_execution"
  | "prerequisite"
  | "request_scope"
  | "sidecar_safety"
  | "gateway_runtime_safety"
  | "ownership_boundary"
  | "test_safety"
  | "operator_approval"
  | "rollback";

export interface HermesGatewayRealDispatchPhase2ValidationGate {
  id: string;
  category: HermesGatewayRealDispatchPhase2ValidationGateCategory;
  status: "required";
  requiredBeforePhase2Enablement: true;
  executingNow: false;
  validatesNow: false;
  expandsRequestTypesNow: false;
  enablesFeatureFlagsNow: false;
  changesRuntimeBehaviorNow: false;
  changesGatewayBehaviorNow: false;
  targetRequestTypes: readonly HermesGatewayRealDispatchPhase2ValidationTarget[];
  description: string;
  validationMethod: string;
  passCriteria: readonly string[];
  failCriteria: readonly string[];
}

export interface HermesGatewayRealDispatchPhase2ValidationChecklist {
  name: "Hermes Gateway Real Dispatch Phase-2 Validation Checklist";
  adapter: "hermes";
  scope: "gateway_real_dispatch_sidecar_phase_2_validation_checklist";
  status: HermesGatewayRealDispatchPhase2ValidationChecklistStatus;
  checklistOnly: true;
  executingNow: false;
  validatesNow: false;
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
  phase2ExpansionContractStatusRequired: "contract_only";
  currentReadinessVerdict: "READY_WITH_CONSTRAINTS";
  currentRolloutPlanStatus: "plan_only";
  currentRolloutValidationChecklistStatus: "checklist_only";
  currentOperatorRunbookStatus: "runbook_only";
  currentPostEnablementReviewTemplateStatus: "template_only";
  currentPhase2ExpansionContractStatus: "contract_only";
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
  phase2ValidationTargets: readonly ["code_review", "validation"];
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
  persistsPhase2ValidationLogs: false;
  persistsExpansionLogs: false;
  persistsReviewLogs: false;
  persistsRolloutLogs: false;
  persistsAudit: false;
  persistsObservability: false;
  persistsGuardrails: false;
  containsRawPrompt: false;
  containsRawArtifacts: false;
  containsSecrets: false;
  validationGates: readonly HermesGatewayRealDispatchPhase2ValidationGate[];
  requiredGateCount: number;
  validationTargets: readonly HermesGatewayRealDispatchPhase2ValidationTarget[];
  requiredSanitizedInputs: readonly string[];
  disallowedValidationEvidence: readonly string[];
  allowedValidationOutcomes: readonly string[];
  checklistConstraints: readonly string[];
  evidence: readonly string[];
  recommendedNextPr: "Hermes Gateway Real Dispatch Phase-2 Operator Runbook";
}

const commonGateGuards = {
  status: "required" as const,
  requiredBeforePhase2Enablement: true as const,
  executingNow: false as const,
  validatesNow: false as const,
  expandsRequestTypesNow: false as const,
  enablesFeatureFlagsNow: false as const,
  changesRuntimeBehaviorNow: false as const,
  changesGatewayBehaviorNow: false as const,
};

const generalTargets: readonly HermesGatewayRealDispatchPhase2ValidationTarget[] = ["code_review", "validation"];

const validationGates: readonly HermesGatewayRealDispatchPhase2ValidationGate[] = [
  {
    id: "phase_2_non_execution_gate",
    category: "non_execution",
    ...commonGateGuards,
    targetRequestTypes: generalTargets,
    description: "Confirm this checklist does not execute Phase-2 validation or expansion.",
    validationMethod: "Static artifact and metadata review.",
    passCriteria: [
      "Checklist PR contains only checklist artifacts, metadata, and tests.",
      "Runtime and Gateway implementation files are unchanged.",
      "No feature flags are enabled by default.",
    ],
    failCriteria: [
      "Runtime or Gateway behavior changes.",
      "Actual Phase-2 validation is executed.",
      "Any enablement script is added.",
    ],
  },
  {
    id: "prerequisite_status_gate",
    category: "prerequisite",
    ...commonGateGuards,
    targetRequestTypes: generalTargets,
    description: "Confirm all prior artifacts have required non-executing statuses.",
    validationMethod: "Metadata and static artifact review.",
    passCriteria: [
      "Readiness verdict is READY_WITH_CONSTRAINTS.",
      "Controlled rollout plan is plan_only.",
      "Rollout validation checklist is checklist_only.",
      "Operator runbook is runbook_only.",
      "Post-enablement review template is template_only.",
      "Phase-2 expansion contract is contract_only.",
    ],
    failCriteria: [
      "Any prerequisite status is missing or stale.",
      "Phase-2 validation proceeds before contract-only artifact exists.",
    ],
  },
  {
    id: "phase_2_request_scope_gate",
    category: "request_scope",
    ...commonGateGuards,
    targetRequestTypes: generalTargets,
    description: "Confirm Phase-2 validation targets are exactly code_review and validation.",
    validationMethod: "Static request-type scope review.",
    passCriteria: [
      "Phase-2 validation targets are exactly code_review and validation.",
      "Current validated request types remain review only.",
      "Unsupported request types remain llm_task, code_generation, and bugfix.",
    ],
    failCriteria: [
      "bugfix is included in Phase-2 validation.",
      "llm_task or code_generation can trigger Hermes dispatcher.",
    ],
  },
  {
    id: "code_review_target_gate",
    category: "request_scope",
    ...commonGateGuards,
    targetRequestTypes: ["code_review"],
    description: "Confirm code_review validation remains sidecar-only and non-final.",
    validationMethod: "Contract and ownership-boundary review.",
    passCriteria: [
      "code_review remains sidecar-only.",
      "Hermes does not become final code review owner.",
      "Gateway primary/final result remains unchanged.",
    ],
    failCriteria: [
      "Hermes output becomes final code review decision.",
      "code_review expansion enables Hermes by default.",
    ],
  },
  {
    id: "validation_target_gate",
    category: "request_scope",
    ...commonGateGuards,
    targetRequestTypes: ["validation"],
    description: "Confirm validation request validation remains sidecar-only and non-final.",
    validationMethod: "Contract and ownership-boundary review.",
    passCriteria: [
      "validation remains sidecar-only.",
      "Hermes does not become final validation owner.",
      "Gateway primary/final result remains unchanged.",
    ],
    failCriteria: [
      "Hermes output becomes final validation decision.",
      "validation expansion enables Hermes by default.",
    ],
  },
  {
    id: "phase_2_sidecar_safety_gate",
    category: "sidecar_safety",
    ...commonGateGuards,
    targetRequestTypes: generalTargets,
    description: "Confirm Phase-2 sidecar metadata remains bounded and nested.",
    validationMethod: "Static sidecar metadata review.",
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
    id: "phase_2_gateway_runtime_safety_gate",
    category: "gateway_runtime_safety",
    ...commonGateGuards,
    targetRequestTypes: generalTargets,
    description: "Confirm Phase-2 validation cannot affect Gateway or Runtime outcomes.",
    validationMethod: "Static Gateway/Runtime behavior review.",
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
    id: "phase_2_test_safety_gate",
    category: "test_safety",
    ...commonGateGuards,
    targetRequestTypes: generalTargets,
    description: "Confirm tests remain fake/static and do not call real Hermes CLI.",
    validationMethod: "Static test and package-script review.",
    passCriteria: [
      "No real Hermes CLI is invoked in tests.",
      "Tests do not require external services.",
      "Package scripts do not enable Hermes dispatch.",
    ],
    failCriteria: [
      "Tests call real Hermes CLI.",
      "Tests require network or external services.",
      "Package scripts set Hermes enablement flags.",
    ],
  },
  {
    id: "phase_2_operator_approval_gate",
    category: "operator_approval",
    ...commonGateGuards,
    targetRequestTypes: generalTargets,
    description: "Confirm Phase-2 validation requires separate operator approval.",
    validationMethod: "Metadata and checklist review.",
    passCriteria: [
      "Operator approval is required before Phase-2 validation.",
      "Phase-2 cannot proceed automatically.",
      "Automatic enablement is disallowed.",
    ],
    failCriteria: [
      "Any automatic Phase-2 validation path is introduced.",
      "Any flag becomes enabled by default.",
    ],
  },
  {
    id: "phase_2_rollback_gate",
    category: "rollback",
    ...commonGateGuards,
    targetRequestTypes: generalTargets,
    description: "Confirm rollback criteria exist before Phase-2 validation.",
    validationMethod: "Rollback criteria review.",
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

export const HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_VALIDATION_CHECKLIST: HermesGatewayRealDispatchPhase2ValidationChecklist = {
  name: "Hermes Gateway Real Dispatch Phase-2 Validation Checklist",
  adapter: "hermes",
  scope: "gateway_real_dispatch_sidecar_phase_2_validation_checklist",
  status: "checklist_only",
  checklistOnly: true,
  executingNow: false,
  validatesNow: false,
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
  phase2ExpansionContractStatusRequired: "contract_only",
  currentReadinessVerdict: "READY_WITH_CONSTRAINTS",
  currentRolloutPlanStatus: "plan_only",
  currentRolloutValidationChecklistStatus: "checklist_only",
  currentOperatorRunbookStatus: "runbook_only",
  currentPostEnablementReviewTemplateStatus: "template_only",
  currentPhase2ExpansionContractStatus: "contract_only",
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
  phase2ValidationTargets: ["code_review", "validation"],
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
  persistsPhase2ValidationLogs: false,
  persistsExpansionLogs: false,
  persistsReviewLogs: false,
  persistsRolloutLogs: false,
  persistsAudit: false,
  persistsObservability: false,
  persistsGuardrails: false,
  containsRawPrompt: false,
  containsRawArtifacts: false,
  containsSecrets: false,
  validationGates,
  requiredGateCount: validationGates.length,
  validationTargets: ["code_review", "validation"],
  requiredSanitizedInputs: [
    "phase-2 expansion contract",
    "review-only post-enablement decision",
    "review-only attach/omit summary",
    "review-only fallbackPolicy reason/action summary",
    "review-only observability outcome/count summary",
    "review-only guardrail decision/check summary",
    "operator approval reference",
    "rollback owner reference",
  ],
  disallowedValidationEvidence: [
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
  allowedValidationOutcomes: [
    "remain_review_only",
    "proceed_to_phase_2_operator_runbook",
    "rollback",
  ],
  checklistConstraints: [
    "This PR is checklist-only and does not execute Phase-2 validation.",
    "This PR does not expand request types now.",
    "This PR does not change actual Gateway dispatch behavior.",
    "This PR does not enable Hermes feature flags.",
    "This PR does not add enablement scripts or CI behavior.",
    "Phase-2 validation targets are code_review and validation only.",
    "Current validated request type remains review only.",
    "Hermes remains Gateway sidecar metadata only.",
    "Hermes remains default-off and requires explicit flags.",
    "Hermes must not become final review, code_review, or validation owner without a separate ownership contract.",
    "Runtime final_status and routing must not depend on Hermes sidecar output.",
    "No Phase-2 validation, expansion, review, rollout, audit, observability, or guardrail logs may persist without a separate contract.",
    "raw prompt, raw artifact, secret, stdout, stderr, full CLI output, and full warning text remain disallowed.",
    "No automatic Phase-2 validation, Phase-2 expansion, or automatic enablement is allowed.",
  ],
  evidence: [
    "execution/hermes-gateway-real-dispatch-readiness-review.ts",
    "execution/hermes-gateway-real-dispatch-controlled-rollout-plan.ts",
    "execution/hermes-gateway-real-dispatch-rollout-validation-checklist.ts",
    "execution/hermes-gateway-real-dispatch-operator-runbook.ts",
    "execution/hermes-gateway-real-dispatch-post-enablement-review-template.ts",
    "execution/hermes-gateway-real-dispatch-phase-2-expansion-contract.ts",
    "HERMES_GATEWAY_REAL_DISPATCH_READINESS_REVIEW.md",
    "HERMES_GATEWAY_REAL_DISPATCH_CONTROLLED_ROLLOUT_PLAN.md",
    "HERMES_GATEWAY_REAL_DISPATCH_ROLLOUT_VALIDATION_CHECKLIST.md",
    "HERMES_GATEWAY_REAL_DISPATCH_OPERATOR_RUNBOOK.md",
    "HERMES_GATEWAY_REAL_DISPATCH_POST_ENABLEMENT_REVIEW_TEMPLATE.md",
    "HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_EXPANSION_CONTRACT.md",
    "hermes-gateway-real-dispatch-readiness-review.json",
    "hermes-gateway-real-dispatch-controlled-rollout-plan.json",
    "hermes-gateway-real-dispatch-rollout-validation-checklist.json",
    "hermes-gateway-real-dispatch-operator-runbook.json",
    "hermes-gateway-real-dispatch-post-enablement-review-template.json",
    "hermes-gateway-real-dispatch-phase-2-expansion-contract.json",
    "execution/hermes-gateway-real-dispatch-phase-2-validation-checklist.ts",
    "tests/hermes-gateway-real-dispatch-phase-2-validation-checklist.test.ts",
    "HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_VALIDATION_CHECKLIST.md",
    "hermes-gateway-real-dispatch-phase-2-validation-checklist.json",
  ],
  recommendedNextPr: "Hermes Gateway Real Dispatch Phase-2 Operator Runbook",
};
