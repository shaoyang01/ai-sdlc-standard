// Feedback Analyzer
// ==================
// Pure read-only analyzer. Computes agent scores, node outcomes,
// review summaries, and policy suggestions from runtime trace and artifacts.
// No side effects. No mutations. No agent calls. No Execution Gateway.

import { Artifact } from "./artifact";
import {
  RuntimeFeedback,
  AgentScore,
  NodeOutcome,
  ReviewSummary,
  PolicySuggestion,
} from "./feedback-types";

interface TraceEntry {
  node: string;
  agent: string;
  status: "success" | "failure";
  output: Record<string, unknown>;
}

export function analyzeRuntimeFeedback(input: {
  requirementId: string;
  executionTrace: ReadonlyArray<TraceEntry>;
  artifacts: ReadonlyArray<Artifact>;
  finalStatus: "success" | "partial" | "failed";
}): RuntimeFeedback {
  const nodeOutcomes = computeNodeOutcomes(input.executionTrace);
  const reviewSummary = computeReviewSummary(input.artifacts, input.executionTrace);
  const agentScores = computeAgentScores(nodeOutcomes, reviewSummary, input.finalStatus);
  const policySuggestions = computePolicySuggestions(
    reviewSummary,
    input.finalStatus,
    nodeOutcomes
  );

  return {
    agent_scores: agentScores,
    node_outcomes: nodeOutcomes,
    review_summary: reviewSummary,
    policy_suggestions: policySuggestions,
  };
}

// ─── Node Outcomes ────────────────────────────────────

function computeNodeOutcomes(
  trace: ReadonlyArray<TraceEntry>
): NodeOutcome[] {
  return trace.map((entry) => {
    let signal: "positive" | "negative" | "neutral";

    if (entry.node === "code-review") {
      signal = entry.output["result"] === "PASS" ? "positive" : "negative";
    } else if (entry.status === "success") {
      signal = "positive";
    } else if (entry.status === "failure") {
      signal = "negative";
    } else {
      signal = "neutral";
    }

    return {
      node: entry.node,
      agent: entry.agent,
      status: entry.status,
      signal,
      reason:
        signal === "positive"
          ? "Node completed successfully"
          : signal === "negative"
          ? "Node execution failed"
          : "Node completed with neutral result",
    };
  });
}

// ─── Review Summary ───────────────────────────────────

function computeReviewSummary(
  artifacts: ReadonlyArray<Artifact>,
  trace: ReadonlyArray<TraceEntry>
): ReviewSummary {
  // Find the last code_review artifact
  const codeReviewArtifacts = artifacts.filter((a) => a.type === "code_review");
  const lastReview = codeReviewArtifacts[codeReviewArtifacts.length - 1];
  const codeReviewStatus = lastReview?.content["status"] as "PASS" | "FAIL" | undefined;

  // Count bugfix_patch artifacts
  const bugfixAttempts = artifacts.filter((a) => a.type === "bugfix_patch").length;

  // Check validation
  const validationTrace = trace.find((t) => t.node === "validation");
  const validationPassed = validationTrace?.status === "success";

  return {
    codeReviewStatus,
    bugfixAttempts,
    validationPassed,
  };
}

// ─── Agent Scores ─────────────────────────────────────

function computeAgentScores(
  outcomes: ReadonlyArray<NodeOutcome>,
  reviewSummary: ReviewSummary,
  finalStatus: string
): AgentScore[] {
  const agentMap = new Map<string, { score: number; signals: string[] }>();

  for (const outcome of outcomes) {
    let entry = agentMap.get(outcome.agent);
    if (!entry) {
      entry = { score: 0.5, signals: [] };
    }

    if (outcome.signal === "positive") {
      entry.score += 0.2;
      entry.signals.push(`${outcome.node}:success`);
    } else if (outcome.signal === "negative") {
      entry.score -= 0.2;
      entry.signals.push(`${outcome.node}:failure`);
    }

    agentMap.set(outcome.agent, entry);
  }

  // Apply review signals
  for (const [agent, entry] of agentMap) {
    if (reviewSummary.codeReviewStatus === "PASS") {
      entry.score += 0.1;
      entry.signals.push("code-review:PASS");
    } else if (reviewSummary.codeReviewStatus === "FAIL") {
      entry.score -= 0.1;
      entry.signals.push("code-review:FAIL");
    }

    if (reviewSummary.bugfixAttempts > 0) {
      entry.score += 0.1;
      entry.signals.push("bugfix:completed");
    }

    if (!reviewSummary.validationPassed) {
      entry.score -= 0.1;
      entry.signals.push("validation:failed");
    }

    // Clamp to [0, 1]
    entry.score = Math.max(0, Math.min(1, Math.round(entry.score * 100) / 100));
  }

  const scores: AgentScore[] = [];
  for (const [agent, entry] of agentMap) {
    scores.push({
      agent,
      score: entry.score,
      reason: buildAgentReason(agent, entry.signals),
      signals: entry.signals,
    });
  }

  return scores;
}

function buildAgentReason(agent: string, signals: string[]): string {
  const positiveCount = signals.filter((s) => s.includes(":success") || s.includes(":PASS")).length;
  const negativeCount = signals.filter((s) => s.includes(":failure") || s.includes(":FAIL")).length;

  if (negativeCount === 0 && positiveCount > 0) {
    return `${agent} completed all assigned nodes successfully`;
  }
  if (negativeCount > 0 && positiveCount > 0) {
    return `${agent} had mixed results (${positiveCount} success, ${negativeCount} failure)`;
  }
  if (negativeCount > 0) {
    return `${agent} encountered issues during execution`;
  }
  return `${agent} baseline score`;
}

// ─── Policy Suggestions ───────────────────────────────

function computePolicySuggestions(
  reviewSummary: ReviewSummary,
  finalStatus: string,
  outcomes: ReadonlyArray<NodeOutcome>
): PolicySuggestion[] {
  const suggestions: PolicySuggestion[] = [];

  // Case A: code-review PASS, no bugfix
  if (reviewSummary.codeReviewStatus === "PASS" && reviewSummary.bugfixAttempts === 0) {
    suggestions.push({
      type: "prefer_agent",
      node: "implementation",
      agent: "codex",
      reason: "Implementation passed code review without bugfix",
      confidence: 0.7,
    });
  }

  // Case B: bugfix attempts > 0
  if (reviewSummary.bugfixAttempts > 0) {
    suggestions.push({
      type: "manual_review",
      node: "implementation",
      reason: "Implementation required bugfix attempts before validation",
      confidence: 0.6,
    });
  }

  // Case C: finalStatus === "failed"
  if (finalStatus === "failed") {
    suggestions.push({
      type: "retry_with_agent",
      node: "implementation",
      agent: "kimi",
      reason: "Current execution failed; try alternative agent",
      confidence: 0.5,
    });
  }

  // Case D: validation failed
  if (!reviewSummary.validationPassed && finalStatus !== "failed") {
    suggestions.push({
      type: "split_task",
      node: "implementation",
      reason: "Validation failed; consider splitting implementation into smaller tasks",
      confidence: 0.4,
    });
  }

  return suggestions;
}
