// Codex Real Dispatch Fake Runner Test Plan Contract
// =====================================================
// Fake-runner-test-plan-contract-only. Defines the exact fake-runner boundary,
// required test scenarios, expected fallback assertions, success assertions,
// Gateway boundary assertions, metadata boundary assertions, and rollout
// dependency that future real Codex dispatch validation must satisfy before any
// real CLI or Gateway implementation is enabled.
// Does NOT implement fake runner logic now. Does NOT invoke real Codex now.
// Does NOT change Runtime, Gateway, or adapter behavior now.

export interface CodexRealDispatchFakeRunnerTestPlanContract {
  name: "Codex Real Dispatch Fake Runner Test Plan Contract";
  adapter: "codex";
  capability: "codex_real_dispatch";
  scope: "fake_runner_test_plan_contract";
  status: "contract_only";
  fakeRunnerTestPlanContractOnly: true;
  executingNow: false;
  addsRealFakeRunnerNow: false;
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
  fakeRunnerBoundary: {
    realCodexCliInvoked: false;
    processSpawnAllowed: false;
    networkAllowed: false;
    filesystemWritesAllowed: false;
    productionGatewayMutationAllowed: false;
    executionResultMetadataAttachmentNow: false;
  };
  fakeRunnerScenarios: readonly [
    "success_code_patch",
    "cli_missing",
    "timeout",
    "non_zero_exit",
    "prompt_too_large",
    "output_too_large",
    "prohibited_prompt_content",
    "prohibited_output_content",
    "missing_file_path",
    "empty_patch",
    "parse_error",
    "unsupported_request_type"
  ];
  expectedFallbackAssertions: {
    cliMissing: "shadow_fallback";
    timeout: "shadow_fallback";
    nonZeroExit: "shadow_fallback";
    promptTooLarge: "reject_and_shadow_fallback";
    outputTooLarge: "truncate_and_shadow_fallback";
    prohibitedPromptContent: "reject_and_shadow_fallback";
    prohibitedOutputContent: "reject_and_shadow_fallback";
    missingFilePath: "reject_and_shadow_fallback";
    emptyPatch: "reject_and_shadow_fallback";
    parseError: "reject_and_shadow_fallback";
    unsupportedRequestType: "reject_and_shadow_fallback";
  };
  expectedSuccessAssertions: {
    artifactType: "code_patch";
    requireFilePath: true;
    requireSanitizedPatch: true;
    rawStdoutNotPersisted: true;
    rawStderrNotPersisted: true;
    rawPromptNotPersisted: true;
  };
  gatewayBoundaryAssertions: {
    primaryResultUnchanged: true;
    finalResultShapeUnchanged: true;
    runtimeRoutingUnchanged: true;
    runtimeFinalStatusUnchanged: true;
    codexOutputNotRoutingSignal: true;
    codexOutputNotFinalDecision: true;
  };
  metadataBoundaryAssertions: {
    metadataKey: "codexRealDispatch";
    sanitizedSummaryOnly: true;
    rawPromptForbidden: true;
    rawStdoutForbidden: true;
    rawStderrForbidden: true;
    rawArtifactsForbidden: true;
    fullPatchForbidden: true;
    secretsForbidden: true;
  };
  rolloutDependency: {
    requiredBeforeRealCli: true;
    requiredBeforeGatewayImplementation: true;
    operatorApprovalRequiredAfterPassing: true;
  };
  fakeRunnerSafetyRules: readonly string[];
  nonGoals: readonly string[];
  requiredBeforeImplementation: readonly string[];
  evidence: readonly string[];
  verdict: "APPROVED_FOR_PLANNING";
  recommendedNextPr: "Codex Real Dispatch Controlled Rollout Plan";
}

