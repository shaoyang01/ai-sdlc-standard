// Hermes Gateway Real Dispatch Operator Runbook
// =============================================
// Runbook-only static artifact. No Runtime, Gateway, CLI, filesystem, network, or process imports.

export type HermesGatewayRealDispatchOperatorRunbookStatus =
  | "runbook_only"
  | "not_started";

export type HermesGatewayRealDispatchOperatorProcedureCategory =
  | "pre_enablement"
  | "manual_enablement"
  | "validation"
  | "monitoring"
  | "rollback"
  | "escalation";

export interface HermesGatewayRealDispatchOperatorProcedure {
  id: string;
  category: HermesGatewayRealDispatchOperatorProcedureCategory;
  status: "documented";
  executingNow: false;
  enablesFeatureFlagsNow: false;
  changesRuntimeBehaviorNow: false;
  changesGatewayBehaviorNow: false;
  requiresOperatorAction: boolean;
  description: string;
  steps: readonly string[];
  successCriteria: readonly string[];
  stopCriteria: readonly string[];
}

export interface HermesGatewayRealDispatchOperatorRunbook {
  name: "Hermes Gateway Real Dispatch Operator Runbook";
  adapter: "hermes";
  scope: "gateway_real_dispatch_sidecar_operator_runbook";
  status: HermesGatewayRealDispatchOperatorRunbookStatus;
  runbookOnly: true;
  executingNow: false;
  enablesFeatureFlagsNow: false;
  changesRuntimeBehaviorNow: false;
  changesGatewayBehaviorNow: false;
  addsEnablementScripts: false;
  changesCiBehavior: false;
  readinessVerdictRequired: "READY_WITH_CONSTRAINTS";
  rolloutPlanStatusRequired: "plan_only";
  rolloutValidationChecklistStatusRequired: "checklist_only";
  currentReadinessVerdict: "READY_WITH_CONSTRAINTS";
  currentRolloutPlanStatus: "plan_only";
  currentRolloutValidationChecklistStatus: "checklist_only";
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
  initialOperatorRequestTypes: readonly ["review"];
  supportedRequestTypes: readonly ["review", "code_review", "validation"];
  unsupportedRequestTypes: readonly ["llm_task", "code_generation", "bugfix"];
  operatorApprovalRequired: true;
  rolloutMayProceedAutomatically: false;
  automaticEnablementAllowed: false;
  changesGatewayPrimaryDispatch: false;
  changesGatewayFinalResult: false;
  changesRuntimeFinalStatus: false;
  changesRuntimeRouting: false;
  affectsPrimaryGatewayResult: false;
  makesHermesDefault: false;
  makesHermesFinalReviewOwner: false;
  makesHermesFinalValidationOwner: false;
  writesFiles: false;
  persistsRunbookLogs: false;
  persistsValidationLogs: false;
  persistsRolloutLogs: false;
  persistsAudit: false;
  persistsObservability: false;
  persistsGuardrails: false;
  containsRawPrompt: false;
  containsRawArtifacts: false;
  containsSecrets: false;
  procedures: readonly HermesGatewayRealDispatchOperatorProcedure[];
  requiredProcedureCount: number;
  preEnablementChecks: readonly string[];
  manualEnablementNotes: readonly string[];
  monitoringSignals: readonly string[];
  rollbackTriggers: readonly string[];
  escalationTriggers: readonly string[];
  runbookConstraints: readonly string[];
  evidence: readonly string[];
  recommendedNextPr: "Hermes Gateway Real Dispatch Post-Enablement Review Template";
}

const commonProcedureGuards = {
  status: "documented" as const,
  executingNow: false as const,
  enablesFeatureFlagsNow: false as const,
  changesRuntimeBehaviorNow: false as const,
  changesGatewayBehaviorNow: false as const,
};

