// Runtime Node Executors — Stateless DocFlow Node Implementations
// ================================================================
// Each executor is a STATELESS function: (context, execCtx) → output.
// No branching. No flow decisions. Graph Kernel controls transitions.
// This module provides the default executor map and a dispatch helper.

import { NodeType } from "../sdlc_graph/types";
import { ExecutionContext } from "./execution-context";
import { executionGateway } from "../execution";
import { Artifact, createArtifact } from "./artifact";
import type {
  ExecutionRequest,
  ExecutionResult,
} from "../execution/types";

export type ExecutionMode = "direct" | "speckit";

export type RequirementSummaryMode = "deterministic" | "kimi_gateway";

export interface RuntimeExecutorOptions {
  requirementSummaryMode?: RequirementSummaryMode;
}

export type ImplementationOutcome =
  | "real_code_patch"
  | "shadow_code_patch"
  | "fanout"
  | "speckit"
  | "failed";

export interface RuntimeExecutionGateway {
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
}

export interface RequirementSummary {
  requirement_id: string;
  multi_repo: boolean;
  main_repo: string;
  sub_requirements: { repo: string; task: string }[];
}

export interface FanoutResult {
  requirement_id: string;
  repo_results: { repo: string; status: "success" | "failed"; output: Record<string, unknown> }[];
  completed_at: string;
}

export type NodeExecutor = (
  context: Record<string, unknown>,
  execCtx: ExecutionContext
) => Record<string, unknown> | Promise<Record<string, unknown>>;

export type RuntimeExecutorMap = Record<NodeType, NodeExecutor>;

// Typed contract for the implementation executor.
// Future real/fake implementation adapters should accept this input and return this output.
export interface ImplementationExecutorInput {
  requirement: string;
  requirementId: string;
  summary: RequirementSummary;
  designOutput: unknown;
  reviewOutput: unknown;
  complexity?: "low" | "medium" | "high";
  executionMode: ExecutionMode;
}

// Pure structured tech-design builder: deterministic design from requirement text and summary.
export function buildTechDesign(
  rawText: string,
  requirementSummary: RequirementSummary
): Record<string, unknown> {
  const hasApi = /\b(api|endpoint|http|restful)\b/i.test(rawText);
  const hasEvent = /\b(event|message|queue|pipeline)\b/i.test(rawText);
  const hasUi = /\b(form|page|frontend|ui)\b/i.test(rawText);
  const hasDb = /\b(database|db|table|storage)\b/i.test(rawText);

  const components: string[] = [];
  if (hasApi) components.push("api");
  if (hasEvent) components.push("event_pipeline");
  if (hasUi) components.push("ui_form");
  if (hasDb) components.push("data_store");
  if (components.length === 0) components.push("service");

  const interfaces: string[] = [];
  if (hasApi) interfaces.push("http_api");
  if (hasEvent) interfaces.push("event_message");
  if (hasUi) interfaces.push("user_interface");

  const dependencies: string[] = [];
  if (hasDb) dependencies.push("database");
  if (/\b(cache|redis)\b/i.test(rawText)) dependencies.push("cache");
  if (/\b(queue|kafka|mq|message)\b/i.test(rawText)) dependencies.push("queue");
  if (/\b(oauth|sso|login|auth)\b/i.test(rawText)) dependencies.push("third_party_auth");

  let test_strategy: "unit" | "unit_plus_integration" | "unit_integration_e2e" = "unit";
  if (/\b(e2e|end-to-end|end to end)\b/i.test(rawText)) {
    test_strategy = "unit_integration_e2e";
  } else if (/\b(integration|api|event|database|queue)\b/i.test(rawText)) {
    test_strategy = "unit_plus_integration";
  }

  const risks: string[] = [];
  if (requirementSummary.multi_repo) risks.push("multi_repo_sync");
  if (dependencies.length > 0) risks.push("external_dependency");
  if (interfaces.length > 1) risks.push("interface_contract_drift");

  return {
    node: "tech-design",
    result: "design_completed",
    requirement_id: requirementSummary.requirement_id,
    multi_repo: requirementSummary.multi_repo,
    design: {
      approach: requirementSummary.multi_repo ? "multi_repo_fanout" : "single_service",
      components,
      interfaces,
      dependencies,
      test_strategy,
      risks,
    },
  };
}

