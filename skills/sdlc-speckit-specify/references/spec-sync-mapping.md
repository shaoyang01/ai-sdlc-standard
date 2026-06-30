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

## Required Traceability

Every generated SpecKit section should reference:

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
