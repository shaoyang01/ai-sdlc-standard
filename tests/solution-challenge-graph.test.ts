// Solution Challenge Shared Validation + Replay Test
// ===================================================
// Validates shared validator across Graph transitions,
// Runtime normalization, and replayExecution.

import { run } from "../runtime";
import { createArtifact } from "../core/artifact";
import { createInitialState, ExecutionState } from "../core/execution-state";
import { replayExecution } from "../core/state-machine-vm";
import { buildExecutionContext } from "../core/context-builder";
import {
  type SolutionChallengeState,
  createShadowReadyChallengeState,
  validateSolutionChallengeState,
  normalizeSolutionChallengeOutput,
} from "../core/solution-challenge-state";
import type { RuntimeExecutionGateway, RuntimeExecutorMap } from "../core/runtime-executors";
import type { ExecutionRequest, ExecutionResult } from "../execution/types";
import type { ExecutionTraceItem } from "../core/execution-trace";

function fakeReviewArtifact(reqId: string) {
  return createArtifact({ id: `${reqId}:cr:PASS:0`, requirementId: reqId, node: "code-review", type: "code_review", content: { status: "PASS", findings: [] }, agent: "codex", source: "execution_gateway" });
}
function fakePatchArtifact(reqId: string) {
  return createArtifact({ id: `${reqId}:imp:cp:0`, requirementId: reqId, node: "implementation", type: "code_patch", content: { file: "src/fake.ts", patch: "export function f() { return true; }" }, agent: "codex", source: "execution_gateway" });
}
const fakeGateway: RuntimeExecutionGateway = {
  async execute(req: ExecutionRequest): Promise<ExecutionResult> {
    if (req.type === "code_generation") return { success: true, node: req.node, agent: req.agent, output: { result: "code_patch_generated" }, artifacts: [fakePatchArtifact(req.requirementId)] };
    if (req.type === "code_review") return { success: true, node: req.node, agent: req.agent, output: { result: "PASS", findings: [] }, artifacts: [fakeReviewArtifact(req.requirementId)] };
    return { success: true, node: req.node, agent: req.agent, output: {}, artifacts: [] };
  },
};

