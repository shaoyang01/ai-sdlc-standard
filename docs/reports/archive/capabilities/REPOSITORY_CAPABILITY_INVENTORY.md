# Repository Capability Inventory

## 1. Scope

This inventory documents all capabilities found in the `ai-sdlc-standard` repository as of the static scan performed for PR-5.1.1. It covers existing sdlc-* skills, skill registry/manifest/contract files, runtime entrypoints, execution adapters, policy/feedback/memory/evolution modules, and potentially unconnected modules.

## 2. Existing sdlc-* Skills

**20 sdlc-* skills found.** All skills share a consistent structure:
- `skills/sdlc-<name>/SKILL.md` — skill definition
- `skills/sdlc-<name>/references/*.md` — reference documentation
- `skill-contracts/known-skills/sdlc-<name>.md` — skill contract
- Registered in `manifest.yaml` and `registry/skill-registry.md`

| # | Skill Name | Category | Stage | Wired to Runtime? |
|---|-----------|----------|-------|-------------------|
| 1 | `sdlc-code-review-excellence` | Reviewer / Auditor | Code Review Execution | No |
| 2 | `sdlc-code-review-normalizer` | Reviewer / Producer | Code Review Normalization | No |
| 3 | `sdlc-docflow-writer` | Producer / Renderer / Publisher | DocFlow Artifact Generation | No |
| 4 | `sdlc-gate-runner` | Auditor | All Gates | No |
| 5 | `sdlc-implementation-recorder` | Producer | Implementation Recording | No |
| 6 | `sdlc-requirement-normalizer` | Intake / Producer | Requirement Normalization | No |
| 7 | `sdlc-solution-reviewer` | Auditor | Specification Audit | No |
| 8 | `sdlc-specification-writer` | Producer | Specification Writing | No |
| 9 | `sdlc-speckit-analyze` | Auditor | Implementation Readiness | No |
| 10 | `sdlc-speckit-checklist` | Producer / Auditor | Stage Inspection | No |
| 11 | `sdlc-speckit-clarify` | Auditor / Producer | Clarification Validation | No |
| 12 | `sdlc-speckit-code-doc-reconcile` | Auditor / Sync | Code-Doc Consistency | No |
| 13 | `sdlc-speckit-implement` | Executor / Producer | Implementation Execution | No |
| 14 | `sdlc-speckit-pipeline` | Workflow | Full Lifecycle | No (hardcoded stages only) |
| 15 | `sdlc-speckit-plan` | Producer / Auditor | Plan Gate | No |
| 16 | `sdlc-speckit-specify` | Producer | Spec Sync | No |
| 17 | `sdlc-speckit-sync` | Sync / Producer | Knowledge Sync | No |
| 18 | `sdlc-speckit-tasks` | Producer / Auditor | Task Gate | No |
| 19 | `sdlc-test-feedback-classifier` | Reviewer / Producer | Test Feedback Classification | No |
| 20 | `sdlc-test-feedback-sync` | Sync / Producer | Test Feedback Sync | No |

**Key finding: All 20 skills are "documented skill contracts" (prompt skills).** None are wired into the TypeScript runtime. The runtime uses hardcoded node types (`requirement-summary`, `tech-design`, `review`, `implementation`, `validation`) and agent names (`kimi`, `codex`, `hermes`) — not skill names.

## 3. Skill Registry / Manifest / Contract Files

| File | Category |
|------|----------|
| `registry/skill-registry.md` | Skill Registry (22 entries) |
| `manifest.yaml` | Skill Manifest (20 skills declared) |
| `templates/skill-registry-entry-template.md` | Registry Entry Template |
| `skill-contracts/renderer-skill-contract.md` | Generic Renderer Contract |
| `skill-contracts/producer-skill-contract.md` | Generic Producer Contract |
| `skill-contracts/sync-skill-contract.md` | Generic Sync Contract |
| `skill-contracts/auditor-skill-contract.md` | Generic Auditor Contract |
| `skill-contracts/executor-skill-contract.md` | Generic Executor Contract |
| `skill-contracts/skill-contract-template.md` | Contract Template |
| `skill-contracts/skill-category-guide.md` | Category Guide |
| `skill-contracts/known-skills/*.md` | 20 Known-Skill Contracts |
| `scripts/validate-skill-contracts.rb` | Ruby Validation Script |

## 4. Runtime Entrypoints

| Entrypoint | File | Status |
|-----------|------|--------|
| Main Runtime | `runtime.ts` | Implemented |
| Demo | `demo.ts` | Implemented |
| Graph Kernel | `sdlc_graph/` (3 files) | Implemented |
| Execution Gateway | `execution/gateway.ts` | Implemented |
| State Machine VM | `core/state-machine-vm.ts` | Implemented |
| Execution Context | `core/execution-context.ts` | Implemented |
| Execution State | `core/execution-state.ts` | Implemented |
| Artifact Model | `core/artifact.ts` | Implemented |
| Node Artifacts | `core/node-artifacts.ts` | Implemented |
| Context Builder | `core/context-builder.ts` | Implemented |
| Execution Trace | `core/execution-trace.ts` | Implemented |
| Complexity Inference | `core/complexity-inference.ts` | Implemented |

## 5. Execution Adapters

| Adapter | Agents | Request Types | Mode | Default? |
|---------|--------|--------------|------|----------|
| Shadow | kimi, codex, hermes | All 6 types | Shadow | ✅ Yes |
| Codex | codex only | code_generation only | Feature-flagged real | ❌ No (`SDLC_EXECUTION_MODE=codex`) |
| Code Review | All | code_review | Shadow | ✅ Yes |
| Bugfix | All | bugfix | Shadow | ✅ Yes |

