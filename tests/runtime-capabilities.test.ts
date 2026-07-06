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
  assert(realAdapters["hermes_cli_command_executor"] === "implemented_feature_flagged_isolated", "hermes command executor implemented");
  assert(realAdapters["hermes_cli_command_executor_default_enabled"] === false, "hermes command executor default disabled");
  assert(realAdapters["hermes_cli_command_executor_wired_to_gateway"] === false, "hermes command executor not wired gateway");
  assert(realAdapters["hermes_cli_command_executor_wired_to_runtime"] === false, "hermes command executor not wired runtime");
  assert(realAdapters["hermes_cli_command_executor_requires_flag"] === "SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled", "hermes command executor flag");
  assert(realAdapters["hermes_cli_command_executor_uses_fake_runner_in_tests"] === true, "hermes command executor fake runner");
  assert(realAdapters["hermes_cli_command_executor_writes_files"] === false, "hermes command executor no files");
  assert(realAdapters["hermes_cli_command_executor_persists_audit"] === false, "hermes command executor no persist");
  assert(realAdapters["hermes_cli_command_executor_changes_final_status"] === false, "hermes command executor no final status");
  assert(realAdapters["hermes_cli_command_executor_changes_routing"] === false, "hermes command executor no routing");
  assert(realAdapters["hermes_gateway_integration_contract"] === "implemented_contract_only", "hermes gateway contract implemented");
  assert(realAdapters["hermes_gateway_integration_contract_default_enabled"] === false, "hermes gateway default disabled");
  assert(realAdapters["hermes_gateway_integration_contract_wired_to_gateway"] === false, "hermes gateway not wired gateway");
  assert(realAdapters["hermes_gateway_integration_contract_wired_to_runtime"] === false, "hermes gateway not wired runtime");
  assert(realAdapters["hermes_gateway_integration_contract_invokes_cli"] === false, "hermes gateway no CLI");
  assert(realAdapters["hermes_gateway_integration_contract_spawns_process"] === false, "hermes gateway no spawn");
  const hgwSupported = realAdapters["hermes_gateway_integration_contract_supported_request_types"] as string[];
  assert(Array.isArray(hgwSupported) && hgwSupported.includes("review") && hgwSupported.includes("code_review") && hgwSupported.includes("validation"), "hermes gateway supported types");
  const hgwUnsupported = realAdapters["hermes_gateway_integration_contract_unsupported_request_types"] as string[];
  assert(Array.isArray(hgwUnsupported) && hgwUnsupported.includes("llm_task") && hgwUnsupported.includes("code_generation") && hgwUnsupported.includes("bugfix"), "hermes gateway unsupported types");
  const hgwFlags = realAdapters["hermes_gateway_integration_contract_requires_flags"] as string[];
  assert(Array.isArray(hgwFlags) && hgwFlags.length === 2, "hermes gateway 2 flags");
  assert(hgwFlags.includes("SDLC_HERMES_GATEWAY_INTEGRATION=enabled") && hgwFlags.includes("SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled"), "hermes gateway flags correct");
  assert(realAdapters["hermes_gateway_integration_contract_changes_final_status"] === false, "hermes gateway no final status");
  assert(realAdapters["hermes_gateway_integration_contract_changes_routing"] === false, "hermes gateway no routing");
  assert(realAdapters["hermes_gateway_shadow_sidecar"] === "implemented_feature_flagged_sidecar", "hermes shadow sidecar implemented");
  assert(realAdapters["hermes_gateway_shadow_sidecar_default_enabled"] === false, "hermes shadow sidecar default disabled");
  assert(realAdapters["hermes_gateway_shadow_sidecar_wired_to_gateway"] === false, "hermes shadow sidecar not wired gateway");
  assert(realAdapters["hermes_gateway_shadow_sidecar_wired_to_runtime"] === false, "hermes shadow sidecar not wired runtime");
  const hssFlags = realAdapters["hermes_gateway_shadow_sidecar_requires_flags"] as string[];
  assert(Array.isArray(hssFlags) && hssFlags.length === 3, "hermes shadow 3 flags");
  assert(hssFlags.includes("SDLC_HERMES_GATEWAY_SHADOW=enabled") && hssFlags.includes("SDLC_HERMES_GATEWAY_INTEGRATION=enabled") && hssFlags.includes("SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled"), "hermes shadow flags correct");
  const hssSupported = realAdapters["hermes_gateway_shadow_sidecar_supported_request_types"] as string[];
  assert(Array.isArray(hssSupported) && hssSupported.includes("review") && hssSupported.includes("code_review") && hssSupported.includes("validation"), "hermes shadow supported types");
  const hssUnsupported = realAdapters["hermes_gateway_shadow_sidecar_unsupported_request_types"] as string[];
  assert(Array.isArray(hssUnsupported) && hssUnsupported.includes("llm_task") && hssUnsupported.includes("code_generation") && hssUnsupported.includes("bugfix"), "hermes shadow unsupported types");
  assert(realAdapters["hermes_gateway_shadow_sidecar_affects_primary_gateway_result"] === false, "hermes shadow no primary gateway");
  assert(realAdapters["hermes_gateway_shadow_sidecar_changes_final_status"] === false, "hermes shadow no final status");
  assert(realAdapters["hermes_gateway_shadow_sidecar_changes_routing"] === false, "hermes shadow no routing");
  assert(realAdapters["hermes_gateway_shadow_sidecar_writes_files"] === false, "hermes shadow no files");
  assert(realAdapters["hermes_gateway_shadow_sidecar_persists_audit"] === false, "hermes shadow no persist");
  assert(realAdapters["hermes_gateway_shadow_sidecar_uses_fake_runner_in_tests"] === true, "hermes shadow fake runner");
  assert(realAdapters["hermes_runtime_attachment_contract"] === "implemented_contract_only", "hermes runtime attachment contract");
  assert(realAdapters["hermes_runtime_attachment_contract_default_enabled"] === false, "hermes runtime attachment default disabled");
  assert(realAdapters["hermes_runtime_attachment_contract_wired_to_runtime"] === false, "hermes runtime attachment not wired");
  assert(realAdapters["hermes_runtime_attachment_contract_changes_final_status"] === false, "hermes runtime attachment no final status");
  assert(realAdapters["hermes_runtime_attachment_contract_changes_routing"] === false, "hermes runtime attachment no routing");
  assert(realAdapters["hermes_runtime_attachment_contract_writes_files"] === false, "hermes runtime attachment no files");
  assert(realAdapters["hermes_runtime_attachment_contract_persists_audit"] === false, "hermes runtime attachment no persist");
  assert(realAdapters["hermes_runtime_attachment_contract_contains_raw_prompt"] === false, "hermes runtime attachment no raw prompt");
  assert(realAdapters["hermes_runtime_attachment_contract_contains_raw_artifacts"] === false, "hermes runtime attachment no raw artifacts");
  assert(realAdapters["hermes_runtime_attachment_contract_contains_secrets"] === false, "hermes runtime attachment no secrets");
  assert(realAdapters["hermes_runtime_attachment_contract_requires_flag"] === "SDLC_HERMES_RUNTIME_ATTACHMENT=enabled", "hermes runtime attachment flag");
  assert(realAdapters["hermes_runtime_shadow_attachment"] === "implemented_feature_flagged_helper", "hermes runtime shadow helper");
  assert(realAdapters["hermes_runtime_shadow_attachment_default_enabled"] === false, "hermes runtime shadow default disabled");
  assert(realAdapters["hermes_runtime_shadow_attachment_wired_to_runtime"] === false, "hermes runtime shadow not wired");
  assert(realAdapters["hermes_runtime_shadow_attachment_requires_flag"] === "SDLC_HERMES_RUNTIME_ATTACHMENT=enabled", "hermes runtime shadow flag");
  assert(realAdapters["hermes_runtime_shadow_attachment_invokes_sidecar_when_enabled"] === true, "hermes runtime shadow invokes sidecar");
  assert(realAdapters["hermes_runtime_shadow_attachment_uses_fake_runner_in_tests"] === true, "hermes runtime shadow fake runner");
  assert(realAdapters["hermes_runtime_shadow_attachment_changes_final_status"] === false, "hermes runtime shadow no final status");
  assert(realAdapters["hermes_runtime_shadow_attachment_changes_routing"] === false, "hermes runtime shadow no routing");
  assert(realAdapters["hermes_runtime_shadow_attachment_affects_primary_gateway_result"] === false, "hermes runtime shadow no primary");
  assert(realAdapters["hermes_runtime_shadow_attachment_writes_files"] === false, "hermes runtime shadow no files");
  assert(realAdapters["hermes_runtime_shadow_attachment_persists_audit"] === false, "hermes runtime shadow no persist");
  assert(realAdapters["hermes_runtime_shadow_attachment_contains_raw_prompt"] === false, "hermes runtime shadow no raw prompt");
  assert(realAdapters["hermes_runtime_shadow_attachment_contains_raw_artifacts"] === false, "hermes runtime shadow no raw artifacts");
  assert(realAdapters["hermes_runtime_shadow_attachment_contains_secrets"] === false, "hermes runtime shadow no secrets");
  assert(realAdapters["hermes_runtime_shadow_attachment_wiring_contract"] === "implemented_contract_only", "hermes wiring contract");
  assert(realAdapters["hermes_runtime_shadow_attachment_wiring_contract_default_enabled"] === false, "hermes wiring default disabled");
  assert(realAdapters["hermes_runtime_shadow_attachment_wiring_contract_wired_to_runtime"] === false, "hermes wiring not wired");
  assert(realAdapters["hermes_runtime_shadow_attachment_wiring_contract_field"] === "hermes_runtime_shadow_attachment", "hermes wiring field");
  assert(realAdapters["hermes_runtime_shadow_attachment_wiring_contract_conditional_field_only"] === true, "hermes wiring conditional");
  assert(realAdapters["hermes_runtime_shadow_attachment_wiring_contract_omit_when_disabled"] === true, "hermes wiring omit");
  assert(realAdapters["hermes_runtime_shadow_attachment_wiring_contract_never_undefined_key"] === true, "hermes wiring no undefined");
  assert(realAdapters["hermes_runtime_shadow_attachment_wiring_contract_changes_runtime_result_shape_now"] === false, "hermes wiring no shape now");
  assert(realAdapters["hermes_runtime_shadow_attachment_wiring_contract_changes_final_status"] === false, "hermes wiring no final status");
  assert(realAdapters["hermes_runtime_shadow_attachment_wiring_contract_changes_routing"] === false, "hermes wiring no routing");
  assert(realAdapters["hermes_runtime_shadow_attachment_wiring_contract_affects_primary_gateway_result"] === false, "hermes wiring no primary");
  assert(realAdapters["hermes_runtime_shadow_attachment_wiring_contract_writes_files"] === false, "hermes wiring no files");
  assert(realAdapters["hermes_runtime_shadow_attachment_wiring_contract_persists_audit"] === false, "hermes wiring no persist");
  assert(realAdapters["hermes_runtime_shadow_attachment_runtime_integration"] === "implemented_feature_flagged_runtime_sidecar", "hermes runtime integration");
  assert(realAdapters["hermes_runtime_shadow_attachment_runtime_integration_default_enabled"] === false, "hermes runtime int default disabled");
  assert(realAdapters["hermes_runtime_shadow_attachment_runtime_integration_wired_to_runtime"] === true, "hermes runtime int wired");
  assert(realAdapters["hermes_runtime_shadow_attachment_runtime_integration_field"] === "hermes_runtime_shadow_attachment", "hermes runtime int field");
  assert(realAdapters["hermes_runtime_shadow_attachment_runtime_integration_omit_when_disabled"] === true, "hermes runtime int omit");
  assert(realAdapters["hermes_runtime_shadow_attachment_runtime_integration_never_undefined_key"] === true, "hermes runtime int no undefined");
  assert(realAdapters["hermes_runtime_shadow_attachment_runtime_integration_changes_final_status"] === false, "hermes runtime int no final status");
  assert(realAdapters["hermes_runtime_shadow_attachment_runtime_integration_changes_routing"] === false, "hermes runtime int no routing");
  assert(realAdapters["hermes_runtime_shadow_attachment_runtime_integration_affects_primary_gateway_result"] === false, "hermes runtime int no primary");
  assert(realAdapters["hermes_runtime_shadow_attachment_runtime_integration_writes_files"] === false, "hermes runtime int no files");
  assert(realAdapters["hermes_runtime_shadow_attachment_runtime_integration_persists_audit"] === false, "hermes runtime int no persist");
  assert(realAdapters["hermes_runtime_shadow_attachment_runtime_integration_uses_fake_builder_in_tests"] === true, "hermes runtime int fake builder");
  assert(realAdapters["hermes_runtime_shadow_attachment_runtime_integration_requires_flag"] === "SDLC_HERMES_RUNTIME_ATTACHMENT=enabled", "hermes runtime int flag");
  assert(realAdapters["hermes_runtime_shadow_attachment_audit_metadata"] === "implemented_in_memory_sidecar_metadata", "hermes audit metadata");
  assert(realAdapters["hermes_runtime_shadow_attachment_audit_metadata_persisted"] === false, "hermes audit no persist");
  assert(realAdapters["hermes_runtime_shadow_attachment_audit_metadata_writes_files"] === false, "hermes audit no files");
  assert(realAdapters["hermes_runtime_shadow_attachment_audit_metadata_changes_final_status"] === false, "hermes audit no final status");
  assert(realAdapters["hermes_runtime_shadow_attachment_audit_metadata_changes_routing"] === false, "hermes audit no routing");
  assert(realAdapters["hermes_runtime_shadow_attachment_audit_metadata_affects_primary_gateway_result"] === false, "hermes audit no primary");
  assert(realAdapters["hermes_runtime_shadow_attachment_audit_metadata_contains_raw_prompt"] === false, "hermes audit no raw prompt");
  assert(realAdapters["hermes_runtime_shadow_attachment_audit_metadata_contains_raw_artifacts"] === false, "hermes audit no raw artifacts");
  assert(realAdapters["hermes_runtime_shadow_attachment_audit_metadata_contains_secrets"] === false, "hermes audit no secrets");
  assert(realAdapters["hermes_runtime_shadow_attachment_audit_metadata_field"] === "auditMetadata", "hermes audit field");
  assert(realAdapters["hermes_runtime_shadow_attachment_observability_summary"] === "implemented_in_memory_sidecar_metadata", "hermes obs summary");
  assert(realAdapters["hermes_runtime_shadow_attachment_observability_summary_persisted"] === false, "hermes obs no persist");
  assert(realAdapters["hermes_runtime_shadow_attachment_observability_summary_writes_files"] === false, "hermes obs no files");
  assert(realAdapters["hermes_runtime_shadow_attachment_observability_summary_changes_final_status"] === false, "hermes obs no final status");
  assert(realAdapters["hermes_runtime_shadow_attachment_observability_summary_changes_routing"] === false, "hermes obs no routing");
  assert(realAdapters["hermes_runtime_shadow_attachment_observability_summary_affects_primary_gateway_result"] === false, "hermes obs no primary");
  assert(realAdapters["hermes_runtime_shadow_attachment_observability_summary_contains_raw_prompt"] === false, "hermes obs no raw prompt");
  assert(realAdapters["hermes_runtime_shadow_attachment_observability_summary_contains_raw_artifacts"] === false, "hermes obs no raw artifacts");
  assert(realAdapters["hermes_runtime_shadow_attachment_observability_summary_contains_secrets"] === false, "hermes obs no secrets");
  assert(realAdapters["hermes_runtime_shadow_attachment_observability_summary_field"] === "observabilitySummary", "hermes obs field");
  assert(realAdapters["hermes_runtime_shadow_attachment_final_readiness_review"] === "implemented_review_only", "hermes readiness review");
  assert(realAdapters["hermes_runtime_shadow_attachment_final_readiness_verdict"] === "READY_WITH_CONSTRAINTS", "hermes readiness verdict");
  assert(realAdapters["hermes_runtime_shadow_attachment_final_readiness_runtime_active_by_default"] === false, "hermes readiness not active");
  assert(realAdapters["hermes_runtime_shadow_attachment_final_readiness_wired_to_runtime"] === true, "hermes readiness wired runtime");
  assert(realAdapters["hermes_runtime_shadow_attachment_final_readiness_wired_to_gateway"] === false, "hermes readiness not wired gateway");
  assert(realAdapters["hermes_runtime_shadow_attachment_final_readiness_changes_final_status"] === false, "hermes readiness no final status");
  assert(realAdapters["hermes_runtime_shadow_attachment_final_readiness_changes_routing"] === false, "hermes readiness no routing");
  assert(realAdapters["hermes_runtime_shadow_attachment_final_readiness_affects_primary_gateway_result"] === false, "hermes readiness no primary");
  assert(realAdapters["hermes_runtime_shadow_attachment_final_readiness_persists_audit"] === false, "hermes readiness no persist");
  assert(realAdapters["hermes_runtime_shadow_attachment_final_readiness_writes_files"] === false, "hermes readiness no files");
  assert(realAdapters["hermes_runtime_shadow_attachment_final_readiness_contains_raw_prompt"] === false, "hermes readiness no raw prompt");
  assert(realAdapters["hermes_runtime_shadow_attachment_final_readiness_contains_raw_artifacts"] === false, "hermes readiness no raw artifacts");
  assert(realAdapters["hermes_runtime_shadow_attachment_final_readiness_contains_secrets"] === false, "hermes readiness no secrets");
  assert(realAdapters["hermes_runtime_shadow_attachment_final_readiness_recommended_next_pr"] === "Hermes Gateway Real Dispatch Contract", "hermes readiness next PR");
  console.log("");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

test();
