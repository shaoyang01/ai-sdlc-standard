// Regression Test — Real Agent Adapter Capability Matrix (Static)
// ================================================================
// Verifies the machine-readable adapter matrix is accurate.
// No runtime, no Gateway, no adapters, no network.

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

  const raw = fs.readFileSync("real-agent-adapter-capability-matrix.json", "utf-8");
  const m = JSON.parse(raw);

  console.log("Real Agent Adapter Capability Matrix Test\n");

  // ── Test 1: Basic structure ──
  console.log("Test 1: Basic structure");
  assert(m.version === 1, "version is 1");
  assert(m.default_execution_mode === "shadow", "default is shadow");
  assert(m.real_execution_default === false, "real execution not default");
  assert(Array.isArray(m.adapters), "adapters is array");
  assert(Array.isArray(m.request_types), "request_types is array");
  assert(Array.isArray(m.feature_flags), "feature_flags is array");
  assert(Array.isArray(m.safety_boundaries), "safety_boundaries is array");
  assert(typeof m.recommended_next_pr === "object", "recommended_next_pr exists");
  console.log("");

  // ── Test 2: Adapter statuses ──
  console.log("Test 2: Adapter statuses");
  const shadow = m.adapters.find((a: Record<string, unknown>) => a["adapter"] === "shadow");
  const codex = m.adapters.find((a: Record<string, unknown>) => a["adapter"] === "codex");
  const kimi = m.adapters.find((a: Record<string, unknown>) => a["adapter"] === "kimi");
  const hermes = m.adapters.find((a: Record<string, unknown>) => a["adapter"] === "hermes");
  assert(shadow !== undefined, "shadow adapter exists");
  assert(codex !== undefined, "codex adapter exists");
  assert(kimi !== undefined, "kimi adapter exists");
  assert(hermes !== undefined, "hermes adapter exists");
  assert(shadow["status"] === "implemented", "shadow is implemented");
  assert(codex["status"] === "feature_flagged_partial", "codex is feature_flagged_partial");
  assert(kimi["status"] === "not_implemented", "kimi is not_implemented");
  assert(hermes["status"] === "not_implemented", "hermes is not_implemented");
  console.log("");

  // ── Test 3: Request types ──
  console.log("Test 3: Request types");
  const rtNames = m.request_types.map((r: Record<string, unknown>) => r["request_type"]);
  assert(rtNames.includes("code_generation"), "has code_generation");
  assert(rtNames.includes("validation"), "has validation");
  const cg = m.request_types.find((r: Record<string, unknown>) => r["request_type"] === "code_generation");
  assert(cg["recommended_real_adapter"] === "codex", "code_generation → codex");
  const val = m.request_types.find((r: Record<string, unknown>) => r["request_type"] === "validation");
  assert(val["recommended_real_adapter"] === "hermes", "validation → hermes");
  const llm = m.request_types.find((r: Record<string, unknown>) => r["request_type"] === "llm_task");
  assert(llm["recommended_real_adapter"] === "kimi", "llm_task → kimi");
  console.log("");

  // ── Test 4: Feature flags ──
  console.log("Test 4: Feature flags");
  const ffNames = m.feature_flags.map((f: Record<string, unknown>) => f["flag"]);
  assert(ffNames.includes("SDLC_EXECUTION_MODE"), "has SDLC_EXECUTION_MODE");
  assert(ffNames.includes("SDLC_KIMI_ADAPTER"), "has SDLC_KIMI_ADAPTER");
  assert(ffNames.includes("SDLC_HERMES_ADAPTER"), "has SDLC_HERMES_ADAPTER");
  assert(ffNames.includes("SDLC_REAL_ADAPTER_FALLBACK"), "has SDLC_REAL_ADAPTER_FALLBACK");
  console.log("");

  // ── Test 5: Safety boundaries ──
  console.log("Test 5: Safety boundaries");
  const sbNames = m.safety_boundaries.map((s: Record<string, unknown>) => s["name"]);
  assert(sbNames.includes("no_default_real_model_execution"), "no default real execution");
  assert(sbNames.includes("real_adapters_behind_execution_gateway"), "adapters behind gateway");
  assert(sbNames.includes("no_runtime_direct_adapter_calls"), "no direct adapter calls");
  assert(sbNames.includes("no_secret_logging"), "no secret logging");
  assert(sbNames.includes("no_git_operations_by_adapters"), "no git operations");
  console.log("");

  // ── Test 6: Recommended next PR ──
  console.log("Test 6: Recommended next PR");
  assert(typeof m.recommended_next_pr.title === "string", "title is string");
  assert(m.recommended_next_pr.title.length > 0, "title is non-empty");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
