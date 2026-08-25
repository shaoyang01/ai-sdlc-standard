# sdlc-requirement-intake Skill Contract

## Metadata

```yaml
name: sdlc-requirement-intake
version: 0.1.0
category: Intake Skill / Producer Skill
stage: per LOOP-CORE-C03-PLAN §6 C03-A
standard_package: ai-sdlc-standard
status: active
input_artifacts:
  - LOOP runtime recovery-context pinned inputs（当前有效上游产物）
output_artifacts:
  - library/{requirement_id}/00-需求资料/
required_schema:
  - ai-sdlc/node-capability-contract.md
side_effects:
  - write designated node output artifacts when explicitly dispatched
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: false
blocking_conditions:
  - generation-skipping or conflicting change records are rejected
  - required source is missing or unreadable
```

## Responsibilities

需求入口整理器与测试反馈分类器：把原始需求来源与线下/线上反馈归一化为当前有效事实，并按变更分类开启正确的编排路径。


## Core Rules

1. Normalize requirement intake and classify test feedback only.
2. Do not write technical specifications or review/approve any solution.
3. Do not modify production code, `specs/**`, or `.specify/business_domain/**`.
4. Do not decide Development Path（该权威已由 C02 runtime/solution-gate 承接）。
5. Dispatch/consumption authority belongs to the LOOP runtime recovery context: 只处理恢复结果指定的输入。
6. Do not invent business goals, scope, or acceptance criteria.
7. Preserve uncertainty as `待确认事项`; preserve source conflicts as `来源冲突`.
8. Feedback lacking observed/expected behavior or reproduction context stays `无法分类 / 待补充证据`。
9. Use `library/{requirement_id}/00-需求资料/` as the default local output node.
10. Apply `ai-sdlc/change-control.md` for Supplement / Change / Rework / Feedback-Driven Change；feedback 波次开启新 generation 由 runtime 编排，本 Skill 不推进流程。
11. Use `ess/test-feedback-schema.md` as the feedback output structure.


## Capability Source Trace（Decision-045 冻结映射）

| 来源旧包 | 吸收位置 |
| --- | --- |
| `sdlc-requirement-normalizer` | 本包 Core Rules 全量吸收 |
| `sdlc-test-feedback-classifier` | 本包 Core Rules 全量吸收 |

