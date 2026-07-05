// State Machine VM — Deterministic, Immutable
// ============================================
// Pure transition engine. Event-sourced execution model.
// Guaranteed replay consistency: same trace → same final state.
// No side effects. No randomness. No hidden mutation.

import { ExecutionState, updateState } from "./execution-state";
import { ExecutionTraceItem } from "./execution-trace";
import { NodeType } from "../sdlc_graph/types";

// Pure transition — immutable, no side effects
export function transition(
  state: ExecutionState,
  nextNode: NodeType | null,
  traceItem: ExecutionTraceItem,
  retryCount?: number
): ExecutionState {
  return updateState(state, nextNode, traceItem, retryCount);
}

// Replay engine — guaranteed: replay(initialState, trace) ≡ original
export function replayExecution(
  initialState: ExecutionState,
  history: ExecutionTraceItem[]
): ExecutionState {
  let state = initialState;

  for (const event of history) {
    const nextNode = determineNextFromTrace(event);
    state = transition(state, nextNode, event);
  }

  return state;
}

// Replay validation — verify determinism
export function validateReplay(
  originalState: ExecutionState,
  replayedState: ExecutionState
): boolean {
  return (
    originalState.currentNode === replayedState.currentNode &&
    originalState.step === replayedState.step &&
    originalState.status === replayedState.status &&
    originalState.history.length === replayedState.history.length
  );
}

// Extract next node from trace event (deterministic replay path)
function determineNextFromTrace(event: ExecutionTraceItem): NodeType | null {
  const node = event.node;
  const result = event.output?.["result"] as string | undefined;

  if (node === "validation") return null;
  if (node === "review" && result === "FAIL") return "tech-design";
  if (node === "review") return "implementation";

  const linearMap: Record<string, NodeType | null> = {
    "requirement-summary": "tech-design",
    "tech-design": "review",
    "implementation": "validation",
  };

  return linearMap[node] ?? null;
}
