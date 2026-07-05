# Real Agent Adapter Integration Plan

## 1. Executive Summary

The AI SDLC Runtime is shadow-first by default. Only a feature-flagged Codex adapter (`SDLC_EXECUTION_MODE=codex`) supports real execution, limited to `code_generation`. Kimi and Hermes have no real adapters. This plan defines a safe, staged approach for integrating real Kimi, Hermes, and expanded Codex adapters behind the Execution Gateway, without changing default runtime behavior.

## 2. Current Adapter State

| Adapter | Status | Default | Supports |
|---------|--------|---------|----------|
| Shadow | implemented | ✅ Yes | All 6 request types |
| Codex | feature_flagged_partial | ❌ No (`SDLC_EXECUTION_MODE=codex`) | `code_generation` only |
| Kimi | not_implemented | ❌ No | (falls through to shadow) |
| Hermes | not_implemented | ❌ No | (falls through to shadow) |

## 3. Adapter Capability Matrix

| Adapter | Status | Real Execution | Feature Flag |
|---------|--------|---------------|--------------|
| shadow | implemented | No (mock) | (none, default) |
| codex | feature_flagged_partial | Yes (`execFile codex`) | `SDLC_EXECUTION_MODE=codex` |
| kimi | not_implemented | No | `SDLC_KIMI_ADAPTER=enabled` (planned) |
| hermes | not_implemented | No | `SDLC_HERMES_ADAPTER=enabled` (planned) |

## 4. Request Type Support Matrix

| Request Type | Shadow | Codex | Kimi | Hermes |
|-------------|--------|-------|------|--------|
| `llm_task` | implemented | unsupported | planned | unsupported |
| `code_generation` | implemented | feature_flagged | planned | unsupported |
| `review` | implemented | planned | planned | planned |
| `validation` | implemented | unsupported | unsupported | planned |
| `code_review` | implemented | planned | unsupported | unsupported |
| `bugfix` | implemented | planned | unsupported | unsupported |

Recommended real adapters by request type:
- `code_generation` → codex
- `requirement_summary`/`tech_design` → kimi
- `validation` → hermes
- `code_review`/`bugfix` → codex (expansion)

## 5. Feature Flag Strategy

| Flag | Status | Default | Purpose |
|------|--------|---------|---------|
| `SDLC_EXECUTION_MODE` | implemented | `shadow` | Enables Codex for `code_generation` |
| `SDLC_KIMI_ADAPTER` | planned | `disabled` | Enables Kimi adapter |
| `SDLC_HERMES_ADAPTER` | planned | `disabled` | Enables Hermes adapter |
| `SDLC_CODEX_REVIEW_ADAPTER` | planned | `disabled` | Expands Codex to review/bugfix types |
| `SDLC_REAL_ADAPTER_FALLBACK` | planned | `shadow` | Controls fallback: `shadow` or `fail_closed` |

**Design principle:** Each real adapter has its own feature flag. No real execution is default. Missing/invalid flags fall back to shadow.

## 6. Adapter Safety Boundaries

1. **Real adapters must stay behind ExecutionGateway.** Runtime must not call adapters directly.
2. **No real model execution by default.** Default execution mode remains shadow.
3. **No secrets committed.** API keys, base URLs, and model names come from environment variables only.
4. **No secrets logged.** Adapters must not log API keys, full prompts, or full responses.
5. **Bounded timeouts.** All real adapter calls must have configurable timeouts.
6. **Structured failures.** Real adapter failures must return structured `ExecutionResult` with `success: false`.
7. **Shadow fallback policy.** Unsupported request types, timeouts, and missing configs fall back to shadow by default.
8. **No file writes.** Adapters must not write files to disk.
9. **No Git operations.** Adapters must not create commits, branches, or PRs.
10. **No real sdlc-* skill invocation.** Adapters execute requests; skills are invoked by the future orchestrator.

## 7. Environment Variables and Secrets (Future)

| Variable | Purpose | Required |
|----------|---------|----------|
| `KIMI_API_KEY` | Kimi API authentication | For Kimi adapter |
| `KIMI_BASE_URL` | Kimi API endpoint | Optional |
| `KIMI_MODEL` | Kimi model name | Optional |
| `HERMES_API_KEY` | Hermes API authentication | For Hermes adapter |
| `HERMES_BASE_URL` | Hermes API endpoint | Optional |
| `HERMES_MODEL` | Hermes model name | Optional |

