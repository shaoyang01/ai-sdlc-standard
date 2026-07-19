// Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Plan
// =================================================================================
// Plan-only static artifact. This plan records the controlled-rollout phase
// structure, per-phase request caps, evidence policy, global stop conditions,
// and global rollback actions that any future separately-authorized operator
// action must follow. It does not execute rollout, does not execute operator
// actions, does not enable feature flags, and does not change Runtime/Gateway
// behavior. Merging this plan does not authorize operator action or rollout;
// the next governance decision is a separate operator action authorization.

export type HermesGatewayRealDispatchPhase2ShadowEnablementControlledRolloutPhase = Readonly<{
  id: string;
  status: string;
  executionMode: string;
  allowedRequestTypes: readonly string[];
  maxRealRequests: number;
  requiresExplicitProjectControllerApproval: boolean;
  requiresOperatorApproval: boolean;
  executingNow: boolean;
  operatorActionExecuted: boolean;
  rolloutExecuted: boolean;
  entryCriteria: readonly string[];
  successCriteria: readonly string[];
  stopCriteria: readonly string[];
  rollbackActions: readonly string[];
}>;

export type HermesGatewayRealDispatchPhase2ShadowEnablementControlledRolloutPlan = Readonly<{
  name: string;
  adapter: string;
  scope: string;
  status: string;
  planOnly: boolean;
  planExists: boolean;
  executingNow: boolean;
  executesRolloutNow: boolean;
  executesOperatorActionsNow: boolean;
  enablesFeatureFlagsNow: boolean;
  expandsRequestTypesNow: boolean;
  changesRuntimeBehaviorNow: boolean;
  changesGatewayPrimaryDispatchNow: boolean;
  changesGatewayFinalResultNow: boolean;
  changesHermesDispatchEligibilityNow: boolean;
  makesHermesDefaultNow: boolean;
  makesHermesFinalOwnerNow: boolean;
  addsPackageScriptFlagEnablementNow: boolean;
  changesCiBehaviorNow: boolean;
  persistsLogsNow: boolean;
  currentReadinessVerdict: string;
  implementationStatus: string;
  validationStatus: string;
  operatorAcceptanceStatus: string;
  controlledRolloutGateStatus: string;
  implementationAuthorizationScope: string;
  operatorActionAuthorization: string;
  rolloutAuthorization: string;
  operatorApprovalRequired: boolean;
  perPhaseApprovalRequired: boolean;
  perRequestOperatorApprovalRequired: boolean;
  automaticEnablementAllowed: boolean;
  rolloutMayProceedAutomatically: boolean;
  operatorActionExecuted: boolean;
  rolloutExecuted: boolean;
  defaultDisabled: boolean;
  sidecarOnly: boolean;
  gatewayPrimaryResultPreserved: boolean;
  gatewayFinalResultPreserved: boolean;
  runtimeFinalStatusPreserved: boolean;
  runtimeRoutingPreserved: boolean;
  hermesFinalReviewOwner: boolean;
  hermesFinalCodeReviewOwner: boolean;
  hermesFinalValidationOwner: boolean;
  requiredFlags: readonly string[];
  currentValidatedRequestTypes: readonly string[];
  phase2ShadowTargets: readonly string[];
  supportedRequestTypes: readonly string[];
  initialRolloutRequestTypes: readonly string[];
  unsupportedRequestTypes: readonly string[];
  rolloutPhases: readonly HermesGatewayRealDispatchPhase2ShadowEnablementControlledRolloutPhase[];
  evidencePolicy: Readonly<{
    mode: string;
    automaticCollectionAllowed: boolean;
    persistedByPlan: boolean;
    repositoryPersistenceAllowed: boolean;
    manualSummaryRequiredAfterEachPhase: boolean;
    allowedSanitizedFields: readonly string[];
    forbiddenContent: readonly string[];
    definesPolicyOnly: boolean;
    collectsEvidenceNow: boolean;
    persistsEvidenceNow: boolean;
  }>;
  globalStopConditions: readonly string[];
  globalRollbackActions: readonly string[];
  legacyRecommendedNextPrFulfilled: boolean;
  nextGovernanceDecision: string;
  evidence: readonly string[];
}>;

