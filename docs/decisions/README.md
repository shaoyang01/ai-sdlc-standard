# AI-SDLC Decision Index

> Storage policy version: 1.0.0
> Effective date: 2026-08-22
> Authority: [Decision-046](Decision-046-decision-record-modularization.md)

## 记录边界

- Decision-001～Decision-045 保留在历史卷 [AI-SDLC-Decision-Records.md](../AI-SDLC-Decision-Records.md)，不重编号、不拆迁正文。
- Decision-046 起每个 Decision 使用独立文件，命名为 `Decision-NNN-<short-slug>.md`。
- 本索引是 Decision 定位入口，不记录当前授权、执行尝试、live finding、PR/CI 或 HEAD；这些动态事实仍由 control plane STATE 与执行证据承载。
- 新 Decision 必须使用固定八段：`状态 / 背景 / 问题 / 决策 / 原因 / 影响 / 实现状态 / 依据`。若某段不适用，也必须保留并说明。
- 状态变化在原 Decision 文件原位追加带日期的状态说明，不新建同号文件，不覆盖历史裁决文本。
- Decision 之间只通过链接引用，不复制可独立漂移的完整合同或映射表。

## Index

| Decision | Date | Status | Title |
| --- | --- | --- | --- |
| [Decision-001～045](../AI-SDLC-Decision-Records.md) | Historical～2026-08-22 | Historical volume | 既有 Decision 历史卷；Decision-044 为单轨重基线，Decision-045 为 Skill 收敛映射。 |
| [Decision-046](Decision-046-decision-record-modularization.md) | 2026-08-22 | Accepted | Decision Record 模块化与历史卷冻结。 |
| [Decision-047](Decision-047-c02-wp5-cross-entry-recovery-authorization.md) | 2026-08-24 | Accepted | 授权实施 C02-WP5 跨入口恢复与生产入口接线（Q1/Q2/Q3 均按推荐方案；H3 归属 C03-B 不变）。 |
| [Decision-048](Decision-048-c02-wp6-validation-guards-authorization.md) | 2026-08-25 | Accepted | 授权实施 C02-WP6 Validation Guards and Completion Acceptance（C02 最终综合验收包；R-A/R-B/R-C 延续裁定固化）。 |
| [Decision-049](Decision-049-c02-completed.md) | 2026-08-25 | Accepted | 消费 C02 最终授权，登记 LOOP-CORE-02 = COMPLETED；O-2 移交 C03-B；下一转换为 C03 授权申请。 |
| [Decision-050](Decision-050-c03-plan-accepted.md) | 2026-08-25 | Accepted | 接受 LOOP-CORE-C03 有界实现规划（三包 A/B/C 沿用冻结 ID；Q1～Q5 全按建议方案成立）。 |
| [Decision-051](Decision-051-c03a-closed-c03b-held.md) | 2026-08-25 / 2026-08-26 更新 | Accepted / C03-B CLOSED | C03-A 收口（Round 3 PASS）；C03-B 先 CURRENT_USER_HOLD（旧版 Skill 仍在生产使用），后经 Decision-052 授权实施，五轮复审后 Round 5 PASS 收口（单一原子提交 2f822a2，PR #108）。 |
| [Decision-053](Decision-053-control-plane-authority-and-exchange-closure.md) | 2026-08-26 | Accepted | 确认控制平面为当前执行状态与授权/收口登记权威（CP `285fe59` 标签 ACTIVE 化）；恢复 Exchange 必经收口流程，近期直同步登记为历史偏离。 |
| [Decision-054](Decision-054-c03c-authorized-o1-in-scope.md) | 2026-08-26 | Accepted | 授权 C03-C Delivery Tail Integration（c1～c3 + runtime 消费面切换：agent-skill-registry / FLOW_DEFINITIONS / metadata inventory 更新为 7+1）；O-1 观察项（OPERATION_GUIDE.md 旧 ID）本轮一并处理。 |
| [Decision-055](Decision-055-artifact-numbering-authority.md) | 2026-08-26 | Accepted | 裁决制品目录编号权威为 WP3.5 单轨方案（00-需求资料～06-知识同步）；legacy runtime 编号（03-实现记录/04-代码审核/05-测试验收）废弃，迁移列为后续包输入。 |
| [Decision-056](Decision-056-c03d-runtime-integration-artifact-path-migration.md) | 2026-08-26 | Accepted | 授权 C03-D Runtime Integration & Artifact Path Migration（c1/c2/c3 接入 runtime 调度路径 + 制品路径常量迁移到 WP3.5 新编号）；Q1~Q4 全部按推荐方案 A 裁决。 |
| [Decision-057](Decision-057-c03d-runtime-integration-closed.md) | 2026-08-26 | Accepted / C03-D CLOSED | C03-D 收口裁决：三轮独立复审后 Round 3 PASS；d1 c1 守卫接入 runtime implementation 前置、d2 c2/c3 接入 chain 完成后尾聚合、d3 制品路径迁移 WP3.5 单轨、d4 runtime 级接线测试（负向变异实证）；PR #111（head 4252b6d）四 job 全绿。C03-A/B/C/D 全部 CLOSED，LOOP-CORE-03 待 C05 真实单仓验收。 |

## 新增流程

1. 取本索引中的最大编号加一；不得复用或填补编号。
2. 创建单独 Decision 文件并补齐八段。
3. 在本表追加一行，并更新受影响的权威合同/规划链接。
4. 若涉及跨仓治理，先在产品仓形成可审阅事实；CP/PKB 同步由明确的后续授权执行，不以 handoff 代替产品仓权威文档。
