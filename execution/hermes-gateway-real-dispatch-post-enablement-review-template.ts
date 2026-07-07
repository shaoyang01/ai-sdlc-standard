// Hermes Gateway Real Dispatch Post-Enablement Review Template
// =============================================================
// Template-only static artifact. No Runtime, Gateway, CLI, filesystem, network, or process imports.
// This module does not collect or persist post-enablement data.

export type HermesGatewayRealDispatchPostEnablementReviewTemplateStatus =
  | "template_only"
  | "not_started";

export type HermesGatewayRealDispatchPostEnablementReviewSectionCategory =
  | "summary"
  | "scope"
  | "sidecar_behavior"
  | "safety"
  | "observability"
  | "guardrails"
  | "rollback"
  | "decision";

export interface HermesGatewayRealDispatchPostEnablementReviewField {
  id: string;
  label: string;
  required: true;
  placeholderOnly: true;
  collectsDataNow: false;
  persistsDataNow: false;
  containsRawPromptAllowed: false;
  containsRawArtifactsAllowed: false;
  containsSecretsAllowed: false;
}

export interface HermesGatewayRealDispatchPostEnablementReviewSection {
  id: string;
  category: HermesGatewayRealDispatchPostEnablementReviewSectionCategory;
  status: "template";
  executingNow: false;
  collectsDataNow: false;
  persistsDataNow: false;
  changesRuntimeBehaviorNow: false;
  changesGatewayBehaviorNow: false;
  description: string;
  fields: readonly HermesGatewayRealDispatchPostEnablementReviewField[];
  passCriteria: readonly string[];
  failCriteria: readonly string[];
}

export interface HermesGatewayRealDispatchPostEnablementReviewTemplate {
  name: "Hermes Gateway Real Dispatch Post-Enablement Review Template";
  adapter: "hermes";
  scope: "gateway_real_dispatch_sidecar_post_enablement_review_template";
  status: HermesGatewayRealDispatchPostEnablementReviewTemplateStatus;
  templateOnly: true;
  executingNow: false;
  collectsDataNow: false;
  persistsDataNow: false;
  enablesFeatureFlagsNow: false;
  changesRuntimeBehaviorNow: false;
  changesGatewayBehaviorNow: false;
  addsEnablementScripts: false;
  changesCiBehavior: false;
  readinessVerdictRequired: "READY_WITH_CONSTRAINTS";
  rolloutPlanStatusRequired: "plan_only";
  rolloutValidationChecklistStatusRequired: "checklist_only";
  operatorRunbookStatusRequired: "runbook_only";
  currentReadinessVerdict: "READY_WITH_CONSTRAINTS";
  currentRolloutPlanStatus: "plan_only";
  currentRolloutValidationChecklistStatus: "checklist_only";
  currentOperatorRunbookStatus: "runbook_only";
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
  reviewRequestTypes: readonly ["review"];
  supportedRequestTypes: readonly ["review", "code_review", "validation"];
  unsupportedRequestTypes: readonly ["llm_task", "code_generation", "bugfix"];
  operatorApprovalRequired: true;
  automaticEnablementAllowed: false;
  rolloutMayProceedAutomatically: false;
  changesGatewayPrimaryDispatch: false;
  changesGatewayFinalResult: false;
  changesRuntimeFinalStatus: false;
  changesRuntimeRouting: false;
  affectsPrimaryGatewayResult: false;
  makesHermesDefault: false;
  makesHermesFinalReviewOwner: false;
  makesHermesFinalValidationOwner: false;
  writesFiles: false;
  persistsReviewLogs: false;
  persistsRunbookLogs: false;
  persistsValidationLogs: false;
  persistsRolloutLogs: false;
  persistsAudit: false;
  persistsObservability: false;
  persistsGuardrails: false;
  containsRawPrompt: false;
  containsRawArtifacts: false;
  containsSecrets: false;
  sections: readonly HermesGatewayRealDispatchPostEnablementReviewSection[];
  requiredSectionCount: number;
  templateFieldsArePlaceholdersOnly: true;
  rawPromptCollectionAllowed: false;
  rawArtifactCollectionAllowed: false;
  secretCollectionAllowed: false;
  reviewConstraints: readonly string[];
  nonPersistedSignalsAllowed: readonly string[];
  disallowedEvidence: readonly string[];
  reviewOutcomes: readonly string[];
  evidence: readonly string[];
  recommendedNextPr: "Hermes Gateway Real Dispatch Phase-2 Expansion Contract";
}

const commonFieldGuards = {
  required: true as const,
  placeholderOnly: true as const,
  collectsDataNow: false as const,
  persistsDataNow: false as const,
  containsRawPromptAllowed: false as const,
  containsRawArtifactsAllowed: false as const,
  containsSecretsAllowed: false as const,
};

