// Codex Real Dispatch Guardrails Contract
// =========================================
// Guardrails-contract-only. Defines the exact pre-dispatch checks, post-dispatch
// checks, limits, prohibited-content rules, and fallback mappings that future real
// Codex dispatch implementation must enforce.
// Does NOT implement guardrail enforcement now. Does NOT invoke real Codex now.
// Does NOT change Runtime, Gateway, or adapter behavior now.

export interface CodexRealDispatchGuardrailsContract {
  name: "Codex Real Dispatch Guardrails Contract";
  adapter: "codex";
  capability: "codex_real_dispatch";
  scope: "guardrails_contract";
  status: "contract_only";
  guardrailsContractOnly: true;
  executingNow: false;
  addsRealGuardrailEnforcementNow: false;
  persistsGuardrailLogsNow: false;
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
  limits: {
    maxPromptChars: number;
    maxOutputChars: number;
    timeoutMs: number;
    maxSafeMessageChars: number;
    maxOutputPreviewChars: number;
  };
  preDispatchChecks: {
    requestTypeSupported: true;
    promptWithinLimit: true;
    noRawSecretInPrompt: true;
    noRawArtifactDump: true;
    noUnsupportedRequestType: true;
  };
  postDispatchChecks: {
    outputWithinLimit: true;
    noSecretInOutput: true;
    noFullStdoutPersistence: true;
    noFullStderrPersistence: true;
    outputSanitizedBeforeArtifact: true;
  };
  prohibitedContentPatterns: readonly string[];
  prohibitedPersistenceFields: readonly string[];
  fallbackMapping: {
    promptTooLarge: "reject_and_shadow_fallback";
    outputTooLarge: "truncate_and_shadow_fallback";
    prohibitedPromptContent: "reject_and_shadow_fallback";
    prohibitedOutputContent: "reject_and_shadow_fallback";
    timeout: "shadow_fallback";
    unsupportedRequestType: "reject_and_shadow_fallback";
  };
  guardrailSafetyRules: readonly string[];
  nonGoals: readonly string[];
  requiredBeforeImplementation: readonly string[];
  evidence: readonly string[];
  verdict: "APPROVED_FOR_PLANNING";
  recommendedNextPr: "Codex Real Dispatch Guardrails Contract";
}

export const CODEX_REAL_DISPATCH_GUARDRAILS_CONTRACT: CodexRealDispatchGuardrailsContract = {
  name: "Codex Real Dispatch Guardrails Contract",
  adapter: "codex",
  capability: "codex_real_dispatch",
  scope: "guardrails_contract",
  status: "contract_only",
  guardrailsContractOnly: true,
  executingNow: false,
  addsRealGuardrailEnforcementNow: false,
  persistsGuardrailLogsNow: false,
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
  limits: {
    maxPromptChars: 16000,
    maxOutputChars: 64000,
    timeoutMs: 120000,
    maxSafeMessageChars: 512,
    maxOutputPreviewChars: 1024,
  },
  preDispatchChecks: {
    requestTypeSupported: true,
    promptWithinLimit: true,
    noRawSecretInPrompt: true,
    noRawArtifactDump: true,
    noUnsupportedRequestType: true,
  },
  postDispatchChecks: {
    outputWithinLimit: true,
    noSecretInOutput: true,
    noFullStdoutPersistence: true,
    noFullStderrPersistence: true,
    outputSanitizedBeforeArtifact: true,
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
  fallbackMapping: {
    promptTooLarge: "reject_and_shadow_fallback",
    outputTooLarge: "truncate_and_shadow_fallback",
    prohibitedPromptContent: "reject_and_shadow_fallback",
    prohibitedOutputContent: "reject_and_shadow_fallback",
    timeout: "shadow_fallback",
    unsupportedRequestType: "reject_and_shadow_fallback",
  },
  guardrailSafetyRules: [
    "Guardrails are contract-only in this PR; no enforcement logic is added to Gateway.",
    "Guardrails must be default-off and require explicit feature flags to enable.",
    "Guardrails must support code_generation only.",
    "prompt length must be bounded before any real Codex CLI invocation.",
    "output length must be bounded before any artifact conversion.",
    "raw prompts must not be persisted.",
    "Full stdout and full stderr must not be persisted.",
    "Raw artifacts and full patch content must not be persisted.",
    "Secrets, tokens, API keys, passwords, private keys, and environment variables must be prohibited from prompts and outputs.",
    "Prompt too large must reject before dispatch and fall back to shadow behavior.",
    "Output too large must truncate summary and fall back to shadow behavior.",
    "Prohibited prompt/output content must reject and fall back to shadow behavior.",
    "Guardrails must not change Runtime routing.",
    "Guardrails must not change Runtime final_status.",
    "Guardrails must not change Gateway primary or final result.",
    "Guardrails must not make Codex output a routing signal.",
    "Guardrails must not make Codex the final owner of any decision.",
  ],
  nonGoals: [
    "Do not implement guardrail enforcement logic in Gateway in this PR.",
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
    "Prompt builder that consumes ImplementationExecutorInput and enforces maxPromptChars.",
    "Output sanitizer that strips prohibited content and enforces maxOutputChars.",
    "Gateway integration contract wiring guardrail decisions to ExecutionResult.",
    "Fallback policy implementation mapping each guardrail refusal to shadow fallback.",
    "Fake-runner tests proving guardrail paths without real Codex CLI.",
    "Observability contract implementation exposing only sanitized summary signals.",
    "Controlled rollout plan reviewed and approved by operator.",
  ],
  evidence: [
    "execution/codex-real-dispatch-guardrails-contract.ts",
    "CODEX_REAL_DISPATCH_GUARDRAILS_CONTRACT.md",
    "tests/codex-real-dispatch-guardrails-contract.test.ts",
    "execution/codex-real-dispatch-readiness-review.ts",
    "CODEX_REAL_DISPATCH_READINESS_REVIEW.md",
    "execution/codex-real-dispatch-fallback-policy.ts",
    "CODEX_REAL_DISPATCH_FALLBACK_POLICY.md",
    "execution/codex-real-dispatch-observability-contract.ts",
    "CODEX_REAL_DISPATCH_OBSERVABILITY_CONTRACT.md",
  ],
  verdict: "APPROVED_FOR_PLANNING",
  recommendedNextPr: "Codex Real Dispatch Guardrails Contract",
};
