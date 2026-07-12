// Solution Challenge Shared Validation + Replay Test
// ===================================================
// Validates shared validator across Graph transitions,
// Runtime normalization, and replayExecution.

import { run } from "../runtime";
import { createArtifact } from "../core/artifact";
import { createInitialState, ExecutionState } from "../core/execution-state";
import { replayExecution } from "../core/state-machine-vm";
import { buildExecutionContext } from "../core/context-builder";
import { ExecutionGateway } from "../execution/gateway";
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
  const r7eResult = replayExecution(
    createInitialState(buildExecutionContext("requirement-summary", {})),
    [makeTraceItem("solution-challenge", scOut(ready))]
  );
  assert(r7eResult.status === "running", "7e: replay status = running");
  assert(r7eResult.currentNode === "review", "7e: currentNode = review");
  assert(r7eResult.step === 1, "7e: step = 1");
  assert(r7eResult.retryCount === 0, "7e: retryCount = 0");

  // Case 7f: valid NEEDS_REVISION + !exhausted → tech-design
  const r7fResult = replayExecution(
    createInitialState(buildExecutionContext("requirement-summary", {})),
    [makeTraceItem("solution-challenge", scOut(needsRev))]
  );
  assert(r7fResult.status === "running", "7f: replay status = running");
  assert(r7fResult.currentNode === "tech-design", "7f: currentNode = tech-design");
  assert(r7fResult.step === 1, "7f: step = 1");

  // Case 7g: valid NEEDS_REVISION + exhausted → review
  const r7gResult = replayExecution(
    createInitialState(buildExecutionContext("requirement-summary", {})),
    [makeTraceItem("solution-challenge", scOut(needsRevEx))]
  );
  assert(r7gResult.status === "running", "7g: replay status = running");
  assert(r7gResult.currentNode === "review", "7g: exhausted NEEDS_REVISION → review");
  assert(r7gResult.step === 1, "7g: step = 1");
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

  // ═══════════════════════════════════════════════════════
  // Gateway Shadow Tests
  // ═══════════════════════════════════════════════════════

  const gatewayReadyState = createShadowReadyChallengeState();

  // ═══ Test 9: Explicit skill in gateway request ═══
  console.log("Test 9: Explicit skill in gateway request");
  let capturedReq9: ExecutionRequest | undefined;
  const gw9: RuntimeExecutionGateway = {
    async execute(req: ExecutionRequest): Promise<ExecutionResult> {
      if (req.type === "llm_task" && req.node === "solution-challenge") {
        capturedReq9 = req;
        return { success: true, node: req.node, agent: req.agent, output: { summary: JSON.stringify(gatewayReadyState) }, artifacts: [] };
      }
      return fakeGateway.execute(req);
    },
  };
  await run("x", { executionGateway: gw9, solutionChallengeMode: "gateway_shadow" });
  assert(capturedReq9 !== undefined, "gateway received request");
  assert(capturedReq9!.skill === "sdlc-solution-challenger", "skill explicitly sdlc-solution-challenger");
  assert(capturedReq9!.agent === "kimi", "agent is kimi");
  assert(typeof capturedReq9!.input["prompt"] === "string" && (capturedReq9!.input["prompt"] as string).length > 50, "prompt built and sent");
  console.log("");

  // ═══ Test 10: Real ExecutionGateway + fake Kimi runner contract smoke ═══
  console.log("Test 10: Real ExecutionGateway + fake Kimi runner contract smoke");
  const challengeJson = JSON.stringify({
    status: "NEEDS_REVISION", mode: "INITIAL_CHALLENGE", currentCycle: 1, maxCycles: 2,
    exhausted: false, artifactStatus: "shadow_only", reportPath: null,
    blocking_count: 1, required_count: 2, non_blocking_count: 0, out_of_scope_count: 0,
    findings: [{ id: "CH-001" }, { id: "CH-002" }],
    finding_ids: ["CH-001", "CH-002"],
  });
  const fakeKimiRunner = {
    async run() {
      return {
        exitCode: 0, durationMs: 1,
        stdout: challengeJson, stderr: "",
        stdoutPayload: challengeJson, // all fields in payload, not just stdout
      };
    },
  };
  const realGw10 = new ExecutionGateway({
    env: {
      SDLC_KIMI_GATEWAY_REAL_DISPATCH: "enabled",
      SDLC_KIMI_GATEWAY_INTEGRATION: "enabled",
      SDLC_KIMI_CLI_COMMAND_EXECUTION: "enabled",
      SDLC_KIMI_CLI_ADAPTER: "enabled",
      SDLC_KIMI_CLI_COMMAND: "kimi",
    },
    kimiRunner: fakeKimiRunner,
  });
  const r10 = await run("build a login form", { executionGateway: realGw10, solutionChallengeMode: "gateway_shadow" });
  const sc10 = r10.execution_trace.find((t) => t.node === "solution-challenge");
  assert(sc10 !== undefined, "challenge trace exists");
  const obs10 = sc10!.output["solution_challenge_observation"] as Record<string, unknown> | undefined;
  assert(obs10?.availability === "available", "observation available from real Gateway");
  assert(obs10?.state !== undefined, "state parsed");
  assert(sc10!.output["observedStatus"] === "NEEDS_REVISION", "observed NEEDS_REVISION from Kimi");
  assert(sc10!.output["blocking_count"] === 1, "blocking_count = 1 from parsed summary");
  assert(sc10!.output["required_count"] === 2, "required_count = 2");
  const state10 = sc10!.output["solution_challenge"] as SolutionChallengeState | undefined;
  assert(state10?.findingIds?.includes("CH-001"), "findingIds includes CH-001");
  assert(state10?.findingIds?.includes("CH-002"), "findingIds includes CH-002");
  // Gateway artifacts flow into RuntimeResult.artifacts
  const gwArtifacts10 = r10.artifacts.filter((a) => a.metadata.source === "execution_gateway");
  assert(gwArtifacts10.length > 0, "gateway artifacts in RuntimeResult.artifacts");
  assert(r10.execution_trace.some((t) => t.node === "review"), "flow continued to review");
  console.log("");

  // ═══ Test 11: READY observation → review ═══
  console.log("Test 11: READY observation → review");
  const gw11: RuntimeExecutionGateway = {
    async execute(req: ExecutionRequest): Promise<ExecutionResult> {
      if (req.type === "llm_task" && req.node === "solution-challenge") {
        return { success: true, node: req.node, agent: req.agent, output: { summary: JSON.stringify(gatewayReadyState) }, artifacts: [] };
      }
      return fakeGateway.execute(req);
    },
  };
  const r11 = await run("x", { executionGateway: gw11, solutionChallengeMode: "gateway_shadow" });
  const sc11 = r11.execution_trace.find((t) => t.node === "solution-challenge");
  const obs11 = sc11?.output["solution_challenge_observation"] as Record<string, unknown> | undefined;
  assert(obs11?.availability === "available", "observation available");
  assert(sc11?.output["observedStatus"] === "READY_FOR_GATE", "observed READY_FOR_GATE");
  assert(sc11?.output["routingEffect"] === "shadow_pass_through", "shadow pass through");
  assert(sc11?.output["fallback_used"] === false, "no fallback");
  assert(r11.execution_trace.some((t) => t.node === "review"), "flow continued to review");
  // Replay: shadow_pass_through → review
  const { getNextNode: gn11 } = await import("../sdlc_graph/transitions");
  assert(gn11("solution-challenge", sc11!.output) === "review", "replay: shadow_pass_through → review");
  console.log("");

  // ═══ Test 12: NEEDS_REVISION → wouldRouteTo=tech-design, actual→review ═══
  console.log("Test 12: NEEDS_REVISION shadow routing");
  const needsRevState12 = { ...createShadowReadyChallengeState(), status: "NEEDS_REVISION" as const, exhausted: false };
  const gw12: RuntimeExecutionGateway = {
    async execute(req: ExecutionRequest): Promise<ExecutionResult> {
      if (req.type === "llm_task" && req.node === "solution-challenge") {
        return { success: true, node: req.node, agent: req.agent, output: { summary: JSON.stringify(needsRevState12) }, artifacts: [] };
      }
      return fakeGateway.execute(req);
    },
  };
  const r12 = await run("x", { executionGateway: gw12, solutionChallengeMode: "gateway_shadow" });
  const sc12 = r12.execution_trace.find((t) => t.node === "solution-challenge");
  assert(sc12?.output["wouldRouteTo"] === "tech-design", "wouldRouteTo = tech-design");
  assert(r12.execution_trace.some((t) => t.node === "review"), "actual → review (not tech-design)");
  // Replay must also route to review
  const { getNextNode: gn12 } = await import("../sdlc_graph/transitions");
  assert(gn12("solution-challenge", sc12!.output) === "review", "replay: shadow_pass_through → review");
  console.log("");

  // ═══ Test 13: Exhausted NEEDS_REVISION preserved ═══
  console.log("Test 13: Exhausted NEEDS_REVISION preserved");
  const exhaustedState13 = { ...createShadowReadyChallengeState(), mode: "FOLLOW_UP_VERIFICATION" as const, currentCycle: 2 as const, status: "NEEDS_REVISION" as const, exhausted: true };
  const gw13: RuntimeExecutionGateway = {
    async execute(req: ExecutionRequest): Promise<ExecutionResult> {
      if (req.type === "llm_task" && req.node === "solution-challenge") {
        return { success: true, node: req.node, agent: req.agent, output: { summary: JSON.stringify(exhaustedState13) }, artifacts: [] };
      }
      return fakeGateway.execute(req);
    },
  };
  const r13 = await run("x", { executionGateway: gw13, solutionChallengeMode: "gateway_shadow" });
  const sc13 = r13.execution_trace.find((t) => t.node === "solution-challenge");
  assert(sc13?.output["observedStatus"] === "NEEDS_REVISION", "observed NEEDS_REVISION");
  assert(sc13?.output["recommended_next_step"] === "ESCALATE_TO_SOLUTION_REVIEWER", "ESCALATE");
  console.log("");

  // ═══ Test 14: success=false → no fake READY ═══
  console.log("Test 14: success=false → no fake READY");
  const gw14: RuntimeExecutionGateway = {
    async execute(req: ExecutionRequest): Promise<ExecutionResult> {
      if (req.type === "llm_task" && req.node === "solution-challenge") {
        return { success: false, node: req.node, agent: req.agent, output: {}, artifacts: [], error: "gateway_failure" };
      }
      return fakeGateway.execute(req);
    },
  };
  const r14 = await run("x", { executionGateway: gw14, solutionChallengeMode: "gateway_shadow" });
  const sc14 = r14.execution_trace.find((t) => t.node === "solution-challenge");
  const obs14 = sc14?.output["solution_challenge_observation"] as Record<string, unknown> | undefined;
  assert(obs14?.availability === "unavailable", "observation unavailable");
  assert(sc14?.output["observedStatus"] === "unavailable", "observedStatus = unavailable");
  assert(sc14?.output["fallback_used"] === true, "fallback_used = true");
  assert(sc14?.output["solution_challenge"] === undefined, "unavailable: no solution_challenge");
  assert(r14.execution_trace.some((t) => t.node === "review"), "flow continued to review");
  console.log("");

  // ═══ Test 15: Exception → no fake READY ═══
  console.log("Test 15: Exception → no fake READY");
  const gw15: RuntimeExecutionGateway = {
    async execute(req: ExecutionRequest): Promise<ExecutionResult> {
      if (req.type === "llm_task" && req.node === "solution-challenge") throw new Error("crash");
      return fakeGateway.execute(req);
    },
  };
  const r15 = await run("x", { executionGateway: gw15, solutionChallengeMode: "gateway_shadow" });
  const sc15 = r15.execution_trace.find((t) => t.node === "solution-challenge");
  assert(sc15?.output["observedStatus"] === "unavailable", "exception → unavailable");
  assert(sc15?.output["fallback_used"] === true, "fallback_used = true");
  assert(sc15?.output["solution_challenge"] === undefined, "exception: no solution_challenge");
  assert(r15.execution_trace.some((t) => t.node === "review"), "flow continued to review");
  console.log("");

  // ═══ Test 16: Malformed output → no fake READY ═══
  console.log("Test 16: Malformed output → no fake READY");
  const gw16: RuntimeExecutionGateway = {
    async execute(req: ExecutionRequest): Promise<ExecutionResult> {
      if (req.type === "llm_task" && req.node === "solution-challenge") {
        return { success: true, node: req.node, agent: req.agent, output: { summary: "not valid json" }, artifacts: [] };
      }
      return fakeGateway.execute(req);
    },
  };
  const r16 = await run("x", { executionGateway: gw16, solutionChallengeMode: "gateway_shadow" });
  const sc16 = r16.execution_trace.find((t) => t.node === "solution-challenge");
  const obs16 = sc16?.output["solution_challenge_observation"] as Record<string, unknown> | undefined;
  assert(obs16?.availability === "unavailable", "malformed → unavailable");
  assert(sc16?.output["fallback_used"] === true, "fallback_used = true");
  console.log("");

  // ═══ Test 17: Disabled and shadow not regressed ═══
  console.log("Test 17: Disabled and shadow not regressed");
  const r17a = await run("x", { executionGateway: fakeGateway, solutionChallengeMode: "disabled" });
  assert(!r17a.execution_trace.some((t) => t.node === "solution-challenge"), "disabled: no challenge");
  const r17b = await run("x", { executionGateway: fakeGateway, solutionChallengeMode: "shadow" });
  assert(r17b.execution_trace.some((t) => t.node === "solution-challenge"), "shadow: challenge present");
  console.log("");

  // ═══ Test 18: final_status / implementation_outcome preserved ═══
  console.log("Test 18: final_status / implementation_outcome preserved");
  const r18 = await run("x", { executionGateway: gw11, solutionChallengeMode: "gateway_shadow" });
  assert(r18.final_status === "success", "final_status = success");
  assert(typeof r18.implementation_outcome === "string", "implementation_outcome set");
  console.log("");


  // ═══════════════════════════════════════════════════════
  // Cross-Object Field Consistency Tests (validator)
  // ═══════════════════════════════════════════════════════

  console.log("Cross-object field consistency tests");

  const { validateGatewayShadowChallengeOutput: vgw } = await import("../core/solution-challenge-state");
  const baseObs = { availability: "available" as const, state: { ...gatewayReadyState }, findingIds: ["CH-001"], counts: { blocking: 0, required: 0, nonBlocking: 0, outOfScope: 0 } };

  function mkOut(o: Record<string, unknown>) {
    return {
      routingEffect: "shadow_pass_through",
      solution_challenge: gatewayReadyState,
      solution_challenge_observation: { ...baseObs },
      observedStatus: "READY_FOR_GATE",
      fallback_used: false,
      wouldRouteTo: "review",
      ...o,
    };
  }

  // F1: valid available passes
  let f1 = false; try { vgw(mkOut({ solution_challenge: { ...gatewayReadyState, findingIds: ["CH-001"] }, solution_challenge_observation: { ...baseObs, state: { ...gatewayReadyState, findingIds: ["CH-001"] }, findingIds: ["CH-001"] } })); f1 = true; } catch { }
  assert(f1, "F1: valid available passes");

  // F2: mode mismatch
  // Linked: mode+currentCycle+exhausted change together; first field in order is "mode"
  let f2 = false; try { vgw(mkOut({ solution_challenge: { ...gatewayReadyState, mode: "FOLLOW_UP_VERIFICATION", currentCycle: 2, exhausted: true }, solution_challenge_observation: { ...baseObs, state: { ...gatewayReadyState } } })); } catch (e) { f2 = String(e).includes("mode"); }
  assert(f2, "F2: mode mismatch throws");

  // F3: currentCycle mismatch


  // F4: exhausted mismatch


  // F5: status mismatch
  let f5 = false; try { vgw(mkOut({ solution_challenge: { ...gatewayReadyState, status: "NEEDS_REVISION", exhausted: false }, wouldRouteTo: "tech-design", observedStatus: "NEEDS_REVISION", solution_challenge_observation: { ...baseObs, state: { ...gatewayReadyState } } })); } catch (e) { f5 = String(e).includes("status"); }
  assert(f5, "F3: status mismatch throws");

  // F6: artifactStatus mismatch
  let f6 = false; try { vgw(mkOut({ solution_challenge: { ...gatewayReadyState, artifactStatus: "generated", reportPath: "lib/r.md" }, solution_challenge_observation: { ...baseObs, state: { ...gatewayReadyState } } })); } catch (e) { f6 = String(e).includes("artifactStatus"); }
  assert(f6, "F4: artifactStatus mismatch throws");

  // F7: reportPath mismatch
  let f7 = false; try { vgw(mkOut({ solution_challenge: { ...gatewayReadyState, reportPath: "lib/a.md", artifactStatus: "generated" }, solution_challenge_observation: { ...baseObs, state: { ...gatewayReadyState, reportPath: "lib/b.md", artifactStatus: "generated" } } })); } catch (e) { f7 = String(e).includes("reportPath"); }
  assert(f7, "F5: reportPath mismatch throws");

  // findingIds consistency
  const ids2 = ["CH-001", "CH-002"];

  // F8: top state findingIds length differs from obs
  let f8 = false; try { vgw(mkOut({ solution_challenge: { ...gatewayReadyState, findingIds: ["CH-001"] }, solution_challenge_observation: { ...baseObs, state: { ...gatewayReadyState, findingIds: ["CH-001"] }, findingIds: ids2 } })); } catch (e) { f8 = String(e).includes("findingIds") && String(e).includes("length"); }
  assert(f8, "F8: findingIds length mismatch throws");

  // F9: obs.state findingIds length differs from obs
  let f9 = false; try { vgw(mkOut({ solution_challenge: { ...gatewayReadyState, findingIds: ids2 }, solution_challenge_observation: { ...baseObs, state: { ...gatewayReadyState, findingIds: ["CH-001"] }, findingIds: ids2 } })); } catch (e) { f9 = String(e).includes("findingIds") && String(e).includes("length"); }
  assert(f9, "F9: obs.state findingIds length mismatch throws");

  // F10: same length different value at index
  let f10 = false; try { vgw(mkOut({ solution_challenge: { ...gatewayReadyState, findingIds: ["CH-001", "CH-003"] }, solution_challenge_observation: { ...baseObs, state: { ...gatewayReadyState, findingIds: ["CH-001", "CH-003"] }, findingIds: ids2 } })); } catch (e) { f10 = String(e).includes("findingIds[1]"); }
  assert(f10, "F10: findingIds[1] value mismatch throws");

  // F11: different order
  let f11 = false; try { vgw(mkOut({ solution_challenge: { ...gatewayReadyState, findingIds: ["CH-002", "CH-001"] }, solution_challenge_observation: { ...baseObs, state: { ...gatewayReadyState, findingIds: ["CH-002", "CH-001"] }, findingIds: ids2 } })); } catch (e) { f11 = String(e).includes("findingIds[0]"); }
  assert(f11, "F11: different order throws");

  // F12: valid three-way empty arrays
  let f12 = false; try { vgw(mkOut({ solution_challenge: { ...gatewayReadyState, findingIds: [] }, solution_challenge_observation: { ...baseObs, state: { ...gatewayReadyState, findingIds: [] }, findingIds: [] } })); f12 = true; } catch { }
  assert(f12, "F12: valid three-way empty arrays pass");

  // F13: empty string in findingIds (structural)
  let f13 = false; try { vgw(mkOut({ solution_challenge: { ...gatewayReadyState, findingIds: [""] }, solution_challenge_observation: { ...baseObs, state: { ...gatewayReadyState, findingIds: [""] }, findingIds: [""] } })); } catch (e) { f13 = String(e).includes("findingIds"); }
  assert(f13, "F13: empty string in findingIds throws");

  // F14: undefined/[] equivalence — state findingIds undefined, observation findingIds []
  let f14 = false; try {
    const s = { ...gatewayReadyState } as Record<string, unknown>; delete s["findingIds"];
    vgw(mkOut({ solution_challenge: s, solution_challenge_observation: { ...baseObs, state: s, findingIds: [] } }));
    f14 = true;
  } catch { }
  assert(f14, "F14: state undefined + obs [] passes (equivalent)");

  // F15: both states missing findingIds, obs is []
  let f15 = false; try {
    const s = { ...gatewayReadyState } as Record<string, unknown>; delete s["findingIds"];
    vgw(mkOut({ solution_challenge: s, solution_challenge_observation: { ...baseObs, state: s, findingIds: [] } }));
    f15 = true;
  } catch { }
  assert(f15, "F15: both states undefined + obs [] passes");

  // Linked-field rejection: mode+currentCycle+exhausted mismatch (catches mode first)
  let f2b = false; try {
    vgw(mkOut({
      solution_challenge: { ...gatewayReadyState, mode: "FOLLOW_UP_VERIFICATION", currentCycle: 2, exhausted: true },
      solution_challenge_observation: { ...baseObs, state: { ...gatewayReadyState } },
    }));
  } catch (e) { f2b = String(e).includes("mode"); }
  assert(f2b, "F2b: linked mode/cycle/exhausted mismatch throws with mode");

  // maxCycles mismatch (both sides valid, different maxCycles... but maxCycles is always 2 per validator)
  // maxCycles cannot be different while both sides pass single-object validation.
  // Verified: maxCycles is enforced as exactly 2 by validateSolutionChallengeState.

  console.log("");

  // ═══════════════════════════════════════════════════════
  // Replay Cross-Object Field Drift Test
  // ═══════════════════════════════════════════════════════

  console.log("Replay: cross-object field drift rejected");

  // RR11: replay trace where solution_challenge.status differs from observation.state.status
  const driftTi = makeTi("solution-challenge", {
    routingEffect: "shadow_pass_through",
    solution_challenge: { ...gatewayReadyState, status: "NEEDS_REVISION", exhausted: false, findingIds: [] },
    solution_challenge_observation: { availability: "available", state: { ...gatewayReadyState, findingIds: [] }, findingIds: [], counts: { blocking: 0, required: 0, nonBlocking: 0, outOfScope: 0 } },
    observedStatus: "READY_FOR_GATE", fallback_used: false, wouldRouteTo: "review",
  });
  let rr11 = false;
  try { replayExecution(createInitialState(buildExecutionContext("requirement-summary", {})), [driftTi]); } catch (e) { rr11 = String(e).includes("status"); }
  assert(rr11, "RR11: replay rejects cross-object status drift");

  // ═══════════════════════════════════════════════════════
  // Replay Malformed Gateway Shadow Tests (real replayExecution)
  // ═══════════════════════════════════════════════════════

  console.log("Replay: real replayExecution with malformed gateway shadow traces");

  function makeTi(node: string, output: Record<string, unknown>): ExecutionTraceItem {
    return { node: node as never, agent: "kimi", input: {}, output, timestamp: Date.now() };
  }

  const availTi = makeTi("solution-challenge", {
    routingEffect: "shadow_pass_through",
    solution_challenge: { ...gatewayReadyState, findingIds: ["CH-001"] },
    solution_challenge_observation: { availability: "available", state: { ...gatewayReadyState, findingIds: ["CH-001"] }, findingIds: ["CH-001"], counts: { blocking: 0, required: 0, nonBlocking: 0, outOfScope: 0 } },
    observedStatus: "READY_FOR_GATE", fallback_used: false, wouldRouteTo: "review",
  });
  const unavailTi = makeTi("solution-challenge", {
    routingEffect: "shadow_pass_through",
    solution_challenge_observation: { availability: "unavailable", error: "gateway down" },
    observedStatus: "unavailable", fallback_used: true, wouldRouteTo: "review",
  });

  // RR1: missing observation → throws
  let rr1 = false;
  try { replayExecution(createInitialState(buildExecutionContext("requirement-summary", {})), [makeTi("solution-challenge", { routingEffect: "shadow_pass_through" })]); } catch { rr1 = true; }
  assert(rr1, "RR1: replay throws on missing observation");

  // RR2: available missing state → throws
  let rr2 = false;
  try { replayExecution(createInitialState(buildExecutionContext("requirement-summary", {})), [makeTi("solution-challenge", { routingEffect: "shadow_pass_through", solution_challenge_observation: { availability: "available" }, observedStatus: "READY_FOR_GATE", fallback_used: false, wouldRouteTo: "review" })]); } catch { rr2 = true; }
  assert(rr2, "RR2: replay throws on available missing state");

  // RR3: available invalid state → throws
  let rr3 = false;
  try { replayExecution(createInitialState(buildExecutionContext("requirement-summary", {})), [makeTi("solution-challenge", { routingEffect: "shadow_pass_through", solution_challenge_observation: { availability: "available", state: { status: "INVALID" }, findingIds: [], counts: { blocking: 0, required: 0, nonBlocking: 0, outOfScope: 0 } }, observedStatus: "READY_FOR_GATE", fallback_used: false, wouldRouteTo: "review" })]); } catch { rr3 = true; }
  assert(rr3, "RR3: replay throws on invalid state");

  // RR4: observedStatus mismatch → throws
  let rr4 = false;
  try { replayExecution(createInitialState(buildExecutionContext("requirement-summary", {})), [makeTi("solution-challenge", { ...availTi.output, observedStatus: "NEEDS_REVISION" })]); } catch { rr4 = true; }
  assert(rr4, "RR4: replay throws on observedStatus mismatch");

  // RR5: unavailable carries state → throws
  let rr5 = false;
  try { replayExecution(createInitialState(buildExecutionContext("requirement-summary", {})), [makeTi("solution-challenge", { routingEffect: "shadow_pass_through", solution_challenge_observation: { availability: "unavailable", state: gatewayReadyState, error: "x" }, observedStatus: "unavailable", fallback_used: true, wouldRouteTo: "review" })]); } catch { rr5 = true; }
  assert(rr5, "RR5: replay throws on unavailable with state");

  // RR6: unavailable carries top-level solution_challenge → throws
  let rr6 = false;
  try { replayExecution(createInitialState(buildExecutionContext("requirement-summary", {})), [makeTi("solution-challenge", { routingEffect: "shadow_pass_through", solution_challenge: gatewayReadyState, solution_challenge_observation: { availability: "unavailable", error: "x" }, observedStatus: "unavailable", fallback_used: true, wouldRouteTo: "review" })]); } catch { rr6 = true; }
  assert(rr6, "RR6: replay throws on unavailable with solution_challenge");

  // RR7: counts missing → throws
  let rr7 = false;
  try { replayExecution(createInitialState(buildExecutionContext("requirement-summary", {})), [makeTi("solution-challenge", { routingEffect: "shadow_pass_through", solution_challenge: gatewayReadyState, solution_challenge_observation: { availability: "available", state: gatewayReadyState, findingIds: [] }, observedStatus: "READY_FOR_GATE", fallback_used: false, wouldRouteTo: "review" })]); } catch { rr7 = true; }
  assert(rr7, "RR7: replay throws on missing counts");

  // RR8: findingIds contains empty string → throws
  let rr8 = false;
  try { replayExecution(createInitialState(buildExecutionContext("requirement-summary", {})), [makeTi("solution-challenge", { routingEffect: "shadow_pass_through", solution_challenge: gatewayReadyState, solution_challenge_observation: { availability: "available", state: gatewayReadyState, findingIds: [""], counts: { blocking: 0, required: 0, nonBlocking: 0, outOfScope: 0 } }, observedStatus: "READY_FOR_GATE", fallback_used: false, wouldRouteTo: "review" })]); } catch { rr8 = true; }
  assert(rr8, "RR8: replay throws on empty findingId");

  // RR9: valid available → replay succeeds, routes to review
  const rr9State = replayExecution(
    createInitialState(buildExecutionContext("requirement-summary", {})),
    [availTi]
  );
  assert(rr9State.status === "running", "RR9: replay status = running");
  assert(rr9State.step === 1, "RR9: step = 1");
  assert(rr9State.currentNode === "review", "RR9: currentNode = review");
  assert(rr9State.retryCount === 0, "RR9: retryCount = 0");
  assert(rr9State.history.length === 1, "RR9: history.length = 1");
  assert(rr9State.history[0].node === "solution-challenge", "RR9: history node = solution-challenge");
  const rr9output = rr9State.history[0].output as Record<string, unknown>;
  assert(rr9output["routingEffect"] === "shadow_pass_through", "RR9: routingEffect = shadow_pass_through");
  assert(rr9output["wouldRouteTo"] === "review", "RR9: wouldRouteTo = review");
  assert(rr9output["observedStatus"] === "READY_FOR_GATE", "RR9: observedStatus = READY_FOR_GATE");
  const rr9obs = rr9output["solution_challenge_observation"] as Record<string, unknown>;
  assert(rr9obs !== undefined, "RR9: solution_challenge_observation exists");
  assert(rr9obs.availability === "available", "RR9: observation availability = available");
  const rr9obsInput = (availTi.output as Record<string, unknown>)["solution_challenge_observation"] as Record<string, unknown>;
  assert(JSON.stringify(rr9obs.state) === JSON.stringify(rr9obsInput.state), "RR9: observation.state preserved by value");
  assert(JSON.stringify(rr9obs.findingIds) === JSON.stringify(rr9obsInput.findingIds), "RR9: observation.findingIds preserved by value");
  assert(JSON.stringify(rr9obs.counts) === JSON.stringify(rr9obsInput.counts), "RR9: observation.counts preserved by value");

  // RR10: valid unavailable → replay succeeds, no READY state in history
  const rr10State = replayExecution(
    createInitialState(buildExecutionContext("requirement-summary", {})),
    [unavailTi]
  );
  assert(rr10State.status === "running", "RR10: replay status = running");
  assert(rr10State.currentNode === "review", "RR10: currentNode = review");
  assert(rr10State.step === 1, "RR10: step = 1");
  assert(rr10State.retryCount === 0, "RR10: retryCount = 0");
  assert(rr10State.history.length === 1, "RR10: history.length = 1");
  assert(rr10State.history[0].node === "solution-challenge", "RR10: history node = solution-challenge");
  // Use hasOwnProperty to verify absence, not just undefined check
  const rr10output = rr10State.history[0].output as Record<string, unknown>;
  assert(rr10output["routingEffect"] === "shadow_pass_through", "RR10: routingEffect = shadow_pass_through");
  assert(rr10output["observedStatus"] === "unavailable", "RR10: observedStatus = unavailable");
  assert(rr10output["fallback_used"] === true, "RR10: fallback_used = true");
  assert(rr10output["wouldRouteTo"] === "review", "RR10: wouldRouteTo = review");
  assert(!Object.prototype.hasOwnProperty.call(rr10output, "solution_challenge"), "RR10: no solution_challenge by own property");
  const rr10obs = rr10output["solution_challenge_observation"] as Record<string, unknown>;
  assert(rr10obs !== undefined, "RR10: solution_challenge_observation exists");
  assert(rr10obs.availability === "unavailable", "RR10: observation availability = unavailable");
  assert(typeof rr10obs.error === "string" && rr10obs.error.length > 0, "RR10: observation.error is non-empty string");
  assert(!Object.prototype.hasOwnProperty.call(rr10obs, "state"), "RR10: no observation.state");
  assert(!Object.prototype.hasOwnProperty.call(rr10obs, "findings"), "RR10: no findings");
  assert(!Object.prototype.hasOwnProperty.call(rr10obs, "findingIds"), "RR10: no findingIds");
  assert(!Object.prototype.hasOwnProperty.call(rr10obs, "counts"), "RR10: no counts");
  // Verify absence of READY_FOR_GATE in history output
  const rr10json = JSON.stringify(rr10State.history);
  assert(!rr10json.includes("READY_FOR_GATE"), "RR10: no READY_FOR_GATE in history");

  // RR12: NEEDS_REVISION shadow pass-through (wouldRouteTo=tech-design, actual→review)
  console.log("Replay: NEEDS_REVISION shadow pass-through");
  const needsRevTi = makeTi("solution-challenge", {
    routingEffect: "shadow_pass_through",
    solution_challenge: { ...gatewayReadyState, status: "NEEDS_REVISION" as const, exhausted: false, findingIds: ["CH-001"] },
    solution_challenge_observation: { availability: "available", state: { ...gatewayReadyState, status: "NEEDS_REVISION" as const, exhausted: false, findingIds: ["CH-001"] }, findingIds: ["CH-001"], counts: { blocking: 1, required: 0, nonBlocking: 0, outOfScope: 0 } },
    observedStatus: "NEEDS_REVISION", fallback_used: false, wouldRouteTo: "tech-design",
  });
  const rr12State = replayExecution(
    createInitialState(buildExecutionContext("requirement-summary", {})),
    [needsRevTi]
  );
  assert(rr12State.status === "running", "RR12: replay status = running");
  assert(rr12State.currentNode === "review", "RR12: shadow_pass_through → review (not tech-design)");
  assert(rr12State.history[0].output["wouldRouteTo"] === "tech-design", "RR12: wouldRouteTo = tech-design");
  assert(rr12State.history[0].output["routingEffect"] === "shadow_pass_through", "RR12: routingEffect preserved");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
test();
