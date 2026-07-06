# System Capability Review

## 1. Executive Summary

The AI SDLC Runtime is a **shadow-first** TypeScript orchestration engine. All agent calls default to shadow (mock) execution. The system has completed a significant architecture correction: sdlc-* skills are now modeled as flow nodes, not runtime node labels. Runtime auto skill inference has been deprecated. A plan-only Skill Flow Orchestrator contract, shadow orchestrator, and disabled-by-default runtime integration contract are in place.

Codex code_generation has runtime-routed real execution behind `SDLC_EXECUTION_MODE=codex`. Kimi now has a feature-flagged Gateway real dispatch path for `llm_task` only. It requires `SDLC_KIMI_GATEWAY_REAL_DISPATCH=enabled`, `SDLC_KIMI_GATEWAY_INTEGRATION=enabled`, and `SDLC_KIMI_CLI_COMMAND_EXECUTION=enabled`. The path is default-off, Gateway-controlled, and protected by fallback policy, observability, and operational guardrails. It is tested with fake runners; no real Kimi CLI is called in tests. Kimi does not change Runtime `final_status` or default Runtime routing. Hermes has CLI contract, dry-run harness, and executor contract only; real Hermes command executor is not implemented.

The next intended PR is Kimi Gateway Real Dispatch Final Readiness Review. Any future Gateway wiring must be shadow/sidecar first, default off, require multiple flags, and must not change runtime routing or final_status.

### Status Classification

| Category | Count | Examples |
|----------|-------|----------|
| runtime-active | 12 | Graph Kernel, Execution Gateway, Feedback Analyzer |
| shadow-active | 5 | Shadow Adapter, Code Review, Bugfix |
| feature-flagged | 4 | Codex adapter, Policy memory read/write, Runtime integration |
| metadata-only | 6 | Skill Inventory, Flow Inventory, Agent Skill Registry |
| contract-only | 3 | Orchestrator Contract, Integration Contract, Skill Metadata |
| advisory-only | 4 | Policy Suggestions, Shadow Routing, Evolution Proposals |
| disabled-by-default | 3 | Memory write, Memory read, Runtime integration |
| not-implemented | 12 | Kimi/Hermes adapters, Real skill execution, Runtime integration |
| forbidden | 8 | Auto skill inference, Auto Git, Auto policy mutation |

---

## 2. Current Runtime-Active Capabilities

Capabilities activated by `runtime.run()` by default (no feature flags):

| Capability | File | Status |
|-----------|------|--------|
| SDLC Graph Kernel (5 nodes, conditional edges) | `sdlc_graph/` (3 files) | runtime-active |
| State Machine VM (deterministic transitions) | `core/state-machine-vm.ts` | runtime-active |
| Execution Gateway (single dispatch boundary) | `execution/gateway.ts` | runtime-active |
| Shadow Agent Adapter (default execution) | `execution/shadow-agent-adapter.ts` | runtime-active (shadow) |
| Artifact Model (standardized outputs) | `core/artifact.ts` | runtime-active |
| Code Review + Bugfix Loop (bounded, 2 retries) | `runtime.ts:runCodeReviewBugfixLoop()` | runtime-active (shadow) |
| Feedback Analyzer (scores, outcomes, suggestions) | `core/feedback-analyzer.ts` | runtime-active |
| Evolution Proposal Analyzer (read-only) | `core/evolution-proposal-analyzer.ts` | runtime-active (advisory) |
| Agent Policy Engine (scoring) | `core/agent-policy-engine.ts` | runtime-active |
| Agent Decision (complexity-based) | `core/agent-decision.ts` | runtime-active |
| Fanout Engine (multi-repo parallel) | `runtime.ts:executeFanout()` | runtime-active (shadow) |
| Complexity Inference (text-length heuristic) | `core/complexity-inference.ts` | runtime-active |

### Confirmed NOT runtime-active by default

