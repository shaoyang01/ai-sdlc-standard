# SDLC Skill Flow Inventory Report

## 1. Executive Summary

### What is the real skill flow model in this repository?

**Confirmed by source:** sdlc-* skills are **standalone flow nodes** with order, inputs, outputs, and downstream relationships. They are NOT labels for runtime graph nodes. Each skill produces a specific artifact, and the artifact drives the next skill in the flow. The repository defines a rich, multi-path flow model with explicit handoff rules between skills.

### Are sdlc-* skills runtime node labels, or standalone flow nodes?

**Confirmed by source:** Standalone flow nodes. Every skill defines its own:
- Entry conditions (what must exist before it runs)
- Input artifacts it consumes
- Output artifacts it produces
- Downstream consumer skills
- Handoff rules

None of the 20 skills' SKILL.md files reference TypeScript runtime node names (`requirement-summary`, `tech-design`, etc.). The flow is artifact-driven, not runtime-node-driven.

### What is the global entry skill?

**Confirmed by source: `sdlc-requirement-normalizer` is the global entry skill for the whole SDLC flow.** It receives external requirements (Lark/Feishu, HTML, Markdown, chat, PDF), generates standardized `00-需求资料` artifacts, and those artifacts trigger the downstream SDLC flow starting with `sdlc-specification-writer`. No other skill is positioned as a global entry point.

### Is sdlc-code-review-normalizer an entry skill?

**Confirmed: NOT the global entry skill.** It belongs to the code-review subflow. It may normalize raw review input for code-review-only workflows, but it does not start the full SDLC flow. In the full SDLC flow, it appears downstream after implementation and code review, normalizing code review outputs into the `04-代码审核` artifact.

### Is sdlc-speckit-implement only part of the speckit flow?

**Confirmed by source.** The Speckit pipeline has 10 stages, and `sdlc-speckit-implement` is stage 8 (after Analyze, before Sync). It is explicitly NOT generic implementation — it is a controlled implementation stage inside the Speckit SDD process. The skill's contract states: "Execute approved implementation tasks after sdlc-speckit-analyze."

### Does direct implementation invoke any sdlc-* skill?

**Not supported by source.** The repository defines direct implementation as a path where the agent implements directly from prior DocFlow artifacts, without invoking any sdlc-* skill. After implementation, `sdlc-implementation-recorder` documents what happened, but the implementation itself is skillless. The `sdlc-solution-reviewer` development path decision explicitly defines `DIRECT_IMPLEMENTATION` as a distinct path from `SPECKIT_PIPELINE_REQUIRED`.

### Does speckit implementation invoke a sequence of sdlc-* skills?

**Confirmed by source.** Yes. The Speckit pipeline invokes 8 child skills in sequence: `specify → clarify → plan → tasks → analyze → implement → sync → reconcile`, plus 2 controller stages (Preflight, Domain Route). The order is explicitly defined in multiple source files.

---

## 2. Complete Existing Skill List

All 20 skills are in `skills/sdlc-<name>/SKILL.md`. Every skill has a contract in `skill-contracts/known-skills/sdlc-<name>.md`, a manifest entry in `manifest.yaml`, and a registry entry in `registry/skill-registry.md`.

