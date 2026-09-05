---
name: sdlc-solution-design
description: |
  方案设计器：在已确认事实之上生成/修订技术方案与实施计划内容，深度起点由 requirement-intake 提案（formal_verdict 终审）。
version: 0.2.0
---

# Solution Design

**定位**：方案设计器：在已确认事实之上生成/修订技术方案与实施计划内容，深度起点由 requirement-intake 提案（formal_verdict 终审）。

## Core Rules

1. Generate specification and implementation-plan content only.
2. Do not review or approve the specification; do not decide depth tiers.
3. Do not modify production code, `specs/**`, or `.sdlc/business_domain/**`。
4. Do not invent business rules; preserve uncertainty as `待确认事项`。
5. 手动主链自足：直接消费 current 的需求摘要与本节点深度输入（`requiredDepth`，来自 intake 提案或 verdict 升档），不依赖 LOOP runtime recovery context。
6. Use `library/{requirement_id}/01-技术方案/` as the default local output node.
7. Use `sdlc-docflow-writer` for HTML/Lark/manifest rendering when requested.
8. After drafting, recommend `sdlc-solution-gate` adversarial_scan as the next step（由 Owner 驱动，不依赖 runtime）。
9. Apply the Goal-Anchored Global Reasoning contract（先建全局模型、后做整模影响自检），不扩展 ESS sections/schemas/Gate architecture。

10. 首轮解耦与覆盖台账（manual-runtime-semantic-contract §4.3）：按 `requiredDepth` **立即**产出可审核方案，不等待 Gate——首轮解耦消除深度前置循环。方案头部携带 `depthCoverageLedger`：对照 §4.4 档位内容要求清单（LIGHT 精简主干；STANDARD 覆盖架构/接口/数据/异常/兼容性/验证；DEEP 强制状态机/DB/MQ/事务/回滚/代表数据/边界场景章节）逐项标注已覆盖/未覆盖，未覆盖项必须显式列出。ESCALATED 升档回流时**只生产**新旧 `requiredDepth` 要求清单的缺口增量并更新台账，已审核部分不重写。
11. GAR 五要素自检覆盖：业务目标 / 用户意图 / 当前问题 / 初步范围 / 不确定点逐一建模；共享合同全文见 `${AI_SDLC_STANDARD_HOME}/ai-sdlc/goal-anchored-global-reasoning.md` 与本包 references/sdlc-specification-writer/ 迁移件。

## 能力来源对照表

| 来源旧包 | 吸收落点 |
| --- | --- |
| `sdlc-specification-writer` | Core Rules 全部条款吸收至本包；references 迁移件 4 个文件见 `references/sdlc-specification-writer/` |
| `sdlc-speckit-specify` | Core Rules 全部条款吸收至本包；references 迁移件 4 个文件见 `references/sdlc-speckit-specify/` |
| `sdlc-speckit-plan` | Core Rules 全部条款吸收至本包；references 迁移件 5 个文件见 `references/sdlc-speckit-plan/` |
