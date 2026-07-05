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
  // Kimi dry-run harness
  assert(capNames.includes("Kimi CLI Adapter Dry-run Harness"), "has Kimi CLI Adapter Dry-run Harness");
  const dryRunCap = review.capabilities.find((c: Record<string, unknown>) => c["name"] === "Kimi CLI Adapter Dry-run Harness");
  assert(dryRunCap !== undefined, "dry-run capability exists");
  assert(dryRunCap["status"] === "feature-flagged-dry-run", "dry-run status");
  assert(dryRunCap["runtime_active_by_default"] === false, "dry-run not active by default");
  assert(dryRunCap["changes_routing"] === false, "dry-run no routing");
  assert(dryRunCap["changes_agent_selection"] === false, "dry-run no agent");
  assert(dryRunCap["invokes_real_agents"] === false, "dry-run no real agents");
  assert(dryRunCap["invokes_real_skills"] === false, "dry-run no real skills");
  assert(dryRunCap["writes_files"] === false, "dry-run no files");
  const dryRunEvidence = dryRunCap["evidence"] as string[];
  assert(dryRunEvidence.includes("execution/kimi-cli-dry-run.ts"), "evidence includes kimi-cli-dry-run.ts");
  assert(dryRunEvidence.includes("tests/kimi-cli-dry-run.test.ts"), "evidence includes test");
  // Hermes dry-run harness
  assert(capNames.includes("Hermes CLI Adapter Dry-run Harness"), "has Hermes CLI Adapter Dry-run Harness");
  const hDryRunCap = review.capabilities.find((c: Record<string, unknown>) => c["name"] === "Hermes CLI Adapter Dry-run Harness");
  assert(hDryRunCap !== undefined, "hermes dry-run capability exists");
  assert(hDryRunCap["status"] === "feature-flagged-dry-run", "hermes dry-run status");
  assert(hDryRunCap["runtime_active_by_default"] === false, "hermes dry-run not active");
  assert(hDryRunCap["changes_routing"] === false, "hermes dry-run no routing");
  assert(hDryRunCap["changes_agent_selection"] === false, "hermes dry-run no agent");
  assert(hDryRunCap["invokes_real_agents"] === false, "hermes dry-run no real agents");
  assert(hDryRunCap["invokes_real_skills"] === false, "hermes dry-run no real skills");
  assert(hDryRunCap["writes_files"] === false, "hermes dry-run no files");
  const hEvidence = hDryRunCap["evidence"] as string[];
  assert(hEvidence.includes("execution/hermes-cli-dry-run.ts"), "hermes evidence includes hermes-cli-dry-run.ts");
  assert(hEvidence.includes("tests/hermes-cli-dry-run.test.ts"), "hermes evidence includes test");
  // Kimi Gateway Integration Contract
  assert(capNames.includes("Kimi Gateway Integration Contract"), "has Kimi Gateway Integration Contract");
  const gwCap = review.capabilities.find((c: Record<string, unknown>) => c["name"] === "Kimi Gateway Integration Contract");
  assert(gwCap !== undefined, "gateway contract exists");
  assert(gwCap["status"] === "contract-only", "gateway status");
  assert(gwCap["runtime_active_by_default"] === false, "gateway not active");
  assert(gwCap["changes_routing"] === false, "gateway no routing");
  assert(gwCap["changes_agent_selection"] === false, "gateway no agent");
  assert(gwCap["invokes_real_agents"] === false, "gateway no real agents");
  assert(gwCap["invokes_real_skills"] === false, "gateway no real skills");
  assert(gwCap["writes_files"] === false, "gateway no files");
  assert(gwCap["wired_to_gateway"] === false, "gateway not wired to gateway");
  assert(gwCap["wired_to_runtime"] === false, "gateway not wired to runtime");
  const gwFlags = gwCap["requires_flags"] as string[];
  assert(gwFlags.includes("SDLC_KIMI_GATEWAY_INTEGRATION=enabled"), "gateway requires gateway flag");
  assert(gwFlags.includes("SDLC_KIMI_CLI_COMMAND_EXECUTION=enabled"), "gateway requires command flag");
  const gwEvidence = gwCap["evidence"] as string[];
  assert(gwEvidence.includes("execution/kimi-gateway-integration-contract.ts"), "gateway evidence");
  assert(gwEvidence.includes("tests/kimi-gateway-integration-contract.test.ts"), "gateway test evidence");
  assert(review.recommended_next_pr.title === "Kimi Gateway Shadow Sidecar Runtime Attachment Contract", "next PR is attachment contract");
  // Kimi Gateway Shadow Sidecar
  assert(capNames.includes("Kimi Gateway Shadow Sidecar"), "has Kimi Gateway Shadow Sidecar");
  const ssCap = review.capabilities.find((c: Record<string, unknown>) => c["name"] === "Kimi Gateway Shadow Sidecar");
  assert(ssCap !== undefined, "sidecar exists");
  assert(ssCap["status"] === "feature-flagged-sidecar", "sidecar status");
  assert(ssCap["runtime_active_by_default"] === false, "sidecar not active");
  assert(ssCap["changes_routing"] === false, "sidecar no routing");
  assert(ssCap["changes_agent_selection"] === false, "sidecar no agent");
  assert(ssCap["changes_final_status"] === false, "sidecar no final status");
  assert(ssCap["primary_gateway_unchanged"] === true, "sidecar gateway unchanged");
  assert(ssCap["wired_to_runtime"] === false, "sidecar not wired");
  assert(ssCap["invokes_real_agents"] === true, "sidecar real agents");
  assert(ssCap["invokes_real_skills"] === false, "sidecar no skills");
  assert(ssCap["writes_files"] === false, "sidecar no files");
  const ssFlags = ssCap["requires_flags"] as string[];
  assert(ssFlags.includes("SDLC_KIMI_GATEWAY_SHADOW=enabled"), "sidecar shadow flag");
  assert(ssFlags.includes("SDLC_KIMI_GATEWAY_INTEGRATION=enabled"), "sidecar integration flag");
  assert(ssFlags.includes("SDLC_KIMI_CLI_COMMAND_EXECUTION=enabled"), "sidecar command flag");
  const ssEvidence = ssCap["evidence"] as string[];
  assert(ssEvidence.includes("execution/kimi-gateway-shadow-sidecar.ts"), "sidecar evidence");
  assert(ssEvidence.includes("tests/kimi-gateway-shadow-sidecar.test.ts"), "sidecar test evidence");
  // No stale Kimi/Hermes shadow-only claims
  const reviewJson = JSON.stringify(review);
  assert(!reviewJson.includes("Kimi/Hermes are shadow-only"), "no stale shadow-only claim");
  assert(reviewJson.includes("isolated feature-flagged command executor"), "current Kimi executor state");
  assert(reviewJson.includes("not wired to runtime/Gateway"), "not wired state");
  // Markdown review must reflect current Kimi state
  const md = fs.readFileSync("SYSTEM_CAPABILITY_REVIEW.md", "utf-8");
  assert(!md.includes("Kimi/Hermes are shadow-only"), "MD: no stale shadow-only claim");
  assert(!md.includes("only CLI contract stubs exist"), "MD: no stale 'only CLI stubs' claim");
  assert(md.includes("isolated feature-flagged command executor"), "MD: mentions Kimi command executor");
  assert(md.includes("Gateway integration contract"), "MD: mentions Gateway contract");
  assert(md.includes("not wired to runtime"), "MD: mentions not wired to runtime");
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
