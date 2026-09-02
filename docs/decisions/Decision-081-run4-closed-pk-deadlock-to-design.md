# Decision-081：run4 收口——PWR 停等即为最终状态；P-K 死锁转设计议题

## 状态

Accepted（2026-09-02，Current User 裁决：决策卡选③「收口」——run4 以当前
深度落账收口，返工闭环 + PWR 停等即为完整证据链；P-K 死锁作为设计议题另立
波次）

## 背景

- run4 返工轮（台账 §3）：返工 finding 驱动 Re-Gate 回流 → design attempt 2
  按 ADV-004/005 重写（rev 2.0.0）→ 重扫描仅剩 ADV-006/007 两项 LOW → 重裁
  决 `PASS_WITH_RISK`（decision:3）。Current User 接受两项 LOW 风险，
  `acceptFindingRisk` 落账，recovery `gateDecision = DECIDED`。
- P-K 修复（Decision-080 授权）已实施 recovery 线性走查 / 派发命令 /
  capability entry 三处准入（`040a1f9`/`88db2fd`/`95c0e08`）。resume 后暴露
  **第四道门**：链校验器的 Round 2 H1 规则——「resolved 或 risk-accepted
  findings 永不授权新写入」——把 PWR verdict 之后的 canonical forward
  （task-planning started）判为未授权跳转。
- **设计级矛盾（P-K 死锁的本质）**：PWR-DECIDED 规则说「验收证明存在即可进
  task-planning」，Round 2 H1 说「risk-accepted 不授权写入」——二者合成：
  PWR 波次验收后必然死锁。H1 是刻意的反伪造规则，不由本波擅自修改；run4
  journal 无半成品写入，安全停驻（台账 `0166ca3`）。

## 问题

1. run4 的最终去向需要裁决（继续返工 / 修 H1 / 收口）；
2. P-K 死锁是设计级问题（两条既有规则合成的必然），其解决路径需要独立立项
   与设计，不能夹带在本波。

## 决策

1. **run4 收口**：`run-REQ-LOOP-GW-mtijjrbl-1788259523604` 以 PWR 停等
   （decision:3，ADV-006/007 已接受）作为最终状态收档；journal（fixture
   `~/loop-gw-fixtures/run4`，本机持久副本）与台账引述为持久证据；不再继续
   派发。
2. **P-K 死锁转设计议题（P-K-d）**：「PWR-DECIDED vs Round 2 H1 组合死锁」
   登记为设计级问题，候选方案已记录（①修订 H1：同 scope ACCEPTED_RISK 证明
   允许 PWR verdict 后恰一次 canonical forward，证据标准与 PWR-DECIDED 同
   源；②runtime 签发验收授权标记事件，链校验器只认标记）。**立项与方案选择
   待未来波次另行裁决**，本 Decision 不授权任何相关代码。
3. **C03-LOOP-GW 链阶段性停驻**：验收梯子 ①②③ 原样保留（材料与排除项见
   Decision-076），重启前置条件 = P-K-d 设计裁决 + 实施。门禁两轮实质对抗
   （run3 PWR、run4 FAIL→返工→PWR）与 W-GW-FIX/DIAG/PREP 交付成果即为收口
   时的链路验证结论。
4. **边界不变**：D2 挂账、E5-L3 冻结、零业务仓远程 Git 副作用、不请求 C05。

## 原因

- 返工闭环 + PWR 停等已完整证明：修复波全部生效（旧死点消除、失败可读、
  人机回路接通、fresh-prepare 打通）、门禁具备实证级对抗能力（实测 NPE 反
  证）、finding 驱动返工与失效语义真实工作——验收目标在本深度已达成；
- 继续推进的唯一路径是改 H1（设计级）或造新机制，两者都必须独立裁决与设
  计，夹带即是治理违规；
- run4 的九次真实派发、两次返工门禁、一次人机接受闭环本身就是本链最有价值
  的验收证据，收口不损失任何事实。

## 影响

- STATE：`route_state` → `C03_LOOP_GW_PARKED_PENDING_PK_DESIGN`；
  `active_work` → `C03-LOOP-GW-SMOKE` PAUSED（pause 记录 P-K-d 等裁决）；
  `GW_SMOKE_REWORK_EXECUTION` 授权消费移出；`next_transition` → P-K-d 设计
  裁决（候选方案见本 Decision 决策.2）；
- P-K-d 立项时：波次内容 = 方案选定 + chain validator/recovery 实施 + 测试
  矩阵 + run4 resume（fixture 若在则续，否则 run5 重发）+ 梯子重启；
- spruce 工作区内的 `library/REQ-LOOP-GW-mtijjrbl/`、`prompt-input/`、
  `.usage-*.json` 为 agent 行为既成事实，登记在案不清理。

## 实现状态

- 产品仓：本 Decision + 索引行 + 台账 run4 收口回填（本 commit）；Exchange/
  PKB/CP 随即传播；
- 波 1/波 2 交付：已完成（`a6e1ece`、`31c63eb`、P-K 修复 `040a1f9`/
  `88db2fd`/`95c0e08`）。

## 依据

- 台账 §3 run4 块 + 返工轮回填 + P-K 实施现状（`0166ca3`）
- Decision-079（波次与授权）、Decision-080（P-K 修复授权）
- 代码证据：`core/loop-recovery.ts`（PWR-DECIDED 三条件、P-K 三处准入）、
  `core/loop-capability-execution.ts:617-652`（Round 2 H1 isAuthorizedRestart）
