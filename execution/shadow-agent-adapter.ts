// Shadow Agent Adapter
// =====================
// Deterministic shadow execution. No external calls.
// Uses standardized Artifact model from core/artifact.ts.

import { ExecutionRequest, ExecutionResult, ExecutionArtifact } from "./types";
import { createArtifact } from "../core/artifact";

export async function executeShadowAgent(
  request: ExecutionRequest
): Promise<ExecutionResult> {
  const artifact: ExecutionArtifact = createArtifact({
    requirementId: request.requirementId,
    node: request.node,
    type: "shadow_output",
    content: {
      result: `${request.node}_by_${request.agent}`,
      input: request.input,
      skill: request.skill ?? null,
      skill_validation: request.skillValidation ?? null,
    },
    agent: request.agent,
    source: "execution_gateway",
    id: `${request.requirementId}:${request.node}:shadow_output`,
  });

  return {
    success: true,
    node: request.node,
    agent: request.agent,
    output: {
      node: request.node,
      agent: request.agent,
      result: `${request.node}_by_${request.agent}`,
      timestamp: new Date().toISOString(),
      ...request.input,
    },
    artifacts: [artifact],
  };
}
