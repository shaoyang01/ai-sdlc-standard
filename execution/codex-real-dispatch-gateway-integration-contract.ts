// Codex Real Dispatch Gateway Integration Contract
// ===================================================
// Gateway-integration-contract-only. Defines how future real Codex dispatch may
// attach sanitized summary metadata to ExecutionResult without changing Gateway
// primary result, Gateway final result shape, Runtime routing, or final_status.
// Does NOT implement Gateway integration now. Does NOT invoke real Codex now.
// Does NOT change Runtime, Gateway, or adapter behavior now.

export interface CodexRealDispatchGatewayIntegrationContract {
  name: "Codex Real Dispatch Gateway Integration Contract";
  adapter: "codex";
  capability: "codex_real_dispatch";
  scope: "gateway_integration_contract";
  status: "contract_only";
  gatewayIntegrationContractOnly: true;
  executingNow: false;
  addsRealGatewayIntegrationNow: false;
  attachesMetadataToExecutionResultNow: false;
  invokesCodexCliNow: false;
  enablesFeatureFlagsNow: false;
  expandsRequestTypesNow: false;
  changesRuntimeBehaviorNow: false;
  changesGatewayBehaviorNow: false;
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
  integrationBoundary: {
    gatewayPrimaryResultUnchanged: true;
    gatewayFinalResultShapeUnchanged: true;
    runtimeRoutingUnchanged: true;
    runtimeFinalStatusUnchanged: true;
    codexOutputNotRoutingSignal: true;
    codexOutputNotFinalDecision: true;
  };
  futureExecutionResultMetadata: {
    metadataKey: "codexRealDispatch";
    attachOnlySanitizedSummary: true;
    attachRawPrompt: false;
    attachRawStdout: false;
    attachRawStderr: false;
    attachRawArtifacts: false;
    attachFullPatch: false;
    attachSecrets: false;
  };
  allowedMetadataFields: readonly string[];
  prohibitedMetadataFields: readonly string[];
  integrationInputs: readonly [
    "fallback_policy",
    "observability_contract",
    "guardrails_contract",
    "prompt_builder_contract",
    "output_parser_contract"
  ];
  fallbackBehavior: {
    fallbackKeepsPrimaryShadowResult: true;
    fallbackDoesNotChangeRuntimeStatus: true;
    fallbackDoesNotChangeRouting: true;
    fallbackReasonSummaryOnly: true;
  };
  rolloutBoundary: {
    requiresExplicitFeatureFlag: true;
    defaultOff: true;
    fakeRunnerRequiredBeforeRealCli: true;
    operatorApprovalRequired: true;
  };
  gatewayIntegrationSafetyRules: readonly string[];
  nonGoals: readonly string[];
  requiredBeforeImplementation: readonly string[];
  evidence: readonly string[];
  verdict: "APPROVED_FOR_PLANNING";
  recommendedNextPr: "Codex Real Dispatch Fake Runner Test Plan Contract";
}

