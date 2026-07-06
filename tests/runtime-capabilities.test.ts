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

  // ── Skills ──
  console.log("Test 9: Skills");
  assert(caps.skills["agent_skill_registry"] === "implemented_metadata_only", "agent skill registry is metadata-only");
  assert(caps.skills["skill_invocation_contract"] === "implemented_metadata_only", "skill invocation contract is metadata-only");
  assert(caps.skills["runtime_auto_skill_annotation"] === "disabled", "runtime auto skill annotation is disabled");
  assert(caps.skills["skill_metadata_explicit_only"] === true, "skill metadata is explicit-only");
  assert(caps.skills["affects_runtime_routing"] === false, "does not affect runtime routing");
  assert(caps.skills["affects_agent_selection"] === false, "does not affect agent selection");
  assert(caps.skills["affects_execution_dispatch"] === false, "does not affect execution dispatch");
  assert(caps.skills["real_adapter_enablement"] === false, "does not enable real adapters");
  console.log("");

  // ── Real Agent Adapter Integration ──
  console.log("Test 10: Real agent adapter integration metadata");
  const realAdapters = caps.real_agent_adapter_integration as Record<string, unknown>;
  assert(realAdapters !== undefined, "real_agent_adapter_integration exists");
  assert(realAdapters["kimi_cli_adapter_contract_stub"] === "implemented_contract_only", "kimi CLI contract stub");
  assert(realAdapters["hermes_cli_adapter_contract_stub"] === "implemented_contract_only", "hermes CLI contract stub");
  assert(realAdapters["real_kimi_cli_adapter"] === "not_implemented", "real Kimi CLI not implemented");
  assert(realAdapters["real_hermes_cli_adapter"] === "not_implemented", "real Hermes CLI not implemented");
  assert(realAdapters["kimi_cli_adapter_dry_run_harness"] === "implemented_no_process_spawn", "kimi dry-run harness");
  assert(realAdapters["kimi_cli_adapter_dry_run_invokes_cli"] === false, "kimi dry-run no CLI");
  assert(realAdapters["kimi_cli_adapter_dry_run_spawns_process"] === false, "kimi dry-run no spawn");
  assert(realAdapters["kimi_cli_adapter_dry_run_affects_gateway"] === false, "kimi dry-run no gateway");
  assert(realAdapters["kimi_cli_adapter_dry_run_affects_runtime"] === false, "kimi dry-run no runtime");
  assert(realAdapters["kimi_cli_adapter_dry_run_persists_audit"] === false, "kimi dry-run no persist");
  assert(realAdapters["kimi_cli_adapter_dry_run_reads_api_keys"] === false, "kimi dry-run no API keys");
  assert(realAdapters["hermes_cli_adapter_dry_run_harness"] === "implemented_no_process_spawn", "hermes dry-run harness");
  assert(realAdapters["hermes_cli_adapter_dry_run_invokes_cli"] === false, "hermes dry-run no CLI");
  assert(realAdapters["hermes_cli_adapter_dry_run_spawns_process"] === false, "hermes dry-run no spawn");
  assert(realAdapters["hermes_cli_adapter_dry_run_affects_gateway"] === false, "hermes dry-run no gateway");
  assert(realAdapters["hermes_cli_adapter_dry_run_affects_runtime"] === false, "hermes dry-run no runtime");
  assert(realAdapters["hermes_cli_adapter_dry_run_persists_audit"] === false, "hermes dry-run no persist");
  assert(realAdapters["hermes_cli_adapter_dry_run_reads_api_keys"] === false, "hermes dry-run no API keys");
  assert(realAdapters["kimi_cli_adapter_reads_api_keys"] === false, "kimi adapter no API keys");
  assert(realAdapters["hermes_cli_adapter_reads_api_keys"] === false, "hermes adapter no API keys");
  assert(realAdapters["kimi_cli_executor_contract"] === "implemented_contract_only", "kimi executor contract");
  assert(realAdapters["kimi_cli_executor_contract_invokes_cli"] === false, "kimi executor no CLI");
  assert(realAdapters["kimi_cli_executor_contract_spawns_process"] === false, "kimi executor no spawn");
  assert(realAdapters["kimi_cli_executor_contract_affects_gateway"] === false, "kimi executor no gateway");
  assert(realAdapters["kimi_cli_executor_contract_affects_runtime"] === false, "kimi executor no runtime");
  assert(realAdapters["kimi_cli_executor_contract_persists_audit"] === false, "kimi executor no persist");
  assert(realAdapters["kimi_cli_executor_contract_reads_api_keys"] === false, "kimi executor no API keys");
  assert(realAdapters["hermes_cli_executor_contract"] === "implemented_contract_only", "hermes executor contract");
  assert(realAdapters["hermes_cli_executor_contract_invokes_cli"] === false, "hermes executor no CLI");
  assert(realAdapters["hermes_cli_executor_contract_spawns_process"] === false, "hermes executor no spawn");
  assert(realAdapters["hermes_cli_executor_contract_affects_gateway"] === false, "hermes executor no gateway");
  assert(realAdapters["hermes_cli_executor_contract_affects_runtime"] === false, "hermes executor no runtime");
  assert(realAdapters["hermes_cli_executor_contract_persists_audit"] === false, "hermes executor no persist");
  assert(realAdapters["hermes_cli_executor_contract_reads_api_keys"] === false, "hermes executor no API keys");
  assert(realAdapters["kimi_cli_command_executor"] === "implemented_feature_flagged_isolated", "kimi command executor implemented");
  assert(realAdapters["kimi_cli_command_executor_default_enabled"] === false, "kimi command executor default disabled");
  assert(realAdapters["kimi_cli_command_executor_requires_flag"] === "SDLC_KIMI_CLI_COMMAND_EXECUTION=enabled", "kimi command executor requires flag");
  assert(realAdapters["kimi_cli_command_executor_wired_to_gateway"] === false, "kimi command executor not wired to gateway");
  assert(realAdapters["kimi_cli_command_executor_wired_to_runtime"] === false, "kimi command executor not wired to runtime");
  assert(realAdapters["kimi_cli_command_executor_persists_audit"] === false, "kimi command executor no persist audit");
  assert(realAdapters["kimi_cli_command_executor_reads_api_keys"] === false, "kimi command executor no API keys");
  assert(realAdapters["kimi_cli_command_executor_invokes_cli_by_default"] === false, "kimi command executor no CLI by default");
  assert(realAdapters["kimi_gateway_integration_contract"] === "implemented_contract_only", "kimi gateway contract");
  assert(realAdapters["kimi_gateway_integration_wired_to_gateway"] === false, "kimi gateway not wired to gateway");
  assert(realAdapters["kimi_gateway_integration_wired_to_runtime"] === false, "kimi gateway not wired to runtime");
  assert(realAdapters["kimi_gateway_integration_default_enabled"] === false, "kimi gateway default disabled");
  const gwFlags = realAdapters["kimi_gateway_integration_requires_flags"] as string[];
  assert(Array.isArray(gwFlags) && gwFlags.includes("SDLC_KIMI_GATEWAY_INTEGRATION=enabled"), "gateway requires gateway flag");
  assert(gwFlags.includes("SDLC_KIMI_CLI_COMMAND_EXECUTION=enabled"), "gateway requires command flag");
  assert(realAdapters["kimi_gateway_integration_invokes_cli"] === false, "kimi gateway no CLI");
  assert(realAdapters["kimi_gateway_integration_spawns_process"] === false, "kimi gateway no spawn");
  assert(realAdapters["kimi_gateway_integration_changes_final_status"] === false, "kimi gateway no final status change");
  assert(realAdapters["kimi_gateway_shadow_sidecar"] === "implemented_feature_flagged_sidecar", "kimi shadow sidecar");
  assert(realAdapters["kimi_gateway_shadow_sidecar_default_enabled"] === false, "kimi shadow sidecar default disabled");
  const shadowFlags = realAdapters["kimi_gateway_shadow_sidecar_requires_flags"] as string[];
  assert(Array.isArray(shadowFlags) && shadowFlags.includes("SDLC_KIMI_GATEWAY_SHADOW=enabled"), "shadow requires shadow flag");
  assert(shadowFlags.includes("SDLC_KIMI_GATEWAY_INTEGRATION=enabled") && shadowFlags.includes("SDLC_KIMI_CLI_COMMAND_EXECUTION=enabled"), "shadow requires all 3 flags");
  assert(realAdapters["kimi_gateway_shadow_sidecar_wired_to_runtime"] === false, "shadow not wired to runtime");
  assert(realAdapters["kimi_gateway_shadow_sidecar_changes_final_status"] === false, "shadow no final status change");
  assert(realAdapters["kimi_gateway_shadow_sidecar_changes_routing"] === false, "shadow no routing change");
  assert(realAdapters["kimi_gateway_shadow_sidecar_primary_gateway_unchanged"] === true, "shadow primary gateway unchanged");
  assert(realAdapters["kimi_runtime_attachment_contract"] === "implemented_contract_only", "kimi runtime attachment contract");
  assert(realAdapters["kimi_runtime_attachment_default_enabled"] === false, "kimi runtime attachment default disabled");
  assert(realAdapters["kimi_runtime_attachment_requires_flag"] === "SDLC_KIMI_RUNTIME_ATTACHMENT=enabled", "kimi runtime attachment flag");
  assert(realAdapters["kimi_runtime_attachment_wired_to_runtime"] === false, "kimi runtime attachment not wired");
  assert(realAdapters["kimi_runtime_attachment_changes_final_status"] === false, "kimi runtime attachment no final status");
  assert(realAdapters["kimi_runtime_attachment_changes_routing"] === false, "kimi runtime attachment no routing");
  assert(realAdapters["kimi_runtime_attachment_changes_agent_selection"] === false, "kimi runtime attachment no agent selection");
  assert(realAdapters["kimi_runtime_attachment_persists_audit"] === false, "kimi runtime attachment no persist");
  assert(realAdapters["kimi_runtime_attachment_writes_files"] === false, "kimi runtime attachment no files");
  assert(realAdapters["kimi_runtime_shadow_attachment"] === "implemented_feature_flagged_runtime_sidecar", "kimi runtime shadow attachment");
  assert(realAdapters["kimi_runtime_shadow_attachment_default_enabled"] === false, "kimi runtime shadow attachment default disabled");
  const rsFlags = realAdapters["kimi_runtime_shadow_attachment_requires_flags"] as string[];
  assert(Array.isArray(rsFlags) && rsFlags.includes("SDLC_KIMI_RUNTIME_ATTACHMENT=enabled"), "requires runtime attachment flag");
  assert(rsFlags.includes("SDLC_KIMI_GATEWAY_SHADOW=enabled") && rsFlags.includes("SDLC_KIMI_GATEWAY_INTEGRATION=enabled") && rsFlags.includes("SDLC_KIMI_CLI_COMMAND_EXECUTION=enabled"), "requires all 4 flags");
  assert(realAdapters["kimi_runtime_shadow_attachment_changes_final_status"] === false, "runtime shadow no final status");
  assert(realAdapters["kimi_runtime_shadow_attachment_changes_routing"] === false, "runtime shadow no routing");
  assert(realAdapters["kimi_runtime_shadow_attachment_changes_agent_selection"] === false, "runtime shadow no agent");
  assert(realAdapters["kimi_runtime_shadow_attachment_primary_runtime_unchanged"] === true, "runtime shadow primary unchanged");
  assert(realAdapters["kimi_runtime_shadow_attachment_primary_gateway_unchanged"] === true, "runtime shadow gateway unchanged");
  assert(realAdapters["kimi_runtime_shadow_attachment_persists_audit"] === false, "runtime shadow no persist");
  assert(realAdapters["kimi_runtime_shadow_attachment_writes_files"] === false, "runtime shadow no files");
  assert(realAdapters["kimi_gateway_real_dispatch_contract"] === "implemented_contract_only", "kimi real dispatch contract");
  assert(realAdapters["kimi_gateway_real_dispatch_default_enabled"] === false, "kimi real dispatch default disabled");
  assert(realAdapters["kimi_gateway_real_dispatch_wired_to_gateway"] === true, "kimi real dispatch wired to gateway");
  assert(realAdapters["kimi_gateway_real_dispatch_wired_to_runtime"] === false, "kimi real dispatch not wired runtime");
  const rdTypes = realAdapters["kimi_gateway_real_dispatch_supported_request_types"] as string[];
  assert(Array.isArray(rdTypes) && rdTypes.length === 1 && rdTypes.includes("llm_task"), "kimi real dispatch llm_task only");
  const rdFlags = realAdapters["kimi_gateway_real_dispatch_requires_flags"] as string[];
  assert(rdFlags.includes("SDLC_KIMI_GATEWAY_REAL_DISPATCH=enabled"), "real dispatch requires real flag");
  assert(rdFlags.includes("SDLC_KIMI_GATEWAY_INTEGRATION=enabled") && rdFlags.includes("SDLC_KIMI_CLI_COMMAND_EXECUTION=enabled"), "real dispatch 3 flags");
  assert(realAdapters["kimi_gateway_real_dispatch_invokes_cli"] === false, "real dispatch no CLI");
  assert(realAdapters["kimi_gateway_real_dispatch_spawns_process"] === false, "real dispatch no spawn");
  assert(realAdapters["kimi_gateway_real_dispatch_changes_final_status"] === false, "real dispatch no final status");
  assert(realAdapters["kimi_gateway_real_dispatch_changes_routing"] === false, "real dispatch no routing");
  assert(realAdapters["kimi_gateway_real_dispatch_writes_files"] === false, "real dispatch no files");
  assert(realAdapters["kimi_gateway_real_dispatch_persists_audit"] === false, "real dispatch no persist");
  assert(realAdapters["kimi_gateway_real_dispatch_fallback_policy"] === "implemented", "kimi fallback policy");
  assert(realAdapters["kimi_gateway_real_dispatch_fallback_default_action"] === "fall_through_to_shadow", "kimi fallback shadow");
  assert(realAdapters["kimi_gateway_real_dispatch_failure_returns_structured_error"] === true, "kimi failure structured");
  assert(realAdapters["kimi_gateway_real_dispatch_timeout_returns_structured_error"] === true, "kimi timeout structured");
  assert(realAdapters["kimi_gateway_real_dispatch_errors_sanitized"] === true, "kimi errors sanitized");
  assert(realAdapters["kimi_gateway_real_dispatch_expands_request_types"] === false, "kimi no request type expansion");
  assert(realAdapters["kimi_gateway_real_dispatch_observability"] === "implemented", "kimi observability");
  assert(realAdapters["kimi_gateway_real_dispatch_observability_default_persisted"] === false, "kimi obs not persisted");
  assert(realAdapters["kimi_gateway_real_dispatch_observability_contains_raw_prompt"] === false, "kimi obs no prompt");
  assert(realAdapters["kimi_gateway_real_dispatch_observability_contains_raw_artifacts"] === false, "kimi obs no artifacts");
  assert(realAdapters["kimi_gateway_real_dispatch_observability_contains_secrets"] === false, "kimi obs no secrets");
  assert(realAdapters["kimi_gateway_real_dispatch_observability_changes_final_status"] === false, "kimi obs no final status");
  assert(realAdapters["kimi_gateway_real_dispatch_observability_changes_routing"] === false, "kimi obs no routing");
  assert(realAdapters["kimi_gateway_real_dispatch_guardrails"] === "implemented", "kimi guardrails implemented");
  assert(realAdapters["kimi_gateway_real_dispatch_guardrails_default_enabled"] === true, "kimi guardrails default enabled when dispatch enabled");
  assert(realAdapters["kimi_gateway_real_dispatch_guardrails_blocks_large_prompt"] === true, "kimi guardrails block large prompt");
  assert(realAdapters["kimi_gateway_real_dispatch_guardrails_blocks_large_input"] === true, "kimi guardrails block large input");
  assert(realAdapters["kimi_gateway_real_dispatch_guardrails_validates_cli_config"] === true, "kimi guardrails validate config");
  assert(realAdapters["kimi_gateway_real_dispatch_guardrails_validates_timeout"] === true, "kimi guardrails validate timeout");
  assert(realAdapters["kimi_gateway_real_dispatch_guardrails_clamps_output_summaries"] === true, "kimi guardrails clamp summaries");
  assert(realAdapters["kimi_gateway_real_dispatch_guardrails_expands_request_types"] === false, "kimi guardrails no request expansion");
  assert(realAdapters["kimi_gateway_real_dispatch_guardrails_changes_final_status"] === false, "kimi guardrails no final status change");
  assert(realAdapters["kimi_gateway_real_dispatch_guardrails_changes_routing"] === false, "kimi guardrails no routing change");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
