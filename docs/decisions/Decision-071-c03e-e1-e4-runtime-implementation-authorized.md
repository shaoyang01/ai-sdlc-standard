# Decision-071：授权 C03-E E1～E4 Runtime 实施包

## 状态

Accepted（2026-08-28，Current User 裁决"授权 E1～E4 runtime 实施包"。
本授权在 E0 收口（Decision-068）与 E2-P 三 provider 全 PASS（Decision-070）
之后成立；**不包含 E5 自主 runtime 验收、下一轮真实 C05、生产远程 Git/发布副作用，
也不包含真实 Agent CLI 模型请求**——E1～E4 自动证据一律使用 fake process runner。）

## 背景

- 阶段链（规划 §10）：E0 合同收口 → 独立授权 E2-P → Provider Feasibility Gate PASS
  → E1～E4 runtime 实施包 → 独立全量复审 → Current User 收口裁决 → 另行授权 E5。
  前两环已由 Decision-068/070 关闭。
- E2-P 已于隔离 fixture 实测 Kimi 0.38.0 / Codex 0.150.1 / Hermes 0.20.5 全部可达
  （非交互、凭据可用、输出可确定截取），并固化了 argv profile 与 provider identity/
  version/transport 事实，作为 E2 profile 的实现输入。
- 规划 §14.2 的 E1～E4 Task Gate 条件：规划 ACCEPTED、Q1～Q7 裁决、Solution Gate
  风险接受、A1 修订、E0 独立收口、E2-P 单独授权且三 Agent 全 PASS 均已满足；本决定
  补齐最后一项"E1～E4 runtime 实施包授权另行成立"。授权后仍须经 sdlc-task-planning
  形成稳定任务集并通过 Task Gate，方可写产品代码。

## 问题

Current User 是否授权在单一实施分支上实现 E1～E4，把 deterministic shadow runtime
推进为经统一 adapter/profile/runner 接入三家真实 CLI 能力、具备生产入口、严格输出
校验/自动推进/Re-Gate、可恢复与人机边界的 production runtime（自动证据用 fake runner，
真实 canary/full-run 留 E5）？

## 决策

1. **授权 E1～E4**：授权 ID `E1_E4_RUNTIME_IMPLEMENTATION`，范围严格限定为规划 §6：
   - **E1 Production Entry & Run Ownership**：新增 `core/loop-production-entry.ts`
     （exact request schema / preflight / identity / store wiring）与
     `scripts/loop-run.ts`（仅解析 `--request-file`/`--resume`）；扩展 `runtime.ts`
     消费真实 `LoopRunIdentity` 与 production gateway，保留现 `run()` 为 test-only 并
     明确标记非生产；`package.json` 仅新增本地入口命令。fresh run 绑定真实
     repo/base SHA/source provenance；resume 只按 identity/journal；无 gateway/shadow/
     command/env 注入面；base drift/dirty source/重复 run/并发 resume/非法路径/未知
     字段一律在 Agent spawn 前 fail closed。
   - **E2 Real CLI Adapters & Production Gateway**：新增 `execution/agent-cli-profile.ts`
     （三 profile + 能力矩阵 + Q4 bounds，绑定 E2-P 实测 identity/version/transport）、
     `execution/real-capability-adapter.ts`（统一 invocation/result envelope）、单一
     real canonical route（`real-capability-gateway.ts` 或 `gateway.ts` 内，不得并存
     第二套 tracing/推进状态机）；统一复用 `core/loop-posix-process-runner.ts`，淘汰
     生产路径三个自定义 spawn runner；Kimi/Hermes sidecar/contract-only 改主 adapter，
     兼容代码仅 archive/测试且不被 production factory 选中；Codex `shadow_fallback`
     parser 改 fail closed；输出严格转 canonical `ExecutionResult`。安全：
     `spawn(...,{shell:false})`、executable 仅来自 allowlist/profile、动态需求只走
     stdin、process-group 先 TERM 后 KILL、stdout/stderr 有界清洗且原文不进 journal、
     cwd 固定 attempt worktree/staging、adapter 无 commit/push/PR/merge/release 权限。
   - **E3 Output Validation / Auto-Progression / Re-Gate**：扩展 canonical node output
     validator（exact schema、artifact kind、stable path、version、digest、producer
     invocation、input binding、generation、allowed write set）；固化 solution-gate
     （scan ledger 必写、verdict 由不同 binding 消费同一 ledger、materialized depth）、
     task-planning（仅消费 Accepted solution+verdict）、implementation（workspace diff
     只含允许路径、record 与 patch/workspace digest 一致）、code-review（blocking
     finding 回流最早受影响节点）、knowledge-sync（只同步稳定事实）。invalid output/
     旧 input/错 generation/伪造 digest/错 Agent/同 Agent 双 Gate role/stale revision/
     未闭合 finding/越界写一律"不推进"。
   - **E4 Durable Recovery & Human Boundary**：不可分叉的 process evidence artifact；
     `LoopRunStore` append/readback/transaction 增 invocation/process/staging/promotion/
     human-action 固定字段（若升级 capability execution schema，先做当前 v4 journal
     preflight，发现真实历史 v4 run 需跨版本恢复即停止回 Current User）；recovery
     context 区分 safe retry / verify staged / cleanup required / human input required /
     terminal failed|blocked；resume lease 覆盖 recovery→claim→spawn→terminal/promotion
     窗口；attempt workspace 成功提升/失败隔离/未知副作用保留证据并阻塞；
     `human_action_required` 仅允许 `MISSING_BUSINESS_FACT`/`SOURCE_CONFLICT`/
     `RISK_ACCEPTANCE_REQUIRED`/`PERMISSION_REQUIRED`/
     `EXTERNAL_SIDE_EFFECT_AUTHORIZATION_REQUIRED`/`MANUAL_GIT_HANDOFF_REQUIRED`，
     `SWITCH_AGENT_REQUIRED`/`SHADOW_FALLBACK_REQUIRED` 非法。