| Capability | Why |
|-----------|-----|
| Skill Flow Orchestrator | Not imported by `runtime.ts` |
| Shadow Skill Flow Orchestrator | Not called by runtime by default; invoked indirectly via feature-flagged sidecar when enabled |
| Runtime Integration Contract | Feature-flagged in `runtime.ts` since shadow integration PR; disabled by default |
| Real sdlc-* skill invocation | No skill invocation exists in code |
| Runtime auto skill annotation | Removed in PR deprecation |
| Real Kimi/Hermes adapters | Never implemented (CLI contract stubs + Kimi dry-run harness exist) |

---

## 3. Shadow-only Capabilities

| Capability | Type | Notes |
|-----------|------|-------|
| Execution Gateway default adapter | runtime-active shadow | `executeShadowAgent()` returns deterministic mock output for all request types |
| Code Review Adapter | runtime-active shadow | Scans for `force_review_fail` marker; PASS by default |
| Bugfix Adapter | runtime-active shadow | Returns `bugfix_patch` artifact; no real patches applied |
| Skill Flow Shadow Orchestrator | standalone shadow helper | `executeSkillFlowShadow()` runs plans in memory; called indirectly via feature-flagged runtime sidecar when enabled |
| Codex adapter (all non-code_generation types) | shadow fallback | Gateway routes non-code_generation to shadow |

### Runtime Shadow Integration Audit Trail

- **Status:** Implemented (feature-flagged, sidecar-only, in-memory)
- **Enabled by:** `SDLC_SKILL_FLOW_RUNTIME_INTEGRATION=shadow`
- **Not persisted** — no disk, no SQLite
- **Does not contain** raw requirement text
- **Does not contain** full artifact contents
- **Does not affect** final_status, runtime trace, or artifacts
- **Does not merge** shadow artifacts into RuntimeResult.artifacts
- **Does not affect** routing or agent selection
- **Does not invoke** real agents or real skills
- **Does not write** files

---

## 4. Feature Flags

| Flag | Default | Enables | Runtime Effect Today | Calls Real Systems |
|------|---------|---------|---------------------|--------------------|
| `SDLC_EXECUTION_MODE=codex` | shadow | Real Codex CLI for `code_generation` | Yes — invokes `codex` CLI via `execFile` | Yes (`codex` binary) |
| `SDLC_POLICY_MEMORY=enabled` | disabled | Write feedback to local SQLite | Yes — writes `.sdlc-runtime/policy-memory.sqlite` | No (local DB only) |
| `SDLC_POLICY_MEMORY_READ=enabled` | disabled | Read SQLite for advisory signals | Yes — appends memory suggestions to feedback | No (local DB only) |
| `SDLC_SKILL_FLOW_RUNTIME_INTEGRATION=shadow` | disabled | Feature-flagged runtime shadow sidecar with in-memory audit trail | Yes — when enabled, attaches sidecar-only shadow integration metadata and auditTrail to RuntimeResult | No |

**Key distinction:** `SDLC_EXECUTION_MODE=codex` is the only flag that calls a real external system. All others are local.

### Feature Flag Files

| Flag | Config File | Implementation Files | Test Files |
|------|------------|---------------------|------------|
| `SDLC_EXECUTION_MODE` | `execution/config.ts` | `execution/codex-adapter.ts`, `execution/gateway.ts` | `tests/codex-adapter.test.ts` |
| `SDLC_POLICY_MEMORY` | `core/policy-memory-config.ts` | `core/policy-memory-store.ts`, `runtime.ts` | `tests/policy-memory.test.ts` |
| `SDLC_POLICY_MEMORY_READ` | `core/policy-memory-config.ts` | `core/policy-memory-analyzer.ts`, `runtime.ts` | `tests/policy-memory-read.test.ts` |
| `SDLC_SKILL_FLOW_RUNTIME_INTEGRATION` | `core/skill-flow-runtime-integration-config.ts` | `core/skill-flow-runtime-integration.ts`, `runtime.ts` | `tests/skill-flow-runtime-integration-contract.test.ts`, `tests/runtime-skill-flow-shadow-integration.test.ts` |

---

## 5. Metadata-only Capabilities

