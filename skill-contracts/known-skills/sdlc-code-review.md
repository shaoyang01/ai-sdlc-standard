# sdlc-code-review Skill Contract

## Metadata

```yaml
name: sdlc-code-review
version: 0.1.0
category: Reviewer Skill
stage: Code Review
standard_package: ai-sdlc-standard
status: active
input_artifacts:
  - LOOP runtime recovery-context pinned inputs（当前有效上游产物）
output_artifacts:
  - library/{requirement_id}/04-代码审核/
required_schema:
  - ai-sdlc/node-capability-contract.md
side_effects:
  - write designated node output artifacts when explicitly dispatched
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: false
blocking_conditions:

  - finding lacks file location and specification basis (recorded as Missing Information)
  - approved artifacts are stale```
```

## Responsibilities

代码审核器：对照已批准产物审查实现，并把审核反馈归一化为可路由的 finding。


## Core Rules

1. Review code against approved artifacts, not personal preference.
2. Require diff, changed-file list, or commit range before file-level findings.
3. Require specification basis for behavioral findings; focus on correctness, compatibility, data consistency, transaction, idempotency, exception handling, performance, security, maintainability, test gaps.
4. Distinguish blocking issues from suggestions, nits, learning notes.
5. Do not modify production code; do not rewrite specs, implementation records, review artifacts, or knowledge docs.
6. Never invent findings unsupported by code/artifact evidence; style/lint preferences are not blocking.
7. Normalization must not turn vague advice into blocking without file location + impact; scope-expanding suggestions route back to planning.
8. Root-cause routing: 方案缺口→solution-design；任务缺口→task-planning；实现缺陷→implementation；审查合同自身缺口→code-review。
9. Preserve missing file/line/symbol/spec basis as Missing Information.
10. Use `library/{requirement_id}/04-代码审核/` as the default local output node.


## Capability Source Trace（Decision-045 冻结映射）

| 来源旧包 | 吸收位置 |
| --- | --- |
| `sdlc-code-review-excellence` | 本包 Core Rules 全量吸收 |
| `sdlc-code-review-normalizer` | 本包 Core Rules 全量吸收 |

