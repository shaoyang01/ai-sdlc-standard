// Regression Test — Real Agent Adapter Capability Matrix (Static)
// ================================================================
// Verifies the machine-readable adapter matrix is accurate.
// Uses execution/types.ts ExecutionRequestType as source of truth.
// No runtime, no Gateway, no adapters, no network.

import * as fs from "node:fs";

const VALID_REQUEST_TYPES = [
  "llm_task",
  "code_generation",
  "review",
  "validation",
  "code_review",
  "bugfix",
];

const INVALID_REQUEST_TYPES = [
  "requirement_summary",
  "tech_design",
  "solution_review",
];

const VALID_ARTIFACT_TYPES = [
  "requirement_summary",
  "tech_design",
  "solution_review",
  "code_patch",
  "code_review",
  "bugfix_patch",
  "validation_report",
  "shadow_output",
];

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

  const raw = fs.readFileSync("real-agent-adapter-capability-matrix.json", "utf-8");
  const m = JSON.parse(raw);

  console.log("Real Agent Adapter Capability Matrix Test\n");

  // ── Test 1: Basic structure ──
  console.log("Test 1: Basic structure");
  assert(m.version === 1, "version is 1");
  assert(m.default_execution_mode === "shadow", "default is shadow");
  assert(m.real_execution_default === false, "real execution not default");
  assert(m.source_of_truth_request_types === "execution/types.ts:ExecutionRequestType", "source of truth declared");
  console.log("");

  // ── Test 2: Adapter statuses ──
  console.log("Test 2: Adapter statuses");
  const shadow = m.adapters.find((a: Record<string, unknown>) => a["adapter"] === "shadow");
  const codex = m.adapters.find((a: Record<string, unknown>) => a["adapter"] === "codex");
  const kimi = m.adapters.find((a: Record<string, unknown>) => a["adapter"] === "kimi");
  const hermes = m.adapters.find((a: Record<string, unknown>) => a["adapter"] === "hermes");
  assert(shadow !== undefined && codex !== undefined && kimi !== undefined && hermes !== undefined, "all 4 adapters exist");
  assert(shadow["status"] === "implemented", "shadow implemented");
  assert(codex["status"] === "feature_flagged_partial", "codex feature_flagged_partial");
  assert(kimi["status"] === "cli_contract_stub_with_dry_run_harness", "kimi cli contract stub with dry-run harness");
  assert(kimi["dry_run_harness"] === "implemented_no_process_spawn", "kimi dry-run harness implemented");
  assert(hermes["status"] === "cli_contract_stub", "hermes cli_contract_stub");
  console.log("");

  // ── Test 3: Request type alignment ──
  console.log("Test 3: Request types match ExecutionRequestType");
  const rtNames = m.request_types.map((r: Record<string, unknown>) => r["request_type"]);
  for (const vt of VALID_REQUEST_TYPES) {
    assert(rtNames.includes(vt), `request_type includes ${vt}`);
  }
  for (const rt of rtNames) {
    assert(VALID_REQUEST_TYPES.includes(rt), `request_type ${rt} is a valid ExecutionRequestType`);
  }
  // No artifact/node names used as request types
  for (const inv of INVALID_REQUEST_TYPES) {
    assert(!rtNames.includes(inv), `request_type does NOT include ${inv} (artifact/node name)`);
  }
  console.log("");

  // ── Test 4: Adapter supported/unsupported types are valid ──
  console.log("Test 4: Adapter supported/unsupported types use valid values");
  for (const adapter of m.adapters) {
    for (const rt of (adapter["supported_request_types"] as string[])) {
      assert(VALID_REQUEST_TYPES.includes(rt), `${adapter["adapter"]} supported: ${rt} is valid`);
    }
    for (const rt of (adapter["unsupported_request_types"] as string[])) {
      assert(VALID_REQUEST_TYPES.includes(rt), `${adapter["adapter"]} unsupported: ${rt} is valid`);
      assert(!INVALID_REQUEST_TYPES.includes(rt), `${adapter["adapter"]} unsupported: ${rt} is NOT an artifact name`);
    }
  }
  console.log("");

  // ── Test 5: Recommended adapters ──
  console.log("Test 5: Recommended adapters per request type");
  const cg = m.request_types.find((r: Record<string, unknown>) => r["request_type"] === "code_generation");
  assert(cg["recommended_real_adapter"] === "codex", "code_generation → codex");
  const val = m.request_types.find((r: Record<string, unknown>) => r["request_type"] === "validation");
  assert(val["recommended_real_adapter"] === "hermes", "validation → hermes");
  const llm = m.request_types.find((r: Record<string, unknown>) => r["request_type"] === "llm_task");
  assert(llm["recommended_real_adapter"] === "kimi", "llm_task → kimi");
  // Artifact type validation
  console.log("Test 5b: typical_artifacts use valid execution artifact types");
  for (const rt of m.request_types) {
    const arts = rt["typical_artifacts"] as string[];
    for (const art of arts) {
      assert(VALID_ARTIFACT_TYPES.includes(art), `${rt["request_type"]}: typical_artifact ${art} is valid`);
    }
  }
  console.log("");

  // ── Test 6: Feature flags ──
  console.log("Test 6: Feature flags");
  const ffNames = m.feature_flags.map((f: Record<string, unknown>) => f["flag"]);
  assert(ffNames.includes("SDLC_EXECUTION_MODE"), "has SDLC_EXECUTION_MODE");
  assert(ffNames.includes("SDLC_KIMI_CLI_ADAPTER"), "has SDLC_KIMI_CLI_ADAPTER");
  assert(ffNames.includes("SDLC_HERMES_CLI_ADAPTER"), "has SDLC_HERMES_CLI_ADAPTER");
  assert(ffNames.includes("SDLC_REAL_ADAPTER_FALLBACK"), "has SDLC_REAL_ADAPTER_FALLBACK");
  // No API-style flags
  assert(!ffNames.includes("SDLC_KIMI_ADAPTER"), "no SDLC_KIMI_ADAPTER");
  assert(!ffNames.includes("SDLC_HERMES_ADAPTER"), "no SDLC_HERMES_ADAPTER");
  console.log("");

  // ── Test 7: Safety boundaries ──
  console.log("Test 7: Safety boundaries");
  const sbNames = m.safety_boundaries.map((s: Record<string, unknown>) => s["name"]);
  assert(sbNames.includes("no_default_real_model_execution"), "no default real execution");
  assert(sbNames.includes("real_adapters_behind_execution_gateway"), "adapters behind gateway");
  assert(sbNames.includes("no_runtime_direct_adapter_calls"), "no direct adapter calls");
  assert(sbNames.includes("no_secret_logging"), "no secret logging");
  assert(sbNames.includes("no_git_operations_by_adapters"), "no git operations");
  console.log("");

  // ── Test 8: Recommended next PR ──
  console.log("Test 8: Recommended next PR");
  assert(typeof m.recommended_next_pr.title === "string", "title is string");
  assert(m.recommended_next_pr.title.length > 0, "title non-empty");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