| # | Skill Name | Category (from registry) | Stage (from registry) | Purpose Summary |
|---|-----------|--------------------------|------------------------|-----------------|
| 1 | `sdlc-requirement-normalizer` | Intake / Producer | Requirement Normalization | Normalize raw requirements into DocFlow `00-需求资料` artifact |
| 2 | `sdlc-specification-writer` | Producer | Specification Writing | Generate ESS-compliant `01-技术方案` from intake |
| 3 | `sdlc-solution-reviewer` | Auditor | Specification Audit | Global DocFlow gate; decide DIRECT_IMPLEMENTATION vs SPECKIT_PIPELINE_REQUIRED |
| 4 | `sdlc-speckit-pipeline` | Workflow | Full Lifecycle | Orchestrate the full Speckit SDD path |
| 5 | `sdlc-speckit-specify` | Producer | Spec Sync | Sync DocFlow spec into `specs/{feature}/spec.md` |
| 6 | `sdlc-speckit-clarify` | Auditor / Producer | Clarification Validation | Narrow consistency gate after specify |
| 7 | `sdlc-speckit-plan` | Producer / Auditor | Plan Gate | Create/validate `specs/{feature}/plan.md` |
| 8 | `sdlc-speckit-tasks` | Producer / Auditor | Task Gate | Create/validate `specs/{feature}/tasks.md` |
| 9 | `sdlc-speckit-analyze` | Auditor | Implementation Readiness | Cross-artifact consistency audit before implementation |
| 10 | `sdlc-speckit-implement` | Executor / Producer | Implementation Execution | Execute approved tasks (only skill authorized to modify code) |
| 11 | `sdlc-speckit-sync` | Sync / Producer | Knowledge Sync | Sync verified facts into long-term knowledge targets |
| 12 | `sdlc-speckit-code-doc-reconcile` | Auditor / Sync | Code-Doc Consistency | Audit drift between code, specs, docs, and knowledge |
| 13 | `sdlc-speckit-checklist` | Producer / Auditor | Stage Inspection | Generate stage-specific checklists |
| 14 | `sdlc-code-review-excellence` | Reviewer / Auditor | Code Review Execution | Standards-based code review |
| 15 | `sdlc-code-review-normalizer` | Reviewer / Producer | Code Review Normalization | Normalize raw review into `04-代码审核` artifact |
| 16 | `sdlc-implementation-recorder` | Producer | Implementation Recording | Generate `03-实现记录` from implementation evidence |
| 17 | `sdlc-gate-runner` | Auditor | All Gates | Generic phase-entry gate checker |
| 18 | `sdlc-docflow-writer` | Producer / Renderer / Publisher | DocFlow Artifact Generation | Write/publish DocFlow artifacts to MD/HTML/Lark |
| 19 | `sdlc-test-feedback-classifier` | Reviewer / Producer | Test Feedback Classification | Classify test feedback into `05-测试验收` |
| 20 | `sdlc-test-feedback-sync` | Sync / Producer | Test Feedback Sync | Generate sync recommendations from classified feedback |

---

## 3. Skill Entry Points

### Global Entry

- **`sdlc-requirement-normalizer`** — The only confirmed global entry skill. It receives external requirements (Lark, HTML, MD, chat, PDF) and produces the `00-需求资料` artifact that starts the full SDLC flow.

### Subflow-Specific Entry

- **`sdlc-code-review-normalizer`** — Subflow entry only for code-review-only workflows (when raw review input needs normalization without the full SDLC flow). Not a global entry.
- **`sdlc-speckit-pipeline`** — Subflow entry only after `sdlc-solution-reviewer` selects `SPECKIT_PIPELINE_REQUIRED`. Not a global entry.

### Internal Skills

All remaining 17 skills require upstream artifacts and are not entry points. They consume specific DocFlow or Speckit artifacts produced by prior skills.

---

## 4. Skill Flow Graph

### 4.1 DocFlow Main Path (Always Applicable)

```
sdlc-requirement-normalizer  (00-需求资料)
    │
    ▼
sdlc-specification-writer  (01-技术方案)
    │
    ▼
sdlc-solution-reviewer  (02-方案审核 — Global DocFlow Gate)
    │
    ├── DIRECT_IMPLEMENTATION ──► [Agent implements directly from artifacts]
    │                                    │
    │                                    ▼
    │                            sdlc-implementation-recorder  (03-实现记录)
    │                                    │
    │                                    ▼
    │                            sdlc-code-review-excellence
    │                                    │
    │                                    ▼
    │                            sdlc-code-review-normalizer  (04-代码审核)
    │                                    │
    │                                    ▼
    │                            sdlc-test-feedback-classifier  (05-测试验收)
    │                                    │
    │                                    ▼
    │                            sdlc-test-feedback-sync
    │
    ├── SPECKIT_PIPELINE_REQUIRED ──► sdlc-speckit-pipeline (see §4.2)
    │
    └── BLOCKED_NEEDS_REVISION ──► back to sdlc-specification-writer
```