const commonSectionGuards = {
  status: "template" as const,
  executingNow: false as const,
  collectsDataNow: false as const,
  persistsDataNow: false as const,
  changesRuntimeBehaviorNow: false as const,
  changesGatewayBehaviorNow: false as const,
};

const sections: readonly HermesGatewayRealDispatchPostEnablementReviewSection[] = [
  {
    id: "review_summary",
    category: "summary",
    ...commonSectionGuards,
    description: "Summarize the operator-managed enablement review without storing raw prompts, artifacts, or secrets.",
    fields: [
      {
        id: "review_date_placeholder",
        label: "Review date placeholder",
        ...commonFieldGuards,
      },
      {
        id: "operator_approval_reference_placeholder",
        label: "Operator approval reference placeholder",
        ...commonFieldGuards,
      },
      {
        id: "environment_label_placeholder",
        label: "Environment label placeholder",
        ...commonFieldGuards,
      },
    ],
    passCriteria: [
      "Review summary is sanitized.",
      "Operator approval reference is present.",
    ],
    failCriteria: [
      "Summary includes raw prompt, artifact, secret, stdout, or stderr.",
    ],
  },
  {
    id: "scope_confirmation",
    category: "scope",
    ...commonSectionGuards,
    description: "Confirm reviewed scope remains review-only and sidecar-only.",
    fields: [
      {
        id: "request_type_scope_placeholder",
        label: "Request type scope placeholder",
        ...commonFieldGuards,
      },
      {
        id: "sidecar_scope_placeholder",
        label: "Sidecar scope placeholder",
        ...commonFieldGuards,
      },
      {
        id: "unsupported_request_type_check_placeholder",
        label: "Unsupported request type check placeholder",
        ...commonFieldGuards,
      },
    ],
    passCriteria: [
      "Reviewed request type is review.",
      "Hermes remains sidecar metadata only.",
      "Unsupported request types remain omitted.",
    ],
    failCriteria: [
      "code_review or validation is reviewed before phase-2 approval.",
      "llm_task, code_generation, or bugfix invokes Hermes dispatcher.",
    ],
  },
  {
    id: "sidecar_attach_omit_behavior",
    category: "sidecar_behavior",
    ...commonSectionGuards,
    description: "Review attach and omit behavior for safe, disabled, unsupported, unsafe, and exception paths.",
    fields: [
      {
        id: "attached_success_count_placeholder",
        label: "Attached success count placeholder",
        ...commonFieldGuards,
      },
      {
        id: "omitted_disabled_count_placeholder",
        label: "Omitted disabled count placeholder",
        ...commonFieldGuards,
      },
      {
        id: "omitted_unsupported_count_placeholder",
        label: "Omitted unsupported count placeholder",
        ...commonFieldGuards,
      },
      {
        id: "omitted_unsafe_count_placeholder",
        label: "Omitted unsafe count placeholder",
        ...commonFieldGuards,
      },
      {
        id: "omitted_exception_count_placeholder",
        label: "Omitted exception count placeholder",
        ...commonFieldGuards,
      },
    ],
    passCriteria: [
      "Safe review requests attach sidecar metadata.",
      "Disabled, unsupported, and exception paths omit sidecar.",
    ],
    failCriteria: [
      "Unsafe metadata attaches.",
      "Disabled or unsupported paths call dispatcher.",
    ],
  },
  {
    id: "gateway_runtime_safety",
    category: "safety",
    ...commonSectionGuards,
    description: "Confirm Gateway and Runtime behavior remain independent of Hermes sidecar output.",
    fields: [
      {
        id: "gateway_primary_result_check_placeholder",
        label: "Gateway primary result check placeholder",
        ...commonFieldGuards,
      },
      {
        id: "gateway_final_result_check_placeholder",
        label: "Gateway final result check placeholder",
        ...commonFieldGuards,
      },
      {
        id: "runtime_final_status_check_placeholder",
        label: "Runtime final_status check placeholder",
        ...commonFieldGuards,
      },
      {
        id: "runtime_routing_check_placeholder",
        label: "Runtime routing check placeholder",
        ...commonFieldGuards,
      },
    ],
    passCriteria: [
      "Gateway primary result is unchanged.",
      "Gateway final result is unchanged.",
      "Runtime final_status and routing are unchanged.",
    ],
    failCriteria: [
      "Hermes sidecar output changes Gateway primary/final result.",
      "Hermes sidecar output changes Runtime final_status or routing.",
    ],
  },
  {
    id: "fallback_policy_review",
    category: "sidecar_behavior",
    ...commonSectionGuards,
    description: "Review fallbackPolicy reason/action values without copying raw payloads.",
    fields: [
      {
        id: "fallback_reason_distribution_placeholder",
        label: "Fallback reason distribution placeholder",
        ...commonFieldGuards,
      },
      {
        id: "fallback_action_distribution_placeholder",
        label: "Fallback action distribution placeholder",
        ...commonFieldGuards,
      },
    ],
    passCriteria: [
      "fallbackPolicy contains expected reason/action values only.",
      "No raw prompt/artifact/secret is present.",
    ],
    failCriteria: [
      "fallbackPolicy includes raw text or unbounded payloads.",
    ],
  },
  {
    id: "observability_review",
    category: "observability",
    ...commonSectionGuards,
    description: "Review observability outcomes and warning counts only.",
    fields: [
      {
        id: "observability_outcome_distribution_placeholder",
        label: "Observability outcome distribution placeholder",
        ...commonFieldGuards,
      },
      {
        id: "warning_count_summary_placeholder",
        label: "Warning count summary placeholder",
        ...commonFieldGuards,
      },
      {
        id: "has_warnings_summary_placeholder",
        label: "Has warnings summary placeholder",
        ...commonFieldGuards,
      },
    ],
    passCriteria: [
      "Observability uses counts/booleans only.",
      "Warning text is not copied.",
    ],
    failCriteria: [
      "Warning text, raw prompt, artifact, secret, stdout, or stderr is copied.",
    ],
  },
  {
    id: "guardrails_review",
    category: "guardrails",
    ...commonSectionGuards,
    description: "Review guardrail decisions and checks without storing raw evidence.",
    fields: [
      {
        id: "guardrail_decision_distribution_placeholder",
        label: "Guardrail decision distribution placeholder",
        ...commonFieldGuards,
      },
      {
        id: "guardrail_reject_reason_summary_placeholder",
        label: "Guardrail reject reason summary placeholder",
        ...commonFieldGuards,
      },
      {
        id: "guardrail_checks_summary_placeholder",
        label: "Guardrail checks summary placeholder",
        ...commonFieldGuards,
      },
    ],
    passCriteria: [
      "Guardrails allow only safe bounded metadata.",
      "Rejects are explainable using decision/check fields.",
    ],
    failCriteria: [
      "Guardrails allow unsafe metadata.",
      "Guardrail review requires raw prompt/artifact/secret.",
    ],
  },
  {
    id: "rollback_and_escalation_review",
    category: "rollback",
    ...commonSectionGuards,
    description: "Record whether rollback or escalation criteria were triggered using sanitized placeholders only.",
    fields: [
      {
        id: "rollback_triggered_placeholder",
        label: "Rollback triggered placeholder",
        ...commonFieldGuards,
      },
      {
        id: "rollback_reason_placeholder",
        label: "Rollback reason placeholder",
        ...commonFieldGuards,
      },
      {
        id: "escalation_triggered_placeholder",
        label: "Escalation triggered placeholder",
        ...commonFieldGuards,
      },
      {
        id: "escalation_reason_placeholder",
        label: "Escalation reason placeholder",
        ...commonFieldGuards,
      },
    ],
    passCriteria: [
      "Rollback/escalation decisions are based on sanitized criteria.",
      "No raw prompt/artifact/secret is persisted.",
    ],
    failCriteria: [
      "Rollback evidence requires raw sensitive data.",
      "Escalation proposes Hermes default or primary Gateway ownership without contract.",
    ],
  },
  {
    id: "post_enablement_decision",
    category: "decision",
    ...commonSectionGuards,
    description: "Record sanitized review decision for whether to remain in current phase, roll back, or propose separate phase-2 contract.",
    fields: [
      {
        id: "review_decision_placeholder",
        label: "Review decision placeholder",
        ...commonFieldGuards,
      },
      {
        id: "follow_up_owner_placeholder",
        label: "Follow-up owner placeholder",
        ...commonFieldGuards,
      },
      {
        id: "follow_up_pr_placeholder",
        label: "Follow-up PR placeholder",
        ...commonFieldGuards,
      },
    ],
    passCriteria: [
      "Decision is one of remain_current_phase, rollback, or propose_phase_2_contract.",
      "Any phase-2 expansion is routed through a separate contract.",
    ],
    failCriteria: [
      "Decision enables automatic expansion.",
      "Decision makes Hermes final review/validation owner without separate contract.",
    ],
  },
];

