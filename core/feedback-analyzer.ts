// Feedback Analyzer
// ==================
// Pure read-only analyzer. Computes agent scores, node outcomes,
// review summaries, and policy suggestions from runtime trace and artifacts.
// No side effects. No mutations. No agent calls. No Execution Gateway.
// Agent scores are attributed ONLY to the agent that executed each node.

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
  const agentScores = computeAgentScores(input.executionTrace, reviewSummary);
  const policySuggestions = computePolicySuggestions(
    reviewSummary,
    input.finalStatus
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

  // Check validation: trace OR artifact evidence
  const validationTrace = trace.find((t) => t.node === "validation");
  const validationArtifacts = artifacts.filter((a) => a.type === "validation_report");
  const lastValidationArtifact = validationArtifacts[validationArtifacts.length - 1];
  const validationPassed =
    validationTrace?.status === "success" ||
    lastValidationArtifact?.content["all_checks_passed"] === true;

  return {
    codeReviewStatus,
    bugfixAttempts,
    validationPassed,
  };
}

// ─── Agent Scores ─────────────────────────────────────
// Scores are attributed ONLY to the agent that executed each node.
// No cross-agent leakage of review/bugfix/validation signals.

function computeAgentScores(
  trace: ReadonlyArray<TraceEntry>,
  reviewSummary: ReviewSummary
): AgentScore[] {
  const agentMap = new Map<string, { score: number; signals: string[] }>();

  for (const entry of trace) {
    let record = agentMap.get(entry.agent);
    if (!record) {
      record = { score: 0.5, signals: [] };
    }

    // Base node outcome: +0.2 for success, -0.2 for failure
    if (entry.status === "success") {
      record.score += 0.2;
      record.signals.push(`${entry.node}:success`);
    } else if (entry.status === "failure") {
      record.score -= 0.2;
      record.signals.push(`${entry.node}:failure`);
    }

    // Node-specific signals — attributed only to the executing agent
    if (entry.node === "code-review") {
      if (entry.output["result"] === "PASS") {
        record.score += 0.1;
        record.signals.push("code-review:PASS");
      } else if (entry.output["result"] === "FAIL") {
        record.score -= 0.1;
        record.signals.push("code-review:FAIL");
      }
    }

    if (entry.node === "bugfix" && entry.status === "success") {
      record.score += 0.1;
      record.signals.push("bugfix:completed");
    }

    if (entry.node === "validation" && entry.status === "failure") {
      record.score -= 0.1;
      record.signals.push("validation:failed");
    }

    agentMap.set(entry.agent, record);
  }

  // Build final score list, clamped to [0, 1]
  const scores: AgentScore[] = [];
  for (const [agent, record] of agentMap) {
    record.score = Math.max(0, Math.min(1, Math.round(record.score * 100) / 100));
    scores.push({
      agent,
      score: record.score,
      reason: buildAgentReason(agent, record.signals),
      signals: record.signals,
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
  finalStatus: string
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
