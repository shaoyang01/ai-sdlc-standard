# Decision-064：授权起草 C03-E 前置 Provider 可达性修订

## 状态

Accepted / Plan amendment drafting authorized（2026-08-27；只授权方案修订，修订内容待
Current User 接受）

## 背景

- Decision-063 已接受 C03-E v0.3.0 与 Q1～Q7，但未授权任务规划、实现或 Agent CLI。
- Source 只证明三个 provider 的 executor/gateway 路径经过 fake runner 或局部机制测试；没有
  足够证据证明 Kimi、Codex、Hermes adapter 能承担真实 canonical 工作。
- v0.3.0 把首次真实 provider 接触全部放在 E5，可能在 E0～E4 大量实现完成后才发现 CLI
  版本、非交互参数、登录态、鉴权或输出 transport 不兼容。

## 问题

是否先修订 C03-E 方案，把最小真实 CLI 可达性验证提前，同时继续保持“可达性证据不等于
adapter 验收”、E5 正式验收不降级，以及本轮零 CLI、零代码实施边界？

## 决策

1. 授权把 `LOOP-CORE-C03-E-PLAN.md` 修订为 v0.4.0-draft。
2. 原 E0～E4 单实施包拟拆为 E0 活动合同收口包与 E1～E4 runtime 实施包；修订稿在 E0
   独立复核收口后、E1～E4 实现前新增 `E2-P — Provider Feasibility Preflight`：
   对 Kimi、Codex、Hermes 分别做一次隔离、最小、无业务数据的真实 CLI 探针。授权允许
   每个 provider 一次模型请求所必需的网络调用、计费和服务端审计记录，不允许其他外部写入。
3. E2-P 证据固定为 `PROVIDER_REACHABILITY_ONLY`，只证明 executable/version、非交互
   启动、当前鉴权和基础 I/O；不得证明 canonical capability、production adapter 或 C03-E
   已可用。
4. E2-P 必须取得独立外部 Agent CLI 调用授权；方案修订、方案接受、E0 合同收口包或
   E1～E4 runtime 实施包授权均不自动包含该权限。
5. E5 不取消、不缩减：仍须独立授权，通过 production gateway/adapter 完成三个 real
   canonical canary 和一次完整八 execution point 自主 run。
6. 本 Decision 只授权起草修订，不接受修订 A1，不授权任务规划、运行时代码、Agent CLI、
   E0、E2-P、E1～E5、下一 C05 或业务仓远程 Git 动作。

## 原因

将“provider 能否在当前环境被非交互调用”和“adapter 是否满足 LOOP 完成合同”拆成两层，
可以用很小成本提前消除环境与协议未知量，同时不降低 E5 对真实 adapter、journal、推进、
恢复和全链自主性的证明强度。

## 影响

- v0.3.0 与 Decision-063 继续是当前 Accepted 合同；v0.4.0-draft 仅为待审修订。
- 下一有效动作变为 Current User 接受或退回修订 A1，而不是任务规划、实现或 CLI 预检。
- A1 若接受，将窄幅修订 Q6 授权粒度；Q1～Q5、Q7、下一 C05 和人工 Git 边界保持不变。
- CP/PKB 的动态状态不在本轮直接推进；待修订接受后再按明确授权同步。

## 实现状态

本 Decision 仅落盘规划文档、Roadmap 指针和 Decision 治理记录。无 runtime、Skill、reference、
validator、metadata 或测试代码修改；无 Agent CLI 调用；无 E0～E5 执行。

## 依据

- Current User 指令：“那就先做方案修订吧”；
- [Decision-063](Decision-063-c03e-plan-accepted.md)；
- [C03-E 详细规划](../LOOP-CORE-C03-E-PLAN.md) v0.4.0-draft；
- [LOOP Core Roadmap](../AI-SDLC-Autonomous-Delivery-Roadmap.md) v2.3.4。