export const HERMES_GATEWAY_REAL_DISPATCH_POST_ENABLEMENT_REVIEW_TEMPLATE: HermesGatewayRealDispatchPostEnablementReviewTemplate = {
  name: "Hermes Gateway Real Dispatch Post-Enablement Review Template",
  adapter: "hermes",
  scope: "gateway_real_dispatch_sidecar_post_enablement_review_template",
  status: "template_only",
  templateOnly: true,
  executingNow: false,
  collectsDataNow: false,
  persistsDataNow: false,
  enablesFeatureFlagsNow: false,
  changesRuntimeBehaviorNow: false,
  changesGatewayBehaviorNow: false,
  addsEnablementScripts: false,
  changesCiBehavior: false,
  readinessVerdictRequired: "READY_WITH_CONSTRAINTS",
  rolloutPlanStatusRequired: "plan_only",
  rolloutValidationChecklistStatusRequired: "checklist_only",
  operatorRunbookStatusRequired: "runbook_only",
  currentReadinessVerdict: "READY_WITH_CONSTRAINTS",
  currentRolloutPlanStatus: "plan_only",
  currentRolloutValidationChecklistStatus: "checklist_only",
  currentOperatorRunbookStatus: "runbook_only",
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
  reviewRequestTypes: ["review"],
  supportedRequestTypes: ["review", "code_review", "validation"],
  unsupportedRequestTypes: ["llm_task", "code_generation", "bugfix"],
  operatorApprovalRequired: true,
  automaticEnablementAllowed: false,
  rolloutMayProceedAutomatically: false,
  changesGatewayPrimaryDispatch: false,
  changesGatewayFinalResult: false,
  changesRuntimeFinalStatus: false,
  changesRuntimeRouting: false,
  affectsPrimaryGatewayResult: false,
  makesHermesDefault: false,
  makesHermesFinalReviewOwner: false,
  makesHermesFinalValidationOwner: false,
  writesFiles: false,
  persistsReviewLogs: false,
  persistsRunbookLogs: false,
  persistsValidationLogs: false,
  persistsRolloutLogs: false,
  persistsAudit: false,
  persistsObservability: false,
  persistsGuardrails: false,
  containsRawPrompt: false,
  containsRawArtifacts: false,
  containsSecrets: false,
  sections,
  requiredSectionCount: sections.length,
  templateFieldsArePlaceholdersOnly: true,
  rawPromptCollectionAllowed: false,
  rawArtifactCollectionAllowed: false,
  secretCollectionAllowed: false,
  reviewConstraints: [
    "This PR is template-only and does not collect post-enablement data.",
    "This PR does not persist review, validation, rollout, audit, observability, guardrail, or runbook logs.",
    "Template fields are placeholders only.",
    "No raw prompts, raw artifacts, secrets, stdout, or stderr may be copied into the review.",
    "Hermes remains Gateway sidecar metadata only.",
    "Hermes remains default-off and requires explicit flags.",
    "Initial post-enablement review scope is review-only.",
    "Expansion to code_review and validation requires a separate contract for phase-2 expansion.",
    "Hermes must not become final review or validation owner without a separate contract.",
    "Runtime final_status and routing must not depend on Hermes sidecar output.",
    "No automatic rollout or automatic enablement is allowed.",
  ],
  nonPersistedSignalsAllowed: [
    "fallbackPolicy.reason",
    "fallbackPolicy.action",
    "observability.outcome",
    "observability.warningCount",
    "observability.hasWarnings",
    "guardrails.decision",
    "guardrails.allowed",
    "guardrails.warningCount",
    "guardrails.checks",
  ],
  disallowedEvidence: [
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
  ],
  reviewOutcomes: [
    "remain_current_phase",
    "rollback",
    "propose_phase_2_contract",
  ],
  evidence: [
    "execution/hermes-gateway-real-dispatch-readiness-review.ts",
    "execution/hermes-gateway-real-dispatch-controlled-rollout-plan.ts",
    "execution/hermes-gateway-real-dispatch-rollout-validation-checklist.ts",
    "execution/hermes-gateway-real-dispatch-operator-runbook.ts",
    "HERMES_GATEWAY_REAL_DISPATCH_READINESS_REVIEW.md",
    "HERMES_GATEWAY_REAL_DISPATCH_CONTROLLED_ROLLOUT_PLAN.md",
    "HERMES_GATEWAY_REAL_DISPATCH_ROLLOUT_VALIDATION_CHECKLIST.md",
    "HERMES_GATEWAY_REAL_DISPATCH_OPERATOR_RUNBOOK.md",
    "hermes-gateway-real-dispatch-readiness-review.json",
    "hermes-gateway-real-dispatch-controlled-rollout-plan.json",
    "hermes-gateway-real-dispatch-rollout-validation-checklist.json",
    "hermes-gateway-real-dispatch-operator-runbook.json",
    "execution/hermes-gateway-real-dispatch-post-enablement-review-template.ts",
    "tests/hermes-gateway-real-dispatch-post-enablement-review-template.test.ts",
    "HERMES_GATEWAY_REAL_DISPATCH_POST_ENABLEMENT_REVIEW_TEMPLATE.md",
    "hermes-gateway-real-dispatch-post-enablement-review-template.json",
  ],
  recommendedNextPr: "Hermes Gateway Real Dispatch Phase-2 Expansion Contract",
};
