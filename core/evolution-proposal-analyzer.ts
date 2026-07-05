// Evolution Proposal Analyzer
// ============================
// Generates read-only self-evolution proposals from runtime feedback.
// Pure function. No DB reads. No file writes. No agent calls.
// All proposals have applied: false — never applied automatically.

import {
  RuntimeFeedback,
  EvolutionProposal,
} from "./feedback-types";

export function buildEvolutionProposals(input: {
  requirementId: string;
  feedback: RuntimeFeedback;
}): ReadonlyArray<EvolutionProposal> {
  const proposals: EvolutionProposal[] = [];
  let index = 0;

  function addProposal(proposal: Omit<EvolutionProposal, "id" | "applied">): void {
    proposals.push({
      ...proposal,
      id: `${input.requirementId}:evolution:${index}`,
      applied: false,
    });
    index++;
  }

  // Rule A: Shadow routing prefers a different agent
  const shadowDecisions = input.feedback.shadow_routing_decisions ?? [];
  for (const decision of shadowDecisions) {
    if (
      decision.preferredAgent &&
      decision.currentAgent &&
      decision.preferredAgent !== decision.currentAgent &&
      decision.confidence >= 0.6
    ) {
      addProposal({
        type: "routing_experiment",
        title: `Evaluate memory-preferred agent for ${decision.node}`,
        rationale: "Shadow routing suggests a different agent than the current runtime selection.",
        suggestedAction: "Run a controlled shadow comparison before enabling memory-based routing.",
        relatedNode: decision.node,
        relatedAgent: decision.preferredAgent,
        confidence: decision.confidence,
        source: "shadow_routing",
      });
    }

    // Rule B: Agent repeatedly avoided by memory
    if (decision.avoidedAgents.length > 0 && decision.confidence >= 0.6) {
      for (const avoidedAgent of decision.avoidedAgents) {
        addProposal({
          type: "policy_adjustment",
          title: `Review agent policy for ${avoidedAgent} on ${decision.node}`,
          rationale: "Policy memory indicates this agent may be weak for the node.",
          suggestedAction: "Review historical runs before changing policy.",
          relatedNode: decision.node,
          relatedAgent: avoidedAgent,
          confidence: Math.min(decision.confidence, 0.7),
          source: "policy_memory",
        });
      }
    }
  }

  // Rule C: Bugfix attempts occurred
  if (input.feedback.review_summary.bugfixAttempts > 0) {
    addProposal({
      type: "agent_skill_gap",
      title: "Investigate implementation or bugfix skill gap",
      rationale: "The implementation required bugfix attempts during review.",
      suggestedAction: "Review code-generation prompt, code-review criteria, and bugfix adapter behavior.",
      relatedNode: "implementation",
      relatedAgent: "codex",
      confidence: 0.6,
      source: "code_review",
    });
  }

  // Rule D: Validation failed
  if (input.feedback.review_summary.validationPassed === false) {
    addProposal({
      type: "test_coverage",
      title: "Improve validation coverage or implementation quality",
      rationale: "Validation did not pass for this run.",
      suggestedAction: "Review validation criteria and add targeted regression tests.",
      relatedNode: "validation",
      confidence: 0.6,
      source: "validation",
    });
  }

  // Rule E: Manual review suggestion exists
  const manualReview = input.feedback.policy_suggestions.find((s) => s.type === "manual_review");
  if (manualReview) {
    addProposal({
      type: "manual_review_required",
      title: "Manual review recommended",
      rationale: "Runtime feedback generated a manual review suggestion.",
      suggestedAction: "Inspect runtime trace, artifacts, review findings, and memory signals before changing policy.",
      confidence: manualReview.confidence,
      source: "runtime_feedback",
    });
  }

  return proposals;
}
