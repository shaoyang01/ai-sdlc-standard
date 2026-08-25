# sdlc-solution-design Skill Contract

## Metadata

```yaml
name: sdlc-solution-design
version: 0.1.0
category: Producer Skill
stage: per LOOP-CORE-C03-PLAN §6 C03-A
standard_package: ai-sdlc-standard
status: active
input_artifacts:
  - LOOP runtime recovery-context pinned inputs（当前有效上游产物）
output_artifacts:
  - library/{requirement_id}/01-技术方案/
required_schema:
  - ai-sdlc/node-capability-contract.md
side_effects:
  - write designated node output artifacts when explicitly dispatched
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: false
blocking_conditions:
  - runtime inputs are missing or not the pinned recovery context
  - drafting requires undefined behavior or unapproved scope change
```

## Responsibilities

方案设计器：在已确认事实之上生成/修订技术方案与实施计划内容，深度档位由 solution-gate 裁决后生效。


## Core Rules

1. Generate specification and implementation-plan content only.
2. Do not review or approve the specification; do not decide depth tiers.
3. Do not modify production code, `specs/**`, or `.specify/business_domain/**`.
4. Do not invent business rules; preserve uncertainty as `待确认事项`。
5. Consumption authority belongs to the LOOP runtime recovery context（含 Re-Gate 重入时的 pinned 输入）。
6. Use `library/{requirement_id}/01-技术方案/` as the default local output node.
7. Use `sdlc-docflow-writer` for HTML/Lark/manifest rendering when requested.
8. After drafting, recommend `sdlc-solution-gate` adversarial_scan as the next step（推进由 runtime 完成）。
9. Apply the Goal-Anchored Global Reasoning contract（先建全局模型、后做整模影响自检），不扩展 ESS sections/schemas/Gate architecture。


## Capability Source Trace（Decision-045 冻结映射）

| 来源旧包 | 吸收位置 |
| --- | --- |
| `sdlc-specification-writer` | 本包 Core Rules 全量吸收 |
| `sdlc-speckit-specify` | 本包 Core Rules 全量吸收 |
| `sdlc-speckit-plan` | 本包 Core Rules 全量吸收 |

