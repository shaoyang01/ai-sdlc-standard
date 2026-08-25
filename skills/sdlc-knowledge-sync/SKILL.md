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

9. create-if-missing 授权链：目标知识条目缺失时，必须先经显式 create-if-missing 授权才可建目；无授权即停。
10. entry coverage 审计：同步完成后核对知识条目对实现事实的覆盖面，漏项记为 `待补同步项`。
11. duplicate sync guard：同一事实已有等价条目时拒绝重复写入（幂等守卫）。
12. 原始反馈仍从 requirement-intake 重入——本包只消费已分类反馈，绝不替代 intake 分类职能（Decision-045 固定边界）。

## 能力来源对照表

| 来源旧包 | 吸收落点 |
| --- | --- |
| `sdlc-speckit-sync` | Core Rules 全部条款吸收至本包；references 迁移件 5 个文件见 `references/sdlc-speckit-sync/` |
| `sdlc-speckit-code-doc-reconcile` | Core Rules 全部条款吸收至本包；references 迁移件 5 个文件见 `references/sdlc-speckit-code-doc-reconcile/` |
| `sdlc-test-feedback-sync` | Core Rules 全部条款吸收至本包；references 迁移件 4 个文件见 `references/sdlc-test-feedback-sync/` |
