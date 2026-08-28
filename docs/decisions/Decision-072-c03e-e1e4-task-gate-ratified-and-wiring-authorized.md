# Decision-072：C03-E E1～E4 Task Gate 事后追认与接线继续授权（Current User 裁决）

## 状态

Accepted（2026-08-28，Current User 对任务集/审计三项请示明确回复"确认"：
追认 E1～E4 Task Gate PASS（事后追认）、授权继续 E2-T6 接线、B1/B3 按节点控制无异议）

## 背景

Decision-071 授权 E1～E4 runtime 实施包，并要求"授权后仍须经 sdlc-task-planning
形成稳定任务集并通过 Task Gate，方可写产品代码"。实施在另一台机器上推进，
至 `b842b18` 已完成能力层五模块（两轮独立复审 R2 PASS）与集成层两块
（canonical prompt builder、real capability gateway），但事前任务集与
Task Gate 未形成可恢复落盘记录——产品仓、CP、Exchange/PKB 均不可考，
仅存会话记忆。Current User 2026-08-28 选择"事后重建+追认"，不凭记忆当作证据。

事后重建产物：`docs/reports/c03-e-e1e4-task-set-and-gate-audit.md`
（分支 `feature/c03-e1-e4-runtime-implementation`，落盘提交 `b5e9206`），
基于 `b842b18` 已落盘事实重建稳定任务集（11 项 DONE / 14 项 PENDING）并补做
规划 §14.2 第 6/7 条审计。审计实测：16 文件 +2732/-2 全部落在规划 §6 目标面、
无越界；冻结面仅 `gateway.ts` executePrimary protected 化与 runner 超时上限
两处且零行为变化；新模块生产路径零引用（死代码未激活）；Node v24.12.0 下
tsc PASS、全套件 137 文件/1767 断言/0 failed。识别三个 blocker：B1 Q1 binding
未对齐（阻断真实激活）、B2 即本追认、B3 E4 未开始（阻断收口）。

## 问题

1. 是否追认 E1～E4 Task Gate 为 PASS（事后追认），接受重建任务集为剩余工作稳定基线？
2. 是否授权在 Decision-071 范围内继续 E2-T6 production factory 接线
   （默认 deterministic shadow、不激活真实 Agent）？
3. B1/B3 按任务集节点控制是否有异议？

## 决策

1. **Task Gate 事后追认 PASS**：接受 `c03-e-e1e4-task-set-and-gate-audit.md` §2
   稳定任务集为 E1～E4 剩余工作的权威基线，§14.2 七条件视为满足（第 6/7 条
   以事后重建+本追认闭合）。本追认明确标注为事后追认，不改变"事前 Task Gate
   记录缺失"这一历史事实；后续工作包不得援引本例省略事前任务集落盘。
2. **授权继续接线（E2-T6 及关键路径）**：在 Decision-071 `E1_E4_RUNTIME_IMPLEMENTATION`
   授权范围内，按任务集关键路径推进 E2-T6（real-vs-deterministic 选择开关，
   **默认 deterministic shadow，不得静默切 real**）、E1-T3/T4、E2-T7/T8、
   E3-T2、E4-T1～T5；自动证据仍只用 fake runner。
3. **Blocker 控制**：B1（Q1 binding 对齐：intake/design/task-planning/
   knowledge-sync→kimi，scan+implementation→codex，verdict+code-review→hermes）
   为真实激活前必修；B3（E4 全部）为 C-T1 独立复审前必修。两者均不阻断
   默认 shadow 的接线合入。
4. **明确不包含**：E5 production adapter canary/full-run；默认路径真实 spawn
   三 Agent 的激活；下一 C05；业务仓远程 Git/发布副作用。以上仍须 Current User
   另行单独授权。
5. **状态登记**：CP STATE 推进为 active_work C03-E1-E4 / status IN_PROGRESS /
   started:true（实际开工以产品仓首个实施提交 `f5c4559` 为准）；本 Decision 的
   Exchange→PKB 发布按 §15.3/§15.4 单独走，发布前 publication=PENDING，
   不影响本裁决生效。

## 原因

任务集内容可由规划 §6、Q1～Q7、Decision-071 scope 与已落盘提交可靠重建，
审计未发现越界、未激活代码混入生产路径或测试造假；已写代码经两轮独立复审与
全套件验证，证据有效。缺的是事前控制记录而非实施质量，事后重建+明示追认
既闭合可恢复性，又不伪造历史。接线在既有授权范围内且默认不激活，风险可控。

## 影响

- E1～E4 剩余工作按任务集关键路径继续；完成后 C-T1 独立全量只读复审（Node v24），
  再由 Current User 收口裁决（C-T2）。
- CP `projects/ai-sdlc/STATE.yaml` 登记 IN_PROGRESS/started:true 与本追认引用。
- 本 Decision 不构成 E5、真实 Agent 激活或下一 C05 授权。
- Exchange/PKB 归档按标准 Publisher 链补走；AI-SDLC 不直写 PKB。

## 实现状态

本 Decision 落盘于产品仓 `feature/c03-e1-e4-runtime-implementation` 分支并推送；
CP STATE 经独立分支登记；Exchange/PKB publication 状态 PENDING，待标准 Publisher run。

## 依据

- `docs/reports/c03-e-e1e4-task-set-and-gate-audit.md`（事后重建任务集与一致性审计，`b5e9206`）；
- Decision-071（E1～E4 授权与 Task Gate 要求）、Decision-066（权威边界与 stale registration 规则）；
- 规划 `docs/LOOP-CORE-C03-E-PLAN.md` v0.4.0 §6、§9、§14.2；
- 产品仓 Git 事实：`f5c4559`→`b842b18` 实施提交、能力层 R2 复审、v24 全套件 137/1767/0；
- Current User 2026-08-28 裁决原文："事后重建+追认吧"、"确认"。
