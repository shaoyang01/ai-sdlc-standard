# Decision-062：授权完善 C03-E 详细规划（不授权实施）

## 状态

Accepted / Detailed planning authorized（2026-08-27，Current User 明确授权完善 C03-E
详细规划；只允许修改规划文档与治理记录，不允许改代码、调用 Agent CLI 或启动 C05）

## 背景

- Decision-060 已将 `wms-monitor/20260827-dashboard-page` 收口为“业务与人工七节点链
  PASS / Core autonomy CHANGES_REQUESTED”，并把自主运行缺口路由到 C03-E。
- C03-E 0.1.0 只建立 E0～E5 的方向级边界；尚未给出真实 Source 代码面的统一架构、
  进程/输出/journal 合同、attempt 隔离、恢复窗口、完整负向矩阵和待裁决参数。
- 控制平面当前停在 `C03_E_PLAN_REVIEW_PENDING`，实施授权为 `NOT_GRANTED`，执行未开始。
- `sdlc-task-planning` 只允许消费已过门方案；当前 C03-E 尚未 Accepted，不能直接生成
  可实施任务集或借“规划”启动代码工作。

## 问题

在不提前实施、不调用外部 Agent、不重开 C05 的前提下，下一步应直接授予 E0～E4 实施
权限，还是先把 C03-E 方案补齐为可复审、可裁决、可恢复的详细规划？

## 决策

1. **先详细规划**：授权把 `docs/LOOP-CORE-C03-E-PLAN.md` 从方向级 0.1.0 完善为
   0.2.0 `DRAFT_FOR_CURRENT_USER_REVIEW`。
2. **允许范围**：只允许读取当前 Source、修改 C03-E 规划文档及必要治理记录，并运行
   本仓文档/标准/类型/测试校验；允许用纯文档分支/PR 持久化本次规划事实。
3. **禁止范围**：不修改任何运行时代码、Skill/reference/validator/metadata 实现；不调用
   Kimi/Codex/Hermes 或其他 Agent CLI；不启动 E0～E5；不启动下一条 C05；不执行业务仓
   commit/push/PR/merge/release。
4. **规划内容**：必须覆盖真实 Source 缺口、production entry、统一 real adapter/profile、
   output contract、process journal、attempt staging/promotion、Re-Gate、恢复、人机边界、
   编码前数据场景、验收证据、风险、bounds 与待裁决项。
5. **Gate 不前进**：本轮不执行双 binding Solution Gate；规划仍为 Draft，Task Gate 保持
   关闭。只有 Current User 审阅并裁决规划问题、后续 Solution Gate 通过，才可讨论
   E0～E4 实施授权。
6. **授权不外溢**：规划 PR 合入、CP/PKB 登记或 CI 通过均不等于规划 Accepted、实施
   授权、Agent 调用授权、E5 授权或 C05 授权。

## 原因

C03-E 涉及真实本地进程、凭据/环境、workspace 写入、超时清理、output validation、持久化
journal 和 crash recovery。若在这些合同未冻结时直接授权实施，容易把“允许开发 adapter”
误解为“允许执行外部 Agent”，也会在真实进程已改文件但 terminal 未落盘时留下不可判断
状态。先形成详细规划，能把高风险决策集中到一个可审阅面，同时保持当前业务需求已结束。

## 影响

- C03-E 当前 route/gate 仍为 `C03_E_PLAN_REVIEW_PENDING` /
  `LOOP_CORE_C03_E_PLAN_REVIEW_GATE`；
- `implementation_authorization=NOT_GRANTED`、`execution_started=false` 保持不变；
- 0.2.0 草案中的 Q1～Q7 由 Current User 后续裁决，不在本 Decision 中预先接受；
- E0～E4 仍建议作为一个实施包，E5 与下一 C05 仍分别单独授权，但该粒度也要随规划
  接受裁决正式生效；
- Personal-KB 投影仍在 Advanced 04，不阻塞 C03-E。

## 实现状态

本 Decision 的规划授权已消费。C03-E 0.2.0 详细草案经产品 PR #116 合入
`feature/loop-runtime-v1`（merge `0bbe7c3e70b1858159f8eb5c185f076963a8e038`），CP 登记
`86b08f2`，PKB 登记 `3bb4b6e`；四项产品 CI 与 PKB 校验通过。全程无生产代码变更、无
Agent CLI 调用、无 E0～E5 或 C05 run。后续方案接受裁决见
[Decision-063](Decision-063-c03e-plan-accepted.md)。

## 依据

- Current User 指令：“授权完善 C03-E 详细规划，仅允许修改规划文档和治理记录；不允许
  改代码、调用 Agent CLI 或启动 C05。”
- [Decision-060](Decision-060-c05-closure-and-autonomy-replan.md)；
- [C03-E 详细规划](../LOOP-CORE-C03-E-PLAN.md) rev 0.2.0；
- [LOOP Core Roadmap](../AI-SDLC-Autonomous-Delivery-Roadmap.md) v2.3.2；
- `sdlc-solution-design` 与 `sdlc-task-planning` 的职责和前置边界。
