// Hermes Gateway Real Dispatch Controlled Rollout Plan
// ====================================================
// Plan-only static artifact. No Runtime, Gateway, CLI, filesystem, or network imports.

export type HermesGatewayRealDispatchRolloutStatus =
  | "plan_only"
  | "not_started";

export type HermesGatewayRealDispatchRolloutPhaseName =
  | "phase_0_plan_only"
  | "phase_1_local_fake_dispatcher_validation"
  | "phase_2_ci_fake_runner_validation"
  | "phase_3_single_request_type_manual_enablement"
  | "phase_4_limited_operator_enablement"
  | "phase_5_post_rollout_readiness_review";

export interface HermesGatewayRealDispatchRolloutPhase {
  name: HermesGatewayRealDispatchRolloutPhaseName;
  status: "planned";
  executingNow: false;
  enablesFeatureFlagsNow: false;
  changesRuntimeBehaviorNow: false;
  changesGatewayBehaviorNow: false;
  allowedRequestTypes: readonly string[];
  requiredBeforeNextPhase: readonly string[];
  rollbackCriteria: readonly string[];
}

export interface HermesGatewayRealDispatchControlledRolloutPlan {
  name: "Hermes Gateway Real Dispatch Controlled Rollout Plan";
  adapter: "hermes";
  scope: "gateway_real_dispatch_sidecar_rollout_plan";
  status: HermesGatewayRealDispatchRolloutStatus;
  planOnly: true;
  executingNow: false;
  enablesFeatureFlagsNow: false;
  changesRuntimeBehaviorNow: false;
  changesGatewayBehaviorNow: false;
  readinessVerdictRequired: "READY_WITH_CONSTRAINTS";
  currentReadinessVerdict: "READY_WITH_CONSTRAINTS";
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
  supportedRequestTypes: readonly ["review", "code_review", "validation"];
  initialRolloutRequestTypes: readonly ["review"];
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
  persistsRolloutLogs: false;
  persistsAudit: false;
  persistsObservability: false;
  persistsGuardrails: false;
  containsRawPrompt: false;
  containsRawArtifacts: false;
  containsSecrets: false;
  rolloutPhases: readonly HermesGatewayRealDispatchRolloutPhase[];
  globalRollbackCriteria: readonly string[];
  rolloutConstraints: readonly string[];
  evidence: readonly string[];
  recommendedNextPr: "Hermes Gateway Real Dispatch Rollout Validation Checklist";
}

const commonPhaseGuards = {
  status: "planned" as const,
  executingNow: false as const,
  enablesFeatureFlagsNow: false as const,
  changesRuntimeBehaviorNow: false as const,
  changesGatewayBehaviorNow: false as const,
};

