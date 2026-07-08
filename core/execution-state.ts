// Execution State Model — Immutable
// ==================================
// Fully immutable state model. Every transition returns a new object.
// Powers deterministic replay with guaranteed consistency.
// No in-place mutation allowed anywhere in the VM layer.

import { ExecutionContext } from "./execution-context";
import { ExecutionTraceItem } from "./execution-trace";
import { NodeType } from "../sdlc_graph/types";

export type ExecutionStatus = "running" | "completed" | "failed";

// Readonly — no in-place mutation allowed
export type ExecutionState = Readonly<{
  currentNode: NodeType | null;
  ctx: ExecutionContext;
  history: ReadonlyArray<ExecutionTraceItem>;
  step: number;
  status: ExecutionStatus;
  retryCount: number;
}>;

// Pure factory — creates initial immutable state
export function createInitialState(ctx: ExecutionContext): ExecutionState {
  return Object.freeze({
    currentNode: "requirement-summary",
    ctx,
    history: Object.freeze([]),
    step: 0,
    status: "running" as ExecutionStatus,
    retryCount: 0,
  });
}

// Pure transition — returns NEW state, never mutates input
export function updateState(
  state: ExecutionState,
  nextNode: NodeType | null,
  traceItem: ExecutionTraceItem,
  newRetryCount?: number
): ExecutionState {
  const retry = newRetryCount !== undefined ? newRetryCount : state.retryCount;
  const isDone = !nextNode;

  return {
    currentNode: nextNode,
    ctx: state.ctx,
    history: [...state.history, traceItem],
    step: state.step + 1,
    status: isDone ? "completed" : "running",
    retryCount: retry,
  };
}
