// Hermes Gateway Real Dispatch Phase-2 Operator Runbook
// ==========================================================
// Runbook-only static artifact. No Runtime, Gateway, CLI, filesystem, network, or process imports.
// This module does not execute Phase-2 validation.

export type HermesGatewayRealDispatchPhase2OperatorRunbookStatus =
  | "runbook_only"
  | "not_started";

export type HermesGatewayRealDispatchPhase2OperatorTarget =
  | "code_review"
  | "validation";

export type HermesGatewayRealDispatchPhase2OperatorProcedureCategory =
  | "pre_validation"
  | "manual_environment_reference"
  | "target_scope_validation"
  | "sidecar_validation"
  | "monitoring"
  | "rollback"
  | "escalation";

export interface HermesGatewayRealDispatchPhase2OperatorProcedure {
  id: string;
  category: HermesGatewayRealDispatchPhase2OperatorProcedureCategory;
  status: "documented";
  requiredBeforePhase2Enablement: true;
  executingNow: false;
  validatesNow: false;
  expandsRequestTypesNow: false;
  enablesFeatureFlagsNow: false;
  changesRuntimeBehaviorNow: false;
  changesGatewayBehaviorNow: false;
  targetRequestTypes: readonly HermesGatewayRealDispatchPhase2OperatorTarget[];
  description: string;
  steps: readonly string[];
  successCriteria: readonly string[];
  stopCriteria: readonly string[];
}

export interface HermesGatewayRealDispatchPhase2OperatorRunbook {
  name: "Hermes Gateway Real Dispatch Phase-2 Operator Runbook";
  adapter: "hermes";
  scope: "gateway_real_dispatch_sidecar_phase_2_operator_runbook";
  status: HermesGatewayRealDispatchPhase2OperatorRunbookStatus;
  runbookOnly: true;
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
  phase2ValidationChecklistStatusRequired: "checklist_only";
  currentReadinessVerdict: "READY_WITH_CONSTRAINTS";
  currentRolloutPlanStatus: "plan_only";
  currentRolloutValidationChecklistStatus: "checklist_only";
  currentOperatorRunbookStatus: "runbook_only";
  currentPostEnablementReviewTemplateStatus: "template_only";
  currentPhase2ExpansionContractStatus: "contract_only";
  currentPhase2ValidationChecklistStatus: "checklist_only";
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
  phase2OperatorTargets: readonly ["code_review", "validation"];
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
  procedures: readonly HermesGatewayRealDispatchPhase2OperatorProcedure[];
  requiredProcedureCount: number;
  operatorTargets: readonly HermesGatewayRealDispatchPhase2OperatorTarget[];
  preValidationChecks: readonly string[];
  manualEnvironmentNotes: readonly string[];
  allowedMonitoringSignals: readonly string[];
  disallowedOperatorEvidence: readonly string[];
  rollbackTriggers: readonly string[];
  escalationTriggers: readonly string[];
  allowedOperatorOutcomes: readonly string[];
  runbookConstraints: readonly string[];
  evidence: readonly string[];
  recommendedNextPr: "Hermes Gateway Real Dispatch Phase-2 Post-Validation Review Template";
}

const commonProcGuards = {
  status: "documented" as const,
  requiredBeforePhase2Enablement: true as const,
  executingNow: false as const,
  validatesNow: false as const,
  expandsRequestTypesNow: false as const,
  enablesFeatureFlagsNow: false as const,
  changesRuntimeBehaviorNow: false as const,
  changesGatewayBehaviorNow: false as const,
};

const generalTargets: readonly HermesGatewayRealDispatchPhase2OperatorTarget[] = ["code_review", "validation"];

