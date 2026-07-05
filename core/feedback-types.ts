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

export type RuntimeFeedback = Readonly<{
  agent_scores: ReadonlyArray<AgentScore>;
  node_outcomes: ReadonlyArray<NodeOutcome>;
  review_summary: ReviewSummary;
  policy_suggestions: ReadonlyArray<PolicySuggestion>;
}>;