const procedures: readonly HermesGatewayRealDispatchOperatorProcedure[] = [
  {
    id: "pre_enablement_review",
    category: "pre_enablement",
    ...commonProcedureGuards,
    requiresOperatorAction: true,
    description: "Confirm readiness, rollout plan, and validation checklist before any manual enablement.",
    steps: [
      "Confirm readiness verdict is READY_WITH_CONSTRAINTS.",
      "Confirm controlled rollout plan status is plan_only.",
      "Confirm rollout validation checklist status is checklist_only.",
      "Confirm initial operator scope is review only.",
      "Confirm no automatic rollout or automatic enablement path exists.",
    ],
    successCriteria: [
      "All prerequisite artifacts are present and current.",
      "Operator approval is recorded outside this repository process.",
    ],
    stopCriteria: [
      "Readiness verdict is not READY_WITH_CONSTRAINTS.",
      "Rollout validation checklist is missing or failed.",
    ],
  },
  {
    id: "manual_flag_enablement_reference",
    category: "manual_enablement",
    ...commonProcedureGuards,
    requiresOperatorAction: true,
    description: "Document the flags an operator would manually provide in a controlled environment.",
    steps: [
      "In an operator-managed environment only, provide SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled.",
      "In the same controlled environment, provide SDLC_HERMES_GATEWAY_INTEGRATION=enabled.",
      "In the same controlled environment, provide SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled.",
      "Limit initial requests to review.",
    ],
    successCriteria: [
      "All three required flags are explicitly set by the operator in the controlled environment.",
      "No repository default or CI default enables these flags.",
    ],
    stopCriteria: [
      "Any flag is enabled by default in code, package scripts, CI, or tests.",
      "Any request type outside review is included before approval.",
    ],
  },
  {
    id: "sidecar_validation",
    category: "validation",
    ...commonProcedureGuards,
    requiresOperatorAction: true,
    description: "Validate Hermes sidecar behavior after manual operator enablement.",
    steps: [
      "Submit a controlled review request.",
      "Confirm Gateway primary result is unchanged.",
      "Confirm hermes_gateway_real_dispatch appears only as sidecar metadata when safe.",
      "Confirm fallbackPolicy, observability, and guardrails are nested under the sidecar.",
      "Confirm unsupported request types do not call dispatcher.",
    ],
    successCriteria: [
      "Sidecar attaches only for safe review requests.",
      "Unsupported request types remain omitted.",
      "Primary Gateway result and Runtime final_status/routing are unchanged.",
    ],
    stopCriteria: [
      "Hermes output changes primary Gateway result.",
      "Runtime final_status or routing changes because of Hermes sidecar.",
      "Unsupported request type invokes dispatcher.",
    ],
  },
  {
    id: "monitoring_signals_review",
    category: "monitoring",
    ...commonProcedureGuards,
    requiresOperatorAction: true,
    description: "Review in-memory sidecar signals for safe attach/omit behavior.",
    steps: [
      "Inspect fallbackPolicy reason/action.",
      "Inspect observability outcome and warningCount only.",
      "Inspect guardrails decision and checks.",
      "Confirm no raw warning text, raw prompt, raw artifact, or secret appears.",
    ],
    successCriteria: [
      "observability contains counts/booleans only.",
      "guardrails decision is allow_attach only for safe bounded metadata.",
      "no persistence is introduced.",
    ],
    stopCriteria: [
      "raw prompt/artifact/secret appears.",
      "guardrails rejects repeatedly due to warning limits or unsafe metadata.",
      "any observability/guardrail logs are persisted without a separate contract.",
    ],
  },
  {
    id: "rollback_procedure",
    category: "rollback",
    ...commonProcedureGuards,
    requiresOperatorAction: true,
    description: "Roll back by removing manual operator-provided enablement and returning to default-off sidecar omission.",
    steps: [
      "Remove SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled from the controlled environment.",
      "Remove SDLC_HERMES_GATEWAY_INTEGRATION=enabled from the controlled environment.",
      "Remove SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled from the controlled environment.",
      "Confirm disabled path does not call dispatcher.",
      "Confirm Gateway primary result is unchanged.",
    ],
    successCriteria: [
      "Hermes dispatcher is not called after flags are removed.",
      "hermes_gateway_real_dispatch is omitted.",
      "Gateway and Runtime behavior remain unchanged.",
    ],
    stopCriteria: [
      "Dispatcher is still called after manual flags are removed.",
      "Sidecar remains attached after rollback.",
    ],
  },
  {
    id: "escalation_path",
    category: "escalation",
    ...commonProcedureGuards,
    requiresOperatorAction: true,
    description: "Escalate if safety boundaries are violated during operator-managed validation.",
    steps: [
      "Stop manual enablement immediately.",
      "Preserve non-sensitive reproduction details outside sidecar metadata.",
      "Open a follow-up review issue or PR with sanitized evidence.",
      "Do not persist raw prompts, artifacts, secrets, stdout, or stderr.",
    ],
    successCriteria: [
      "Enablement is stopped.",
      "Evidence is sanitized.",
      "Follow-up work preserves sidecar-only constraints.",
    ],
    stopCriteria: [
      "Raw prompt/artifact/secret would need to be persisted.",
      "Follow-up proposes Hermes as default or primary Gateway owner without separate contract.",
    ],
  },
];

