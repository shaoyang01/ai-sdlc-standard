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
import { SDLC_NODES } from "../sdlc_graph/graph";
import {
  GraphReplayEvent,
  GraphReplayTrace,
} from "./graph-replay-trace";
import { createShadowReadyChallengeState } from "./solution-challenge-state";

// Pure transition — immutable, no side effects
export function transition(
  state: ExecutionState,
  nextNode: NodeType | null,
  traceItem: ExecutionTraceItem,
  retryCount?: number
): ExecutionState {
  return updateState(state, nextNode, traceItem, retryCount);
}

/** @deprecated Legacy trusted reducer for ExecutionTraceItem history. Not a verifier. */
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

// ═════════════════════════════════════════════════════════════════════════════
// Canonical Graph Replay API
// ═════════════════════════════════════════════════════════════════════════════

export type GraphReplayValidationCode =
  | "INVALID_INITIAL_STATE"
  | "INVALID_EXECUTION_ID"
  | "INVALID_RUN_CONFIG"
  | "INVALID_EVENT"
  | "DUPLICATE_EVENT_ID"
  | "DUPLICATE_SEQUENCE"
  | "INVALID_SEQUENCE"
  | "INVALID_EVENT_ID"
  | "INVALID_EVENT_KIND"
  | "NON_GRAPH_NODE"
  | "TERMINAL_EVENT"
  | "UNEXPECTED_NODE"
  | "INVALID_SKIP"
  | "INVALID_EVENT_OUTPUT"
  | "INCOMPLETE_TRACE";

export class GraphReplayValidationError extends Error {
  public readonly code: GraphReplayValidationCode;
  public readonly sequence?: number;
  public readonly eventId?: string;
  public readonly node?: string;
  public readonly cause?: unknown;

  constructor(
    code: GraphReplayValidationCode,
    message: string,
    context?: {
      sequence?: number;
      eventId?: string;
      node?: string;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = "GraphReplayValidationError";
    this.code = code;
    this.sequence = context?.sequence;
    this.eventId = context?.eventId;
    this.node = context?.node;
    this.cause = context?.cause;
  }
}

const VALID_REQUIREMENT_SUMMARY_MODES = new Set<
  "deterministic" | "kimi_gateway"
>(["deterministic", "kimi_gateway"]);

const VALID_SOLUTION_CHALLENGE_MODES = new Set<
  "disabled" | "shadow" | "gateway_shadow"
>(["disabled", "shadow", "gateway_shadow"]);

const GRAPH_NODE_IDS = new Set<string>(SDLC_NODES.map((n) => n.id));

function computeRetryCount(event: ExecutionTraceItem, retryCount: number): number {
  if (event.node === "review" && event.output?.["result"] === "FAIL") {
    return retryCount + 1;
  }
  if (event.node !== "tech-design") {
    return 0;
  }
  return retryCount;
}

function computeNextNode(
  event: ExecutionTraceItem,
  retryCount: number
): { nextNode: NodeType | null; newRetryCount: number } {
  const kind = (event as GraphReplayEvent).kind;

  if (kind === "node_skipped") {
    const syntheticOutput = {
      result: "PASS",
      solution_challenge: createShadowReadyChallengeState(),
    };
    return {
      nextNode: getNextNode("solution-challenge", syntheticOutput, retryCount),
      newRetryCount: retryCount,
    };
  }

  const newRetryCount = computeRetryCount(event, retryCount);
  return {
    nextNode: getNextNode(event.node, event.output, newRetryCount),
    newRetryCount,
  };
}

function applyReplayEvent(
  state: ExecutionState,
  event: ExecutionTraceItem,
  retryCount: number
): { state: ExecutionState; retryCount: number } {
  const { nextNode, newRetryCount } = computeNextNode(event, retryCount);
  return {
    state: transition(state, nextNode, event, newRetryCount),
    retryCount: newRetryCount,
  };
}

/** Trusted reducer: replays a canonical trace without verification.
 *  Allows partial traces and preserves the original event objects in history. */
export function replayTrustedHistory(
  initialState: ExecutionState,
  trace: GraphReplayTrace
): ExecutionState {
  let state = initialState;
  let retryCount = initialState.retryCount;

  for (const event of trace.events) {
    const result = applyReplayEvent(state, event, retryCount);
    state = result.state;
    retryCount = result.retryCount;
  }

  return state;
}

function assertNonNullObject(
  value: unknown,
  code: GraphReplayValidationCode,
  message: string,
  context?: { sequence?: number; eventId?: string; node?: string }
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GraphReplayValidationError(code, message, context);
  }
}

