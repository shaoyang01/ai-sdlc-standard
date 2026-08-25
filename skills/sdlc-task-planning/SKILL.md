---
name: sdlc-task-planning
description: |
  任务规划器：把已过门的方案分解为可执行任务，并对任务集做实现前一致性审计。
version: 0.1.0
---

# Task Planning

**定位**：任务规划器：把已过门的方案分解为可执行任务，并对任务集做实现前一致性审计。

## Core Rules

1. Consume only the current approved solution-design outputs provided by the LOOP runtime recovery context.
2. Preserve approved Scope, behavior, technical plan, risks, and acceptance criteria.
3. Generate implementation tasks with stable ID, executable action, target file/module/artifact, dependency, source trace, and verification method.
4. Run a bounded consistency audit over tasks vs approved artifacts: inconsistency, missing traceability, stale artifacts, unaccepted risk, readiness blockers are material blockers.
5. Do not create new business rules, API contracts, DB behavior, state transitions, integration semantics, or acceptance criteria.
6. Stop when task breakdown requires changing Scope, plan, compatibility, exception, retry, idempotency, transaction, rollback, or test behavior（回流 solution-design）。
7. Do not modify production code; task execution belongs to `sdlc-implementation`。
8. Use `library/{requirement_id}/03-任务规划/` as the default local output node.

## 能力来源对照表（Decision-045 冻结映射）

| 来源旧包 | 吸收说明 |
| --- | --- |
| `sdlc-speckit-tasks` | 核心规则与职责已全量吸收至本包 |
| `sdlc-speckit-analyze` | 核心规则与职责已全量吸收至本包 |

## 边界

本包不承载 Gate 裁决、节点准入或任何流程推进权；调度与输入选择由 LOOP runtime
的恢复上下文决定（INV1/INV7，见 LOOP-CORE-C03-PLAN §5）。

