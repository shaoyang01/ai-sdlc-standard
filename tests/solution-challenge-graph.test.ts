// Solution Challenge Validation Test
// ====================================
// Validates full state validation, missing-state rejection,
// and malformed-state handling.

import { run } from "../runtime";
import { createArtifact } from "../core/artifact";
import type { RuntimeExecutionGateway, RuntimeExecutorMap, SolutionChallengeState } from "../core/runtime-executors";
import type { ExecutionRequest, ExecutionResult } from "../execution/types";

function fakeReviewArtifact(requirementId: string) {
  return createArtifact({
    id: `${requirementId}:code-review:PASS:0`, requirementId,
    node: "code-review", type: "code_review",
    content: { status: "PASS", findings: [] }, agent: "codex", source: "execution_gateway",
  });
}

function fakePatchArtifact(requirementId: string) {
  return createArtifact({
    id: `${requirementId}:imp:cp:0`, requirementId,
    node: "implementation", type: "code_patch",
    content: { file: "src/fake.ts", patch: "export function f() { return true; }" },
    agent: "codex", source: "execution_gateway",
  });
}

const fakeGateway: RuntimeExecutionGateway = {
  async execute(req: ExecutionRequest): Promise<ExecutionResult> {
    if (req.type === "code_generation") {
      return { success: true, node: req.node, agent: req.agent, output: { result: "code_patch_generated" }, artifacts: [fakePatchArtifact(req.requirementId)] };
    }
    if (req.type === "code_review") {
      return { success: true, node: req.node, agent: req.agent, output: { result: "PASS", findings: [] }, artifacts: [fakeReviewArtifact(req.requirementId)] };
    }
    return { success: true, node: req.node, agent: req.agent, output: {}, artifacts: [] };
  },
};

