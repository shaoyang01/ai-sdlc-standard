// Codex Real Dispatch Output Parser Contract
// =============================================
// Output-parser-contract-only. Defines the exact input source, parser
// requirements, output artifact shape, limits, prohibited content, and fallback
// mappings that future real Codex dispatch output parsing must follow.
// Does NOT implement output parser logic now. Does NOT invoke real Codex now.
// Does NOT change Runtime, Gateway, or adapter behavior now.

export interface CodexRealDispatchOutputParserContract {
  name: "Codex Real Dispatch Output Parser Contract";
  adapter: "codex";
  capability: "codex_real_dispatch";
  scope: "output_parser_contract";
  status: "contract_only";
  outputParserContractOnly: true;
  executingNow: false;
  addsRealOutputParserNow: false;
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
    codexStdoutAllowedAsRawInput: true;
    rawStdoutPersistenceAllowed: false;
    rawStderrPersistenceAllowed: false;
    rawStdoutAsPatchAllowed: false;
  };
  expectedOutputArtifact: {
    artifactType: "code_patch";
    requireFilePath: true;
    requirePatchContent: true;
    requireSanitizedPatch: true;
    prohibitRawStdoutAsPatch: true;
  };
  parserRequirements: {
    extractFilePath: true;
    extractPatchContent: true;
    rejectEmptyPatch: true;
    rejectMissingFilePath: true;
    rejectOversizedOutput: true;
    rejectProhibitedContent: true;
    sanitizeBeforeArtifact: true;
  };
  limits: {
    maxStdoutChars: number;
    maxPatchChars: number;
    maxFilePathChars: number;
    maxSafeMessageChars: number;
  };
  prohibitedContentPatterns: readonly string[];
  prohibitedPersistenceFields: readonly string[];
  allowedArtifactContentFields: readonly string[];
  fallbackMapping: {
    missingFilePath: "reject_and_shadow_fallback";
    emptyPatch: "reject_and_shadow_fallback";
    outputTooLarge: "truncate_and_shadow_fallback";
    prohibitedOutputContent: "reject_and_shadow_fallback";
    parseError: "reject_and_shadow_fallback";
    unsupportedRequestType: "reject_and_shadow_fallback";
  };
  outputParserSafetyRules: readonly string[];
  nonGoals: readonly string[];
  requiredBeforeImplementation: readonly string[];
  evidence: readonly string[];
  verdict: "APPROVED_FOR_PLANNING";
  recommendedNextPr: "Codex Real Dispatch Gateway Integration Contract";
}