export const HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_CONTROLLED_ROLLOUT_PLAN: HermesGatewayRealDispatchPhase2ShadowEnablementControlledRolloutPlan = {
  name: "Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Plan",
  adapter: "hermes",
  scope: "gateway_real_dispatch_sidecar_phase_2_shadow_enablement_controlled_rollout_plan",
  status: "plan_only",
  planOnly: true,
  planExists: true,
  executingNow: false,
  executesRolloutNow: false,
  executesOperatorActionsNow: false,
  enablesFeatureFlagsNow: false,
  expandsRequestTypesNow: false,
  changesRuntimeBehaviorNow: false,
  changesGatewayPrimaryDispatchNow: false,
  changesGatewayFinalResultNow: false,
  changesHermesDispatchEligibilityNow: false,
  makesHermesDefaultNow: false,
  makesHermesFinalOwnerNow: false,
  addsPackageScriptFlagEnablementNow: false,
  changesCiBehaviorNow: false,
  persistsLogsNow: false,

  currentReadinessVerdict: "READY_WITH_CONSTRAINTS",
  implementationStatus: "implemented_phase_2_shadow_sidecar_only",
  validationStatus: "implemented_phase_2_shadow_sidecar_validation_only",
  operatorAcceptanceStatus: "operator_acceptance_only",
  controlledRolloutGateStatus: "controlled_rollout_gate_only",
  implementationAuthorizationScope: "plan_material_only",
  operatorActionAuthorization: "not_granted",
  rolloutAuthorization: "not_granted",

  operatorApprovalRequired: true,
  perPhaseApprovalRequired: true,
  perRequestOperatorApprovalRequired: true,
  automaticEnablementAllowed: false,
  rolloutMayProceedAutomatically: false,
  operatorActionExecuted: false,
  rolloutExecuted: false,

  defaultDisabled: true,
  sidecarOnly: true,
  gatewayPrimaryResultPreserved: true,
  gatewayFinalResultPreserved: true,
  runtimeFinalStatusPreserved: true,
  runtimeRoutingPreserved: true,

  hermesFinalReviewOwner: false,
  hermesFinalCodeReviewOwner: false,
  hermesFinalValidationOwner: false,

  requiredFlags: [
    "SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled",
    "SDLC_HERMES_GATEWAY_INTEGRATION=enabled",
    "SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled",
  ],
  currentValidatedRequestTypes: ["review"],
  phase2ShadowTargets: ["code_review", "validation"],
  supportedRequestTypes: ["review", "code_review", "validation"],
  initialRolloutRequestTypes: ["code_review"],
  unsupportedRequestTypes: ["llm_task", "code_generation", "bugfix"],

  rolloutPhases: [
    {
      id: "phase_0_plan_approval",
      status: "planned",
      executionMode: "none",
      allowedRequestTypes: [],
      maxRealRequests: 0,
      requiresExplicitProjectControllerApproval: true,
      requiresOperatorApproval: true,
      executingNow: false,
      operatorActionExecuted: false,
      rolloutExecuted: false,
      entryCriteria: [
        "this plan file is merged into the fact branch",
        "the Project Controller separately approves this plan",
        "operator, controlled environment, and rollback owner are identified in a separate authorization",
      ],
      successCriteria: [
        "Project Controller plan approval is recorded",
        "operator, controlled environment, and rollback owner assignments are recorded in the separate authorization",
      ],
      stopCriteria: [
        "plan approval is missing or withdrawn",
        "operator, controlled environment, or rollback owner is not identified",
      ],
      rollbackActions: [
        "do not proceed to phase_1_fake_preflight",
        "report the missing approval or assignment to the Project Controller",
      ],
    },
    {
      id: "phase_1_fake_preflight",
      status: "planned",
      executionMode: "fake_only",
      allowedRequestTypes: [],
      maxRealRequests: 0,
      requiresExplicitProjectControllerApproval: true,
      requiresOperatorApproval: true,
      executingNow: false,
      operatorActionExecuted: false,
      rolloutExecuted: false,
      entryCriteria: [
        "phase_0_plan_approval succeeded",
        "only fake dispatcher and fake runner are used; no real Hermes CLI is invoked; no external service is accessed",
      ],
      successCriteria: [
        "disabled, missing-flag, missing-approval, unsupported, unsafe, exception, guardrail-refusal, and rollback-required paths all pass with the fake dispatcher",
        "all three CI jobs and all related tests pass",
      ],
      stopCriteria: [
        "any fake-preflight path fails",
        "a real Hermes CLI or external service is invoked",
      ],
      rollbackActions: [
        "stop the preflight and keep all three flags absent",
        "report the failing path to the Project Controller",
      ],
    },
    {
      id: "phase_2_code_review_canary_one",
      status: "planned",
      executionMode: "controlled_real_sidecar",
      allowedRequestTypes: ["code_review"],
      maxRealRequests: 1,
      requiresExplicitProjectControllerApproval: true,
      requiresOperatorApproval: true,
      executingNow: false,
      operatorActionExecuted: false,
      rolloutExecuted: false,
      entryCriteria: [
        "phase_1_fake_preflight succeeded and the Project Controller grants a new explicit approval for this phase",
        "all three required flags are provided temporarily by the operator in an explicit controlled non-default environment",
        "the single code_review request carries hermesPhase2ShadowEnablement operator approval",
      ],
      successCriteria: [
        "exactly one code_review controlled real sidecar request completes with guardrails allowed and decision allow",
        "Gateway primary/final result and Runtime final_status/routing are unchanged",
        "no automatic progression to the next phase occurs",
      ],
      stopCriteria: [
        "any required flag or per-request operator approval is missing",
        "any warning, guardrail refusal, exception, sanitization failure, or rollback-required outcome occurs",
      ],
      rollbackActions: [
        "stop further controlled requests immediately",
        "remove all three Hermes flags from the controlled environment",
        "produce only a manual sanitized summary and report to the Project Controller",
      ],
    },
    {
      id: "phase_3_code_review_limited_max_five",
      status: "planned",
      executionMode: "controlled_real_sidecar",
      allowedRequestTypes: ["code_review"],
      maxRealRequests: 5,
      requiresExplicitProjectControllerApproval: true,
      requiresOperatorApproval: true,
      executingNow: false,
      operatorActionExecuted: false,
      rolloutExecuted: false,
      entryCriteria: [
        "phase_2_code_review_canary_one succeeded and the Project Controller grants a new explicit approval for this phase",
        "every additional code_review request carries per-request operator approval",
      ],
      successCriteria: [
        "at most five additional code_review controlled real sidecar requests complete within all stop conditions",
        "Gateway primary/final result and Runtime final_status/routing remain unchanged",
      ],
      stopCriteria: [
        "any request lacks per-request operator approval",
        "any warning, guardrail refusal, exception, sanitization failure, or rollback-required outcome occurs",
        "the cap of five additional requests would be exceeded",
      ],
      rollbackActions: [
        "stop further controlled requests immediately",
        "remove all three Hermes flags from the controlled environment",
        "produce only a manual sanitized summary and report completed request counts to the Project Controller",
      ],
    },
    {
      id: "phase_4_validation_canary_one",
      status: "planned",
      executionMode: "controlled_real_sidecar",
      allowedRequestTypes: ["validation"],
      maxRealRequests: 1,
      requiresExplicitProjectControllerApproval: true,
      requiresOperatorApproval: true,
      executingNow: false,
      operatorActionExecuted: false,
      rolloutExecuted: false,
      entryCriteria: [
        "phase_3_code_review_limited_max_five succeeded and the Project Controller grants a new explicit approval for this phase",
        "the single validation request carries per-request operator approval",
        "no other request type is expanded at the same time",
      ],
      successCriteria: [
        "exactly one validation controlled real sidecar request completes with guardrails allowed and decision allow",
        "Gateway primary/final result and Runtime final_status/routing remain unchanged",
      ],
      stopCriteria: [
        "any required flag or per-request operator approval is missing",
        "any warning, guardrail refusal, exception, sanitization failure, or rollback-required outcome occurs",
      ],
      rollbackActions: [
        "stop further controlled requests immediately",
        "remove all three Hermes flags from the controlled environment",
        "produce only a manual sanitized summary and report to the Project Controller",
      ],
    },
    {
      id: "phase_5_mixed_limited_max_five",
      status: "planned",
      executionMode: "controlled_real_sidecar",
      allowedRequestTypes: ["code_review", "validation"],
      maxRealRequests: 5,
      requiresExplicitProjectControllerApproval: true,
      requiresOperatorApproval: true,
      executingNow: false,
      operatorActionExecuted: false,
      rolloutExecuted: false,
      entryCriteria: [
        "phase_4_validation_canary_one succeeded and the Project Controller grants a new explicit approval for this phase",
        "every additional request carries per-request operator approval",
      ],
      successCriteria: [
        "at most five additional requests in total across code_review and validation complete within all stop conditions",
        "review, llm_task, code_generation, and bugfix are never dispatched",
        "Gateway primary/final result and Runtime final_status/routing remain unchanged",
      ],
      stopCriteria: [
        "any request lacks per-request operator approval",
        "any warning, guardrail refusal, exception, sanitization failure, or rollback-required outcome occurs",
        "the combined cap of five requests would be exceeded",
      ],
      rollbackActions: [
        "stop further controlled requests immediately",
        "remove all three Hermes flags from the controlled environment",
        "produce only a manual sanitized summary and report completed request counts to the Project Controller",
      ],
    },
    {
      id: "phase_6_post_rollout_review",
      status: "planned",
      executionMode: "none",
      allowedRequestTypes: [],
      maxRealRequests: 0,
      requiresExplicitProjectControllerApproval: true,
      requiresOperatorApproval: true,
      executingNow: false,
      operatorActionExecuted: false,
      rolloutExecuted: false,
      entryCriteria: [
        "new controlled requests are stopped first",
        "all three temporary flags are removed from the controlled environment",
      ],
      successCriteria: [
        "manual sanitized summaries are reviewed",
        "Gateway, Runtime, ownership, and leakage/persistence boundaries are confirmed unchanged",
      ],
      stopCriteria: [
        "any leakage or persistence is detected",
        "Gateway primary/final result or Runtime final_status/routing changed",
      ],
      rollbackActions: [
        "do not expand scope or make Hermes a default path before an independent post-rollout review completes",
        "report findings to the Project Controller",
      ],
    },
  ],

  evidencePolicy: {
    mode: "manual_sanitized_summary_only",
    automaticCollectionAllowed: false,
    persistedByPlan: false,
    repositoryPersistenceAllowed: false,
    manualSummaryRequiredAfterEachPhase: true,
    allowedSanitizedFields: [
      "source_fact_head",
      "plan_status",
      "phase_id",
      "environment_class",
      "request_type",
      "attempted_count",
      "attached_count",
      "omitted_count",
      "dispatcher_call_count",
      "fallback_reason_counts",
      "guardrail_decision_counts",
      "rollback_decision_counts",
      "warning_count_total",
      "warning_count_max",
      "gateway_primary_preserved",
      "gateway_final_preserved",
      "runtime_final_status_preserved",
      "runtime_routing_preserved",
      "unsupported_dispatch_count",
      "leakage_detected",
      "persistence_detected",
      "stop_triggered",
      "stop_reason_enum",
    ],
    forbiddenContent: [
      "raw prompt",
      "raw artifacts",
      "request input or payload",
      "requirement ID",
      "repository content",
      "business or customer data",
      "secrets, tokens, credentials, or API keys",
      "stdout",
      "stderr",
      "full CLI output",
      "full warning text",
      "unbounded exception text",
      "real personal names",
      "unsanitized environment identifiers",
      "automatically generated long-term logs",
      "validation, rollout, audit, observability, guardrail, rollback, or operator raw logs",
    ],
    definesPolicyOnly: true,
    collectsEvidenceNow: false,
    persistsEvidenceNow: false,
  },

  globalStopConditions: [
    "a separate Project Controller phase approval is missing",
    "operator, controlled environment, or rollback owner is not identified",
    "any real request is missing any of the three required flags",
    "any real request is missing per-request operator approval",
    "an unsupported request type invokes the dispatcher",
    "an approved canary or limited request does not attach the expected safe sidecar",
    "a dispatcher exception, sanitization failure, guardrail refusal, or rollback-required outcome occurs",
    "guardrails.allowed is not true or guardrails.decision is not allow",
    "Gateway primary result or Gateway final result changes",
    "Runtime final_status or Runtime routing changes",
    "Hermes is inferred to be the final review, code_review, or validation owner",
    "raw prompt, artifact, business data, secret, stdout, stderr, full CLI output, or full warning text leaks",
    "any persistence not separately approved is introduced",
    "package.json, scripts, or CI sets Hermes flags by default",
    "a feature flag becomes enabled by default",
    "a test invokes a real Hermes CLI or an external service",
    "phase request types or the 1/5/1/5 caps are exceeded",
    "any warning pauses further requests for manual review; exceeding the existing guardrail warning limit stops and rolls back",
    "a phase is entered automatically without a new approval",
    "a change to Runtime, Gateway, ownership, request-type contracts, or persistence contracts is required",
  ],

  globalRollbackActions: [
    "stop new controlled requests immediately",
    "remove all three Hermes flags from the controlled environment",
    "stop providing hermesPhase2ShadowEnablement operator approval",
    "confirm the disabled path does not invoke the dispatcher and does not attach the sidecar",
    "confirm Gateway primary/final result and Runtime final_status/routing are unchanged",
    "produce only a manual sanitized summary; do not keep raw inputs, outputs, or logs",
    "report the stop reason and completed request counts to the Project Controller",
    "do not resume a phase or expand scope without a new explicit approval",
  ],

  legacyRecommendedNextPrFulfilled: true,
  nextGovernanceDecision: "separate_operator_action_authorization",

  evidence: [
    "execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement-controlled-rollout-plan.ts",
    "tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement-controlled-rollout-plan.test.ts",
    "docs/capabilities/hermes/phase-2/HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_CONTROLLED_ROLLOUT_PLAN.md",
    "metadata/capabilities/hermes/phase-2/hermes-gateway-real-dispatch-phase-2-shadow-enablement-controlled-rollout-plan.json",
  ],
};
