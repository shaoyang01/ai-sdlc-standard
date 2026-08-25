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

## 能力来源对照表（Decision-045 冻结映射）

| 来源旧包 | 吸收说明 |
| --- | --- |
| `sdlc-specification-writer` | 核心规则与职责已全量吸收至本包 |
| `sdlc-speckit-specify` | 核心规则与职责已全量吸收至本包 |
| `sdlc-speckit-plan` | 核心规则与职责已全量吸收至本包 |

## 边界

本包不承载 Gate 裁决、节点准入或任何流程推进权；调度与输入选择由 LOOP runtime
的恢复上下文决定（INV1/INV7，见 LOOP-CORE-C03-PLAN §5）。

