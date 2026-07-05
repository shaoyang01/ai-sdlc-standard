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
3. **Skill Flow Orchestrator Contract** — Define typed contract for explicit skill invocation
4. **Shadow Skill Flow Orchestrator** — Shadow-mode orchestrator that sequences skills by flow
5. **Real Agent Adapter Integration** — Kimi, Hermes, Codex adapters behind Execution Gateway
6. **Controlled Skill Flow Routing / Governance** — Memory-aware routing with audit trail
7. **Graph Kernel Alignment** — code-review / bugfix as lifecycle nodes
