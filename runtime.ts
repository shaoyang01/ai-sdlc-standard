// SDLC Runtime — Graph Interpreter
// =================================
// Wired to SDLC Graph Kernel as SINGLE source of truth.
// No inline flow table. No duplicated transition logic.
// Graph defines the path — Runtime executes it.
//
// Entry: run(requirement: string) → RuntimeResult

import { NodeType, GraphNode } from "../sdlc_graph/types";
import { getNextNode, isTerminal } from "../sdlc_graph/transitions";
import { SDLC_NODES, SDLC_EDGES } from "../sdlc_graph/graph";

// ─── Types ────────────────────────────────────────────

type LoopAgent = "kimi" | "codex" | "hermes";
type ExecutionMode = "direct" | "speckit";

interface ExecutionTraceEntry {
  node: NodeType;
  agent: LoopAgent;
  status: "success" | "failure";
  output: Record<string, unknown>;
  timestamp: string;
}

interface FanoutResult {
  requirement_id: string;
  repo_results: { repo: string; status: "success" | "failed"; output: Record<string, unknown> }[];
  completed_at: string;
}

interface RuntimeResult {
  requirement_id: string;
  execution_trace: ExecutionTraceEntry[];
  fanout_results?: FanoutResult;
  final_status: "success" | "partial" | "failed";
  completed_at: string;
}

interface RequirementSummary {
  requirement_id: string;
  multi_repo: boolean;
  main_repo: string;
  sub_requirements: { repo: string; task: string }[];
}

// ─── Agent Map (to be migrated to Graph Kernel agent registry) ──

const AGENT_MAP: Record<NodeType, LoopAgent> = {
  "requirement-summary": "kimi",
  "tech-design":          "kimi",
  "review":               "codex",
  "implementation":       "codex",
  "validation":           "hermes",
};

function getAgent(node: NodeType): LoopAgent {
  return AGENT_MAP[node] || "kimi";
}

// ─── DocFlow Node Execution ──────────────────────────

async function executeDocFlowNode(
  node: NodeType,
  context: Record<string, unknown>
): Promise<Record<string, unknown>> {
  switch (node) {
    case "requirement-summary":
      return executeRequirementSummary(context.raw_text as string, context.requirement_id as string);
    case "tech-design":
      return { node: "tech-design", result: "design_completed", summary: context };
    case "review":
      return { node: "review", result: "PASS", reviewed_at: new Date().toISOString() };
    case "implementation":
      return executeImplementation(context);
    case "validation":
      return { node: "validation", result: "validated", all_checks_passed: true };
  }
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

async function executeImplementation(context: Record<string, unknown>): Promise<Record<string, unknown>> {
  const summary = (context["requirement-summary"] || context) as RequirementSummary;
  const multiRepo = summary.multi_repo === true;
  const subReqs = summary.sub_requirements || [];

  if (multiRepo && subReqs.length > 0) {
    const result = await executeFanout(summary.requirement_id, subReqs);
    return { node: "implementation", mode: "fanout", fanout_result: result };
  }

  const mode: ExecutionMode = (context.execution_mode as ExecutionMode) || "direct";
  if (mode === "speckit") {
    return executeSpeckitPipeline(summary.requirement_id);
  }
  return { node: "implementation", mode: "direct", result: "implementation_completed" };
}

// ─── Fanout: Parallel Multi-Repo Execution ────────────

async function executeFanout(
  requirementId: string,
  subReqs: { repo: string; task: string }[]
): Promise<FanoutResult> {
  const promises = subReqs.map(async (sub) => {
    const result = await dispatchToAgent("implementation", "codex", { repo: sub.repo, task: sub.task });
    return { repo: sub.repo, status: result.success ? "success" as const : "failed" as const, output: result.output || {} };
  });
  const repoResults = await Promise.all(promises);
  return { requirement_id: requirementId, repo_results: repoResults, completed_at: new Date().toISOString() };
}

// ─── Agents: Deterministic Dispatch ───────────────────

async function dispatchToAgent(
  node: string,
  agent: string,
  payload: Record<string, unknown>
): Promise<{ success: boolean; output?: Record<string, unknown> }> {
  return {
    success: true,
    output: { node, agent, result: `${node}_by_${agent}`, timestamp: new Date().toISOString(), ...payload },
  };
}

// ─── Speckit: Optional Pipeline ───────────────────────

async function executeSpeckitPipeline(requirementId: string): Promise<Record<string, unknown>> {
  const stages = ["spec", "analyze", "implement", "sync"];
  const results: Record<string, string> = {};
  for (const stage of stages) {
    results[stage] = `${stage}_completed`;
  }
  return { node: "implementation", mode: "speckit", speckit_stages: results, requirement_id: requirementId };
}

// ─── MAIN RUNTIME — GRAPH INTERPRETER ───────────────────
// Graph Kernel is the SINGLE source of truth for transitions.

export async function run(requirement: string): Promise<RuntimeResult> {
  const requirementId = `REQ-${Date.now()}`;
  const trace: ExecutionTraceEntry[] = [];
  const context: Record<string, unknown> = { raw_text: requirement, requirement_id: requirementId, execution_mode: "direct" };

  let currentNode: NodeType | null = "requirement-summary";

  // Graph-driven execution loop — transitions from sdlc_graph/transitions.ts
  while (currentNode) {
    const agent = getAgent(currentNode);
    const nodeOutput = await executeDocFlowNode(currentNode, context);

    context[currentNode] = nodeOutput;

    trace.push({
      node: currentNode,
      agent,
      status: "success",
      output: nodeOutput,
      timestamp: new Date().toISOString(),
    });

    currentNode = getNextNode(currentNode);  // ← Graph Kernel transition
  }

  const implementationOutput = context["implementation"] as Record<string, unknown> | undefined;
  const fanoutResult = implementationOutput?.fanout_result as FanoutResult | undefined;
  const failedCount = (fanoutResult?.repo_results || []).filter((r: { status: string }) => r.status === "failed").length;
  const succeededCount = (fanoutResult?.repo_results || []).filter((r: { status: string }) => r.status === "success").length;

  let finalStatus: "success" | "partial" | "failed";
  if (failedCount === 0) finalStatus = "success";
  else if (succeededCount > 0) finalStatus = "partial";
  else finalStatus = "failed";

  return {
    requirement_id: requirementId,
    execution_trace: trace,
    fanout_results: fanoutResult,
    final_status: finalStatus,
    completed_at: new Date().toISOString(),
  };
}

// ─── Quick Test ───────────────────────────────────────

async function main() {
  console.log("=== SDLC Graph Interpreter Test ===");
  const result = await run("build payment system with order sync across inventory service");
  console.log(JSON.stringify(result, null, 2));
}

main();
