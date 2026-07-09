// Runtime Node Executors — Stateless DocFlow Node Implementations
// ================================================================
// Each executor is a STATELESS function: (context, execCtx) → output.
// No branching. No flow decisions. Graph Kernel controls transitions.
// This module provides the default executor map and a dispatch helper.

import { NodeType } from "../sdlc_graph/types";
import { ExecutionContext } from "./execution-context";
import { executionGateway } from "../execution";
import { Artifact } from "./artifact";

export type ExecutionMode = "direct" | "speckit";

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
}

// Default executor map — no switch, no branching
export const DEFAULT_EXECUTORS: RuntimeExecutorMap = {
  "requirement-summary": (ctx, _execCtx) =>
    executeRequirementSummary(ctx.raw_text as string, ctx.requirement_id as string),
  "tech-design": (ctx, _execCtx) =>
    ({ node: "tech-design", result: "design_completed", summary: ctx }),
  "review": (ctx, execCtx) =>
    ({
      node: "review",
      result: (ctx["review_result"] as string) || (execCtx?.metadata?.complexity === "high" ? "FAIL" : "PASS"),
      reviewed_at: new Date().toISOString(),
    }),
  "implementation": (ctx, execCtx) =>
    executeImplementation(ctx, execCtx) as unknown as Promise<Record<string, unknown>>,
  "validation": (_ctx, _execCtx) =>
    ({ node: "validation", result: "validated", all_checks_passed: true }),
};

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

function executeRequirementSummary(rawText: string, requirementId: string): Record<string, unknown> {
  const multiRepo = /(sync|integration|event|pipeline|api|service|system|orchestrat)/i.test(rawText) ||
                    /([A-Z][a-z]+[-_][A-Z][a-z]+).*([A-Z][a-z]+[-_][A-Z][a-z]+)/.test(rawText);
  const subReqs = multiRepo ? extractSubRequirements(rawText) : [];
  return {
    requirement_id: requirementId,
    multi_repo: multiRepo,
    main_repo: "main",
    sub_requirements: subReqs,
    parsed_at: new Date().toISOString(),
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

// Pure implementation executor — mode from context, not inline decision
export async function executeImplementation(context: Record<string, unknown>, execCtx: ExecutionContext): Promise<ImplementationExecutorOutput> {
  const input = buildImplementationExecutorInput(context, execCtx);
  const subReqs = input.summary.sub_requirements || [];

  if (subReqs.length > 0) {
    const result = await executeFanout(input.requirementId, subReqs, execCtx);
    return { node: "implementation", mode: "fanout", result: "fanout_completed", fanout_result: result };
  }
  if (input.executionMode === "speckit") {
    return executeSpeckitPipeline(input.requirementId, execCtx);
  }
  // Direct path — route through Execution Gateway
  const result = await executionGateway.execute({
    type: "code_generation",
    node: "implementation",
    agent: "codex",
    requirementId: input.requirementId,
    input: { mode: input.executionMode, context },
  });
  return { node: "implementation", mode: "direct", result: "implementation_completed", execution_result: result.output, artifacts: result.artifacts as Artifact[] };
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
  return { node: "implementation", mode: "speckit", result: "speckit_completed", speckit_stages: results, requirement_id: requirementId };
}
