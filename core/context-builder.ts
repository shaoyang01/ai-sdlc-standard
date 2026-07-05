// Context Builder
// ================
// Factory function for ExecutionContext.
// PURELY STRUCTURAL. No behavior change.

import { ExecutionContext } from "./execution-context";
import { NodeType } from "../sdlc_graph/types";

export function buildExecutionContext(
  node: NodeType,
  input: Record<string, unknown>,
  metadata?: Partial<ExecutionContext["metadata"]>
): ExecutionContext {
  return {
    node,
    input,
    metadata: {
      complexity: "medium",
      ...metadata,
    },
    trace: [],
  };
}