// Pure builder: converts the Runtime's raw context into the typed implementation input contract.
export function buildImplementationExecutorInput(
  context: Record<string, unknown>,
  execCtx: ExecutionContext
): ImplementationExecutorInput {
  return {
    requirement:
      (context.raw_text as string) ??
      (execCtx.input?.requirement as string) ??
      "",
    requirementId:
      (context.requirement_id as string) ??
      (execCtx.metadata?.requirementId as string) ??
      "",
    summary: (context["requirement-summary"] ?? context) as RequirementSummary,
    designOutput: context["tech-design"],
    reviewOutput: context["review"],
    complexity: execCtx.metadata?.complexity as "low" | "medium" | "high" | undefined,
    executionMode: (context.execution_mode as ExecutionMode) || "direct",
  };
}

// Deterministic shadow code patch artifact for default direct implementation.
// No real Codex call. No timestamps in patch content or ID.
export function buildShadowCodePatchArtifact(input: ImplementationExecutorInput): Artifact {
  const design = input.designOutput as Record<string, unknown> | undefined;
  const designBody = design?.["design"] as Record<string, unknown> | undefined;
  const approach = (designBody?.["approach"] as string | undefined) ?? "direct";
  const components = Array.isArray(designBody?.["components"])
    ? (designBody["components"] as unknown[]).join(",")
    : "service";
  return createArtifact({
    id: `${input.requirementId}:implementation:code_patch:shadow`,
    requirementId: input.requirementId,
    node: "implementation",
    type: "code_patch",
    content: {
      file: "src/generated-shadow-implementation.ts",
      patch: [
        `// Shadow implementation for ${input.requirementId}`,
        `// Approach: ${approach}`,
        `// Components: ${components}`,
        "export function generatedShadowImplementation() {",
        "  return true;",
        "}",
      ].join("\n"),
    },
    agent: "codex",
    source: "execution_gateway",
  });
}

export interface ImplementationExecutorOutput {
  node: "implementation";
  mode: ExecutionMode | "fanout";
  result: string;
  code?: string;
  artifacts?: Artifact[];
  fanout_result?: FanoutResult;
  speckit_stages?: Record<string, string>;
  execution_result?: Record<string, unknown>;
  requirement_id?: string;
  error?: string;
  implementation_outcome: ImplementationOutcome;
}

// Validation: inspect implementation output, do not always pass.
export function validateImplementationOutput(
  context: Record<string, unknown>
): Record<string, unknown> {
  const implOutput = context["implementation"] as Record<string, unknown> | undefined;
  const hasCode =
    typeof implOutput?.["code"] === "string" &&
    (implOutput["code"] as string).trim().length > 0;
  const hasExecutionResult =
    implOutput?.["execution_result"] !== undefined &&
    implOutput?.["execution_result"] !== null;
  const hasArtifacts =
    Array.isArray(implOutput?.["artifacts"]) &&
    (implOutput["artifacts"] as unknown[]).length > 0;
  const allChecksPassed = Boolean(hasCode || hasExecutionResult || hasArtifacts);
  return {
    node: "validation",
    result: allChecksPassed ? "validated" : "FAIL",
    all_checks_passed: allChecksPassed,
    checks: {
      has_code: hasCode,
      has_execution_result: hasExecutionResult,
      has_artifacts: hasArtifacts,
    },
  };
}

// ─── Solution Challenge (shadow-only in this PR) ─────────
// Explicit skill metadata binding: implemented.
// Real Gateway skill invocation: not implemented (future).

const MAX_CHALLENGE_REVISION_CYCLES = 2;

export interface SolutionChallengeState {
  mode: "INITIAL_CHALLENGE" | "FOLLOW_UP_VERIFICATION";
  currentCycle: 1 | 2;
  maxCycles: 2;
  exhausted: boolean;
  status: "NEEDS_REVISION" | "READY_FOR_GATE";
  findingIds?: string[];
  reportPath?: string | null;
  artifactStatus: "shadow_only" | "generated";
}

/** Derive top-level result from SolutionChallengeState.status. */
function deriveResult(status: "NEEDS_REVISION" | "READY_FOR_GATE"): "PASS" | "FAIL" {
  return status === "NEEDS_REVISION" ? "FAIL" : "PASS";
}

/** Validate that an object is a well-formed SolutionChallengeState.
 *  Returns the validated state or throws on malformed input. */
