// Policy Memory Types — Local SQLite Store
// =========================================
// Summary-only types for persistent agent feedback.
// No full artifact content. No full trace outputs.
// No Git / PR / filesystem patch fields.

import { RuntimeFeedback } from "./feedback-types";

export type PolicyMemoryRecord = Readonly<{
  runId: string;
  requirementId: string;
  finalStatus: "success" | "partial" | "failed";
  feedback: RuntimeFeedback;
  artifactTypes: ReadonlyArray<string>;
  traceNodes: ReadonlyArray<string>;
  createdAt: string;
}>;

export type StoredAgentScore = Readonly<{
  runId: string;
  agent: string;
  score: number;
  reason: string;
  signals: ReadonlyArray<string>;
}>;

export type StoredPolicySuggestion = Readonly<{
  runId: string;
  type: string;
  node: string;
  agent?: string;
  reason: string;
  confidence: number;
}>;

export type AgentMemorySummary = Readonly<{
  agent: string;
  runCount: number;
  averageScore: number;
  lastScore?: number;
  positiveSignals: number;
  negativeSignals: number;
}>;

export type PolicyMemorySummary = Readonly<{
  available: boolean;
  runCount: number;
  agentSummaries: ReadonlyArray<AgentMemorySummary>;
}>;
