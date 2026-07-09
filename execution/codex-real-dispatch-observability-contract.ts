// Codex Real Dispatch Observability Contract
// ============================================
// Observability-contract-only. Defines the exact sanitized observability fields
// and signal boundaries a future Codex real dispatch implementation PR may expose.
// Does NOT implement observability collection now. Does NOT persist observability logs now.
// Does NOT enable real Codex now. Does NOT change behavior.

export interface CodexRealDispatchObservabilityContract {
  name: "Codex Real Dispatch Observability Contract";
  adapter: "codex";
  capability: "codex_real_dispatch";
  scope: "observability_contract";
  status: "contract_only";
  observabilityContractOnly: true;
  executingNow: false;
  addsRealObservabilityCollectionNow: false;
  persistsObservabilityLogsNow: false;
  enablesFeatureFlagsNow: false;
  expandsRequestTypesNow: false;
  changesRuntimeBehaviorNow: false;
  changesGatewayBehaviorNow: false;
  defaultEnabled: false;
  persisted: false;
  inMemoryOnly: true;
  affectsRuntimeRouting: false;
  affectsFinalStatus: false;
  affectsGatewayPrimaryResult: false;
  changesGatewayPrimaryDispatch: false;
  changesGatewayFinalResult: false;
  changesRuntimeFinalStatus: false;
  changesRuntimeRouting: false;
  supportedRequestTypes: readonly ["code_generation"];
  unsupportedRequestTypes: readonly ["code_review", "validation", "bugfix", "llm_task", "review"];
  allowedSummaryFields: readonly string[];
  prohibitedFields: readonly string[];
  allowedSignals: {
    requestType: true;
    fallbackReason: true;
    fallbackAction: true;
    success: true;
    durationMs: true;
    promptCharCount: true;
    outputCharCount: true;
    truncated: true;
    warningCount: true;
    hasWarnings: true;
  };
  prohibitedSignals: {
    rawPrompt: true;
    fullPrompt: true;
    rawStdout: true;
    fullStdout: true;
    rawStderr: true;
    fullStderr: true;
    rawArtifacts: true;
    fullPatch: true;
    secrets: true;
    tokens: true;
    apiKeys: true;
    passwords: true;
    privateKeys: true;
  };
  retentionPolicy: {
    persisted: false;
    inMemoryOnly: true;
    noDiskWrites: true;
    noNetworkExport: true;
  };
  observabilityShape: Record<string, string>;
  observabilitySafetyRules: readonly string[];
  nonGoals: readonly string[];
  requiredBeforeImplementation: readonly string[];
  evidence: readonly string[];
  verdict: "APPROVED_FOR_PLANNING";
  recommendedNextPr: "Codex Real Dispatch Guardrails Contract";
}

export const CODEX_REAL_DISPATCH_OBSERVABILITY_CONTRACT: CodexRealDispatchObservabilityContract = {
  name: "Codex Real Dispatch Observability Contract",
  adapter: "codex",
  capability: "codex_real_dispatch",
  scope: "observability_contract",
  status: "contract_only",
  observabilityContractOnly: true,
  executingNow: false,
  addsRealObservabilityCollectionNow: false,
  persistsObservabilityLogsNow: false,
  enablesFeatureFlagsNow: false,
  expandsRequestTypesNow: false,
  changesRuntimeBehaviorNow: false,
  changesGatewayBehaviorNow: false,
  defaultEnabled: false,
  persisted: false,
  inMemoryOnly: true,
  affectsRuntimeRouting: false,
  affectsFinalStatus: false,
  affectsGatewayPrimaryResult: false,
  changesGatewayPrimaryDispatch: false,
  changesGatewayFinalResult: false,
  changesRuntimeFinalStatus: false,
  changesRuntimeRouting: false,
  supportedRequestTypes: ["code_generation"],
  unsupportedRequestTypes: ["code_review", "validation", "bugfix", "llm_task", "review"],
  allowedSummaryFields: [
    "request_type",
    "request_id",
    "node",
    "agent",
    "success",
    "outcome",
    "duration_ms",
    "prompt_char_count",
    "output_char_count",
    "truncated",
    "warning_count",
    "has_warnings",
    "fallback_reason",
    "fallback_action",
    "stage",
    "safe_message",
  ],
  prohibitedFields: [
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
  allowedSignals: {
    requestType: true,
    fallbackReason: true,
    fallbackAction: true,
    success: true,
    durationMs: true,
    promptCharCount: true,
    outputCharCount: true,
    truncated: true,
    warningCount: true,
    hasWarnings: true,
  },
  prohibitedSignals: {
    rawPrompt: true,
    fullPrompt: true,
    rawStdout: true,
    fullStdout: true,
    rawStderr: true,
    fullStderr: true,
    rawArtifacts: true,
    fullPatch: true,
    secrets: true,
    tokens: true,
    apiKeys: true,
    passwords: true,
    privateKeys: true,
  },
  retentionPolicy: {
    persisted: false,
    inMemoryOnly: true,
    noDiskWrites: true,
    noNetworkExport: true,
  },
  observabilityShape: {
    request_type: "string enum",
    request_id: "string",
    node: "string",
    agent: "codex",
    success: "boolean",
    outcome: "string enum",
    duration_ms: "number",
    prompt_char_count: "number",
    output_char_count: "number",
    truncated: "boolean",
    warning_count: "number",
    has_warnings: "boolean",
    fallback_reason: "string enum | undefined",
    fallback_action: "string enum | undefined",
    stage: "string enum",
    safe_message: "string | undefined",
  },
  observabilitySafetyRules: [
    "Observability is in-memory summary metadata only.",
    "Observability must not be persisted to disk, database, or network.",
    "Observability must not change Gateway primary/final result.",
    "Observability must not change Runtime final_status/routing.",
    "Observability must not make Codex final owner of any decision.",
    "Observability must not include raw prompt or full prompt.",
    "Observability must not include raw stdout, full stdout, raw stderr, or full stderr.",
    "Observability must not include raw artifacts or full patch content.",
    "Observability must not include secrets, tokens, API keys, passwords, or private keys.",
    "Observability must use counts and booleans instead of raw text where possible.",
    "Observability must truncate any human-readable message to a bounded safe length.",
    "Observability must omit rather than leak unsafe data.",
  ],
  nonGoals: [
    "Do not implement observability collection logic in Gateway in this PR.",
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
    "Operational guardrails contract enforcing prompt/output limits and prohibited content.",
    "Prompt builder that consumes ImplementationExecutorInput.",
    "Output parser/sanitizer that converts Codex CLI stdout into code_patch artifacts.",
    "Gateway integration contract defining how observability attaches to ExecutionResult.",
    "Fake-runner tests proving observability paths without real Codex CLI.",
    "Controlled rollout plan reviewed and approved by operator.",
  ],
  evidence: [
    "execution/codex-real-dispatch-observability-contract.ts",
    "CODEX_REAL_DISPATCH_OBSERVABILITY_CONTRACT.md",
    "tests/codex-real-dispatch-observability-contract.test.ts",
    "execution/codex-real-dispatch-readiness-review.ts",
    "CODEX_REAL_DISPATCH_READINESS_REVIEW.md",
    "execution/codex-real-dispatch-fallback-policy.ts",
    "CODEX_REAL_DISPATCH_FALLBACK_POLICY.md",
  ],
  verdict: "APPROVED_FOR_PLANNING",
  recommendedNextPr: "Codex Real Dispatch Guardrails Contract",
};
