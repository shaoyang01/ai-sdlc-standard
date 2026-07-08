// Regression Test — State Machine VM Replay
// ===========================================
// Verifies replay delegates to the Graph Kernel for transition decisions
// and correctly handles retry exhaustion on the review→tech-design loop.

import { replayExecution, validateReplay } from "../core/state-machine-vm";
import { createInitialState } from "../core/execution-state";
import { buildExecutionContext } from "../core/context-builder";
import { ExecutionTraceItem } from "../core/execution-trace";

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
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
