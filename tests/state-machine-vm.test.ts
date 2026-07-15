// Regression Test — State Machine VM Replay
// ===========================================
// Verifies replay delegates to the Graph Kernel for transition decisions
// and correctly handles retry exhaustion on the review→tech-design loop.

import {
  replayExecution,
  validateReplay,
  replayTrustedHistory,
  validateAndReplayHistory,
  GraphReplayValidationError,
  GraphReplayValidationCode,
} from "../core/state-machine-vm";
import { createInitialState, ExecutionState } from "../core/execution-state";
import { buildExecutionContext } from "../core/context-builder";
import { ExecutionTraceItem } from "../core/execution-trace";
import {
  GraphReplayEvent,
  GraphReplayTrace,
  createExecutedEvent,
  createSkippedEvent,
  createGraphRunConfig,
} from "../core/graph-replay-trace";
import { NodeType } from "../sdlc_graph/types";
import { createShadowReadyChallengeState } from "../core/solution-challenge-state";

function makeEvent(node: string, result?: string): ExecutionTraceItem {
  return {
    node: node as any,
    agent: "codex",
    input: {},
    output: result ? { result } : {},
    timestamp: Date.now(),
  };
}

async function test() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      passed++;
      console.log(`  ✓ ${message}`);
    } else {
      failed++;
      console.error(`  ✗ ${message}`);
    }
  }

  const ctx = buildExecutionContext("requirement-summary", {});
  const initialState = createInitialState(ctx);

  console.log("State Machine VM Replay Test\n");

  // ── Test 1: PASS path replay ──
  console.log("Test 1: PASS path replay");
  const passHistory: ExecutionTraceItem[] = [
    makeEvent("requirement-summary"),
    makeEvent("tech-design"),
    makeEvent("review", "PASS"),
    makeEvent("implementation"),
    makeEvent("validation"),
  ];
  const passReplay = replayExecution(initialState, passHistory);
  assert(passReplay.currentNode === null, "PASS path ends at terminal node");
  assert(passReplay.status === "completed", "PASS path status is completed");
  assert(passReplay.step === 5, "PASS path has 5 steps");
  assert(validateReplay(passReplay, passReplay), "PASS path validates against itself");
  console.log("");

  // ── Test 2: Replay before retry exhaustion still loops to tech-design ──
  console.log("Test 2: Replay loops to tech-design before retry exhaustion");
  const loopHistory: ExecutionTraceItem[] = [
    makeEvent("requirement-summary"),
    makeEvent("tech-design"),
    makeEvent("review", "FAIL"),
    makeEvent("tech-design"),
    makeEvent("review", "FAIL"),
  ];
  const loopReplay = replayExecution(initialState, loopHistory);
  assert(loopReplay.currentNode === "tech-design", "after 2 FAILs next node is tech-design");
  assert(loopReplay.retryCount === 2, "retryCount is 2 after 2 review FAILs");
  console.log("");

  // ── Test 3: Replay after retry exhaustion routes to validation ──
  console.log("Test 3: Replay routes to validation after retry exhaustion");
  const exhaustHistory: ExecutionTraceItem[] = [
    makeEvent("requirement-summary"),
    makeEvent("tech-design"),
    makeEvent("review", "FAIL"),
    makeEvent("tech-design"),
    makeEvent("review", "FAIL"),
    makeEvent("tech-design"),
    makeEvent("review", "FAIL"),
    makeEvent("validation"),
  ];
  const exhaustReplay = replayExecution(initialState, exhaustHistory);
  assert(exhaustReplay.currentNode === null, "exhausted path ends at terminal node");
  assert(exhaustReplay.step === 8, "exhausted path has 8 steps");
  assert(exhaustReplay.retryCount === 0, "retryCount resets after validation (non-loop node)");
  console.log("");

  // ── Test 4: Replay would have routed incorrectly before fix ──
  console.log("Test 4: 3rd review FAIL does not loop back to tech-design");
  const thirdFailHistory: ExecutionTraceItem[] = [
    makeEvent("requirement-summary"),
    makeEvent("tech-design"),
    makeEvent("review", "FAIL"),
    makeEvent("tech-design"),
    makeEvent("review", "FAIL"),
    makeEvent("tech-design"),
    makeEvent("review", "FAIL"),
  ];
  const thirdFailReplay = replayExecution(initialState, thirdFailHistory);
  assert(thirdFailReplay.currentNode === "validation", "3rd review FAIL routes to validation, not tech-design");
  assert(thirdFailReplay.status === "running", "replay remains running until validation is executed");
  console.log("");

  console.log("\nCanonical Replay API Tests\n");

  // ═══ Canonical replay helpers ═══
  function makeExecutedEvent(
    executionId: string,
    sequence: number,
    node: NodeType,
    output: Record<string, unknown> = {},
    input: Record<string, unknown> = {}
  ): GraphReplayEvent {
    return createExecutedEvent(
      executionId,
      sequence,
      node,
      "codex",
      input,
      output,
      Date.now()
    );
  }

  function makeSkippedEvent(
    executionId: string,
    sequence: number,
    input: Record<string, unknown> = {}
  ): GraphReplayEvent {
    return createSkippedEvent(
      executionId,
      sequence,
      "solution-challenge",
      "codex",
      input,
      "solution_challenge_disabled",
      { result: "SKIPPED" },
      Date.now()
    );
  }

  function makeTrace(
    executionId: string,
    mode: "disabled" | "shadow" | "gateway_shadow",
    events: GraphReplayEvent[]
  ): GraphReplayTrace {
    return {
      executionId,
      runConfig: createGraphRunConfig({ solutionChallengeMode: mode }),
      events,
    };
  }

  function freshState(): ExecutionState {
    return createInitialState(buildExecutionContext("requirement-summary", {}));
  }

  function expectError(
    fn: () => unknown,
    expectedCode: GraphReplayValidationCode,
    message: string
  ) {
    try {
      fn();
      assert(false, message);
    } catch (e) {
      if (e instanceof GraphReplayValidationError) {
        assert(e.code === expectedCode, `${message} (code=${e.code})`);
      } else {
        assert(false, `${message} (threw non-GraphReplayValidationError)`);
      }
    }
  }

  const execId = "EXEC-001";
  const readyChallengeOutput = {
    result: "PASS",
    solution_challenge: createShadowReadyChallengeState(),
  };

  // ═══ Test 5: replayTrustedHistory partial trace returns running ═══
  console.log("Test 5: replayTrustedHistory partial canonical trace");
  const partialTrace = makeTrace(execId, "disabled", [
    makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }),
    makeExecutedEvent(execId, 2, "tech-design", { result: "PASS" }),
  ]);
  const partialReplay = replayTrustedHistory(freshState(), partialTrace);
  assert(partialReplay.currentNode === "solution-challenge", "partial replay next node is solution-challenge");
  assert(partialReplay.status === "running", "partial replay status is running");
  assert(partialReplay.step === 2, "partial replay has 2 steps");
  assert(partialReplay.retryCount === 0, "partial replay retryCount is 0");
  console.log("");

  // ═══ Test 6: replayTrustedHistory uses initialState.retryCount ═══
  console.log("Test 6: replayTrustedHistory inherits initial retryCount");
  const ctxWithRetry = buildExecutionContext("requirement-summary", {});
  const stateWithRetry: ExecutionState = {
    ...createInitialState(ctxWithRetry),
    currentNode: "review",
    retryCount: 2,
  };
  const retryTrace = makeTrace(execId, "disabled", [
    makeExecutedEvent(execId, 1, "review", { result: "FAIL" }),
  ]);
  const retryReplay = replayTrustedHistory(stateWithRetry, retryTrace);
  assert(retryReplay.currentNode === "validation", "review FAIL with retryCount=2 routes to validation");
  assert(retryReplay.retryCount === 3, "retryCount increments from inherited value");
  console.log("");

  // ═══ Test 7: validateAndReplayHistory disabled full trace ═══
  console.log("Test 7: validateAndReplayHistory disabled full trace");
  const disabledTrace = makeTrace(execId, "disabled", [
    makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }),
    makeExecutedEvent(execId, 2, "tech-design", { result: "PASS" }),
    makeSkippedEvent(execId, 3),
    makeExecutedEvent(execId, 4, "review", { result: "PASS" }),
    makeExecutedEvent(execId, 5, "implementation", { result: "code_patch_generated" }),
    makeExecutedEvent(execId, 6, "validation", { result: "PASS" }),
  ]);
  const disabledReplay = validateAndReplayHistory(freshState(), disabledTrace);
  assert(disabledReplay.currentNode === null, "disabled full trace ends at terminal");
  assert(disabledReplay.status === "completed", "disabled full trace status is completed");
  assert(disabledReplay.step === 6, "disabled full trace has 6 steps");
  assert(
    (disabledReplay.history as GraphReplayEvent[]).every((h, i) => h === disabledTrace.events[i]),
    "disabled replay history preserves original event objects"
  );
  assert((disabledReplay.history[2] as GraphReplayEvent).kind === "node_skipped", "disabled history contains skipped event");
  console.log("");

  // ═══ Test 8: validateAndReplayHistory shadow full trace ═══
  console.log("Test 8: validateAndReplayHistory shadow full trace");
  const shadowTrace = makeTrace(execId, "shadow", [
    makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }),
    makeExecutedEvent(execId, 2, "tech-design", { result: "PASS" }),
    makeExecutedEvent(execId, 3, "solution-challenge", readyChallengeOutput),
    makeExecutedEvent(execId, 4, "review", { result: "PASS" }),
    makeExecutedEvent(execId, 5, "implementation", { result: "code_patch_generated" }),
    makeExecutedEvent(execId, 6, "validation", { result: "PASS" }),
  ]);
  const shadowReplay = validateAndReplayHistory(freshState(), shadowTrace);
  assert(shadowReplay.currentNode === null, "shadow full trace ends at terminal");
  assert(shadowReplay.status === "completed", "shadow full trace status is completed");
  assert(
    (shadowReplay.history as GraphReplayEvent[]).every((h) => h.kind === "node_executed"),
    "shadow trace has no skipped events"
  );
  console.log("");

  // ═══ Test 9: sequence and eventId validation ═══
  console.log("Test 9: sequence and eventId validation");
  const validEvents = [
    makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }),
    makeExecutedEvent(execId, 2, "tech-design", { result: "PASS" }),
    makeExecutedEvent(execId, 3, "solution-challenge", readyChallengeOutput),
    makeExecutedEvent(execId, 4, "review", { result: "PASS" }),
    makeExecutedEvent(execId, 5, "implementation", { result: "code_patch_generated" }),
    makeExecutedEvent(execId, 6, "validation", { result: "PASS" }),
  ];
  for (let i = 0; i < validEvents.length; i++) {
    assert(validEvents[i].sequence === i + 1, `sequence ${i + 1} is correct`);
    assert(validEvents[i].eventId === `${execId}:${i + 1}`, `eventId ${i + 1} is correct`);
  }
  console.log("");

  // ═══ Test 10: legacy replayExecution retains original event shape ═══
  console.log("Test 10: legacy replayExecution retains original event shape");
  const legacyEvent: ExecutionTraceItem = {
    node: "requirement-summary",
    agent: "codex",
    input: {},
    output: { result: "PASS" },
    timestamp: Date.now(),
  };
  const legacyReplay = replayExecution(freshState(), [legacyEvent]);
  assert(legacyReplay.history.length === 1, "legacy history length is 1");
  assert(!Object.prototype.hasOwnProperty.call(legacyReplay.history[0], "kind"), "legacy event has no kind field");
  assert(!Object.prototype.hasOwnProperty.call(legacyReplay.history[0], "eventId"), "legacy event has no eventId field");
  assert(!Object.prototype.hasOwnProperty.call(legacyReplay.history[0], "sequence"), "legacy event has no sequence field");
  console.log("");

  // ═══ Test 11: three review FAILs then validation completes ═══
  console.log("Test 11: three review FAILs then validation");
  const exhaustCanonicalTrace = makeTrace(execId, "disabled", [
    makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }),
    makeExecutedEvent(execId, 2, "tech-design", { result: "PASS" }),
    makeSkippedEvent(execId, 3),
    makeExecutedEvent(execId, 4, "review", { result: "FAIL" }),
    makeExecutedEvent(execId, 5, "tech-design", { result: "PASS" }),
    makeSkippedEvent(execId, 6),
    makeExecutedEvent(execId, 7, "review", { result: "FAIL" }),
    makeExecutedEvent(execId, 8, "tech-design", { result: "PASS" }),
    makeSkippedEvent(execId, 9),
    makeExecutedEvent(execId, 10, "review", { result: "FAIL" }),
    makeExecutedEvent(execId, 11, "validation", { result: "PASS" }),
  ]);
  const exhaustCanonicalReplay = validateAndReplayHistory(freshState(), exhaustCanonicalTrace);
  assert(exhaustCanonicalReplay.currentNode === null, "exhausted canonical path ends at terminal");
  assert(exhaustCanonicalReplay.status === "completed", "exhausted canonical path is completed");
  assert(exhaustCanonicalReplay.step === 11, "exhausted canonical path has 11 steps");
  console.log("");

  // ═══ Negative tests ═══
  console.log("Negative Tests\n");

  // Test 12: non-fresh initial state
  console.log("Test 12: non-fresh initial state rejected");
  const nonFreshState: ExecutionState = { ...freshState(), currentNode: "tech-design" };
  expectError(
    () => validateAndReplayHistory(nonFreshState, makeTrace(execId, "disabled", [])),
    "INVALID_INITIAL_STATE",
    "non-fresh currentNode rejected"
  );
  const nonFreshStatus: ExecutionState = { ...freshState(), status: "completed" };
  expectError(
    () => validateAndReplayHistory(nonFreshStatus, makeTrace(execId, "disabled", [])),
    "INVALID_INITIAL_STATE",
    "non-fresh status rejected"
  );
  const nonFreshStep: ExecutionState = { ...freshState(), step: 1 };
  expectError(
    () => validateAndReplayHistory(nonFreshStep, makeTrace(execId, "disabled", [])),
    "INVALID_INITIAL_STATE",
    "non-fresh step rejected"
  );
  const nonFreshHistory: ExecutionState = { ...freshState(), history: [makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }) as unknown as ExecutionTraceItem] };
  expectError(
    () => validateAndReplayHistory(nonFreshHistory, makeTrace(execId, "disabled", [])),
    "INVALID_INITIAL_STATE",
    "non-fresh history rejected"
  );
  const nonFreshRetry: ExecutionState = { ...freshState(), retryCount: 1 };
  expectError(
    () => validateAndReplayHistory(nonFreshRetry, makeTrace(execId, "disabled", [])),
    "INVALID_INITIAL_STATE",
    "non-fresh retryCount rejected"
  );
  console.log("");

  // Test 13: invalid executionId
  console.log("Test 13: invalid executionId rejected");
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace("", "disabled", [])),
    "INVALID_EXECUTION_ID",
    "empty executionId rejected"
  );
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace("   ", "disabled", [])),
    "INVALID_EXECUTION_ID",
    "whitespace executionId rejected"
  );
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(" exec ", "disabled", [])),
    "INVALID_EXECUTION_ID",
    "leading/trailing whitespace executionId rejected"
  );
  expectError(
    () => validateAndReplayHistory(freshState(), { executionId: 123 as any, runConfig: createGraphRunConfig(), events: [] }),
    "INVALID_EXECUTION_ID",
    "non-string executionId rejected"
  );
  console.log("");

  // Test 14: invalid runConfig
  console.log("Test 14: invalid runConfig rejected");
  expectError(
    () => validateAndReplayHistory(freshState(), { executionId: execId, runConfig: createGraphRunConfig({ requirementSummaryMode: "invalid" as any }), events: [] }),
    "INVALID_RUN_CONFIG",
    "invalid requirementSummaryMode rejected"
  );
  expectError(
    () => validateAndReplayHistory(freshState(), { executionId: execId, runConfig: createGraphRunConfig({ solutionChallengeMode: "invalid" as any }), events: [] }),
    "INVALID_RUN_CONFIG",
    "invalid solutionChallengeMode rejected"
  );
  expectError(
    () => validateAndReplayHistory(freshState(), { executionId: execId, runConfig: null as any, events: [] }),
    "INVALID_RUN_CONFIG",
    "null runConfig rejected"
  );
  console.log("");

  // Test 15: invalid events array / event object
  console.log("Test 15: invalid events rejected");
  expectError(
    () => validateAndReplayHistory(freshState(), { executionId: execId, runConfig: createGraphRunConfig(), events: null as any }),
    "INVALID_EVENT",
    "non-array events rejected"
  );
  expectError(
    () => validateAndReplayHistory(freshState(), { executionId: execId, runConfig: createGraphRunConfig(), events: [null as any] }),
    "INVALID_EVENT",
    "null event rejected"
  );
  expectError(
    () => validateAndReplayHistory(freshState(), { executionId: execId, runConfig: createGraphRunConfig(), events: ["event" as any] }),
    "INVALID_EVENT",
    "string event rejected"
  );
  console.log("");

  // Test 16: invalid kind / node
  console.log("Test 16: invalid kind and node rejected");
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      { ...makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }), kind: "unknown" } as unknown as GraphReplayEvent,
    ])),
    "INVALID_EVENT_KIND",
    "invalid kind rejected"
  );
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      { ...makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }), node: "code-review" } as unknown as GraphReplayEvent,
    ])),
    "NON_GRAPH_NODE",
    "code-review node rejected"
  );
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      { ...makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }), node: "bugfix" } as unknown as GraphReplayEvent,
    ])),
    "NON_GRAPH_NODE",
    "bugfix node rejected"
  );
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      { ...makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }), node: "unknown" } as unknown as GraphReplayEvent,
    ])),
    "NON_GRAPH_NODE",
    "unknown node rejected"
  );
  console.log("");

  // Test 17: invalid input/output/timestamp
  console.log("Test 17: invalid input/output/timestamp rejected");
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      { ...makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }), input: null as any } as GraphReplayEvent,
    ])),
    "INVALID_EVENT",
    "null input rejected"
  );
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      { ...makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }), input: [] as any } as GraphReplayEvent,
    ])),
    "INVALID_EVENT",
    "array input rejected"
  );
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      { ...makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }), output: null as any } as GraphReplayEvent,
    ])),
    "INVALID_EVENT",
    "null output rejected"
  );
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      { ...makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }), output: [] as any } as GraphReplayEvent,
    ])),
    "INVALID_EVENT",
    "array output rejected"
  );
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      { ...makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }), timestamp: NaN } as GraphReplayEvent,
    ])),
    "INVALID_EVENT",
    "NaN timestamp rejected"
  );
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      { ...makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }), timestamp: Infinity } as GraphReplayEvent,
    ])),
    "INVALID_EVENT",
    "Infinity timestamp rejected"
  );
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      { ...makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }), timestamp: "now" as any } as GraphReplayEvent,
    ])),
    "INVALID_EVENT",
    "string timestamp rejected"
  );
  console.log("");

  // Test 18: invalid sequence
  console.log("Test 18: invalid sequence rejected");
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      makeExecutedEvent(execId, 0, "requirement-summary", { result: "PASS" }),
    ])),
    "INVALID_SEQUENCE",
    "sequence 0 rejected"
  );
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      makeExecutedEvent(execId, 1.5, "requirement-summary", { result: "PASS" }) as any,
    ])),
    "INVALID_SEQUENCE",
    "non-integer sequence rejected"
  );
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      makeExecutedEvent(execId, 2, "requirement-summary", { result: "PASS" }),
    ])),
    "INVALID_SEQUENCE",
    "sequence starts at 2 rejected"
  );
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }),
      makeExecutedEvent(execId, 3, "tech-design", { result: "PASS" }),
    ])),
    "INVALID_SEQUENCE",
    "missing sequence rejected"
  );
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }),
      { ...makeExecutedEvent(execId, 1, "tech-design", { result: "PASS" }), eventId: "OTHER-EVENT-ID" } as GraphReplayEvent,
    ])),
    "DUPLICATE_SEQUENCE",
    "duplicate sequence rejected"
  );
  console.log("");

  // Test 19: invalid eventId
  console.log("Test 19: invalid eventId rejected");
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      { ...makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }), eventId: "" } as GraphReplayEvent,
    ])),
    "INVALID_EVENT_ID",
    "empty eventId rejected"
  );
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      { ...makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }), eventId: "OTHER:1" } as GraphReplayEvent,
    ])),
    "INVALID_EVENT_ID",
    "eventId mismatch rejected"
  );
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }),
      { ...makeExecutedEvent(execId, 2, "tech-design", { result: "PASS" }), eventId: `${execId}:1` } as GraphReplayEvent,
    ])),
    "DUPLICATE_EVENT_ID",
    "duplicate eventId rejected"
  );
  console.log("");

  // Test 20: executed event with skipReason
  console.log("Test 20: executed event with skipReason rejected");
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      { ...makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }), skipReason: "x" } as GraphReplayEvent,
    ])),
    "INVALID_EVENT",
    "executed event with skipReason rejected"
  );
  console.log("");

  // Test 21: unexpected node
  console.log("Test 21: unexpected node rejected");
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      makeExecutedEvent(execId, 1, "review", { result: "PASS" }),
    ])),
    "UNEXPECTED_NODE",
    "review as first node rejected"
  );
  console.log("");

  // Test 22: invalid skip
  console.log("Test 22: invalid skip rejected");
  // normal node skip
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }),
      { ...makeSkippedEvent(execId, 2), node: "tech-design" } as GraphReplayEvent,
    ])),
    "INVALID_SKIP",
    "skip non-solution-challenge rejected"
  );
  // shadow mode skip
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "shadow", [
      makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }),
      makeExecutedEvent(execId, 2, "tech-design", { result: "PASS" }),
      makeSkippedEvent(execId, 3),
    ])),
    "INVALID_SKIP",
    "shadow mode skip rejected"
  );
  // gateway_shadow mode skip
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "gateway_shadow", [
      makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }),
      makeExecutedEvent(execId, 2, "tech-design", { result: "PASS" }),
      makeSkippedEvent(execId, 3),
    ])),
    "INVALID_SKIP",
    "gateway_shadow mode skip rejected"
  );
  // wrong skipReason
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }),
      makeExecutedEvent(execId, 2, "tech-design", { result: "PASS" }),
      { ...makeSkippedEvent(execId, 3), skipReason: "other" } as GraphReplayEvent,
    ])),
    "INVALID_SKIP",
    "wrong skipReason rejected"
  );
  // skipped output not SKIPPED
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }),
      makeExecutedEvent(execId, 2, "tech-design", { result: "PASS" }),
      { ...makeSkippedEvent(execId, 3), output: { result: "PASS" } } as GraphReplayEvent,
    ])),
    "INVALID_SKIP",
    "skipped output not SKIPPED rejected"
  );
  console.log("");

  // Test 23: malformed solution-challenge output
  console.log("Test 23: malformed solution-challenge output rejected");
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "shadow", [
      makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }),
      makeExecutedEvent(execId, 2, "tech-design", { result: "PASS" }),
      makeExecutedEvent(execId, 3, "solution-challenge", { result: "PASS" }),
    ])),
    "INVALID_EVENT_OUTPUT",
    "missing solution_challenge state rejected"
  );
  console.log("");

  // Test 24: review output inconsistent with next event
  console.log("Test 24: review output inconsistent with next event");
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }),
      makeExecutedEvent(execId, 2, "tech-design", { result: "PASS" }),
      makeSkippedEvent(execId, 3),
      makeExecutedEvent(execId, 4, "review", { result: "PASS" }),
      makeExecutedEvent(execId, 5, "tech-design", { result: "PASS" }),
    ])),
    "UNEXPECTED_NODE",
    "review PASS followed by tech-design rejected"
  );
  console.log("");

  // Test 25: retry exhaustion then review or tech-design
  console.log("Test 25: retry exhaustion then review/tech-design rejected");
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }),
      makeExecutedEvent(execId, 2, "tech-design", { result: "PASS" }),
      makeSkippedEvent(execId, 3),
      makeExecutedEvent(execId, 4, "review", { result: "FAIL" }),
      makeExecutedEvent(execId, 5, "tech-design", { result: "PASS" }),
      makeSkippedEvent(execId, 6),
      makeExecutedEvent(execId, 7, "review", { result: "FAIL" }),
      makeExecutedEvent(execId, 8, "tech-design", { result: "PASS" }),
      makeSkippedEvent(execId, 9),
      makeExecutedEvent(execId, 10, "review", { result: "FAIL" }),
      makeExecutedEvent(execId, 11, "review", { result: "PASS" }),
    ])),
    "UNEXPECTED_NODE",
    "review after retry exhaustion rejected"
  );
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }),
      makeExecutedEvent(execId, 2, "tech-design", { result: "PASS" }),
      makeSkippedEvent(execId, 3),
      makeExecutedEvent(execId, 4, "review", { result: "FAIL" }),
      makeExecutedEvent(execId, 5, "tech-design", { result: "PASS" }),
      makeSkippedEvent(execId, 6),
      makeExecutedEvent(execId, 7, "review", { result: "FAIL" }),
      makeExecutedEvent(execId, 8, "tech-design", { result: "PASS" }),
      makeSkippedEvent(execId, 9),
      makeExecutedEvent(execId, 10, "review", { result: "FAIL" }),
      makeExecutedEvent(execId, 11, "tech-design", { result: "PASS" }),
    ])),
    "UNEXPECTED_NODE",
    "tech-design after retry exhaustion rejected"
  );
  console.log("");

  // Test 26: terminal event
  console.log("Test 26: terminal event rejected");
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }),
      makeExecutedEvent(execId, 2, "tech-design", { result: "PASS" }),
      makeSkippedEvent(execId, 3),
      makeExecutedEvent(execId, 4, "review", { result: "PASS" }),
      makeExecutedEvent(execId, 5, "implementation", { result: "code_patch_generated" }),
      makeExecutedEvent(execId, 6, "validation", { result: "PASS" }),
      makeExecutedEvent(execId, 7, "requirement-summary", { result: "PASS" }),
    ])),
    "TERMINAL_EVENT",
    "event after terminal rejected"
  );
  console.log("");

  // Test 27: truncated trace
  console.log("Test 27: truncated trace rejected");
  expectError(
    () => validateAndReplayHistory(freshState(), makeTrace(execId, "disabled", [
      makeExecutedEvent(execId, 1, "requirement-summary", { result: "PASS" }),
      makeExecutedEvent(execId, 2, "tech-design", { result: "PASS" }),
      makeSkippedEvent(execId, 3),
      makeExecutedEvent(execId, 4, "review", { result: "PASS" }),
      makeExecutedEvent(execId, 5, "implementation", { result: "code_patch_generated" }),
    ])),
    "INCOMPLETE_TRACE",
    "trace missing validation rejected"
  );
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