const procedures: readonly HermesGatewayRealDispatchPhase2OperatorProcedure[] = [
  {
    id: "phase_2_pre_validation_review",
    category: "pre_validation",
    ...commonProcGuards,
    targetRequestTypes: generalTargets,
    description: "Confirm all Phase-2 prerequisites before any operator-managed validation.",
    steps: [
      "Confirm Phase-2 expansion contract status is contract_only.",
      "Confirm Phase-2 validation checklist status is checklist_only.",
      "Confirm review-only post-enablement evidence is sanitized.",
      "Confirm current validated request type remains review only.",
      "Confirm Phase-2 targets are code_review and validation only.",
    ],
    successCriteria: [
      "All prerequisite artifacts are current.",
      "Operator approval is available outside this repository process.",
    ],
    stopCriteria: [
      "Phase-2 contract or checklist is missing.",
      "Review-only evidence requires rollback.",
      "Raw prompt/artifact/secret is required for decision-making.",
    ],
  },
  {
    id: "phase_2_manual_environment_reference",
    category: "manual_environment_reference",
    ...commonProcGuards,
    targetRequestTypes: generalTargets,
    description: "Document manual operator-provided environment inputs for Phase-2 validation.",
    steps: [
      "In an operator-managed environment only, provide SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled.",
      "In the same controlled environment, provide SDLC_HERMES_GATEWAY_INTEGRATION=enabled.",
      "In the same controlled environment, provide SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled.",
      "Do not set these flags in repository defaults, package scripts, tests, or CI.",
    ],
    successCriteria: [
      "All flags are manually provided outside repository defaults.",
      "Repository remains default-off.",
    ],
    stopCriteria: [
      "Any flag is enabled by default.",
      "Any package script, CI config, or test sets Hermes enablement flags.",
    ],
  },
  {
    id: "code_review_sidecar_validation",
    category: "target_scope_validation",
    ...commonProcGuards,
    targetRequestTypes: ["code_review"],
    description: "Document how an operator validates code_review sidecar behavior without making Hermes final owner.",
    steps: [
      "Submit a controlled code_review request in the operator-managed environment.",
      "Confirm hermes_gateway_real_dispatch is sidecar metadata only.",
      "Confirm Gateway primary and final result remain unchanged.",
      "Confirm Hermes output is not treated as final code review decision.",
      "Confirm fallbackPolicy, observability, and guardrails are nested.",
    ],
    successCriteria: [
      "code_review sidecar attaches only when safe.",
      "Hermes is not final code review owner.",
      "Gateway and Runtime behavior remain unchanged.",
    ],
    stopCriteria: [
      "Hermes output becomes final code review decision.",
      "Sidecar affects Gateway primary/final result.",
      "Runtime final_status/routing changes.",
    ],
  },
  {
    id: "validation_sidecar_validation",
    category: "target_scope_validation",
    ...commonProcGuards,
    targetRequestTypes: ["validation"],
    description: "Document how an operator validates validation sidecar behavior without making Hermes final owner.",
    steps: [
      "Submit a controlled validation request in the operator-managed environment.",
      "Confirm hermes_gateway_real_dispatch is sidecar metadata only.",
      "Confirm Gateway primary and final result remain unchanged.",
      "Confirm Hermes output is not treated as final validation decision.",
      "Confirm fallbackPolicy, observability, and guardrails are nested.",
    ],
    successCriteria: [
      "validation sidecar attaches only when safe.",
      "Hermes is not final validation owner.",
      "Gateway and Runtime behavior remain unchanged.",
    ],
    stopCriteria: [
      "Hermes output becomes final validation decision.",
      "Sidecar affects Gateway primary/final result.",
      "Runtime final_status/routing changes.",
    ],
  },
  {
    id: "phase_2_monitoring_review",
    category: "monitoring",
    ...commonProcGuards,
    targetRequestTypes: generalTargets,
    description: "Review allowed in-memory sidecar signals during Phase-2 operator validation.",
    steps: [
      "Inspect fallbackPolicy.reason and fallbackPolicy.action.",
      "Inspect observability.outcome, observability.warningCount, and observability.hasWarnings.",
      "Inspect guardrails.decision, guardrails.allowed, guardrails.warningCount, and guardrails.checks.",
      "Do not copy raw prompts, raw artifacts, secrets, stdout, stderr, full CLI output, or full warning text.",
    ],
    successCriteria: [
      "Only sanitized counts, booleans, decisions, and checks are reviewed.",
      "No Phase-2 validation logs are persisted.",
    ],
    stopCriteria: [
      "Raw prompt/artifact/secret is needed for review.",
      "Any observability, guardrail, validation, or expansion log is persisted without a separate contract.",
    ],
  },
  {
    id: "phase_2_rollback_procedure",
    category: "rollback",
    ...commonProcGuards,
    targetRequestTypes: generalTargets,
    description: "Document rollback criteria for Phase-2 operator validation.",
    steps: [
      "Stop Phase-2 operator validation immediately.",
      "Remove any manually provided Hermes enablement flags from the controlled environment.",
      "Confirm disabled path does not call dispatcher.",
      "Confirm Gateway primary/final result remains unchanged.",
      "Keep current validated request type as review only.",
    ],
    successCriteria: [
      "Phase-2 validation stops.",
      "Hermes dispatcher is not called after manual flags are removed.",
      "Gateway and Runtime behavior remain unchanged.",
    ],
    stopCriteria: [
      "Dispatcher is still called after flags are removed.",
      "code_review or validation remains enabled after rollback.",
    ],
  },
  {
    id: "phase_2_escalation_path",
    category: "escalation",
    ...commonProcGuards,
    targetRequestTypes: generalTargets,
    description: "Escalate Phase-2 safety boundary violations without persisting sensitive data.",
    steps: [
      "Stop Phase-2 validation immediately.",
      "Preserve only sanitized reproduction notes.",
      "Open follow-up work for a separate ownership or routing contract if needed.",
      "Do not persist raw prompts, artifacts, secrets, stdout, stderr, full CLI output, or warning text.",
    ],
    successCriteria: [
      "Phase-2 validation is stopped.",
      "Follow-up evidence is sanitized.",
      "Hermes remains sidecar-only until a separate contract exists.",
    ],
    stopCriteria: [
      "Follow-up requires raw sensitive evidence.",
      "Follow-up proposes Hermes as default or final code_review/validation owner without a separate contract.",
    ],
  },
];