**Key edge evidence (merged from registry, contracts, SKILL.md, and references):**

| From | To | Key Evidence | Confidence |
|------|----|-------------|------------|
| sdlc-requirement-normalizer | sdlc-specification-writer | "ready for sdlc-specification-writer" (SKILL.md); "为 sdlc-specification-writer 提供稳定输入" (contract) | High |
| sdlc-specification-writer | sdlc-solution-reviewer | "ready for sdlc-solution-reviewer" (SKILL.md); explicit flow diagram in references | High |
| sdlc-solution-reviewer | DIRECT_IMPLEMENTATION | "Development Path Decision" (SKILL.md); development-path-decision.md | High |
| sdlc-solution-reviewer | sdlc-speckit-pipeline | "enter sdlc-speckit-pipeline" (SKILL.md); "invoke sdlc-speckit-pipeline" (development-path-decision.md) | High |
| DIRECT_IMPLEMENTATION | sdlc-implementation-recorder | "handoff from implementation to code review" (registry); recording-workflow.md | High |
| sdlc-implementation-recorder | sdlc-code-review-normalizer | "Recommend sdlc-code-review-normalizer as the next step" (SKILL.md) | High |
| sdlc-code-review-excellence | sdlc-code-review-normalizer | "hands formal report writing to sdlc-code-review-normalizer" (registry); output-and-handoff.md | High |
| sdlc-test-feedback-classifier | sdlc-test-feedback-sync | "consumes sdlc-test-feedback-classifier output" (registry); classification-workflow.md | High |

### 4.2 Speckit Pipeline Internal (After SPECKIT_PIPELINE_REQUIRED)

```
sdlc-speckit-pipeline (orchestrator)
    │
    ├── Preflight (controller)
    ├── Domain Route (controller)
    │
    ├── sdlc-speckit-specify  → specs/{feature}/spec.md
    │       │
    ├── sdlc-speckit-clarify  (Clarify Boundary — user confirmation required)
    │       │
    │   ═══ continuous execution below ═══
    │       │
    ├── sdlc-speckit-plan     → specs/{feature}/plan.md
    │       │
    ├── sdlc-speckit-tasks    → specs/{feature}/tasks.md
    │       │
    ├── sdlc-speckit-analyze  (Cross-artifact consistency audit)
    │       │
    ├── sdlc-speckit-implement  (Code changes + process products)
    │       │
    │       ├──► sdlc-implementation-recorder
    │       ├──► sdlc-code-review-normalizer
    │       │
    ├── sdlc-speckit-sync     → .specify/business_domain/**
    │       │
    └── sdlc-speckit-code-doc-reconcile  (Drift matrix)
```

**Key edge evidence:**

| From | To | Key Evidence | Confidence |
|------|----|-------------|------------|
| sdlc-speckit-pipeline | sdlc-speckit-specify | "execute stages in order" (SKILL.md); stage-sequence.md | High |
| sdlc-speckit-specify | sdlc-speckit-clarify | "Next step: run sdlc-speckit-clarify" (SKILL.md) | High |
| sdlc-speckit-clarify | sdlc-speckit-plan | "Proceed to sdlc-speckit-plan only when no core ambiguity remains" (SKILL.md) | High |
| sdlc-speckit-plan | sdlc-speckit-tasks | "route task breakdown to sdlc-speckit-tasks" (SKILL.md) | High |
| sdlc-speckit-tasks | sdlc-speckit-analyze | "Next step: sdlc-speckit-analyze" (SKILL.md) | High |
| sdlc-speckit-analyze | sdlc-speckit-implement | "Require Analyze Gate readiness before sdlc-speckit-implement" (SKILL.md) | High |
| sdlc-speckit-implement | sdlc-speckit-sync | "route stable fact sync to sdlc-speckit-sync" (SKILL.md) | High |
| sdlc-speckit-sync | sdlc-speckit-code-doc-reconcile | "Next step: sdlc-speckit-code-doc-reconcile" (SKILL.md) | High |

