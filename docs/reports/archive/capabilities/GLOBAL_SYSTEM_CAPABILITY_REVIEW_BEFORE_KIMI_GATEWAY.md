# Global System Capability Review Before Kimi Gateway Shadow Wiring

## Verdict: YES — safe to proceed

## Executive Summary

All safety boundaries are intact. No real Kimi execution is reachable from runtime or Gateway. The architecture baseline (skills as flow nodes, direct implementation as skillless, no auto skill inference) holds. One minor fixup needed: `SYSTEM_CAPABILITY_REVIEW.md` line 5 still says only "CLI contract stubs exist" and "Kimi CLI dry-run harness exists" — needs updating to mention isolated command executor and Gateway contract.

## Architecture Baseline Check

| Area | Expected | Actual | Status | Evidence |
|------|----------|--------|--------|----------|
| Skills as flow nodes | `global_entry`, `flow_internal`, etc. | ✅ Confirmed | ✅ | `core/agent-skill-registry.ts:21` `role: "global_entry"` |
| Global entry | `sdlc-requirement-normalizer` | ✅ Same | ✅ | `core/agent-skill-registry.ts:21` |
| Code-review normalizer | `subflow_normalizer` only | ✅ Same | ✅ | `core/agent-skill-registry.ts:244` `role: "subflow_normalizer"` |
| Direct implementation skillless | No skill invoked | ✅ Same | ✅ | `core/skill-flow-orchestrator.ts` `DIRECT_IMPLEMENTATION_AGENT_EXECUTION` |
| Speckit nested flow | Through `sdlc-speckit-pipeline` | ✅ Same | ✅ | `speckit_pipeline` flow definition |
| No auto skill inference | `buildSkillAwareExecutionRequest` removed | ✅ Not present in runtime.ts | ✅ | `runtime.ts` has no skill inference |
| Skill metadata explicit-only | `skill_metadata_explicit_only: true` | ✅ Same | ✅ | `runtime-capabilities.json` |

## Runtime/Gateway Boundary Check

| Check | Result | Evidence |
|-------|--------|----------|
| runtime.ts imports Kimi? | ✅ No | Only `LoopAgent` type union includes "kimi"; no imports of kimi-* files |
| gateway.ts imports Kimi? | ✅ No | No kimi/hermes references in gateway.ts |
| Gateway contract imports gateway.ts? | ✅ No | Test 9 confirms zero forbidden imports |
| Kimi executor imports gateway? | ✅ No | Test 9 confirms zero runtime/gateway/graph imports |
| Any path invokes Kimi CLI? | ✅ No | Only reachable through isolated `executeKimiCliCommand()` with explicit flag |

## Kimi Executor Boundary Check

| Check | Result |
|-------|--------|
| `isKimiCliCommandExecutionEnabled({})` returns `false` | ✅ Yes |
| Requires `SDLC_KIMI_CLI_COMMAND_EXECUTION=enabled` | ✅ Yes |
| Uses `shell: false` | ✅ Yes |
| Sanitizes stdout/stderr summaries | ✅ Yes |
| Sanitizes secret-like args before runner | ✅ Yes (Test 8) |
| Does not persist audit | ✅ Yes (`persistsAudit: false`) |
| Does not read API keys | ✅ Yes |
| Tests use fake runner | ✅ Yes (all 27 assertions) |

## Kimi Gateway Contract Check

| Check | Result |
|-------|--------|
| Contract-only | ✅ `eligible_contract_only` |
| Requires both flags | ✅ `SDLC_KIMI_GATEWAY_INTEGRATION=enabled` + `SDLC_KIMI_CLI_COMMAND_EXECUTION=enabled` |
| Does not import gateway.ts | ✅ Test 9 confirmed |
| Does not import child_process | ✅ Test 9 confirmed |
| Does not call `executeKimiCliCommand()` | ✅ Not imported |
| Eligible result is still `eligible: true, warnings: ["Gateway not wired"]` | ✅ |

## Metadata Consistency Check

| File | Status | Issue |
|------|--------|-------|
| `runtime-capabilities.json` | ✅ Clean | All Kimi executor + gateway fields present |
| `real-agent-adapter-capability-matrix.json` | ✅ Clean | Kimi: `command_executor`, `gateway_integration_contract` |
| `system-capability-review.json` | ✅ Clean (just fixed) | Stale risk text updated |
| `SYSTEM_CAPABILITY_REVIEW.md` | ⚠️ **Needs fix** | Line 5: still says only "CLI contract stubs" + "dry-run harness exists" — missing Kimi command executor + Gateway contract |
| `SYSTEM_STATUS.md` | ✅ Clean | Correctly reflects current state |
| `package.json` | ✅ Clean | All tests listed |

## Test Coverage Check

| Area | Tests |
|------|-------|
| CLI audit sanitization | ✅ 43 assertions |
| Kimi CLI dry-run | ✅ 37 assertions |
| Hermes CLI dry-run | ✅ 25 assertions |
| Kimi executor contract | ✅ 33 assertions |
| Hermes executor contract | ✅ 21 assertions |
| Kimi command executor | ✅ 27 assertions |
| Kimi Gateway contract | ✅ 27 assertions |
| Runtime capabilities | ✅ 88 assertions |
| Real adapter matrix | ✅ 78 assertions |
| System capability review | ✅ 94 assertions |
| No auto skill annotation | ✅ 28 assertions |
| All tests pass | ✅ Yes |

## Risks

| Risk | Severity |
|------|----------|
| `SYSTEM_CAPABILITY_REVIEW.md` executive summary is stale (minor docs fix) | Low |

## Required Fixups Before Next PR

1. **Update `SYSTEM_CAPABILITY_REVIEW.md` line 5** — Replace stale text with current Kimi state (isolated command executor exists, Gateway contract exists, not wired).

## Recommended Next PR Scope

**Feature-flagged Kimi Gateway Wiring Shadow Path** should:
- Be shadow/sidecar only
- Be default off
- Require both `SDLC_KIMI_GATEWAY_INTEGRATION=enabled` + `SDLC_KIMI_CLI_COMMAND_EXECUTION=enabled`
- Not change `final_status`
- Not change runtime routing by default
- Not make Kimi the default adapter
- Not execute CLI unless both flags are enabled
- Export comparison metadata to `RuntimeResult` as optional sidecar (similar to existing skill flow shadow integration pattern)

## Do-Not-Cross Lines For Next PR

- ❌ Do not modify `execution/gateway.ts` to route by agent=kimi without flags
- ❌ Do not make Kimi the default fallback in gateway dispatch
- ❌ Do not change `final_status` based on Kimi shadow results
- ❌ Do not remove `SDLC_KIMI_GATEWAY_INTEGRATION` flag check
- ❌ Do not remove `SDLC_KIMI_CLI_COMMAND_EXECUTION` flag check
- ❌ Do not execute real Kimi CLI in shadow path
