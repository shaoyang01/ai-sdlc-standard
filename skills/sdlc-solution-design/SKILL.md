---
name: sdlc-solution-design
description: |
  方案设计器：在已确认事实之上生成/修订技术方案与实施计划内容，深度档位由 solution-gate 裁决后生效。
version: 0.1.0
---

# Solution Design

**定位**：方案设计器：在已确认事实之上生成/修订技术方案与实施计划内容，深度档位由 solution-gate 裁决后生效。

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

10. Depth-tier delivery clause：按 solution-gate 裁决的深度档位（LIGHT/STANDARD/DEEP）交付对应深度的方案与实施计划内容——LIGHT 精简主干、STANDARD 全要素、DEEP 含替代方案与风险推演；档位未裁决前不产出正式方案内容。
11. GAR 五要素自检覆盖：业务目标 / 用户意图 / 当前问题 / 初步范围 / 不确定点逐一建模；共享合同全文见 `${AI_SDLC_STANDARD_HOME}/ai-sdlc/goal-anchored-global-reasoning.md` 与本包 references/sdlc-specification-writer/ 迁移件。

## 能力来源对照表

| 来源旧包 | 吸收落点 |
| --- | --- |
| `sdlc-specification-writer` | Core Rules 全部条款吸收至本包；references 迁移件 4 个文件见 `references/sdlc-specification-writer/` |
| `sdlc-speckit-specify` | Core Rules 全部条款吸收至本包；references 迁移件 4 个文件见 `references/sdlc-speckit-specify/` |
| `sdlc-speckit-plan` | Core Rules 全部条款吸收至本包；references 迁移件 5 个文件见 `references/sdlc-speckit-plan/` |
