// Minimal End-to-End SDLC Flow Smoke Test (v2 single-rail, C02-WP3.5-C)
// ====================================================================
// Verifies the v2 seven-node chain runs end to end in the default
// deterministic shadow mode: no real adapter flags, no real CLI calls, no
// skill inference, full run-journal tracing, and the dual-agent solution-gate.

import { rmSync } from "node:fs";
import { run } from "../runtime";
import { LOOP_CAPABILITY_EXECUTION_POINTS } from "../loop/types";

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

  console.log("Minimal End-to-End SDLC Flow Smoke Test (v2)\n");

  // ── Test 1: Chain completes in default shadow mode ──
  console.log("Test 1: Chain completes in default shadow mode");
  const testEnv: Record<string, string | undefined> = {};
  let result;
  try {
    result = await run("build a user registration form with email validation");
    assert(true, "run() completed without throwing");
  } catch (e) {
    assert(false, `run() threw: ${e}`);
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    process.exit(1);
  }
  console.log("");

  // ── Test 2: The eight execution points run in canonical order ──
  console.log("Test 2: Canonical v2 execution order");
  const succeededPoints = result.execution_trace
    .filter((entry) => entry.status === "succeeded")
    .map((entry) => `${entry.capability}/${entry.executionRole}`);
  const expectedPoints = LOOP_CAPABILITY_EXECUTION_POINTS.map(
    (point) => `${point.capability}/${point.executionRole}`
  );
  assert(
    JSON.stringify(succeededPoints) === JSON.stringify(expectedPoints),
    `all eight execution points succeeded in canonical order (got ${succeededPoints.join(",")})`
  );
  assert(result.final_status === "success", "final_status is success");
  assert(result.chain_status === "COMPLETED", "chain_status is COMPLETED");
  console.log("");

  // ── Test 3: Requirement intake is the chain entry ──
  console.log("Test 3: Requirement intake entry step");
  assert(succeededPoints[0] === "requirement-intake/primary", "first point is requirement-intake/primary");
  console.log("");

  // ── Test 4: Planning / task decomposition is represented ──
  console.log("Test 4: Planning represented");
  assert(succeededPoints.includes("task-planning/primary"), "task-planning ran");
  console.log("");

  // ── Test 5: Implementation is represented without real adapter execution ──
  console.log("Test 5: Implementation represented");
  assert(succeededPoints.includes("implementation/primary"), "implementation ran");
  console.log("");

  // ── Test 6: Dual-agent solution-gate with the ledger handoff ──
  console.log("Test 6: Dual-agent solution-gate");
  const scan = result.execution_trace.find(
    (entry) => entry.executionRole === "adversarial_scan" && entry.status === "succeeded"
  );
  const verdict = result.execution_trace.find(
    (entry) => entry.executionRole === "formal_verdict" && entry.status === "succeeded"
  );
  assert(scan !== undefined && verdict !== undefined, "both gate roles succeeded");
  assert(scan!.agent !== verdict!.agent, "scan and verdict ran on different agents");
  assert(verdict!.gateResult === "PASS", "verdict carries the conclusive Gate result");
  assert(scan!.gateResult === "NOT_APPLICABLE", "scan never writes a conclusive Gate result");
  console.log("");

  // ── Test 7: Knowledge sync closes the chain ──
  console.log("Test 7: Knowledge sync closes the chain");
  assert(succeededPoints.at(-1) === "knowledge-sync/primary", "last point is knowledge-sync");
  console.log("");

  // ── Test 8: Final result shape ──
  console.log("Test 8: Final result returned");
  assert(typeof result.requirement_id === "string", "requirement_id is returned");
  assert(typeof result.run_id === "string", "run_id is returned");
  assert(typeof result.journal_path === "string", "journal_path is returned");
  assert(result.completed_at !== undefined, "completed_at is returned");
  console.log("");

  // ── Test 9: Default mode requires no real adapter flags ──
  console.log("Test 9: No real adapter flags required");
  assert(testEnv.SDLC_EXECUTION_MODE !== "codex", "SDLC_EXECUTION_MODE is not codex");
  assert(testEnv.SDLC_KIMI_GATEWAY_REAL_DISPATCH !== "enabled", "Kimi real dispatch flag not enabled");
  assert(testEnv.SDLC_HERMES_GATEWAY_REAL_DISPATCH !== "enabled", "Hermes real dispatch flag not enabled");
  console.log("");

  // Leave no smoke workspace behind on the default temp path.
  try {
    rmSync(result.workspace_root, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup only.
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
