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

## 3. Shadow-only Capabilities

These capabilities exist but run entirely in shadow mode with no real external calls:

| Capability | Notes |
|-----------|-------|
| Code Review Adapter | Scans artifacts for `force_review_fail` marker; PASS by default |
| Bugfix Adapter | Returns shadow `bugfix_patch` artifact; no patches applied to disk |
| Kimi Agent | Not implemented — all Kimi calls fall through to shadow adapter |
| Hermes Agent | Not implemented — all Hermes calls fall through to shadow adapter |

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
| Real Kimi adapter (`execFile` or API) | All Kimi calls → shadow |
| Real Hermes adapter | All Hermes calls → shadow |
| Codex adapter for `review` / `code_review` / `bugfix` types | Only `code_generation` supported |
| Memory-driven actual agent selection | Shadow decisions exist but are not applied |
| Code Review / Bugfix routing through Codex | Always shadow, no `SDLC_EXECUTION_MODE` routing |
| Persistent self-evolution (auto-apply proposals) | Not implemented |
| Agent Policy Engine consuming memory scores | Not implemented |
| Graph Kernel `code-review` / `bugfix` nodes | Managed at runtime level only |

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

## 10. Recommended Next PRs

1. **PR-5.2** — Agent Skill Registry and Skill Invocation Contract
2. **PR-5.3** — Real Kimi Adapter behind Execution Gateway
3. **PR-5.4** — Real Hermes Adapter behind Execution Gateway
4. **PR-5.5** — Codex Adapter extended to support review / bugfix request types
5. **PR-5.6** — Agent Policy Engine consumes memory scores
6. **PR-5.7** — Governed memory-aware routing toggle with audit trail
7. **PR-5.8** — Graph Kernel upgrade for explicit code-review / bugfix nodes
