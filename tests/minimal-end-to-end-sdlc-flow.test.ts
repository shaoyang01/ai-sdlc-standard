// Minimal End-to-End SDLC Flow Smoke Test
// ========================================
// Verifies the core SDLC lifecycle can run in default shadow/mock mode
// without real adapter flags, real CLI calls, or skill inference.

import { run } from "../runtime";

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

  console.log("Minimal End-to-End SDLC Flow Smoke Test\n");

  // ── Test 1: Flow completes without real adapter flags ──
  console.log("Test 1: Flow completes in default shadow mode");
  const testEnv: Record<string, string | undefined> = {};
  let result;
  try {
    result = await run("build a user registration form with email validation", { env: testEnv });
    assert(true, "run() completed without throwing");
  } catch (e) {
    assert(false, `run() threw: ${e}`);
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    process.exit(1);
  }
  console.log("");

  // ── Test 2: Requirement normalization is the entry step ──
  console.log("Test 2: Requirement normalization entry step");
  const nodes = result.execution_trace.map((t) => t.node);
  assert(nodes[0] === "requirement-summary", "first node is requirement-summary");
  console.log("");

  // ── Test 3: Planning / task decomposition is represented ──
  console.log("Test 3: Planning represented");
  assert(nodes.includes("tech-design"), "trace includes tech-design node");
  console.log("");

  // ── Test 4: Implementation is represented without real adapter execution ──
  console.log("Test 4: Implementation represented");
  assert(nodes.includes("implementation"), "trace includes implementation node");
  const implTrace = result.execution_trace.find((t) => t.node === "implementation");
  assert(implTrace !== undefined, "implementation trace entry exists");
  assert(implTrace!.status === "success", "implementation status is success in shadow mode");
  console.log("");

  // ── Test 5: Review is represented without Hermes becoming final owner ──
  console.log("Test 5: Review represented without Hermes ownership");
  assert(nodes.includes("review") || nodes.includes("code-review"), "trace includes review/code-review");
  const reviewTrace = result.execution_trace.find((t) => t.node === "review");
  if (reviewTrace) {
    assert(reviewTrace.agent !== "hermes", "review agent is not hermes");
  }
  assert(result.hermes_runtime_shadow_attachment === undefined, "no Hermes runtime shadow attachment in default mode");
  console.log("");

  // ── Test 6: Validation is represented without real adapter execution ──
  console.log("Test 6: Validation represented");
  assert(nodes.includes("validation"), "trace includes validation node");
  console.log("");

  // ── Test 7: Final result returned ──
  console.log("Test 7: Final result returned");
  assert(typeof result.requirement_id === "string", "requirement_id is returned");
  assert(["success", "partial", "failed"].includes(result.final_status), `final_status is valid: ${result.final_status}`);
  assert(result.completed_at !== undefined, "completed_at is returned");
  console.log("");

  // ── Test 8: No skill inference from (agent, node, requestType) ──
  console.log("Test 8: No skill inference");
  const implArtifact = result.artifacts.find((a) => a.node === "implementation" && a.type !== "fanout_result");
  assert(implArtifact !== undefined, "implementation artifact exists");
  assert(implArtifact!.content["skill"] === null, "implementation skill is null (not inferred)");
  console.log("");

  // ── Test 9: Default mode requires no real adapter flags ──
  console.log("Test 9: No real adapter flags required");
  assert(testEnv.SDLC_EXECUTION_MODE !== "codex", "SDLC_EXECUTION_MODE is not codex");
  assert(testEnv.SDLC_KIMI_GATEWAY_REAL_DISPATCH !== "enabled", "Kimi real dispatch flag not enabled");
  assert(testEnv.SDLC_HERMES_GATEWAY_REAL_DISPATCH !== "enabled", "Hermes real dispatch flag not enabled");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
