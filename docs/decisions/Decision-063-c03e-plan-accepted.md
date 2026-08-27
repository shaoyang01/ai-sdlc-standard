# Decision-063：接受 C03-E 详细方案（不授权实施）

## 状态

Accepted / C03-E plan accepted（2026-08-27，Current User 明确指示直接通过方案，并强调
本裁决不是实施授权）

> 2026-08-27 后续状态说明：Decision-064 仅授权起草 v0.4.0-draft 的前置 Provider
> 可达性修订。修订 A1 尚未接受，因此本 Decision 与 v0.3.0 仍是当前有效方案合同。

## 背景

- Decision-062 已授权并完成 C03-E 详细规划，产品 PR #116 将 v0.2.0 草案合入
  `feature/loop-runtime-v1`（merge `0bbe7c3`）。
- 草案已给出真实多 Agent CLI 自主调度的系统模型、E0～E5 边界、S01～S16 场景、
  INV-E1～INV-E12 不变量、证据矩阵、bounds 与 Q1～Q7 推荐值。
- 当前控制状态仍为 `C03_E_PLAN_REVIEW_PENDING`，Solution Gate 未运行，实施授权为
  `NOT_GRANTED`，执行未开始。

## 问题

是否接受 C03-E 详细方案与 Q1～Q7 推荐值，并在不调用 Agent CLI 的前提下由 Current User
承担未执行双 binding Solution Gate 的剩余风险，同时继续保持任务规划和实施未授权？

## 决策

1. **方案通过**：接受 `LOOP-CORE-C03-E-PLAN.md` v0.3.0，状态升级为 `ACCEPTED`，
   深度固定为 `DEEP`。
2. **Q1 binding**：接受 Kimi 负责 requirement-intake、solution-design、task-planning、
   knowledge-sync；Codex 负责 solution-gate adversarial scan 与 implementation；Hermes 负责
   solution-gate formal verdict 与 code-review；首版不做动态路由。
3. **Q2 fallback**：禁止 real -> shadow fallback 和自动跨 Agent fallback。
4. **Q3 retry/recovery**：仅无副作用的 retryable 基础设施失败允许同 binding 自动重试
   一次；存在文件变化、中断或副作用歧义时先恢复核验。
5. **Q4 bounds**：接受计划 §9 的 timeout、输出、attempt、Re-Gate 和总预算首版值；
   provider profile 无法满足时阻塞，不静默放宽。
6. **Q5 promotion**：所有节点使用 attempt staging；implementation 使用隔离 worktree 与
   patch/workspace digest；只有验证通过后才能 promotion。
7. **Q6 授权粒度**：E0～E4 作为一个实施包；E5 真实外部 Agent 验收与下一 C05 分别
   单独授权。
8. **Q7 journal**：采用声明式 cutover；preflight 若发现需要恢复的真实 v4 journal，
   `STOP_AND_REPORT`，不自动迁移或重写。
9. **Solution Gate 风险接受**：本轮不调用 Codex/Hermes 执行双 binding Solution Gate；
   Current User 显式接受该剩余风险，状态记录为 `NOT_RUN / CURRENT_USER_RISK_ACCEPTED`。
10. **不授权实施**：本 Decision 不授权任务规划、代码修改、Agent CLI、E0～E5、实现
    分支/PR、下一 C05 或业务仓远程 Git 动作。

## 原因

Current User 判断完整逐项复核成本过高，选择信任当前详细方案并在后续通过实现复审、负向
测试和真实验收发现问题后再回流。用明确风险接受代替本轮 Solution Gate，可以结束方案
审阅，同时不把方案接受误写成实施授权或外部 Agent 调用授权。

## 影响

- C03-E 计划状态前进为 `ACCEPTED`，Q1～Q7 不再是 open decision；
- Solution Gate 不记为 PASS，而记为 `NOT_RUN / CURRENT_USER_RISK_ACCEPTED`；
- `implementation_authorization=NOT_GRANTED`、`execution_started=false` 保持不变；
- Task Gate 继续关闭，因为 E0～E4 实施授权尚未成立；
- 下一有效控制动作是 Current User 单独决定是否授权 E0～E4 实施包。即使未来授权成立，
  也必须先生成稳定任务集并通过 Task Gate，不能直接跳到代码实施；
- E5、下一 C05、Personal-KB Advanced 04 均不因本裁决启动。

## 实现状态

本 Decision 仅登记方案接受与风险接受。产品仓只修改规划文档、Roadmap 和 Decision 治理
记录；无 runtime/Skill/reference/validator/metadata 代码变更，无 Agent CLI 调用，无任务
规划，无 E0～E5 或 C05 run。产品 PR、CI、CP 与 PKB 不可变引用在本纯文档变更合入后登记。

## 依据

- Current User 指令：“直接通过吧，太多了看不过了，相信你的能力，后续如果有问题我再提，
  这不是实施授权，而是方案通过”；
- [Decision-060](Decision-060-c05-closure-and-autonomy-replan.md)；
- [Decision-062](Decision-062-c03e-detailed-planning-authorized.md)；
- [C03-E 详细规划](../LOOP-CORE-C03-E-PLAN.md) v0.3.0；
- [LOOP Core Roadmap](../AI-SDLC-Autonomous-Delivery-Roadmap.md) v2.3.3。
