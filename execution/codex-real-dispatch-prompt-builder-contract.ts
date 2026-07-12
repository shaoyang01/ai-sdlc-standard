// Codex Real Dispatch Prompt Builder Contract
// ==============================================
// Prompt-builder-contract-only. Defines the exact input source, required prompt
// sections, allowed/prohibited fields, limits, sanitization rules, and output
// expectations that future real Codex dispatch prompt construction must follow.
// Does NOT implement prompt builder logic now. Does NOT invoke real Codex now.
// Does NOT change Runtime, Gateway, or adapter behavior now.

export interface CodexRealDispatchPromptBuilderContract {
  name: "Codex Real Dispatch Prompt Builder Contract";
  adapter: "codex";
  capability: "codex_real_dispatch";
  scope: "prompt_builder_contract";
  status: "contract_only";
  promptBuilderContractOnly: true;
  executingNow: false;
  addsRealPromptBuilderNow: false;
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
  inputSource: {
    requiredInput: "ImplementationExecutorInput";
    rawContextDumpAllowed: false;
    rawArtifactsAllowed: false;
    fullPatchAllowed: false;
  };
  requiredPromptSections: readonly [
    "task_summary",
    "requirement",
    "structured_design",
    "implementation_constraints",
    "expected_output_contract"
  ];
  allowedInputFields: readonly string[];
  prohibitedInputFields: readonly string[];
  promptLimits: {
    maxPromptChars: number;
    maxRequirementChars: number;
    maxDesignChars: number;
    maxReviewChars: number;
  };
  sanitizationRules: {
    stripSecrets: true;
    stripRawArtifacts: true;
    stripFullPatchContent: true;
    truncateLongFields: true;
    omitUnsafeFields: true;
  };
  outputExpectation: {
    expectedArtifactType: "code_patch";
    requirePatchContent: true;
    requireFilePath: true;
    prohibitRawStdoutAsPatch: true;
  };
  fallbackMapping: {
    promptTooLarge: "reject_and_shadow_fallback";
    prohibitedPromptContent: "reject_and_shadow_fallback";
    unsupportedRequestType: "reject_and_shadow_fallback";
  };
  promptBuilderSafetyRules: readonly string[];
  nonGoals: readonly string[];
  requiredBeforeImplementation: readonly string[];
  evidence: readonly string[];
  verdict: "APPROVED_FOR_PLANNING";
  recommendedNextPr: "Codex Real Dispatch Output Parser Contract";
}

