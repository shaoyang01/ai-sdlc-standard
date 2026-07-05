// Regression Test — Shadow SDLC Pipeline
// =======================================
// Verifies the full shadow pipeline executes correctly.
// All agent calls are simulated — no real execution.

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

  console.log("SDLC Shadow Pipeline Test\n");

  // Test 1: run() completes without throwing
  console.log("Test 1: Pipeline completes");
  let result;
  try {
    result = await run("build order sync system across inventory service");
    assert(true, "run() completed without throwing");
  } catch (e) {
    assert(false, `run() threw: ${e}`);
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    process.exit(1);
  }
  console.log("");

  // Test 2: result contains execution trace
  console.log("Test 2: Result structure");
  assert(typeof result.requirement_id === "string", "has requirement_id");
  assert(Array.isArray(result.execution_trace), "execution_trace is array");
  assert(result.execution_trace.length > 0, "trace has entries");
  console.log("");

  // Test 3: trace includes all 5 expected nodes IN ORDER
  console.log("Test 3: Node order");
  const nodes = result.execution_trace.map((t: { node: string }) => t.node);
  const expected = ["requirement-summary", "tech-design", "review", "implementation", "validation"];
  assert(nodes.length >= expected.length, `trace has at least ${expected.length} nodes (got ${nodes.length})`);

  // Verify expected order: each expected node appears in sequence
  let pos = 0;
  for (const exp of expected) {
    const idx = nodes.indexOf(exp, pos);
    assert(idx >= pos, `"${exp}" appears at or after position ${pos} (found at ${idx})`);
    if (idx >= 0) pos = idx + 1;
  }
  console.log("");

  // Test 4: final status === "success" for shadow baseline
  console.log("Test 4: Final status");
  assert(result.final_status === "success", `final_status is "${result.final_status}" (expected "success")`);
  console.log("");

  // Test 5: Artifacts collection
  console.log("Test 5: Artifacts");
  assert(Array.isArray(result.artifacts), "artifacts is array");
  assert(result.artifacts.length > 0, "artifacts are emitted");
  const artifactTypes = result.artifacts.map((a: { type: string }) => a.type);
  assert(artifactTypes.includes("requirement_summary"), "has requirement_summary artifact");
  assert(artifactTypes.includes("tech_design"), "has tech_design artifact");
  assert(artifactTypes.includes("solution_review"), "has solution_review artifact");
  assert(
    artifactTypes.includes("shadow_output") || artifactTypes.includes("implementation_plan"),
    "has implementation artifact"
  );
  assert(artifactTypes.includes("validation_report"), "has validation_report artifact");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
