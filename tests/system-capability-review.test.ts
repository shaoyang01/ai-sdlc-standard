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
  assert(review.recommended_next_pr.title === "Hermes Runtime Shadow Attachment Final Readiness Review", "next PR Hermes final review");
  // Kimi Gateway Real Dispatch Fallback Policy
  assert(capNames.includes("Kimi Gateway Real Dispatch Fallback Policy"), "has Kimi Fallback Policy");
  const fpCap = review.capabilities.find((c: Record<string, unknown>) => c["name"] === "Kimi Gateway Real Dispatch Fallback Policy");
  assert(fpCap !== undefined && fpCap["status"] === "implemented", "fallback policy implemented");
  assert(fpCap["runtime_active_by_default"] === false, "fallback not active by default");
  assert(fpCap["changes_routing_by_default"] === false, "fallback no routing change");
  assert(fpCap["changes_final_status"] === false, "fallback no final status change");
  assert(fpCap["fallback_default_action"] === "fall_through_to_shadow", "fallback shadow");
  assert(fpCap["failure_returns_structured_error"] === true, "failure structured");
  assert(fpCap["timeout_returns_structured_error"] === true, "timeout structured");
  assert(fpCap["errors_sanitized"] === true, "errors sanitized");
  assert(fpCap["expands_request_types"] === false, "no expansion");
  assert(fpCap["writes_files"] === false, "fallback no files");
  assert(fpCap["persists_audit"] === false, "fallback no persist");
  const fpEvidence = fpCap["evidence"] as string[];
  assert(fpEvidence.includes("execution/kimi-gateway-real-dispatch-fallback-policy.ts"), "fallback evidence");
  assert(fpEvidence.includes("tests/kimi-gateway-real-dispatch-fallback-policy.test.ts"), "fallback test evidence");
  // Kimi Gateway Real Dispatch Observability
  assert(capNames.includes("Kimi Gateway Real Dispatch Observability"), "has Kimi Observability");
  const obsCap = review.capabilities.find((c: Record<string, unknown>) => c["name"] === "Kimi Gateway Real Dispatch Observability");
  assert(obsCap !== undefined && obsCap["status"] === "implemented", "observability implemented");
  assert(obsCap["runtime_active_by_default"] === false, "obs not active by default");
  assert(obsCap["persists_audit"] === false, "obs not persisted");
  assert(obsCap["contains_raw_prompt"] === false, "obs no raw prompt");
  assert(obsCap["contains_raw_artifacts"] === false, "obs no raw artifacts");
  assert(obsCap["contains_secrets"] === false, "obs no secrets");
  assert(obsCap["changes_final_status"] === false, "obs no final status");
  assert(obsCap["changes_routing"] === false, "obs no routing");
  assert(obsCap["expands_request_types"] === false, "obs no expansion");
  const obsEvidence = obsCap["evidence"] as string[];
  assert(obsEvidence.includes("execution/kimi-gateway-real-dispatch-observability.ts"), "obs evidence");
  assert(obsEvidence.includes("tests/kimi-gateway-real-dispatch-observability.test.ts"), "obs test evidence");
  assert(review.recommended_next_pr.title === "Hermes Runtime Shadow Attachment Final Readiness Review", "next PR Hermes final review");
  // Kimi Gateway Real Dispatch Contract
  assert(capNames.includes("Kimi Gateway Real Dispatch Contract"), "has Kimi Gateway Real Dispatch Contract");
  const rdCap = review.capabilities.find((c: Record<string, unknown>) => c["name"] === "Kimi Gateway Real Dispatch Contract");
  assert(rdCap !== undefined && rdCap["status"] === "contract-only", "real dispatch contract-only");
  assert(rdCap["runtime_active_by_default"] === false, "real dispatch not active by default");
  assert(rdCap["changes_routing"] === false, "real dispatch no routing change");
  assert(rdCap["changes_agent_selection"] === false, "real dispatch no agent selection change");
  assert(rdCap["changes_final_status"] === false, "real dispatch no final_status change");
  assert(rdCap["wired_to_gateway"] === false && rdCap["wired_to_runtime"] === false, "real dispatch not wired");
  assert(rdCap["invokes_real_agents"] === false && rdCap["invokes_real_skills"] === false, "real dispatch no real agents/skills");
  assert(rdCap["invokes_cli"] === false, "real dispatch no CLI");
  assert(rdCap["spawns_process"] === false && rdCap["writes_files"] === false, "real dispatch no spawn/files");
  assert(rdCap["persists_audit"] === false, "real dispatch persists no audit");
  const rdTypes = rdCap["supported_request_types"] as string[];
  assert(rdTypes.length === 1 && rdTypes[0] === "llm_task", "real dispatch llm_task only");
  const rdFlags = rdCap["requires_flags"] as string[];
  assert(rdFlags.length === 3, "real dispatch 3 flags");
  assert(rdFlags.includes("SDLC_KIMI_GATEWAY_REAL_DISPATCH=enabled"), "real dispatch requires real dispatch flag");
  assert(rdFlags.includes("SDLC_KIMI_GATEWAY_INTEGRATION=enabled"), "real dispatch requires integration flag");
  assert(rdFlags.includes("SDLC_KIMI_CLI_COMMAND_EXECUTION=enabled"), "real dispatch requires command execution flag");
  const rdEvidence = rdCap["evidence"] as string[];
  assert(rdEvidence.includes("execution/kimi-gateway-real-dispatch-contract.ts"), "real dispatch evidence");
  assert(rdEvidence.includes("tests/kimi-gateway-real-dispatch-contract.test.ts"), "real dispatch test evidence");
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
  // Kimi Runtime Attachment Contract
  assert(capNames.includes("Kimi Runtime Attachment Contract"), "has Kimi Runtime Attachment Contract");
  const raCap = review.capabilities.find((c: Record<string, unknown>) => c["name"] === "Kimi Runtime Attachment Contract");
  assert(raCap !== undefined && raCap["status"] === "contract-only", "runtime attachment contract-only");
  assert(raCap["runtime_active_by_default"] === false && raCap["wired_to_runtime"] === false, "runtime attachment not active/wired");
  assert(raCap["changes_routing"] === false && raCap["changes_final_status"] === false, "runtime attachment no effects");
  assert(raCap["invokes_real_agents"] === false && raCap["invokes_real_skills"] === false, "runtime attachment no real agents");
  assert(raCap["requires_flag"] === "SDLC_KIMI_RUNTIME_ATTACHMENT=enabled", "runtime attachment flag");
  const raEvidence = raCap["evidence"] as string[];
  assert(raEvidence.includes("execution/kimi-runtime-attachment-contract.ts"), "runtime attachment evidence");
  assert(raEvidence.includes("tests/kimi-runtime-attachment-contract.test.ts"), "runtime attachment test");
  // Kimi Runtime Shadow Attachment
  assert(capNames.includes("Kimi Runtime Shadow Attachment"), "has Kimi Runtime Shadow Attachment");
  const rsaCap = review.capabilities.find((c: Record<string, unknown>) => c["name"] === "Kimi Runtime Shadow Attachment");
  assert(rsaCap !== undefined && rsaCap["status"] === "feature-flagged-runtime-sidecar", "runtime shadow status");
  assert(rsaCap["runtime_active_by_default"] === false, "runtime shadow not active");
  assert(rsaCap["changes_routing"] === false && rsaCap["changes_final_status"] === false, "runtime shadow no effects");
  assert(rsaCap["primary_runtime_unchanged"] === true && rsaCap["primary_gateway_unchanged"] === true, "runtime shadow unchanged");
  assert(rsaCap["invokes_real_agents"] === true, "runtime shadow real agents");
  assert(rsaCap["invokes_real_skills"] === false && rsaCap["writes_files"] === false, "runtime shadow no skills/files");
  const rsaFlags = rsaCap["requires_flags"] as string[];
  assert(rsaFlags.length === 4, "runtime shadow 4 flags");
  const rsaEvidence = rsaCap["evidence"] as string[];
  assert(rsaEvidence.includes("core/kimi-runtime-shadow-attachment.ts"), "runtime shadow evidence");
  assert(rsaEvidence.includes("tests/kimi-runtime-shadow-attachment.test.ts"), "runtime shadow helper test");
  assert(rsaEvidence.includes("tests/runtime-kimi-shadow-attachment.test.ts"), "runtime shadow integration test");
  // Kimi Gateway Real Dispatch Guardrails
  assert(capNames.includes("Kimi Gateway Real Dispatch Guardrails"), "has Kimi Guardrails");
  const grCap = review.capabilities.find((c: Record<string, unknown>) => c["name"] === "Kimi Gateway Real Dispatch Guardrails");
  assert(grCap !== undefined && grCap["status"] === "implemented", "guardrails implemented");
  assert(grCap["runtime_active_by_default"] === false, "guardrails not active by default");
  assert(grCap["guardrails_default_enabled_when_dispatch_enabled"] === true, "guardrails enabled with dispatch");
  assert(grCap["blocks_large_prompt"] === true, "guardrails block large prompt");
  assert(grCap["blocks_large_input"] === true, "guardrails block large input");
  assert(grCap["validates_cli_config"] === true, "guardrails validate config");
  assert(grCap["validates_timeout"] === true, "guardrails validate timeout");
  assert(grCap["clamps_output_summaries"] === true, "guardrails clamp summaries");
  assert(grCap["changes_final_status"] === false, "guardrails no final status");
  assert(grCap["changes_routing"] === false, "guardrails no routing");
  assert(grCap["expands_request_types"] === false, "guardrails no expansion");
  assert(grCap["writes_files"] === false, "guardrails no files");
  assert(grCap["persists_audit"] === false, "guardrails no persist");
  const grEvidence = grCap["evidence"] as string[];
  assert(grEvidence.includes("execution/kimi-gateway-real-dispatch-guardrails.ts"), "guardrails evidence");
  assert(grEvidence.includes("tests/kimi-gateway-real-dispatch-guardrails.test.ts"), "guardrails test evidence");
  // Kimi Gateway Real Dispatch Readiness Review
  assert(capNames.includes("Kimi Gateway Real Dispatch Readiness Review"), "has Kimi Readiness Review");
  const rrCap = review.capabilities.find((c: Record<string, unknown>) => c["name"] === "Kimi Gateway Real Dispatch Readiness Review");
  assert(rrCap !== undefined && rrCap["status"] === "READY_WITH_CONSTRAINTS", "readiness review status");
  assert(rrCap["review_only"] === true, "readiness review-only");
  assert(rrCap["implementation_changes"] === false, "readiness no impl changes");
  assert(rrCap["runtime_changes"] === false, "readiness no runtime changes");
  assert(rrCap["gateway_routing_changes"] === false, "readiness no gateway routing changes");
  assert(rrCap["request_type_expansion"] === false, "readiness no type expansion");
  const rrTypes = rrCap["supported_request_types"] as string[];
  assert(rrTypes.length === 1 && rrTypes[0] === "llm_task", "readiness llm_task only");
  assert(rrCap["default_enabled"] === false, "readiness not default enabled");
  const rrEvidence = rrCap["evidence"] as string[];
  assert(rrEvidence.includes("KIMI_GATEWAY_REAL_DISPATCH_READINESS_REVIEW.md"), "readiness evidence MD");
  assert(rrEvidence.includes("kimi-gateway-real-dispatch-readiness-review.json"), "readiness evidence JSON");
  assert(rrEvidence.includes("tests/kimi-gateway-real-dispatch-readiness-review.test.ts"), "readiness evidence test");
  // Kimi Request Type Expansion Contract
  assert(capNames.includes("Kimi Request Type Expansion Contract"), "has Kimi Expansion Contract");
  const xpCap = review.capabilities.find((c: Record<string, unknown>) => c["name"] === "Kimi Request Type Expansion Contract");
  assert(xpCap !== undefined && xpCap["status"] === "NO_EXPANSION_IN_THIS_PR", "expansion status NO_EXPANSION");
  assert(xpCap["contract_only"] === true, "expansion contract-only");
  assert(xpCap["implementation_changes"] === false, "expansion no impl changes");
  assert(xpCap["runtime_changes"] === false, "expansion no runtime changes");
  assert(xpCap["gateway_routing_changes"] === false, "expansion no gateway routing changes");
  assert(xpCap["request_type_expansion"] === false, "expansion no type expansion");
  const xpCur = xpCap["current_supported_request_types"] as string[];
  assert(Array.isArray(xpCur) && xpCur.length === 1 && xpCur[0] === "llm_task", "expansion current llm_task only");
  const xpNew = xpCap["newly_supported_request_types"] as string[];
  assert(Array.isArray(xpNew) && xpNew.length === 0, "expansion no newly supported");
  assert(xpCap["defer_code_generation_to"] === "codex", "expansion defer code_gen to codex");
  assert(xpCap["defer_review_validation_to"] === "hermes", "expansion defer review to hermes");
  assert(xpCap["bugfix_requires_separate_review"] === true, "expansion bugfix separate review");
  const xpEvidence = xpCap["evidence"] as string[];
  assert(xpEvidence.includes("execution/kimi-request-type-expansion-contract.ts"), "expansion evidence contract");
  assert(xpEvidence.includes("KIMI_REQUEST_TYPE_EXPANSION_CONTRACT.md"), "expansion evidence MD");
  assert(xpEvidence.includes("kimi-request-type-expansion-contract.json"), "expansion evidence JSON");
  assert(xpEvidence.includes("tests/kimi-request-type-expansion-contract.test.ts"), "expansion evidence test");
  // Hermes CLI Command Executor
  assert(capNames.includes("Hermes CLI Command Executor"), "has Hermes Command Executor");
  const hxCap = review.capabilities.find((c: Record<string, unknown>) => c["name"] === "Hermes CLI Command Executor");
  assert(hxCap !== undefined && hxCap["status"] === "implemented_feature_flagged_isolated", "hermes executor status");
  assert(hxCap["runtime_active_by_default"] === false, "hermes executor not active default");
  assert(hxCap["requires_flag"] === "SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled", "hermes executor flag");
  assert(hxCap["wired_to_gateway"] === false, "hermes executor not wired gateway");
  assert(hxCap["wired_to_runtime"] === false, "hermes executor not wired runtime");
  assert(hxCap["uses_fake_runner_in_tests"] === true, "hermes executor fake runner");
  assert(hxCap["writes_files"] === false, "hermes executor no files");
  assert(hxCap["persists_audit"] === false, "hermes executor no persist");
  assert(hxCap["changes_final_status"] === false, "hermes executor no final status");
  assert(hxCap["changes_routing"] === false, "hermes executor no routing");
  const hxEvidence = hxCap["evidence"] as string[];
  assert(hxEvidence.includes("execution/hermes-cli-command-executor.ts"), "hermes executor evidence");
  assert(hxEvidence.includes("tests/hermes-cli-command-executor.test.ts"), "hermes executor test evidence");
  // Hermes Gateway Integration Contract
  assert(capNames.includes("Hermes Gateway Integration Contract"), "has Hermes Gateway Contract");
  const hgwCap = review.capabilities.find((c: Record<string, unknown>) => c["name"] === "Hermes Gateway Integration Contract");
  assert(hgwCap !== undefined && hgwCap["status"] === "implemented_contract_only", "hermes gateway status");
  assert(hgwCap["runtime_active_by_default"] === false, "hermes gateway not active");
  assert(hgwCap["wired_to_gateway"] === false, "hermes gateway not wired gateway");
  assert(hgwCap["wired_to_runtime"] === false, "hermes gateway not wired runtime");
  assert(hgwCap["invokes_cli"] === false, "hermes gateway no CLI");
  assert(hgwCap["spawns_process"] === false, "hermes gateway no spawn");
  const hgwSupTypes = hgwCap["supported_request_types"] as string[];
  assert(Array.isArray(hgwSupTypes) && hgwSupTypes.includes("review") && hgwSupTypes.includes("code_review") && hgwSupTypes.includes("validation"), "hermes gateway supported");
  const hgwUnsupTypes = hgwCap["unsupported_request_types"] as string[];
  assert(Array.isArray(hgwUnsupTypes) && hgwUnsupTypes.includes("llm_task") && hgwUnsupTypes.includes("code_generation") && hgwUnsupTypes.includes("bugfix"), "hermes gateway unsupported");
  const hgwFlags = hgwCap["requires_flags"] as string[];
  assert(Array.isArray(hgwFlags) && hgwFlags.length === 2, "hermes gateway 2 flags");
  assert(hgwFlags.includes("SDLC_HERMES_GATEWAY_INTEGRATION=enabled") && hgwFlags.includes("SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled"), "hermes gateway flags correct");
  assert(hgwCap["changes_final_status"] === false, "hermes gateway no final status");
  assert(hgwCap["changes_routing"] === false, "hermes gateway no routing");
  assert(hgwCap["writes_files"] === false, "hermes gateway no files");
  assert(hgwCap["persists_audit"] === false, "hermes gateway no persist");
  const hgwEvidence = hgwCap["evidence"] as string[];
  assert(hgwEvidence.includes("execution/hermes-gateway-integration-contract.ts"), "hermes gateway evidence");
  assert(hgwEvidence.includes("tests/hermes-gateway-integration-contract.test.ts"), "hermes gateway test evidence");
  // Hermes Gateway Shadow Sidecar
  assert(capNames.includes("Hermes Gateway Shadow Sidecar"), "has Hermes Shadow Sidecar");
  const hssCap = review.capabilities.find((c: Record<string, unknown>) => c["name"] === "Hermes Gateway Shadow Sidecar");
  assert(hssCap !== undefined && hssCap["status"] === "implemented_feature_flagged_sidecar", "hermes shadow status");
  assert(hssCap["runtime_active_by_default"] === false, "hermes shadow not active");
  assert(hssCap["wired_to_gateway"] === false, "hermes shadow not wired gateway");
  assert(hssCap["wired_to_runtime"] === false, "hermes shadow not wired runtime");
  const hssRFlags = hssCap["requires_flags"] as string[];
  assert(Array.isArray(hssRFlags) && hssRFlags.length === 3, "hermes shadow 3 flags");
  const hssSupTypes = hssCap["supported_request_types"] as string[];
  assert(Array.isArray(hssSupTypes) && hssSupTypes.includes("review") && hssSupTypes.includes("code_review") && hssSupTypes.includes("validation"), "hermes shadow supported");
  const hssUnsupTypes = hssCap["unsupported_request_types"] as string[];
  assert(Array.isArray(hssUnsupTypes) && hssUnsupTypes.includes("llm_task") && hssUnsupTypes.includes("code_generation") && hssUnsupTypes.includes("bugfix"), "hermes shadow unsupported");
  assert(hssCap["affects_primary_gateway_result"] === false, "hermes shadow no primary");
  assert(hssCap["changes_final_status"] === false, "hermes shadow no final status");
  assert(hssCap["changes_routing"] === false, "hermes shadow no routing");
  assert(hssCap["writes_files"] === false, "hermes shadow no files");
  assert(hssCap["persists_audit"] === false, "hermes shadow no persist");
  assert(hssCap["uses_fake_runner_in_tests"] === true, "hermes shadow fake runner");
  const hssEvidence = hssCap["evidence"] as string[];
  assert(hssEvidence.includes("execution/hermes-gateway-shadow-sidecar.ts"), "hermes shadow evidence");
  assert(hssEvidence.includes("tests/hermes-gateway-shadow-sidecar.test.ts"), "hermes shadow test evidence");
  // Hermes Runtime Shadow Attachment Contract
  assert(capNames.includes("Hermes Runtime Shadow Attachment Contract"), "has Hermes Runtime Attachment");
  const hraCap = review.capabilities.find((c: Record<string, unknown>) => c["name"] === "Hermes Runtime Shadow Attachment Contract");
  assert(hraCap !== undefined && hraCap["status"] === "implemented_contract_only", "hermes runtime attachment status");
  assert(hraCap["runtime_active_by_default"] === false, "hermes runtime attachment not active");
  assert(hraCap["wired_to_runtime"] === false, "hermes runtime attachment not wired");
  assert(hraCap["requires_flag"] === "SDLC_HERMES_RUNTIME_ATTACHMENT=enabled", "hermes runtime attachment flag");
  assert(hraCap["changes_final_status"] === false, "hermes runtime attachment no final status");
  assert(hraCap["changes_routing"] === false, "hermes runtime attachment no routing");
  assert(hraCap["writes_files"] === false, "hermes runtime attachment no files");
  assert(hraCap["persists_audit"] === false, "hermes runtime attachment no persist");
  assert(hraCap["contains_raw_prompt"] === false, "hermes runtime attachment no raw prompt");
  assert(hraCap["contains_raw_artifacts"] === false, "hermes runtime attachment no raw artifacts");
  assert(hraCap["contains_secrets"] === false, "hermes runtime attachment no secrets");
  const hraEvidence = hraCap["evidence"] as string[];
  assert(hraEvidence.includes("execution/hermes-runtime-attachment-contract.ts"), "hermes runtime attachment evidence");
  assert(hraEvidence.includes("tests/hermes-runtime-attachment-contract.test.ts"), "hermes runtime attachment test evidence");
  // Hermes Runtime Shadow Attachment Helper
  assert(capNames.includes("Hermes Runtime Shadow Attachment Helper"), "has Hermes Runtime Shadow Helper");
  const hrsCap = review.capabilities.find((c: Record<string, unknown>) => c["name"] === "Hermes Runtime Shadow Attachment Helper");
  assert(hrsCap !== undefined && hrsCap["status"] === "implemented_feature_flagged_helper", "hermes runtime shadow helper status");
  assert(hrsCap["runtime_active_by_default"] === false, "hermes runtime shadow not active");
  assert(hrsCap["wired_to_runtime"] === false, "hermes runtime shadow not wired");
  assert(hrsCap["requires_flag"] === "SDLC_HERMES_RUNTIME_ATTACHMENT=enabled", "hermes runtime shadow flag");
  assert(hrsCap["invokes_sidecar_when_enabled"] === true, "hermes runtime shadow invokes sidecar");
  assert(hrsCap["uses_fake_runner_in_tests"] === true, "hermes runtime shadow fake runner");
  assert(hrsCap["changes_final_status"] === false, "hermes runtime shadow no final status");
  assert(hrsCap["changes_routing"] === false, "hermes runtime shadow no routing");
  assert(hrsCap["affects_primary_gateway_result"] === false, "hermes runtime shadow no primary");
  assert(hrsCap["writes_files"] === false, "hermes runtime shadow no files");
  assert(hrsCap["persists_audit"] === false, "hermes runtime shadow no persist");
  assert(hrsCap["contains_raw_prompt"] === false, "hermes runtime shadow no raw prompt");
  assert(hrsCap["contains_raw_artifacts"] === false, "hermes runtime shadow no raw artifacts");
  assert(hrsCap["contains_secrets"] === false, "hermes runtime shadow no secrets");
  const hrsEvidence = hrsCap["evidence"] as string[];
  assert(hrsEvidence.includes("core/hermes-runtime-shadow-attachment.ts"), "hermes runtime shadow evidence");
  assert(hrsEvidence.includes("tests/hermes-runtime-shadow-attachment.test.ts"), "hermes runtime shadow test evidence");
  // Hermes Runtime Shadow Attachment Wiring Contract
  assert(capNames.includes("Hermes Runtime Shadow Attachment Wiring Contract"), "has Hermes Wiring Contract");
  const hwcCap = review.capabilities.find((c: Record<string, unknown>) => c["name"] === "Hermes Runtime Shadow Attachment Wiring Contract");
  assert(hwcCap !== undefined && hwcCap["status"] === "implemented_contract_only", "hermes wiring status");
  assert(hwcCap["runtime_active_by_default"] === false, "hermes wiring not active");
  assert(hwcCap["wired_to_runtime"] === false, "hermes wiring not wired");
  assert(hwcCap["runtime_field"] === "hermes_runtime_shadow_attachment", "hermes wiring field");
  assert(hwcCap["conditional_field_only"] === true, "hermes wiring conditional");
  assert(hwcCap["omit_when_disabled"] === true, "hermes wiring omit");
  assert(hwcCap["never_undefined_key"] === true, "hermes wiring no undefined");
  assert(hwcCap["changes_runtime_result_shape_now"] === false, "hermes wiring no shape now");
  assert(hwcCap["changes_final_status"] === false, "hermes wiring no final status");
  assert(hwcCap["changes_routing"] === false, "hermes wiring no routing");
  assert(hwcCap["affects_primary_gateway_result"] === false, "hermes wiring no primary");
  assert(hwcCap["writes_files"] === false, "hermes wiring no files");
  assert(hwcCap["persists_audit"] === false, "hermes wiring no persist");
  const hwcEvidence = hwcCap["evidence"] as string[];
  assert(hwcEvidence.includes("core/hermes-runtime-shadow-attachment-wiring-contract.ts"), "hermes wiring evidence");
  assert(hwcEvidence.includes("tests/hermes-runtime-shadow-attachment-wiring-contract.test.ts"), "hermes wiring test evidence");
  // Hermes Runtime Shadow Attachment Runtime Integration
  assert(capNames.includes("Hermes Runtime Shadow Attachment Runtime Integration"), "has Hermes Runtime Integration");
  const hriCap = review.capabilities.find((c: Record<string, unknown>) => c["name"] === "Hermes Runtime Shadow Attachment Runtime Integration");
  assert(hriCap !== undefined && hriCap["status"] === "implemented_feature_flagged_runtime_sidecar", "hermes runtime int status");
  assert(hriCap["runtime_active_by_default"] === false, "hermes runtime int not active");
  assert(hriCap["wired_to_runtime"] === true, "hermes runtime int wired");
  assert(hriCap["requires_flag"] === "SDLC_HERMES_RUNTIME_ATTACHMENT=enabled", "hermes runtime int flag");
  assert(hriCap["runtime_field"] === "hermes_runtime_shadow_attachment", "hermes runtime int field");
  assert(hriCap["omit_when_disabled"] === true, "hermes runtime int omit");
  assert(hriCap["never_undefined_key"] === true, "hermes runtime int no undefined");
  assert(hriCap["changes_final_status"] === false, "hermes runtime int no final status");
  assert(hriCap["changes_routing"] === false, "hermes runtime int no routing");
  assert(hriCap["affects_primary_gateway_result"] === false, "hermes runtime int no primary");
  assert(hriCap["writes_files"] === false, "hermes runtime int no files");
  assert(hriCap["persists_audit"] === false, "hermes runtime int no persist");
  assert(hriCap["uses_fake_builder_in_tests"] === true, "hermes runtime int fake builder");
  const hriEvidence = hriCap["evidence"] as string[];
  assert(hriEvidence.includes("runtime.ts"), "hermes runtime int evidence runtime");
  assert(hriEvidence.includes("tests/runtime-hermes-shadow-attachment.test.ts"), "hermes runtime int test evidence");
  // Hermes Runtime Shadow Attachment Audit Metadata
  assert(capNames.includes("Hermes Runtime Shadow Attachment Audit Metadata"), "has Hermes Audit Metadata");
  const hamCap = review.capabilities.find((c: Record<string, unknown>) => c["name"] === "Hermes Runtime Shadow Attachment Audit Metadata");
  assert(hamCap !== undefined && hamCap["status"] === "implemented_in_memory_sidecar_metadata", "hermes audit status");
  assert(hamCap["runtime_active_by_default"] === false, "hermes audit not active");
  assert(hamCap["field"] === "auditMetadata", "hermes audit field");
  assert(hamCap["persisted"] === false, "hermes audit not persisted");
  assert(hamCap["writes_files"] === false, "hermes audit no files");
  assert(hamCap["changes_final_status"] === false, "hermes audit no final status");
  assert(hamCap["changes_routing"] === false, "hermes audit no routing");
  assert(hamCap["affects_primary_gateway_result"] === false, "hermes audit no primary");
  assert(hamCap["contains_raw_prompt"] === false, "hermes audit no raw prompt");
  assert(hamCap["contains_raw_artifacts"] === false, "hermes audit no raw artifacts");
  assert(hamCap["contains_secrets"] === false, "hermes audit no secrets");
  const hamEvidence = hamCap["evidence"] as string[];
  assert(hamEvidence.includes("core/hermes-runtime-shadow-attachment.ts"), "hermes audit evidence helper");
  assert(hamEvidence.includes("tests/hermes-runtime-shadow-attachment.test.ts"), "hermes audit evidence helper test");
  assert(hamEvidence.includes("tests/runtime-hermes-shadow-attachment.test.ts"), "hermes audit evidence runtime test");
  // Hermes Runtime Shadow Attachment Observability Summary
  assert(capNames.includes("Hermes Runtime Shadow Attachment Observability Summary"), "has Hermes Observability");
  const hobCap = review.capabilities.find((c: Record<string, unknown>) => c["name"] === "Hermes Runtime Shadow Attachment Observability Summary");
  assert(hobCap !== undefined && hobCap["status"] === "implemented_in_memory_sidecar_metadata", "hermes obs status");
  assert(hobCap["runtime_active_by_default"] === false, "hermes obs not active");
  assert(hobCap["field"] === "observabilitySummary", "hermes obs field");
  assert(hobCap["persisted"] === false, "hermes obs not persisted");
  assert(hobCap["writes_files"] === false, "hermes obs no files");
  assert(hobCap["changes_final_status"] === false, "hermes obs no final status");
  assert(hobCap["changes_routing"] === false, "hermes obs no routing");
  assert(hobCap["affects_primary_gateway_result"] === false, "hermes obs no primary");
  assert(hobCap["contains_raw_prompt"] === false, "hermes obs no raw prompt");
  assert(hobCap["contains_raw_artifacts"] === false, "hermes obs no raw artifacts");
  assert(hobCap["contains_secrets"] === false, "hermes obs no secrets");
  const hobEvidence = hobCap["evidence"] as string[];
  assert(hobEvidence.includes("core/hermes-runtime-shadow-attachment.ts"), "hermes obs evidence helper");
  assert(hobEvidence.includes("tests/hermes-runtime-shadow-attachment.test.ts"), "hermes obs evidence helper test");
  assert(hobEvidence.includes("tests/runtime-hermes-shadow-attachment.test.ts"), "hermes obs evidence runtime test");
  // Update next PR
  assert(review.recommended_next_pr.title === "Hermes Runtime Shadow Attachment Final Readiness Review", "next PR Hermes final review");
  // No stale Kimi/Hermes shadow-only claims
  const reviewJson = JSON.stringify(review);
  assert(!reviewJson.includes("Kimi/Hermes are shadow-only"), "no stale shadow-only claim");
  assert(!reviewJson.includes("not wired to runtime/Gateway"), "no stale not-wired runtime/Gateway state");
  assert(!reviewJson.includes("no real Kimi execution is reachable through runtime/Gateway"), "no stale no-real-Kimi state");
  assert(reviewJson.includes("Kimi Gateway Real Dispatch Readiness Review"), "current readiness review present");
  assert(reviewJson.includes("READY_WITH_CONSTRAINTS"), "current readiness verdict present");
  // Markdown review must reflect current Kimi state
  const md = fs.readFileSync("SYSTEM_CAPABILITY_REVIEW.md", "utf-8");
  assert(!md.includes("Kimi/Hermes are shadow-only"), "MD: no stale shadow-only claim");
  assert(!md.includes("only CLI contract stubs exist"), "MD: no stale 'only CLI stubs' claim");
  assert(!md.includes("not wired to runtime or ExecutionGateway"), "MD: no stale 'not wired' claim");
  assert(!md.includes("no real Kimi execution is reachable through runtime/Gateway"), "MD: no stale 'no real Kimi' claim");
  assert(md.includes("feature-flagged Gateway real dispatch"), "MD: mentions Gateway real dispatch");
  assert(md.includes("default-off, Gateway-controlled"), "MD: mentions default-off Gateway-controlled");
  assert(md.includes("fallback policy, observability, and operational guardrails"), "MD: mentions fallback/observability/guardrails");
  assert(md.includes("does not change Runtime"), "MD: mentions no Runtime change");
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
