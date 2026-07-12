# Project File Inventory Report

> **Branch**: `feature/loop-runtime-v1`
> **Date**: 2026-07-05
> **Purpose**: Complete file catalog of the AI SDLC Standard Library repository.

---

## Directory Overview

| Directory | Files | Purpose |
|------|:-:|------|
| `ai-sdlc/` | 25 | Governance protocols (rail routing, sync modes, business domain, lifecycle) |
| `skills/` | ~90 | Installable sdlc-* / sdlc-speckit-* Prompt Skills + references |
| `skill-contracts/` | ~25 | Skill contracts and category guides |
| `docflow/` | 14 | DocFlow pure state machine (5 nodes, schema, engine) |
| `loop/` | 7 | LOOP deterministic dispatcher (engine, executor, router, registry) |
| `fanout_engine/` | 6 | Multi-repo parallel execution engine |
| `fanout_feedback/` | 5 | Fanout-to-DocFlow validation feedback loop |
| `evolution/` | 6 | Read-only system observability layer |
| `adoption/` | 6 | Controlled change gateway |
| `scripts/` | 9 | Validators, bootstrap, audit scripts |
| `templates/` | 19 | DocFlow, manifest, profile, proposal templates |
| `fixtures/` | 33 | 16 product parity fixture categories (synthetic) |
| `docs/` | 13 | Guides, reports, archive |
| `ess/` | 4 | Technical spec, review, code-review, test-feedback schemas |
| `checklists/` | 5 | Stage-specific checklists |
| Root files | 7 | README, manifest, runtime, audit, config |

---

## Runtime Modules (TypeScript)

```
runtime.ts                     # SDLC entrypoint: run(requirement) → RuntimeResult

docflow/
  core/docflow_engine.ts        # DocFlow engine (5-node pipeline executor)
  nodes/requirement-summary/    # Parses requirement text, detects multi-repo
  nodes/tech-design/            # Records design metadata
  nodes/review/                 # Records review result (PASS/FAIL/PASS_WITH_RISK)
  nodes/implementation/         # Records implementation + mode (direct/speckit)
  nodes/validation/             # Runs quality checks
  schemas/                      # JSON schemas (requirement, docflow)
  types/index.ts                # TypeScript interfaces

loop/
  core/loop_engine.ts           # LoopEngine: executeFull / executeSingle
  executor/loop_executor.ts     # Dispatches node → agent, records history
  router/node_router.ts         # Static node lookup (getNextNode)
  router/agent_router.ts        # Static agent lookup (getAgent)
  registry/node_map.ts          # NODE_FLOW table (5-node sequence)
  registry/agent_map.ts         # AGENT_MAP table (node → agent)
  types/index.ts                # LoopContext, LoopResult, LoopAgent

fanout_engine/
  core/fanout_engine.ts         # FanoutEngine: build → execute → aggregate
  builder/task_builder.ts       # sub_requirements → ExecutionTasks
  dispatcher/task_dispatcher.ts # Dispatch task to agent (shadow-mode)
  executor/parallel_executor.ts # Promise.all concurrent execution
  aggregator/result_aggregator.ts # Group results by repo
  types/index.ts                # FanoutInput, TaskResult, FanoutResult

fanout_feedback/
  core/feedback_engine.ts       # FeedbackEngine: collect → map → report
  collector/result_collector.ts # Collects fanout results (pass-through)
  mapper/docflow_mapper.ts      # Maps repo results → DocFlow validation context
  builder/validation_report_builder.ts # Builds ValidationReport (success/partial/failed)
  types/index.ts                # FeedbackInput, ValidationReport

evolution/
  core/evolution_engine.ts      # EvolutionEngine: collect → metrics → analyze → report
  collector/execution_collector.ts # Computes deterministic metrics
  analyzer/pattern_analyzer.ts  # Detects structural patterns (bottleneck, hotspot, imbalance)
  reporter/insight_reporter.ts  # Generates health summary + non-actionable suggestions
  metrics/system_metrics.ts     # Clean re-export layer
  types/index.ts                # ExecutionEvent, SystemMetrics, DetectedPattern

adoption/
  core/adoption_engine.ts       # AdoptionEngine: intake → classify → evaluate → validate → apply
  intake/evolution_listener.ts  # Receives proposals from Evolution (pass-through)
  classifier/change_classifier.ts # Classifies change type (config/structural/execution)
  validator/change_validator.ts # Risk evaluation (rule-based) + validation gate
  executor/change_executor.ts   # Applies approved changes, generates change log
  types/index.ts                # EvolutionProposal, AdoptionResult
```

---

## SDLC Governance Documents

### ai-sdlc/ (25 files)