---

## 5. Skill Input / Output Artifact Contracts

| Skill | Primary Inputs | Primary Outputs | Artifact Type | Downstream Consumer |
|-------|---------------|-----------------|---------------|---------------------|
| sdlc-requirement-normalizer | Raw requirements (Lark, MD, HTML, chat) | `library/{id}/00-需求资料/` | 00-需求资料 | sdlc-specification-writer |
| sdlc-specification-writer | 00-需求资料 | `library/{id}/01-技术方案/` | 01-技术方案 | sdlc-solution-reviewer |
| sdlc-solution-reviewer | 01-技术方案 | `library/{id}/02-方案审核/` + Path Decision | 02-方案审核 | DIRECT / sdlc-speckit-pipeline |
| sdlc-implementation-recorder | Diff, changed files, task status | `library/{id}/03-实现记录/` | 03-实现记录 | sdlc-code-review-normalizer |
| sdlc-code-review-excellence | Diff, spec, solution review | Review findings | Code Review | sdlc-code-review-normalizer |
| sdlc-code-review-normalizer | Raw review, diff, spec | `library/{id}/04-代码审核/` | 04-代码审核 | sdlc-test-feedback-classifier |
| sdlc-test-feedback-classifier | Raw feedback, test results | `library/{id}/05-测试验收/` | 05-测试验收 | sdlc-test-feedback-sync |
| sdlc-test-feedback-sync | 05-测试验收 | Sync recommendations | Test Feedback Sync | sdlc-speckit-sync |
| sdlc-speckit-specify | 01-技术方案, 02-方案审核 | `specs/{feature}/spec.md` | Spec | sdlc-speckit-clarify |
| sdlc-speckit-plan | spec.md, clarify result | `specs/{feature}/plan.md` | Plan | sdlc-speckit-tasks |
| sdlc-speckit-tasks | spec.md, plan.md | `specs/{feature}/tasks.md` | Tasks | sdlc-speckit-analyze |
| sdlc-speckit-analyze | spec, plan, tasks, inventory | Analyze Gate result | Gate | sdlc-speckit-implement |
| sdlc-speckit-implement | tasks.md, analyze result | Code changes + implementation.md | Implementation | sdlc-speckit-sync |
| sdlc-speckit-sync | Implementation evidence | `.specify/business_domain/**` | Knowledge | sdlc-speckit-code-doc-reconcile |
| sdlc-speckit-code-doc-reconcile | Code, specs, docs, knowledge | Drift Matrix | Reconciliation | Routes upstream |
| sdlc-docflow-writer | Source content (from caller) | MD/HTML/Lark documents | Rendered Doc | Called by multiple skills |
| sdlc-gate-runner | manifest.md, artifact for gate | Gate Report | Gate | Route to specialized owner |

---

## 6. Direct Implementation vs Speckit Implementation

### What does the repository say about direct implementation?

**Evidence from `sdlc-solution-reviewer/references/development-path-decision.md` (line 133-134):**
> "Proceed to implementation, then write 03-实现记录."

**Evidence from `sdlc-solution-reviewer/SKILL.md`:**
> The Development Path Decision can be `DIRECT_IMPLEMENTATION`. When this path is chosen, the agent implements directly from DocFlow artifacts without entering the Speckit pipeline.

**Conclusion:** Direct implementation is a **skillless agent execution**. The agent receives `01-技术方案` and `02-方案审核` and implements directly. After implementation, `sdlc-implementation-recorder` documents the results. No sdlc-* skill is invoked during implementation.

### Does direct implementation call any sdlc-* skill?

**No.** Direct implementation is explicitly defined as the path that does NOT enter sdlc-speckit-pipeline. The agent works from prior artifacts directly.

### Does direct implementation simply ask an agent to implement from prior artifacts?

**Yes.** Confirmed by the development-path-decision.md and the artifact flow model.

### What does the repository say about speckit implementation?

