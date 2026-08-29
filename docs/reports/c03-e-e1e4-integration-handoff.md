# C03-E E1～E4 Runtime 实施 — 集成层交接（HANDOFF）

> 最后更新：2026-08-29（UTC）。供中断后新会话/新 Agent 无缝续作。只读事实 + 明确下一步，勿凭印象改。

## ★ 当前快照（W6b1，最新，与下文冲突时以本节为准）

- **分支已 push 且有上游**：`feature/c03-e1-e4-runtime-implementation`（主干仍是 `loop-runtime-v1`，未碰）。续作先 `git fetch && git pull`。
- **HEAD = `d4ee31e`（台账裁决提交）＋ 未提交工作区改动（W6b1 = E4-T3，已实现、待外部独立复审）**。
  - 已落库：W1～W5 全部 PASS；**W6a=E4-T1+T2（`5b1855a`，68 断言，独立复审 PASS 零阻塞，CP PR #22 已合 main `16cc5e6`）**；`d4ee31e` 是 W6b 三条裁决的台账提交。
  - 工作区（未提交）：**W6b1 = E4-T3 resume lease 窗口防火墙**，生产 3 文件 +82/-8（`core/loop-resume-lock.ts` 新增 `isResumeLeaseHeld`、`core/loop-capability-entry.ts` 新增 `requireResumeLeaseJournal` 选项与进入窗口时的 fail-closed 断言、`runtime.ts` 构造 entry 时装配该选项），新测试 `tests/loop-w6b1-resume-lease-window.test.ts` **22 断言全绿**。
  - 权威 W↔E 任务映射与每步状态见 `docs/reports/c03-e-e1e4-task-set-and-gate-audit.md`（台账，比本 handoff 更细，先读它）。
- **W6b1 做了什么（一句话）**：把「lease 覆盖 recovery→claim→spawn→terminal/promotion 窗口」从**结构性巧合**变成**可强制、可证明的防火墙**。
  - 取证事实：`runProduction`（`runtime.ts:961`）委托给 `run()`（`:1033`），而 `run()` 整体包在 `withResumeLease`（`:394`）里，所以窗口**确实**被覆盖；但没有任何机制阻止未来入口在无 lease 时进入同一 claim/spawn 路径——`claimNextCapabilityExecution` 只保证 claim 原子性，不保证 lease。
  - 因此新增：`isResumeLeaseHeld(journalPath)`（lease 身份按 `leasePathFor` 重算，不同拼写/不同 journal 不算持有）；`LoopCapabilityEntry` 新增可选 `requireResumeLeaseJournal`，在 `execute()` 读 recovery **之前**（第一次持久化 claim 之前）断言持有该 journal 的 lease，否则 `STORE_BUSY` fail-closed；`runtime.ts` 装配该选项。
  - **可选而非无条件**：避免 8 个既有用例（直接构造 entry 的单元测试）被迫改写入 lease；生产入口是唯一装配点，且 T1/T4 双向证明守卫有效。这是有意权衡，请复审裁决是否要升级为无条件。
- **外部独立复审 prompt**：`docs/reports/c03-e-w6b1-independent-review-prompt.md`（整段交给另一个 agent；本 agent/子 agent 自审不算数）。复审 PASS 后才出 W6b1 pass-state 并进入 W6b2。
- **下一步 W6b2 = E4-T4 / W6b3 = E4-T5**（三个子波分别复审，Current User 2026-08-29 裁决）：W6b2 新增 `human_action_required` artifact kind（六合法码，`SWITCH_AGENT_REQUIRED`/`SHADOW_FALLBACK_REQUIRED` 非法，改 `loop-artifact-store.ts` 联合类型与 KINDS 数组**两处**）；W6b3 attempt workspace 三态（成功提升/失败隔离/未知副作用保留证据并阻塞），**本轮就接 wip digest 越界检测**。之后 W7=C-T1 全量只读复审 → C-T2 Current User 收口。**E5 真实 CLI canary / 让默认路径真 spawn 三 Agent 仍未授权，须另行裁决。**
- **v24 验证基线（W6b1 工作区实测）**：新测试单跑 **22 passed**；全套件 **144 文件 / failed_file_count=0 / exit=0**（注意：`Results: 1767 passed` 是**最后一个测试文件的内部计数**，不是全套件断言总数——runner 只按文件 exit code 判定，见观察项）；tsc `--noEmit` 干净；3 个 ruby validator exit=0；`git diff --check` 无空白问题。
- **本波自测反向探针（已实跑并还原）**：把 `loop-capability-entry.ts` 里的 `!isResumeLeaseHeld(...)` 改成 `false` → T1 立刻 `AssertionError` 转红；还原后 22 断言复绿。探针后 `git diff` 仅剩预期三文件。
- **给复审的提醒**：`runtime.ts` 本波有改动（+19/-8），与台账 §3.1「冻结生产文件零改动」的**历史批次**陈述不冲突（该陈述针对 `b842b18` 相对 merge-base），但复审时请单独确认这一处装配。
- **治理同步状态**：CP（ai-project-control-plane）main 已合 PR #21，`projects/ai-sdlc/STATE.yaml` 的 product_commit=`5b1855a`、route 为 implemented awaiting review。PKB（personal-knowledge-base）当前 IDLE 正确——W6a 属实现中、未收口，按 Exchange-only 入站边界**不在此阶段写 PKB**；Exchange→PKB publication 留到 C-T2 收口。

