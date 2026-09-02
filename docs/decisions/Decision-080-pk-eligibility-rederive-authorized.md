# Decision-080：P-K 发现与最小修复授权——PWR 验收后 eligibility 再推导（recovery）

## 状态

Accepted（2026-09-02，Current User 裁决组合：「授权，但是要先做项目治理」——先
落本 Decision 与四仓传播，后实施修复并 resume）

## 背景

- run4 返工轮（台账 §3 返工轮回填，commit `72a0ddc`）：返工 finding 登记 →
  design attempt 2 重做（rev 2.0.0）→ 重扫描 → 重裁决 `PASS_WITH_RISK`
  （decision:3，无 HIGH 以上 finding，ADV-006/007 两项 LOW 随行）。finding
  驱动的 Re-Gate 回流（P-J 的最小合法解）全程生效。
- Current User 按决策卡选择「接受 ADV-006/007，放行进实现」；`acceptFindingRisk`
  已执行：`:finding:1` → `ACCEPTED_RISK` 绑定 decision:3，证据 artifact 落库。
- **P-K 发现**：recovery 线性推进在 succeeded 节点上检查事件字段
  `nextStepEligibility !== "ELIGIBLE"` → next=null。hermes 裁决时该字段记为
  `BLOCKED`（裁决瞬间"风险未接受"的诚实判断），而事后的 `acceptFindingRisk`
  不参与 eligibility 再推导 → `gateDecision=DECIDED` 但 `nextExecutionPoint`
  仍为 null，resume 零派发。**PWR + 事后验收 = 无恢复路径**，与 P-J 同族
  （人机决策与链路推进的接缝缺口）。
- 附带勘误：昨日台账 P-J 附注「real gateway 无 revision 物化」不准确——run4
  journal 实际含 intake/design/design(2.0.0)/gate 共 4 条 revision（verdict
  revision 在停驻期间未物化、返工轮方落库，属物化时序细节）；以本条为准。

## 问题

1. PWR 验收后链路不可恢复推进：recovery 信任事件上不可变的
   `nextStepEligibility`，验收事实（ACCEPTED_RISK finding 绑定同 scope）不参
   与推导，PWR 波次在验收后死锁；
2. 该缺口使「风险接受」这一运行时设计内的人机闭环（PWR-DECIDED 三条件之三）
   形同虚设——证明永远在事件写入之后才可能出现。

## 决策

1. **授权最小修复（recovery 单点）**：`core/loop-recovery.ts` 线性推进中，
   断点为「succeeded formal_verdict 且 gateResult=PASS_WITH_RISK 且
   nextStepEligibility ≠ ELIGIBLE」时，若已存在绑定该 verdict decisionScopeId
   的 `ACCEPTED_RISK` finding（与 §5-693 的 PWR-DECIDED 证明同源同条件），则该
   点 eligibility 视为 `ELIGIBLE` 继续推进。无证明时行为不变（fail-closed）；
   其他节点/其他 gateResult 不适用。
2. **测试**：同一 gate-PWR fixture 上断言——无验收 → next=null（既有行为不
   变）；验收后 → next=task-planning 且 gateDecision=DECIDED。
3. **随后 resume** run4：预期 task-planning → implementation（codex 真实修改
   spruce 三处代码，工作区内不 commit/push）→ code-review → knowledge-sync；
   ADV-006/007 关闭条件随实现/验收执行，code-review 复核。
4. **边界**：不改 journal schema、不改事件不可变性、不放宽 PWR-DECIDED 三条
   件；②③停等、D2 挂账、E5-L3 冻结、零远程 Git 副作用不变。

## 原因

- 验收即解锁是 PWR 人机闭环的设计本意：ACCEPTED_RISK 绑定 scope 本身就是
  「门禁放行、风险随行」的持久事实，eligibility 再推导只是让 recovery 读到它；
- 单点修复（recovery 一处分支）而非事件可变或新事件类型：保住 journal 不可变
  审计面，改动面最小。

## 影响

- 波次账新增本修复小节（授权=本 Decision）；实施后 resume 的走向回填台账；
- P-K 记入问题清单（处置=本 Decision）；P-J 附注勘误以本 Decision 为准；
- STATE：rework 执行转 IN_PROGRESS，授权 +GW_ELIGIBILITY_REDERIVE_FIX。

## 实现状态

- 产品仓：本 Decision + 索引 + 台账回填（本 commit）；Exchange/PKB/CP 随即传
  播；
- 修复实施与 resume：治理落账后立即执行。

## 依据

- 台账 §3 run4/返工轮回填块（`72a0ddc`、`dc5dbf7`）
- 代码证据：`core/loop-recovery.ts` 线性推进 eligibility 检查与 PWR-DECIDED
  三条件（`~548` / `~693`）；`acceptFindingRisk`（`loop-run-store.ts:3748`）
- Current User 裁决（2026-09-02 授权）
