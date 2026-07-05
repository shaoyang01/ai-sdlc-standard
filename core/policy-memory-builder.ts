// Policy Memory Record Builder
// ==============================
// Pure factory. Builds a summary-only PolicyMemoryRecord from runtime output.
// No full artifacts. No full trace outputs.

import { Artifact } from "./artifact";
import { RuntimeFeedback } from "./feedback-types";
import { PolicyMemoryRecord } from "./policy-memory-types";

export function buildPolicyMemoryRecord(input: {
  requirementId: string;
  finalStatus: "success" | "partial" | "failed";
  feedback: RuntimeFeedback;
  artifacts: ReadonlyArray<Artifact>;
  executionTrace: ReadonlyArray<{ node: string }>;
  createdAt?: string;
}): PolicyMemoryRecord {
  const createdAt = input.createdAt || new Date().toISOString();
  const runId = `${input.requirementId}:${createdAt}`;

  return {
    runId,
    requirementId: input.requirementId,
    finalStatus: input.finalStatus,
    feedback: input.feedback,
    artifactTypes: input.artifacts.map((a) => a.type),
    traceNodes: input.executionTrace.map((t) => t.node),
    createdAt,
  };
}
