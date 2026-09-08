---
name: sdlc-code-review
description: |
  代码审核器：对照已批准产物审查实现，并把审核反馈归一化为可路由的 finding。
version: 0.3.0
---

# Code Review

**定位**：代码审核器：对照已批准产物审查实现，并把审核反馈归一化为可路由的 finding。

## Core Rules

1. 准入（A3）：仅消费 current 的实现记录，且其证据绑定（`baseRevision`/`reviewedRevision`/`changeDigest`）完备并与所审 diff 为同一份变更（manual-runtime-semantic-contract §5.5/§7.3——生产者约束的消费端闭合）。
2. Review code against approved artifacts, not personal preference.
3. Require diff, changed-file list, or commit range before file-level findings.
4. Require specification basis for behavioral findings; focus on correctness, compatibility, data consistency, transaction, idempotency, exception handling, performance, security, maintainability, test gaps.
5. Distinguish blocking issues from suggestions, nits, learning notes.
6. Do not modify production code; do not rewrite specs, implementation records, review artifacts, or knowledge docs.
7. Never invent findings unsupported by code/artifact evidence; style/lint preferences are not blocking.
8. Normalization must not turn vague advice into blocking without file location + impact; scope-expanding suggestions route back to planning.
9. Root-cause routing: 方案缺口→solution-design；任务缺口→task-planning；实现缺陷→implementation；审查合同自身缺口→code-review。
10. Preserve missing file/line/symbol/spec basis as Missing Information.
11. Use `library/{requirement_id}/05-代码审核/` as the default local output node；审核报告经 `scripts/publish-requirement-manifest.sh entry-update` 写入 requirement manifest，发现经 `finding-register` 登记（状态迁移经 `finding-action`——独立复验责任保留，修复者不得自行登记 RESOLVED）。

12. Severity ladder（finding 分级）：CRITICAL=违反已批准事实且不可合入；HIGH=合入前必须修复（direct rework + 本 Skill 复验 RESOLVED，无显式风险接受路径——manual-runtime-semantic-contract §5.2）；MEDIUM=合入前应修或有跟进项；LOW=改进项。
13. Finding lifecycle（manual-runtime-semantic-contract §5.1 实现类来源）：本节点登记的 finding 状态由本 Skill 处置——CRITICAL/HIGH 为 blocking（HIGH 经 implementation 直接返工后由本 Skill 复验 RESOLVED，经 publisher 写入生命周期记录；**不重走 solution-gate**，Decision-086）；MEDIUM/LOW 为跟进项不阻断。无风险接受仪式：非 scan 来源无 ACCEPTED 路径，"风险接受必须带接受者与证据"的旧规则废止。

## 能力来源对照表

| 来源旧包 | 吸收落点 |
| --- | --- |
| `sdlc-code-review-excellence` | Core Rules 全部条款吸收至本包；references 迁移件 5 个文件见 `references/sdlc-code-review-excellence/` |
| `sdlc-code-review-normalizer` | Core Rules 全部条款吸收至本包；references 迁移件 4 个文件见 `references/sdlc-code-review-normalizer/` |