function validateSolutionChallengeState(raw: unknown): SolutionChallengeState {
  if (!raw || typeof raw !== "object") {
    throw new Error("solution-challenge: missing or invalid solution_challenge state");
  }
  const s = raw as Record<string, unknown>;

  // status: required, exact values
  if (s.status !== "NEEDS_REVISION" && s.status !== "READY_FOR_GATE") {
    throw new Error(`solution-challenge: invalid status: ${String(s.status)}`);
  }

  // mode: required, exact values
  if (s.mode !== "INITIAL_CHALLENGE" && s.mode !== "FOLLOW_UP_VERIFICATION") {
    throw new Error(`solution-challenge: invalid mode: ${String(s.mode)}`);
  }

  // currentCycle: required, 1 | 2
  if (s.currentCycle !== 1 && s.currentCycle !== 2) {
    throw new Error(`solution-challenge: invalid currentCycle: ${s.currentCycle}`);
  }

  // maxCycles: required, exactly 2
  if (s.maxCycles !== 2) {
    throw new Error(`solution-challenge: invalid maxCycles: ${s.maxCycles}`);
  }

  // exhausted: required boolean, consistent with currentCycle/maxCycles
  if (typeof s.exhausted !== "boolean") {
    throw new Error("solution-challenge: exhausted must be boolean");
  }
  if (s.exhausted !== (s.currentCycle >= s.maxCycles)) {
    throw new Error(`solution-challenge: exhausted inconsistent: cycle=${s.currentCycle}, max=${s.maxCycles}, exhausted=${s.exhausted}`);
  }

  // mode must match currentCycle
  if (s.currentCycle === 1 && s.mode !== "INITIAL_CHALLENGE") {
    throw new Error("solution-challenge: currentCycle=1 requires INITIAL_CHALLENGE mode");
  }
  if (s.currentCycle === 2 && s.mode !== "FOLLOW_UP_VERIFICATION") {
    throw new Error("solution-challenge: currentCycle=2 requires FOLLOW_UP_VERIFICATION mode");
  }

  // artifactStatus: required, exact values
  if (s.artifactStatus !== "shadow_only" && s.artifactStatus !== "generated") {
    throw new Error(`solution-challenge: invalid artifactStatus: ${String(s.artifactStatus)}`);
  }

  // findingIds: optional, must be array of strings if present
  if (s.findingIds !== undefined) {
    if (!Array.isArray(s.findingIds) || s.findingIds.some((id: unknown) => typeof id !== "string")) {
      throw new Error("solution-challenge: findingIds must be an array of strings");
    }
  }

  // reportPath: optional, string or null
  if (s.reportPath !== undefined && s.reportPath !== null && typeof s.reportPath !== "string") {
    throw new Error("solution-challenge: reportPath must be string or null");
  }

  return s as unknown as SolutionChallengeState;
}

/** Normalize a solution-challenge node output.
 *  Validates the state and ensures result is derived from status.
 *  This is the single normalization boundary — applied centrally in runtime. */
export function normalizeSolutionChallengeOutput(
  output: Record<string, unknown>
): Record<string, unknown> {
  const raw = output["solution_challenge"];
  const state = validateSolutionChallengeState(raw);

  return {
    ...output,
    result: deriveResult(state.status),
    solution_challenge: state,
  };
}

function executeSolutionChallenge(
  _rawText: string,
  requirementId: string,
  techDesignOutput: Record<string, unknown>,
  previous?: SolutionChallengeState
): Record<string, unknown> {
  const currentCycle = (previous
    ? Math.min(previous.currentCycle + 1, MAX_CHALLENGE_REVISION_CYCLES)
    : 1) as 1 | 2;
  const exhausted = currentCycle >= MAX_CHALLENGE_REVISION_CYCLES;
  const mode = previous ? "FOLLOW_UP_VERIFICATION" : "INITIAL_CHALLENGE";

  // Shadow mode: produce deterministic metadata-only result.
  const state: SolutionChallengeState = {
    mode,
    currentCycle,
    maxCycles: 2,
    exhausted,
    status: "READY_FOR_GATE",
    findingIds: [],
    reportPath: null,
    artifactStatus: "shadow_only",
  };

  return {
    node: "solution-challenge",
    skill: "sdlc-solution-challenger",
    // explicit skill metadata binding: implemented
    // real Gateway skill invocation: not implemented
    result: deriveResult(state.status),
    execution_source: "deterministic_shadow",
    executor_type: "shadow",
    fallback_used: false,
    fallback_reason: "none",
    solution_challenge: state,
    blocking_count: 0,
    required_count: 0,
    non_blocking_count: 0,
    out_of_scope_count: 0,
    recommended_next_step: "PROCEED_TO_SOLUTION_REVIEWER",
    duration_ms: 0,
  };
}