export const CODEX_REAL_DISPATCH_FAKE_RUNNER_TEST_PLAN_CONTRACT: CodexRealDispatchFakeRunnerTestPlanContract = {
  name: "Codex Real Dispatch Fake Runner Test Plan Contract",
  adapter: "codex",
  capability: "codex_real_dispatch",
  scope: "fake_runner_test_plan_contract",
  status: "contract_only",
  fakeRunnerTestPlanContractOnly: true,
  executingNow: false,
  addsRealFakeRunnerNow: false,
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
  fakeRunnerBoundary: {
    realCodexCliInvoked: false,
    processSpawnAllowed: false,
    networkAllowed: false,
    filesystemWritesAllowed: false,
    productionGatewayMutationAllowed: false,
    executionResultMetadataAttachmentNow: false,
  },
  fakeRunnerScenarios: [
    "success_code_patch",
    "cli_missing",
    "timeout",
    "non_zero_exit",
    "prompt_too_large",
    "output_too_large",
    "prohibited_prompt_content",
    "prohibited_output_content",
    "missing_file_path",
    "empty_patch",
    "parse_error",
    "unsupported_request_type",
  ],
  expectedFallbackAssertions: {
    cliMissing: "shadow_fallback",
    timeout: "shadow_fallback",
    nonZeroExit: "shadow_fallback",
    promptTooLarge: "reject_and_shadow_fallback",
    outputTooLarge: "truncate_and_shadow_fallback",
    prohibitedPromptContent: "reject_and_shadow_fallback",
    prohibitedOutputContent: "reject_and_shadow_fallback",
    missingFilePath: "reject_and_shadow_fallback",
    emptyPatch: "reject_and_shadow_fallback",
    parseError: "reject_and_shadow_fallback",
    unsupportedRequestType: "reject_and_shadow_fallback",
  },
  expectedSuccessAssertions: {
    artifactType: "code_patch",
    requireFilePath: true,
    requireSanitizedPatch: true,
    rawStdoutNotPersisted: true,
    rawStderrNotPersisted: true,
    rawPromptNotPersisted: true,
  },
  gatewayBoundaryAssertions: {
    primaryResultUnchanged: true,
    finalResultShapeUnchanged: true,
    runtimeRoutingUnchanged: true,
    runtimeFinalStatusUnchanged: true,
    codexOutputNotRoutingSignal: true,
    codexOutputNotFinalDecision: true,
  },
  metadataBoundaryAssertions: {
    metadataKey: "codexRealDispatch",
    sanitizedSummaryOnly: true,
    rawPromptForbidden: true,
    rawStdoutForbidden: true,
    rawStderrForbidden: true,
    rawArtifactsForbidden: true,
    fullPatchForbidden: true,
    secretsForbidden: true,
  },
  rolloutDependency: {
    requiredBeforeRealCli: true,
    requiredBeforeGatewayImplementation: true,
    operatorApprovalRequiredAfterPassing: true,
  },
  fakeRunnerSafetyRules: [
    "Fake runner test plan is contract-only in this PR; no fake runner logic is added to production code.",
    "Fake runner must be default-off and require explicit feature flags to enable.",
    "Fake runner must support code_generation only.",
    "Fake runner must not invoke real Codex CLI.",
    "Fake runner must not spawn child processes.",
    "Fake runner must not require network access.",
    "Fake runner must not write to filesystem.",
    "Fake runner must not mutate production Gateway behavior.",
    "Fake runner must not attach metadata to production ExecutionResult in this PR.",
    "Fake runner must cover success_code_patch and all fallback scenarios.",
    "Fake runner fallback assertions must match Fallback Policy, Guardrails, and Output Parser contracts.",
    "Fake runner success assertions must require a sanitized code_patch artifact with file path.",
    "Fake runner must assert raw prompt, raw stdout, raw stderr, raw artifacts, full patch, and secrets are not persisted.",
    "Fake runner must assert Gateway primary result, final result shape, Runtime routing, and final_status remain unchanged.",
    "Fake runner must assert Codex output is not a routing signal and not a final decision.",
    "Fake runner must assert metadata key codexRealDispatch is summary-only.",
    "Fake runner validation is required before real Codex CLI enablement.",
    "Fake runner validation is required before Gateway implementation.",
    "Operator approval is required after fake runner validation passes.",
  ],
  nonGoals: [
    "Do not implement fake runner logic in production code in this PR.",
    "Do not implement Gateway integration logic in this PR.",
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
    "Prompt builder implementation consuming ImplementationExecutorInput.",
    "Output parser implementation converting synthetic Codex-like output to code_patch artifacts.",
    "Guardrails enforcement validating prompt/output limits and prohibited content against synthetic inputs.",
    "Fallback policy implementation mapping all synthetic failures to shadow fallback.",
    "Gateway integration contract wiring synthetic metadata to ExecutionResult in test environment only.",
    "Controlled rollout plan reviewed and approved by operator after fake-runner tests pass.",
  ],
  evidence: [
    "execution/codex-real-dispatch-fake-runner-test-plan-contract.ts",
    "CODEX_REAL_DISPATCH_FAKE_RUNNER_TEST_PLAN_CONTRACT.md",
    "tests/codex-real-dispatch-fake-runner-test-plan-contract.test.ts",
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
    "execution/codex-real-dispatch-gateway-integration-contract.ts",
    "CODEX_REAL_DISPATCH_GATEWAY_INTEGRATION_CONTRACT.md",
  ],
  verdict: "APPROVED_FOR_PLANNING",
  recommendedNextPr: "Codex Real Dispatch Controlled Rollout Plan",
};
