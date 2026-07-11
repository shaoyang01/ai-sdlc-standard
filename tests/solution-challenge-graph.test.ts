// Solution Challenge Normalization + Routing Test
// ================================================
// Validates output normalization, required status,
// contradictory-state prevention, and findingIds propagation.

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

  console.log("Solution Challenge Normalization Test\n");

  // ═══ Test 1: Routing by status ═══
  console.log("Test 1: Routing by status");
  const { getNextNode: gn } = await import("../sdlc_graph/transitions");

  assert(gn("solution-challenge", {
    result: "FAIL",
    solution_challenge: makeState({ status: "NEEDS_REVISION", exhausted: false }),
  }) === "tech-design", "NEEDS_REVISION + !exhausted → tech-design");

  assert(gn("solution-challenge", {
    result: "FAIL",
    solution_challenge: makeState({ mode: "FOLLOW_UP_VERIFICATION", currentCycle: 2, status: "NEEDS_REVISION", exhausted: true }),
  }) === "review", "NEEDS_REVISION + exhausted → review");

  assert(gn("solution-challenge", {
    result: "PASS",
    solution_challenge: makeState({ status: "READY_FOR_GATE" }),
  }) === "review", "READY_FOR_GATE → review");
  console.log("");

  // ═══ Test 2: Normalization enforces consistency ═══
  console.log("Test 2: Normalization makes contradictory output consistent");
  const { normalizeSolutionChallengeOutput: norm } = await import("../core/runtime-executors");

  // Contradictory: PASS + NEEDS_REVISION → normalized to FAIL
  const n2a = norm({
    result: "PASS",
    solution_challenge: makeState({ status: "NEEDS_REVISION", exhausted: false }),
  });
  assert(n2a.result === "FAIL", "PASS + NEEDS_REVISION → normalized result = FAIL");
  const s2a = n2a.solution_challenge as SolutionChallengeState;
  assert(s2a.status === "NEEDS_REVISION", "status unchanged");

  // Contradictory: FAIL + READY_FOR_GATE → normalized to PASS
  const n2b = norm({
    result: "FAIL",
    solution_challenge: makeState({ status: "READY_FOR_GATE" }),
  });
  assert(n2b.result === "PASS", "FAIL + READY_FOR_GATE → normalized result = PASS");
  const s2b = n2b.solution_challenge as SolutionChallengeState;
  assert(s2b.status === "READY_FOR_GATE", "status unchanged");

  // Already consistent: no change
  const n2c = norm({
    result: "FAIL",
    solution_challenge: makeState({ status: "NEEDS_REVISION", exhausted: false }),
  });
  assert(n2c.result === "FAIL", "FAIL + NEEDS_REVISION → still FAIL");
  console.log("");

  // ═══ Test 3: Malformed output rejected ═══
  console.log("Test 3: Malformed output rejected");
  let rejected3 = false;
  try { norm({ solution_challenge: { status: "INVALID" } }); } catch { rejected3 = true; }
  assert(rejected3, "invalid status rejected");

  let rejected3b = false;
  try { norm({ solution_challenge: {} }); } catch { rejected3b = true; }
  assert(rejected3b, "missing status rejected");

  let rejected3c = false;
  try { norm({}); } catch { rejected3c = true; }
  assert(rejected3c, "missing solution_challenge rejected");
  console.log("");

  // ═══ Test 4: Malformed output in Runtime does not reach review ═══
  console.log("Test 4: Malformed output in Runtime → error, not review");
  const badExec: RuntimeExecutorMap["solution-challenge"] = async () => ({
    node: "solution-challenge", skill: "sdlc-solution-challenger",
    result: "PASS", execution_source: "deterministic_shadow", executor_type: "shadow",
    fallback_used: false, fallback_reason: "none",
    solution_challenge: {}, // missing status — will fail validation
    blocking_count: 0, required_count: 0, non_blocking_count: 0, out_of_scope_count: 0,
    recommended_next_step: "PROCEED_TO_SOLUTION_REVIEWER", duration_ms: 0,
  });
  let errorCaught4 = false;
  try {
    await run("build a login form", {
      executionGateway: fakeGateway, solutionChallengeMode: "shadow",
      executors: { "solution-challenge": badExec,
        "review": async () => ({ node: "review", result: "PASS", reviewed_at: new Date().toISOString() }),
      },
    });
  } catch { errorCaught4 = true; }
  assert(errorCaught4, "malformed output causes error, not silent review");
  console.log("");

  // ═══ Test 5: Two-cycle with findingIds propagation ═══
  console.log("Test 5: Two-cycle findingIds propagation");
  let callCount5 = 0;
  const capturedMetadata5: (SolutionChallengeState | undefined)[] = [];
  const sentFindingIds5 = ["CH-001", "CH-002"];

  const twoCycleExec: RuntimeExecutorMap["solution-challenge"] = async (_ctx, execCtx) => {
    callCount5++;
    const prev = execCtx?.metadata?.solutionChallenge;
    capturedMetadata5.push(prev);

    if (callCount5 > 2) {
      return { node: "solution-challenge", skill: "sdlc-solution-challenger", result: "PASS",
        execution_source: "deterministic_shadow", executor_type: "shadow", fallback_used: false, fallback_reason: "none",
        solution_challenge: makeState({ mode: "FOLLOW_UP_VERIFICATION", currentCycle: 2, exhausted: true, status: "READY_FOR_GATE" }),
        blocking_count: 0, required_count: 0, non_blocking_count: 0, out_of_scope_count: 0, recommended_next_step: "PROCEED_TO_SOLUTION_REVIEWER", duration_ms: 0 };
    }

    const c = (prev ? Math.min(prev.currentCycle + 1, 2) : 1) as 1 | 2;
    const e = c >= 2;
    // Cycle 2 receives Cycle 1's findingIds from metadata
    const fIds = callCount5 === 1 ? sentFindingIds5 : (prev?.findingIds ?? []);
    const state = makeState({
      mode: prev ? "FOLLOW_UP_VERIFICATION" : "INITIAL_CHALLENGE",
      currentCycle: c, exhausted: e,
      status: "NEEDS_REVISION", findingIds: fIds,
    });
    return { node: "solution-challenge", skill: "sdlc-solution-challenger",
      result: "FAIL", execution_source: "deterministic_shadow", executor_type: "shadow",
      fallback_used: false, fallback_reason: "none",
      solution_challenge: state,
      blocking_count: 1, required_count: 0, non_blocking_count: 0, out_of_scope_count: 0,
      recommended_next_step: e ? "ESCALATE_TO_SOLUTION_REVIEWER" : "RETURN_TO_SPECIFICATION_WRITER", duration_ms: 0 };
  };

  const r5 = await run("build a login form", {
    executionGateway: fakeGateway, solutionChallengeMode: "shadow",
    executors: {
      "solution-challenge": twoCycleExec,
      "review": async () => ({ node: "review", result: "PASS", reviewed_at: new Date().toISOString() }),
    },
  });

  assert(callCount5 === 2, `executor called exactly twice (got ${callCount5})`);
  // Cycle 1 metadata: should be undefined (first call)
  assert(capturedMetadata5[0] === undefined, "cycle 1: no previous metadata");
  // Cycle 2 metadata: should contain Cycle 1's findingIds
  assert(capturedMetadata5[1] !== undefined, "cycle 2: previous metadata exists");
  assert(capturedMetadata5[1]!.findingIds?.includes("CH-001") === true, "cycle 2: findingIds contains CH-001");
  assert(capturedMetadata5[1]!.findingIds?.includes("CH-002") === true, "cycle 2: findingIds contains CH-002");
  assert(r5.final_status === "success", "runtime completes");
  console.log("");

  // ═══ Test 6: Trace status matches normalized result ═══
  console.log("Test 6: Trace status matches normalized result");
  const r6 = await run("build a login form", { executionGateway: fakeGateway, solutionChallengeMode: "shadow" });
  const sc6 = r6.execution_trace.find((t) => t.node === "solution-challenge");
  assert(sc6?.output["result"] === "PASS", "shadow result = PASS");
  // result is derived from status (READY_FOR_GATE → PASS)
  const s6 = sc6!.output["solution_challenge"] as SolutionChallengeState;
  assert(s6.status === "READY_FOR_GATE", "status = READY_FOR_GATE");
  // Verify internal consistency: result must match status
  const derivedResult = s6.status === "NEEDS_REVISION" ? "FAIL" : "PASS";
  assert(sc6!.output["result"] === derivedResult, `result (${sc6!.output["result"]}) matches derived (${derivedResult})`);
  console.log("");

  // ═══ Test 7: Shadow artifact status ═══
  console.log("Test 7: Shadow artifact status");
  const sc7 = r6.execution_trace.find((t) => t.node === "solution-challenge");
  const s7 = sc7?.output["solution_challenge"] as SolutionChallengeState | undefined;
  assert(s7?.artifactStatus === "shadow_only", "artifactStatus = shadow_only");
  assert(s7?.reportPath === null, "reportPath = null");
  console.log("");

  // ═══ Test 8: Graph structure ═══
  console.log("Test 8: Graph structure");
  const { getNode, getEdge } = await import("../sdlc_graph/graph");
  assert(getNode("solution-challenge")?.order === 2, "order = 2");
  assert(getEdge("tech-design")?.to === "solution-challenge", "tech → challenge");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