export const CODEX_REAL_DISPATCH_PROMPT_BUILDER_CONTRACT: CodexRealDispatchPromptBuilderContract = {
  name: "Codex Real Dispatch Prompt Builder Contract",
  adapter: "codex",
  capability: "codex_real_dispatch",
  scope: "prompt_builder_contract",
  status: "contract_only",
  promptBuilderContractOnly: true,
  executingNow: false,
  addsRealPromptBuilderNow: false,
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
  inputSource: {
    requiredInput: "ImplementationExecutorInput",
    rawContextDumpAllowed: false,
    rawArtifactsAllowed: false,
    fullPatchAllowed: false,
  },
  requiredPromptSections: [
    "task_summary",
    "requirement",
    "structured_design",
    "implementation_constraints",
    "expected_output_contract",
  ],
  allowedInputFields: [
    "requirement",
    "requirementId",
    "summary",
    "designOutput",
    "reviewOutput",
    "complexity",
    "executionMode",
  ],
  prohibitedInputFields: [
    "raw_context",
    "raw_artifacts",
    "full_patch",
    "patch_content",
    "raw_prompt",
    "full_prompt",
    "raw_stdout",
    "full_stdout",
    "raw_stderr",
    "full_stderr",
    "raw_output",
    "full_output",
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
  promptLimits: {
    maxPromptChars: 16000,
    maxRequirementChars: 4000,
    maxDesignChars: 4000,
    maxReviewChars: 2000,
  },
  sanitizationRules: {
    stripSecrets: true,
    stripRawArtifacts: true,
    stripFullPatchContent: true,
    truncateLongFields: true,
    omitUnsafeFields: true,
  },
  outputExpectation: {
    expectedArtifactType: "code_patch",
    requirePatchContent: true,
    requireFilePath: true,
    prohibitRawStdoutAsPatch: true,
  },
  fallbackMapping: {
    promptTooLarge: "reject_and_shadow_fallback",
    prohibitedPromptContent: "reject_and_shadow_fallback",
    unsupportedRequestType: "reject_and_shadow_fallback",
  },
  promptBuilderSafetyRules: [
    "Prompt builder is contract-only in this PR; no builder logic is added to Gateway or adapter.",
    "Prompt builder must be default-off and require explicit feature flags to enable.",
    "Prompt builder must support code_generation only.",
    "Prompt builder must consume ImplementationExecutorInput as its required input.",
    "Prompt builder must not accept raw Runtime context dumps.",
    "Prompt builder must not accept raw artifacts.",
    "Prompt builder must not accept full patch content.",
    "Prompt builder must include task_summary, requirement, structured_design, implementation_constraints, and expected_output_contract sections.",
    "Prompt builder must enforce maxPromptChars before any Codex CLI invocation.",
    "Prompt builder must enforce per-field limits for requirement, design, and review content.",
    "Prompt builder must strip secrets, tokens, API keys, passwords, private keys, and credentials.",
    "Prompt builder must strip raw stdout, raw stderr, and raw CLI output.",
    "Prompt builder must truncate long fields rather than silently exceed limits.",
    "Prompt builder must omit unsafe fields rather than include them in the prompt.",
    "Expected Codex output must be converted to a code_patch artifact with patch content and file path.",
    "Raw stdout must not be used directly as patch content.",
    "Prompt builder must not change Runtime routing.",
    "Prompt builder must not change Runtime final_status.",
    "Prompt builder must not change Gateway primary or final result.",
    "Prompt builder must not make Codex output a routing signal.",
  ],
  nonGoals: [
    "Do not implement prompt builder logic in Gateway or adapter in this PR.",
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
    "Output parser/sanitizer contract defining how Codex CLI output becomes code_patch artifacts.",
    "Gateway integration contract wiring prompt builder output to ExecutionResult.",
    "Fallback policy implementation mapping prompt builder failures to shadow fallback.",
    "Guardrails enforcement validating prompt limits and prohibited content.",
    "Fake-runner tests proving prompt builder paths without real Codex CLI.",
    "Observability contract implementation exposing only sanitized summary signals.",
    "Controlled rollout plan reviewed and approved by operator.",
  ],
  evidence: [
    "execution/codex-real-dispatch-prompt-builder-contract.ts",
    "docs/capabilities/codex/CODEX_REAL_DISPATCH_PROMPT_BUILDER_CONTRACT.md",
    "tests/codex-real-dispatch-prompt-builder-contract.test.ts",
    "execution/codex-real-dispatch-readiness-review.ts",
    "docs/capabilities/codex/CODEX_REAL_DISPATCH_READINESS_REVIEW.md",
    "execution/codex-real-dispatch-fallback-policy.ts",
    "docs/capabilities/codex/CODEX_REAL_DISPATCH_FALLBACK_POLICY.md",
    "execution/codex-real-dispatch-observability-contract.ts",
    "docs/capabilities/codex/CODEX_REAL_DISPATCH_OBSERVABILITY_CONTRACT.md",
    "execution/codex-real-dispatch-guardrails-contract.ts",
    "docs/capabilities/codex/CODEX_REAL_DISPATCH_GUARDRAILS_CONTRACT.md",
  ],
  verdict: "APPROVED_FOR_PLANNING",
  recommendedNextPr: "Codex Real Dispatch Output Parser Contract",
};