**Kimi and Hermes have NO real adapters.** They always fall through to the Shadow adapter.

## 6. Policy Modules

| Module | Changes Routing? | Reads Memory? | Notes |
|--------|-----------------|---------------|-------|
| `agent-policy.ts` | No (types only) | No | Policy type definitions |
| `agent-policy-engine.ts` | Yes (scores agents) | No | Multi-factor scoring |
| `agent-decision.ts` | Yes (selects agent) | No | Complexity-based selection |
| `policy-memory-analyzer.ts` | No (suggestions only) | Yes | Advisory prefer/avoid suggestions |

## 7. Feedback / Memory / Evolution Modules

| Module | Category | Default | Notes |
|--------|----------|---------|-------|
| `feedback-types.ts` | Feedback | Enabled | All feedback type definitions |
| `feedback-analyzer.ts` | Feedback | Enabled | Pure analyzer for scores/suggestions |
| `review-types.ts` | Feedback | Enabled | Code review result types |
| `policy-memory-types.ts` | Memory | Enabled | Memory record types |
| `policy-memory-config.ts` | Memory | Enabled | Read/write feature flags |
| `policy-memory-builder.ts` | Memory | Enabled | Record factory |
| `policy-memory-store.ts` | Memory | Opt-in | SQLite persistence |
| `policy-memory-context.ts` | Memory | Enabled | Context wrapper |
| `memory-routing-shadow.ts` | Shadow Routing | Enabled | Advisory shadow decisions |
| `evolution-proposal-analyzer.ts` | Evolution | Enabled | Read-only proposals |

## 8. Runtime-connected Capabilities

These capabilities are directly wired into `runtime.ts` and affect pipeline execution.

**Graph Routing vs Agent Selection — Critical Distinction:**

- **Graph Kernel (`sdlc_graph/`)** is the single source of truth for graph transitions (which node comes next). Only the Graph Kernel and `getNextNode()` change graph routing.
- **Agent Policy Engine** and **Agent Decision** affect **actual agent selection** (which agent executes a node), but they do NOT change graph routing. Graph Kernel transitions are unaffected by agent policy.
- **Memory suggestions, shadow routing decisions, and evolution proposals** are **advisory only**. They do NOT change actual agent selection or graph routing. They appear in `RuntimeResult.feedback` for observability and future governance.

### Runtime-connected Capabilities

- SDLC Graph Kernel (node/edge transitions) — **changes graph routing**
- State Machine VM (deterministic state transitions) — **changes graph routing**
- Execution Gateway (single dispatch boundary)
- Agent Policy Engine (multi-factor agent scoring) — **changes actual agent selection, NOT graph routing**
- Agent Decision Layer (complexity-based selection) — **changes actual agent selection, NOT graph routing**
- Shadow Agent Adapter (default execution)
- Codex Adapter (feature-flagged real execution)
- Code Review Adapter (shadow review in bounded loop)
- Bugfix Adapter (shadow bugfix in bounded loop)
- Feedback Analyzer (pure score/suggestion computation)
- Policy Memory Store (opt-in SQLite persistence)
- Memory Routing Shadow (advisory shadow decisions) — **advisory only**
- Evolution Proposal Analyzer (read-only proposals) — **advisory only**

## 9. Shadow-only Capabilities

Always return deterministic mock results; never call real external agents:

- Shadow Agent Adapter (all non-codex requests)
- Code Review Adapter
- Bugfix Adapter
- All Kimi-invoked node executions
- All Hermes-invoked node executions
- DocFlow node executors (hardcoded outputs)

## 10. Advisory-only Capabilities

These capabilities are computed and returned in `RuntimeResult.feedback` but do **NOT** change graph routing or actual agent selection:

- Policy Suggestions from memory read (`policy-memory-analyzer.ts`) — **advisory only**
- Shadow Routing Decisions (`memory-routing-shadow.ts`, all `applied: false`) — **advisory only**
- Evolution Proposals (`evolution-proposal-analyzer.ts`, all `applied: false`) — **advisory only**

**These capabilities never modify:**
- Graph Kernel transitions (no node order change)
- Agent Policy Engine rules (no weight or scoring change)
- Actual agent selection (no runtime agent override)
- Source code or policy files (no file mutation)

## 11. Potentially Unconnected Modules

| Path | Reason | Confidence |
|------|--------|------------|
| `loop/` | Legacy LOOP orchestration engine. Not imported by runtime.ts or any test. | High |
| `docflow/` | Legacy DocFlow linear state machine. Not imported by runtime.ts or any test. | High |
| `scripts/validate-skill-contracts.rb` | Ruby validation script. Referenced by docs but not called by runtime. | Medium |
| `fixtures/` | Test fixture data. Not imported by runtime or test TypeScript. | Low |

## 12. Implications for PR-5.2 Agent Skill Registry

**PR-5.2 must use the existing sdlc-* skill names found in this inventory as canonical skill names.** Do not invent replacement skill names unless there is an explicit migration plan.

The 20 existing sdlc-* skills are well-documented prompt skills with contracts, registries, manifests, and reference documentation. The gap is that none are wired into the TypeScript runtime — they exist purely as specification/contract artifacts.

When building the Agent Skill Registry in PR-5.2:
- Use exact skill names from this inventory (e.g., `sdlc-requirement-normalizer`, not `requirement_analysis`)
- Each skill already has a contract in `skill-contracts/known-skills/`
- Each skill already has a registry entry in `registry/skill-registry.md`
- Each skill already has a manifest entry in `manifest.yaml`
- The registry should map skill names to runtime adapter dispatch rules
- The skill invocation contract should define how the runtime invokes a skill through the Execution Gateway
