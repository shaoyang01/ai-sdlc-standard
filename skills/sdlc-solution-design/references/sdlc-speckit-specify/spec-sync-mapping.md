# Spec Sync Mapping

## Mapping Goals

Map DocFlow ESS sections into SpecKit `spec.md` without changing meaning.

## Section Mapping

| DocFlow / ESS Source | SpecKit Target |
| --- | --- |
| 背景 / 目标 | Feature overview and business goal |
| In Scope | Functional requirements |
| Out of Scope | Explicit non-goals |
| 原流程 | Existing behavior / compatibility section |
| 新流程 | Proposed behavior |
| 行为约束 | Requirements and constraints |
| 状态流转 | State model / scenarios |
| 数据来源 | Data requirements |
| 数据变更 | Data changes / persistence |
| 接口变更 | API contracts |
| 数据库变更 | Data model notes |
| 缓存 / MQ / Schedule / Listener | Integration behavior |
| 异常处理 | Failure and edge cases |
| 测试方案 | Acceptance scenarios |
| 风险 | Risks and assumptions |
| 待确认事项 | Blocking or deferred items |

## Required SpecKit Product Sections

Every generated or updated `specs/{feature}/spec.md` must contain these sections, even when the value is `pending`, `not applicable`, or `blocked`:

```text
## Domain Route / Scope Baseline
## Requirement Type
## Business Domain Targets
## Entry Coverage Target
## Sync Targets
## Representative Data Simulation
## Edge Cases
## Functional Requirements
## Key Entities / Data Contracts
## Success Criteria
## Source Artifact Traceability
## Branch / Repository Boundary
```

Do not collapse these sections into generic prose. If the source artifacts do not provide enough evidence to fill a section, mark the row as `pending` or `blocked` and route back to DocFlow or the relevant Gate.

## Product Shape Mapping

| Required SpecKit Section | Source / Derivation Rule |
| --- | --- |
| Domain Route / Scope Baseline | Use `specs/{feature}/route.md` when present, otherwise use the Pipeline Domain Route Summary. Also preserve relevant `00BusinessLandscape.md`, `00UbiquitousLanguage.md`, `01DomainCatalog.md`, `.specify/project-governance-profile.yaml`, `.specify/entry-coverage-profile.yaml`, and reviewed DocFlow scope evidence. |
| Requirement Type | Copy Route Type from `specs/{feature}/route.md` or Pipeline Domain Route Summary. Valid values are `existing-change`, `new-flow`, `integration-change`, `data-change`, or `unknown`; `unknown` is blocking unless explicit route confirmation is recorded. |
| Business Domain Targets | Copy L1/L2/L4 targets, target status, owner, and evidence from the route artifact. Do not invent business-domain paths. |
| Entry Coverage Target | Copy backend/admin/frontend/ETL/library surface and expected evidence chain from the route artifact and `.specify/entry-coverage-profile.yaml`. |
| Sync Targets | Copy stable fact targets and write timing from the route artifact; Sync authorization remains owned by Sync and Pipeline authorization checks. |
| Representative Data Simulation | Include normal, empty, missing, exception, and project-specific boundary data cases. |
| Edge Cases | Include compatibility, failure, retry, idempotency, transaction, visibility, and rollback edges where relevant. |
| Functional Requirements | Map In Scope and behavior constraints into numbered FR rows without changing meaning. |
| Key Entities / Data Contracts | Map entities, APIs, DB/schema, MQ, cache, file, topic, table, frontend state, or ETL contracts. |
| Success Criteria | Map acceptance criteria and test strategy into measurable criteria. |
| Source Artifact Traceability | Link every major section to `01-技术方案`, `02-方案审核`, and `manifest.md`. |
| Branch / Repository Boundary | State target repository, branch, modules, out-of-scope repositories, and cross-repo assumptions. |

## Project-Type Required Evidence

### Backend / Admin

`spec.md` must preserve:

- entry -> service -> manager/repository evidence;
- state transition;
- idempotency;
- transaction;
- rollback / compensation;
- operator-visible behavior;
- approval, audit, import/export, or month-copy behavior when applicable.

### Frontend

`spec.md` must preserve:

- route/page/component/store/API mapping;
- popup trigger;
- visibility rule;
- backend/mock boundary;
- visual verification note;
- dependency pre-check.

### ETL / Data Pipeline

`spec.md` must preserve:

- input tables/topics/files;
- output tables/topics/reports;
- SQL/data lineage;
- partition/window/checkpoint;
- rerun/replay/idempotency;
- downstream consumer contract;
- normal/empty/missing/exception data cases.

## Required Traceability

Every generated SpecKit section should reference:

- Source `specs/{feature}/route.md` or Pipeline Domain Route Summary
- Source `01-技术方案`
- Source `02-方案审核`
- Relevant Gate result
- Accepted risk, if any

## Assumptions

Do not create assumptions for:

- Scope
- Original-flow compatibility
- Failure behavior
- State transition
- Data source
- DB/cache/MQ/API writes
- Acceptance criteria

If an assumption would be needed, stop and return to DocFlow.
