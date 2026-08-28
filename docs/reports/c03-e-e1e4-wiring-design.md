# C03-E E1～E4 接线设计（Wiring Design）

> 状态：Current User 2026-08-28 裁决方向（Decision-073）——**路径 B 为唯一生产
> 路径，路径 A 冻结退役**；本文据此更新。
> 日期：2026-08-28｜分支：`feature/c03-e1-e4-runtime-implementation`
> 依据：Decision-071 授权、Decision-072 追认、规划 §6/§9、任务集
> `docs/reports/c03-e-e1e4-task-set-and-gate-audit.md`、HANDOFF
> `docs/reports/c03-e-e1e4-integration-handoff.md`。
> 本文所有"现状"断言均带文件:行号证据，可复核；设计选择不改变授权边界
> （默认 shadow、不激活真实 Agent、E5 另行授权）。

## 1. 现状：生产路径与 canonical 路径是两套实现

| | 路径 A：现行生产链（D0x 微内核） | 路径 B：canonical 七节点图 |
| --- | --- | --- |
| 入口 | D08 `loop-requirement-design-orchestrator.ts`（2483 行，需求→设计→路由） | `runtime.ts` `run()`（853 行），仅被 `scripts/codex-runtime-real-smoke.ts` 引用 |
| 编排 | D09 `loop-production-coordinator.ts` → D06 `loop-autonomous-delivery-loop.ts`（3707 行） | 持久化图解释器：recovery→dispatch claim→`LoopCapabilityEntry`→gateway |
| Agent 能力来源 | D05 `loop-codex-implementation-adapter.ts:526`、D06 plan step `:1199` 直 spawn；**Codex 单 Agent** | `ExecutionGateway`（deterministic shadow），装配点 `runtime.ts:325-328` |
| 多 Agent | 无 | binding 注册表 24 绑定（8 节点×3 Agent），但 `enabled: agent === "codex"`（`agent-capability-bindings.ts:280`）——**kimi/hermes 全 disabled** |
| 恢复/Re-Gate | delivery loop fix-rounds | journal 恢复、attempt CAS、producer revision、Re-Gate round 预算（更完整） |
| 外围 | D03 workspace、governance tail、publisher（`loop-delivery-publisher.ts` 三处 spawn 是 Git 操作） | 不具备 workspace 准备/发布/文档治理 |

新 Real 模块（profile/adapter/gateway/envelope/prompt-builder）已就位且生产零引用；
`RealCapabilityGateway` 只 override `executePrimary`，canonical 节点走
prompt→adapter→E3 信封→artifact，非 canonical 请求回落基类。

**结论（Current User 2026-08-28 裁决，Decision-073）**：路径 B 是 Q1 三 Agent
canonical 目标架构，定为**唯一生产路径**；路径 A 是第一版 sdlc-* skills 时期的
早期 D0x 内核，当前无生产入口、未投产，**整体冻结退役**（不再演进、新代码零依赖、
不被任何新 factory 选中）。需精确区分：A 的**编排骨架与 Agent 直驱**（D08 路由、
D09 coordinator、D06 fix 循环、D05 codex adapter、各 spawn runner）冻结退役；
A 的**外围能力**（D03 workspace、publisher 的 Git 交付、governance tail）是 B 成为
完整生产路径所必需的，由 B 侧继承/复用，不随编排链一起废弃。物理删除分批：
本期冻结 + B 接线，删除在 B 外围补齐、E5 canary 用真实证据验证后进行。

## 2. 设计目标与边界

- 默认能力来源 = deterministic shadow；任何既有测试/脚本/生产默认行为零变化。
- real 能力来源只能由生产入口显式选择；自动证据仍只用 fake runner，不触真 CLI。
- 路径 A 冻结退役：不演进、新代码零依赖；本期做冻结标注与引用切割，物理删除分批。
- 不授权：真实 spawn 激活、E5 canary、业务仓远程 Git/发布。

## 3. 核心决策：能力来源开关（capabilitySource）

在 `runtime.ts` run 选项增加显式、封闭的能力来源选择：

```text
capabilitySource: "deterministic"（默认） | "real"
```

- `deterministic`：现状 `createDeterministicCapabilityGateway(...)`，行为不变。
- `real`：构造 `RealCapabilityGateway(baseOptions, { adapter, attemptWorkspace })`；
  `adapter = new RealCapabilityAdapter(agentCliProfiles, posixRunner)`，
  `attemptWorkspace` 由生产入口注入（解析到本次 attempt worktree 的 cwd）。
- 选择逻辑集中在**一个**工厂函数 `createCapabilityGateway({source,...})`，
  `runtime.ts:325` 改为消费它；禁止散落判断。
- 辨析两个 "real"：`ProductionEntryRequest.mode === "real"`（E1-T1，指"真实运行
  请求"，区别于 dry-run）与 `capabilitySource`（能力来源）正交——前者是请求身份，
  后者是节点能力从哪来，代码中不得混用同一变量。
- 防静默：`real` 选择必须同时满足（a）显式 flag、（b）binding 注册表为 Q1 形态、
  （c）attemptWorkspace 可解析；任一不满足 fail-closed，不回落 shadow。

## 4. 生产入口 `scripts/loop-run.ts`（E1-T3）

- 仅解析 `--request-file <path>` / `--resume <identity>`，加 `--capability-source
  deterministic|real`（默认 deterministic）；不承载业务判断。
- 请求经 `parseProductionEntryRequest`（mode=real、expectedBaseSha 40 位、绝对路径、
  封闭字段）；组装真实 `LoopRunStore`/`LoopArtifactStore`、Q1 binding 注册表、
  §3 工厂 gateway、D03 attemptWorkspace 解析器，调 `run()`。
