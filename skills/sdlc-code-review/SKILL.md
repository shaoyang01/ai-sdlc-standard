---
name: sdlc-code-review
description: |
  代码审核器：对照已批准产物审查实现，并把审核反馈归一化为可路由的 finding。
version: 0.1.0
---

# Code Review

**定位**：代码审核器：对照已批准产物审查实现，并把审核反馈归一化为可路由的 finding。

## Core Rules

1. Review code against approved artifacts, not personal preference.
2. Require diff, changed-file list, or commit range before file-level findings.
3. Require specification basis for behavioral findings; focus on correctness, compatibility, data consistency, transaction, idempotency, exception handling, performance, security, maintainability, test gaps.
4. Distinguish blocking issues from suggestions, nits, learning notes.
5. Do not modify production code; do not rewrite specs, implementation records, review artifacts, or knowledge docs.
6. Never invent findings unsupported by code/artifact evidence; style/lint preferences are not blocking.
7. Normalization must not turn vague advice into blocking without file location + impact; scope-expanding suggestions route back to planning.
8. Root-cause routing: 方案缺口→solution-design；任务缺口→task-planning；实现缺陷→implementation；审查合同自身缺口→code-review。
9. Preserve missing file/line/symbol/spec basis as Missing Information.
10. Use `library/{requirement_id}/04-代码审核/` as the default local output node.

## 能力来源对照表（Decision-045 冻结映射）

| 来源旧包 | 吸收说明 |
| --- | --- |
| `sdlc-code-review-excellence` | 核心规则与职责已全量吸收至本包 |
| `sdlc-code-review-normalizer` | 核心规则与职责已全量吸收至本包 |

## 边界

本包不承载 Gate 裁决、节点准入或任何流程推进权；调度与输入选择由 LOOP runtime
的恢复上下文决定（INV1/INV7，见 LOOP-CORE-C03-PLAN §5）。

