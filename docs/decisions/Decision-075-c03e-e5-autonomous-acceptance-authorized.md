# Decision-075：C03-E E5 自主运行验收授权（分层推进，L1 负向矩阵映射先行）

## 状态

Accepted（2026-08-30，Current User 裁决「可以开始搞E5了」；采纳实施方分层授权
提案——L1 立即执行，L2/L3 真实 CLI 触发前须再次向 Current User 确认）

## 背景

C03-E E1～E4 实施链已闭合（Decision-074）：W1–W6b5 十一波 + C-T1 全量复审
全 PASS，C-T2 归档执行完毕。E5 = Autonomous Runtime Acceptance（规划
`docs/LOOP-CORE-C03-E-PLAN.md` §6），是「这套 runtime 真的能用」的最后一道
验收门，要求三层证据、缺一不可：

1. **自动负向矩阵**：fake runner + fault injection 证明 fail-closed、恢复、
   Re-Gate、并发、Git 边界；只能证明机制，不能证明 provider 可用。
2. **真实 Adapter canary**：Kimi/Codex/Hermes 分别经 production gateway 与
   已实现 adapter 在隔离 fixture 上执行最小 canonical capability；E2-P 的
   direct CLI 可达性结果不得替代本层。
3. **真实自主 fixture run**：一次入口启动，完整八 execution point，
   `manual_agent_switch_count=0`，至少一次受控 Re-Gate/恢复，最终只输出
   人工 Git handoff。

当前 real 路径休眠（B-7 tripwire + PATH A FROZEN + `runProduction` 硬拒
real）；E5 PASS 后才可请求下一条真实业务 C05 授权。

## 问题

E5 是独立授权项，规划要求「另一份独立授权和正式验收证据面」；其中 L2/L3
涉及真实 CLI 进程调用，属授权敏感点。需要把授权落档，同时不把零 CLI 的
L1 与真实调用的 L2/L3 混同在同一个触发条件下。

## 决策

1. **E5 授权成立，分层推进**：
   - **L1 自动负向矩阵映射（立即执行）**：零 CLI、零生产代码改动。把
     E1–E4 已交付的自动证据映射到规划 §6 E5 第 1 层五类要求（fail-closed、
     恢复、Re-Gate、并发、Git 边界），并核对规划 §7 S1–S18 数据场景与
     E4 验收六 crash window（started/spawn/result/validation/terminal/
     revision）的 fixture 覆盖。产出 = 证据映射报告 + 缺口清单；缺口按
     波次立项、逐波独立复审，全部闭合后才可进入 L2。
   - **L2 真实 Adapter canary**：原则上在本授权范围内，但**真实 CLI 触发
     前必须再次向 Current User 确认**（规划既定纪律「真实 CLI 调用触发前
     再确认一次」）。仅隔离 fixture、最小 canonical capability；记录真实
     executable/profile/version、started/terminal、output/validation/
     promotion digest。
   - **L3 真实自主 fixture run**：L2 PASS 后启动，触发前同样再确认；完整
     八 execution point，`manual_agent_switch_count=0`，至少一次受控
     Re-Gate/恢复，最终只输出人工 Git handoff。
2. **边界**：全程零业务仓写入、零远程 Git 副作用、零 merge/push/发布；
   attempt 隔离 staging；任一层 FAIL 只能回流 E2/E3 修复，不得用 shadow
   结果、执行者自述或旧证据降级放行（规划 S16/S18）；E5 PASS 前不请求 C05。
3. **E5 独立台账**：`docs/reports/c03-e5-task-set-and-acceptance-audit.md`
   （L1 产出时落档，作为正式验收证据面载体；E1–E4 台账不重开）。
4. **事实分支**：`feature/c03-e5-autonomous-acceptance`（自 `c7a2e01` 切出）；
   CP `active_work` 切至 E5 验收。
5. **C-T1 非阻塞 P1–P3 不自动并入 E5**：若 L1 盘点判定 P1（六合法码字面钉）
   与 E4-T4 证据面直接相关，可提案并入 E5 缺口修复波次，须 Current User
   确认后执行。

## 原因

- 2026-08-30 凌晨会话中 Current User 选择「先聊清楚再定」；实施方提出按层
  拆授权、层层停驻的方案并说明三层证据定义；晨间 Current User 裁决开工。
  分层推进与规划「E5 使用另一份独立授权 + 正式验收证据面」一致，且不把
  零风险的证据整理与真实 CLI 调用混在同一触发条件下。
- L1 是纯只读映射，不触碰 real 路径休眠保证，无需额外门禁。

## 影响

- real 路径保持休眠，直至 L2/L3 各自的触发前确认完成；B-7 与
  `runProduction` 硬拒 real 的保护在本 Decision 下不放松。
- CP `route_state` 进入 E5 验收进行中；E1–E4 CLOSED 状态不变——本 Decision
  开启新的验收任务集，不重开实施任务集。
- 授权消费口径：本 Decision 对应 CP `live_authorizations` 条目
  `E5_AUTONOMOUS_ACCEPTANCE`（consumed=false）；E5 全链收口时整条移出
  （Decision-068 惯例）。

## 实现状态

L1 已开工（本 Decision 落档时点）；L1 产出与缺口清单以 E5 台账与映射报告
为准。

## 依据

- 规划：`docs/LOOP-CORE-C03-E-PLAN.md` §6 E5、§7 数据场景矩阵、§9 bounds。
- Decision-074（E1–E4 收口）与台账
  `docs/reports/c03-e-e1e4-task-set-and-gate-audit.md`。
- Current User 2026-08-30 会话裁决：「可以开始搞E5了」。
- 分层方案讨论记录：2026-08-30 会话（三层证据定义与层层停驻提案已向
  Current User 完整呈现）。