2. **实施边界（§10）**：使用**单一实施分支 `feature/c03-e1-e4-runtime-implementation`
   与单一 PR**，E1→E2→E3→E4 在**一个 retained commit boundary 内原子成立**；禁止任何
   中间 commit 让 production entry 指向 shadow/sidecar/半完成 journal schema；必要时
   squash 或采用明确 retained-commit 验证策略；per-commit validator 必须可过。
3. **裁决约束（Q1～Q5 沿用）**：初始 binding 按 §3.2 Kimi/Codex/Hermes 分工、不做动态
   路由；禁止 real→shadow 与自动跨 Agent fallback；仅无副作用基础设施失败允许同 binding
   自动重试一次（有文件变化/中断歧义先恢复核验）；所有节点 attempt staging、
   implementation 隔离 worktree；bounds 取 §9 首版值（非 impl 10min、impl 30min/attempt、
   同 binding retry≤1、Re-Gate 8 轮、全 run 前台预算 2h、stdin 1MiB、stdout 256KiB、
   stderr 64KiB、单 artifact 16MiB），profile 不能满足即 fail closed，不得为跑通取消上限。
4. **证据与复审（§11）**：E1～E4 自动证据为 fake process runner 全状态矩阵（三 profile
   成功/缺命令/非零/signal/timeout/截断/泄密/malformed/cleanup failure）、契约/变异/
   fault injection 测试与 CI 全绿；**不调用真实 Agent CLI、不发起真实模型请求**（真实
   adapter canary 与完整自主 run 归另行授权的 E5，且 E2-P/fake 结果不得替代）。完成后
   须经独立全量只读复审，覆盖合同→不变量→attack surface→实现/测试，并对最终树与所有
   retained commits 做负向闭合；CI 全绿只是基线，不自动形成 PASS 或收口。
5. **明确不授权**：不启动 E5（production adapter canary + 完整自主 run）；不开始下一
   真实 C05；无生产远程 Git 副作用（不 push 业务仓/不发 PR/merge/release，人工 Git
   交接走 `MANUAL_GIT_HANDOFF_REQUIRED`）；不新增第二状态机/第二权威；不删改历史
   Decision；E1～E4 授权不自动包含 E5 或 C05。
6. **下一有效转换**：sdlc-task-planning 形成 E1～E4 稳定任务集并通过 Task Gate →
   在单一实施分支实现 → 独立全量复审 → Current User 对实施包做收口裁决；收口后 E5
   另行授权。

## 原因

E0 已清除活动合同旧语义，E2-P 已以最小代价确认三家 CLI 在本机具备非交互自动化接入
前提，"在错误能力假设上写 adapter"的主要风险已排除。此刻投入 E1～E4 可在 fake runner
保护下一次性、原子地把生产入口、统一 adapter/gateway、严格输出校验/推进/Re-Gate、
可恢复与人机边界建立起来，避免多包并行产生第二套状态机或半成品入口；真实外部副作用
（真实 CLI canary、业务仓 Git、发布）继续后移到 E5/C05 单独授权，风险可控。

## 影响

- CP route_state 由 `C03_E_E2P_PASSED_AWAITING_E1_E4_AUTHORIZATION` 推进为
  `C03_E_E1_E4_AUTHORIZED`；live_authorizations 新增 `E1_E4_RUNTIME_IMPLEMENTATION`
  （AUTHORIZED, unconsumed）；active_work 登记 C03-E1-E4（NOT_STARTED），lifecycle ACTIVE。
- 产品 runtime 代码面（`core/`、`execution/`、`runtime.ts`、`scripts/`、`package.json`、
  测试）将在单一实施分支发生实质新增/改造；旧 sidecar/contract-only/shadow 生产消费面
  清零，仅保留 test-only。
- 不产生真实 Agent/Git/发布副作用；E5 与下一 C05 在任何情况下都不因本授权自动启动。

## 实现状态

本授权决定落库于 `feature/loop-runtime-v1`。授权治理（Decision + CP STATE 登记 +
Exchange/PKB 传输归档）完成后，先经 sdlc-task-planning 与 Task Gate，再在
`feature/c03-e1-e4-runtime-implementation` 单分支实施 E1～E4。

## 依据

- Current User 指令："授权 E1～E4 runtime 实施包"；
- [Decision-070](Decision-070-c03e-e2p-provider-reachability-passed.md)（E2-P PASS，前置满足）、[Decision-068](Decision-068-c03e-e0-active-contract-preflight-closed.md)、[Decision-064](Decision-064-c03e-early-provider-feasibility-plan-amendment.md)；
- [C03-E 详细规划](../LOOP-CORE-C03-E-PLAN.md) v0.4.0 §3.2 binding、§6 E1～E4、§9 bounds、§10 提交边界、§11 证据矩阵、§12 风险、§13 Q1～Q5、§14.2 Task Gate；
- 控制平面 STATE.yaml：route_state `C03_E_E2P_PASSED_AWAITING_E1_E4_AUTHORIZATION`。
