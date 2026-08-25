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

11. Severity ladder（finding 分级）：CRITICAL=违反已批准事实且不可合入；HIGH=合入前必须修复或显式风险接受；MEDIUM=合入前应修或有跟进项；LOW=改进项。
12. Gate adjudication rules：存在 CRITICAL 或未接受 HIGH → FAIL；仅 MEDIUM/LOW 且有跟进约定 → PASS_WITH_RISK（须列明风险接受字段）；全清 → PASS。风险接受必须带接受者与证据。

## 能力来源对照表

| 来源旧包 | 吸收落点 |
| --- | --- |
| `sdlc-code-review-excellence` | Core Rules 全部条款吸收至本包；references 迁移件 5 个文件见 `references/sdlc-code-review-excellence/` |
| `sdlc-code-review-normalizer` | Core Rules 全部条款吸收至本包；references 迁移件 4 个文件见 `references/sdlc-code-review-normalizer/` |