| Capability | File | Read by Runtime? | Affects Routing? |
|-----------|------|-----------------|-----------------|
| existing-skills-inventory.json | Root | No | No |
| skill-flow-inventory.json | Root | No | No |
| runtime-capabilities.json | Root | No (`core/runtime-capabilities.ts` is test-only loader) | No |
| Flow-stage Agent Skill Registry | `core/agent-skill-registry.ts` | No (imported by orchestrator contract, not runtime) | No |
| ExecutionRequest explicit skill metadata | `execution/types.ts` | Yes (gateway validates and preserves) | No (metadata only) |
| Skill Flow Inventory loader | `core/skill-flow-inventory.ts` | No | No |
| Repository Capability Inventory loader | `core/repository-capability-inventory.ts` | No | No |

---

## 6. Contract-only Capabilities

| Contract | Defines | Does NOT Execute | Prepares For |
|----------|---------|-----------------|--------------|
| Skill Flow Orchestrator Contract | `SkillFlowPlan`, `planFlowById()`, `planGlobalEntryFlow()`, `planSpeckitFlow()`, `planDirectImplementationPath()` | No agent calls, no skill invocation, no file writes | Future shadow/real orchestrator execution |
| Skill Flow Runtime Integration Contract | `SkillFlowRuntimeIntegrationConfig`, `decideSkillFlowRuntimeIntegration()`, `previewSkillFlowRuntimeIntegration()` | No runtime.ts modification, no routing change | Feature-flagged runtime shadow integration |
| ExecutionRequest skill metadata contract | Optional `skill?: string`, `skillValidation?: {...}` on `ExecutionRequest` | No auto-inference, no dispatch by skill | Future explicit skill invocation by orchestrator |
| Kimi CLI Adapter Contract Stub | `getKimiCliAdapterConfig()`, `executeKimiCliAdapterContractOnly()` | No CLI execution, no process spawn | Future real Kimi CLI execution |
| Hermes CLI Adapter Contract Stub | `getHermesCliAdapterConfig()`, `executeHermesCliAdapterContractOnly()` | No CLI execution, no process spawn | Future real Hermes CLI execution |
| Kimi CLI Adapter Dry-run Harness | `dryRunKimiCliAdapter()`, `buildKimiCliCommandPreview()` | No process spawn, not wired to runtime or Gateway | Future real Kimi CLI dry-run verification |

---

## 7. Advisory-only Capabilities

| Capability | Produced By | In RuntimeResult? | Changes Routing? | Changes Agent? | Mutates Code/Policy? |
|-----------|------------|-------------------|-----------------|----------------|----------------------|
| Base Policy Suggestions | `core/feedback-analyzer.ts` | Yes (`feedback.policy_suggestions`) | No | No | No |
| Memory-derived Suggestions | `core/policy-memory-analyzer.ts` | Yes (appended when memory read enabled) | No | No | No |
| Shadow Routing Decisions | `core/memory-routing-shadow.ts` | Yes (`feedback.shadow_routing_decisions`, all `applied: false`) | No | No | No |
| Evolution Proposals | `core/evolution-proposal-analyzer.ts` | Yes (`feedback.evolution_proposals`, all `applied: false`) | No | No | No |

---

## 8. Kimi Gateway Real Dispatch

The Kimi Gateway real dispatch stack is implemented behind `SDLC_KIMI_GATEWAY_REAL_DISPATCH=enabled` (plus integration and command execution flags). All components are wired and tested with fake runners; no real Kimi CLI is called in tests.

### Dispatch Layers

| Layer | Status | File |
|-------|--------|------|
| Real Dispatch Contract | contract-only | `execution/kimi-gateway-real-dispatch-contract.ts` |
| Real Dispatch (wired to Gateway) | implemented_feature_flagged | `execution/kimi-gateway-real-dispatch.ts` |
| Fallback Policy | implemented | `execution/kimi-gateway-real-dispatch-fallback-policy.ts` |
| Observability (in-memory) | implemented | `execution/kimi-gateway-real-dispatch-observability.ts` |
| Operational Guardrails | implemented | `execution/kimi-gateway-real-dispatch-guardrails.ts` |

