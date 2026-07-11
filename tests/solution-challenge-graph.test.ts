// Solution Challenge Graph Integration Test
// ===========================================
// Validates challenge cycle routing, state persistence,
// and independence from review retryCount.

import { run } from "../runtime";
import { createArtifact } from "../core/artifact";
import type { RuntimeExecutionGateway, RuntimeExecutorMap } from "../core/runtime-executors";
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

  console.log("Solution Challenge Graph Integration Test\n");

  // ═══ Test 1: Disabled — challenge absent ═══
  console.log("Test 1: Disabled mode");
  const r1 = await run("build a login form", { executionGateway: fakeGateway, solutionChallengeMode: "disabled" });
  assert(!r1.execution_trace.some((t) => t.node === "solution-challenge"), "challenge absent when disabled");
  console.log("");

  // ═══ Test 2: Shadow mode — graph order ═══
  console.log("Test 2: Shadow mode graph order");
  const r2 = await run("build a login form", { executionGateway: fakeGateway, solutionChallengeMode: "shadow" });
  const nodes2 = r2.execution_trace.map((t) => t.node);
  assert(nodes2.includes("solution-challenge"), "challenge present");
  assert(nodes2.indexOf("tech-design") < nodes2.indexOf("solution-challenge"), "tech before challenge");
  assert(nodes2.indexOf("solution-challenge") < nodes2.indexOf("review"), "challenge before review");
  console.log("");

  // ═══ Test 3: Shadow metadata ═══
  console.log("Test 3: Shadow metadata");
  const sc2 = r2.execution_trace.find((t) => t.node === "solution-challenge");
  assert(sc2?.output["execution_source"] === "deterministic_shadow", "execution_source = deterministic_shadow");
  assert(sc2?.output["fallback_used"] === false, "fallback_used = false");
  assert(sc2?.output["fallback_reason"] === "none", "fallback_reason = none");
  assert(sc2?.output["skill"] === "sdlc-solution-challenger", "skill name set");
  assert(sc2?.output["mode"] === "INITIAL_CHALLENGE", "INITIAL_CHALLENGE");
  const cyc2 = sc2!.output["challenge_cycle"] as Record<string, unknown>;
  assert(cyc2.current_cycle === 1, "current_cycle = 1");
  assert(cyc2.max_cycles === 2, "max_cycles = 2");
  assert(cyc2.exhausted === false, "exhausted = false");
  console.log("");

  // ═══ Test 4: Transition logic (direct, no Runtime loop) ═══
  console.log("Test 4: Transition logic");
  const { getNextNode: gn } = await import("../sdlc_graph/transitions");

  // Cycle 1: FAIL, not exhausted → tech-design
  assert(gn("solution-challenge", { result: "FAIL", challenge_cycle: { current_cycle: 1, max_cycles: 2, exhausted: false } }) === "tech-design", "FAIL + not exhausted → tech-design");

  // Cycle 2: FAIL, exhausted → review
  assert(gn("solution-challenge", { result: "FAIL", challenge_cycle: { current_cycle: 2, max_cycles: 2, exhausted: true } }) === "review", "FAIL + exhausted → review");

  // PASS → review
  assert(gn("solution-challenge", { result: "PASS", challenge_cycle: { current_cycle: 1, max_cycles: 2, exhausted: false } }) === "review", "PASS → review");

  // Challenge independent from retryCount
  assert(gn("solution-challenge", { result: "FAIL", challenge_cycle: { current_cycle: 1, max_cycles: 2, exhausted: false } }, 99) === "tech-design", "large retryCount: still → tech-design");
  assert(gn("solution-challenge", { result: "FAIL", challenge_cycle: { current_cycle: 2, max_cycles: 2, exhausted: true } }, 99) === "review", "exhausted + large retryCount: → review");
  console.log("");

  // ═══ Test 5: Two-cycle Runtime path ═══
  console.log("Test 5: Two-cycle Runtime path");

  let callCount5 = 0;
  const twoCycleExec: RuntimeExecutorMap["solution-challenge"] = async (_ctx, execCtx) => {
    callCount5++;
    if (callCount5 > 2) {
      return { node: "solution-challenge", skill: "sdlc-solution-challenger", mode: "INITIAL_CHALLENGE",
        result: "PASS", execution_source: "deterministic_shadow", fallback_used: false, fallback_reason: "none",
        challenge_cycle: { current_cycle: 2, max_cycles: 2, exhausted: true },
        blocking_count: 0, required_count: 0, non_blocking_count: 0, out_of_scope_count: 0,
        remaining_finding_ids: [], recommended_next_step: "PROCEED_TO_SOLUTION_REVIEWER",
        report_path: "none", duration_ms: 0,
      };
    }
    const prev = execCtx?.metadata?.previousChallenge;
    const prevCycle = prev?.cycle;
    const c = (prevCycle ? Math.min(prevCycle.currentCycle + 1, 2) : 1) as 1 | 2;
    const e = c >= 2;
    return { node: "solution-challenge", skill: "sdlc-solution-challenger",
      mode: prevCycle ? "FOLLOW_UP_VERIFICATION" : "INITIAL_CHALLENGE", result: "FAIL",
      execution_source: "deterministic_shadow", fallback_used: false, fallback_reason: "none",
      challenge_cycle: { current_cycle: c, max_cycles: 2, exhausted: e },
      blocking_count: 1, required_count: 0, non_blocking_count: 0, out_of_scope_count: 0,
      remaining_finding_ids: [], recommended_next_step: e ? "ESCALATE_TO_SOLUTION_REVIEWER" : "RETURN_TO_SPECIFICATION_WRITER",
      report_path: "none", duration_ms: 0,
    };
  };

  const r5 = await run("build a login form", {
    executionGateway: fakeGateway, solutionChallengeMode: "shadow",
    executors: {
      "solution-challenge": twoCycleExec,
      "review": async () => ({ node: "review", result: "PASS", reviewed_at: new Date().toISOString() }),
    },
  });

  assert(callCount5 >= 1, "executor called");
  assert(r5.execution_trace.some((t) => t.node === "review"), "review reached");
  assert(r5.final_status === "success", "runtime completes");
  console.log("");

  // ═══ Test 6: Graph structure ═══
  console.log("Test 6: Graph structure");
  const { getNode, getEdge } = await import("../sdlc_graph/graph");
  assert(getNode("solution-challenge")?.order === 2, "challenge order = 2");
  assert(getEdge("tech-design")?.to === "solution-challenge", "tech → challenge");
  assert(getEdge("solution-challenge") !== undefined, "challenge has outgoing edge");
  console.log("");

  // ═══ Test 7: Transition path ═══
  console.log("Test 7: Transition path");
  const { getTransitionPath } = await import("../sdlc_graph/transitions");
  const path = getTransitionPath();
  assert(path.includes("solution-challenge"), "path includes challenge");
  assert(path.indexOf("tech-design") < path.indexOf("solution-challenge"), "order correct");
  assert(path.indexOf("solution-challenge") < path.indexOf("review"), "order correct");
  console.log("");

  // ═══ Test 8: final_status / implementation_outcome ═══
  console.log("Test 8: final_status / implementation_outcome");
  assert(r5.final_status === "success", "final_status = success");
  assert(typeof r5.implementation_outcome === "string" && r5.implementation_outcome.length > 0, "outcome set");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
