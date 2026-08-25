# sdlc-task-planning Skill Contract

## Metadata

```yaml
name: sdlc-task-planning
version: 0.1.0
category: Producer Skill
stage: Task Planning
standard_package: ai-sdlc-standard
status: active
input_artifacts:
  - LOOP runtime recovery-context pinned inputs（当前有效上游产物）
output_artifacts:
  - library/{requirement_id}/03-任务规划/
required_schema:
  - ai-sdlc/node-capability-contract.md
side_effects:
  - write designated node output artifacts when explicitly dispatched
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: false
blocking_conditions:
  - Stop when task breakdown requires changing Scope, plan, compatibility, exception, retry, idempotency, transaction, rollback, or test behavior（回流 solution-design

  - task breakdown requires scope/plan/compatibility changes (route back to solution-design)
  - approved artifacts are stale or inconsistent```
```

## Responsibilities

任务规划器：把已过门的方案分解为可执行任务，并对任务集做实现前一致性审计。


## Core Rules

1. Consume only the current approved solution-design outputs provided by the LOOP runtime recovery context.
2. Preserve approved Scope, behavior, technical plan, risks, and acceptance criteria.
3. Generate implementation tasks with stable ID, executable action, target file/module/artifact, dependency, source trace, and verification method.
4. Run a bounded consistency audit over tasks vs approved artifacts: inconsistency, missing traceability, stale artifacts, unaccepted risk, readiness blockers are material blockers.
5. Do not create new business rules, API contracts, DB behavior, state transitions, integration semantics, or acceptance criteria.
6. Stop when task breakdown requires changing Scope, plan, compatibility, exception, retry, idempotency, transaction, rollback, or test behavior（回流 solution-design）。
7. Do not modify production code; task execution belongs to `sdlc-implementation`。
8. Use `library/{requirement_id}/03-任务规划/` as the default local output node.


## Capability Source Trace（Decision-045 冻结映射）

| 来源旧包 | 吸收位置 |
| --- | --- |
| `sdlc-speckit-tasks` | 本包 Core Rules 全量吸收 |
| `sdlc-speckit-analyze` | 本包 Core Rules 全量吸收 |

