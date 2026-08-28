# C03-E E1～E4 Runtime 实施 — 集成层交接（HANDOFF）

> 最后更新：2026-08-28（EDT）。供中断后新会话/新 Agent 无缝续作。只读事实 + 明确下一步，勿凭印象改。

## 0. ⚠️ 开工第一坑：Node 版本（不读会误判全仓飘红）

- better-sqlite3 native 模块是用 **Node v24（NODE_MODULE_VERSION 137）** 编译的；默认 shell 的 **Node v20（ABI 115）会 ABI 不匹配**，所有 sqlite/store 测试假性 `STORE_FAILURE`。
- 历轮复审报告里"26 个 pre-existing 环境性失败"**全部源于此**，与代码无关。
- **跑任何测试前先切 v24**：
  ```bash
  export PATH="$HOME/.nvm/versions/node/v24.12.0/bin:$PATH"   # node -v 应为 v24.12.0
  ```
- v24 下事实基线：**全套件 137 文件 / 1767 断言 / 0 failed**（elapsed ~248s）。tsc 与 Node 版本无关。

## 1. 当前位置

- 分支：`feature/c03-e1-e4-runtime-implementation`
- 远端：`origin` = github.com/shaoyang01/ai-sdlc-standard（HTTPS）
- **该分支尚未 push、无上游**；续作先 `git fetch` 确认远端是否已建分支。
- 主干是 `loop-runtime-v1`（不是 main）。
- HEAD = `c3abf17`。提交链（新→旧）：
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
- 注意：`INITIAL_BINDING_REGISTRY`（冻结）当前 intake 仍绑 codex，与 Q1 目标 kimi 不一致；production wiring 时必须让 registry 与 Q1 对齐，否则真实 adapter 会抛 BINDING_MISMATCH（单测用 fake adapter 隔离了此点）。

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
npm test                                   # v24 下应 137 文件 / 0 failed
ruby scripts/validate-skill-contracts.rb
ruby scripts/validate-capability-metadata-chain.rb
```

续作第一步：切 v24 → 读本文件 → `git log --oneline -10` → 通读 §4 四个既有编排文件再动手接线。
