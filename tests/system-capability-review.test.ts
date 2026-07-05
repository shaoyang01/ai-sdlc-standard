// Regression Test — System Capability Review (Static Metadata)
// =============================================================
// Verifies the machine-readable capability review is accurate.
// No runtime, no DB, no agents.

import * as fs from "node:fs";

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

  const raw = fs.readFileSync("system-capability-review.json", "utf-8");
  const review = JSON.parse(raw);

  console.log("System Capability Review Test\n");

  // ── Test 1: Basic structure ──
  console.log("Test 1: Basic structure");
  assert(review.version === 1, "version is 1");
  assert(review.source === "source-level-review", "source is source-level-review");
  assert(typeof review.overall_status === "object", "overall_status exists");
  assert(Array.isArray(review.capabilities), "capabilities is array");
  assert(Array.isArray(review.feature_flags), "feature_flags is array");
  assert(Array.isArray(review.safety_boundaries), "safety_boundaries is array");
  assert(Array.isArray(review.architecture_compliance), "architecture_compliance exists");
  assert(Array.isArray(review.risks), "risks exists");
  assert(typeof review.recommended_next_pr === "object", "recommended_next_pr exists");
  console.log("");

  // ── Test 2: Overall status ──
  console.log("Test 2: Overall status");
  assert(review.overall_status.runtime_default === "shadow_first", "runtime default is shadow_first");
  assert(review.overall_status.runtime_skill_flow_integration === "implemented_feature_flagged_sidecar_with_audit", "integration is sidecar with audit");
  assert(review.overall_status.real_skill_execution === "not_implemented", "real skill execution is not_implemented");
  console.log("");

  // ── Test 3: Feature flags ──
  console.log("Test 3: Feature flags present");
  const flags = review.feature_flags.map((f: Record<string, unknown>) => f["flag"]);
  assert(flags.includes("SDLC_EXECUTION_MODE"), "has SDLC_EXECUTION_MODE");
  assert(flags.includes("SDLC_POLICY_MEMORY"), "has SDLC_POLICY_MEMORY");
  assert(flags.includes("SDLC_POLICY_MEMORY_READ"), "has SDLC_POLICY_MEMORY_READ");
  assert(flags.includes("SDLC_SKILL_FLOW_RUNTIME_INTEGRATION"), "has SDLC_SKILL_FLOW_RUNTIME_INTEGRATION");
  console.log("");

  // ── Test 4: Key capabilities present ──
  console.log("Test 4: Key capabilities present");
  const capNames = review.capabilities.map((c: Record<string, unknown>) => c["name"]);
  assert(capNames.includes("Execution Gateway"), "has Execution Gateway");
  assert(capNames.includes("Skill Flow Inventory"), "has Skill Flow Inventory");
  assert(capNames.includes("Flow-stage Agent Skill Registry"), "has Flow-stage Agent Skill Registry");
  assert(capNames.includes("Skill Flow Orchestrator Contract"), "has Skill Flow Orchestrator Contract");
  assert(capNames.includes("Shadow Skill Flow Orchestrator"), "has Shadow Skill Flow Orchestrator");
  assert(capNames.includes("Runtime Shadow Integration Audit Trail"), "has Runtime Shadow Integration Audit Trail");
  const auditCap = review.capabilities.find((c: Record<string, unknown>) => c["name"] === "Runtime Shadow Integration Audit Trail");
  assert(auditCap !== undefined, "audit trail capability exists");
  assert(auditCap["runtime_active_by_default"] === false, "audit not active by default");
  assert(auditCap["changes_routing"] === false, "audit no routing change");
  assert(auditCap["changes_agent_selection"] === false, "audit no agent change");
  assert(auditCap["invokes_real_agents"] === false, "audit no real agents");
  assert(auditCap["invokes_real_skills"] === false, "audit no real skills");
  assert(auditCap["writes_files"] === false, "audit no file writes");
  console.log("");

  // ── Test 5: Safety boundaries ──
  console.log("Test 5: Safety boundaries");
  const safetyNames = review.safety_boundaries.map((s: Record<string, unknown>) => s["name"]);
  assert(safetyNames.includes("no_default_real_model_execution"), "no default real model execution");
  assert(safetyNames.includes("no_runtime_auto_skill_inference"), "no runtime auto skill inference");
  assert(safetyNames.includes("no_automatic_git_operations"), "no automatic git operations");
  assert(safetyNames.includes("no_automatic_policy_mutation"), "no automatic policy mutation");
  for (const s of review.safety_boundaries) {
    assert(s["status"] === "enforced", `${s["name"]} is enforced`);
  }
  console.log("");

  // ── Test 6: Architecture compliance confirmed ──
  console.log("Test 6: Architecture compliance");
  for (const a of review.architecture_compliance) {
    assert(a["status"] === "confirmed", `${a["assertion"]} is confirmed`);
  }
  console.log("");

  // ── Test 7: Recommended next PR ──
  console.log("Test 7: Recommended next PR");
  assert(typeof review.recommended_next_pr.title === "string", "title is a string");
  assert(review.recommended_next_pr.title.length > 0, "title is non-empty");
  console.log("");

  // ── Test 8: Markdown report exists ──
  console.log("Test 8: Markdown report exists");
  const mdExists = fs.existsSync("SYSTEM_CAPABILITY_REVIEW.md");
  assert(mdExists, "SYSTEM_CAPABILITY_REVIEW.md exists");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