export const HERMES_GATEWAY_REAL_DISPATCH_OPERATOR_RUNBOOK: HermesGatewayRealDispatchOperatorRunbook = {
  name: "Hermes Gateway Real Dispatch Operator Runbook",
  adapter: "hermes",
  scope: "gateway_real_dispatch_sidecar_operator_runbook",
  status: "runbook_only",
  runbookOnly: true,
  executingNow: false,
  enablesFeatureFlagsNow: false,
  changesRuntimeBehaviorNow: false,
  changesGatewayBehaviorNow: false,
  addsEnablementScripts: false,
  changesCiBehavior: false,
  readinessVerdictRequired: "READY_WITH_CONSTRAINTS",
  rolloutPlanStatusRequired: "plan_only",
  rolloutValidationChecklistStatusRequired: "checklist_only",
  currentReadinessVerdict: "READY_WITH_CONSTRAINTS",
  currentRolloutPlanStatus: "plan_only",
  currentRolloutValidationChecklistStatus: "checklist_only",
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
  initialOperatorRequestTypes: ["review"],
  supportedRequestTypes: ["review", "code_review", "validation"],
  unsupportedRequestTypes: ["llm_task", "code_generation", "bugfix"],
  operatorApprovalRequired: true,
  rolloutMayProceedAutomatically: false,
  automaticEnablementAllowed: false,
  changesGatewayPrimaryDispatch: false,
  changesGatewayFinalResult: false,
  changesRuntimeFinalStatus: false,
  changesRuntimeRouting: false,
  affectsPrimaryGatewayResult: false,
  makesHermesDefault: false,
  makesHermesFinalReviewOwner: false,
  makesHermesFinalValidationOwner: false,
  writesFiles: false,
  persistsRunbookLogs: false,
  persistsValidationLogs: false,
  persistsRolloutLogs: false,
  persistsAudit: false,
  persistsObservability: false,
  persistsGuardrails: false,
  containsRawPrompt: false,
  containsRawArtifacts: false,
  containsSecrets: false,
  procedures,
  requiredProcedureCount: procedures.length,
  preEnablementChecks: [
    "Readiness verdict is READY_WITH_CONSTRAINTS.",
    "Controlled rollout plan status is plan_only.",
    "Rollout validation checklist status is checklist_only.",
    "Operator approval is present outside this repository process.",
    "Initial operator request type is review only.",
    "All three required flags are manually supplied only in a controlled environment.",
    "No repository default, package script, CI, or test enables Hermes dispatch.",
    "Rollback owner and stop criteria are identified before enablement.",
  ],
  manualEnablementNotes: [
    "This runbook documents manual operator-managed enablement only.",
    "This repository must not enable Hermes dispatch by default.",
    "This PR must not add scripts or package commands that set Hermes flags.",
    "All three required flags must be provided explicitly by an operator in a controlled environment.",
    "Initial operator validation is limited to review request type.",
    "Expansion to code_review and validation requires separate operator approval.",
  ],
  monitoringSignals: [
    "fallbackPolicy.reason",
    "fallbackPolicy.action",
    "observability.outcome",
    "observability.warningCount",
    "observability.hasWarnings",
    "guardrails.decision",
    "guardrails.allowed",
    "guardrails.checks",
  ],
  rollbackTriggers: [
    "Gateway primary result changes.",
    "Gateway final result changes.",
    "Runtime final_status or routing changes.",
    "Unsupported request type invokes Hermes dispatcher.",
    "Hermes sidecar includes raw prompt, raw artifact, or secret.",
    "Guardrails reject repeatedly due to warning limit or unsafe metadata.",
    "Any validation, rollout, audit, observability, or guardrail log is persisted without a separate contract.",
    "Any feature flag becomes enabled by default.",
  ],
  escalationTriggers: [
    "Raw prompt, artifact, secret, stdout, or stderr would need to be persisted.",
    "Hermes sidecar output is requested as final review or validation decision.",
    "Hermes is proposed as default or primary Gateway owner.",
    "Runtime final_status or routing is proposed to depend on Hermes sidecar.",
    "Unsupported request type support is requested without a separate contract.",
  ],
  runbookConstraints: [
    "This PR is runbook-only and does not execute operator actions.",
    "This PR does not enable Hermes feature flags.",
    "This PR does not add enablement scripts or package commands.",
    "Hermes remains Gateway sidecar metadata only.",
    "Hermes remains default-off and requires explicit flags.",
    "Initial operator validation is review-only.",
    "Expansion to code_review and validation requires operator approval.",
    "Hermes must not become final review or validation owner without a separate contract.",
    "Runtime final_status and routing must not depend on Hermes sidecar output.",
    "No validation, rollout, audit, observability, guardrail, or runbook logs may persist without a separate contract.",
    "No automatic rollout or automatic enablement is allowed.",
  ],
  evidence: [
    "execution/hermes-gateway-real-dispatch-readiness-review.ts",
    "execution/hermes-gateway-real-dispatch-controlled-rollout-plan.ts",
    "execution/hermes-gateway-real-dispatch-rollout-validation-checklist.ts",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_READINESS_REVIEW.md",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_CONTROLLED_ROLLOUT_PLAN.md",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_ROLLOUT_VALIDATION_CHECKLIST.md",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-readiness-review.json",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-controlled-rollout-plan.json",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-rollout-validation-checklist.json",
    "execution/hermes-gateway-real-dispatch-operator-runbook.ts",
    "tests/hermes-gateway-real-dispatch-operator-runbook.test.ts",
    "docs/capabilities/hermes/phase-1/HERMES_GATEWAY_REAL_DISPATCH_OPERATOR_RUNBOOK.md",
    "metadata/capabilities/hermes/phase-1/hermes-gateway-real-dispatch-operator-runbook.json",
  ],
  recommendedNextPr: "Hermes Gateway Real Dispatch Post-Enablement Review Template",
};
