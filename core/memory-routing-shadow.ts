// Memory Routing Shadow Decisions
// ================================
// Computes shadow routing decisions from memory-derived policy suggestions.
// Pure function. No DB reads. No side effects.
// All decisions have applied: false — advisory only, do not affect routing.

import { PolicySuggestion, ShadowRoutingDecision } from "./feedback-types";

export function buildMemoryShadowRoutingDecisions(input: {
  suggestions: ReadonlyArray<PolicySuggestion>;
  currentAgentsByNode?: Readonly<Record<string, string>>;
}): ReadonlyArray<ShadowRoutingDecision> {
  if (input.suggestions.length === 0) return [];

  // Group suggestions by node
  const byNode = new Map<string, PolicySuggestion[]>();
  for (const s of input.suggestions) {
    const list = byNode.get(s.node) || [];
    list.push(s);
    byNode.set(s.node, list);
  }

  const decisions: ShadowRoutingDecision[] = [];

  for (const [node, suggestions] of byNode) {
    // Find highest-confidence prefer_agent
    const preferSuggestions = suggestions.filter((s) => s.type === "prefer_agent");
    preferSuggestions.sort((a, b) => b.confidence - a.confidence);
    const preferredAgent = preferSuggestions[0]?.agent;

    // Collect avoided agents
    const avoidedAgents = suggestions
      .filter((s) => s.type === "avoid_agent" && s.agent !== undefined)
      .map((s) => s.agent!);

    // Max confidence among used suggestions
    const confidences = [...preferSuggestions.map((s) => s.confidence), ...suggestions.filter((s) => s.type === "avoid_agent").map((s) => s.confidence)];
    const maxConfidence = confidences.length > 0 ? Math.max(...confidences) : 0;

    const currentAgent = input.currentAgentsByNode?.[node];

    const reasonParts: string[] = [];
    if (preferredAgent) {
      reasonParts.push(`preferring ${preferredAgent}`);
    }
    if (avoidedAgents.length > 0) {
      reasonParts.push(`avoiding ${avoidedAgents.join(", ")}`);
    }
    const reason = `Memory suggests ${reasonParts.join(" and ")} for ${node}`;

    decisions.push({
      node,
      currentAgent,
      preferredAgent,
      avoidedAgents,
      reason,
      confidence: maxConfidence,
      source: "memory",
      applied: false,
    });
  }

  return decisions;
}
