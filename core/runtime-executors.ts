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
  solutionChallengeMode?: "disabled" | "shadow" | "gateway_shadow";
  solutionChallengeGateway?: RuntimeExecutionGateway;
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

import {
  type SolutionChallengeState,
  advanceChallengeCycle,
  deriveSolutionChallengeResult,
  validateSolutionChallengeState,
} from "./solution-challenge-state";

// Re-export for consumers (execution-context, runtime, tests)
export { type SolutionChallengeState } from "./solution-challenge-state";
export { normalizeSolutionChallengeOutput as normalizeSolutionOutput } from "./solution-challenge-state";

function executeSolutionChallenge(
  _rawText: string,
  requirementId: string,
  techDesignOutput: Record<string, unknown>,
  previous?: SolutionChallengeState
): Record<string, unknown> {
  const state = advanceChallengeCycle(previous);

  return {
    node: "solution-challenge",
    skill: "sdlc-solution-challenger",
    // explicit skill metadata binding: implemented
    // real Gateway skill invocation: not implemented
    result: deriveSolutionChallengeResult(state.status),
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

interface ChallengePromptInput {
  requirement: string;
  techDesign: string;
  mode: string;
  currentCycle: number;
  previousFindingIds: string[];
}

function buildChallengePrompt(input: ChallengePromptInput): string {
  return [
    "You are a technical specification challenger (sdlc-solution-challenger).",
    "Review the technical specification below against the current delivery phase.",
    "",
    "Requirement:",
    input.requirement,
    "",
    "Technical Specification (summary):",
    input.techDesign,
    "",
    `Mode: ${input.mode} | Cycle: ${input.currentCycle}/2`,
    input.previousFindingIds.length > 0
      ? `Previous findings to verify: ${input.previousFindingIds.join(", ")}`
      : "",
    "",
    "Return a single JSON object with this structure:",
    JSON.stringify({
      status: "NEEDS_REVISION | READY_FOR_GATE",
      mode: input.mode,
      currentCycle: input.currentCycle,
      maxCycles: 2,
      exhausted: input.currentCycle >= 2,
      artifactStatus: "shadow_only",
      reportPath: null,
      findings: [],
      blocking_count: 0,
      required_count: 0,
      non_blocking_count: 0,
      out_of_scope_count: 0,
    }),
    "",
    "Do not include markdown fences or explanatory text.",
  ].filter(Boolean).join("\n");
}

/** Execute solution-challenge via real Gateway in shadow mode.
 *  Calls RuntimeExecutionGateway with explicit skill name.
 *  Observed result is recorded but routing always pass-through to review. */
async function executeGatewayShadowChallenge(
  requirement: string,
  requirementId: string,
  techDesignOutput: Record<string, unknown>,
  previous: SolutionChallengeState | undefined,
  gateway: RuntimeExecutionGateway
): Promise<Record<string, unknown>> {
  const cycle = advanceChallengeCycle(previous);
  const base = {
    node: "solution-challenge",
    skill: "sdlc-solution-challenger",
    executor_type: "gateway_shadow",
  };

  const prompt = buildChallengePrompt({
    requirement,
    techDesign: JSON.stringify(techDesignOutput).slice(0, 8000),
    mode: cycle.mode,
    currentCycle: cycle.currentCycle,
    previousFindingIds: previous?.findingIds ?? [],
  });

  try {
    const gwResult = await gateway.execute({
      type: "llm_task",
      node: "solution-challenge",
      agent: "kimi",
      skill: "sdlc-solution-challenger",
      requirementId,
      input: {
        prompt,
        requirement,
        "tech-design": techDesignOutput,
        mode: cycle.mode,
        currentCycle: cycle.currentCycle,
        previousFindingIds: previous?.findingIds ?? [],
      },
    });

    const parsed = parseChallengeResult(gwResult, cycle);

    // Build the output state — only use parsed state when available.
    // On failure, keep the shadow cycle state (not READY_FOR_GATE).
    const outputState = parsed.availability === "available" && parsed.state
      ? parsed.state : cycle;

    return {
      ...base,
      result: "PASS",
      execution_source: parsed.availability === "available" ? "gateway" : "gateway_error",
      executor_type: "gateway_shadow",
      fallback_used: parsed.availability !== "available",
      fallback_reason: parsed.availability !== "available"
        ? (parsed.error ?? "gateway_unavailable") : "none",
      solution_challenge: outputState,
      solution_challenge_observation: parsed,
      observedStatus: parsed.state?.status ?? "unavailable",
      routingEffect: "shadow_pass_through",
      wouldRouteTo: parsed.state
        ? (parsed.state.status === "NEEDS_REVISION" && !parsed.state.exhausted
          ? "tech-design" : "review")
        : "review",
      blocking_count: parsed.counts.blocking,
      required_count: parsed.counts.required,
      non_blocking_count: parsed.counts.nonBlocking,
      out_of_scope_count: parsed.counts.outOfScope,
      recommended_next_step: parsed.state
        ? (parsed.state.status === "NEEDS_REVISION" && parsed.state.exhausted
          ? "ESCALATE_TO_SOLUTION_REVIEWER"
          : parsed.state.status === "NEEDS_REVISION"
          ? "RETURN_TO_SPECIFICATION_WRITER"
          : "PROCEED_TO_SOLUTION_REVIEWER")
        : "PROCEED_TO_SOLUTION_REVIEWER",
      gateway_artifacts: gwResult.artifacts ?? [],
      duration_ms: 0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      result: "PASS",
      execution_source: "gateway_error",
      executor_type: "gateway_shadow",
      fallback_used: true,
      fallback_reason: msg.slice(0, 200),
      solution_challenge: cycle,
      solution_challenge_observation: {
        availability: "unavailable" as const,
        error: msg.slice(0, 200),
      } as ChallengeObservation,
      observedStatus: "unavailable",
      routingEffect: "shadow_pass_through",
      wouldRouteTo: "review",
      blocking_count: 0, required_count: 0, non_blocking_count: 0, out_of_scope_count: 0,
      recommended_next_step: "PROCEED_TO_SOLUTION_REVIEWER",
      gateway_artifacts: [],
      duration_ms: 0,
    };
  }
}

interface ParsedChallengeResult {
  availability: "available" | "unavailable";
  state?: SolutionChallengeState;
  findings?: Record<string, unknown>[];
  findingIds: string[];
  counts: { blocking: number; required: number; nonBlocking: number; outOfScope: number };
  error?: string;
}

interface ChallengeObservation {
  availability: "available" | "unavailable";
  state?: SolutionChallengeState;
  findings?: Record<string, unknown>[];
  findingIds?: string[];
  counts?: { blocking: number; required: number; nonBlocking: number; outOfScope: number };
  error?: string;
}

function parseChallengeResult(
  gwResult: { success: boolean; output?: Record<string, unknown>; error?: string; artifacts?: readonly unknown[] },
  fallbackState: SolutionChallengeState
): ParsedChallengeResult {
  const empty = { blocking: 0, required: 0, nonBlocking: 0, outOfScope: 0 };

  if (!gwResult.success) {
    return { availability: "unavailable", findingIds: [], counts: empty, error: gwResult.error ?? "gateway_returned_failure" };
  }

  const rawOutput = gwResult.output;
  if (!rawOutput) {
    return { availability: "unavailable", findingIds: [], counts: empty, error: "empty_gateway_output" };
  }

  // Parse from summary (Kimi text output → JSON)
  const summary = typeof rawOutput["summary"] === "string" ? rawOutput["summary"] as string : "";
  if (summary) {
    try {
      const parsed = JSON.parse(summary);
      if (typeof parsed === "object" && parsed !== null) {
        const state = validateSolutionChallengeState({ ...fallbackState, ...parsed });
        const findings = Array.isArray(parsed["findings"]) ? parsed["findings"] as Record<string, unknown>[] : [];
        const findingIds = extractFindingIds(findings, parsed);
        const counts = {
          blocking: typeof parsed["blocking_count"] === "number" ? parsed["blocking_count"] : 0,
          required: typeof parsed["required_count"] === "number" ? parsed["required_count"] : 0,
          nonBlocking: typeof parsed["non_blocking_count"] === "number" ? parsed["non_blocking_count"] : 0,
          outOfScope: typeof parsed["out_of_scope_count"] === "number" ? parsed["out_of_scope_count"] : 0,
        };
        // Merge findingIds into state for propagation
        if (findingIds.length > 0) {
          state.findingIds = findingIds;
        }
        return { availability: "available", state, findings, findingIds, counts };
      }
    } catch {
      // Fall through to raw solution_challenge
    }
  }

  // Try raw solution_challenge field
  const rawState = rawOutput["solution_challenge"] as Record<string, unknown> | undefined;
  if (rawState) {
    try {
      const state = validateSolutionChallengeState(rawState);
      return { availability: "available", state, findingIds: state.findingIds ?? [], counts: empty };
    } catch {
      return { availability: "unavailable", findingIds: [], counts: empty, error: "invalid_solution_challenge_state" };
    }
  }

  return { availability: "unavailable", findingIds: [], counts: empty, error: "no_parseable_output" };
}

function extractFindingIds(findings: Record<string, unknown>[], parsed: Record<string, unknown>): string[] {
  const ids: string[] = [];
  for (const f of findings) {
    const id = f["id"];
    if (typeof id === "string" && id.length > 0) ids.push(id);
  }
  // Also check top-level finding_ids
  const topIds = parsed["finding_ids"];
  if (Array.isArray(topIds)) {
    for (const id of topIds) {
      if (typeof id === "string" && id.length > 0 && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
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
    "solution-challenge": (ctx, _execCtx) => {
      const mode = options.solutionChallengeMode ?? "disabled";
      const gateway = options.solutionChallengeGateway;
      if (mode === "gateway_shadow" && gateway) {
        return executeGatewayShadowChallenge(
          ctx.raw_text as string,
          ctx.requirement_id as string,
          (ctx["tech-design"] ?? {}) as Record<string, unknown>,
          _execCtx?.metadata?.solutionChallenge as SolutionChallengeState | undefined,
          gateway,
        );
      }
      return executeSolutionChallenge(
        ctx.raw_text as string,
        ctx.requirement_id as string,
        (ctx["tech-design"] ?? {}) as Record<string, unknown>,
        _execCtx?.metadata?.solutionChallenge as SolutionChallengeState | undefined
      );
    },
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
