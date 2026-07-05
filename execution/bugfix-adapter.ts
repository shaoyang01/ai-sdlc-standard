// Bugfix Adapter
// ===============
// Shadow bugfix executor. Generates a shadow bugfix_patch artifact.
// No real patches applied. No disk writes. No Git operations.
// Deterministic: same input → same output.

import { Artifact, createArtifact } from "../core/artifact";
import { AgentName, ExecutionResult } from "./types";
import { CodeReviewFinding } from "../core/review-types";

export async function executeBugfix(input: {
  requirementId: string;
  artifacts: ReadonlyArray<Artifact>;
  findings: ReadonlyArray<CodeReviewFinding>;
  agent: AgentName;
  attempt: number;
}): Promise<ExecutionResult> {
  const bugfixArtifact = createArtifact({
    requirementId: input.requirementId,
    node: "bugfix",
    type: "bugfix_patch",
    content: {
      attempt: input.attempt,
      findings: input.findings,
      patch: "shadow bugfix patch",
    },
    agent: input.agent,
    source: "execution_gateway",
    id: `${input.requirementId}:bugfix:bugfix_patch:${input.attempt}`,
  });

  return {
    success: true,
    node: "bugfix",
    agent: input.agent,
    output: {
      node: "bugfix",
      result: "bugfix_patch_generated",
      attempt: input.attempt,
      findings: input.findings,
    },
    artifacts: [bugfixArtifact],
  };
}