### Guardrails

- **Status:** Implemented (enabled by default when dispatch is enabled)
- **Large prompt blocked:** Yes (`maxPromptLength: 20000`)
- **Large input blocked:** Yes (`maxSerializedInputLength: 50000`)
- **CLI config validated:** Yes (command, enabled flag, args)
- **Timeout validated:** Yes (range: 1000ms–300000ms)
- **Output summaries clamped:** Yes (stdout 4000, stderr 4000, error 2000)
- **No request type expansion:** llm_task only
- **No final_status change:** does not affect Runtime result
- **No routing change:** advisory only within Gateway
- **No file writes:** in-memory only
- **No audit persistence:** persistsAudit: false

Guardrail rejection is classified as `guardrail_rejected` in the fallback policy (not `unexpected_error`).

---

## 9. Explicitly Not Implemented

| Capability | Status |
|-----------|--------|
| Real Kimi CLI execution | Not implemented (contract stub + dry-run harness exist) |
| Real Hermes CLI execution | Not implemented (contract stub exists) |
| Hermes CLI dry-run harness | Not implemented |
| Codex adapter for review / bugfix / code_review types | Not implemented (only `code_generation`) |
| Real sdlc-* skill execution | Not implemented |
| Runtime integration with Skill Flow Orchestrator | Contract only; not active |
| Feature-flagged runtime shadow integration | Not implemented |
| Artifact persistence to MD/HTML/Lark | Not implemented (no `sdlc-docflow-writer` invocation) |
| Real code/document modification by orchestrator | Not implemented |
| Graph Kernel `code-review` / `bugfix` nodes | Not implemented (runtime-managed only) |
| Automatic evolution proposal application | Not implemented (forbidden) |
| Memory-driven actual routing | Not implemented (advisory only) |
| Skill Flow Orchestrator audit trail | Not implemented |

---

## 10. Forbidden by Design

| Capability | Enforced By |
|-----------|------------|
| Default real model execution | `getExecutionMode()` returns "shadow" by default |
| Self-modifying code | No code generation writes to source |
| Automatic Git operations | No `git` calls in codebase |
| Automatic policy mutation | No policy file writes |
| Default memory persistence | `isPolicyMemoryEnabled()` requires exact "enabled" |
| Runtime auto skill inference | `buildSkillAwareExecutionRequest()` removed |
| Direct implementation mapped to sdlc-speckit-implement | Flow inventory marks direct as skillless |
| Automatic evolution proposal application | All proposals have `applied: false` |
| Unflagged runtime skill flow integration | `decideSkillFlowRuntimeIntegration()` returns disabled by default |

---

## 11. Corrected Architecture Compliance

| Assertion | Status | Evidence |
|-----------|--------|----------|
| sdlc-* skills are flow nodes, not runtime node labels | ✅ Confirmed | `skill-flow-inventory.json` models roles (global_entry, flow_internal, etc.); `runtime.ts` has no sdlc-* references |
| sdlc-requirement-normalizer is global entry | ✅ Confirmed | `skill-flow-inventory.json:global_entry_skill`, `SKILL_FLOW_INVENTORY_REPORT.md` |
| sdlc-code-review-normalizer is subflow normalizer, not global entry | ✅ Confirmed | `agent-skill-registry.ts: role="subflow_normalizer"`, `getSubflowEntrySkills()` includes it |
| Direct implementation is skillless | ✅ Confirmed | `skill-flow-orchestrator.ts`: DIRECT_IMPLEMENTATION_AGENT_EXECUTION kind=skillless_agent_execution |
| Speckit implementation is nested flow through sdlc-speckit-pipeline | ✅ Confirmed | `speckit_pipeline` flow definition; sdlc-speckit-implement is flow_internal in that flow only |
| sdlc-speckit-implement is internal Speckit stage | ✅ Confirmed | `agent-skill-registry.ts`: flowIds=["speckit_pipeline"], role="flow_internal" |
| Skill metadata is explicit-only | ✅ Confirmed | `runtime-capabilities.json`: `skill_metadata_explicit_only: true` |
| Runtime does not auto-infer skill metadata | ✅ Confirmed | `buildSkillAwareExecutionRequest()` removed from `runtime.ts` |
| Runtime integration contract is disabled by default | ✅ Confirmed | `getSkillFlowRuntimeIntegrationConfig({})` returns `enabled: false` |