// Default executor map factory — allows optional Gateway injection for implementation.
// All other node executors remain stateless and Gateway-agnostic.
export function createDefaultExecutors(
  gateway: RuntimeExecutionGateway = executionGateway,
  options: RuntimeExecutorOptions = {}
): RuntimeExecutorMap {
  return {
    "requirement-summary": (ctx, _execCtx) =>
      executeRequirementSummary(
        ctx.raw_text as string,
        ctx.requirement_id as string,
        gateway,
        options.requirementSummaryMode ?? "deterministic"
      ),
    "tech-design": (ctx, _execCtx) =>
      buildTechDesign(
        ctx.raw_text as string,
        (ctx["requirement-summary"] ?? ctx) as RequirementSummary
      ),
    "solution-challenge": (ctx, _execCtx) =>
      executeSolutionChallenge(
        ctx.raw_text as string,
        ctx.requirement_id as string,
        (ctx["tech-design"] ?? {}) as Record<string, unknown>,
        _execCtx?.metadata?.solutionChallenge as SolutionChallengeState | undefined
      ),
    "review": (ctx, execCtx) =>
      ({
        node: "review",
        result: (ctx["review_result"] as string) || (execCtx?.metadata?.complexity === "high" ? "FAIL" : "PASS"),
        reviewed_at: new Date().toISOString(),
      }),
    "implementation": (ctx, execCtx) =>
      executeImplementation(ctx, execCtx, gateway) as unknown as Promise<Record<string, unknown>>,
    "validation": (ctx, _execCtx) => validateImplementationOutput(ctx),
  };
}

// Default executor map — backward-compatible default using the global execution gateway.
export const DEFAULT_EXECUTORS: RuntimeExecutorMap = createDefaultExecutors();

// Pure dispatch — no control logic, just lookup + execute
export async function executeDocFlowNode(
  node: NodeType,
  context: Record<string, unknown>,
  execCtx: ExecutionContext,
  executors: RuntimeExecutorMap = DEFAULT_EXECUTORS
): Promise<Record<string, unknown>> {
  const executor = executors[node];
  return executor(context, execCtx);
}

export function isValidRequirementSummary(
  value: unknown,
  expectedRequirementId: string
): value is RequirementSummary {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.requirement_id !== expectedRequirementId) return false;
  if (typeof v.multi_repo !== "boolean") return false;
  if (typeof v.main_repo !== "string" || v.main_repo.trim().length === 0) return false;
  if (!Array.isArray(v.sub_requirements)) return false;
  for (const item of v.sub_requirements) {
    if (typeof item !== "object" || item === null) return false;
    const i = item as Record<string, unknown>;
    if (typeof i.repo !== "string" || i.repo.trim().length === 0) return false;
    if (typeof i.task !== "string" || i.task.trim().length === 0) return false;
  }
  if (!v.multi_repo && v.sub_requirements.length !== 0) return false;
  if (v.multi_repo && v.sub_requirements.length === 0) return false;
  return true;
}

const MAX_KIMI_REQUIREMENT_SUMMARY_CHARS = 16_000;

function parseRequirementSummaryFromGatewayResult(
  result: ExecutionResult,
  expectedRequirementId: string
): RequirementSummary | undefined {
  if (!result.success) return undefined;
  const summary = result.output["summary"];
  if (typeof summary !== "string") return undefined;
  if (summary.length > MAX_KIMI_REQUIREMENT_SUMMARY_CHARS) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(summary);
  } catch {
    return undefined;
  }
  if (isValidRequirementSummary(parsed, expectedRequirementId)) {
    return parsed;
  }
  return undefined;
}

function buildDeterministicRequirementSummary(
  rawText: string,
  requirementId: string
): RequirementSummary {
  const multiRepo = /(sync|integration|event|pipeline|api|service|system|orchestrat)/i.test(rawText) ||
                    /([A-Z][a-z]+[-_][A-Z][a-z]+).*([A-Z][a-z]+[-_][A-Z][a-z]+)/.test(rawText);
  const subReqs = multiRepo ? extractSubRequirements(rawText) : [];
  return {
    requirement_id: requirementId,
    multi_repo: multiRepo,
    main_repo: "main",
    sub_requirements: subReqs,
  };
}

async function executeRequirementSummary(
  rawText: string,
  requirementId: string,
  gateway: RuntimeExecutionGateway,
  mode: RequirementSummaryMode
): Promise<Record<string, unknown>> {
  if (mode === "kimi_gateway") {
    try {
      const result = await gateway.execute({
        type: "llm_task",
        node: "requirement-summary",
        agent: "kimi",
        requirementId,
        input: {
          requirement: rawText,
          expected_output: "requirement_summary",
        },
      });
      const parsed = parseRequirementSummaryFromGatewayResult(result, requirementId);
      if (parsed) {
        return {
          ...parsed,
          parsed_at: new Date().toISOString(),
          execution_source: "kimi_real",
        };
      }
    } catch {
      // Fall through to deterministic fallback.
    }
    return {
      ...buildDeterministicRequirementSummary(rawText, requirementId),
      parsed_at: new Date().toISOString(),
      execution_source: "kimi_fallback",
    };
  }

  return {
    ...buildDeterministicRequirementSummary(rawText, requirementId),
    parsed_at: new Date().toISOString(),
    execution_source: "deterministic",
  };
}

