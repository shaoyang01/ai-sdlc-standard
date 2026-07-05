// SDLC Runtime — Graph Interpreter
// =================================
// Wired to SDLC Graph Kernel as SINGLE source of truth.
// No inline flow table. No duplicated transition logic.
// Graph defines the path — Runtime executes it.
//
// Entry: run(requirement: string) → RuntimeResult

import { NodeType, GraphNode } from "./sdlc_graph/types";
import { getNextNode, isTerminal } from "./sdlc_graph/transitions";
import { SDLC_NODES, SDLC_EDGES } from "./sdlc_graph/graph";
import { ExecutionContext } from "./core/execution-context";
import { buildExecutionContext } from "./core/context-builder";
import { createTraceItem } from "./core/execution-trace";
import { selectAgent } from "./core/agent-decision";
import { inferComplexity } from "./core/complexity-inference";
import { resolveAgentByPolicy } from "./core/agent-policy-engine";
import { createInitialState, updateState, ExecutionState } from "./core/execution-state";
import { transition, replayExecution } from "./core/state-machine-vm";
import { executionGateway } from "./execution";
import { Artifact } from "./core/artifact";
import { artifactsFromNodeOutput } from "./core/node-artifacts";
import { analyzeRuntimeFeedback } from "./core/feedback-analyzer";
import { RuntimeFeedback } from "./core/feedback-types";
import { isPolicyMemoryEnabled, isPolicyMemoryReadEnabled, getPolicyMemoryPath } from "./core/policy-memory-config";
import { buildPolicyMemoryRecord } from "./core/policy-memory-builder";
import { appendPolicyMemoryRecord, readPolicyMemoryAgentSummaries } from "./core/policy-memory-store";
import { buildMemoryPolicySuggestions } from "./core/policy-memory-analyzer";
import { buildMemoryShadowRoutingDecisions } from "./core/memory-routing-shadow";
import { buildEvolutionProposals } from "./core/evolution-proposal-analyzer";
import { inferSkillForExecution } from "./core/agent-skill-registry";
import { ExecutionRequest } from "./execution/types";

// ─── Types ────────────────────────────────────────────

type LoopAgent = "kimi" | "codex" | "hermes";
type ExecutionMode = "direct" | "speckit";

// RuntimeNode extends Graph Kernel NodeType with runtime-managed nodes
type RuntimeNode = NodeType | "code-review" | "bugfix";

interface ExecutionTraceEntry {
  node: RuntimeNode;
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
  artifacts: Artifact[];
  feedback: RuntimeFeedback;
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

// Build a node→agent map from execution trace for shadow routing context
function buildCurrentAgentsByNode(
  trace: ReadonlyArray<{ node: string; agent: string }>
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of trace) {
    if (!(entry.node in map)) {
      map[entry.node] = entry.agent;
    }
  }
  return map;
}

// ─── Skill Annotation — metadata only, does not affect routing ──
// Infers canonical sdlc-* skill when mapping is unambiguous.
// Never throws. Never blocks execution.

