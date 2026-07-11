// Solution Challenge Transition + Validation Test
// ===============================================
// Validates throw-on-invalid semantics, artifact cross-field
// validation, and replay rejection of malformed state.

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

  console.log("Solution Challenge Transition + Validation Test\n");

  // ═══ Test 1: Valid routing ═══
  console.log("Test 1: Valid routing");
  const { getNextNode: gn, isValidTransition } = await import("../sdlc_graph/transitions");
  const scKey = (s: SolutionChallengeState) => ({ result: "FAIL", solution_challenge: s });

  assert(gn("solution-challenge", scKey(validState({ status: "NEEDS_REVISION", exhausted: false }))) === "tech-design", "NEEDS_REVISION + !exhausted → tech-design");
  assert(gn("solution-challenge", scKey(validState({ mode: "FOLLOW_UP_VERIFICATION", currentCycle: 2, status: "NEEDS_REVISION", exhausted: true }))) === "review", "NEEDS_REVISION + exhausted → review");
  assert(gn("solution-challenge", scKey(validState({ status: "READY_FOR_GATE" }))) === "review", "READY_FOR_GATE → review");
  assert(isValidTransition("solution-challenge", "review", scKey(validState({ status: "READY_FOR_GATE" }))), "valid transition reports true");
  console.log("");

  // ═══ Test 2: Missing/invalid state → throws ═══
  console.log("Test 2: Missing/invalid state throws");
  let t2a = false, t2b = false, t2c = false, t2d = false;
  try { gn("solution-challenge", { result: "PASS" }); } catch { t2a = true; }
  try { gn("solution-challenge", { result: "PASS", solution_challenge: undefined }); } catch { t2b = true; }
  try { gn("solution-challenge", { result: "PASS", solution_challenge: {} }); } catch { t2c = true; }
  try { gn("solution-challenge", scKey(validState({ status: "INVALID" as never }))); } catch { t2d = true; }
  assert(t2a, "missing solution_challenge throws");
  assert(t2b, "undefined solution_challenge throws");
  assert(t2c, "missing status throws");
  assert(t2d, "invalid status throws");

  // isValidTransition with malformed state → throws
  let t2e = false;
  try { isValidTransition("solution-challenge", "review", { result: "PASS" }); } catch { t2e = true; }
  assert(t2e, "malformed input throws from isValidTransition");
  console.log("");

  // ═══ Test 3: Malformed states rejected by validator ═══
  console.log("Test 3: Malformed states rejected");
  const { normalizeSolutionChallengeOutput: norm } = await import("../core/runtime-executors");
  const rejects = [
    ["invalid mode", validState({ mode: "INVALID" as never })],
    ["currentCycle=3", validState({ currentCycle: 3 as never })],
    ["maxCycles=99", validState({ maxCycles: 99 as never })],
    ["invalid artifactStatus", validState({ artifactStatus: "UNKNOWN" as never })],
    ["findingIds not strings", validState({ findingIds: [123 as never] })],
    ["reportPath not string/null", validState({ reportPath: 123 as never })],
    ["cycle=1 + FOLLOW_UP", validState({ currentCycle: 1, mode: "FOLLOW_UP_VERIFICATION" })],
    ["cycle=2 + not exhausted", validState({ currentCycle: 2, exhausted: false })],
  ];
  for (const [label, st] of rejects) {
    let r = false; try { norm({ solution_challenge: st }); } catch { r = true; }
    assert(r, `rejected: ${label}`);
  }
  console.log("");

  // ═══ Test 4: Artifact cross-field validation ═══
  console.log("Test 4: Artifact cross-field validation");
  // shadow_only + reportPath non-null → rejected
  let t4a = false;
  try { norm({ solution_challenge: validState({ artifactStatus: "shadow_only", reportPath: "/some/path" }) }); } catch { t4a = true; }
  assert(t4a, "shadow_only + reportPath string → rejected");

  // generated + reportPath null → rejected
  let t4b = false;
  try { norm({ solution_challenge: validState({ artifactStatus: "generated" as never, reportPath: null }) }); } catch { t4b = true; }
  assert(t4b, "generated + reportPath null → rejected");

  // generated + reportPath empty → rejected
  let t4c = false;
  try { norm({ solution_challenge: validState({ artifactStatus: "generated" as never, reportPath: "" }) }); } catch { t4c = true; }
  assert(t4c, "generated + reportPath empty → rejected");

  // generated + valid path → accepted
  let t4d = false;
  try { norm({ solution_challenge: validState({ artifactStatus: "generated" as never, reportPath: "library/REQ/report.md" }) }); t4d = true; } catch { }
  assert(t4d, "generated + valid path → accepted");
  console.log("");

  // ═══ Test 5: Normalization consistency ═══
  console.log("Test 5: Normalization consistency");
  const n5 = norm({ result: "PASS", solution_challenge: validState({ status: "NEEDS_REVISION", exhausted: false }) });
  assert(n5.result === "FAIL", "PASS+NEEDS_REVISION → FAIL");
  console.log("");

  // ═══ Test 6: Malformed output → review not called ═══
  console.log("Test 6: Malformed output → review not called");
  let reviewCalled6 = false;
  let error6 = false, msg6 = "";
  try {
    await run("build a login form", {
      executionGateway: fakeGateway, solutionChallengeMode: "shadow",
      executors: {
        "solution-challenge": async () => ({ node: "solution-challenge", skill: "sdlc-solution-challenger", result: "PASS", execution_source: "deterministic_shadow", executor_type: "shadow", fallback_used: false, fallback_reason: "none", solution_challenge: {}, blocking_count: 0, required_count: 0, non_blocking_count: 0, out_of_scope_count: 0, recommended_next_step: "PROCEED_TO_SOLUTION_REVIEWER", duration_ms: 0 }),
        "review": async () => { reviewCalled6 = true; return { node: "review", result: "PASS", reviewed_at: new Date().toISOString() }; },
      },
    });
  } catch (e) { error6 = true; msg6 = String(e); }
  assert(error6, "error caught");
  assert(!reviewCalled6, "review not called");
  assert(msg6.includes("solution-challenge"), "error identifies solution-challenge");
  console.log("");

  // ═══ Test 7: isValidTransition with malformed state → false ═══
  console.log("Test 7: isValidTransition rejects malformed");
  let t7a = false, t7b = false;
  try { isValidTransition("solution-challenge", "review", { result: "PASS" }); } catch { t7a = true; }
  try { isValidTransition("solution-challenge", "review", scKey(validState({ status: "INVALID" as never }))); } catch { t7b = true; }
  assert(t7a, "missing state throws from isValidTransition");
  assert(t7b, "invalid status throws from isValidTransition");
  console.log("");

  // ═══ Test 8: Two-cycle exact counts ═══
  console.log("Test 8: Two-cycle findingIds propagation");
  let callCount8 = 0;
  const meta8: (SolutionChallengeState | undefined)[] = [];
  const exec8: RuntimeExecutorMap["solution-challenge"] = async (_ctx, execCtx) => {
    callCount8++;
    meta8.push(execCtx?.metadata?.solutionChallenge);
    if (callCount8 > 2) return { node: "solution-challenge", skill: "sdlc-solution-challenger", result: "PASS", execution_source: "deterministic_shadow", executor_type: "shadow", fallback_used: false, fallback_reason: "none", solution_challenge: validState({ mode: "FOLLOW_UP_VERIFICATION", currentCycle: 2, exhausted: true, status: "READY_FOR_GATE" }), blocking_count: 0, required_count: 0, non_blocking_count: 0, out_of_scope_count: 0, recommended_next_step: "PROCEED_TO_SOLUTION_REVIEWER", duration_ms: 0 };
    const prev = execCtx?.metadata?.solutionChallenge;
    const c = (prev ? Math.min(prev.currentCycle + 1, 2) : 1) as 1 | 2;
    const e = c >= 2;
    const ids = callCount8 === 1 ? ["CH-001"] : (prev?.findingIds ?? []);
    return { node: "solution-challenge", skill: "sdlc-solution-challenger", result: "FAIL", execution_source: "deterministic_shadow", executor_type: "shadow", fallback_used: false, fallback_reason: "none", solution_challenge: validState({ mode: prev ? "FOLLOW_UP_VERIFICATION" : "INITIAL_CHALLENGE", currentCycle: c, exhausted: e, status: "NEEDS_REVISION", findingIds: ids, reportPath: null }), blocking_count: 1, required_count: 0, non_blocking_count: 0, out_of_scope_count: 0, recommended_next_step: e ? "ESCALATE_TO_SOLUTION_REVIEWER" : "RETURN_TO_SPECIFICATION_WRITER", duration_ms: 0 };
  };
  const r8 = await run("build a login form", { executionGateway: fakeGateway, solutionChallengeMode: "shadow", executors: { "solution-challenge": exec8, "review": async () => ({ node: "review", result: "PASS", reviewed_at: new Date().toISOString() }) } });
  assert(callCount8 === 2, `called twice (got ${callCount8})`);
  assert(meta8[1]?.findingIds?.includes("CH-001"), "cycle 2 has CH-001");
  assert(r8.final_status === "success", "runtime completes");
  console.log("");

  // ═══ Test 9: Shadow artifact + graph ═══
  console.log("Test 9: Shadow artifact + graph");
  const r9 = await run("build a login form", { executionGateway: fakeGateway, solutionChallengeMode: "shadow" });
  const s9 = r9.execution_trace.find((t) => t.node === "solution-challenge")?.output["solution_challenge"] as SolutionChallengeState | undefined;
  assert(s9?.artifactStatus === "shadow_only", "artifactStatus = shadow_only");
  assert(s9?.reportPath === null, "reportPath = null");
  const { getNode } = await import("../sdlc_graph/graph");
  assert(getNode("solution-challenge")?.order === 2, "order = 2");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
