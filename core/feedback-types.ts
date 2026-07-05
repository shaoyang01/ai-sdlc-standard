// Feedback Types — Read-only Runtime Signals
// ===========================================
// Pure type definitions for agent performance feedback.
// No filesystem fields. No Git/PR fields. No persistent storage.

export type AgentScore = Readonly<{
  agent: string;
  score: number;
  reason: string;
  signals: ReadonlyArray<string>;
}>;

export type NodeOutcome = Readonly<{
  node: string;
  agent: string;
  status: "success" | "failure";
  signal: "positive" | "negative" | "neutral";
  reason: string;
}>;

export type ReviewSummary = Readonly<{
  codeReviewStatus?: "PASS" | "FAIL";
  bugfixAttempts: number;
  validationPassed: boolean;
}>;

export type PolicySuggestion = Readonly<{
  type:
    | "prefer_agent"
    | "avoid_agent"
    | "retry_with_agent"
    | "split_task"
    | "manual_review";
  node: string;
  agent?: string;
  reason: string;
  confidence: number;
}>;

export type ShadowRoutingDecision = Readonly<{
  node: string;
  currentAgent?: string;
  preferredAgent?: string;
  avoidedAgents: ReadonlyArray<string>;
  reason: string;
  confidence: number;
  source: "memory";
  applied: false;
}>;

export type RuntimeFeedback = Readonly<{
  agent_scores: ReadonlyArray<AgentScore>;
  node_outcomes: ReadonlyArray<NodeOutcome>;
  review_summary: ReviewSummary;
  policy_suggestions: ReadonlyArray<PolicySuggestion>;
  shadow_routing_decisions?: ReadonlyArray<ShadowRoutingDecision>;
  evolution_proposals?: ReadonlyArray<EvolutionProposal>;
}>;

export type EvolutionProposalType =
  | "policy_adjustment"
  | "routing_experiment"
  | "agent_skill_gap"
  | "test_coverage"
  | "manual_review_required";

export type EvolutionProposal = Readonly<{
  id: string;
  type: EvolutionProposalType;
  title: string;
  rationale: string;
  suggestedAction: string;
  relatedNode?: string;
  relatedAgent?: string;
  confidence: number;
  source:
    | "runtime_feedback"
    | "policy_memory"
    | "shadow_routing"
    | "code_review"
    | "validation";
  applied: false;
}>;
