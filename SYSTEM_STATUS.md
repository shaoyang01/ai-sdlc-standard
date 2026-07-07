# SDLC Runtime System Status

## 1. Current Architecture Summary

The AI SDLC Runtime is a **shadow-first** TypeScript orchestration engine that executes a deterministic SDLC pipeline. All agent calls default to shadow (mock) execution. Real execution is feature-flagged and opt-in only.

Pipeline flow:
```
Requirement Input → Graph Kernel → Runtime Orchestrator → Execution Gateway
  → Shadow Adapter (default) / Codex Adapter (opt-in)
  → Code Review + Bugfix Loop → Feedback Analyzer
  → Optional SQLite Memory Read → Shadow Routing Decisions
  → Evolution Proposals → Optional SQLite Memory Write → RuntimeResult
```

## 2. Implemented Capabilities

| Capability | Status |
|-----------|--------|
| SDLC Graph Kernel (5 nodes, conditional edges) | ✅ Implemented |
| Deterministic State Machine VM | ✅ Implemented |
| Execution Gateway (single dispatch boundary) | ✅ Implemented |
| Shadow Agent Adapter (default) | ✅ Implemented |
| Runtime Feedback (agent scores, node outcomes, review summary) | ✅ Implemented |
| Code Review + Bugfix Loop (bounded, 2 retries max) | ✅ Implemented (shadow) |
| Policy Suggestions (base feedback) | ✅ Implemented |
| Artifact Model (standardized node outputs) | ✅ Implemented |
| Agent Skill Registry (20 sdlc-* skills) | ✅ Implemented (metadata-only) |
| Skill Invocation Contract | ✅ Implemented (metadata-only) |
| Skill Flow Inventory (flow graph metadata) | ✅ Implemented (metadata-only) |
| ExecutionRequest explicit skill metadata | ✅ Implemented (optional, explicit-only) |
| Runtime auto skill annotation | ❌ Disabled (deprecated) |

**Skill metadata is explicit-only.** Runtime does not auto-infer skills. sdlc-* skills are flow nodes, not runtime node labels. Direct implementation is skillless. Speckit implementation is a nested skill flow candidate through sdlc-speckit-pipeline.

## 3. Shadow-only Capabilities

These capabilities exist but run entirely in shadow mode with no real external calls:

| Capability | Notes |
|-----------|-------|
| Code Review Adapter | Scans artifacts for `force_review_fail` marker; PASS by default |
| Bugfix Adapter | Returns shadow `bugfix_patch` artifact; no patches applied to disk |
| Kimi Agent | Feature-flagged Gateway real dispatch for `llm_task` only; requires 3 flags; default-off; tested with fake runners |
| Hermes Agent | Review/code_review/validation stack is contract-defined and standalone; Gateway integration contract is done; not wired to primary Gateway dispatch |

## 4. Feature-flagged Real Execution

| Capability | Flag | Default |
|-----------|------|---------|
| Codex Adapter | `SDLC_EXECUTION_MODE=codex` | Disabled |
| Codex supports only `code_generation` request type | — | — |

**Codex CLI is not required for development or testing.** The default shadow pipeline runs without any external agent.

## 5. Advisory-only Capabilities

These capabilities are computed and returned in `RuntimeResult.feedback`, but do **not** affect routing or agent selection:

| Capability | Field |
|-----------|-------|
| Memory-derived Policy Suggestions | `feedback.policy_suggestions` |
| Shadow Routing Decisions | `feedback.shadow_routing_decisions` (all `applied: false`) |
| Evolution Proposals | `feedback.evolution_proposals` (all `applied: false`) |

## 6. Persistent Memory Boundary

| Feature | Flag | Default |
|---------|------|---------|
| Write feedback to SQLite | `SDLC_POLICY_MEMORY=enabled` | Disabled |
| Read SQLite for advisory signals | `SDLC_POLICY_MEMORY_READ=enabled` | Disabled |
| Storage location | `.sdlc-runtime/policy-memory.sqlite` (gitignored) | — |

Memory stores **summaries only** (no full artifact content, no full trace output).

Schema: `runs`, `agent_scores`, `policy_suggestions` tables with indexes.

## 7. Self-evolution Boundary

| Action | Status |
|--------|--------|
| Proposal generation | ✅ Read-only output |
| Automatic proposal application | ❌ Forbidden |
| Source code modification | ❌ Forbidden |
| Policy file modification | ❌ Forbidden |
| Git operations (commit/branch/PR) | ❌ Forbidden |

All evolution proposals have `applied: false` and require human review.

## 8. Explicitly Not Implemented Yet

