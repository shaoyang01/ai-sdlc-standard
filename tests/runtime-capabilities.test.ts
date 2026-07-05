// Regression Test — Runtime Capabilities (Static Metadata)
// =========================================================
// Verifies the machine-readable capability file accurately
// reflects the current system state. No runtime, no DB, no agents.

import { loadRuntimeCapabilities } from "../core/runtime-capabilities";

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

  console.log("Runtime Capabilities Test\n");

  const caps = loadRuntimeCapabilities("runtime-capabilities.json");

  // ── Version ──
  console.log("Test 1: Version");
  assert(caps.version === 1, "version is 1");
  console.log("");

  // ── Runtime defaults ──
  console.log("Test 2: Runtime defaults");
  assert(caps.runtime["default_execution_mode"] === "shadow", "default execution mode is shadow");
  assert(caps.runtime["real_execution_default"] === false, "real execution is not default");
  console.log("");

  // ── Execution Gateway ──
  console.log("Test 3: Execution Gateway");
  const eg = caps.execution["execution_gateway"] as Record<string, unknown>;
  assert(eg !== undefined, "execution_gateway entry exists");
  assert(eg["status"] === "implemented", "execution gateway is implemented");
  assert(eg["role"] === "single execution boundary", "gateway role is single execution boundary");
  console.log("");

  // ── Agent Adapters ──
  console.log("Test 4: Agent adapters");
  const codex = caps.execution["codex_adapter"] as Record<string, unknown>;
  assert(codex !== undefined, "codex adapter entry exists");
  assert(codex["status"] === "implemented_feature_flagged", "codex is feature-flagged");
  assert(codex["default"] === false, "codex is not default");

  const kimi = caps.execution["kimi_adapter"] as Record<string, unknown>;
  assert(kimi !== undefined, "kimi adapter entry exists");
  assert(kimi["status"] === "not_implemented", "kimi is not implemented");
  assert(kimi["default"] === false, "kimi is not default");

  const hermes = caps.execution["hermes_adapter"] as Record<string, unknown>;
  assert(hermes !== undefined, "hermes adapter entry exists");
  assert(hermes["status"] === "not_implemented", "hermes is not implemented");
  assert(hermes["default"] === false, "hermes is not default");
  console.log("");

  // ── Memory defaults ──
  console.log("Test 5: Memory defaults");
  const mem = caps.memory["sqlite_policy_memory"] as Record<string, unknown>;
  assert(mem !== undefined, "sqlite_policy_memory entry exists");
  assert(mem["default_write"] === false, "memory write is not default");
  assert(mem["default_read"] === false, "memory read is not default");
  console.log("");

  // ── Routing ──
  console.log("Test 6: Routing");
  assert(caps.routing["memory_based_routing"] === "not_enabled", "memory-based routing is not enabled");
  assert(caps.routing["actual_agent_selection_changed_by_memory"] === false, "memory does not change agent selection");
  console.log("");

  // ── Self-evolution ──
  console.log("Test 7: Self-evolution");
  assert(caps.self_evolution["automatic_application"] === false, "auto-application is false");
  assert(caps.self_evolution["source_code_modification"] === false, "source modification is false");
  assert(caps.self_evolution["git_operations"] === false, "git operations are false");
  console.log("");

  // ── Safety boundaries ──
  console.log("Test 8: Safety boundaries");
  assert(caps.safety_boundaries["no_self_modifying_code"] === true, "no self-modifying code");
  assert(caps.safety_boundaries["no_auto_policy_mutation"] === true, "no auto policy mutation");
  assert(caps.safety_boundaries["no_auto_git_operations"] === true, "no auto git operations");
  assert(caps.safety_boundaries["no_default_real_model_execution"] === true, "no default real execution");
  assert(caps.safety_boundaries["no_default_memory_persistence"] === true, "no default memory persistence");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