- 无 token/cmd/argv/env 承载面；未知 flag/字段 fail-closed。
- 输出封闭结果集（run identity、final/chain status、next point、trace 摘要、
  journal 路径），不打印 stdout 原文/环境。
- 进程退出后可用同一 `--resume` identity 继续（E1 验收）。

## 5. `runtime.ts` 消费真实 identity（E1-T4）

- run() 现自造 identity；扩展为可接受来自 ProductionEntryRequest 的
  `LoopRunIdentity`（repository/base SHA/source provenance），并在 spawn 前
  preflight：base drift、dirty source、重复 run、并发 resume、非法路径、未知字段
  全部 fail-closed（部分既有，补 production 分支）。
- 现 `run()` 保留为测试/兼容入口，重命名/注释标明 non-production；生产路径只经
  `runProduction()`（或 loop-run 专用封装），二者共享图解释器内核不复制。

## 6. Q1 binding 对齐（E2-T8，blocker B1）

`agent-capability-bindings.ts:280` 的选择器由 `agent === "codex"` 改为 Q1 映射：

| 节点 capability/role | Agent |
| --- | --- |
| requirement-intake / solution-design / task-planning / knowledge-sync | **kimi** |
| adversarial-scan / implementation | **codex** |
| formal-verdict（solution-gate）/ code-review | **hermes** |

- 以一张 `Q1_SLOT_AGENT` 常量表驱动 `enabled`，加 8 槽×3 Agent 矩阵测试
  （恰好一个 enabled、其余 disabled、role firewall 不漂移）。
- deterministic 下此改动只影响记录不影响行为；它是 real 激活的前置，不是激活本身。

## 7. 路径 B 唯一化与路径 A 冻结退役（E2-T7，Decision-073）

**冻结退役清单（A 的编排与 Agent 直驱，本期冻结、分批物理删除）**：

| 对象 | 文件 | 本期处置 |
| --- | --- | --- |
| D08 需求/设计路由 | `core/loop-requirement-design-orchestrator.ts`（2483 行） | 冻结标注；其需求引导职责由 B 的 requirement-intake 节点承接 |
| D09 coordinator | `core/loop-production-coordinator.ts`（1760 行） | 冻结标注；loop-run 直接组装 B 链，不经 coordinator |
| D06 delivery loop | `core/loop-autonomous-delivery-loop.ts`（3707 行） | 冻结标注；fix 循环由 B 的 Re-Gate 机制承接 |
| D05 codex adapter | `core/loop-codex-implementation-adapter.ts` | 冻结；Agent 能力来源唯一为 canonical gateway |
| 自定义 spawn runner | D05 `:526`、D06 `:1199`、`execution/hermes-cli-command-executor.ts:259`、Kimi sidecar、`codex-real-dispatch-runner` | W4 先出引用图确认对象，再冻结标注；新 factory 零引用 |

**继承复用清单（A 的外围能力，B 成为完整生产路径所必需，不废弃）**：

- D03 `loop-git-workspace.ts`：attempt workspace 准备/隔离，经 `attemptWorkspace` 注入 Real gateway。
- publisher 的 Git 交付（commit/PR，`loop-delivery-publisher.ts` 三处 spawn 是 Git 操作非 Agent 来源）：adapter 无 Git 权限，发布作为 B 链完成后的独立环节保留，接口形态在 W3 后定。
- governance tail：B 末尾已产 `governance_tail_result`（`runtime.ts:820`），执行器侧复用既有 tail 能力。

**物理删除条件**：B 外围（需求入口、发布、tail 接缝）补齐且 E5 canary 用真实证据
验证 B 可端到端交付后，另出删除决策；本期不删 A 代码、不改 A 测试行为。

## 8. E4 持久恢复与人机边界（接线后）

- process evidence artifact：invocation/process/staging/promotion/human-action 固定
  字段，`RealCapabilityAdapter` 已产生 invocationId/process 结果，扩展
  `LoopRunStore` append/readback schema（E4-T1）。
- recovery 五分类、resume lease 覆盖 claim→spawn→terminal（既有
  `withResumeLease` 扩展）、attempt workspace 三态、`human_action_required` 六合法
  reason code（`SWITCH_AGENT_REQUIRED`/`SHADOW_FALLBACK_REQUIRED` 非法）。

## 9. 不激活保证（授权边界）

合入后：默认路径 100% deterministic；`--capability-source real` 代码可达但自动测试
全部以 fake runner 验证，**不发起任何真实 CLI/模型请求**。默认路径真实 spawn 三
Agent 的激活与 E5 canary 仍须 Current User 另行单独授权（Decision-072 已明确）。

## 10. 实施顺序（对应任务集）

1. **W1** Q1 映射 + 矩阵测试（E2-T8，独立小改）
2. **W2** `createCapabilityGateway` 开关 + Real 装配（deterministic 默认，零行为变化）
3. **W3** `loop-run.ts` + production identity/preflight（E1-T3/T4）
4. **W4** A 链冻结标注 + spawn runner 引用图与冻结（E2-T7/Decision-073，新代码零引用）
5. **W5** E3-T2 九类无效输出"不推进"端到端负向测试
6. **W6** E4-T1～T5
7. **W7** Node v24 全量 + 独立全量只读复审（C-T1）→ Current User 收口（C-T2）

每步独立可测、可回滚；W2/W3 合入后生产默认行为不变是硬性验收。

## 11. 开放问题（实施时按证据闭合，不擅自决定）

- "三个自定义 spawn runner"的精确对象以 W4 引用图为准（§7）。
- attemptWorkspace 与 D03 workspace manager 的接缝形态（复用 vs 新解析器）在 W3
  读 `loop-git-workspace.ts` 后定，优先复用。
- A 链物理删除：B 外围补齐 + E5 canary PASS 后另出删除决策（Decision-073 已定方向）。