export const HERMES_GATEWAY_REAL_DISPATCH_CONTROLLED_ROLLOUT_PLAN: HermesGatewayRealDispatchControlledRolloutPlan = {
  name: "Hermes Gateway Real Dispatch Controlled Rollout Plan",
  adapter: "hermes",
  scope: "gateway_real_dispatch_sidecar_rollout_plan",
  status: "plan_only",
  planOnly: true,
  executingNow: false,
  enablesFeatureFlagsNow: false,
  changesRuntimeBehaviorNow: false,
  changesGatewayBehaviorNow: false,
  readinessVerdictRequired: "READY_WITH_CONSTRAINTS",
  currentReadinessVerdict: "READY_WITH_CONSTRAINTS",
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
  supportedRequestTypes: ["review", "code_review", "validation"],
  initialRolloutRequestTypes: ["review"],
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
  persistsRolloutLogs: false,
  persistsAudit: false,
  persistsObservability: false,
  persistsGuardrails: false,
  containsRawPrompt: false,
  containsRawArtifacts: false,
  containsSecrets: false,
  rolloutPhases: [
    {
      name: "phase_0_plan_only",
      ...commonPhaseGuards,
      allowedRequestTypes: [],
      requiredBeforeNextPhase: [
        "Controlled rollout plan reviewed and approved.",
        "Readiness verdict remains READY_WITH_CONSTRAINTS.",
      ],
      rollbackCriteria: [
        "Any request to enable flags in this PR.",
        "Any runtime or Gateway behavior change in this PR.",
      ],
    },
    {
      name: "phase_1_local_fake_dispatcher_validation",
      ...commonPhaseGuards,
      allowedRequestTypes: ["review"],
      requiredBeforeNextPhase: [
        "Local validation uses fake dispatcher only.",
        "No real Hermes CLI is invoked.",
        "Disabled and unsupported paths do not call dispatcher.",
        "Sidecar remains omitted on unsafe/exception paths.",
      ],
      rollbackCriteria: [
        "Fake validation shows primary Gateway result changes.",
        "Any raw prompt/artifact/secret appears in sidecar metadata.",
      ],
    },
    {
      name: "phase_2_ci_fake_runner_validation",
      ...commonPhaseGuards,
      allowedRequestTypes: ["review"],
      requiredBeforeNextPhase: [
        "CI validates fake runner/fake dispatcher only.",
        "Warning limit rejection is covered.",
        "Guardrails reject unsafe metadata.",
      ],
      rollbackCriteria: [
        "CI invokes real Hermes CLI.",
        "CI requires external services.",
      ],
    },
    {
      name: "phase_3_single_request_type_manual_enablement",
      ...commonPhaseGuards,
      allowedRequestTypes: ["review"],
      requiredBeforeNextPhase: [
        "Manual enablement remains operator-controlled.",
        "All three Hermes flags are explicitly enabled only in controlled environment.",
        "Sidecar metadata is reviewed for attach/omit behavior.",
      ],
      rollbackCriteria: [
        "Sidecar changes primary Gateway result.",
        "Sidecar changes Runtime final_status/routing.",
        "Dispatcher exception leaks raw text.",
      ],
    },
    {
      name: "phase_4_limited_operator_enablement",
      ...commonPhaseGuards,
      allowedRequestTypes: ["review", "code_review", "validation"],
      requiredBeforeNextPhase: [
        "Operators confirm request-type bounded behavior.",
        "No unsupported request types trigger dispatcher.",
        "Guardrails remain below warning threshold.",
      ],
      rollbackCriteria: [
        "Unsupported request type invokes dispatcher.",
        "Warning limit exceeded repeatedly.",
        "Any final review/validation ownership is inferred from sidecar output.",
      ],
    },
    {
      name: "phase_5_post_rollout_readiness_review",
      ...commonPhaseGuards,
      allowedRequestTypes: ["review", "code_review", "validation"],
      requiredBeforeNextPhase: [
        "Post-rollout readiness review is completed.",
        "Any move from sidecar metadata to decision ownership has a separate contract.",
      ],
      rollbackCriteria: [
        "Rollout proposes Hermes as default.",
        "Rollout proposes primary Gateway result ownership without separate contract.",
      ],
    },
  ],
  globalRollbackCriteria: [
    "Any Hermes sidecar output changes Gateway primary result.",
    "Any Hermes sidecar output changes Gateway final result.",
    "Any Hermes sidecar output changes Runtime final_status or routing.",
    "Any unsupported request type invokes Hermes dispatcher.",
    "Any raw prompt, raw artifact, or secret appears in sidecar metadata.",
    "Any persisted rollout, audit, observability, or guardrail log is introduced without a separate contract.",
    "Any real Hermes CLI invocation appears in tests.",
    "Any feature flag becomes enabled by default.",
  ],
  rolloutConstraints: [
    "This PR is plan-only and does not execute rollout.",
    "Hermes remains Gateway sidecar metadata only.",
    "Hermes remains default-off and requires explicit flags.",
    "Hermes may initially roll out only for review request type.",
    "Expansion to code_review and validation requires operator approval.",
    "Hermes must not become final review or validation owner without a separate contract.",
    "Runtime final_status and routing must not depend on Hermes sidecar output.",
    "No rollout logs, audit logs, observability logs, or guardrail logs may persist without a separate contract.",
  ],
  evidence: [
    "execution/hermes-gateway-real-dispatch-readiness-review.ts",
    "HERMES_GATEWAY_REAL_DISPATCH_READINESS_REVIEW.md",
    "hermes-gateway-real-dispatch-readiness-review.json",
    "execution/hermes-gateway-real-dispatch-controlled-rollout-plan.ts",
    "tests/hermes-gateway-real-dispatch-controlled-rollout-plan.test.ts",
    "HERMES_GATEWAY_REAL_DISPATCH_CONTROLLED_ROLLOUT_PLAN.md",
    "hermes-gateway-real-dispatch-controlled-rollout-plan.json",
  ],
  recommendedNextPr: "Hermes Gateway Real Dispatch Rollout Validation Checklist",
};