| Feature | Notes |
|---------|-------|
| Real Kimi adapter (execFile or API) | Feature-flagged Gateway dispatch for llm_task; requires 3 flags; not default |
| Real Hermes adapter | All Hermes calls → shadow |
| Codex adapter for `review` / `code_review` / `bugfix` types | Only `code_generation` supported |
| Memory-driven actual agent selection | Shadow decisions exist but are not applied |
| Code Review / Bugfix routing through Codex | Always shadow, no `SDLC_EXECUTION_MODE` routing |
| Persistent self-evolution (auto-apply proposals) | Not implemented |
| Agent Policy Engine consuming memory scores | Not implemented |
| Graph Kernel `code-review` / `bugfix` nodes | Managed at runtime level only |
| Skill Flow Orchestrator | Not implemented |
| Runtime sdlc-* skill invocation | Runtime does not invoke sdlc-* skills |
| Runtime skill inference | Disabled — explicit-only metadata |
| Agent Skill Registry rewritten around flow stages | Not implemented — current registry maps to runtime nodes |
| Speckit pipeline real skill orchestration | Not implemented — runtime stub only |

## 9. Safety Guarantees

- ✅ No self-modifying code
- ✅ No automatic policy mutation
- ✅ No automatic Git operations (commit, branch, PR)
- ✅ No default real model execution (all shadow by default)
- ✅ No default memory persistence (opt-in only)
- ✅ Memory read/write are separate flags
- ✅ Memory write failure is non-fatal
- ✅ Memory read failure is non-fatal
- ✅ Feedback, shadow decisions, and proposals do not affect routing
- ✅ Runtime does not auto-infer skills (explicit-only metadata)
- ✅ Skill metadata does not affect routing, agent selection, or dispatch
- ✅ Direct implementation is skillless agent execution
- ✅ Speckit implementation is only a nested skill flow candidate

## 10. Recommended Next PRs

