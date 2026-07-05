// Execution Gateway Test
// ======================
// Verifies shadow Execution Gateway contracts.

import { executionGateway } from "../execution";

async function test() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) { passed++; console.log(`  ✓ ${message}`); }
    else { failed++; console.error(`  ✗ ${message}`); }
  }

  console.log("Execution Gateway Test\n");

  // Test 1: Gateway returns success
  console.log("Test 1: Shadow execution");
  const result = await executionGateway.execute({
    type: "code_generation",
    node: "implementation",
    agent: "codex",
    requirementId: "REQ-test",
    input: { task: "build order sync" },
  });
  assert(result.success === true, "gateway returns success");
  assert(result.node === "implementation", "node preserved");
  assert(result.agent === "codex", "agent preserved");
  console.log("");

  // Test 2: Result contains artifacts
  console.log("Test 2: Artifacts");
  assert(Array.isArray(result.artifacts), "artifacts is array");
  assert(result.artifacts.length > 0, "artifacts emitted");
  assert(result.artifacts[0].type === "shadow_output", "artifact type is shadow_output");
  console.log("");

  // Test 3: Gateway does not throw for different request types
  console.log("Test 3: Request types");
  const reviewResult = await executionGateway.execute({
    type: "review", node: "review", agent: "kimi", requirementId: "REQ-test", input: {},
  });
  assert(reviewResult.success === true, "review request succeeds");
  const validationResult = await executionGateway.execute({
    type: "validation", node: "validation", agent: "hermes", requirementId: "REQ-test", input: {},
  });
  assert(validationResult.success === true, "validation request succeeds");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
