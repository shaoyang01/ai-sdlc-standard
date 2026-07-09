// Codex Real Dispatch Fallback Policy
// =====================================
// Contract-only fallback policy for future controlled Codex real dispatch.
// No Runtime, Gateway, CLI, filesystem, network, or process imports.
// Does not execute real Codex or change any behavior.

export type CodexFallbackReason =
  | "cli_missing"
  | "timeout"
  | "non_zero_exit"
  | "output_too_large"
  | "prompt_too_large"
  | "prohibited_content"
  | "unsupported_request_type"
  | "unknown_error";

export type CodexFallbackAction =
  | "shadow_fallback"
  | "truncate_and_shadow_fallback"
  | "reject_and_shadow_fallback";

export interface CodexRealDispatchFallbackPolicy {
  name: "Codex Real Dispatch Fallback Policy";
  adapter: "codex";
  capability: "codex_real_dispatch";
  scope: "fallback_policy";
  status: "contract_only";
  contractOnly: true;
  executingNow: false;
  defaultEnabled: false;
  featureFlagged: true;
  affectsRuntimeRouting: false;
  affectsFinalStatus: false;
  affectsGatewayPrimaryResult: false;
  changesGatewayPrimaryDispatch: false;
  changesGatewayFinalResult: false;
  changesRuntimeFinalStatus: false;
  changesRuntimeRouting: false;
  supportedRequestTypes: readonly ["code_generation"];
  unsupportedRequestTypes: readonly ["code_review", "validation", "bugfix", "llm_task", "review"];
  fallbackMatrix: Record<CodexFallbackReason, CodexFallbackAction>;
  persistedFieldsAllowed: readonly string[];
  persistedFieldsProhibited: readonly string[];
  sanitizedSummaryFields: readonly string[];
  nonGoals: readonly string[];
  requiredBeforeImplementation: readonly string[];
  verdict: "APPROVED_FOR_PLANNING";
  recommendedNextPr: "Codex Real Dispatch Observability Contract";
}

export const CODEX_REAL_DISPATCH_FALLBACK_POLICY: CodexRealDispatchFallbackPolicy = {
  name: "Codex Real Dispatch Fallback Policy",
  adapter: "codex",
  capability: "codex_real_dispatch",
  scope: "fallback_policy",
  status: "contract_only",
  contractOnly: true,
  executingNow: false,
  defaultEnabled: false,
  featureFlagged: true,
  affectsRuntimeRouting: false,
  affectsFinalStatus: false,
  affectsGatewayPrimaryResult: false,
  changesGatewayPrimaryDispatch: false,
  changesGatewayFinalResult: false,
  changesRuntimeFinalStatus: false,
  changesRuntimeRouting: false,
  supportedRequestTypes: ["code_generation"],
  unsupportedRequestTypes: ["code_review", "validation", "bugfix", "llm_task", "review"],
  fallbackMatrix: {
    cli_missing: "shadow_fallback",
    timeout: "shadow_fallback",
    non_zero_exit: "shadow_fallback",
    output_too_large: "truncate_and_shadow_fallback",
    prompt_too_large: "reject_and_shadow_fallback",
    prohibited_content: "reject_and_shadow_fallback",
    unsupported_request_type: "reject_and_shadow_fallback",
    unknown_error: "shadow_fallback",
  },
  persistedFieldsAllowed: [
    "reason",
    "action",
    "outcome",
    "summary",
    "warning_count",
    "has_warnings",
    "timestamp",
    "request_id",
    "request_type",
  ],
  persistedFieldsProhibited: [
    "raw_prompt",
    "full_prompt",
    "raw_output",
    "full_stdout",
    "full_stderr",
    "full_cli_output",
    "raw_artifacts",
    "patch_content",
    "secret",
    "token",
    "api_key",
    "password",
    "private_key",
  ],
  sanitizedSummaryFields: [
    "reason",
    "action",
    "outcome",
    "warning_count",
    "has_warnings",
    "truncated_output_preview",
    "safe_message",
  ],
  nonGoals: [
    "Do not implement fallback logic in Gateway in this PR.",
    "Do not invoke real Codex CLI.",
    "Do not change Runtime graph transitions.",
    "Do not change Runtime final_status semantics.",
    "Do not change Execution Gateway primary dispatch behavior.",
    "Do not change Execution Gateway final result shape.",
    "Do not expand supported request types beyond code_generation.",
    "Do not make Codex output a routing signal.",
    "Do not make Codex the default agent for any node.",
    "Do not make Codex the final owner of review, code_review, or validation decisions.",
    "Do not add package scripts, CI steps, or default environment values that enable real Codex.",
  ],
  requiredBeforeImplementation: [
    "Observability contract defining allowed in-memory summary signals.",
    "Operational guardrails contract enforcing prompt/output limits and prohibited content.",
    "Prompt builder that consumes ImplementationExecutorInput.",
    "Output parser/sanitizer that converts Codex CLI stdout into code_patch artifacts.",
    "Gateway integration contract defining how fallbackPolicy attaches to ExecutionResult.",
    "Fake-runner tests proving fallback paths without real Codex CLI.",
    "Controlled rollout plan reviewed and approved by operator.",
  ],
  verdict: "APPROVED_FOR_PLANNING",
  recommendedNextPr: "Codex Real Dispatch Observability Contract",
};