function assertFiniteNumber(
  value: unknown,
  code: GraphReplayValidationCode,
  message: string,
  context?: { sequence?: number; eventId?: string; node?: string }
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new GraphReplayValidationError(code, message, context);
  }
}

function assertPositiveInteger(
  value: unknown,
  code: GraphReplayValidationCode,
  message: string,
  context?: { sequence?: number; eventId?: string; node?: string }
): asserts value is number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new GraphReplayValidationError(code, message, context);
  }
}

/** Verifier + reducer: validates a full canonical trace, then replays it. */
export function validateAndReplayHistory(
  initialState: ExecutionState,
  trace: GraphReplayTrace
): ExecutionState {
  // Fresh initial state
  if (
    initialState.currentNode !== "requirement-summary" ||
    initialState.status !== "running" ||
    initialState.step !== 0 ||
    initialState.history.length !== 0 ||
    initialState.retryCount !== 0
  ) {
    throw new GraphReplayValidationError(
      "INVALID_INITIAL_STATE",
      "Initial state must be fresh: currentNode=requirement-summary, status=running, step=0, history empty, retryCount=0"
    );
  }

  // executionId
  if (typeof trace.executionId !== "string") {
    throw new GraphReplayValidationError(
      "INVALID_EXECUTION_ID",
      "executionId must be a string"
    );
  }
  if (trace.executionId.trim().length === 0) {
    throw new GraphReplayValidationError(
      "INVALID_EXECUTION_ID",
      "executionId must not be empty or whitespace"
    );
  }
  if (trace.executionId.trim() !== trace.executionId) {
    throw new GraphReplayValidationError(
      "INVALID_EXECUTION_ID",
      "executionId must not have leading or trailing whitespace"
    );
  }

  // runConfig
  assertNonNullObject(trace.runConfig, "INVALID_RUN_CONFIG", "runConfig must be a non-null object");
  if (!VALID_REQUIREMENT_SUMMARY_MODES.has(trace.runConfig.requirementSummaryMode as any)) {
    throw new GraphReplayValidationError(
      "INVALID_RUN_CONFIG",
      `Invalid requirementSummaryMode: ${String(trace.runConfig.requirementSummaryMode)}`
    );
  }
  if (!VALID_SOLUTION_CHALLENGE_MODES.has(trace.runConfig.solutionChallengeMode as any)) {
    throw new GraphReplayValidationError(
      "INVALID_RUN_CONFIG",
      `Invalid solutionChallengeMode: ${String(trace.runConfig.solutionChallengeMode)}`
    );
  }

  // events
  if (!Array.isArray(trace.events)) {
    throw new GraphReplayValidationError(
      "INVALID_EVENT",
      "events must be an array"
    );
  }

  const seenEventIds = new Set<string>();
  const seenSequences = new Set<number>();
  let expectedSequence = 1;

  let validationState: {
    currentNode: NodeType | null;
    status: "running" | "completed";
    retryCount: number;
  } = {
    currentNode: "requirement-summary",
    status: "running",
    retryCount: 0,
  };

  for (const rawEvent of trace.events) {
    assertNonNullObject(rawEvent, "INVALID_EVENT", "Event must be a non-null object");
    const event = rawEvent as GraphReplayEvent;

    const eventContext = {
      sequence: event.sequence,
      eventId: event.eventId,
      node: event.node,
    };

    // kind
    if (event.kind !== "node_executed" && event.kind !== "node_skipped") {
      throw new GraphReplayValidationError(
        "INVALID_EVENT_KIND",
        `Invalid event kind: ${String(event.kind)}`,
        eventContext
      );
    }

    // node
    if (typeof event.node !== "string" || !GRAPH_NODE_IDS.has(event.node)) {
      throw new GraphReplayValidationError(
        "NON_GRAPH_NODE",
        `Invalid node: ${String(event.node)}`,
        eventContext
      );
    }

    // input/output
    assertNonNullObject(
      event.input,
      "INVALID_EVENT",
      "input must be a non-null, non-array object",
      eventContext
    );
    assertNonNullObject(
      event.output,
      "INVALID_EVENT",
      "output must be a non-null, non-array object",
      eventContext
    );

    // timestamp
    assertFiniteNumber(
      event.timestamp,
      "INVALID_EVENT",
      "timestamp must be a finite number",
      eventContext
    );

    // sequence
    assertPositiveInteger(
      event.sequence,
      "INVALID_SEQUENCE",
      `sequence must be a positive integer: ${String(event.sequence)}`,
      eventContext
    );

    // eventId
    if (typeof event.eventId !== "string" || event.eventId.length === 0) {
      throw new GraphReplayValidationError(
        "INVALID_EVENT_ID",
        `eventId must be a non-empty string: ${String(event.eventId)}`,
        eventContext
      );
    }

    // identity & order
    if (seenEventIds.has(event.eventId)) {
      throw new GraphReplayValidationError(
        "DUPLICATE_EVENT_ID",
        `Duplicate eventId: ${event.eventId}`,
        eventContext
      );
    }
    if (seenSequences.has(event.sequence)) {
      throw new GraphReplayValidationError(
        "DUPLICATE_SEQUENCE",
        `Duplicate sequence: ${event.sequence}`,
        eventContext
      );
    }
    if (event.sequence !== expectedSequence) {
      throw new GraphReplayValidationError(
        "INVALID_SEQUENCE",
        `Expected sequence ${expectedSequence}, got ${event.sequence}`,
        eventContext
      );
    }
    if (event.eventId !== `${trace.executionId}:${event.sequence}`) {
      throw new GraphReplayValidationError(
        "INVALID_EVENT_ID",
        `eventId mismatch: expected ${trace.executionId}:${event.sequence}, got ${event.eventId}`,
        eventContext
      );
    }

    // terminal check before consuming
    if (validationState.currentNode === null || validationState.status === "completed") {
      throw new GraphReplayValidationError(
        "TERMINAL_EVENT",
        `Event received after terminal state: ${event.node}`,
        eventContext
      );
    }

    // expected node
    if (event.node !== validationState.currentNode) {
      throw new GraphReplayValidationError(
        "UNEXPECTED_NODE",
        `Expected node ${validationState.currentNode}, got ${event.node}`,
        eventContext
      );
    }

    // disabled mode must represent solution-challenge as skipped, not executed
    if (
      trace.runConfig.solutionChallengeMode === "disabled" &&
      event.node === "solution-challenge" &&
      event.kind === "node_executed"
    ) {
      throw new GraphReplayValidationError(
        "INVALID_SKIP",
        "solution-challenge must be skipped when solutionChallengeMode=disabled",
        eventContext
      );
    }

    if (event.kind === "node_skipped") {
      if (event.node !== "solution-challenge") {
        throw new GraphReplayValidationError(
          "INVALID_SKIP",
          `Only solution-challenge can be skipped, got ${event.node}`,
          eventContext
        );
      }
      if (trace.runConfig.solutionChallengeMode !== "disabled") {
        throw new GraphReplayValidationError(
          "INVALID_SKIP",
          `Skip only allowed when solutionChallengeMode=disabled, got ${trace.runConfig.solutionChallengeMode}`,
          eventContext
        );
      }
      if (event.skipReason !== "solution_challenge_disabled") {
        throw new GraphReplayValidationError(
          "INVALID_SKIP",
          `Invalid skipReason: ${String(event.skipReason)}`,
          eventContext
        );
      }
      if (event.output.result !== "SKIPPED") {
        throw new GraphReplayValidationError(
          "INVALID_SKIP",
          `Skipped event output.result must be SKIPPED, got ${String(event.output.result)}`,
          eventContext
        );
      }

      let nextNode: NodeType | null;
      try {
        const routing = computeNextNode(event, validationState.retryCount);
        nextNode = routing.nextNode;
      } catch (cause) {
        throw new GraphReplayValidationError(
          "INVALID_EVENT_OUTPUT",
          `Invalid synthetic routing output for skipped solution-challenge: ${String(cause)}`,
          { ...eventContext, cause }
        );
      }

      validationState = {
        currentNode: nextNode,
        status: nextNode === null ? "completed" : "running",
        retryCount: validationState.retryCount,
      };
    } else {
      // node_executed must not carry skipReason
      if (Object.prototype.hasOwnProperty.call(event, "skipReason")) {
        throw new GraphReplayValidationError(
          "INVALID_EVENT",
          "node_executed must not carry skipReason",
          eventContext
        );
      }

      let nextNode: NodeType | null;
      let newRetryCount: number;
      try {
        const routing = computeNextNode(event, validationState.retryCount);
        nextNode = routing.nextNode;
        newRetryCount = routing.newRetryCount;
      } catch (cause) {
        throw new GraphReplayValidationError(
          "INVALID_EVENT_OUTPUT",
          `Invalid output for node '${event.node}': ${String(cause)}`,
          { ...eventContext, cause }
        );
      }

      validationState = {
        currentNode: nextNode,
        status: nextNode === null ? "completed" : "running",
        retryCount: newRetryCount,
      };
    }

    seenEventIds.add(event.eventId);
    seenSequences.add(event.sequence);
    expectedSequence++;
  }

  if (validationState.currentNode !== null || validationState.status !== "completed") {
    throw new GraphReplayValidationError(
      "INCOMPLETE_TRACE",
      "Trace does not reach a terminal completed state"
    );
  }

  return replayTrustedHistory(initialState, trace);
}