---

## 12. Current Risks

| Risk | Severity | Mitigation | Recommended PR |
|------|----------|------------|----------------|
| Runtime main pipeline is still coarse stub logic (hardcoded node outputs) | Medium | Implement real DocFlow skill invocation in shadow first | Feature-flagged runtime shadow integration |
| Skill Flow Orchestrator is not runtime-integrated | Medium | Wire behind `SDLC_SKILL_FLOW_RUNTIME_INTEGRATION=shadow` | Feature-flagged runtime shadow integration |
| Shadow orchestrator can drift from runtime behavior | Low | Add drift guard tests comparing shadow vs runtime node order | Runtime/Skill Flow Drift Guard |
| SYSTEM_STATUS / runtime-capabilities / JSON files can drift | Low | Add cross-reference validation tests | Ongoing |
| Real adapter boundary is underdeveloped (only Codex code_generation) | Medium | Add Kimi/Hermes adapters behind Execution Gateway under feature flags | Real Agent Adapter Integration |
| Codex adapter supports only code_generation | Medium | Extend to review/bugfix types | Codex Adapter extension |
| No real Kimi/Hermes adapters | Medium | Implement behind feature flags | Real Agent Adapter Integration |
| Skill artifacts are not persisted | Low | Implement sdlc-docflow-writer integration | After shadow orchestrator |
| executeSpeckitPipeline() stub has hardcoded simplified stages | Medium | Replace or remove; use speckit flow from orchestrator | Feature-flagged runtime shadow integration |
| Memory/evolution are advisory but may be mistaken as applied | Low | Documentation + `applied: false` field | Ongoing |

---

## 13. Recommended Next PR

**Recommended: Hermes Runtime Shadow Attachment Observability Summary**

Hermes runtime sidecar now has in-memory audit metadata. The next step is a lightweight observability summary.

---

## 14. Evidence Index

| Claim | Evidence File(s) |
|-------|-----------------|
| Shadow-first runtime default | `runtime-capabilities.json:runtime.default_execution_mode="shadow"` |
| Execution Gateway is single boundary | `execution/gateway.ts:ExecutionGateway.execute()` |
| Codex is feature-flagged | `execution/config.ts:getExecutionMode()`, `execution/codex-adapter.ts` |
| Code Review + Bugfix bounded loop | `runtime.ts:runCodeReviewBugfixLoop()`, `MAX_BUGFIX_ATTEMPTS=2` |
| Feedback analyzer is pure | `core/feedback-analyzer.ts:analyzeRuntimeFeedback()` |
| Policy memory is opt-in | `core/policy-memory-config.ts:isPolicyMemoryEnabled()` requires `"enabled"` |
| Agent Skill Registry is flow-stage based | `core/agent-skill-registry.ts:SKILL_FLOW_REGISTRY` (SkillFlowBinding) |
| Skill Flow Orchestrator is plan-only | `core/skill-flow-orchestrator.ts:planFlowById()` |
| Shadow Orchestrator is in-memory | `core/skill-flow-shadow-orchestrator.ts:executeSkillFlowShadow()` |
| Runtime Integration is disabled by default | `core/skill-flow-runtime-integration-config.ts:getSkillFlowRuntimeIntegrationConfig({})` |
| Auto skill annotation is deprecated | `runtime.ts` has no `buildSkillAwareExecutionRequest` or `inferSkillForExecution` import |
| Direct implementation is skillless | `core/skill-flow-orchestrator.ts:buildSkilllessAgentExecutionStage()` |
| Evolution proposals are read-only | `core/evolution-proposal-analyzer.ts` — all proposals `applied: false` |
| No real Kimi/Hermes | Gateway routes non-codex to `executeShadowAgent()` |
