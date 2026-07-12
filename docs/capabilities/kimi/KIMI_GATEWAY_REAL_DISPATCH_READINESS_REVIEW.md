# Kimi Gateway Real Dispatch Readiness Review

## 1. Executive Summary

This is a review-only readiness assessment of the Kimi Gateway real dispatch stack. The review does not implement new behavior, expand request types, or change any runtime or Gateway routing. All findings are based on static source analysis and existing test coverage.

**Verdict: READY_WITH_CONSTRAINTS**

Kimi is ready for controlled `llm_task` Gateway dispatch behind explicit feature flags. It is not ready for request type expansion, default routing, automatic runtime routing, or unsupervised self-evolution.

## 2. Scope

This review covers the complete 14-layer Kimi Gateway real dispatch stack:

1. Kimi CLI contract stubs
2. Kimi CLI dry-run harness
3. Shared CLI adapter audit trail
4. Kimi CLI executor contract
5. Kimi CLI command executor (feature-flagged)
6. Kimi Gateway integration contract
7. Kimi Gateway shadow sidecar
8. Kimi runtime attachment contract
9. Kimi runtime shadow attachment
10. Kimi Gateway real dispatch contract
11. Kimi Gateway real dispatch (feature-flagged, wired to Gateway)
12. Kimi Gateway real dispatch fallback policy
13. Kimi Gateway real dispatch observability
14. Kimi Gateway real dispatch guardrails

## 3. Current Capability Stack

| # | Layer | Status | File |
|---|-------|--------|------|
| 1 | CLI Contract Stub | implemented_contract_only | `execution/kimi-cli-adapter-contract.ts` |
| 2 | Dry-run Harness | implemented_no_process_spawn | `execution/kimi-cli-dry-run.ts` |
| 3 | Audit Trail | implemented_metadata_only | `execution/cli-adapter-audit.ts` |
| 4 | Executor Contract | implemented_contract_only | `execution/kimi-cli-executor-contract.ts` |
| 5 | Command Executor | implemented_feature_flagged_isolated | `execution/kimi-cli-command-executor.ts` |
| 6 | Gateway Integration Contract | implemented_contract_only | `execution/kimi-gateway-integration-contract.ts` |
| 7 | Shadow Sidecar | implemented_feature_flagged_sidecar | `execution/kimi-gateway-shadow-sidecar.ts` |
| 8 | Runtime Attachment Contract | implemented_contract_only | `execution/kimi-runtime-attachment-contract.ts` |
| 9 | Runtime Shadow Attachment | implemented_feature_flagged_runtime_sidecar | `core/kimi-runtime-shadow-attachment.ts` |
| 10 | Real Dispatch Contract | implemented_contract_only | `execution/kimi-gateway-real-dispatch-contract.ts` |
| 11 | Real Dispatch (wired) | implemented_feature_flagged_gateway_dispatch | `execution/kimi-gateway-real-dispatch.ts` |
| 12 | Fallback Policy | implemented | `execution/kimi-gateway-real-dispatch-fallback-policy.ts` |
| 13 | Observability | implemented | `execution/kimi-gateway-real-dispatch-observability.ts` |
| 14 | Guardrails | implemented | `execution/kimi-gateway-real-dispatch-guardrails.ts` |

## 4. Feature Flags and Activation Conditions

Kimi Gateway real dispatch requires all three flags to be explicitly enabled:

- `SDLC_KIMI_GATEWAY_REAL_DISPATCH=enabled`
- `SDLC_KIMI_GATEWAY_INTEGRATION=enabled`
- `SDLC_KIMI_CLI_COMMAND_EXECUTION=enabled`

When any flag is absent, Kimi falls through to default shadow execution. There is no path to real Kimi execution without all three flags.

## 5. Request Type Scope

Kimi Gateway real dispatch supports **`llm_task` only**. All other request types (`code_generation`, `code_review`, `bugfix`, `validation`, `review`) are rejected by the dispatch contract and fall through to shadow.

No request type expansion has been implemented.

## 6. Runtime and Gateway Behavior

**Gateway behavior:** The Execution Gateway checks `agent === "kimi" && type === "llm_task" && SDLC_KIMI_GATEWAY_REAL_DISPATCH === "enabled"`. Only when all conditions are met does it attempt real dispatch. Otherwise, it falls through to shadow.

**Runtime behavior:** Runtime is unchanged. Kimi real dispatch does not alter `Runtime.final_status`, does not change default routing, and does not affect the Runtime result trace. The runtime shadow attachment is a sidecar field that is absent when disabled.

## 7. Safety Boundaries