**Evidence from `skills/sdlc-speckit-pipeline/SKILL.md`:**
> The Speckit pipeline has 10 stages: Preflight, Domain Route, Specify, Clarify, Plan, Tasks, Analyze, Implement, Sync, Reconcile.

**Evidence from `skills/sdlc-speckit-pipeline/references/stage-sequence.md`:**
> Each stage maps to a specific child skill. The transition policy changes at the Clarify boundary: stages before Clarify require user confirmation; stages after Clarify execute continuously.

### Is sdlc-speckit-implement only a stage inside the speckit flow?

**Confirmed.** It is stage 8 of 10 in the Speckit pipeline. It explicitly requires `sdlc-speckit-analyze` output as input. It is not a generic implementation skill.

### What are the speckit flow stages and corresponding skills?

| Stage | Skill | Purpose |
|-------|-------|---------|
| Preflight | (controller) | Verify activation conditions |
| Domain Route | (controller) | Materialize domain route |
| Specify | sdlc-speckit-specify | Sync DocFlow spec into Speckit spec |
| Clarify | sdlc-speckit-clarify | Validate residual clarification |
| Plan | sdlc-speckit-plan | Create technical plan |
| Tasks | sdlc-speckit-tasks | Break down into implementation tasks |
| Analyze | sdlc-speckit-analyze | Cross-artifact consistency audit |
| Implement | sdlc-speckit-implement | Execute approved tasks |
| Sync | sdlc-speckit-sync | Persist verified facts |
| Reconcile | sdlc-speckit-code-doc-reconcile | Audit code-doc-knowledge drift |

### Final Conclusion for This Section

**Direct implementation should NOT be mapped to sdlc-speckit-implement.** Direct implementation is a skillless agent execution path. sdlc-speckit-implement is only meaningful inside the Speckit pipeline.

**Speckit implementation SHOULD use sdlc-speckit-implement as one internal stage** within the full 10-stage pipeline orchestrated by sdlc-speckit-pipeline.

---

## 7. Runtime Graph Nodes vs Skill Flow Nodes

### Current TypeScript Runtime Nodes

From `sdlc_graph/types.ts`: `requirement-summary`, `tech-design`, `review`, `implementation`, `validation`
Plus runtime-managed: `code-review`, `bugfix`

### Relationship Table

| Runtime Node | Current Code Behavior | Related Skill(s) | Relationship Type | Evidence |
|-------------|----------------------|------------------|-------------------|----------|
| requirement-summary | Regex-based multi-repo detection; returns parsed summary | sdlc-requirement-normalizer | **Conceptual mapping** | Same purpose but runtime is a stub; real skill does full normalization |
| tech-design | Hardcoded `{ result: "design_completed" }` | sdlc-specification-writer | **Conceptual mapping** | Runtime stub; real skill generates full ESS-compliant spec |
| review | Checks `review_result` context or complexity-based PASS/FAIL | sdlc-solution-reviewer | **Conceptual mapping** | Runtime uses simple heuristic; real skill is full gate with 3-path decision |
| implementation | Calls executionGateway (code_generation) or fanout or speckit stub | (Direct: none) / (Speckit: sdlc-speckit-implement) | **Conceptual mapping / No evidence for direct** | Direct impl is skillless; Speckit impl is one stage of pipeline |
| validation | Hardcoded `{ result: "validated" }` | sdlc-test-feedback-classifier | **Conceptual mapping** | Runtime stub |
| code-review | Shadow code-review adapter (force_review_fail marker) | sdlc-code-review-excellence + sdlc-code-review-normalizer | **Conceptual mapping** | Runtime is shadow stub; real skills do standards-based review + normalization |
| bugfix | Shadow bugfix adapter (placeholder patch) | (None) | **No evidence** | Bugfix is a runtime concept not represented as a standalone sdlc-* skill |

**Key finding:** All relationships between runtime nodes and sdlc-* skills are **conceptual mappings only**. No runtime node directly invokes any sdlc-* skill. The runtime is a shadow simulation; the real skill execution model would be orchestrated differently.

