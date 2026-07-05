// Execution Trace Standard
// =========================
// Immutable trace record for each node execution.
// PURELY STRUCTURAL. No behavior change.

import { NodeType } from "../sdlc_graph/types";

export type ExecutionTraceItem = {
  node: NodeType;
  agent?: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  timestamp: number;
};

export function createTraceItem(
  node: NodeType,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  agent?: string
): ExecutionTraceItem {
  return {
    node,
    agent,
    input: { ...input },
    output: { ...output },
    timestamp: Date.now(),
  };
}