export const CODEX_REAL_DISPATCH_GATEWAY_INTEGRATION_CONTRACT: CodexRealDispatchGatewayIntegrationContract = {
  name: "Codex Real Dispatch Gateway Integration Contract",
  adapter: "codex",
  capability: "codex_real_dispatch",
  scope: "gateway_integration_contract",
  status: "contract_only",
  gatewayIntegrationContractOnly: true,
  executingNow: false,
  addsRealGatewayIntegrationNow: false,
  attachesMetadataToExecutionResultNow: false,
  invokesCodexCliNow: false,
  enablesFeatureFlagsNow: false,
  expandsRequestTypesNow: false,
  changesRuntimeBehaviorNow: false,
  changesGatewayBehaviorNow: false,
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
  integrationBoundary: {
    gatewayPrimaryResultUnchanged: true,
    gatewayFinalResultShapeUnchanged: true,
    runtimeRoutingUnchanged: true,
    runtimeFinalStatusUnchanged: true,
    codexOutputNotRoutingSignal: true,
    codexOutputNotFinalDecision: true,
  },
  futureExecutionResultMetadata: {
    metadataKey: "codexRealDispatch",
    attachOnlySanitizedSummary: true,
    attachRawPrompt: false,
    attachRawStdout: false,
    attachRawStderr: false,
    attachRawArtifacts: false,
    attachFullPatch: false,
    attachSecrets: false,
  },
  allowedMetadataFields: [
    "enabled",
    "attempted",
    "success",
    "outcome",
    "fallback_reason",
    "fallback_action",
    "duration_ms",
    "prompt_char_count",
    "output_char_count",
    "warning_count",
    "has_warnings",
    "parser_summary",
    "safe_message",
    "request_type",
    "node",
    "agent",
  ],
  prohibitedMetadataFields: [
    "raw_prompt",
    "full_prompt",
    "raw_stdout",
    "full_stdout",
    "raw_stderr",
    "full_stderr",
    "raw_output",
    "full_output",
    "raw_artifacts",
    "full_patch",
    "patch_content",
    "secret",
    "secrets",
    "token",
    "tokens",
    "api_key",
    "api_keys",
    "password",
    "passwords",
    "private_key",
    "private_keys",
    "credential",
    "credentials",
    "environment_variables",
  ],
  integrationInputs: [
    "fallback_policy",
    "observability_contract",
    "guardrails_contract",
    "prompt_builder_contract",
    "output_parser_contract",
  ],
  fallbackBehavior: {
    fallbackKeepsPrimaryShadowResult: true,
    fallbackDoesNotChangeRuntimeStatus: true,
    fallbackDoesNotChangeRouting: true,
    fallbackReasonSummaryOnly: true,
  },
  rolloutBoundary: {
    requiresExplicitFeatureFlag: true,
    defaultOff: true,
    fakeRunnerRequiredBeforeRealCli: true,
    operatorApprovalRequired: true,
  },
  gatewayIntegrationSafetyRules: [
    "Gateway integration is contract-only in this PR; no integration logic is added to Gateway or adapter.",
    "Gateway integration must be default-off and require explicit feature flags to enable.",
    "Gateway integration must support code_generation only.",
    "Gateway primary result must remain unchanged.",
    "Gateway final result shape must remain unchanged.",
    "Runtime routing must remain unchanged.",
    "Runtime final_status must remain unchanged.",
    "Codex output must not become a routing signal.",
    "Codex output must not become a final decision owner.",
    "Future ExecutionResult metadata must use the key codexRealDispatch.",
    "Only sanitized summary metadata may attach to ExecutionResult.",
    "Raw prompt, raw stdout, raw stderr, raw artifacts, full patch, and secrets must not attach.",
    "Fallback must keep the primary shadow result.",
    "Fallback must not change Runtime status or routing.",
    "Fallback reason must be summary-only.",
    "Fake-runner tests must pass before real Codex CLI is enabled.",
    "Operator approval is required before real CLI rollout.",
  ],
  nonGoals: [
    "Do not implement Gateway integration logic in Gateway or adapter in this PR.",
    "Do not attach metadata to ExecutionResult in production code in this PR.",
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
    "Do not persist raw prompts, raw artifacts, secrets, full stdout, or full stderr.",
    "Do not invoke real Codex CLI in tests.",
  ],
  requiredBeforeImplementation: [
    "Fake-runner tests proving prompt builder, output parser, and Gateway integration paths without real Codex CLI.",
    "Prompt builder implementation consuming ImplementationExecutorInput.",
    "Output parser implementation converting Codex CLI stdout to code_patch artifacts.",
    "Guardrails enforcement validating prompt/output limits and prohibited content.",
    "Fallback policy implementation mapping all failures to shadow fallback.",
    "Observability contract implementation exposing only sanitized summary signals.",
    "Controlled rollout plan reviewed and approved by operator.",
  ],
  evidence: [
    "execution/codex-real-dispatch-gateway-integration-contract.ts",
    "CODEX_REAL_DISPATCH_GATEWAY_INTEGRATION_CONTRACT.md",
    "tests/codex-real-dispatch-gateway-integration-contract.test.ts",
    "execution/codex-real-dispatch-readiness-review.ts",
    "CODEX_REAL_DISPATCH_READINESS_REVIEW.md",
    "execution/codex-real-dispatch-fallback-policy.ts",
    "CODEX_REAL_DISPATCH_FALLBACK_POLICY.md",
    "execution/codex-real-dispatch-observability-contract.ts",
    "CODEX_REAL_DISPATCH_OBSERVABILITY_CONTRACT.md",
    "execution/codex-real-dispatch-guardrails-contract.ts",
    "CODEX_REAL_DISPATCH_GUARDRAILS_CONTRACT.md",
    "execution/codex-real-dispatch-prompt-builder-contract.ts",
    "CODEX_REAL_DISPATCH_PROMPT_BUILDER_CONTRACT.md",
    "execution/codex-real-dispatch-output-parser-contract.ts",
    "CODEX_REAL_DISPATCH_OUTPUT_PARSER_CONTRACT.md",
  ],
  verdict: "APPROVED_FOR_PLANNING",
  recommendedNextPr: "Codex Real Dispatch Fake Runner Test Plan Contract",
};