**Not used in this PR.** Documented for planning only.

## 8. Error Handling and Fallback Rules

| Error | Preferred Behavior |
|-------|-------------------|
| Adapter timeout | Return structured failure; shadow fallback |
| Missing API key | Return structured failure; shadow fallback |
| Invalid model config | Return structured failure; shadow fallback |
| Rate limit | Return structured failure with retry-after info |
| Network error | Return structured failure; shadow fallback |
| Malformed response | Return structured failure; shadow fallback |
| Unsupported request type | Shadow fallback (current behavior, no change) |

**No indefinite retries.** Timeout default: 120s, matching existing Codex adapter.

## 9. Runtime Behavior Guarantees

Real adapter integration must NOT:
- Change Graph Kernel transitions
- Change agent selection (unless a future explicit routing PR enables it)
- Change runtime auto skill inference (already disabled)
- Change memory/evolution advisory-only status
- Write files
- Apply code patches
- Perform Git operations
- Invoke real sdlc-* skills

## 10. Test Strategy

| Test Type | Purpose |
|-----------|---------|
| Contract stub tests | Verify adapter interface without network calls |
| Shadow response parser tests | Verify response parsing with mock data |
| Feature-flag tests | Verify adapter is disabled by default |
| Fallback tests | Verify unsupported types → shadow |
| Error handling tests | Verify timeout/missing key/network error → structured failure |
| Gateway routing tests | Verify Gateway routes to correct adapter by flag |

Existing tests must continue to pass. No network calls in CI.

## 11. Staged PR Roadmap

1. **Real Agent Adapter Integration Plan** — current PR (planning only)
2. **Adapter Capability Matrix + Static Validation** — current PR
3. **Kimi Adapter Contract Stub** — no network calls, just interface
4. **Hermes Adapter Contract Stub** — no network calls, just interface
5. **Kimi Adapter Shadow Response Parser Tests** — unit tests for response shapes
6. **Hermes Adapter Shadow Response Parser Tests** — unit tests for response shapes
7. **Feature-flagged Kimi Adapter** — `SDLC_KIMI_ADAPTER=enabled` for requirement_summary / tech_design
8. **Feature-flagged Hermes Adapter** — `SDLC_HERMES_ADAPTER=enabled` for validation
9. **Feature-flagged Codex Review/Bugfix Expansion** — `SDLC_CODEX_REVIEW_ADAPTER=enabled`
10. **Real Adapter Audit Trail** — observability metadata for real adapter calls
11. **Controlled Real Adapter Rollout** — governance and monitoring

## 12. Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Real adapter costs (API calls) | Medium | Feature flags keep them disabled by default; shadow is free |
| API key exposure | High | Env vars only; no logging; no hardcoding |
| Adapter response quality variance | Medium | Response parser tests; shadow fallback on malformed responses |
| Timeout blocking pipeline | Medium | Bounded timeouts (120s); shadow fallback |
| Gateway routing complexity | Low | Keep existing dispatch structure; add adapter selection by flag only |
| Kimi/Hermes API stability | Medium | Contract stubs + parser tests before real integration |

## 13. Explicitly Out of Scope

- Real sdlc-* skill invocation
- Skill Flow Orchestrator real execution
- Memory-driven actual routing
- Automatic evolution proposal application
- Real code/document modification by adapters
- Adapter audit trail (follows in PR 10)
- Runtime auto skill inference (already deprecated)

## 14. Evidence Index

| Claim | Evidence |
|-------|----------|
| Codex is feature-flagged code_generation only | `execution/codex-adapter.ts`, `execution/config.ts` |
| Kimi/Hermes are not implemented | `execution/gateway.ts` routes to shadow for non-codex |
| ExecutionGateway is single dispatch boundary | `execution/gateway.ts:ExecutionGateway.execute()` |
| Shadow adapter is default | `execution/shadow-agent-adapter.ts`, `getExecutionMode()` |
| No default real execution | `getExecutionMode()` returns `"shadow"` for unknown values |
