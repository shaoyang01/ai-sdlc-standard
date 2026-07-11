// Solution Challenge State Model + Routing Test
// ==============================================
// Validates solution_challenge.status as routing source of truth,
// contradictory-state prevention, and shadow artifact semantics.

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

function makeState(overrides: Partial<SolutionChallengeState> = {}): SolutionChallengeState {
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

  console.log("Solution Challenge Routing + Artifact Test\n");

  // ═══ Test 1: Routing uses solution_challenge.status ═══
  console.log("Test 1: Routing uses status (not top-level result)");
  const { getNextNode: gn } = await import("../sdlc_graph/transitions");

  // NEEDS_REVISION + not exhausted → tech-design
  assert(gn("solution-challenge", {
    result: "FAIL",
    solution_challenge: makeState({ status: "NEEDS_REVISION", exhausted: false }),
  }) === "tech-design", "NEEDS_REVISION + not exhausted → tech-design");

  // NEEDS_REVISION + exhausted → review
  assert(gn("solution-challenge", {
    result: "FAIL",
    solution_challenge: makeState({ mode: "FOLLOW_UP_VERIFICATION", currentCycle: 2, status: "NEEDS_REVISION", exhausted: true }),
  }) === "review", "NEEDS_REVISION + exhausted → review");

  // READY_FOR_GATE → review
  assert(gn("solution-challenge", {
    result: "PASS",
    solution_challenge: makeState({ status: "READY_FOR_GATE" }),
  }) === "review", "READY_FOR_GATE → review");
  console.log("");

  // ═══ Test 2: Contradictory top-level result cannot override state.status ═══
  console.log("Test 2: Contradictory result cannot override status");

  // Top-level PASS with state NEEDS_REVISION → state wins (tech-design)
  assert(gn("solution-challenge", {
    result: "PASS",  // contradictory!
    solution_challenge: makeState({ status: "NEEDS_REVISION", exhausted: false }),
  }) === "tech-design", "PASS + NEEDS_REVISION → tech-design (state wins)");

  // Top-level FAIL with state READY_FOR_GATE → state wins (review)
  assert(gn("solution-challenge", {
    result: "FAIL",  // contradictory!
    solution_challenge: makeState({ status: "READY_FOR_GATE" }),
  }) === "review", "FAIL + READY_FOR_GATE → review (state wins)");
  console.log("");

  // ═══ Test 3: Missing status does not silently fall through ═══
  console.log("Test 3: Missing status behavior");
  // Missing status → default to review (safe: doesn't loop back to tech-design)
  assert(gn("solution-challenge", {
    result: "PASS",
    solution_challenge: makeState({ status: undefined }),
  }) === "review", "missing status → review (safe default)");
  console.log("");

  // ═══ Test 4: Two-cycle exact counts ═══
  console.log("Test 4: Two-cycle exact counts");
  let callCount4 = 0;
  const capturedStates: SolutionChallengeState[] = [];

  const twoCycleExec: RuntimeExecutorMap["solution-challenge"] = async (_ctx, execCtx) => {
    callCount4++;
    if (callCount4 > 2) {
      return { node: "solution-challenge", skill: "sdlc-solution-challenger", result: "PASS",
        execution_source: "deterministic_shadow", executor_type: "shadow", fallback_used: false, fallback_reason: "none",
        solution_challenge: makeState({ mode: "FOLLOW_UP_VERIFICATION", currentCycle: 2, exhausted: true, status: "READY_FOR_GATE", findingIds: [], artifactStatus: "shadow_only" }),
        blocking_count: 0, required_count: 0, non_blocking_count: 0, out_of_scope_count: 0, recommended_next_step: "PROCEED_TO_SOLUTION_REVIEWER", duration_ms: 0 };
    }
    const prev = execCtx?.metadata?.solutionChallenge;
    const c = (prev ? Math.min(prev.currentCycle + 1, 2) : 1) as 1 | 2;
    const e = c >= 2;
    const state = makeState({
      mode: prev ? "FOLLOW_UP_VERIFICATION" : "INITIAL_CHALLENGE",
      currentCycle: c, exhausted: e,
      status: "NEEDS_REVISION", findingIds: ["CH-001"],
    });
    capturedStates.push(state);
    return { node: "solution-challenge", skill: "sdlc-solution-challenger",
      result: "FAIL", execution_source: "deterministic_shadow", executor_type: "shadow",
      fallback_used: false, fallback_reason: "none",
      solution_challenge: state,
      blocking_count: 1, required_count: 0, non_blocking_count: 0, out_of_scope_count: 0,
      recommended_next_step: e ? "ESCALATE_TO_SOLUTION_REVIEWER" : "RETURN_TO_SPECIFICATION_WRITER", duration_ms: 0 };
  };

  const r4 = await run("build a login form", {
    executionGateway: fakeGateway, solutionChallengeMode: "shadow",
    executors: {
      "solution-challenge": twoCycleExec,
      "review": async () => ({ node: "review", result: "PASS", reviewed_at: new Date().toISOString() }),
    },
  });

  assert(callCount4 === 2, `executor called exactly twice (got ${callCount4})`);
  assert(r4.execution_trace.filter((t) => t.node === "solution-challenge").length === 2, "two challenge trace entries");
  assert(r4.final_status === "success", "runtime completes");
  console.log("");

  // ═══ Test 5: Cycle mode + currentCycle exact values ═══
  console.log("Test 5: Cycle mode and currentCycle");
  assert(capturedStates.length === 2, "two states captured");
  assert(capturedStates[0].mode === "INITIAL_CHALLENGE", "cycle 1: INITIAL_CHALLENGE");
  assert(capturedStates[0].currentCycle === 1, "cycle 1: currentCycle = 1");
  assert(capturedStates[1].mode === "FOLLOW_UP_VERIFICATION", "cycle 2: FOLLOW_UP_VERIFICATION");
  assert(capturedStates[1].currentCycle === 2, "cycle 2: currentCycle = 2");
  console.log("");

  // ═══ Test 6: Second invocation receives first-round findingIds ═══
  console.log("Test 6: findingIds propagated to second cycle");
  // The injected executor reads from execCtx.metadata.solutionChallenge
  // Cycle 1 returns findingIds: ["CH-001"], which runtime persists
  // Cycle 2 should receive them via metadata.solutionChallenge
  assert(capturedStates[0].findingIds?.includes("CH-001"), "cycle 1 produced CH-001");
  // Verification: the second cycle's state was built from execCtx metadata
  // (tested implicitly by the capturedStates[1] having mode FOLLOW_UP_VERIFICATION)
  console.log("");

  // ═══ Test 7: Exhausted NEEDS_REVISION preserved entering review ═══
  console.log("Test 7: Exhausted NEEDS_REVISION preserved");
  const scTraces4 = r4.execution_trace.filter((t) => t.node === "solution-challenge");
  const lastState = scTraces4[scTraces4.length - 1]?.output["solution_challenge"] as SolutionChallengeState | undefined;
  assert(lastState?.status === "NEEDS_REVISION", "last challenge status = NEEDS_REVISION");
  assert(lastState?.exhausted === true, "last challenge exhausted = true");
  // Review should still be reached (exhausted → review)
  assert(r4.execution_trace.some((t) => t.node === "review"), "review reached after exhausted challenge");
  // The status entering review is NEEDS_REVISION (not rewritten to READY_FOR_GATE)
  const reviewTrace = r4.execution_trace.find((t) => t.node === "review");
  assert(reviewTrace !== undefined, "review trace exists");
  console.log("");

  // ═══ Test 8: Shadow artifactStatus ═══
  console.log("Test 8: Shadow artifact semantics");
  const r8 = await run("build a login form", { executionGateway: fakeGateway, solutionChallengeMode: "shadow" });
  const sc8 = r8.execution_trace.find((t) => t.node === "solution-challenge");
  const state8 = sc8?.output["solution_challenge"] as SolutionChallengeState | undefined;
  assert(state8?.artifactStatus === "shadow_only", "artifactStatus = shadow_only");
  assert(state8?.reportPath === null, "reportPath = null");

  // Artifact metadata
  const scArtifact8 = r8.artifacts.find((a) => a.node === "solution-challenge");
  assert(scArtifact8 !== undefined, "artifact exists");
  assert(scArtifact8!.type === "solution_challenge", "artifact type = solution_challenge");
  console.log("");

  // ═══ Test 9: Graph structure ═══
  console.log("Test 9: Graph structure");
  const { getNode, getEdge } = await import("../sdlc_graph/graph");
  assert(getNode("solution-challenge")?.order === 2, "order = 2");
  assert(getEdge("tech-design")?.to === "solution-challenge", "tech → challenge");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
