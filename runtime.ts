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
import { SolutionChallengeState } from "./core/runtime-executors";
import {
  createDefaultExecutors,
  DEFAULT_EXECUTORS,
  executeDocFlowNode,
  type NodeExecutor,
  type RuntimeExecutorMap,
  type FanoutResult,
  type RuntimeExecutionGateway,
  type ImplementationOutcome,
} from "./core/runtime-executors";
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
import { getSkillFlowRuntimeIntegrationConfig } from "./core/skill-flow-runtime-integration-config";
import { decideSkillFlowRuntimeIntegration } from "./core/skill-flow-runtime-integration";
import type { SkillFlowRuntimeIntegrationResult } from "./core/skill-flow-runtime-integration-types";
import { buildOptionalKimiRuntimeShadowAttachment } from "./core/kimi-runtime-shadow-attachment";
import type { KimiRuntimeShadowAttachment } from "./execution/kimi-runtime-attachment-contract";
import { buildHermesRuntimeShadowAttachmentFromRequest } from "./core/hermes-runtime-shadow-attachment";
import type { HermesRuntimeShadowAttachmentBuildResult } from "./core/hermes-runtime-shadow-attachment";
import { isHermesRuntimeAttachmentEnabled } from "./execution/hermes-runtime-attachment-contract";

// ─── Types ────────────────────────────────────────────

type LoopAgent = "kimi" | "codex" | "hermes";

// RuntimeNode extends Graph Kernel NodeType with runtime-managed nodes
type RuntimeNode = NodeType | "code-review" | "bugfix";

interface ExecutionTraceEntry {
  node: RuntimeNode;
  agent: LoopAgent;
  status: "success" | "failure";
  output: Record<string, unknown>;
  timestamp: string;
}

interface RuntimeResult {
  requirement_id: string;
  execution_trace: ExecutionTraceEntry[];
  artifacts: Artifact[];
  feedback: RuntimeFeedback;
  fanout_results?: FanoutResult;
  final_status: "success" | "partial" | "failed";
  implementation_outcome: ImplementationOutcome;
  completed_at: string;
  skill_flow_shadow_integration?: SkillFlowRuntimeIntegrationResult;
  kimi_runtime_shadow_attachment?: KimiRuntimeShadowAttachment;
  hermes_runtime_shadow_attachment?: HermesRuntimeShadowAttachmentBuildResult;
}

export interface RuntimeOptions {
  hermesRuntimeShadowAttachmentBuilder?: typeof buildHermesRuntimeShadowAttachmentFromRequest;
  env?: Record<string, string | undefined>;
  executors?: Partial<RuntimeExecutorMap>;
  executionGateway?: RuntimeExecutionGateway;
  requirementSummaryMode?: "deterministic" | "kimi_gateway";
  solutionChallengeMode?: "disabled" | "shadow";
}

// ─── Agent Map (to be migrated to Graph Kernel agent registry) ──

