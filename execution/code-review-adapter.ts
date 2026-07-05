// Code Review Adapter
// ====================
// Shadow code review executor. Reviews artifacts and returns findings.
// Default shadow review passes unless artifacts contain force_review_fail marker.
// No external calls. No disk writes. No Git operations.

import { Artifact, createArtifact } from "../core/artifact";
import { AgentName, ExecutionResult } from "./types";
import { CodeReviewFinding } from "../core/review-types";

export async function executeCodeReview(input: {
  requirementId: string;
  artifacts: ReadonlyArray<Artifact>;
  agent: AgentName;
}): Promise<ExecutionResult> {
  // Scan artifacts for force_review_fail marker
  const findings: CodeReviewFinding[] = [];

  for (const artifact of input.artifacts) {
    if (artifact.content["force_review_fail"] === true) {
      findings.push({
        severity: "high",
        message: `Artifact ${artifact.id} has force_review_fail marker`,
        artifactId: artifact.id,
      });
    }
  }

  const status = findings.length > 0 ? "FAIL" : "PASS";
  const summary = status === "PASS"
    ? "Shadow code review passed"
    : `Shadow code review found ${findings.length} issue(s)`;

  const reviewArtifact = createArtifact({
    requirementId: input.requirementId,
    node: "code-review",
    type: "code_review",
    content: {
      status,
      findings,
      summary,
    },
    agent: input.agent,
    source: "execution_gateway",
    id: `${input.requirementId}:code-review:code_review:0`,
  });

  return {
    success: true,
    node: "code-review",
    agent: input.agent,
    output: {
      node: "code-review",
      result: status,
      findings,
      summary,
    },
    artifacts: [reviewArtifact],
  };
}
