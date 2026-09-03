# 治理偏差登记（Governance Deviation Register）

> 目的：按 Current User 2026-09-03 要求，将"项目治理曾未按规则执行"的事实、修复状态与遗留事项落盘为持久记忆，供后续会话恢复上下文时导航。
> 层级说明：本文件是**事实登记**，不是决策权威；裁决以 `docs/decisions/` 为准，动态位置以 Control Plane STATE 为准。

## 2026-09-03 四仓审计（背景：Current User 指令检查 CP/PKB/Exchange/产品仓 + 通读 CP 治理与路线图规定）

执行会话核验：sess_ba8d5e5d（当日 16:32–21:04 自主运行，收工时工作区干净）。

### A. 规则级缺陷（决议级修复，已完成）

| # | 缺陷 | 修复 | 凭证 |
|---|---|---|---|
| A1 | H1 死锁：PWR 判定要求人工风险验收仪式，与自治交付目标矛盾 | Decision-086：PWR 自动放行、finding gate 简化；`core/loop-recovery.ts` `pwrProofSameScope` 简化为 `decisionScopeId !== null`（授权依据：Current User 09-02 原话"有 finding 我肯定会要求修正"） | 8d759e1 + 回执 c67b081 + 代码 d741255 |
| A2 | 交付路径缺陷：横向重建路线被六轮冒烟实证证伪 | Decision-087：纵向主干重建立项（三条 seam：result model / finding 物化 / production entry） | f4c5a87 + 计划 d7f714b |

### B. 执行级偏差（传播缺口/陈旧状态，当日全部修复）

| # | 偏差 | 修复凭证 |
|---|---|---|
| B1 | `d7f714b`（D-087 重建计划）已推送但未走四仓传播 | Exchange issue #109 → run `9501011` + 指针 `372c32f`（sha256 `4c47ec22` 校验一致）；PKB `54dfbe2`；CP PR #49 → `d8ead5c`；产品仓回执 `bf26890` |
| B2 | CP STATE `next_transition` 停留 Decision-086 旧文本，与 `route_state` 自相矛盾 | PR #49 重写为 D-087-01..05 实施顺序 + 验收门 |
| B3 | CP STATE `publication.artifact_path` 指向旧 run | PR #49 修正指向新 run `20260903T124500Z-d7f714b-decision-087-rebuild-plan` |
| B4 | PKB D-087 handoff（b5da952）缺 front matter | `54dfbe2` 按 086 格式补齐 |
| B5 | PKB `current.md` Source fact commit 停在 `13eddda` | `54dfbe2` 刷新至 `d7f714b` + provenance 更新 |

### C. 尚未关闭的事项（防止后续会话误判"全绿"）

1. **权威路线图文档未随 D-087 修订**：`docs/AI-SDLC-Autonomous-Delivery-Roadmap.md` 停在 08-28（`11e5c90`）。路线图重设计目前只存在于 `docs/reports/decision-087-vertical-rebuild-plan.md`（Draft）。按 C02 惯例，路线图版本重登记在里程碑关闭时执行（重建验收通过后的 ledger 关闭 + 四仓传播）。
2. **实现冻结**：D-087-01..05 五个包一行实现代码未动，等 Current User 发话（其指令原话"先不要实现"）。
3. Exchange 本地克隆落后远端 46 commits（transport-only，无实质影响）。
4. 挂起项：D2 pending、E5-L3 frozen、ladder 2/3 pending、不动 C05。

### D. 流程教训（本次审计沉淀的操作规则）

- publication 动作必须**当次会话**完成四仓传播闭环（product → Exchange → PKB → CP），不留尾巴。
- `route_state` 变更时 CP STATE 的 `next_transition` 必须同步重写（validator 约束：`condition_ref` ≤ 500 字符）。
- Exchange issue 创建后必须补打 `exchange-publish` 标签，CI 才会发布（触发条件 `issues: [labeled]` + actor 为 repo owner）。
- PKB handoff 必须带规范 front matter（per PKB schema）。

---
*登记人：ZCode 会话（Current User 指令）· 2026-09-03 · 分支 `feature/c03-e5-autonomous-acceptance`*
