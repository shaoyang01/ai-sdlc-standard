// Memory Routing Shadow Decisions
// ================================
// Computes shadow routing decisions from memory-derived policy suggestions.
// Only considers prefer_agent and avoid_agent suggestions.
// Ignores manual_review, retry_with_agent, split_task (non-routing types).
// Pure function. No DB reads. No side effects.
// All decisions have applied: false — advisory only, do not affect routing.

import { PolicySuggestion, ShadowRoutingDecision } from "./feedback-types";

const ROUTING_TYPES = new Set(["prefer_agent", "avoid_agent"]);

export function buildMemoryShadowRoutingDecisions(input: {
  suggestions: ReadonlyArray<PolicySuggestion>;
  currentAgentsByNode?: Readonly<Record<string, string>>;
}): ReadonlyArray<ShadowRoutingDecision> {
  // Filter to routing-relevant suggestions only
  const routingSuggestions = input.suggestions.filter((s) => ROUTING_TYPES.has(s.type));
  if (routingSuggestions.length === 0) return [];

  // Group by node
  const byNode = new Map<string, PolicySuggestion[]>();
  for (const s of routingSuggestions) {
    const list = byNode.get(s.node) || [];
    list.push(s);
    byNode.set(s.node, list);
  }

  const decisions: ShadowRoutingDecision[] = [];

  for (const [node, suggestions] of byNode) {
    // Find highest-confidence prefer_agent
    const preferSuggestions = suggestions
      .filter((s) => s.type === "prefer_agent")
      .sort((a, b) => b.confidence - a.confidence);
    const preferredAgent = preferSuggestions[0]?.agent;

    // Collect avoided agents
    const avoidedAgents = suggestions
      .filter((s) => s.type === "avoid_agent" && s.agent !== undefined)
      .map((s) => s.agent!);

    // Max confidence among routing suggestions
    const confidences = suggestions.map((s) => s.confidence);
    const maxConfidence = confidences.length > 0 ? Math.max(...confidences) : 0;

    const currentAgent = input.currentAgentsByNode?.[node];

    // Build reason — avoid empty
    const parts: string[] = [];
    if (preferredAgent) parts.push(`preferring ${preferredAgent}`);
    if (avoidedAgents.length > 0) parts.push(`avoiding ${avoidedAgents.join(", ")}`);
    const reason = parts.length > 0
      ? `Memory suggests ${parts.join(" and ")} for ${node}`
      : `Memory routing analysis for ${node}`;

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
