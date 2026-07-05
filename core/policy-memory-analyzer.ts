// Policy Memory Analyzer
// ========================
// Reads PolicyMemorySummary and generates advisory policy suggestions.
// Pure function. No DB reads. No side effects.
// Suggestions are advisory only — do not affect agent selection or routing.

import { PolicySuggestion } from "./feedback-types";
import { PolicyMemorySummary } from "./policy-memory-types";

export function buildMemoryPolicySuggestions(input: {
  memory: PolicyMemorySummary;
  node: string;
}): ReadonlyArray<PolicySuggestion> {
  if (!input.memory.available) return [];
  if (input.memory.agentSummaries.length === 0) return [];

  const suggestions: PolicySuggestion[] = [];

  for (const summary of input.memory.agentSummaries) {
    // Case A: High-performing agent
    if (
      summary.runCount >= 3 &&
      summary.averageScore >= 0.75 &&
      summary.positiveSignals > summary.negativeSignals
    ) {
      suggestions.push({
        type: "prefer_agent",
        node: input.node,
        agent: summary.agent,
        reason: "Historical memory shows strong performance for this agent",
        confidence: 0.65,
      });
    }

    // Case B: Low-performing agent
    if (
      summary.runCount >= 3 &&
      summary.averageScore <= 0.4 &&
      summary.negativeSignals >= summary.positiveSignals
    ) {
      suggestions.push({
        type: "avoid_agent",
        node: input.node,
        agent: summary.agent,
        reason: "Historical memory shows weak performance for this agent",
        confidence: 0.6,
      });
    }
  }

  return suggestions;
}