function extractSubRequirements(text: string): { repo: string; task: string }[] {
  const results: { repo: string; task: string }[] = [];
  const sentences = text.split(/[.;。；\n]+/);
  for (const sentence of sentences) {
    const match = sentence.match(/\b(repo[-_][A-Z]+|[A-Z][a-z]+Repo)\b/i);
    if (match) results.push({ repo: match[1], task: sentence.trim() });
  }
  return results;
}

function findUsableCodePatch(artifacts: readonly Artifact[]): Artifact | undefined {
  for (const artifact of artifacts) {
    if (artifact.type !== "code_patch") continue;
    const file = artifact.content["file"];
    const patch = artifact.content["patch"];
    if (
      typeof file === "string" &&
      file.trim().length > 0 &&
      typeof patch === "string" &&
      patch.trim().length > 0
    ) {
      return artifact;
    }
  }
  return undefined;
}

// Pure implementation executor — mode from context, not inline decision
export async function executeImplementation(
  context: Record<string, unknown>,
  execCtx: ExecutionContext,
  gateway: RuntimeExecutionGateway = executionGateway
): Promise<ImplementationExecutorOutput> {
  const input = buildImplementationExecutorInput(context, execCtx);
  const subReqs = input.summary.sub_requirements || [];

  if (subReqs.length > 0) {
    const result = await executeFanout(input.requirementId, subReqs, execCtx);
    return {
      node: "implementation",
      mode: "fanout",
      result: "fanout_completed",
      fanout_result: result,
      implementation_outcome: "fanout",
    };
  }
  if (input.executionMode === "speckit") {
    return executeSpeckitPipeline(input.requirementId, execCtx);
  }
  // Direct path — route through Execution Gateway with typed implementation input.
  const result = await gateway.execute({
    type: "code_generation",
    node: "implementation",
    agent: "codex",
    requirementId: input.requirementId,
    input: {
      implementationExecutorInput: input,
    },
  });

  const gatewayArtifacts = [...result.artifacts];
  const gatewayCodePatch = findUsableCodePatch(gatewayArtifacts);

  if (gatewayCodePatch) {
    return {
      node: "implementation",
      mode: "direct",
      result: "implementation_completed",
      execution_result: result.output,
      code: gatewayCodePatch.content["patch"] as string,
      artifacts: gatewayArtifacts,
      implementation_outcome: "real_code_patch",
    };
  }

  const shadowPatch = buildShadowCodePatchArtifact(input);
  const safeGatewayArtifacts = gatewayArtifacts.filter(
    (a) => a.type !== "code_patch"
  );
  return {
    node: "implementation",
    mode: "direct",
    result: "implementation_completed",
    execution_result: result.output,
    code: shadowPatch.content["patch"] as string,
    artifacts: [...safeGatewayArtifacts, shadowPatch],
    implementation_outcome: "shadow_code_patch",
  };
}

// Fanout: Parallel Multi-Repo Execution
export async function executeFanout(
  requirementId: string,
  subReqs: { repo: string; task: string }[],
  _execCtx: ExecutionContext
): Promise<FanoutResult> {
  const promises = subReqs.map(async (sub) => {
    const result = await executionGateway.execute({
      type: "code_generation",
      node: "implementation",
      agent: "codex",
      requirementId,
      input: { repo: sub.repo, task: sub.task },
    });
    return { repo: sub.repo, status: result.success ? "success" as const : "failed" as const, output: result.output || {} };
  });
  const repoResults = await Promise.all(promises);
  return { requirement_id: requirementId, repo_results: repoResults, completed_at: new Date().toISOString() };
}

// Speckit: Optional Pipeline
export async function executeSpeckitPipeline(requirementId: string, _execCtx: ExecutionContext): Promise<ImplementationExecutorOutput> {
  const stages = ["spec", "analyze", "implement", "sync"];
  const results: Record<string, string> = {};
  for (const stage of stages) {
    results[stage] = `${stage}_completed`;
  }
  return {
    node: "implementation",
    mode: "speckit",
    result: "speckit_completed",
    speckit_stages: results,
    requirement_id: requirementId,
    implementation_outcome: "speckit",
  };
}
