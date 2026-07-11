// Solution Challenge Graph Integration Test
// ===========================================
// Validates the solution-challenge node in the Runtime graph.
// Uses fake/deterministic executors. No real agent calls.

import { run, RuntimeOptions } from "../runtime";
import { createArtifact } from "../core/artifact";
import type { RuntimeExecutionGateway, RuntimeExecutorMap } from "../core/runtime-executors";
import type { ExecutionRequest, ExecutionResult } from "../execution/types";

function fakeReviewArtifact(requirementId: string) {
  return createArtifact({
    id: `${requirementId}:code-review:PASS:0`,
    requirementId,
    node: "code-review",
    type: "code_review",
    content: { status: "PASS", findings: [] },
    agent: "codex",
    source: "execution_gateway",
  });
}

function fakePatchArtifact(requirementId: string) {
  return createArtifact({
    id: `${requirementId}:imp:cp:0`,
    requirementId,
    node: "implementation",
    type: "code_patch",
    content: { file: "src/fake-smoke.ts", patch: "export function fake() { return true; }" },
    agent: "codex",
    source: "execution_gateway",
  });
}

const fakeGateway: RuntimeExecutionGateway = {
  async execute(req: ExecutionRequest): Promise<ExecutionResult> {
    if (req.type === "code_generation") {
      return {
        success: true, node: req.node, agent: req.agent,
        output: { result: "code_patch_generated" },
        artifacts: [fakePatchArtifact(req.requirementId)],
      };
    }
    if (req.type === "code_review") {
      return {
        success: true, node: req.node, agent: req.agent,
        output: { result: "PASS", findings: [] },
        artifacts: [fakeReviewArtifact(req.requirementId)],
      };
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

  // ═══ Test 1: Graph order with solution-challenge in default (disabled) mode ═══
  console.log("Test 1: Default mode — solution-challenge not in trace (disabled)");
  const r1 = await run("build a simple login form", {
    executionGateway: fakeGateway,
    solutionChallengeMode: "disabled",
  });
  const nodes1 = r1.execution_trace.map((t) => t.node);
  assert(!nodes1.includes("solution-challenge"), "solution-challenge absent when disabled");
  assert(nodes1.includes("tech-design"), "tech-design present");
  assert(nodes1.includes("review"), "review present");
  console.log("");

  // ═══ Test 2: Solution-challenge in shadow mode — graph order ═══
  console.log("Test 2: Shadow mode — solution-challenge in trace");
  const r2 = await run("build a login form", {
    executionGateway: fakeGateway,
    solutionChallengeMode: "shadow",
  });
  const nodes2 = r2.execution_trace.map((t) => t.node);
  assert(nodes2.includes("solution-challenge"), "solution-challenge present in shadow mode");
  // Verify order: tech-design → solution-challenge → review
  const tdIdx2 = nodes2.indexOf("tech-design");
  const scIdx2 = nodes2.indexOf("solution-challenge");
  const rvIdx2 = nodes2.indexOf("review");
  assert(tdIdx2 < scIdx2, "tech-design before solution-challenge");
  assert(scIdx2 < rvIdx2, "solution-challenge before review");
  console.log("");

  // ═══ Test 3: Solution-challenge shadow result ═══
  console.log("Test 3: Shadow challenge produces deterministic metadata");
  const scTrace2 = r2.execution_trace.find((t) => t.node === "solution-challenge");
  assert(scTrace2 !== undefined, "solution-challenge trace exists");
  assert(scTrace2!.output["skill"] === "sdlc-solution-challenger", "skill name set");
  assert(scTrace2!.output["result"] === "PASS", "shadow default: READY_FOR_GATE (PASS)");
  assert(scTrace2!.output["execution_source"] === "deterministic", "execution source is deterministic");
  assert(scTrace2!.output["fallback_used"] === true, "fallback used in shadow mode");
  assert(scTrace2!.output["mode"] === "INITIAL_CHALLENGE", "mode is INITIAL_CHALLENGE");
  const cycle2 = scTrace2!.output["challenge_cycle"] as Record<string, unknown>;
  assert(cycle2 !== undefined, "challenge_cycle present");
  assert(cycle2.current_cycle === 1, "current_cycle = 1");
  assert(cycle2.max_cycles === 2, "max_cycles = 2");
  assert(cycle2.exhausted === false, "exhausted = false");
  console.log("");

  // ═══ Test 4: Challenge cycle fields and recommended next step ═══
  console.log("Test 4: Recommended next step and counts");
  assert(scTrace2!.output["blocking_count"] === 0, "blocking_count = 0");
  assert(scTrace2!.output["required_count"] === 0, "required_count = 0");
  assert(scTrace2!.output["recommended_next_step"] === "PROCEED_TO_SOLUTION_REVIEWER", "next step: proceed to review");
  console.log("");

  // ═══ Test 5: Full trace order with all 7 nodes ═══
  console.log("Test 5: Full trace order (7 nodes)");
  const r5 = await run("build a login form", {
    executionGateway: fakeGateway,
    solutionChallengeMode: "shadow",
  });
  const nodes5 = r5.execution_trace.map((t) => t.node);
  // Expected: requirement-summary → tech-design → solution-challenge → review → implementation → code-review → validation
  assert(nodes5.length >= 7, `at least 7 nodes (got ${nodes5.length})`);
  const expectedOrder = ["requirement-summary", "tech-design", "solution-challenge", "review"];
  for (let i = 0; i < expectedOrder.length - 1; i++) {
    const a = nodes5.indexOf(expectedOrder[i]);
    const b = nodes5.indexOf(expectedOrder[i + 1]);
    assert(a >= 0 && b >= 0 && a < b, `${expectedOrder[i]} → ${expectedOrder[i + 1]}`);
  }
  console.log("");

  // ═══ Test 6: final_status unchanged ═══
  console.log("Test 6: final_status");
  assert(r5.final_status === "success", "final_status is success");
  // implementation_outcome varies by gateway behavior; only assert it's set
  assert(typeof r5.implementation_outcome === "string" && r5.implementation_outcome.length > 0, "implementation_outcome is set");
  console.log("");

  // ═══ Test 7: Solution-challenge artifact produced ═══
  console.log("Test 7: Artifact type is solution_challenge");
  const scArtifact = r5.artifacts.find((a) => a.node === "solution-challenge");
  assert(scArtifact !== undefined, "solution-challenge artifact exists");
  if (scArtifact) {
    assert(scArtifact.type === "solution_challenge", `artifact type is solution_challenge (got ${scArtifact.type})`);
  }
  console.log("");

  // ═══ Test 8: Transition path includes solution-challenge ═══
  console.log("Test 8: Transition path validation");
  const { getTransitionPath } = await import("../sdlc_graph/transitions");
  const path = getTransitionPath();
  assert(path.includes("solution-challenge"), "transition path includes solution-challenge");
  const scTransIdx = path.indexOf("solution-challenge");
  assert(path.indexOf("tech-design") < scTransIdx, "tech-design before solution-challenge in path");
  assert(scTransIdx < path.indexOf("review"), "solution-challenge before review in path");
  console.log("");

  // ═══ Test 9: Node exists in graph ═══
  console.log("Test 9: Graph node and edge validation");
  const { getNode, getEdge } = await import("../sdlc_graph/graph");
  const scNode = getNode("solution-challenge");
  assert(scNode !== undefined, "solution-challenge node exists in graph");
  assert(scNode!.order === 2, "solution-challenge order is 2");
  const tdEdge = getEdge("tech-design");
  assert(tdEdge?.to === "solution-challenge", "tech-design → solution-challenge edge");
  const scEdge = getEdge("solution-challenge");
  assert(scEdge !== undefined, "solution-challenge has outgoing edge");
  console.log("");

  // ═══ Test 10: Agent map includes solution-challenge ═══
  console.log("Test 10: Agent mapping");
  const scAgent = scTrace2!.agent;
  assert(typeof scAgent === "string" && scAgent.length > 0, `agent assigned: ${scAgent}`);
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