---

## 8. Skill Orchestration Model

### Model A: Runtime-node-to-skill mapping

Runtime node chooses which skill to invoke.

**Supported by source?** No. The current runtime does not invoke any sdlc-* skill. The Agent Skill Registry (PR-5.2) attempted this mapping, but it is conceptually wrong — skills are not 1:1 with runtime nodes.

**Pros:** Simple to implement incrementally.

**Cons:** Wrong abstraction. Skills like sdlc-speckit-implement are internal pipeline stages, not runtime node handlers. Direct implementation is skillless. Multiple skills can relate to one conceptual area (code-review-excellence + code-review-normalizer).

### Model B: Skill-flow orchestration

Entry skill produces artifact → artifact drives next skill → skill chain executes.

**Supported by source?** Yes. This matches the repository's own documentation. Every skill defines what artifact it produces and which skill consumes it. The flow is artifact-driven.

**Pros:** Matches the repository's actual design. Scales to complex pipelines (Speckit). Clear handoff contracts.

**Cons:** Requires a skill orchestrator (like sdlc-speckit-pipeline for the Speckit path). More complex to implement than simple node-to-skill mapping.

### Model C: Hybrid

Runtime graph controls coarse lifecycle → skill flows run inside selected lifecycle stages.

**Supported by source?** Partially. The DocFlow main path looks like this: runtime gate (solution-reviewer) decides direct vs speckit, then either direct agent execution or Speckit skill flow executes. This is a reasonable model.

**Pros:** Flexible. Leverages existing runtime graph for high-level control while using skill flows for detailed work.

**Cons:** Requires careful boundary definition between "runtime lifecycle stage" and "skill flow stage."

### Recommendation

**Model C (Hybrid)** best matches the repository evidence. The runtime graph should control the coarse lifecycle (intake → design → review → execution → validation), while skill flows run inside execution stages. Specifically:
- `requirement-summary`, `tech-design`, `review` map to DocFlow main path skills
- `implementation` node forks into DIRECT (skillless agent execution) or SPECKIT (sdlc-speckit-pipeline orchestrates child skills)
- `code-review` and `bugfix` are runtime-managed concepts that correspond to multiple skills
- `validation` maps to test feedback skills

---

## 9. Existing Runtime Connectivity

**No sdlc-* skill is currently called by the TypeScript runtime.** The only file that references sdlc-* names is `core/agent-skill-registry.ts`, which is purely metadata.

| Skill | Runtime-called | Gateway-called | Test-called | Only documented |
|-------|---------------|----------------|-------------|-----------------|
| All 20 sdlc-* skills | No | No | No | Yes |

The runtime's `executeSpeckitPipeline()` is a stub that hardcodes 4 incorrect stage names (`spec`, `analyze`, `implement`, `sync`) and does not invoke any sdlc-* skill.

---

## 10. Corrected Interpretation of Current PR Direction

### PR-5.2 (Agent Skill Registry)
**Still useful** as a metadata catalog of existing skills. However, the registry maps skills to runtime graph nodes, which is **conceptually wrong**. Skills are flow nodes, not runtime node handlers. The registry should map skills to their **flow stage, input artifacts, output artifacts, and downstream consumers**, not to runtime nodes.

### PR-5.3 (Skill-aware ExecutionRequest)
**Still useful** as infrastructure. The ability to carry skill metadata on execution requests is valuable for observability.

### PR-5.4 (Runtime Skill Annotation)
**Should be reconsidered.** Automatically inferring skills from (agent, node, requestType) tuples is based on the wrong abstraction. Implementation node with agent=codex does not mean sdlc-speckit-implement — it could mean direct implementation (no skill) or sdlc-implementation-recorder (recording, not implementing).

### Proposed PR-5.5 (Skill Inference Disambiguation)
**Should NOT proceed as currently conceived.** The fundamental issue is not disambiguation — it's that the mapping from runtime nodes to skills is the wrong model. Disambiguation won't fix that.

### Should direct implementation remain skillless?