| Boundary | Status | Evidence |
|----------|--------|----------|
| No default real execution | Enforced | Requires 3 explicit flags |
| No Runtime final_status change | Enforced | `affectsFinalStatus: false` |
| No default Runtime routing change | Enforced | `affectsRuntimeRouting: false` |
| No Codex behavior change | Enforced | Codex path unchanged |
| No Hermes behavior change | Enforced | Hermes path unchanged |
| No real sdlc-* skill invocation | Enforced | Skills not invoked |
| No file writes | Enforced | `writesFiles: false` |
| No audit persistence | Enforced | `persistsAudit: false` |
| No real Kimi CLI in tests | Enforced | Fake runner injection |
| No API keys in config | Enforced | CLI-based model only |

## 8. Fallback Policy Review

The fallback policy covers all dispatch states:

| State | Fallback Action |
|-------|----------------|
| Flags disabled / missing | `fall_through_to_shadow` |
| Integration/command disabled | `return_structured_disabled` |
| Unsupported request type | `return_structured_unsupported` |
| CLI failure | `return_structured_failure` |
| CLI timeout | `return_structured_timeout` |
| Guardrail rejected | `return_structured_failure` (reason: `guardrail_rejected`) |

All fallback paths preserve `affectsFinalStatus: false` and `affectsRuntimeRouting: false`. Errors are sanitized before being returned.

## 9. Observability Review

Observability events are generated at each dispatch stage:
- `contract_rejected` — contract check failed
- `execution_started` — CLI invocation started
- `execution_success` — CLI completed successfully
- `execution_failure` — CLI returned non-zero exit code
- `execution_timeout` — CLI timed out

All observability events are in-memory only. They do not contain raw prompts, raw artifacts, or secrets. They are not persisted to disk or database.

## 10. Guardrails Review

Operational guardrails block dispatch before CLI execution when:

| Guardrail | Limit | Action |
|-----------|-------|--------|
| Prompt too large | 20,000 chars | Block, return `prompt_too_large` |
| Input too large | 50,000 chars serialized | Block, return `request_too_large` |
| Invalid CLI config | Missing/disabled config | Block, return `invalid_cli_config` |
| Missing CLI command | Empty command | Block, return `missing_cli_command` |
| Timeout out of range | < 1,000ms or > 300,000ms | Block, return `timeout_out_of_range` |
| Output summaries | stdout 4,000 / stderr 4,000 / error 2,000 | Clamp with truncation |

Guardrails are enabled by default when dispatch is enabled. They do not change Runtime `final_status` or routing.

## 11. Testing Evidence

| Test File | Assertions | Focus |
|-----------|-----------|-------|
| `tests/kimi-gateway-real-dispatch-contract.test.ts` | 11 | Contract-only evaluation |
| `tests/kimi-gateway-real-dispatch.test.ts` | 51 | Dispatch with fake runners |
| `tests/kimi-gateway-real-dispatch-gateway.test.ts` | 45 | Gateway integration |
| `tests/kimi-gateway-real-dispatch-fallback-policy.test.ts` | 14 | Fallback classification |
| `tests/kimi-gateway-real-dispatch-observability.test.ts` | 14 | Observability metadata |
| `tests/kimi-gateway-real-dispatch-guardrails.test.ts` | 15 | Guardrail decisions |

All tests use fake runners. No real Kimi CLI is called in any test.

## 12. Known Limitations

- **`llm_task` only** — Kimi cannot handle code generation, review, bugfix, or validation requests
- **Not default enabled** — Requires 3 explicit feature flags
- **Not automatic runtime routing** — Gateway-controlled only, no runtime auto-dispatch
- **Not request type expanded** — No work has been done to extend beyond `llm_task`
- **Manual feature flag required** — No automatic flag inference or environment detection
- **Fake runner tests only** — No integration tests with real Kimi CLI

## 13. Readiness Verdict

**READY_WITH_CONSTRAINTS**

Kimi is ready for controlled `llm_task` Gateway dispatch only.
Kimi is not ready for request type expansion yet.
Kimi is not ready to become default routing.
Kimi is not ready for automatic Runtime routing.
Kimi is not ready for unsupervised self-evolution.
Further expansion requires a separate contract/review PR.

No implementation behavior is changed by this review.
No request types are expanded.
No Runtime final_status behavior changes.
No Gateway default routing changes.
No real Kimi CLI is called in tests.

## 14. Recommended Next Step

**Kimi Gateway Request Type Expansion Contract**

Define whether Kimi should support additional request types before any implementation. This should be a contract-only PR that analyzes each candidate request type for safety, routing impact, and Gateway behavior implications. No implementation changes should be made until the contract is reviewed and approved.