| File | Purpose |
|------|------|
| `agents-rail-routing.md` | Legacy/new-rail dual-rail routing |
| `artifact-flow.md` | Artifact flow specification |
| `artifact-storage.md` | Artifact storage rules |
| `artifact-versioning.md` | Artifact versioning protocol |
| `business-domain-compatible-update.md` | Compatible update protocol for existing L4 |
| `business-domain-naming-and-shape.md` | Naming convention + shape preservation |
| `business-domain-sync-source-modes.md` | speckit_driven / library_driven / hybrid |
| `change-control.md` | Change control and Re-Gate |
| `complexity-routing.md` | Complexity-based routing rules |
| `library-driven-sync-runtime.md` | Library-driven sync runtime hardening |
| `lifecycle.md` | SDLC lifecycle definition |
| `phase-gates.md` | Phase gate definitions |
| `project-type-contract-artifact-matrix.md` | Per-project-type companion artifact requirements |
| `shared-business-domain-governance.md` | Shared business domain governance |
| `speckit-*.md` (7 files) | Speckit document generation, governance, dual-rail, project types |
| `specs-run-lifecycle.md` | Specs as run-level artifact |
| `specs-run-metadata-and-archive.md` | specs_run_id lifecycle + archive/cleanup |

---

## Skills Inventory

| Skill | Contract | References |
|------|:--:|:-:|
| `sdlc-code-review-excellence` | ✅ | 5 |
| `sdlc-code-review-normalizer` | ✅ | 4 |
| `sdlc-docflow-writer` | ✅ | 5 |
| `sdlc-gate-runner` | ✅ | 4 |
| `sdlc-implementation-recorder` | ✅ | 4 |
| `sdlc-requirement-normalizer` | ✅ | 4 |
| `sdlc-solution-reviewer` | ✅ | 4 |
| `sdlc-specification-writer` | ✅ | 4 |
| `sdlc-speckit-analyze` | ✅ | 5 |
| `sdlc-speckit-checklist` | ✅ | 5 |
| `sdlc-speckit-clarify` | ✅ | 4 |
| `sdlc-speckit-code-doc-reconcile` | ✅ | 5 |
| `sdlc-speckit-implement` | ✅ | 5 |
| `sdlc-speckit-pipeline` | ✅ | 6 |
| `sdlc-speckit-plan` | ✅ | 5 |
| `sdlc-speckit-specify` | ✅ | 4 |
| `sdlc-speckit-sync` | ✅ | 5 |
| `sdlc-speckit-tasks` | ✅ | 3 |
| `sdlc-test-feedback-classifier` | ✅ | 4 |
| `sdlc-test-feedback-sync` | ✅ | 4 |

---

## Fixture Categories (16)

| Fixture | Coverage |
|------|------|
| `admin-mixed-workflow` | Project-type L4: controller/worker/schedule, approval/audit |
| `backend-business-service` | Project-type L4: entry→service→manager/mapper chain |
| `bootstrap-scan-control` | Bootstrap performance: --scan-root, --scan-timeout |
| `business-domain-compatible-update` | Compatible update: preserve shape/facts, proposals |
| `business-domain-naming-shape` | Naming gate + project shape gate |
| `data-pipeline-etl` | Project-type L4: spark/flink, SQL lineage, replay |
| `delta-change-supplement` | Delta change routing: Specification Missing, Decision Scope |
| `entry-coverage-analyze` | Entry coverage precision + Analyze Gate |
| `frontend-application` | Project-type L4 + frontend process products |
| `legacy-new-rail-product-parity-expanded` | Comprehensive PR J–P parity |
| `library-driven-sync-runtime` | Library-driven sync runtime hardening |
| `library-shared-component` | Project-type L4: public API, compatibility, deprecation |
| `project-type-contract-matrix` | Plan contract matrix: Produced/Reused/NA/Deferred |
| `rail-routing-business-domain-sync` | Rail routing + sync source modes + duplicate guard |
| `route-artifact` | Route artifact: Route Type, Business Domain Targets |
| `specs-run-lifecycle` | Specs run lifecycle: metadata, archive/cleanup gate |

---

## Scripts

| Script | Language | Purpose |
|------|------|------|
| `validate-skill-contracts.rb` | Ruby | Skill contract consistency validation |
| `validate-product-parity-fixtures.rb` | Ruby | Product parity fixture validation (16 fixtures) |
| `audit-entry-coverage.rb` | Ruby | Entry coverage audit |
| `bootstrap-speckit-project.sh` | Bash | Speckit project bootstrap |
| `bootstrap-business-domain.sh` | Bash | Business domain bootstrap |
| `bootstrap-current-project.sh` | Bash | Current project bootstrap |
| `bootstrap-entry-coverage-profile.sh` | Ruby | Entry coverage profile bootstrap |
| `init-standard-home.sh` | Bash | Standard package path init |

---

## Templates (19)

| Template | Purpose |
|------|------|
| `agents-rail-routing-addendum.md` | AGENTS.md addendum |
| `artifact-manifest-template.md` | Artifact manifest |
| `business-domain-*` (6 files) | Business domain bootstrap, governance, proposals |
| `entry-coverage-profile-template.yaml` | Entry coverage profile |
| `gate-result-template.md` | Gate result |
| `library-driven-sync-decision-template.md` | Library-driven sync decision |
| `project-governance-profile-template.yaml` | Project governance profile |
| `project-type-contract-artifact-matrix-template.yaml` | Contract artifact matrix |
| `skill-registry-entry-template.md` | Skill registry entry |
| `speckit-generation-report-template.md` | Speckit generation report |
| `specs-archive-cleanup-proposal-template.md` | Archive/cleanup proposal |
| `specs-run-metadata-template.yaml` | Specs run metadata |
| `technical-specification-template.md` | Technical specification |