export const HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_OPERATOR_RUNBOOK: HermesGatewayRealDispatchPhase2OperatorRunbook = {
  name: "Hermes Gateway Real Dispatch Phase-2 Operator Runbook",
  adapter: "hermes",
  scope: "gateway_real_dispatch_sidecar_phase_2_operator_runbook",
  status: "runbook_only",
  runbookOnly: true,
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
  phase2ValidationChecklistStatusRequired: "checklist_only",
  currentReadinessVerdict: "READY_WITH_CONSTRAINTS",
  currentRolloutPlanStatus: "plan_only",
  currentRolloutValidationChecklistStatus: "checklist_only",
  currentOperatorRunbookStatus: "runbook_only",
  currentPostEnablementReviewTemplateStatus: "template_only",
  currentPhase2ExpansionContractStatus: "contract_only",
  currentPhase2ValidationChecklistStatus: "checklist_only",
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
  phase2OperatorTargets: ["code_review", "validation"],
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
  procedures,
  requiredProcedureCount: procedures.length,
  operatorTargets: ["code_review", "validation"],
  preValidationChecks: [
    "Readiness verdict is READY_WITH_CONSTRAINTS.",
    "Controlled rollout plan status is plan_only.",
    "Rollout validation checklist status is checklist_only.",
    "Operator runbook status is runbook_only.",
    "Post-enablement review template status is template_only.",
    "Phase-2 expansion contract status is contract_only.",
    "Phase-2 validation checklist status is checklist_only.",
    "Current validated request type remains review only.",
    "Phase-2 operator targets are code_review and validation only.",
    "Operator approval is present outside this repository process.",
  ],
  manualEnvironmentNotes: [
    "This runbook is documentation-only and does not execute Phase-2 validation.",
    "This repository must not enable Hermes dispatch by default.",
    "This PR must not add scripts, package commands, or CI behavior that set Hermes flags.",
    "All three required flags must be provided manually by an operator in a controlled environment.",
    "Phase-2 validation targets are code_review and validation only.",
    "Unsupported request types remain llm_task, code_generation, and bugfix.",
  ],
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
  disallowedOperatorEvidence: [
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
  rollbackTriggers: [
    "Hermes output becomes final code review decision.",
    "Hermes output becomes final validation decision.",
    "Gateway primary result changes.",
    "Gateway final result changes.",
    "Runtime final_status or routing changes.",
    "Unsupported request type invokes Hermes dispatcher.",
    "Raw prompt, raw artifact, or secret appears in sidecar metadata.",
    "Guardrails reject repeatedly due to warning limit or unsafe metadata.",
    "Any Phase-2 validation, expansion, audit, observability, or guardrail log is persisted without a separate contract.",
    "Any feature flag becomes enabled by default.",
  ],
  escalationTriggers: [
    "Phase-2 validation requires raw prompt, artifact, secret, stdout, stderr, full CLI output, or warning text.",
    "Hermes sidecar output is requested as final code_review or validation decision.",
    "Hermes is proposed as default or primary Gateway owner.",
    "Runtime final_status or routing is proposed to depend on Hermes sidecar.",
    "bugfix, llm_task, or code_generation support is requested without a separate contract.",
  ],
  allowedOperatorOutcomes: [
    "remain_review_only",
    "complete_phase_2_operator_validation",
    "rollback",
    "propose_separate_ownership_contract",
  ],
  runbookConstraints: [
    "This PR is runbook-only and does not execute Phase-2 validation.",
    "This PR does not expand request types now.",
    "This PR does not change actual Gateway dispatch behavior.",
    "This PR does not enable Hermes feature flags.",
    "This PR does not add enablement scripts or CI behavior.",
    "Phase-2 operator targets are code_review and validation only.",
    "Current validated request type remains review only.",
    "Hermes remains Gateway sidecar metadata only.",
    "Hermes remains default-off and requires explicit flags.",
    "Hermes must not become final review, code_review, or validation owner without a separate ownership contract.",
    "Runtime final_status and routing must not depend on Hermes sidecar output.",
    "No Phase-2 runbook, validation, expansion, review, rollout, audit, observability, or guardrail logs may persist without a separate contract.",
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
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_READINESS_REVIEW.md",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_CONTROLLED_ROLLOUT_PLAN.md",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_ROLLOUT_VALIDATION_CHECKLIST.md",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_OPERATOR_RUNBOOK.md",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_POST_ENABLEMENT_REVIEW_TEMPLATE.md",
    "docs/capabilities/hermes/phase-2/HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_EXPANSION_CONTRACT.md",
    "docs/capabilities/hermes/phase-2/HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_VALIDATION_CHECKLIST.md",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-readiness-review.json",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-controlled-rollout-plan.json",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-rollout-validation-checklist.json",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-operator-runbook.json",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-post-enablement-review-template.json",
    "metadata/capabilities/hermes/phase-2/hermes-gateway-real-dispatch-phase-2-expansion-contract.json",
    "metadata/capabilities/hermes/phase-2/hermes-gateway-real-dispatch-phase-2-validation-checklist.json",
    "execution/hermes-gateway-real-dispatch-phase-2-operator-runbook.ts",
    "tests/hermes-gateway-real-dispatch-phase-2-operator-runbook.test.ts",
    "docs/capabilities/hermes/phase-2/HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_OPERATOR_RUNBOOK.md",
    "metadata/capabilities/hermes/phase-2/hermes-gateway-real-dispatch-phase-2-operator-runbook.json",
  ],
  recommendedNextPr: "Hermes Gateway Real Dispatch Phase-2 Post-Validation Review Template",
};
