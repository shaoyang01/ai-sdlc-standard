// State Machine VM — Deterministic, Immutable
// ============================================
// Pure transition engine. Event-sourced execution model.
// Guaranteed replay consistency: same trace → same final state.
// No side effects. No randomness. No hidden mutation.
// Replay transition decisions delegate to the Graph Kernel so the graph
// remains the single source of truth for node ordering.

import { ExecutionState, updateState } from "./execution-state";
import { ExecutionTraceItem } from "./execution-trace";
import { NodeType } from "../sdlc_graph/types";
import { getNextNode } from "../sdlc_graph/transitions";

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
  let retryCount = 0;

  for (const event of history) {
    // Match Runtime retry counting semantics:
    // increment on review FAIL, persist through tech-design redesign, reset elsewhere.
    if (event.node === "review" && event.output?.["result"] === "FAIL") {
      retryCount++;
    } else if (event.node !== "tech-design") {
      retryCount = 0;
    }

    const nextNode = getNextNode(event.node, event.output, retryCount);
    state = transition(state, nextNode, event, retryCount);
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
