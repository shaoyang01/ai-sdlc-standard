# Decision-067：恢复 E0 活动合同收口包授权并启动执行

## 状态

Accepted（2026-08-28，Current User 裁决：ACP-R2 跨项目治理状态收敛已完成收口，
恢复 Decision-065 的 E0 授权，移除用户暂停状态，开始执行 E0.1～E0.5）

## 背景

- Decision-065（2026-08-27）已授权 C03-E E0 活动合同收口包，范围严格限定为
  规划 §6 E0 表的 E0.1～E0.5：清理 solution-gate references 旧 Direct/Speckit 路径、
  校准 skill-flow-inventory.json 为单轨 7+1、校准 runtime-capabilities.json 事实、
  扩展 validator 闭包扫描退役 ID/旧路由、清理 active tests 中 Direct stage 成功条件。
- E0 授权后立即被 Current User 暂停，原因为
  `CURRENT_USER_PAUSED_FOR_GOVERNANCE_STATE_REMEDIATION`，以配合 ACP-R2 跨项目
  治理状态收敛工作。
- ACP-R2 已于 2026-08-28 完成收口：独立复审 Round 2 PASS，blocking_findings: []；
  四仓库 STATE v2 迁移完成（从 4,327 行压缩到合计 190 行）；Exchange correction run
  和 PKB correction Handoff 已建立 supersession；CP 当前回到
  `IDLE_AWAITING_CURRENT_USER_DIRECTION`。
- Decision-066 已统一跨项目治理状态与 PKB 入站边界，明确 E0 授权持续有效、不重新
  授权，但治理整改完成后仍需 Current User 明确恢复指令才开始执行。
- 当前 CP STATE.yaml 记录：route_state `C03_E_E0_AUTHORIZED_USER_PAUSED`，
  active_work status `PAUSED` / `started: false`，pause reason
  `CURRENT_USER_PAUSED_FOR_GOVERNANCE_STATE_REMEDIATION`，next_transition
  `CURRENT_USER_RESUME_E0_ACTIVE_CONTRACT_PREFLIGHT`。

## 问题

ACP-R2 治理整改已完成收口，E0 授权（Decision-065）持续有效但仍处于用户暂停状态。
当前是否应恢复 E0 授权、移除暂停状态，并开始执行 E0.1～E0.5？

## 决策

1. **恢复 E0 授权**：Decision-065 的 E0 活动合同收口包授权持续有效，本 Decision
   恢复其执行状态，移除 Current User 暂停。E0 授权范围、边界和验收标准不变，
   仍严格限定为规划 §6 E0 表的 E0.1～E0.5。
2. **更新 CP STATE**：route_state 从 `C03_E_E0_AUTHORIZED_USER_PAUSED` 推进为
   `C03_E_E0_IN_PROGRESS`；active_work status 从 `PAUSED` 改为 `ACTIVE`，
   `started: true`；移除 pause 字段；next_transition 改为
   `E0_COMPLETION_INDEPENDENT_REVIEW`（E0 实施完成后进入独立全量只读复审）。
3. **创建实施分支**：使用独立实施分支 `feature/c03-e0-active-contract-preflight`，
   基线为当前 `feature/loop-runtime-v1` HEAD（`8efc2cb`）；E0 实施完成后提交单一 PR
   并申请独立复审。
4. **授权范围不变**：E0 仍只覆盖活动合同/metadata/validator/test 面清理，不改变
   runtime dispatch 行为，不调用任何 Agent CLI，不实施 E2-P/E1～E5，不启动下一 C05，
   无远程 Git 副作用、无业务仓写入、无发布动作。
5. **E2-P/E1～E5 仍未授权**：E0 收口后才允许请求 E2-P Provider 可达性预检授权；
   E2-P PASS 后才允许请求 E1～E4 实施包授权；E5 和下一 C05 仍分别单独授权。
6. **双 binding Solution Gate 剩余风险**：维持 Decision-063 的 Current User 风险接受——
   本轮不执行双 binding Solution Gate；E0 收口复审仍须按规划 §11 覆盖合同 → 不变量 →
   attack surface → 实现/测试证据，并对最终树与 retained commits 做负向闭合验证。

## 原因

ACP-R2 跨项目治理状态收敛已完成收口，四仓库权威边界、STATE v2 schema、Exchange/PKB
入站规则均已统一并通过独立复审。E0 是 C03-E 真实多 Agent CLI 自主调度的必要前置——
在旧 Direct/Speckit 双轨语义仍被活动合同引用时，任何 provider 探针或 adapter 实施都
可能建立在错误的能力假设上。E0 是纯活动合同/metadata/validator/test 面清理，不触及
runtime dispatch 与真实 CLI，风险可控。当前治理整改已消除暂停原因，应恢复执行。

## 影响

- CP route_state 推进为 `C03_E_E0_IN_PROGRESS`；E0 Task Gate 打开，E2-P/E1～E5 Gate
  保持关闭。
- 活动合同面（solution-gate references、两份 capabilities metadata、validator、active tests）
  将发生删除/校准；历史 archive 与 Decision 正文保留。
- 不产生 runtime 行为变化、不产生真实 Agent/Git/发布副作用。
- E0 收口前不得启动 E2-P；E2-P PASS 前不得启动 E1～E4。
- 本 Decision 不创建 E2-P、E1～E5、下一 C05 或其他实施/发布权限。

## 实现状态

本 Decision 落库于 `feature/loop-runtime-v1`；E0 实施在独立分支
`feature/c03-e0-active-contract-preflight` 进行，基线为授权决定 merge 后的主干 HEAD。
实施完成后提交单一 PR 并申请独立复审。E0 经独立复审 PASS 后由 Current User 单独裁决
收口。

## 依据

- Current User 指令："恢复E0授权，先把授权相关的项目治理做了，然后开始执行E0"；
- [Decision-065](Decision-065-c03e-e0-active-contract-preflight-authorized.md)（E0 授权）；
- [Decision-066](Decision-066-cross-project-governance-state-and-pkb-ingress-boundary.md)（跨项目治理边界与 E0 暂停状态）；
- [C03-E 详细规划](../LOOP-CORE-C03-E-PLAN.md) v0.4.0 §6 E0 表、§11 验收矩阵、§13 Q1～Q7、§15 授权边界；
- ACP-R2 跨项目治理状态收敛计划（已收口，Round 2 PASS）；
- 控制平面 STATE.yaml：route_state `C03_E_E0_AUTHORIZED_USER_PAUSED`、active_work E0 Task Gate。
