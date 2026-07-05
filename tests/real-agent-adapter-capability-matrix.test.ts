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
  assert(kimi["executor_contract"] === "implemented_contract_only", "kimi executor contract implemented");
  assert(kimi["command_executor"] === "implemented_feature_flagged_isolated", "kimi command executor isolated");
  assert(kimi["command_executor_default_enabled"] === false, "kimi command executor default disabled");
  assert(kimi["command_executor_wired_to_gateway"] === false, "kimi command executor not wired to gateway");
  assert(kimi["command_executor_wired_to_runtime"] === false, "kimi command executor not wired to runtime");
  assert(kimi["gateway_integration_contract"] === "implemented_contract_only", "kimi gateway contract implemented");
  assert(kimi["gateway_integration_wired"] === false, "kimi gateway not wired");
  assert(kimi["gateway_integration_default_enabled"] === false, "kimi gateway default disabled");
  const gwFlags = kimi["gateway_integration_requires_flags"] as string[];
  assert(Array.isArray(gwFlags) && gwFlags.includes("SDLC_KIMI_GATEWAY_INTEGRATION=enabled"), "gateway requires gateway flag");
  assert(gwFlags.includes("SDLC_KIMI_CLI_COMMAND_EXECUTION=enabled"), "gateway requires command flag");
  assert(kimi["gateway_shadow_sidecar"] === "implemented_feature_flagged_sidecar", "kimi shadow sidecar implemented");
  assert(kimi["gateway_shadow_sidecar_default_enabled"] === false, "kimi shadow sidecar default disabled");
  assert(kimi["gateway_shadow_sidecar_wired_to_runtime"] === false, "kimi shadow sidecar not wired");
  assert(kimi["gateway_shadow_sidecar_changes_routing"] === false, "kimi shadow sidecar no routing");
  assert(kimi["gateway_shadow_sidecar_changes_final_status"] === false, "kimi shadow sidecar no final status");
  assert(kimi["runtime_attachment_contract"] === "implemented_contract_only", "kimi runtime attachment contract");
  assert(kimi["runtime_attachment_default_enabled"] === false, "kimi runtime attachment default disabled");
  assert(kimi["runtime_attachment_wired_to_runtime"] === false, "kimi runtime attachment not wired");
  assert(kimi["runtime_attachment_changes_routing"] === false, "kimi runtime attachment no routing");
  assert(kimi["runtime_attachment_changes_final_status"] === false, "kimi runtime attachment no final status");
  const kimiEvidence = kimi["evidence"] as string[];
  assert(kimiEvidence.includes("execution/kimi-runtime-attachment-contract.ts"), "kimi evidence includes runtime attachment contract");
  assert(kimiEvidence.includes("tests/kimi-runtime-attachment-contract.test.ts"), "kimi evidence includes runtime attachment test");
  assert(kimiEvidence.includes("core/kimi-runtime-shadow-attachment.ts"), "kimi evidence includes runtime shadow attachment helper");
  assert(kimiEvidence.includes("tests/kimi-runtime-shadow-attachment.test.ts"), "kimi evidence includes runtime shadow attachment test");
  assert(kimiEvidence.includes("tests/runtime-kimi-shadow-attachment.test.ts"), "kimi evidence includes runtime integration test");
  assert(kimi["runtime_shadow_attachment"] === "implemented_feature_flagged_runtime_sidecar", "kimi runtime shadow attachment");
  assert(kimi["runtime_shadow_attachment_default_enabled"] === false, "kimi runtime shadow attachment default disabled");
  assert(kimi["runtime_shadow_attachment_changes_routing"] === false, "kimi runtime shadow attachment no routing");
  assert(kimi["runtime_shadow_attachment_changes_final_status"] === false, "kimi runtime shadow attachment no final status");
  assert(kimi["runtime_shadow_attachment_changes_agent_selection"] === false, "kimi runtime shadow attachment no agent");
  assert(kimiEvidence.includes("execution/kimi-gateway-real-dispatch-contract.ts"), "kimi evidence includes real dispatch contract");
  assert(kimiEvidence.includes("tests/kimi-gateway-real-dispatch-contract.test.ts"), "kimi evidence includes real dispatch test");
  assert(kimi["gateway_real_dispatch_contract"] === "implemented_contract_only", "kimi real dispatch contract");
  assert(kimi["gateway_real_dispatch_default_enabled"] === false, "kimi real dispatch default disabled");
  assert(kimi["gateway_real_dispatch_wired_to_gateway"] === true, "kimi real dispatch wired");
  assert(kimi["gateway_real_dispatch_invokes_cli"] === false, "kimi real dispatch no CLI");
  assert(kimi["gateway_real_dispatch_changes_final_status"] === false, "kimi real dispatch no final status");
  const kimiRT = kimi["gateway_real_dispatch_supported_request_types"] as string[];
  assert(kimiRT.length === 1 && kimiRT.includes("llm_task"), "kimi real dispatch llm_task only");
  const kimiRF = kimi["gateway_real_dispatch_requires_flags"] as string[];
  assert(kimiRF.includes("SDLC_KIMI_GATEWAY_REAL_DISPATCH=enabled"), "kimi real dispatch requires real flag");
  assert(kimiRF.includes("SDLC_KIMI_GATEWAY_INTEGRATION=enabled") && kimiRF.includes("SDLC_KIMI_CLI_COMMAND_EXECUTION=enabled"), "kimi real dispatch 3 flags");
  assert(hermes["status"] === "cli_contract_stub_with_dry_run_harness", "hermes cli contract stub with dry-run harness");
  assert(hermes["dry_run_harness"] === "implemented_no_process_spawn", "hermes dry-run harness implemented");
  assert(hermes["executor_contract"] === "implemented_contract_only", "hermes executor contract implemented");
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
