// Shadow Agent Adapter
// =====================
// Deterministic shadow execution. No external calls.
// Preserves current mock behavior with ExecutionResult contract.

import { ExecutionRequest, ExecutionResult, ExecutionArtifact } from "./types";

export async function executeShadowAgent(
  request: ExecutionRequest
): Promise<ExecutionResult> {
  const artifact: ExecutionArtifact = {
    type: "shadow_output",
    node: request.node,
    content: {
      result: `${request.node}_by_${request.agent}`,
      input: request.input,
    },
    createdAt: new Date().toISOString(),
  };

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
