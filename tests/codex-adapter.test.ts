// Codex Adapter Test — No Codex Required
// =======================================
// Tests execution mode config and adapter safety.
// Does NOT require Codex CLI installed.

import { getExecutionMode } from "../execution/config";
import { executionGateway } from "../execution";

async function test() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) { passed++; console.log(`  ✓ ${message}`); }
    else { failed++; console.error(`  ✗ ${message}`); }
  }

  console.log("Codex Adapter Test\n");

  // Test 1: Default mode is shadow
  console.log("Test 1: Execution mode defaults");
  const original = process.env.SDLC_EXECUTION_MODE;
  delete process.env.SDLC_EXECUTION_MODE;
  assert(getExecutionMode() === "shadow", "default mode is shadow");
  console.log("");

  // Test 2: Unknown falls back to shadow
  console.log("Test 2: Unknown mode fallback");
  process.env.SDLC_EXECUTION_MODE = "unknown";
  assert(getExecutionMode() === "shadow", "unknown mode falls back to shadow");
  console.log("");

  // Test 3: Codex mode recognized
  console.log("Test 3: Codex mode");
  process.env.SDLC_EXECUTION_MODE = "codex";
  assert(getExecutionMode() === "codex", "codex mode recognized");
  process.env.SDLC_EXECUTION_MODE = original;
  console.log("");

  // Test 4: Gateway still uses shadow by default
  console.log("Test 4: Gateway shadow default");
  const result = await executionGateway.execute({
    type: "code_generation",
    node: "implementation",
    agent: "codex",
    requirementId: "REQ-test",
    input: {},
  });
  assert(result.success === true, "gateway returns success in default mode");
  console.log("");

  // Test 5: Gateway handles kimi agent in default mode
  console.log("Test 5: Gateway kimi in default");
  const kimiResult = await executionGateway.execute({
    type: "review", node: "review", agent: "kimi", requirementId: "REQ-test", input: {},
  });
  assert(kimiResult.success === true, "kimi request succeeds in default mode");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
