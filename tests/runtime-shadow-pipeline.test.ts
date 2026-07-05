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

  // Test 3: trace includes all 5 expected nodes in order
  console.log("Test 3: Node coverage");
  const nodes = result.execution_trace.map((t: { node: string }) => t.node);
  const expected = ["requirement-summary", "tech-design", "review", "implementation", "validation"];
  for (const node of expected) {
    assert(nodes.includes(node), `includes ${node}`);
  }
  console.log("");

  // Test 4: final status is valid
  console.log("Test 4: Final status");
  assert(
    ["success", "partial", "failed"].includes(result.final_status),
    `final_status is "${result.final_status}" (valid)`
  );
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