**Yes.** The repository explicitly defines direct implementation as a path where the agent implements directly from artifacts without invoking any sdlc-* skill.

### Should speckit implementation be modeled as a nested skill flow?

**Yes.** The sdlc-speckit-pipeline skill already defines this. The runtime stub should be replaced with actual pipeline orchestration.

---

## 11. Recommended Next Steps

### Recommended Order

1. **Build explicit Skill Flow Inventory metadata** — Create a machine-readable representation of the skill flow graph with edges, artifacts, and handoff contracts. This validates §4 of this report.

2. **Rewrite Agent Skill Registry around flow stages, not runtime nodes** — Each skill binding should describe its position in the flow (entry/internal/terminal), its input artifacts, its output artifacts, and its downstream consumers.

3. **Model direct implementation as skillless agent execution** — The runtime implementation node should not carry a skill annotation. Direct implementation means the agent works from prior DocFlow artifacts directly.

4. **Model speckit implementation as a nested skill pipeline** — When the solution reviewer selects SPECKIT_PIPELINE_REQUIRED, the runtime should invoke sdlc-speckit-pipeline, which orchestrates the 10-stage sequence internally.

5. **Keep ExecutionRequest skill metadata but stop automatic runtime inference** — Skill metadata on requests is useful for observability, but it should be set explicitly by the skill orchestrator, not inferred from (agent, node, requestType) tuples.

6. **Remove or update executeSpeckitPipeline() stub** — The current stub hardcodes 4 incorrect stage names. It should either be removed or replaced with a real pipeline invocation.

### Do NOT proceed with:

- PR-5.5 (Skill Inference Disambiguation) as currently conceived
- Any mapping of sdlc-speckit-implement to generic implementation
- Any skill inference based on (agent, node, requestType) tuples

---

## 12. Open Questions

1. **Is sdlc-code-review-normalizer intended as a global entry skill?** Evidence is mixed. It can function as one in code-review-only flows, but the primary entry is sdlc-requirement-normalizer.

2. **Should every skill produce a standardized artifact?** The repository suggests yes — every skill maps to a numbered DocFlow artifact or a Speckit artifact. But not all skills produce library artifacts (e.g., sdlc-speckit-analyze produces a gate result, not a persisted file).

3. **Should speckit flow be optional based on complexity or explicit user choice?** The solution reviewer's Development Path Decision already supports this — DIRECT_IMPLEMENTATION vs SPECKIT_PIPELINE_REQUIRED.

4. **Should an agent invoke one skill at a time, or should runtime orchestrate skill chains?** The repository suggests both: the sdlc-speckit-pipeline orchestrates a chain, while the DocFlow main path may invoke skills one at a time through the solution reviewer gate.

5. **How should the runtime transition between the DocFlow main path and the Speckit pipeline?** The solution reviewer fork is the natural boundary, but the runtime currently has no mechanism to invoke the actual sdlc-speckit-pipeline skill.

---

## Final Recommendation

**Recommended architecture direction:** Hybrid Model C — Runtime graph controls coarse lifecycle (intake, design, review, execution, validation). Skill flows run inside execution stages. Direct implementation is skillless. Speckit implementation is a nested skill pipeline.

**The full SDLC flow must start from `sdlc-requirement-normalizer`.** The runtime or future skill orchestrator must treat sdlc-requirement-normalizer as the external-demand intake boundary. Do NOT model sdlc-code-review-normalizer as the global flow start.

**Recommended next PR:** Build explicit Skill Flow Inventory metadata (machine-readable flow graph with edges and artifacts). Before any more PRs on skill inference or routing, the actual flow model should be codified.

**Recommended deprecation:** Stop automatic runtime skill annotation (PR-5.4's `buildSkillAwareExecutionRequest`). The (agent, node, requestType) → skill mapping is the wrong model. **sdlc-* skills are flow nodes, not runtime node labels.** Direct implementation is skillless. sdlc-speckit-implement is only an internal Speckit stage. Automatic runtime skill inference based on agent/node/requestType should not continue.