1. **Deprecate Runtime Auto Skill Annotation** — ✅ Done
2. **Rewrite Agent Skill Registry Around Flow Stages** — ✅ Done
3. **Skill Flow Orchestrator Contract** — ✅ Done
4. **Shadow Skill Flow Orchestrator** — ✅ Done
5. **Skill Flow Orchestrator Runtime Integration Contract** — ✅ Done (disabled by default)
6. **Feature-flagged Runtime Shadow Integration** — ✅ Done (sidecar-only, disabled by default)
7. **Runtime Shadow Integration Audit Trail** — ✅ Done (in-memory, sidecar-only)
8. **Real Agent Adapter Integration** — ✅ Kimi complete: stubs → dry-run → audit → executor → command executor → Gateway → shadow sidecar → runtime attachment → real dispatch → fallback → observability → guardrails
9. **Kimi Gateway Real Dispatch Final Readiness Review** — ✅ Done (verdict: READY_WITH_CONSTRAINTS; ready for controlled llm_task Gateway dispatch only)
10. **Kimi Gateway Request Type Expansion Contract** — ✅ Done (verdict: NO_EXPANSION_IN_THIS_PR; Kimi remains llm_task only; code_generation→Codex, review/validation→Hermes, bugfix→separate review)
11. **Hermes CLI Command Executor Implementation Behind Feature Flag** — ✅ Done (isolated, feature-flagged; not wired to Gateway or Runtime; fake-runner tests only)
12. **Hermes Gateway Integration Contract** — ✅ Done (contract-only; supports review/code_review/validation; requires 2 flags; not wired)
13. **Hermes Gateway Shadow Sidecar** — ✅ Done (feature-flagged standalone helper; requires 3 flags; not wired to primary Gateway or Runtime)
14. **Hermes Runtime Shadow Attachment Contract** — ✅ Done (contract-only; defines safe runtime attachment rules; not wired to Runtime)
15. **Feature-flagged Hermes Runtime Shadow Attachment** — ✅ Done (standalone helper; default disabled; not wired to runtime.ts)
16. **Hermes Runtime Shadow Attachment Wiring Contract** — ✅ Done (contract-only; field name defined; omit when disabled; no undefined key)
17. **Feature-flagged Hermes Runtime Shadow Attachment Runtime Integration** — ✅ Done (feature-flagged in runtime.ts; optional sidecar field; omit when disabled; no final_status/routing change)
18. **Hermes Runtime Shadow Attachment Audit Metadata** — ✅ Done (in-memory sidecar metadata; no persistence; no raw prompt/artifacts/secrets)
19. **Hermes Runtime Shadow Attachment Observability Summary** — ✅ Done (in-memory; summary-only with outcome/count/booleans; no warning text)
20. **Hermes Runtime Shadow Attachment Final Readiness Review** — ✅ Done (verdict: READY_WITH_CONSTRAINTS; runtime sidecar stack complete; Gateway real dispatch not included)
21. **Hermes Gateway Real Dispatch Contract** — ✅ Done (contract-only; 3 flags; review/code_review/validation; fallback policy; not wired)
22. **Feature-flagged Hermes Gateway Real Dispatch** — ✅ Done (standalone helper; default disabled; 3 flags; fake-runner tested; fallback-safe)
23. **Hermes Gateway Real Dispatch Gateway Integration Contract** — ✅ Done (contract-only; default disabled; future field `hermes_gateway_real_dispatch`; omit when disabled; never undefined key; no Gateway primary dispatch/final result change; no Runtime final_status/routing change)
24. **Feature-flagged Hermes Gateway Real Dispatch Gateway Integration** — ✅ Done (Gateway sidecar metadata only; default disabled; field `hermes_gateway_real_dispatch`; omitted when disabled; never undefined key; only review/code_review/validation; no Gateway primary dispatch/final result change; no Runtime final_status/routing change; fake dispatcher in tests)
25. **Hermes Gateway Real Dispatch Fallback Policy** — ✅ Done (sidecar-only `fallbackPolicy`; attach success/safe failures; omit disabled/unsupported/unsafe/dispatcher exception; no Gateway primary/final result change; no Runtime final_status/routing change; fake dispatcher tests)
26. **Hermes Gateway Real Dispatch Observability** — ✅ Done (nested `hermes_gateway_real_dispatch.observability`; warning count only; no top-level field; no persisted observability/audit; no file writes; no raw prompt/artifacts/secrets; no Gateway primary/final result change; no Runtime final_status/routing change)
27. **Hermes Gateway Real Dispatch Operational Guardrails** — ✅ Done (nested `hermes_gateway_real_dispatch.guardrails`; no top-level field; rejects unsupported request type / unexpected status / warning limit / missing policy / missing observability / raw prompt / artifact / secret risk; no persisted guardrail/observability/audit logs; no file writes; no Gateway primary/final result change; no Runtime final_status/routing change)
28. **Hermes Gateway Real Dispatch Final Readiness Review** — ✅ Done (verdict: READY_WITH_CONSTRAINTS; Gateway sidecar stack complete; sidecar-only; default disabled; feature-flagged; no primary Gateway result ownership; no Runtime final_status/routing change; no persistence; no raw prompt/artifacts/secrets)
29. **Hermes Gateway Real Dispatch Controlled Rollout Plan** — ✅ Done (status: plan_only; no rollout execution; no feature flag enablement; no Runtime behavior change; no Gateway behavior change; initial rollout scope review only; expansion to code_review/validation requires approval; no Hermes default routing; no final review/validation ownership; no persistence; no raw prompt/artifacts/secrets)
30. **Hermes Gateway Real Dispatch Rollout Validation Checklist** — ✅ Done (status: checklist_only; no rollout execution; no feature flag enablement; no Runtime behavior change; no Gateway behavior change; validates readiness and plan-only dependencies; initial validation scope review only; operator approval required; automatic rollout disabled; no Hermes default routing; no final review/validation ownership; no persistence; no raw prompt/artifacts/secrets)
31. **Hermes Gateway Real Dispatch Operator Runbook** — ✅ Done (status: runbook_only; no operator action execution; no feature flag enablement; no enablement scripts; no CI behavior change; no Runtime behavior change; no Gateway behavior change; manual operator-managed enablement only; initial operator scope review only; operator approval required; automatic rollout disabled; no Hermes default routing; no final review/validation ownership; no persistence; no raw prompt/artifacts/secrets; next PR: Hermes Gateway Real Dispatch Post-Enablement Review Template)
32. **Hermes Gateway Real Dispatch Post-Enablement Review Template** — ✅ Done (status: template_only; no data collection; no review log persistence; no operator action execution; no feature flag enablement; no enablement scripts; no CI behavior change; no Runtime behavior change; no Gateway behavior change; post-enablement review scope review only; fields are placeholders only; raw prompt/artifact/secret collection not allowed; no Hermes default routing; no final review/validation ownership; no automatic expansion; next PR: Hermes Gateway Real Dispatch Phase-2 Expansion Contract)
33. **Hermes Gateway Real Dispatch Phase-2 Expansion Contract** — ✅ Done (status: contract_only; no phase-2 execution; no request type expansion now; no feature flag enablement; no enablement scripts; no CI behavior change; no Runtime behavior change; no Gateway behavior change; current validated request type remains review only; phase-2 targets are code_review and validation; operator approval required; automatic phase-2 expansion disabled; no Hermes default routing; no final review/code_review/validation ownership; no persistence; no raw prompt/artifacts/secrets; next PR: Hermes Gateway Real Dispatch Phase-2 Validation Checklist)
34. **Hermes Gateway Real Dispatch Phase-2 Validation Checklist** — ✅ Done (status: checklist_only; no Phase-2 validation execution; no request type expansion now; no feature flag enablement; no enablement scripts; no CI behavior change; no Runtime behavior change; no Gateway behavior change; current validated request type remains review only; phase-2 validation targets are code_review and validation; operator approval required; automatic phase-2 validation/expansion disabled; no Hermes default routing; no final review/code_review/validation ownership; no persistence; no raw prompt/artifacts/secrets; next PR: Hermes Gateway Real Dispatch Phase-2 Operator Runbook)
35. **Hermes Gateway Real Dispatch Phase-2 Operator Runbook** — ✅ Done (status: runbook_only; implemented_runbook_only; no operator action execution; no feature flag enablement; no enablement scripts; no CI behavior change; no Runtime behavior change; no Gateway behavior change; current validated request type remains review only; phase-2 operator targets are code_review and validation; operator approval required; automatic enablement blocked; no Hermes default routing; no final review/code_review/validation ownership; no persistence; no raw prompt/artifacts/secrets; next PR: Hermes Gateway Real Dispatch Phase-2 Post-Validation Review Template)
36. **Hermes Gateway Real Dispatch Phase-2 Post-Validation Review Template** — ✅ Done (status: template_only; no data collection; no review log persistence; no Phase-2 validation execution; no feature flags; placeholder-only fields; no raw prompt/artifact/secret; next PR: Phase-2 Final Readiness Review)
37. **Hermes Gateway Real Dispatch Phase-2 Final Readiness Review** — ✅ Done (status: review_only; verdict: READY_WITH_CONSTRAINTS; no Phase-2 execution; no flags; sidecar-only; no ownership; next PR: Phase-2 Controlled Enablement Plan)
38. **Hermes Gateway Real Dispatch Phase-2 Controlled Enablement Plan** — ✅ Done (status: plan_only; no Phase-2 enablement now; no request type expansion now; no feature flag enablement; no enablement scripts; no CI behavior change; no Runtime behavior change; no Gateway behavior change; current validated request type remains review only; phase-2 targets are code_review and validation; operator approval required; automatic enablement blocked; no Hermes default routing; no final review/code_review/validation ownership; no persistence; no raw prompt/artifacts/secrets; next PR: Hermes Gateway Real Dispatch Phase-2 Enablement Guard Contract)
39. **Hermes Gateway Real Dispatch Phase-2 Enablement Guard Contract** — ✅ Done (status: contract_only; no Phase-2 enablement now; no request type expansion now; no feature flag enablement; no enablement scripts; no CI behavior change; no Runtime behavior change; no Gateway behavior change; defines mandatory guard conditions before any future implementation PR; current validated request type remains review only; phase-2 guard targets are code_review and validation; operator approval required; automatic enablement blocked; no Hermes default routing; no final review/code_review/validation ownership; no persistence; no raw prompt/artifacts/secrets; next PR: Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Implementation Plan)
40. **Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Implementation Plan** — ✅ Done (status: plan_only; no Phase-2 enablement now; no request type expansion now; no feature flag enablement; no enablement scripts; no CI behavior change; no Runtime behavior change; no Gateway behavior change; no Hermes dispatch eligibility change; current validated request type remains review only; phase-2 shadow targets are code_review and validation; operator approval required; automatic enablement blocked; no Hermes default routing; no final review/code_review/validation ownership; no persistence; no raw prompt/artifacts/secrets; next PR: Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Contract)
41. **Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Contract** — ✅ Done (status: contract_only; no Phase-2 implementation now; no request type expansion now; no feature flag enablement; no enablement scripts; no CI behavior change; no Runtime behavior change; no Gateway behavior change; no Hermes dispatch eligibility change; current validated request type remains review only; phase-2 shadow targets are code_review and validation; defines attach/omit/sidecar/safety contracts; operator approval required; automatic enablement blocked; no Hermes default routing; no final review/code_review/validation ownership; no persistence; no raw prompt/artifacts/secrets; next PR: Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Fixture Contract)
42. **Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Test Plan** — ✅ Done (status: test_plan_only; no Phase-2 implementation now; no real implementation tests now; no request type expansion now; no feature flag enablement; no enablement scripts; no CI behavior change; no Runtime behavior change; no Gateway behavior change; no Hermes dispatch eligibility change; current validated request type remains review only; phase-2 shadow targets are code_review and validation; defines required test suites/path coverage/safety assertions/fixtures/prohibited behaviors; operator approval required; automatic enablement blocked; no Hermes default routing; no final review/code_review/validation ownership; no persistence; no raw prompt/artifacts/secrets; next PR: Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Fixture Contract)
43. **Controlled Skill Flow Routing / Governance** — Memory-aware routing with audit trail
44. **Graph Kernel Alignment** — code-review / bugfix as lifecycle nodes
