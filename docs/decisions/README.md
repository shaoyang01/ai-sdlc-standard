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

## 新增流程

1. 取本索引中的最大编号加一；不得复用或填补编号。
2. 创建单独 Decision 文件并补齐八段。
3. 在本表追加一行，并更新受影响的权威合同/规划链接。
4. 若涉及跨仓治理，先在产品仓形成可审阅事实；CP/PKB 同步由明确的后续授权执行，不以 handoff 代替产品仓权威文档。