function validState(overrides: Partial<SolutionChallengeState> = {}): SolutionChallengeState {
  return {
    mode: "INITIAL_CHALLENGE", currentCycle: 1, maxCycles: 2, exhausted: false,
    status: "READY_FOR_GATE", findingIds: [], reportPath: null,
    artifactStatus: "shadow_only",
    ...overrides,
  };
}

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }

  console.log("Solution Challenge Validation Test\n");

  // ═══ Test 1: Routing by status ═══
  console.log("Test 1: Routing by status");
  const { getNextNode: gn } = await import("../sdlc_graph/transitions");
  const scKey = (s: SolutionChallengeState) => ({ result: "FAIL", solution_challenge: s });

  assert(gn("solution-challenge", scKey(validState({ status: "NEEDS_REVISION", exhausted: false }))) === "tech-design", "NEEDS_REVISION + !exhausted → tech-design");
  assert(gn("solution-challenge", scKey(validState({ mode: "FOLLOW_UP_VERIFICATION", currentCycle: 2, status: "NEEDS_REVISION", exhausted: true }))) === "review", "NEEDS_REVISION + exhausted → review");
  assert(gn("solution-challenge", scKey(validState({ status: "READY_FOR_GATE" }))) === "review", "READY_FOR_GATE → review");
  console.log("");

  // ═══ Test 2: Missing solution_challenge → null ═══
  console.log("Test 2: Missing solution_challenge invalid");
  assert(gn("solution-challenge", { result: "PASS" }) === null, "no solution_challenge → null");
  assert(gn("solution-challenge", { result: "PASS", solution_challenge: undefined }) === null, "undefined solution_challenge → null");
  console.log("");

  // ═══ Test 3: Malformed states rejected by validator ═══
  console.log("Test 3: Malformed states rejected");
  const { normalizeSolutionChallengeOutput: norm } = await import("../core/runtime-executors");

  const rejectCases: Array<[string, unknown]> = [
    ["invalid mode", validState({ mode: "INVALID" as never })],
    ["currentCycle=3", validState({ currentCycle: 3 as never })],
    ["maxCycles=99", validState({ maxCycles: 99 as never })],
    ["invalid artifactStatus", validState({ artifactStatus: "UNKNOWN" as never })],
    ["findingIds not strings", validState({ findingIds: [123 as never] })],
    ["reportPath not string/null", validState({ reportPath: 123 as never })],
    ["cycle=1 + FOLLOW_UP", validState({ currentCycle: 1, mode: "FOLLOW_UP_VERIFICATION" })],
    ["cycle=2 + not exhausted", validState({ currentCycle: 2, exhausted: false })],
    ["invalid status", { status: "INVALID" }],
    ["missing status (empty)", {}],
  ];

  for (const [label, state] of rejectCases) {
    let rejected = false;
    try { norm({ solution_challenge: state }); } catch { rejected = true; }
    assert(rejected, `rejected: ${label}`);
  }
  console.log("");

  // ═══ Test 4: Normalization consistency ═══
  console.log("Test 4: Normalization consistency");
  const n4 = norm({ result: "PASS", solution_challenge: validState({ status: "NEEDS_REVISION", exhausted: false }) });
  assert(n4.result === "FAIL", "PASS+NEEDS_REVISION → FAIL");
  assert((n4.solution_challenge as SolutionChallengeState).status === "NEEDS_REVISION", "status preserved");
  console.log("");

  // ═══ Test 5: Malformed output in Runtime → review NOT called ═══
  console.log("Test 5: Malformed output → review not called");
  let reviewCalled5 = false;
  const badExec: RuntimeExecutorMap["solution-challenge"] = async () => ({
    node: "solution-challenge", skill: "sdlc-solution-challenger",
    result: "PASS", execution_source: "deterministic_shadow", executor_type: "shadow",
    fallback_used: false, fallback_reason: "none",
    solution_challenge: {}, // malformed: missing status
    blocking_count: 0, required_count: 0, non_blocking_count: 0, out_of_scope_count: 0,
    recommended_next_step: "PROCEED_TO_SOLUTION_REVIEWER", duration_ms: 0,
  });
  let errorCaught5 = false;
  let errorMsg5 = "";
  try {
    await run("build a login form", {
      executionGateway: fakeGateway, solutionChallengeMode: "shadow",
      executors: {
        "solution-challenge": badExec,
        "review": async () => { reviewCalled5 = true; return { node: "review", result: "PASS", reviewed_at: new Date().toISOString() }; },
      },
    });
  } catch (e) { errorCaught5 = true; errorMsg5 = String(e); }
  assert(errorCaught5, "error caught");
  assert(!reviewCalled5, "review executor was not called");
  assert(errorMsg5.includes("solution-challenge"), `error mentions solution-challenge: ${errorMsg5.slice(0, 60)}`);
  console.log("");

  // ═══ Test 6: Two-cycle exact counts + findingIds ═══
  console.log("Test 6: Two-cycle findingIds propagation");
  let callCount6 = 0;
  const metadata6: (SolutionChallengeState | undefined)[] = [];
  const twoCycleExec: RuntimeExecutorMap["solution-challenge"] = async (_ctx, execCtx) => {
    callCount6++;
    metadata6.push(execCtx?.metadata?.solutionChallenge);
    if (callCount6 > 2) {
      return { node: "solution-challenge", skill: "sdlc-solution-challenger", result: "PASS",
        execution_source: "deterministic_shadow", executor_type: "shadow", fallback_used: false, fallback_reason: "none",
        solution_challenge: validState({ mode: "FOLLOW_UP_VERIFICATION", currentCycle: 2, exhausted: true, status: "READY_FOR_GATE" }),
        blocking_count: 0, required_count: 0, non_blocking_count: 0, out_of_scope_count: 0, recommended_next_step: "PROCEED_TO_SOLUTION_REVIEWER", duration_ms: 0 };
    }
    const prev = execCtx?.metadata?.solutionChallenge;
    const c = (prev ? Math.min(prev.currentCycle + 1, 2) : 1) as 1 | 2;
    const e = c >= 2;
    const ids = callCount6 === 1 ? ["CH-001", "CH-002"] : (prev?.findingIds ?? []);
    return { node: "solution-challenge", skill: "sdlc-solution-challenger",
      result: "FAIL", execution_source: "deterministic_shadow", executor_type: "shadow",
      fallback_used: false, fallback_reason: "none",
      solution_challenge: validState({ mode: prev ? "FOLLOW_UP_VERIFICATION" : "INITIAL_CHALLENGE", currentCycle: c, exhausted: e, status: "NEEDS_REVISION", findingIds: ids, reportPath: null }),
      blocking_count: 1, required_count: 0, non_blocking_count: 0, out_of_scope_count: 0,
      recommended_next_step: e ? "ESCALATE_TO_SOLUTION_REVIEWER" : "RETURN_TO_SPECIFICATION_WRITER", duration_ms: 0 };
  };
  const r6 = await run("build a login form", {
    executionGateway: fakeGateway, solutionChallengeMode: "shadow",
    executors: { "solution-challenge": twoCycleExec, "review": async () => ({ node: "review", result: "PASS", reviewed_at: new Date().toISOString() }) },
  });
  assert(callCount6 === 2, `called twice (got ${callCount6})`);
  assert(metadata6[0] === undefined, "cycle 1: no prev metadata");
  assert(metadata6[1]?.findingIds?.includes("CH-001"), "cycle 2: findingIds has CH-001");
  assert(r6.final_status === "success", "runtime completes");
  console.log("");

  // ═══ Test 7: Shadow artifact ═══
  console.log("Test 7: Shadow artifact");
  const r7 = await run("build a login form", { executionGateway: fakeGateway, solutionChallengeMode: "shadow" });
  const s7 = r7.execution_trace.find((t) => t.node === "solution-challenge")?.output["solution_challenge"] as SolutionChallengeState | undefined;
  assert(s7?.artifactStatus === "shadow_only", "artifactStatus = shadow_only");
  assert(s7?.reportPath === null, "reportPath = null");
  console.log("");

  // ═══ Test 8: Graph structure ═══
  console.log("Test 8: Graph structure");
  const { getNode, getEdge } = await import("../sdlc_graph/graph");
  const { getTransitionPath: gtp } = await import("../sdlc_graph/transitions");
  assert(getNode("solution-challenge")?.order === 2, "order = 2");
  assert(getEdge("tech-design")?.to === "solution-challenge", "tech → challenge");
  assert(gtp().includes("solution-challenge"), "in transition path");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
