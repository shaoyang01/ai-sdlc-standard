---
name: sdlc-implementation
description: |
  受约束实现器与证据记录器：按已过门禁的任务实现代码，并落盘实现事实与验证证据。
version: 0.1.0
---

# Implementation

**定位**：受约束实现器与证据记录器：按已过门禁的任务实现代码，并落盘实现事实与验证证据。

## Core Rules

1. Implement only tasks present in the current approved task plan provided by the LOOP runtime recovery context.
2. Before modifying code, model concrete normal, edge, and failure data cases for affected behavior.
3. Inspect existing code, tests, and local conventions before editing.
4. Preserve approved Scope, behavior, rollback, compatibility, failure, retry, idempotency, transaction, and verification requirements.
5. Protect unrelated user or local changes; never revert work outside approved tasks.
6. Stop when implementation requires undefined behavior, unapproved Scope change, missing technical decision, or route/source-boundary conflict.
7. Record implementation facts only: no chat memory as evidence; mark missing verification as `验证缺口`; mark spec mismatch as `方案偏离`。
8. Do not self-review code quality（属 `sdlc-code-review`）；完成声明必须引用 diff、测试输出或 journal 事件。
9. Use `library/{requirement_id}/03-实现记录/` as the default evidence node.

## 能力来源对照表（Decision-045 冻结映射）

| 来源旧包 | 吸收说明 |
| --- | --- |
| `sdlc-speckit-implement` | 核心规则与职责已全量吸收至本包 |
| `sdlc-implementation-recorder` | 核心规则与职责已全量吸收至本包 |

## 边界

本包不承载 Gate 裁决、节点准入或任何流程推进权；调度与输入选择由 LOOP runtime
的恢复上下文决定（INV1/INV7，见 LOOP-CORE-C03-PLAN §5）。

