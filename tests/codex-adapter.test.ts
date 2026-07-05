// Codex Adapter Test — No Codex Required
// =======================================
// Tests execution mode config and adapter safety.
// Does NOT require Codex CLI installed.

import { getExecutionMode } from "../execution/config";
import { executionGateway } from "../execution";
import { executeCodexAgent } from "../execution/codex-adapter";

async function test() {
  let passed = 0;
  let failed = 0;
  const original = process.env.SDLC_EXECUTION_MODE;

  function assert(condition: boolean, message: string) {
    if (condition) { passed++; console.log(`  ✓ ${message}`); }
    else { failed++; console.error(`  ✗ ${message}`); }
  }

  try {
    console.log("Codex Adapter Test\n");

    // Test 1: Default mode is shadow
    console.log("Test 1: Execution mode defaults");
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
    console.log("");

    // Test 4: Gateway still uses shadow by default
    delete process.env.SDLC_EXECUTION_MODE;
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

    // Test 6: Unsupported request type does not throw
    console.log("Test 6: Unsupported request type");
    const unsupported = await executeCodexAgent({
      type: "review", node: "review", agent: "codex", requirementId: "REQ-test", input: {},
    });
    assert(unsupported.success === false, "unsupported type returns success=false");
    assert(unsupported.error === "Unsupported request type", "correct error message");
    assert(Array.isArray(unsupported.artifacts), "artifacts is array");
    assert(unsupported.artifacts.length === 0, "artifacts is empty");
    console.log("");

    // Test 7: Codex mode routes non-codex agent to shadow
    console.log("Test 7: Codex mode kimi → shadow");
    process.env.SDLC_EXECUTION_MODE = "codex";
    const kimiInCodex = await executionGateway.execute({
      type: "code_generation", node: "implementation", agent: "kimi", requirementId: "REQ-test", input: {},
    });
    assert(kimiInCodex.success === true, "kimi succeeds in codex mode");
    const artifactTypes = kimiInCodex.artifacts.map((a: { type: string }) => a.type);
    assert(artifactTypes.includes("shadow_output"), "kimi gets shadow_output artifact in codex mode");
    console.log("");
  } finally {
    // Restore environment variable
    if (original === undefined) {
      delete process.env.SDLC_EXECUTION_MODE;
    } else {
      process.env.SDLC_EXECUTION_MODE = original;
    }
  }

  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
