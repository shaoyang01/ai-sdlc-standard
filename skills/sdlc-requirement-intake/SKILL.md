---
name: sdlc-requirement-intake
description: |
  需求入口整理器与测试反馈分类器：把原始需求来源与线下/线上反馈归一化为当前有效事实，并按变更分类输出供后续节点消费。
version: 0.2.0
---

# Requirement Intake

**定位**：需求入口整理器与测试反馈分类器：把原始需求来源与线下/线上反馈归一化为当前有效事实，并按变更分类输出供后续节点消费。

## Core Rules

1. Normalize requirement intake and classify test feedback only.
2. Do not write technical specifications or review/approve any solution.
3. Do not modify production code, `specs/**`, or `.sdlc/business_domain/**`。
4. Do not decide Gate verdict（该权威已由 C02 runtime/solution-gate 承接；Development Path 双轨判定已随 C03-E E0 退役）。
5. 手动主链自足：直接消费用户原始输入与已确认来源，不依赖 LOOP runtime recovery context；requirement manifest 由本节点创建——经 `scripts/publish-requirement-manifest.sh init` 写入 `library/{requirement_id}/manifest.md`（记录深度三字段），并生成 `00-需求资料/intake.manifest.json`；两者缺一不完成本节点。
12. 深度提案（manual-runtime-semantic-contract §4.2）：按枚举判定表输出 `requestedDepth` 与 `initialDepthBasis`（用户显式指定深度永远最高优先 → `user_requested`；判定表命中 → `normalized_proposal` 附理由；无法判定 → `PROVISIONAL_STANDARD` 兜底），并记录 `decisionScope`（FULL_REQUIREMENT/DELTA_CHANGE）。
6. Do not invent business goals, scope, or acceptance criteria.
7. Preserve uncertainty as `待确认事项`; preserve source conflicts as `来源冲突`.
8. Feedback lacking observed/expected behavior or reproduction context stays `无法分类 / 待补充证据`。
9. Use `library/{requirement_id}/00-需求资料/` as the default local output node.
10. Apply `ai-sdlc/change-control.md` for Supplement / Change / Rework / Feedback-Driven Change；feedback 波次开启新 generation 由 Owner 显式发起，本 Skill 不自行推进流程。
11. Use `ess/test-feedback-schema.md` as the feedback output structure.

## 能力来源对照表

| 来源旧包 | 吸收落点 |
| --- | --- |
| `sdlc-requirement-normalizer` | Core Rules 全部条款吸收至本包；references 迁移件 4 个文件见 `references/sdlc-requirement-normalizer/` |
| `sdlc-test-feedback-classifier` | Core Rules 全部条款吸收至本包；references 迁移件 4 个文件见 `references/sdlc-test-feedback-classifier/` |
