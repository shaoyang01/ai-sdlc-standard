// State Machine VM
// =================
// Deterministic transition engine. Drives execution via state transitions.
// Supports replay by applying trace events to initial state.
// Pure functions — no side effects, no randomness.

import { ExecutionState, updateState } from "./execution-state";
import { ExecutionTraceItem } from "./execution-trace";
import { NodeType } from "../sdlc_graph/types";

// Deterministic transition — pure function
export function transition(
  state: ExecutionState,
  nextNode: NodeType | null,
  traceItem: ExecutionTraceItem
): ExecutionState {
  return updateState(state, nextNode, traceItem);
}

// Replay engine — reproduces full execution from trace history
export function replayExecution(
  initialState: ExecutionState,
  history: ExecutionTraceItem[]
): ExecutionState {
  let state = { ...initialState, history: [], step: 0 };

  for (const event of history) {
    const nextNode = determineNextFromTrace(event);
    state = transition(state, nextNode, event);
  }

  return state;
}

// Extract next node from trace event (for replay)
function determineNextFromTrace(event: ExecutionTraceItem): NodeType | null {
  const node = event.node;
  const result = event.output?.["result"] as string | undefined;

  if (node === "validation") return null;  // terminal
  if (node === "review" && result === "FAIL") return "tech-design";  // feedback
  if (node === "review") return "implementation";

  // Default linear progression
  const linearMap: Record<string, NodeType | null> = {
    "requirement-summary": "tech-design",
    "tech-design": "review",
    "implementation": "validation",
  };

  return linearMap[node] ?? null;
}