export const CODEX_REAL_DISPATCH_OUTPUT_PARSER_CONTRACT: CodexRealDispatchOutputParserContract = {
  name: "Codex Real Dispatch Output Parser Contract",
  adapter: "codex",
  capability: "codex_real_dispatch",
  scope: "output_parser_contract",
  status: "contract_only",
  outputParserContractOnly: true,
  executingNow: false,
  addsRealOutputParserNow: false,
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
    codexStdoutAllowedAsRawInput: true,
    rawStdoutPersistenceAllowed: false,
    rawStderrPersistenceAllowed: false,
    rawStdoutAsPatchAllowed: false,
  },
  expectedOutputArtifact: {
    artifactType: "code_patch",
    requireFilePath: true,
    requirePatchContent: true,
    requireSanitizedPatch: true,
    prohibitRawStdoutAsPatch: true,
  },
  parserRequirements: {
    extractFilePath: true,
    extractPatchContent: true,
    rejectEmptyPatch: true,
    rejectMissingFilePath: true,
    rejectOversizedOutput: true,
    rejectProhibitedContent: true,
    sanitizeBeforeArtifact: true,
  },
  limits: {
    maxStdoutChars: 64000,
    maxPatchChars: 32000,
    maxFilePathChars: 512,
    maxSafeMessageChars: 512,
  },
  prohibitedContentPatterns: [
    "secret",
    "secrets",
    "token",
    "tokens",
    "api_key",
    "api-key",
    "apikey",
    "password",
    "passwords",
    "private_key",
    "private-key",
    "privatekey",
    "credential",
    "credentials",
    "environment_variable",
    "env_var",
    "envvar",
    "BEGIN RSA PRIVATE KEY",
    "BEGIN OPENSSH PRIVATE KEY",
    "BEGIN PRIVATE KEY",
    "AKIA",
    "ghp_",
    "sk-",
  ],
  prohibitedPersistenceFields: [
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
  allowedArtifactContentFields: ["file", "patch", "parser_summary"],
  fallbackMapping: {
    missingFilePath: "reject_and_shadow_fallback",
    emptyPatch: "reject_and_shadow_fallback",
    outputTooLarge: "truncate_and_shadow_fallback",
    prohibitedOutputContent: "reject_and_shadow_fallback",
    parseError: "reject_and_shadow_fallback",
    unsupportedRequestType: "reject_and_shadow_fallback",
  },
  outputParserSafetyRules: [
    "Output parser is contract-only in this PR; no parser logic is added to Gateway or adapter.",
    "Output parser must be default-off and require explicit feature flags to enable.",
    "Output parser must support code_generation only.",
    "Raw Codex stdout may be parser input but must not be persisted.",
    "Raw Codex stderr must not be persisted.",
    "Raw stdout must not be used directly as patch content.",
    "Parser output must be a code_patch artifact with file path and sanitized patch content.",
    "empty patch content must be rejected.",
    "Missing file path must be rejected.",
    "Oversized parser output must truncate summary and fall back to shadow.",
    "Prohibited output content must reject and fall back to shadow.",
    "Parser errors must reject and fall back to shadow.",
    "Patch content must be sanitized before artifact creation.",
    "Parser must strip secrets, tokens, API keys, passwords, private keys, and credentials.",
    "Parser must not change Runtime routing.",
    "Parser must not change Runtime final_status.",
    "Parser must not change Gateway primary or final result.",
    "Parser must not make Codex output a routing signal.",
  ],
  nonGoals: [
    "Do not implement output parser logic in Gateway or adapter in this PR.",
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
    "Do not persist raw stdout, raw stderr, raw artifacts, secrets, or full patch content.",
    "Do not invoke real Codex CLI in tests.",
  ],
  requiredBeforeImplementation: [
    "Gateway integration contract wiring parser output to ExecutionResult.",
    "Prompt builder implementation consuming ImplementationExecutorInput.",
    "Fallback policy implementation mapping parser failures to shadow fallback.",
    "Guardrails enforcement validating output limits and prohibited content.",
    "Fake-runner tests proving parser paths without real Codex CLI.",
    "Observability contract implementation exposing only sanitized summary signals.",
    "Controlled rollout plan reviewed and approved by operator.",
  ],
  evidence: [
    "execution/codex-real-dispatch-output-parser-contract.ts",
    "docs/capabilities/codex/CODEX_REAL_DISPATCH_OUTPUT_PARSER_CONTRACT.md",
    "tests/codex-real-dispatch-output-parser-contract.test.ts",
    "execution/codex-real-dispatch-readiness-review.ts",
    "docs/capabilities/codex/CODEX_REAL_DISPATCH_READINESS_REVIEW.md",
    "execution/codex-real-dispatch-fallback-policy.ts",
    "docs/capabilities/codex/CODEX_REAL_DISPATCH_FALLBACK_POLICY.md",
    "execution/codex-real-dispatch-observability-contract.ts",
    "docs/capabilities/codex/CODEX_REAL_DISPATCH_OBSERVABILITY_CONTRACT.md",
    "execution/codex-real-dispatch-guardrails-contract.ts",
    "docs/capabilities/codex/CODEX_REAL_DISPATCH_GUARDRAILS_CONTRACT.md",
    "execution/codex-real-dispatch-prompt-builder-contract.ts",
    "docs/capabilities/codex/CODEX_REAL_DISPATCH_PROMPT_BUILDER_CONTRACT.md",
  ],
  verdict: "APPROVED_FOR_PLANNING",
  recommendedNextPr: "Codex Real Dispatch Gateway Integration Contract",
};
