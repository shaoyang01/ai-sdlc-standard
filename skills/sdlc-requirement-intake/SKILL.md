---
name: sdlc-requirement-intake
description: |
  需求入口整理器与测试反馈分类器：把原始需求来源与线下/线上反馈归一化为当前有效事实，并按变更分类开启正确的编排路径。
version: 0.1.0
---

# Requirement Intake

**定位**：需求入口整理器与测试反馈分类器：把原始需求来源与线下/线上反馈归一化为当前有效事实，并按变更分类开启正确的编排路径。

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

## 能力来源对照表（Decision-045 冻结映射）

| 来源旧包 | 吸收说明 |
| --- | --- |
| `sdlc-requirement-normalizer` | 核心规则与职责已全量吸收至本包 |
| `sdlc-test-feedback-classifier` | 核心规则与职责已全量吸收至本包 |

## 边界

本包不承载 Gate 裁决、节点准入或任何流程推进权；调度与输入选择由 LOOP runtime
的恢复上下文决定（INV1/INV7，见 LOOP-CORE-C03-PLAN §5）。