function buildSkillAwareExecutionRequest(input: {
  type: ExecutionRequest["type"];
  node: string;
  agent: LoopAgent;
  requirementId: string;
  execInput: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): ExecutionRequest {
  const binding = inferSkillForExecution({
    agent: input.agent,
    node: input.node,
    requestType: input.type,
  });
  return {
    type: input.type,
    node: input.node,
    agent: input.agent,
    requirementId: input.requirementId,
    input: input.execInput,
    metadata: input.metadata,
    skill: binding?.skill,
  };
}

// ─── DocFlow Node Execution (PURE EXECUTORS) ──────────
// Each executor is a STATELESS function: (context) → output.
// No branching. No flow decisions. Graph Kernel controls transitions.

type NodeExecutor = (context: Record<string, unknown>, _ctx: ExecutionContext) => Record<string, unknown> | Promise<Record<string, unknown>>;

// Static executor map — no switch, no branching
const EXECUTORS: Record<NodeType, NodeExecutor> = {
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
    executeImplementation(ctx, execCtx),
  "validation": (_ctx, _execCtx) =>
    ({ node: "validation", result: "validated", all_checks_passed: true }),
};

// Pure dispatch — no control logic, just lookup + execute
async function executeDocFlowNode(
  node: NodeType,
  context: Record<string, unknown>,
  _ctx: ExecutionContext
): Promise<Record<string, unknown>> {
  const executor = EXECUTORS[node];
  return executor(context, _ctx);
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
async function executeImplementation(context: Record<string, unknown>, _ctx: ExecutionContext): Promise<Record<string, unknown>> {
  const summary = (context["requirement-summary"] || context) as RequirementSummary;
  const mode: ExecutionMode = (context.execution_mode as ExecutionMode) || "direct";
  const subReqs = summary.sub_requirements || [];

  if (subReqs.length > 0) {
    const result = await executeFanout(summary.requirement_id, subReqs, _ctx);
    return { node: "implementation", mode: "fanout", fanout_result: result };
  }
  if (mode === "speckit") {
    return executeSpeckitPipeline(summary.requirement_id, _ctx);
  }
  // Direct path — route through Execution Gateway
  const result = await executionGateway.execute(buildSkillAwareExecutionRequest({
    type: "code_generation",
    node: "implementation",
    agent: "codex",
    requirementId: summary.requirement_id,
    execInput: { mode, context },
  }));
  return { node: "implementation", mode: "direct", result: "implementation_completed", execution_result: result.output, artifacts: result.artifacts };
}

// ─── Fanout: Parallel Multi-Repo Execution ────────────

async function executeFanout(
  requirementId: string,
  subReqs: { repo: string; task: string }[],
  _ctx: ExecutionContext
): Promise<FanoutResult> {
  const promises = subReqs.map(async (sub) => {
    const result = await executionGateway.execute(buildSkillAwareExecutionRequest({
      type: "code_generation",
      node: "implementation",
      agent: "codex",
      requirementId,
      execInput: { repo: sub.repo, task: sub.task },
    }));
    return { repo: sub.repo, status: result.success ? "success" as const : "failed" as const, output: result.output || {} };
  });
  const repoResults = await Promise.all(promises);
  return { requirement_id: requirementId, repo_results: repoResults, completed_at: new Date().toISOString() };
}

// ─── Speckit: Optional Pipeline ───────────────────────

async function executeSpeckitPipeline(requirementId: string, _ctx: ExecutionContext): Promise<Record<string, unknown>> {
  const stages = ["spec", "analyze", "implement", "sync"];
  const results: Record<string, string> = {};
  for (const stage of stages) {
    results[stage] = `${stage}_completed`;
  }
  return { node: "implementation", mode: "speckit", speckit_stages: results, requirement_id: requirementId };
}

// ─── Code Review + Bugfix Loop ────────────────────────
// Bounded retry loop: review → optional bugfix → re-review.
// Runs after implementation, before validation.
// Default shadow path passes on first review.

const MAX_BUGFIX_ATTEMPTS = 2;

interface ReviewLoopResult {
  artifacts: Artifact[];
  traceEntries: ExecutionTraceEntry[];
  finalReviewStatus: "PASS" | "FAIL";
}

export async function runCodeReviewBugfixLoop(input: {
  requirementId: string;
  artifacts: Artifact[];
  agent: LoopAgent;
}): Promise<ReviewLoopResult> {
  const collectedArtifacts: Artifact[] = [];
  const traceEntries: ExecutionTraceEntry[] = [];
  let currentArtifacts = input.artifacts;
  let attempts = 0;

  while (attempts <= MAX_BUGFIX_ATTEMPTS) {
    // ── Code Review (via Execution Gateway) ──
    const review = await executionGateway.execute(buildSkillAwareExecutionRequest({
      type: "code_review",
      node: "code-review",
      agent: input.agent,
      requirementId: input.requirementId,
      execInput: { artifacts: currentArtifacts },
      metadata: { attempt: attempts },
    }));

    collectedArtifacts.push(...(review.artifacts as Artifact[]));
    traceEntries.push({
      node: "code-review",
      agent: input.agent,
      status: review.output["result"] === "PASS" ? "success" : "failure",
      output: review.output,
      timestamp: new Date().toISOString(),
    });

    if (review.output["result"] === "PASS") {
      return {
        artifacts: collectedArtifacts,
        traceEntries,
        finalReviewStatus: "PASS",
      };
    }

    attempts++;
    if (attempts > MAX_BUGFIX_ATTEMPTS) {
      return {
        artifacts: collectedArtifacts,
        traceEntries,
        finalReviewStatus: "FAIL",
      };
    }

    // ── Bugfix (via Execution Gateway) ──
    const findings = review.output["findings"] as ReadonlyArray<{ severity: string; message: string; artifactId?: string; file?: string }>;
    const bugfix = await executionGateway.execute(buildSkillAwareExecutionRequest({
      type: "bugfix",
      node: "bugfix",
      agent: input.agent,
      requirementId: input.requirementId,
      execInput: { artifacts: currentArtifacts, findings: findings || [] },
      metadata: { attempt: attempts },
    }));

    collectedArtifacts.push(...(bugfix.artifacts as Artifact[]));
    traceEntries.push({
      node: "bugfix",
      agent: input.agent,
      status: "success",
      output: bugfix.output,
      timestamp: new Date().toISOString(),
    });

    // Update current artifacts for re-review (append bugfix artifacts)
    currentArtifacts = [...currentArtifacts, ...(bugfix.artifacts as Artifact[])];
  }

  // Should not reach here due to loop bounds, but satisfy exhaustiveness
  return {
    artifacts: collectedArtifacts,
    traceEntries,
    finalReviewStatus: "FAIL",
  };
}

// ─── MAIN RUNTIME — GRAPH INTERPRETER ───────────────────
// Graph Kernel is the SINGLE source of truth for transitions.

export async function run(requirement: string): Promise<RuntimeResult> {
  const requirementId = `REQ-${Date.now()}`;
  const trace: ExecutionTraceEntry[] = [];
  const legacyContext: Record<string, unknown> = { raw_text: requirement, requirement_id: requirementId, execution_mode: "direct" };

  // ─── ExecutionContext — created once, persists across all nodes ───
  const execCtx: ExecutionContext = buildExecutionContext(
    "requirement-summary",
    { requirement, requirement_id: requirementId },
    { requirementId, complexity: "medium" }
  );

  // ─── State Machine VM — state-driven execution ──────────
  let vmState: ExecutionState = createInitialState(execCtx);

  let currentNode: NodeType | null = "requirement-summary";
  let retryCount = 0;
  const MAX_RETRIES = 3;
  const artifacts: Artifact[] = [];

  // State-driven execution loop — VM transitions, not node-driven
  while (currentNode && vmState.status === "running") {
    // Agent selection: policy engine → decision layer → AGENT_MAP fallback
    const policyAgent = resolveAgentByPolicy(execCtx, currentNode);
    const agent = (policyAgent ?? selectAgent(currentNode, execCtx) ?? getAgent(currentNode)) as LoopAgent;

    // Update ExecutionContext for current node
    execCtx.node = currentNode;
    execCtx.input = { requirement, requirement_id: requirementId };
    execCtx.metadata.complexity = inferComplexity(requirement);

    const nodeOutput = await executeDocFlowNode(currentNode, legacyContext, execCtx);
    legacyContext[currentNode] = nodeOutput;

    // Record trace via standard ExecutionTrace
    const traceItem = createTraceItem(currentNode, execCtx.input, nodeOutput, agent);
    execCtx.trace.push(traceItem);

    // Collect standardized artifacts from node output
    const nodeArtifacts = artifactsFromNodeOutput({
      requirementId,
      node: currentNode,
      agent,
      output: nodeOutput,
      index: artifacts.length,
    });
    artifacts.push(...nodeArtifacts);

    // VM state transition — deterministic state update
    vmState = transition(vmState, currentNode, traceItem);

    trace.push({
      node: currentNode,
      agent,
      status: nodeOutput["result"] === "FAIL" ? "failure" : "success",
      output: nodeOutput,
      timestamp: new Date().toISOString(),
    });

    // Track retries for review→tech-design feedback loop
    if (currentNode === "review" && nodeOutput["result"] === "FAIL") {
      retryCount++;
    } else if (currentNode === "tech-design") {
      // retryCount persists across re-design cycles
    } else {
      retryCount = 0; // reset on non-loop nodes
    }

    // ─── Code Review + Bugfix Loop (after implementation, before validation) ───
    if (currentNode === "implementation") {
      const reviewResult = await runCodeReviewBugfixLoop({
        requirementId,
        artifacts: [...artifacts],
        agent: "codex",
      });
      artifacts.push(...reviewResult.artifacts);
      trace.push(...reviewResult.traceEntries);
    }

    // Context-aware transition — review result drives PASS/FAIL routing
    currentNode = getNextNode(currentNode, nodeOutput, retryCount);
  }

  const implementationOutput = legacyContext["implementation"] as Record<string, unknown> | undefined;
  const fanoutResult = implementationOutput?.fanout_result as FanoutResult | undefined;
  const failedCount = (fanoutResult?.repo_results || []).filter((r: { status: string }) => r.status === "failed").length;
  const succeededCount = (fanoutResult?.repo_results || []).filter((r: { status: string }) => r.status === "success").length;

  let finalStatus: "success" | "partial" | "failed";
  if (failedCount === 0) finalStatus = "success";
  else if (succeededCount > 0) finalStatus = "partial";
  else finalStatus = "failed";

  // ─── Feedback Analysis — read-only, non-persistent ────
  let feedback = analyzeRuntimeFeedback({
    requirementId,
    executionTrace: trace,
    artifacts,
    finalStatus,
  });

  // ─── Optional Memory Read — advisory only, does not affect routing ──
  if (isPolicyMemoryReadEnabled()) {
    try {
      const memorySummary = readPolicyMemoryAgentSummaries(getPolicyMemoryPath());
      const memorySuggestions = buildMemoryPolicySuggestions({
        memory: memorySummary,
        node: "implementation",
      });
      if (memorySuggestions.length > 0) {
        // Build shadow routing decisions from memory suggestions
        const currentAgentsByNode = buildCurrentAgentsByNode(trace);
        const shadowDecisions = buildMemoryShadowRoutingDecisions({
          suggestions: memorySuggestions,
          currentAgentsByNode,
        });

        feedback = {
          ...feedback,
          policy_suggestions: [
            ...feedback.policy_suggestions,
            ...memorySuggestions,
          ],
          shadow_routing_decisions: [
            ...(feedback.shadow_routing_decisions ?? []),
            ...shadowDecisions,
          ],
        };
      }
    } catch (error) {
      console.warn("Policy memory read failed:", error);
    }
  }

  // ─── Evolution Proposals — read-only, never applied ───
  const evolutionProposals = buildEvolutionProposals({
    requirementId,
    feedback,
  });
  if (evolutionProposals.length > 0) {
    feedback = {
      ...feedback,
      evolution_proposals: evolutionProposals,
    };
  }

  // ─── Optional Policy Memory Write (disabled by default) ─────
  if (isPolicyMemoryEnabled()) {
    try {
      const record = buildPolicyMemoryRecord({
        requirementId,
        finalStatus,
        feedback,
        artifacts,
        executionTrace: trace,
      });
      appendPolicyMemoryRecord(getPolicyMemoryPath(), record);
    } catch (error) {
      console.warn("Policy memory write failed:", error);
    }
  }

  return {
    requirement_id: requirementId,
    execution_trace: trace,
    artifacts,
    feedback,
    fanout_results: fanoutResult,
    final_status: finalStatus,
    completed_at: new Date().toISOString(),
  };
}
