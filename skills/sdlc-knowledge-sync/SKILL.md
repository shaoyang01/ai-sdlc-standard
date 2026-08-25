---
name: sdlc-knowledge-sync
description: |
  知识同步器：把稳定可复用事实写入长期知识目标，并对代码/文档/知识做一致性对账。
version: 0.1.0
---

# Knowledge Sync

**定位**：知识同步器：把稳定可复用事实写入长期知识目标，并对代码/文档/知识做一致性对账。

## Core Rules

1. Consume current code state, approved artifacts, implementation evidence, classified feedback, and declared knowledge targets.
2. Single-rail reconciliation baseline: library 工件 + LOOP artifact revision 为唯一对账基准（单轨模式，无多源模式开关）。
3. Sync only stable reusable facts; never sync raw chat, temp debugging notes, speculative design, unverified findings, or unresolved risks.
4. Require explicit target path and sync authorization before modifying `.specify/business_domain/**`。
5. Preserve existing knowledge structure, terminology, ownership; uncertain items stay `待确认同步项`。
6. Classify inconsistencies before recommending changes; route violations to earliest affected node via runtime Re-Gate, verified-but-missing facts to sync.
7. Default read-only audit; do not modify production code.
8. Do not overwrite classified feedback results; use `ai-sdlc/change-control.md` for Specification Missing / Review Missing / Requirement Change.

## 能力来源对照表（Decision-045 冻结映射）

| 来源旧包 | 吸收说明 |
| --- | --- |
| `sdlc-speckit-sync` | 核心规则与职责已全量吸收至本包 |
| `sdlc-speckit-code-doc-reconcile` | 核心规则与职责已全量吸收至本包 |
| `sdlc-test-feedback-sync` | 核心规则与职责已全量吸收至本包 |

## 边界

本包不承载 Gate 裁决、节点准入或任何流程推进权；调度与输入选择由 LOOP runtime
的恢复上下文决定（INV1/INV7，见 LOOP-CORE-C03-PLAN §5）。