function scOut(s: SolutionChallengeState) { return { result: "FAIL", solution_challenge: s }; }

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) { if (c) { passed++; console.log(`  ✓ ${m}`); } else { failed++; console.error(`  ✗ ${m}`); } }

  console.log("Solution Challenge Shared Validation + Replay Test\n");

  // ═══ Test 1: Valid routing ═══
  console.log("Test 1: Valid routing");
  const { getNextNode: gn, isValidTransition } = await import("../sdlc_graph/transitions");
  const ready = createShadowReadyChallengeState();
  const needsRev = { ...ready, status: "NEEDS_REVISION" as const, exhausted: false };
  const needsRevEx = { ...ready, mode: "FOLLOW_UP_VERIFICATION" as const, currentCycle: 2 as const, status: "NEEDS_REVISION" as const, exhausted: true };

  assert(gn("solution-challenge", scOut(ready)) === "review", "READY_FOR_GATE → review");
  assert(gn("solution-challenge", scOut(needsRev)) === "tech-design", "NEEDS_REVISION + !exhausted → tech-design");
  assert(gn("solution-challenge", scOut(needsRevEx)) === "review", "NEEDS_REVISION + exhausted → review");
  assert(isValidTransition("solution-challenge", "review", scOut(ready)), "valid transition reports true");
  console.log("");

  // ═══ Test 2: Missing/invalid state → throws ═══
  console.log("Test 2: Missing/invalid state throws");
  for (const [label, input] of [
    ["missing state", { result: "PASS" }],
    ["undefined state", { result: "PASS", solution_challenge: undefined }],
    ["empty state", { result: "PASS", solution_challenge: {} }],
    ["invalid status", scOut({ ...ready, status: "INVALID" as never })],
    ["invalid mode", scOut({ ...ready, mode: "INVALID" as never })],
    ["invalid cycle (99)", scOut({ ...ready, currentCycle: 99 as never })],
    ["invalid artifact combo", scOut({ ...ready, artifactStatus: "generated" as "shadow_only" | "generated", reportPath: null } as SolutionChallengeState)],
  ] as const) {
    let thrown = false;
    try { gn("solution-challenge", input as Record<string, unknown>); } catch { thrown = true; }
    assert(thrown, `throws: ${label}`);
  }
  console.log("");

  // ═══ Test 3: Malformed state rejected by validator ═══
  console.log("Test 3: Validator rejects malformed states");
  for (const [label, st] of [
    ["invalid mode", { ...ready, mode: "INVALID" }],
    ["cycle=3", { ...ready, currentCycle: 3 }],
    ["maxCycles=99", { ...ready, maxCycles: 99 }],
    ["invalid artifactStatus", { ...ready, artifactStatus: "UNKNOWN" }],
    ["findingIds not strings", { ...ready, findingIds: [123] }],
    ["findingIds empty string", { ...ready, findingIds: [""] }],
    ["findingIds whitespace", { ...ready, findingIds: ["   "] }],
    ["reportPath not string/null", { ...ready, reportPath: 123 }],
    ["cycle=1 + FOLLOW_UP", { ...ready, currentCycle: 1, mode: "FOLLOW_UP_VERIFICATION" }],
    ["cycle=2 + not exhausted", { ...ready, currentCycle: 2, exhausted: false }],
    ["shadow_only + path", { ...ready, artifactStatus: "shadow_only" as const, reportPath: "lib/report.md" }],
    ["generated + null", { ...ready, artifactStatus: "generated" as const, reportPath: null }],
    ["generated + empty", { ...ready, artifactStatus: "generated" as const, reportPath: "" }],
    ["generated + whitespace", { ...ready, artifactStatus: "generated" as const, reportPath: "   " }],
  ] as const) {
    let r = false; try { validateSolutionChallengeState(st); } catch { r = true; }
    assert(r, `rejected: ${label}`);
  }
  // generated + valid path → accepted
  let ok3 = false;
  try { validateSolutionChallengeState({ ...ready, artifactStatus: "generated" as const, reportPath: "lib/REQ/report.md" }); ok3 = true; } catch { }
  assert(ok3, "generated + valid path accepted");
  console.log("");

  // ═══ Test 4: Normalization consistency ═══
  console.log("Test 4: Normalization consistency");
  const n4 = normalizeSolutionChallengeOutput({ result: "PASS", solution_challenge: needsRev });
  assert(n4.result === "FAIL", "PASS+NEEDS_REVISION → FAIL");
  console.log("");

  // ═══ Test 5: Runtime malformed → review not called ═══
  console.log("Test 5: Runtime malformed → review not called");
  let reviewCalled5 = false, err5 = false, msg5 = "";
  try {
    await run("x", { executionGateway: fakeGateway, solutionChallengeMode: "shadow", executors: {
      "solution-challenge": async () => ({ node: "solution-challenge", skill: "sdlc-solution-challenger", result: "PASS", execution_source: "deterministic_shadow", executor_type: "shadow", fallback_used: false, fallback_reason: "none", solution_challenge: {}, blocking_count: 0, required_count: 0, non_blocking_count: 0, out_of_scope_count: 0, recommended_next_step: "PROCEED_TO_SOLUTION_REVIEWER", duration_ms: 0 }),
      "review": async () => { reviewCalled5 = true; return { node: "review", result: "PASS", reviewed_at: new Date().toISOString() }; },
    }});
  } catch (e) { err5 = true; msg5 = String(e); }
  assert(err5, "error caught");
  assert(!reviewCalled5, "review not called");
  assert(msg5.includes("solution-challenge"), "error identifies solution-challenge");
  console.log("");

  // ═══ Test 6: Two-cycle Runtime path ═══
  console.log("Test 6: Two-cycle findingIds propagation");
  let calls6 = 0; const meta6: (SolutionChallengeState | undefined)[] = [];
  const exec6: RuntimeExecutorMap["solution-challenge"] = async (_ctx, execCtx) => {
    calls6++; meta6.push(execCtx?.metadata?.solutionChallenge);
    if (calls6 > 2) return { node: "solution-challenge", skill: "sdlc-solution-challenger", result: "PASS", execution_source: "deterministic_shadow", executor_type: "shadow", fallback_used: false, fallback_reason: "none", solution_challenge: createShadowReadyChallengeState(), blocking_count: 0, required_count: 0, non_blocking_count: 0, out_of_scope_count: 0, recommended_next_step: "PROCEED_TO_SOLUTION_REVIEWER", duration_ms: 0 };
    const prev = execCtx?.metadata?.solutionChallenge;
    const c = (prev ? Math.min(prev.currentCycle + 1, 2) : 1) as 1 | 2;
    const e = c >= 2;
    const ids = calls6 === 1 ? ["CH-001"] : (prev?.findingIds ?? []);
    const modeVal = prev ? "FOLLOW_UP_VERIFICATION" as const : "INITIAL_CHALLENGE" as const;
    const st = { ...createShadowReadyChallengeState(), mode: modeVal, currentCycle: c, exhausted: e, status: "NEEDS_REVISION" as const, findingIds: ids };
    return { node: "solution-challenge", skill: "sdlc-solution-challenger", result: "FAIL", execution_source: "deterministic_shadow", executor_type: "shadow", fallback_used: false, fallback_reason: "none", solution_challenge: st, blocking_count: 1, required_count: 0, non_blocking_count: 0, out_of_scope_count: 0, recommended_next_step: e ? "ESCALATE_TO_SOLUTION_REVIEWER" : "RETURN_TO_SPECIFICATION_WRITER", duration_ms: 0 };
  };
  const r6 = await run("x", { executionGateway: fakeGateway, solutionChallengeMode: "shadow", executors: { "solution-challenge": exec6, "review": async () => ({ node: "review", result: "PASS", reviewed_at: new Date().toISOString() }) } });
  assert(calls6 === 2, `called twice (got ${calls6})`);
  assert(meta6[1]?.findingIds?.includes("CH-001"), "cycle 2 has CH-001");
  assert(r6.final_status === "success", "runtime completes");
  console.log("");

  // ═══ Test 7: replayExecution rejects malformed challenge traces ═══
  console.log("Test 7: replayExecution rejects malformed challenge traces");

  function makeTraceItem(node: string, output: Record<string, unknown>): ExecutionTraceItem {
    return { node: node as never, agent: "kimi", input: {}, output, timestamp: Date.now() };
  }
  function runReplay(trace: ExecutionTraceItem[]): { error: boolean; status: string } {
    try {
      const execCtx = buildExecutionContext("requirement-summary", { requirement_id: "REQ-REPLAY" });
      const init = createInitialState(execCtx);
      const result = replayExecution(init, trace);
      return { error: false, status: result.status };
    } catch {
      return { error: true, status: "error" };
    }
  }

  // Case 7a: missing solution_challenge → error, not completed
  const r7a = runReplay([makeTraceItem("solution-challenge", { result: "PASS" })]);
  assert(r7a.error, "missing state: replay throws error");
  assert(r7a.status !== "completed", "missing state: NOT completed");

  // Case 7b: valid status but invalid mode
  const r7b = runReplay([makeTraceItem("solution-challenge", { result: "PASS", solution_challenge: { status: "READY_FOR_GATE", mode: "INVALID", currentCycle: 1, maxCycles: 2, exhausted: false, artifactStatus: "shadow_only", reportPath: null } })]);
  assert(r7b.error, "invalid mode: replay throws error");
  assert(r7b.status !== "completed", "invalid mode: NOT completed");

  // Case 7c: invalid cycle
  const r7c = runReplay([makeTraceItem("solution-challenge", { result: "FAIL", solution_challenge: { status: "NEEDS_REVISION", mode: "INITIAL_CHALLENGE", currentCycle: 99, maxCycles: 2, exhausted: false, artifactStatus: "shadow_only", reportPath: null } })]);
  assert(r7c.error, "invalid cycle: replay throws error");

  // Case 7d: artifact combo invalid (generated + null)
  const r7d = runReplay([makeTraceItem("solution-challenge", { result: "PASS", solution_challenge: { status: "READY_FOR_GATE", mode: "INITIAL_CHALLENGE", currentCycle: 1, maxCycles: 2, exhausted: false, artifactStatus: "generated", reportPath: null } })]);
  assert(r7d.error, "invalid artifact combo: replay throws error");

  // Case 7e: valid READY_FOR_GATE → replays to review
  const r7e = runReplay([makeTraceItem("solution-challenge", scOut(ready))]);
  assert(!r7e.error, "valid READY_FOR_GATE: no error");
  // getNextNode for the next step should be review
  assert(gn("solution-challenge", scOut(ready)) === "review", "valid READY_FOR_GATE → review");

  // Case 7f: valid NEEDS_REVISION + !exhausted → tech-design
  assert(gn("solution-challenge", scOut(needsRev)) === "tech-design", "valid NEEDS_REVISION → tech-design");

  // Case 7g: valid NEEDS_REVISION + exhausted → review
  assert(gn("solution-challenge", scOut(needsRevEx)) === "review", "valid exhausted NEEDS_REVISION → review");
  console.log("");

  // ═══ Test 8: Shadow artifact + graph ═══
  console.log("Test 8: Shadow artifact + graph");
  const r8 = await run("x", { executionGateway: fakeGateway, solutionChallengeMode: "shadow" });
  const s8 = r8.execution_trace.find((t) => t.node === "solution-challenge")?.output["solution_challenge"] as SolutionChallengeState | undefined;
  assert(s8?.artifactStatus === "shadow_only", "artifactStatus = shadow_only");
  assert(s8?.reportPath === null, "reportPath = null");
  const { getNode } = await import("../sdlc_graph/graph");
  assert(getNode("solution-challenge")?.order === 2, "order = 2");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
