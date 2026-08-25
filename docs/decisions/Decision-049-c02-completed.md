# Decision-049：消费 C02 最终工作包授权，登记 LOOP-CORE-02 = COMPLETED

## 状态

Accepted（2026-08-25，Current User 终局裁决：WP6 Round 1 独立完整范围复审 PASS 且无未解决 P1/P2，消费 `C02_WP6_VALIDATION_GUARDS_AND_COMPLETION_ACCEPTANCE`，登记 LOOP-CORE-02 = COMPLETED；O-2 登记为控制平面观察项移交 C03-B；PR #103 merge 授权）

## 背景

C02 全部六个工作包 + WP3.5 单轨重基线均已完成独立复审收口：WP1（Round 9 重新收口）、WP2、WP3、WP3.5-A/B/C、WP4（Round 多轮）、WP5（Round 7）、WP6。WP6 实施交付了规划 §6 要求的生产路径对抗验证套件（`tests/loop-wp6-completion-contracts.test.ts`，S1～S9），并经探针发现且修复了一处真实生产缺口（FAIL adjudication 经真实 gateway 派发后 runtime 在物化处 INVALID_INPUT 崩溃而非诚实 BLOCKED——两处最小守卫：`findPendingRevisionProducerExecution` 与 `materializeProducerRevision` 跳过非 passing verdict）。Round 1 独立完整范围复审（PR #103，head `dd5d44f`）判定：四项完成合同逐项 PROVEN、FAIL-verdict 修复最小性成立、R-A/R-B/R-C 执行核对全部命中、无未解决 P1/P2，并显式声明「C02-WP6 具备收口条件……可提请 Current User 消费最终工作包授权并裁决 LOOP-CORE-02 = COMPLETED」。非阻塞观察项 O-1/O-3 已随收口修正（`dd5d44f`）；O-2 为范围外披露。

## 问题

C02 的四个完成合同是否已由生产路径对抗证据联合闭环，从而使 Current User 可以消费最终工作包授权、把 `LOOP-CORE-02` 登记为 COMPLETED，并将后续边界正确移交（C03 授权不自动发生、H3 与 O-2 归属不变）？

## 决策

1. **消费最终授权**：`C02_WP6_VALIDATION_GUARDS_AND_COMPLETION_ACCEPTANCE` → consumed=true；WP6 收口基线 = PR #103 merge `06b8d75`（实现主体 `9936a1d` 树 + WP6 套件与守卫修正 + O-1/O-3 落实）。
2. **登记完成**：`LOOP-CORE-02 = COMPLETED`。四项完成合同的联合证据索引固化于本决定与控制平面 completed_requirements：合同1 变更分类 ← WP1 合同 + WP5/WP6 S1；合同2 finding 失效与最早节点路由 ← WP3 + WP6 S2；合同3 只消费有效上游版本与 Gate ← WP2/WP4 + WP6 S3/S6；合同4 中断续跑不重解释 ← WP4/WP5 lease/bootstrap/created 兼容 + WP6 S4/S5。
3. **O-2 登记**：`init()` 在格式门禁之前对历史 journal 持久化 WAL journal_mode 的物理副作用（无语义迁移、无数据变更）登记为控制平面观察项 `R4_O2_WAL_JOURNAL_MODE_PHYSICAL_WRITE`（severity LOW、state OPEN、owner C03-B 原子 cutover 边界/后续治理），不在 C02 范围内处置。
4. **边界移交**：下一有效转换为 **C03 授权申请**（Single-Rail Skill Delivery，含 A/B/C 阶段与 H3 处置）；C03、C05 保持 NOT_AUTHORIZED；本决定不构成任何 Ready/merge 之外的真实 Agent/Git/发布许可。
5. **v8 及以后**：任何对 v7 格式的后续演进必须按不变量 13 的声明式 cutover 治理单独裁决；本决定不预设。

## 原因

规划 §12 的收口条件已全部满足：六个工作包全部收口、四项完成合同均有 WP6 生产路径正例/负例/恢复例的联合证据、终局复审 PASS 无 P1/P2。此时消费最终授权是既定流程的机械执行；将 COMPLETED 登记与授权消费绑定在同一裁决中，避免「已完成但权威状态滞后」的治理悬空。

## 影响

- `LOOP-CORE-02 = COMPLETED` 生效；C02 四项完成合同状态由 INCOMPLETE/NOT_AUTHORIZED 转为 COMPLETED。
- H3 保持 open（C03-B）；O-2 观察项开立；WP5 引入的 resume lease / bootstrap provenance / created-only 兼容等生产面进入常规维护，由 C03 及后续包按需引用。
- C03、C05 未获任何授权；Roadmap 下一步为 C03 授权申请。

## 实现状态

WP6 实现 PR #103 已 merge（`06b8d75`）；收口登记提交随本决定落库于 `feature/loop-runtime-v1`。

## 依据

- 规划 rev 1.3.0 §12、§6 C02-WP6 验收；
- Decision-048（最终授权）；
- WP6 Round 1 独立完整范围复审报告（PASS、无 P1/P2、PROVEN 四项、观察项 O-1/O-2/O-3）；
- 控制平面 STATE.yaml：route_state/Gate 预置与 skill-isolation 前置条件。
