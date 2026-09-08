---
name: sdlc-implementation
description: |
  受约束实现器与证据记录器：按已过门禁的任务实现代码，并落盘实现事实与验证证据。
version: 0.2.0
---

# Implementation

**定位**：受约束实现器与证据记录器：按已过门禁的任务实现代码，并落盘实现事实与验证证据。
**Canonical 模板**：`${AI_SDLC_STANDARD_HOME}/templates/implementation-record-template.md`（本节点的 library/ 产物（04-实现记录）必须遵循此结构；Decision-084）。

## Core Rules

1. 准入（A2）：仅消费 current 的任务计划（PWR 风险 refs 随行）；不依赖 LOOP runtime recovery context。
2. Before modifying code, model concrete normal, edge, and failure data cases for affected behavior.
3. Inspect existing code, tests, and local conventions before editing.
4. Preserve approved Scope, behavior, rollback, compatibility, failure, retry, idempotency, transaction, and verification requirements.
5. Protect unrelated user or local changes; never revert work outside approved tasks.
6. Stop when implementation requires undefined behavior, unapproved Scope change, missing technical decision, or route/source-boundary conflict.
7. Record implementation facts only: no chat memory as evidence; mark missing verification as `验证缺口`; mark spec mismatch as `方案偏离`。
8. Do not self-review code quality（属 `sdlc-code-review`）；完成声明必须引用 diff、测试输出等可验证证据。实现记录须固定代码变更证据绑定 `{baseRevision, reviewedRevision, changeDigest}`（content-addressed，供 code-review 消费同一份变更——manual-runtime-semantic-contract §5.5）。
9. Use `library/{requirement_id}/04-实现记录/` as the default evidence node.

10. Checklist internal check：实现前运行本包内置 checklist 自检核对任务-产物追溯性（内部校验能力，非可调用 Skill、不对外独立服务，也不作为下一步推荐；规则来源见能力来源对照表）。

## 能力来源对照表

| 来源旧包 | 吸收落点 |
| --- | --- |
| `sdlc-speckit-implement` | Core Rules 全部条款吸收至本包（迁移件已随吸收完成移除） |
| `sdlc-implementation-recorder` | Core Rules 全部条款吸收至本包（迁移件已随吸收完成移除） |
| `sdlc-speckit-checklist` | Core Rules 全部条款吸收至本包（迁移件已随吸收完成移除） |