const AGENT_MAP: Record<NodeType, LoopAgent> = {
  "requirement-summary": "kimi",
  "tech-design":          "kimi",
  "solution-challenge":   "kimi",
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
  gateway?: RuntimeExecutionGateway;
}): Promise<ReviewLoopResult> {
  const collectedArtifacts: Artifact[] = [];
  const traceEntries: ExecutionTraceEntry[] = [];
  let currentArtifacts = input.artifacts;
  let attempts = 0;
  const gateway = input.gateway ?? executionGateway;

  while (attempts <= MAX_BUGFIX_ATTEMPTS) {
    // ── Code Review (via Execution Gateway) ──
    const review = await gateway.execute({
      type: "code_review",
      node: "code-review",
      agent: input.agent,
      requirementId: input.requirementId,
      input: { artifacts: currentArtifacts },
      metadata: { attempt: attempts },
    });

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
    const bugfix = await gateway.execute({
      type: "bugfix",
      node: "bugfix",
      agent: input.agent,
      requirementId: input.requirementId,
      input: { artifacts: currentArtifacts, findings: findings || [] },
      metadata: { attempt: attempts },
    });

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

function resolveImplementationOutcome(
  implementationOutput: Record<string, unknown> | undefined
): ImplementationOutcome {
  const outcome = implementationOutput?.["implementation_outcome"];
  if (
    outcome === "real_code_patch" ||
    outcome === "shadow_code_patch" ||
    outcome === "fanout" ||
    outcome === "speckit" ||
    outcome === "failed"
  ) {
    return outcome;
  }
  return "failed";
}

// ─── MAIN RUNTIME — GRAPH INTERPRETER ───────────────────
// Graph Kernel is the SINGLE source of truth for transitions.

export async function run(
  requirement: string,
  options: RuntimeOptions = {}
): Promise<RuntimeResult> {
  const env = options.env ?? process.env;
  const requirementId = `REQ-${Date.now()}`;
  const trace: ExecutionTraceEntry[] = [];
  const legacyContext: Record<string, unknown> = { raw_text: requirement, requirement_id: requirementId, execution_mode: "direct" };
  const runtimeGateway = options.executionGateway ?? executionGateway;

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
  const executors: RuntimeExecutorMap = {
    ...createDefaultExecutors(runtimeGateway, {
      requirementSummaryMode: options.requirementSummaryMode,
    }),
    ...options.executors,
  };

  while (currentNode && vmState.status === "running") {
    // ── Skip solution-challenge when disabled ──
    if (currentNode === "solution-challenge" && options.solutionChallengeMode !== "shadow") {
      // Skip to next node as if challenge passed (READY_FOR_GATE)
      currentNode = getNextNode(currentNode, { result: "PASS" }, retryCount);
      continue;
    }
    // Agent selection: policy engine → decision layer → AGENT_MAP fallback
    const policyAgent = resolveAgentByPolicy(execCtx, currentNode);
    const agent = (policyAgent ?? selectAgent(currentNode, execCtx) ?? getAgent(currentNode)) as LoopAgent;

    // Update ExecutionContext for current node
    execCtx.node = currentNode;
    execCtx.input = { requirement, requirement_id: requirementId };
    execCtx.metadata.complexity = inferComplexity(requirement);

    const nodeOutput = await executeDocFlowNode(currentNode, legacyContext, execCtx, executors);
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

    // ── Persist challenge state for FOLLOW_UP_VERIFICATION ──
    if (currentNode === "solution-challenge") {
      execCtx.metadata.solutionChallenge = nodeOutput["solution_challenge"] as SolutionChallengeState | undefined;
    }

    // ─── Code Review + Bugfix Loop (after implementation, before validation) ───
    if (currentNode === "implementation") {
      const reviewResult = await runCodeReviewBugfixLoop({
        requirementId,
        artifacts: [...artifacts],
        agent: "codex",
        gateway: runtimeGateway,
      });
      artifacts.push(...reviewResult.artifacts);
      trace.push(...reviewResult.traceEntries);
    }

    // Context-aware transition — review result drives PASS/FAIL routing
    currentNode = getNextNode(currentNode, nodeOutput, retryCount);
  }

  // ─── Final Status ─────────────────────────────────────
  // NOTE: final_status currently reflects FANOUT COMPLETION STATUS only.
  // Validation and code-review failures are intentionally surfaced through
  // feedback.review_summary, policy_suggestions, trace status, and artifacts.
  // Do not turn this into a quality-gate status without an explicit Runtime
  // semantic decision that also addresses code-review failure handling.
  const implementationOutput = legacyContext["implementation"] as Record<string, unknown> | undefined;
  const fanoutResult = implementationOutput?.fanout_result as FanoutResult | undefined;
  const failedCount = (fanoutResult?.repo_results || []).filter((r: { status: string }) => r.status === "failed").length;
  const succeededCount = (fanoutResult?.repo_results || []).filter((r: { status: string }) => r.status === "success").length;

  let finalStatus: "success" | "partial" | "failed";
  if (failedCount === 0) finalStatus = "success";
  else if (succeededCount > 0) finalStatus = "partial";
  else finalStatus = "failed";

  const implementationOutcome = resolveImplementationOutcome(implementationOutput);

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

  // ─── Optional Skill Flow Shadow Integration (disabled by default) ──
  // Sidecar only — does not affect routing, agent selection, or final_status.
  let skillFlowShadowIntegration: SkillFlowRuntimeIntegrationResult | undefined;
  const integrationConfig = getSkillFlowRuntimeIntegrationConfig();
  if (integrationConfig.enabled) {
    try {
      skillFlowShadowIntegration = decideSkillFlowRuntimeIntegration(integrationConfig, {
        requirementId,
        flowId: "main_docflow",
        triggerNode: "runtime-completed",
        reason: "feature-flagged runtime shadow comparison",
        inputArtifacts: artifacts.map((a) => a.id),
        mode: "shadow_only",
      });
    } catch (error) {
      console.warn("Skill flow shadow integration failed:", error);
    }
  }

  // ─── Optional Kimi Runtime Shadow Attachment (disabled by default) ──
  let kimiRuntimeShadowAttachment: KimiRuntimeShadowAttachment | undefined;
  try {
    kimiRuntimeShadowAttachment = await buildOptionalKimiRuntimeShadowAttachment({
      request: {
        type: "llm_task",
        node: "requirement-summary",
        agent: "kimi",
        requirementId,
        input: { requirement },
      },
    });
  } catch (error) {
    console.warn("Kimi runtime shadow attachment failed:", error);
  }

  // ─── Optional Hermes Runtime Shadow Attachment (disabled by default) ──
  let hermesRuntimeShadowAttachment: HermesRuntimeShadowAttachmentBuildResult | undefined;
  if (isHermesRuntimeAttachmentEnabled(env)) {
    const hermesBuilder =
      options.hermesRuntimeShadowAttachmentBuilder ??
      buildHermesRuntimeShadowAttachmentFromRequest;
    try {
      hermesRuntimeShadowAttachment = await hermesBuilder({
        request: {
          type: "validation",
          node: "validation",
          agent: "hermes",
          requirementId,
          input: { requirement },
        },
        env,
      });
    } catch (error) {
      console.warn("Hermes runtime shadow attachment failed:", error);
    }
  }

  return {
    requirement_id: requirementId,
    execution_trace: trace,
    artifacts,
    feedback,
    fanout_results: fanoutResult,
    final_status: finalStatus,
    implementation_outcome: implementationOutcome,
    completed_at: new Date().toISOString(),
    ...(skillFlowShadowIntegration
      ? { skill_flow_shadow_integration: skillFlowShadowIntegration }
      : {}),
    ...(kimiRuntimeShadowAttachment
      ? { kimi_runtime_shadow_attachment: kimiRuntimeShadowAttachment }
      : {}),
    ...(hermesRuntimeShadowAttachment
      ? { hermes_runtime_shadow_attachment: hermesRuntimeShadowAttachment }
      : {}),
  };
}
