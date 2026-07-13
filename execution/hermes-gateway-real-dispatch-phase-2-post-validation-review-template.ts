// Hermes Gateway Real Dispatch Phase-2 Post-Validation Review Template
// =======================================================================
// Template-only static artifact. No Runtime, Gateway, CLI, filesystem, network, or process imports.

export type HermesGatewayRealDispatchPhase2PostValidationReviewTemplateStatus =
  | "template_only"
  | "not_started";

export type HermesGatewayRealDispatchPhase2ReviewTarget =
  | "code_review"
  | "validation";

export type HermesGatewayRealDispatchPhase2PostValidationReviewSectionCategory =
  | "summary"
  | "target_scope"
  | "sidecar_behavior"
  | "gateway_runtime_safety"
  | "ownership_boundary"
  | "monitoring"
  | "rollback"
  | "decision";

export interface HermesGatewayRealDispatchPhase2PostValidationReviewField {
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

export interface HermesGatewayRealDispatchPhase2PostValidationReviewSection {
  id: string;
  category: HermesGatewayRealDispatchPhase2PostValidationReviewSectionCategory;
  status: "template";
  targetRequestTypes: readonly HermesGatewayRealDispatchPhase2ReviewTarget[];
  executingNow: false;
  collectsDataNow: false;
  persistsDataNow: false;
  changesRuntimeBehaviorNow: false;
  changesGatewayBehaviorNow: false;
  description: string;
  fields: readonly HermesGatewayRealDispatchPhase2PostValidationReviewField[];
  passCriteria: readonly string[];
  failCriteria: readonly string[];
}

export interface HermesGatewayRealDispatchPhase2PostValidationReviewTemplate {
  name: "Hermes Gateway Real Dispatch Phase-2 Post-Validation Review Template";
  adapter: "hermes";
  scope: "gateway_real_dispatch_sidecar_phase_2_post_validation_review_template";
  status: HermesGatewayRealDispatchPhase2PostValidationReviewTemplateStatus;
  templateOnly: true;
  executingNow: false;
  collectsDataNow: false;
  persistsDataNow: false;
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
  phase2ValidationChecklistStatusRequired: "checklist_only";
  phase2OperatorRunbookStatusRequired: "runbook_only";
  currentReadinessVerdict: "READY_WITH_CONSTRAINTS";
  currentRolloutPlanStatus: "plan_only";
  currentRolloutValidationChecklistStatus: "checklist_only";
  currentOperatorRunbookStatus: "runbook_only";
  currentPostEnablementReviewTemplateStatus: "template_only";
  currentPhase2ExpansionContractStatus: "contract_only";
  currentPhase2ValidationChecklistStatus: "checklist_only";
  currentPhase2OperatorRunbookStatus: "runbook_only";
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
  phase2ReviewTargets: readonly ["code_review", "validation"];
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
  persistsPhase2PostValidationReviewLogs: false;
  persistsPhase2RunbookLogs: false;
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
  sections: readonly HermesGatewayRealDispatchPhase2PostValidationReviewSection[];
  requiredSectionCount: number;
  reviewTargets: readonly HermesGatewayRealDispatchPhase2ReviewTarget[];
  templateFieldsArePlaceholdersOnly: true;
  rawPromptCollectionAllowed: false;
  rawArtifactCollectionAllowed: false;
  secretCollectionAllowed: false;
  allowedMonitoringSignals: readonly string[];
  disallowedReviewEvidence: readonly string[];
  allowedReviewOutcomes: readonly string[];
  reviewConstraints: readonly string[];
  evidence: readonly string[];
  recommendedNextPr: "Hermes Gateway Real Dispatch Phase-2 Final Readiness Review";
}

const pf = (id: string, label: string): HermesGatewayRealDispatchPhase2PostValidationReviewField => ({
  id, label, required: true, placeholderOnly: true, collectsDataNow: false, persistsDataNow: false,
  containsRawPromptAllowed: false, containsRawArtifactsAllowed: false, containsSecretsAllowed: false,
});

const commonSec = {
  status: "template" as const,
  executingNow: false as const,
  collectsDataNow: false as const,
  persistsDataNow: false as const,
  changesRuntimeBehaviorNow: false as const,
  changesGatewayBehaviorNow: false as const,
};

const both: readonly HermesGatewayRealDispatchPhase2ReviewTarget[] = ["code_review", "validation"];

const sections: readonly HermesGatewayRealDispatchPhase2PostValidationReviewSection[] = [
  {
    id: "phase_2_review_summary", category: "summary", ...commonSec, targetRequestTypes: both,
    description: "Summarize Phase-2 operator validation review using sanitized placeholders only.",
    fields: [pf("review_date_placeholder", "Review Date"), pf("operator_approval_reference_placeholder", "Operator Approval Reference"), pf("environment_label_placeholder", "Environment Label"), pf("reviewer_placeholder", "Reviewer")],
    passCriteria: ["Summary is sanitized.", "Operator approval reference is present."],
    failCriteria: ["Summary includes raw prompt, artifact, secret, stdout, stderr, or full CLI output."],
  },
  {
    id: "target_scope_confirmation", category: "target_scope", ...commonSec, targetRequestTypes: both,
    description: "Confirm Phase-2 review targets remain code_review and validation only.",
    fields: [pf("target_scope_placeholder", "Target Scope"), pf("unsupported_request_type_check_placeholder", "Unsupported Request Type Check"), pf("current_validated_scope_placeholder", "Current Validated Scope")],
    passCriteria: ["Targets are code_review and validation only.", "Current validated scope remains review-only.", "Unsupported request types remain omitted."],
    failCriteria: ["bugfix, llm_task, or code_generation is included without separate contract.", "code_review or validation becomes enabled by default."],
  },
  {
    id: "code_review_review_section", category: "target_scope", ...commonSec, targetRequestTypes: ["code_review"],
    description: "Review code_review Phase-2 operator validation outcome without making Hermes final owner.",
    fields: [pf("code_review_attach_summary_placeholder", "Code Review Attach Summary"), pf("code_review_omit_summary_placeholder", "Code Review Omit Summary"), pf("code_review_final_owner_check_placeholder", "Final Owner Check")],
    passCriteria: ["code_review sidecar behavior is summarized using sanitized placeholders.", "Hermes is not final code review owner.", "Gateway and Runtime behavior remain unchanged."],
    failCriteria: ["Hermes output becomes final code review decision.", "Raw code review prompt/artifact is copied."],
  },
  {
    id: "validation_review_section", category: "target_scope", ...commonSec, targetRequestTypes: ["validation"],
    description: "Review validation Phase-2 operator validation outcome without making Hermes final owner.",
    fields: [pf("validation_attach_summary_placeholder", "Validation Attach Summary"), pf("validation_omit_summary_placeholder", "Validation Omit Summary"), pf("validation_final_owner_check_placeholder", "Final Owner Check")],
    passCriteria: ["validation sidecar behavior is summarized using sanitized placeholders.", "Hermes is not final validation owner.", "Gateway and Runtime behavior remain unchanged."],
    failCriteria: ["Hermes output becomes final validation decision.", "Raw validation prompt/artifact is copied."],
  },
  {
    id: "sidecar_behavior_review", category: "sidecar_behavior", ...commonSec, targetRequestTypes: both,
    description: "Review sidecar attach/omit behavior across safe, disabled, unsupported, unsafe, and exception paths.",
    fields: [pf("attach_count_summary_placeholder", "Attach Count"), pf("omit_disabled_summary_placeholder", "Omit Disabled Summary"), pf("omit_unsupported_summary_placeholder", "Omit Unsupported Summary"), pf("omit_unsafe_summary_placeholder", "Omit Unsafe Summary"), pf("omit_exception_summary_placeholder", "Omit Exception Summary")],
    passCriteria: ["Safe Phase-2 target requests attach sidecar metadata only.", "Disabled, unsupported, unsafe, and exception paths omit sidecar."],
    failCriteria: ["Unsafe metadata attaches.", "Disabled or unsupported paths call dispatcher."],
  },
  {
    id: "gateway_runtime_safety_review", category: "gateway_runtime_safety", ...commonSec, targetRequestTypes: both,
    description: "Confirm Gateway and Runtime behavior remained independent of Hermes sidecar output.",
    fields: [pf("gateway_primary_result_check_placeholder", "Gateway Primary Result Check"), pf("gateway_final_result_check_placeholder", "Gateway Final Result Check"), pf("runtime_final_status_check_placeholder", "Runtime Final Status Check"), pf("runtime_routing_check_placeholder", "Runtime Routing Check")],
    passCriteria: ["Gateway primary result is unchanged.", "Gateway final result is unchanged.", "Runtime final_status and routing are unchanged."],
    failCriteria: ["Hermes sidecar output changes Gateway primary/final result.", "Hermes sidecar output changes Runtime final_status or routing."],
  },
  {
    id: "monitoring_review", category: "monitoring", ...commonSec, targetRequestTypes: both,
    description: "Review allowed monitoring signals using counts, decisions, booleans, and checks only.",
    fields: [pf("fallback_policy_summary_placeholder", "Fallback Policy Summary"), pf("observability_summary_placeholder", "Observability Summary"), pf("guardrails_summary_placeholder", "Guardrails Summary")],
    passCriteria: ["Only allowed monitoring signals are summarized.", "No raw warning text, prompt, artifact, secret, stdout, or stderr is copied."],
    failCriteria: ["Full Hermes CLI output or full warning text is copied.", "Raw prompt/artifact/secret is copied."],
  },
  {
    id: "rollback_and_escalation_review", category: "rollback", ...commonSec, targetRequestTypes: both,
    description: "Record sanitized rollback and escalation outcomes.",
    fields: [pf("rollback_triggered_placeholder", "Rollback Triggered"), pf("rollback_reason_placeholder", "Rollback Reason"), pf("escalation_triggered_placeholder", "Escalation Triggered"), pf("escalation_reason_placeholder", "Escalation Reason")],
    passCriteria: ["Rollback/escalation review uses sanitized placeholders only.", "Evidence does not include raw sensitive data."],
    failCriteria: ["Rollback or escalation requires raw prompt/artifact/secret.", "Follow-up proposes Hermes default/final owner without separate contract."],
  },
  {
    id: "phase_2_review_decision", category: "decision", ...commonSec, targetRequestTypes: both,
    description: "Record sanitized Phase-2 review decision.",
    fields: [pf("phase_2_review_decision_placeholder", "Review Decision"), pf("follow_up_owner_placeholder", "Follow-up Owner"), pf("follow_up_pr_placeholder", "Follow-up PR")],
    passCriteria: ["Decision is one of remain_review_only, proceed_to_phase_2_final_readiness_review, rollback, or propose_separate_ownership_contract.", "Any final readiness review remains separate and non-executing."],
    failCriteria: ["Decision enables Phase-2 automatically.", "Decision makes Hermes final code_review or validation owner."],
  },
];

export const HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_POST_VALIDATION_REVIEW_TEMPLATE: HermesGatewayRealDispatchPhase2PostValidationReviewTemplate = {
  name: "Hermes Gateway Real Dispatch Phase-2 Post-Validation Review Template",
  adapter: "hermes",
  scope: "gateway_real_dispatch_sidecar_phase_2_post_validation_review_template",
  status: "template_only",
  templateOnly: true,
  executingNow: false,
  collectsDataNow: false,
  persistsDataNow: false,
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
  phase2ValidationChecklistStatusRequired: "checklist_only",
  phase2OperatorRunbookStatusRequired: "runbook_only",
  currentReadinessVerdict: "READY_WITH_CONSTRAINTS",
  currentRolloutPlanStatus: "plan_only",
  currentRolloutValidationChecklistStatus: "checklist_only",
  currentOperatorRunbookStatus: "runbook_only",
  currentPostEnablementReviewTemplateStatus: "template_only",
  currentPhase2ExpansionContractStatus: "contract_only",
  currentPhase2ValidationChecklistStatus: "checklist_only",
  currentPhase2OperatorRunbookStatus: "runbook_only",
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
  phase2ReviewTargets: ["code_review", "validation"],
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
  persistsPhase2PostValidationReviewLogs: false,
  persistsPhase2RunbookLogs: false,
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
  sections,
  requiredSectionCount: sections.length,
  reviewTargets: ["code_review", "validation"],
  templateFieldsArePlaceholdersOnly: true,
  rawPromptCollectionAllowed: false,
  rawArtifactCollectionAllowed: false,
  secretCollectionAllowed: false,
  allowedMonitoringSignals: [
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
  disallowedReviewEvidence: [
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
  allowedReviewOutcomes: [
    "remain_review_only",
    "proceed_to_phase_2_final_readiness_review",
    "rollback",
    "propose_separate_ownership_contract",
  ],
  reviewConstraints: [
    "This PR is template-only and does not collect Phase-2 validation data.",
    "This PR does not persist Phase-2 post-validation review logs.",
    "This PR does not execute Phase-2 validation.",
    "This PR does not expand request types now.",
    "This PR does not change actual Gateway dispatch behavior.",
    "This PR does not enable Hermes feature flags.",
    "This PR does not add enablement scripts or CI behavior.",
    "Phase-2 review targets are code_review and validation only.",
    "Current validated request type remains review only.",
    "Hermes remains Gateway sidecar metadata only.",
    "Hermes remains default-off and requires explicit flags.",
    "Hermes must not become final review, code_review, or validation owner without a separate ownership contract.",
    "Runtime final_status and routing must not depend on Hermes sidecar output.",
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
    "execution/hermes-gateway-real-dispatch-phase-2-validation-checklist.ts",
    "execution/hermes-gateway-real-dispatch-phase-2-operator-runbook.ts",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_READINESS_REVIEW.md",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_CONTROLLED_ROLLOUT_PLAN.md",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_ROLLOUT_VALIDATION_CHECKLIST.md",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_OPERATOR_RUNBOOK.md",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_POST_ENABLEMENT_REVIEW_TEMPLATE.md",
    "HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_EXPANSION_CONTRACT.md",
    "HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_VALIDATION_CHECKLIST.md",
    "HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_OPERATOR_RUNBOOK.md",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-readiness-review.json",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-controlled-rollout-plan.json",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-rollout-validation-checklist.json",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-operator-runbook.json",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-post-enablement-review-template.json",
    "hermes-gateway-real-dispatch-phase-2-expansion-contract.json",
    "hermes-gateway-real-dispatch-phase-2-validation-checklist.json",
    "hermes-gateway-real-dispatch-phase-2-operator-runbook.json",
    "execution/hermes-gateway-real-dispatch-phase-2-post-validation-review-template.ts",
    "tests/hermes-gateway-real-dispatch-phase-2-post-validation-review-template.test.ts",
    "HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_POST_VALIDATION_REVIEW_TEMPLATE.md",
    "hermes-gateway-real-dispatch-phase-2-post-validation-review-template.json",
  ],
  recommendedNextPr: "Hermes Gateway Real Dispatch Phase-2 Final Readiness Review",
};
