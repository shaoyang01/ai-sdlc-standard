// Solution Challenge Graph Integration Test
// ===========================================
// Validates unified SolutionChallengeState model,
// challenge cycle routing, and artifact semantics.

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

async function test() {
  let passed = 0, failed = 0;
  function assert(c: boolean, m: string) {
    if (c) { passed++; console.log(`  ✓ ${m}`); }
    else { failed++; console.error(`  ✗ ${m}`); }
  }

  console.log("Solution Challenge State Model Test\n");

  // ═══ Test 1: Disabled — challenge absent ═══
  console.log("Test 1: Disabled mode");
  const r1 = await run("build a login form", { executionGateway: fakeGateway, solutionChallengeMode: "disabled" });
  assert(!r1.execution_trace.some((t) => t.node === "solution-challenge"), "challenge absent when disabled");
  console.log("");

  // ═══ Test 2: Shadow mode — unified state model ═══
  console.log("Test 2: Unified state model in shadow mode");
  const r2 = await run("build a login form", { executionGateway: fakeGateway, solutionChallengeMode: "shadow" });
  const sc2 = r2.execution_trace.find((t) => t.node === "solution-challenge");
  const state2 = sc2?.output["solution_challenge"] as SolutionChallengeState | undefined;

  assert(state2 !== undefined, "solution_challenge state exists");
  assert(state2!.mode === "INITIAL_CHALLENGE", "mode = INITIAL_CHALLENGE");
  assert(state2!.currentCycle === 1, "currentCycle = 1");
  assert(state2!.maxCycles === 2, "maxCycles = 2");
  assert(state2!.exhausted === false, "exhausted = false");
  assert(state2!.status === "READY_FOR_GATE", "status = READY_FOR_GATE");
  assert(state2!.reportPath === null, "reportPath = null (not 'none' string)");
  console.log("");

  // ═══ Test 3: Agent metadata clarified ═══
  console.log("Test 3: Agent metadata");
  assert(sc2?.output["skill"] === "sdlc-solution-challenger", "skill name present");
  assert(sc2?.output["execution_source"] === "deterministic_shadow", "execution_source = deterministic_shadow");
  assert(sc2?.output["executor_type"] === "shadow", "executor_type = shadow");
  assert(sc2?.output["fallback_used"] === false, "fallback_used = false");
  // Old fields must not exist
  assert(sc2?.output["mode"] === undefined, "no top-level mode (in state now)");
  assert(sc2?.output["challenge_cycle"] === undefined, "no legacy challenge_cycle key");
  assert(sc2?.output["previous_finding_ids"] === undefined, "no legacy previous_finding_ids");
  assert(sc2?.output["report_path"] === undefined, "no top-level report_path (in state now)");
  console.log("");

  // ═══ Test 4: No previousChallenge legacy field ═══
  console.log("Test 4: No previousChallenge in metadata");
  // Verify source code doesn't use previousChallenge
  const fs = await import("fs");
  const runtimeSrc = fs.readFileSync("runtime.ts", "utf-8");
  const execCtxSrc = fs.readFileSync("core/execution-context.ts", "utf-8");
  assert(!runtimeSrc.includes("previousChallenge"), "runtime.ts: no previousChallenge");
  assert(!execCtxSrc.includes("previousChallenge"), "execution-context.ts: no previousChallenge");
  console.log("");

  // ═══ Test 5: Transition logic with new state key ═══
  console.log("Test 5: Transition logic");
  const { getNextNode: gn } = await import("../sdlc_graph/transitions");

  const stateFailNotExhausted: SolutionChallengeState = {
    mode: "INITIAL_CHALLENGE", currentCycle: 1, maxCycles: 2, exhausted: false,
    status: "NEEDS_REVISION", findingIds: ["CH-001"], reportPath: null,
  };
  const stateFailExhausted: SolutionChallengeState = {
    mode: "FOLLOW_UP_VERIFICATION", currentCycle: 2, maxCycles: 2, exhausted: true,
    status: "NEEDS_REVISION", findingIds: ["CH-001"], reportPath: null,
  };
  const statePass: SolutionChallengeState = {
    mode: "INITIAL_CHALLENGE", currentCycle: 1, maxCycles: 2, exhausted: false,
    status: "READY_FOR_GATE", findingIds: [], reportPath: null,
  };

  assert(gn("solution-challenge", { result: "FAIL", solution_challenge: stateFailNotExhausted }) === "tech-design", "FAIL + not exhausted → tech-design");
  assert(gn("solution-challenge", { result: "FAIL", solution_challenge: stateFailExhausted }) === "review", "FAIL + exhausted → review");
  assert(gn("solution-challenge", { result: "PASS", solution_challenge: statePass }) === "review", "PASS → review");
  console.log("");

  // ═══ Test 6: Shadow artifact semantics ═══
  console.log("Test 6: Artifact semantics");
  const scArtifact2 = r2.artifacts.find((a) => a.node === "solution-challenge");
  assert(scArtifact2 !== undefined, "artifact exists");
  assert(scArtifact2!.type === "solution_challenge", "artifact type = solution_challenge");
  // Shadow artifact should carry shadow context
  const artContent = scArtifact2!.content as Record<string, unknown>;
  const artState = artContent["solution_challenge"] as SolutionChallengeState | undefined;
  assert(artState !== undefined || artContent["execution_source"] === "deterministic_shadow", "shadow context in artifact");
  console.log("");

  // ═══ Test 7: Two-cycle Runtime with injected executor ═══
  console.log("Test 7: Two-cycle Runtime path");
  let callCount7 = 0;
  const twoCycleExec: RuntimeExecutorMap["solution-challenge"] = async (_ctx, execCtx) => {
    callCount7++;
    if (callCount7 > 2) {
      const state: SolutionChallengeState = { mode: "FOLLOW_UP_VERIFICATION", currentCycle: 2, maxCycles: 2, exhausted: true, status: "READY_FOR_GATE", findingIds: [], reportPath: null };
      return { node: "solution-challenge", skill: "sdlc-solution-challenger", result: "PASS", execution_source: "deterministic_shadow", executor_type: "shadow", fallback_used: false, fallback_reason: "none", solution_challenge: state, blocking_count: 0, required_count: 0, non_blocking_count: 0, out_of_scope_count: 0, recommended_next_step: "PROCEED_TO_SOLUTION_REVIEWER", duration_ms: 0 };
    }
    const prev = execCtx?.metadata?.solutionChallenge;
    const c = (prev ? Math.min(prev.currentCycle + 1, 2) : 1) as 1 | 2;
    const e = c >= 2;
    const state: SolutionChallengeState = {
      mode: prev ? "FOLLOW_UP_VERIFICATION" : "INITIAL_CHALLENGE",
      currentCycle: c, maxCycles: 2, exhausted: e,
      status: "NEEDS_REVISION", findingIds: ["CH-001"], reportPath: null,
    };
    return { node: "solution-challenge", skill: "sdlc-solution-challenger", result: "FAIL", execution_source: "deterministic_shadow", executor_type: "shadow", fallback_used: false, fallback_reason: "none", solution_challenge: state, blocking_count: 1, required_count: 0, non_blocking_count: 0, out_of_scope_count: 0, recommended_next_step: e ? "ESCALATE_TO_SOLUTION_REVIEWER" : "RETURN_TO_SPECIFICATION_WRITER", duration_ms: 0 };
  };

  const r7 = await run("build a login form", {
    executionGateway: fakeGateway, solutionChallengeMode: "shadow",
    executors: {
      "solution-challenge": twoCycleExec,
      "review": async () => ({ node: "review", result: "PASS", reviewed_at: new Date().toISOString() }),
    },
  });

  assert(callCount7 >= 1, "executor called");
  assert(r7.execution_trace.some((t) => t.node === "review"), "review reached");
  assert(r7.final_status === "success", "runtime completes");
  // Verify state key is solution_challenge (not challenge_cycle)
  const sc7 = r7.execution_trace.find((t) => t.node === "solution-challenge");
  assert(sc7?.output["solution_challenge"] !== undefined, "output uses solution_challenge key");
  assert(sc7?.output["challenge_cycle"] === undefined, "no legacy challenge_cycle key");
  console.log("");

  // ═══ Test 8: Graph structure ═══
  console.log("Test 8: Graph structure");
  const { getNode, getEdge } = await import("../sdlc_graph/graph");
  assert(getNode("solution-challenge")?.order === 2, "order = 2");
  assert(getEdge("tech-design")?.to === "solution-challenge", "tech → challenge");
  const { getTransitionPath } = await import("../sdlc_graph/transitions");
  const path = getTransitionPath();
  assert(path.includes("solution-challenge"), "in transition path");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
