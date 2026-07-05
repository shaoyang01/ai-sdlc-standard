// Execution State Model
// ======================
// State machine VM state type. Immutable snapshot per step.
// Powers deterministic replay and trace reconstruction.

import { ExecutionContext } from "./execution-context";
import { ExecutionTraceItem } from "./execution-trace";
import { NodeType } from "../sdlc_graph/types";

export type ExecutionStatus = "running" | "completed" | "failed";

export type ExecutionState = {
  currentNode: NodeType | null;
  ctx: ExecutionContext;
  history: ExecutionTraceItem[];
  step: number;
  status: ExecutionStatus;
  retryCount: number;
};

export function createInitialState(ctx: ExecutionContext): ExecutionState {
  return {
    currentNode: "requirement-summary",
    ctx,
    history: [],
    step: 0,
    status: "running",
    retryCount: 0,
  };
}

// Immutable state update — returns new state, never mutates
export function updateState(
  state: ExecutionState,
  nextNode: NodeType | null,
  traceItem: ExecutionTraceItem
): ExecutionState {
  const isDone = !nextNode || state.retryCount >= 3;
  return {
    currentNode: nextNode,
    ctx: state.ctx,
    history: [...state.history, traceItem],
    step: state.step + 1,
    status: isDone ? "completed" : "running",
    retryCount: state.retryCount,
  };
}