---


## 0. ⚠️ 开工第一坑：Node 版本（不读会误判全仓飘红）

- better-sqlite3 native 模块是用 **Node v24（NODE_MODULE_VERSION 137）** 编译的；默认 shell 的 **Node v20（ABI 115）会 ABI 不匹配**，所有 sqlite/store 测试假性 `STORE_FAILURE`。
- 历轮复审报告里"26 个 pre-existing 环境性失败"**全部源于此**，与代码无关。
- **跑任何测试前先切 v24**：
  ```bash
  export PATH="$HOME/.nvm/versions/node/v24.12.0/bin:$PATH"   # node -v 应为 v24.12.0
  ```
- v24 下事实基线：**全套件 143 文件 / 1767 断言 / 0 断言失败**（W6a，2026-08-29；文件数随新增测试增长，以顶部快照为准）。tsc 与 Node 版本无关。

## 1. 当前位置

- 分支：`feature/c03-e1-e4-runtime-implementation`
- 远端：`origin` = github.com/shaoyang01/ai-sdlc-standard（HTTPS）
- 远端：`origin` = github.com/shaoyang01/ai-sdlc-standard（HTTPS），**分支已 push、有上游**（下列"尚未 push"为 c3abf17 时点历史，已被顶部快照取代）。
- 主干是 `loop-runtime-v1`（不是 main）。
- **当前 HEAD 见顶部快照（W6a `5b1855a`）；以下提交链为 c3abf17 时点的早期历史，仅作背景。**
  - `c3abf17` E1/E2 **real capability gateway**（复用基类 tracing + E3/prompt role 感知）
  - `eb8b5c5` E1 canonical prompt builder
  - `f3586de` 本交接文档初版（可忽略历史）
  - `23f9880` 能力层 Round1 修复（B1 argv traversal + S1/S2/S3）
  - `494e5de` E3 node-output-envelope ｜ `3da342b` E1 production-entry parser
  - `a135a36` E2c runner MAX_TO→1800000 ｜ `898026c` E2b real-capability-adapter
  - `d37f7f2` merge loop-runtime-v1 ｜ `f5c4559` E2a agent-cli-profile（merge-base 内）

## 2. 已完成且已锁定（勿重做）

- **能力层 Round2 独立复审 = PASS**（23f9880）。五模块（agent-cli-profile / real-capability-adapter / loop-posix-process-runner 仅 MAX_TO / loop-production-entry / node-output-envelope）均死代码、仅 tests 引用。
- **集成层已完成两块（均死代码、未激活）**：
  - `execution/capability-prompt-builder.ts`：`buildNodeCapabilityPrompt`，哨兵/字段名 import 自 E3，单一事实源。
  - `execution/real-capability-gateway.ts`：`RealCapabilityGateway extends ExecutionGateway`，**只 override `executePrimary`**，复用基类唯一 tracing 状态机；导出纯函数 `buildCapabilityOutcome/isVerdictRole/isScanRole`。
