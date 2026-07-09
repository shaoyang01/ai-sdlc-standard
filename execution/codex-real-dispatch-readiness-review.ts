// Codex Real Dispatch Readiness Review
// =====================================
// Review-only static artifact. No Runtime, Gateway, CLI, filesystem, network, or process imports.
// Does not execute real Codex, enable flags, or change behavior.

export type CodexRealDispatchReadinessVerdict =
  | "READY_WITH_CONSTRAINTS"
  | "NOT_READY";

export interface CodexRealDispatchReadinessReview {
  name: "Codex Real Dispatch Readiness Review";
  adapter: "codex";
  scope: "real_dispatch_readiness_review";
  status: "review_only";
  reviewOnly: true;
  verdict: CodexRealDispatchReadinessVerdict;
  executingNow: false;
  enablesFeatureFlagsNow: false;
  expandsRequestTypesNow: false;
  changesRuntimeBehaviorNow: false;
  changesGatewayBehaviorNow: false;
  addsEnablementScripts: false;
  changesCiBehavior: false;
  defaultDisabled: true;
  featureFlagged: true;
  supportedRequestTypes: readonly ["code_generation"];
  unsupportedRequestTypes: readonly ["code_review", "validation", "bugfix", "llm_task", "review"];
  requiredFlags: readonly ["SDLC_EXECUTION_MODE=codex"];
  guardrails: {
    maxPromptChars: number;
    maxOutputChars: number;
    timeoutMs: number;
    prohibitRawPromptPersistence: true;
    prohibitSecrets: true;
    prohibitFullStdoutPersistence: true;
    prohibitFullStderrPersistence: true;
  };
  fallbackPolicy: {
    onCliMissing: "shadow_fallback";
    onTimeout: "shadow_fallback";
    onNonZeroExit: "shadow_fallback";
    onOutputTooLarge: "truncate_and_shadow_fallback";
  };
  observability: {
    persisted: false;
    includesRawPrompt: false;
    includesRawArtifacts: false;
    includesSecrets: false;
    includesFullStdout: false;
    includesFullStderr: false;
  };
  nonGoals: readonly string[];
  requiredBeforeEnablement: readonly string[];
  changesRuntimeFinalStatus: false;
  changesRuntimeRouting: false;
  changesGatewayPrimaryDispatch: false;
  changesGatewayFinalResult: false;
  affectsPrimaryGatewayResult: false;
  makesCodexDefault: false;
  makesCodexFinalReviewOwner: false;
  makesCodexFinalCodeReviewOwner: false;
  makesCodexFinalValidationOwner: false;
  writesFiles: false;
  persistsAudit: false;
  persistsObservability: false;
  persistsGuardrails: false;
  containsRawPrompt: false;
  containsRawArtifacts: false;
  containsSecrets: false;
  invokesRealCodexCliInTests: false;
  recommendedNextPr: "Codex Real Dispatch Fallback Policy Contract";
}

export const CODEX_REAL_DISPATCH_READINESS_REVIEW: CodexRealDispatchReadinessReview = {
  name: "Codex Real Dispatch Readiness Review",
  adapter: "codex",
  scope: "real_dispatch_readiness_review",
  status: "review_only",
  reviewOnly: true,
  verdict: "READY_WITH_CONSTRAINTS",
  executingNow: false,
  enablesFeatureFlagsNow: false,
  expandsRequestTypesNow: false,
  changesRuntimeBehaviorNow: false,
  changesGatewayBehaviorNow: false,
  addsEnablementScripts: false,
  changesCiBehavior: false,
  defaultDisabled: true,
  featureFlagged: true,
  supportedRequestTypes: ["code_generation"],
  unsupportedRequestTypes: ["code_review", "validation", "bugfix", "llm_task", "review"],
  requiredFlags: ["SDLC_EXECUTION_MODE=codex"],
  guardrails: {
    maxPromptChars: 20000,
    maxOutputChars: 50000,
    timeoutMs: 120000,
    prohibitRawPromptPersistence: true,
    prohibitSecrets: true,
    prohibitFullStdoutPersistence: true,
    prohibitFullStderrPersistence: true,
  },
  fallbackPolicy: {
    onCliMissing: "shadow_fallback",
    onTimeout: "shadow_fallback",
    onNonZeroExit: "shadow_fallback",
    onOutputTooLarge: "truncate_and_shadow_fallback",
  },
  observability: {
    persisted: false,
    includesRawPrompt: false,
    includesRawArtifacts: false,
    includesSecrets: false,
    includesFullStdout: false,
    includesFullStderr: false,
  },
  nonGoals: [
    "Do not change Runtime graph transitions.",
    "Do not change Runtime final_status semantics.",
    "Do not change Execution Gateway primary dispatch behavior.",
    "Do not change Execution Gateway final result shape.",
    "Do not expand supported request types beyond code_generation.",
    "Do not route code_review, validation, bugfix, llm_task, or review through Codex.",
    "Do not make Codex output a routing signal.",
    "Do not make Codex the default agent for any node.",
    "Do not make Codex the final owner of review, code_review, or validation decisions.",
    "Do not add package scripts, CI steps, or default environment values that enable real Codex.",
    "Do not persist raw prompts, raw artifacts, secrets, full stdout, or full stderr.",
    "Do not invoke real Codex CLI in tests.",
  ],
  requiredBeforeEnablement: [
    "Fallback policy contract defining shadow_fallback behavior for all CLI failure modes.",
    "Observability contract defining in-memory, summary-only, non-persisted observability signals.",
    "Operational guardrails contract enforcing prompt/output size limits and prohibited content.",
    "Prompt builder that consumes ImplementationExecutorInput instead of raw context dump.",
    "Output parser/sanitizer that converts Codex CLI stdout into code_patch artifacts without storing raw output.",
    "Fake-runner tests proving Gateway integration without real Codex CLI.",
    "Controlled rollout plan reviewed and approved by operator.",
  ],
  changesRuntimeFinalStatus: false,
  changesRuntimeRouting: false,
  changesGatewayPrimaryDispatch: false,
  changesGatewayFinalResult: false,
  affectsPrimaryGatewayResult: false,
  makesCodexDefault: false,
  makesCodexFinalReviewOwner: false,
  makesCodexFinalCodeReviewOwner: false,
  makesCodexFinalValidationOwner: false,
  writesFiles: false,
  persistsAudit: false,
  persistsObservability: false,
  persistsGuardrails: false,
  containsRawPrompt: false,
  containsRawArtifacts: false,
  containsSecrets: false,
  invokesRealCodexCliInTests: false,
  recommendedNextPr: "Codex Real Dispatch Fallback Policy Contract",
};
