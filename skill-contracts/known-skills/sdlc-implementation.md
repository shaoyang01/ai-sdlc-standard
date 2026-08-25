# sdlc-implementation Skill Contract

## Metadata

```yaml
name: sdlc-implementation
version: 0.1.0
category: Executor Skill / Producer Skill
stage: per LOOP-CORE-C03-PLAN §6 C03-A
standard_package: ai-sdlc-standard
status: active
input_artifacts:
  - LOOP runtime recovery-context pinned inputs（当前有效上游产物）
output_artifacts:
  - 按节点语义的指定输出产物
required_schema:
  - ai-sdlc/node-capability-contract.md
side_effects:
  - write designated node output artifacts when explicitly dispatched
can_modify_code: true
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - implementation requires undefined behavior or unapproved scope change
  - verification evidence is missing (recorded as 验证缺口)
```

## Responsibilities

受约束实现器与证据记录器：按已过门禁的任务实现代码，并落盘实现事实与验证证据。


## Core Rules

1. Implement only tasks present in the current approved task plan provided by the LOOP runtime recovery context.
2. Before modifying code, model concrete normal, edge, and failure data cases for affected behavior.
3. Inspect existing code, tests, and local conventions before editing.
4. Preserve approved Scope, behavior, rollback, compatibility, failure, retry, idempotency, transaction, and verification requirements.
5. Protect unrelated user or local changes; never revert work outside approved tasks.
6. Stop when implementation requires undefined behavior, unapproved Scope change, missing technical decision, or route/source-boundary conflict.
7. Record implementation facts only: no chat memory as evidence; mark missing verification as `验证缺口`; mark spec mismatch as `方案偏离`。
8. Do not self-review code quality（属 `sdlc-code-review`）；完成声明必须引用 diff、测试输出或 journal 事件。
9. Use `library/{requirement_id}/03-实现记录/` as the default evidence node.


## Capability Source Trace（Decision-045 冻结映射）

| 来源旧包 | 吸收位置 |
| --- | --- |
| `sdlc-speckit-implement` | 本包 Core Rules 全量吸收 |
| `sdlc-implementation-recorder` | 本包 Core Rules 全量吸收 |

