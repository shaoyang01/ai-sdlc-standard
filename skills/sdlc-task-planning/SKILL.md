---
name: sdlc-task-planning
description: |
  任务规划器：把已过门的方案分解为可执行任务，并对任务集做实现前一致性审计。
version: 0.1.0
---

# Task Planning

**定位**：任务规划器：把已过门的方案分解为可执行任务，并对任务集做实现前一致性审计。
**Canonical 模板**：`${AI_SDLC_STANDARD_HOME}/templates/task-plan-template.md`（本节点的 library/ 产物（03-任务规划）必须遵循此结构；Decision-084）。

## Core Rules

1. Consume only the current approved solution-design outputs provided by the LOOP runtime recovery context.
2. Preserve approved Scope, behavior, technical plan, risks, and acceptance criteria.
3. Generate implementation tasks with stable ID, executable action, target file/module/artifact, dependency, source trace, and verification method.
4. Run a bounded consistency audit over tasks vs approved artifacts: inconsistency, missing traceability, stale artifacts, unaccepted risk, readiness blockers are material blockers.
5. Do not create new business rules, API contracts, DB behavior, state transitions, integration semantics, or acceptance criteria.
6. Stop when task breakdown requires changing Scope, plan, compatibility, exception, retry, idempotency, transaction, rollback, or test behavior（回流 solution-design）。
7. Do not modify production code; task execution belongs to `sdlc-implementation`。
8. Use `library/{requirement_id}/03-任务规划/` as the default local output node.

9. Checklist internal check：任务集产出后运行 speckit-checklist 迁移件做可追溯性自检（checklist 为本包内部校验能力，不对外独立服务）。

## 能力来源对照表

| 来源旧包 | 吸收落点 |
| --- | --- |
| `sdlc-speckit-tasks` | Core Rules 全部条款吸收至本包；references 迁移件 4 个文件见 `references/sdlc-speckit-tasks/` |
| `sdlc-speckit-analyze` | Core Rules 全部条款吸收至本包；references 迁移件 5 个文件见 `references/sdlc-speckit-analyze/` |
| `sdlc-speckit-checklist` | Core Rules 全部条款吸收至本包；references 迁移件 5 个文件见 `references/sdlc-speckit-checklist/` |