- **冻结文件唯一改动**：`execution/gateway.ts` 的 `executePrimary` 由 `private` 改 `protected`（零行为变化）。
- role 传递的最终事实（推翻旧猜测）：role/attempt/runId 就在 `request.loopExecution` 里，boundRequest 保留它，**无需改基类签名、无需反推**。
- **role 感知细化**：E3 envelope 与 prompt 新增 role 视角——只有 solution-gate/**formal_verdict** 可出 verdict（`parseNodeOutputEnvelope(raw,cap,{isVerdict})`，默认行为不变）；**adversarial_scan 强制 NOT_APPLICABLE 但必须留 findings ledger**；code-review 留 findings；其他节点两者皆无。这与基类 `readCapabilityOutcome` 逐行对齐。
- 端到端验证用合法首节点 requirement-intake（recovery authority 强制节点顺序，solution-gate 在链尾不能对新 run 直接派发）。

## 3. 关键架构决策（Current User 已拍板）

- **Decision A（2026-08-28）**：E3 哨兵信封 `<!--@loop-output-begin/end-->` 是**唯一** agent I/O 契约。legacy 行标记（`GATE_RESULT:`/`UNRESOLVED_FINDINGS_JSON:`，在 codex-real-dispatch-*）随旧 sidecar 归档淘汰，新代码不得再发射；但**复用** `buildCapabilityTextArtifact`（已带 source:"execution_gateway"）造 canonical artifact。
- Q1 绑定：Kimi×4（intake/design/task-planning/knowledge-sync）、Codex（scan+implementation）、Hermes（verdict+code-review）。scan≠verdict firewall。
- AgentName === provider id === `kimi|codex|hermes`。§9：implementation 30min，其余 10min，runner 默认 120s 不变。
- 注意（**W1 `7f36b8d` 已对齐，本条为当时快照**）：本 HANDOFF 时点 `INITIAL_BINDING_REGISTRY`（冻结）intake 仍绑 codex，与 Q1 目标 kimi 不一致；W1 已将 INITIAL 按 Q1 八槽直返对齐（Kimi×4/Codex×2/Hermes×2），该 B1 缺口在 W1 复审 PASS 后闭合。原始风险记录：未对齐时真实 adapter 会抛 BINDING_MISMATCH（单测用 fake adapter 隔离此点）。

## 4. 下一步：接线（不是新写）+ 激活授权检查点

生产编排设施**已存在且巨大**，E1 编排 = 把 RealCapabilityGateway 接进去，而非另起：
- `core/loop-autonomous-delivery-loop.ts`（3707 行）、`core/loop-production-coordinator.ts`（1760）、`core/loop-git-workspace.ts`（989，LoopGitWorkspaceManager 真实 git/base/dirty preflight）、`runtime.ts`（853，`run()` 在 :288、`createRuntimeBindingRegistry` :196）。

动手顺序：
1. 先通读上述 4 文件，定位 production factory 现在如何选 gateway（deterministic/shadow），设计 real-vs-deterministic 选择开关（默认不得静默切 real）。
2. 接线：factory 用 `new RealCapabilityAdapter(new LoopPosixProcessRunner(...))` + `new RealCapabilityGateway(opts,{adapter,attemptWorkspace})`；cwd 由 LoopGitWorkspaceManager 的 attempt workspace 提供。
3. `scripts/loop-run.ts`：仅 `--request-file`（走 parseProductionEntryRequest）/`--resume`；closed 字段集，无 token/cmd/argv/env 承载。
4. **E4**：process evidence / recovery / lease / human-reason allowlist。
5. 旧 sidecar 与旧 spawn runner 归档（production factory 不再引用）。
6. 集成层独立全量复审（v24 跑）。

**治理检查点**：能力层 Round2 复审明确——集成缝合的**完成/激活**与 **E5 真实 CLI canary 属 Current User 单独裁决**。让默认路径真的 spawn 三个 Agent 前，必须拿到明确授权；真实 CLI 调用触发前再确认一次。

## 5. 治理边界（勿越界）

- 已完成模块当前全部死代码、未激活；除 runner MAX_TO 与 gateway protected 化外不碰 C02 冻结生产逻辑。
- **E5 真实 CLI canary 未授权**：fake adapter 只证明组合逻辑，E2-P 只证明 CLI 可达，三者证据不互替。
- 无远程 Git 副作用、无业务仓写入、无发布、无 Agent CLI 真实调用（除非 Current User 授权）。
- H3 归属 C03-B 不转移；WP1～WP4/C01 已收口行为除非直接破坏否则不动。
- 新文档/代码勿引入 RETIRED_PATH_TERMS（DIRECT_IMPLEMENTATION / Development Path Decision 等）。

## 6. 验证命令（务必先切 v24，见 §0）

```bash
export PATH="$HOME/.nvm/versions/node/v24.12.0/bin:$PATH"
npx tsc --noEmit
for t in agent-cli-profile real-capability-adapter loop-posix-runner-timeout-bound \
         loop-production-entry node-output-envelope capability-prompt-builder \
         real-capability-gateway loop-posix-process-runner; do
  ./node_modules/.bin/tsx tests/$t.test.ts
done
npm test                                   # v24 下应 143 文件 / 0 断言失败（并行偶发文件级 FAILED 隔离单跑即绿）
ruby scripts/validate-skill-contracts.rb
ruby scripts/validate-capability-metadata-chain.rb
```

续作第一步：切 v24 → 读本文件 → `git log --oneline -10` → 通读 §4 四个既有编排文件再动手接线。
