# LOOP-CORE-C03-E 详细规划：Real Multi-Agent Autonomous Dispatch

> 规划状态：**ACCEPTED**
>
> 规划版本：**0.3.0**
>
> 日期：2026-08-27
>
> 规划裁决：Current User 已接受本方案及 Q1～Q7 推荐值（Decision-063）；本裁决不是实施授权。
>
> 深度状态：**DEEP / CURRENT_USER_RISK_ACCEPTED_WITHOUT_DUAL_BINDING_GATE**。Current User 明确选择直接通过方案并接受本轮不调用双 Agent 执行 Solution Gate 的剩余风险。
>
> 禁止事项：方案通过不授权修改运行时代码、调用任何 Agent CLI、创建 C03-E 实现分支/实现 PR、启动 E0～E5 或下一轮 C05，也不授权业务仓 commit/push/PR/merge/release。

## 1. 文档定位与目标

本文件把 C05 暴露的 Parent Core 缺口收敛为一个可审阅、可独立授权的 C03-E 详细方案。
用户只向任一已支持入口提交一次需求；LOOP runtime 随后成为 run owner，按 immutable
binding 自动调用真实 Kimi、Codex、Hermes CLI，校验输出、持久化机器证据、自动推进与
Re-Gate，并最终停在以下三个终态之一：

1. `READY_FOR_MANUAL_GIT_HANDOFF`；
2. 只有用户才能补齐业务事实、作风险裁决或授予外部副作用权限的 `blocked`；
3. 带可恢复证据的 `failed`。

正常路径不得要求用户为推进流程而机械切换 Agent。runtime 不拥有业务仓远程 Git 交付
权限；本项目也不使用 `sdlc-docflow-writer`、manifest 或 Gate 方法治理自身。

### 1.1 本稿交付什么

- 经当前 Source 核验的现状与缺口；
- 生产入口、真实 adapter、输出校验、journal、恢复和人工边界的统一系统模型；
- E0～E5 的有界工作项、目标代码面、依赖、验收与负向证据；
- 编码前数据场景、风险、迁移顺序和 Current User 裁决结果；
- Solution Gate 风险接受与后续 Task Gate 的明确停驻条件。

### 1.2 本稿不交付什么

- 本轮不生成可直接执行的 `sdlc-task-planning` 任务集；实施授权尚未成立，Task Gate 继续关闭；
- 不实现或试跑任何 adapter；不探测 CLI 版本、登录态、凭据或命令参数；
- 不重开 `wms-monitor/20260827-dashboard-page`；其线下测试仍是非阻塞后续工作；
- 不实现 Personal-KB 投影；它属于 `LOOP-ADVANCED-04`。

## 2. 上游权威与当前事实

### 2.1 权威输入

- [Decision-060](decisions/Decision-060-c05-closure-and-autonomy-replan.md)：业务与人工链
  PASS，Core autonomy `CHANGES_REQUESTED`，受控新增 C03-E；
- [LOOP Core Roadmap](AI-SDLC-Autonomous-Delivery-Roadmap.md) v2.3.3 的
  `LOOP-CORE-03` / `LOOP-CORE-05`；
- [LOOP Core Contract](LOOP_CORE_CONTRACT.md) 的七节点、binding、Re-Gate、恢复与人工
  Git 边界；
- C03-A～D 已收口事实与 C02 的 artifact revision、finding lifecycle、recovery、CAS
  和 role firewall 合同；
- 产品事实基线：`feature/loop-runtime-v1@80816ebd938aef59846ecf0c752ff73a82aae4d3`。

### 2.2 Source 核验结果

| 面 | 当前事实 | C03-E 影响 |
| --- | --- | --- |
| `runtime.ts` | `run(requirement, options)` 能自动遍历八个 execution point，但默认创建临时假仓库 identity，默认调用 deterministic traced gateway | 不能作为真实目标仓生产入口；E1 必须引入真实仓库/来源/工作区身份 |
| `execution/gateway.ts` | canonical dispatch 已有 started/terminal tracing 与 output contract 校验；默认仍是 shadow | 复用 tracing 边界，但生产 factory 必须 fail-closed 地选择 real adapter |
| Codex | canonical capability 可在多条件 flag 下走 real runner；现有 parser 主要面向 `code_patch`，仍带 `shadow_fallback` 旧语义 | E2 需要统一节点输出协议，删除生产 fallback 语义 |
| Kimi | command executor 可真实 spawn，但 gateway 只在 `llm_task` 路径尝试；canonical capability 不会成为真实主结果 | E2 需要接入 canonical capability 主路径 |
| Hermes | command executor 可真实 spawn；gateway 当前把 real dispatch 作为 sidecar，primary result 不受它决定 | E2 需要正式主路径，不能以 sidecar 证明节点完成 |
| 进程执行 | Kimi/Hermes/Codex 各自 runner 与已有 `LoopPosixProcessRunner` 并存，超时清理、环境、输出上限语义不一致 | E2 统一到一个受控 process runner 与 provider profile |
| binding | 8 execution point × 3 Agent 的 immutable matrix 已存在；当前默认多数点为 Codex，formal verdict 替换为 Hermes | E2 只改变 Accepted binding snapshot，不把 Agent 写进 node contract |
| journal | capability event v4 已记录 binding、adapter/version、attempt、input/output digest、Gate 与 depth | E4 需补 process invocation/exit/signal/duration/truncation、staging/promotion 和人工暂停证据 |
| recovery | interrupted started attempt 会关闭后重试；revision materialization、Re-Gate、CAS 与 resume lease 已存在 | 真实 Agent 可能已改工作区，不能沿用“无副作用即可重试”的假设；E4 必须隔离 attempt |
| active Skill references | `sdlc-solution-gate` references 仍输出 `DIRECT_IMPLEMENTATION` / `SPECKIT_PIPELINE_REQUIRED` | E0 必须在任何实现入口前清理并加门禁 |
| capability metadata | `skill-flow-inventory.json` 仍含 `main_docflow`、Direct fork、双 Gate 角色同 Agent 等旧事实；`runtime-capabilities.json` 也保留大量 shadow/未接线描述 | E0 必须区分 active authority、历史 archive 与机器事实，并校准活动 metadata |

### 2.3 已有能力的复用边界

必须复用：

- `LoopRunStore`、`LoopArtifactStore`、`LoopCapabilityEntry`、`loop-recovery`；
- immutable `BindingRegistry` 与 solution-gate 双 binding firewall；
- artifact revision、finding lifecycle、Re-Gate、resume lease、dispatch claim/CAS；
- `LoopPosixProcessRunner` 的 executable allowlist、`shell:false`、有界 stdin/stdout/stderr、
  process-group timeout cleanup；
- `LoopGitWorkspaceManager`、patch artifact/application 和 C03 Delivery Tail 的人工 handoff
  语义。

不得复用为生产成功依据：

- deterministic/shadow adapter、shadow sidecar、旧 skill-flow shadow orchestrator；
- 只写内存或只写 Markdown 的 adapter audit；
- `DIRECT_IMPLEMENTATION` / `SPECKIT_PIPELINE_REQUIRED` 分流；
- 执行者自述、旧 CI、fake runner 或单个 CLI canary 代替整条 runtime journal。

## 3. 目标系统模型

```text
loop-run request file / resume command
  -> Production Entry Preflight
       - exact request schema
       - real repository/base SHA/worktree identity
       - source provenance + artifact digest
       - Accepted binding/profile snapshot
       - real mode only (no implicit shadow)
  -> runtime run owner + resume lease
  -> recover / derive next execution point
  -> immutable binding lookup
  -> Real Capability Gateway
       -> provider profile (kimi | codex | hermes)
       -> attempt-isolated staging/worktree
       -> bounded process runner (argv array, shell=false)
       -> strict result normalization
  -> output/schema/path/digest/workspace validation
  -> append terminal event + promote accepted output atomically
  -> advance | Re-Gate | recoverable blocked/failed
  -> Delivery Tail
  -> READY_FOR_MANUAL_GIT_HANDOFF
```

### 3.1 权威关系

- runtime 是唯一 run owner、推进者和恢复权威；Agent/Skill 只产生节点内容。
- binding snapshot 决定 `(capability, executionRole) -> agent/profile`，一次 run 内不可漂移；
  发生替换必须形成新的 registry version，并由恢复逻辑验证历史 attempt 的旧 binding。
- Agent 的退出码、文本或“已完成”声明都不产生节点 authority；只有 runtime 验证并写入
  terminal event、artifact revision 后才成立。
- 生产入口不得接受任意注入 gateway；测试入口仍可显式注入 fake/shadow，但其结果必须
  标记为 `NON_ACCEPTANCE_EVIDENCE`。

### 3.2 建议首版 binding（待 Q1 裁决）

| Execution point | 建议 Agent | 原因 |
| --- | --- | --- |
| requirement-intake / primary | Kimi | 长文本来源整理与中文需求入口 |
| solution-design / primary | Kimi | 保持需求上下文连续，负责方案起草而不裁决 |
| solution-gate / adversarial_scan | Codex | 对代码/合同攻击面做对抗扫描 |
| solution-gate / formal_verdict | Hermes | 与 scan 不同 binding，独立裁决和 depth |
| task-planning / primary | Kimi | 将已过门方案转成可执行任务，不新增语义 |
| implementation / primary | Codex | 受约束代码实现和 patch 产出 |
| code-review / primary | Hermes | 与实现者分离，审查合同和实现证据 |
| knowledge-sync / primary | Kimi | 汇总稳定事实并执行受约束知识同步 |

此矩阵只是一份待接受的初始 snapshot。首版不做基于分数、memory 或运行时偏好的动态路由。

## 4. 稳定数据合同候选

以下结构用于评审字段、攻击面和恢复语义；字段名在规划 Accepted 前仍可调整。示例中的
路径、SHA 和 digest 均为模拟数据，不是本轮真实执行记录。

### 4.1 Production Entry Request v1

```json
{
  "schema": "loop-production-entry:v1",
  "requirementId": "REQ-20260827-001",
  "repository": "wms-monitor",
  "repositoryPath": "/workspace/wms-monitor",
  "baseBranch": "feature/dev_20260821_task_center",
  "expectedBaseSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "taskBranch": "loop/REQ-20260827-001",
  "controlRoot": "/workspace/.loop-control/REQ-20260827-001",
  "sourceFiles": ["/workspace/input/requirement.md"],
  "bindingRegistryVersion": "3",
  "executionProfileVersion": "1.0.0",
  "mode": "real"
}
```

边界：

- 入口读取受限 request file 或 stdin JSON，不把用户字符串重建成 shell source；
- 必须绑定真实 repository/base SHA；base 漂移、dirty source checkout、路径越界或 source
  digest 不一致时，在首次 Agent 调用前失败；
- `mode=real` 是生产入口唯一合法值；dry-run 使用单独命令和单独证据类型；
- request 不携带 token、API key、任意命令、任意 argv 或任意环境变量值。

### 4.2 Capability Invocation Envelope v1

```json
{
  "schema": "loop-capability-invocation:v1",
  "invocationId": "run-001:solution-design:primary:1",
  "runId": "run-001",
  "requirementId": "REQ-20260827-001",
  "capability": "solution-design",
  "executionRole": "primary",
  "attempt": 1,
  "bindingId": "binding-kimi-solution-design-primary",
  "bindingVersion": "2.0.0",
  "adapterProfile": "kimi-cli@1.0.0",
  "skill": {
    "name": "sdlc-solution-design",
    "path": "skills/sdlc-solution-design/SKILL.md",
    "digest": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  },
  "input": {
    "artifactRef": "loop-artifact:v1:requirement_summary:sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    "version": "1.0.0",
    "digest": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  },
  "output": {
    "stagingPath": ".loop-attempts/run-001/solution-design/1/result.json",
    "expectedArtifactKind": "technical_design"
  },
  "writeBoundary": ["library/REQ-20260827-001/01-技术方案/**"],
  "timeoutMs": 600000
}
```

约束：

- envelope 由 runtime 构造，Agent 无权改变 identity、binding、attempt、输入 ref/digest、
  write boundary 或预期 output kind；
- prompt 通过 stdin 发送；provider argv 来自版本化 profile，不接受 requirement 拼接；
- Skill 正文与必需 references 由 runtime 读取、计算 digest 并纳入输入；不依赖 Agent 自行
  “发现正确 Skill”；
- 输入大对象使用 content-addressed ref，journal 不保存原始 prompt、业务正文或凭据。

### 4.3 Capability Result Envelope v1

```json
{
  "schema": "loop-capability-result:v1",
  "invocationId": "run-001:solution-design:primary:1",
  "status": "succeeded",
  "artifact": {
    "kind": "technical_design",
    "stagedPath": "library/REQ-20260827-001/01-技术方案/technical-design.md",
    "version": "1.0.0",
    "digest": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
  },
  "findings": null,
  "safeSummary": "technical design produced"
}
```

runtime 只接受 exact-key、版本化、大小有界的单一 JSON 文档。退出 0 但缺字段、额外字段、
旧 schema、错 kind、错路径、错 digest、输出截断或 workspace 越界，一律是
`OUTPUT_CONTRACT_VIOLATION`，不得推进。

### 4.4 Process Terminal Evidence v1

journal 需在现有 capability event v4 之外绑定或升级出以下固定标量：

- `invocationId`、provider profile/version、resolved executable identity/version digest；
- `spawnedAt`、`finishedAt`、duration、exit code、signal、timeout；
- stdout/stderr received bytes、truncated flags、sanitized summary digest；
- attempt staging/worktree snapshot before/after digest；
- output envelope ref/digest、promotion state；
- terminal classification、retryable、next action、human-action reason code。

不进入 journal：原始 prompt、完整 stdout/stderr、凭据、环境变量值、补丁正文或业务全文。

### 4.5 Provider Profile v1

每个 provider profile 固定：

- executable ID 与解析规则，禁止 request 提供任意 command/path；
- 静态 argv 模板、stdin transport、non-interactive mode、cwd 规则；
- 允许继承的环境变量**名称**，绝不记录值；
- timeout/stdout/stderr/stdin 上限；
- capability 支持矩阵与写权限模式；
- output normalizer 与版本；
- “不可证明安全的 CLI 参数/权限模式 = provider unavailable”，不得放宽后继续。

本规划不猜测本机各 CLI 的实际版本或最终 argv。精确 profile 只能在后续受授权的 E2
实现中按已有合同编码，并在单独授权的 E5 real canary 中验证；本轮不调用 CLI。

## 5. 工作区、产物与恢复模型

### 5.1 Attempt 隔离

每次外部 Agent 调用都必须拥有独立 attempt staging：

- requirement/design/gate/task/review/knowledge 节点写入 attempt staging，验证后才 promotion
  到 Requirement 的稳定路径；
- implementation 使用受控 task worktree；Agent 修改后先生成 workspace diff/status digest，
  再由 runtime 验证 allowed paths 和 patch artifact，禁止直接宣告完成；
- failed、timed out、truncated、invalid 或 interrupted attempt 的 staging 不得成为 current
  artifact，也不得被下游消费；
- promotion 必须和 terminal event/producer revision 保持可恢复的一致顺序，沿用现有
  pending revision materialization 机制，不建立第二套状态机。

### 5.2 中断窗口

| 中断位置 | 恢复动作 |
| --- | --- |
| started event 前 | 无 attempt authority；重新 derive/claim |
| started 后、进程未 spawn | 关闭为 `ATTEMPT_INTERRUPTED`，安全重试 |
| 进程运行中、无 terminal | 先确认旧进程/进程组已终止，再检查 attempt staging/worktree；不可直接再 spawn |
| 结果文件已写、未验证 | 重新做 exact schema/path/digest/workspace 验证，不相信 stdout 自述 |
| 已验证、terminal 未提交 | 以 immutable staging digest 进行幂等 terminal/promotion 恢复；禁止重新调用 Agent |
| terminal succeeded、revision 未落地 | 沿用 pending revision materialization 幂等补写 |
| revision 已落地、进程退出 | 从 recovery pointer 进入下一 execution point，不重做节点 |

### 5.3 Retry 与 fallback 候选

首版建议：

- 不允许任何 real -> shadow fallback；
- 不做自动跨 Agent 替换，以免绕过 Accepted binding 和 role separation；
- 只有 spawn 前失败或证明 attempt staging/worktree 未产生变化的 retryable 基础设施失败，
  才允许同一 binding 自动重试一次；
- timeout、进程失联或存在 workspace 变化时，先走恢复核验，不盲重试；
- 语义不合格输出不是 provider fallback 条件：方案/审核 finding 走 Re-Gate，结构不合格
  留在当前 execution point 重试或阻塞；
- 达到 attempt/时间/Re-Gate budget 后输出机器可恢复 `blocked`，不要求用户切换 Agent。

该策略需要 Q2/Q3 接受后才能成为实施合同；当前 `retry_other_binding` 不直接沿用到生产。

## 6. E0～E5 详细工作项

本节 ID 是方案条款，不是已过 Task Gate 的执行任务。E0～E4 建议作为**一个实施包、一个
实现分支、一次完整独立复审**；E5 使用单独授权和单独证据面。

### E0 — Active Contract Preflight

**目标**：先让活动合同只表达单轨七节点 + depth，不让 runtime 按旧 Direct/Speckit 语义
启动实现。

| 条款 | 目标面 | 动作 | 验证 |
| --- | --- | --- | --- |
| E0.1 | `skills/sdlc-solution-gate/references/**` | 删除 Direct/Speckit path decision，只保留 Finding Ledger、PASS/FAIL/PASS_WITH_RISK、LIGHT/STANDARD/DEEP 与 Re-Gate | active reference 旧术语零命中 |
| E0.2 | `metadata/capabilities/shared/skill-flow-inventory.json` | 改为单轨 7+1、双 Gate role 不同 binding、runtime-invoked 当前事实；历史 flow 移 archive 而非继续活动消费 | metadata parser + topology assertions |
| E0.3 | `runtime-capabilities.json` | 校准 shadow/real/adapter/wiring 事实；机器字段不得声称未实现或已启用的相反状态 | runtime capabilities tests |
| E0.4 | `scripts/validate-skill-contracts.rb` 及必要的 metadata validator | 从 manifest 的 active references 闭包扫描退役 ID、旧路由字段和 role firewall 漂移 | rehashed tamper/mutation negative tests |
| E0.5 | active tests | 删除把 Direct stage 当成功条件的 active assertions；历史 archive 测试不进入生产门禁 | CI standards/typecheck/tests 全绿 |

E0 不改 runtime dispatch 行为，不删除历史 Decision/报告中的历史提及。

### E1 — Production Entry and Run Ownership

**目标**：提供真实仓库的一次启动/恢复入口，由 runtime 持续推进，不由聊天持有 run。

候选目标面：

- 新增 `core/loop-production-entry.ts`：exact request schema、preflight、identity 与 store wiring；
- 新增 `scripts/loop-run.ts`：只解析 `--request-file` / `--resume`，不承载业务判断；
- 扩展 `runtime.ts`：消费真实 `LoopRunIdentity` 和已构造 production gateway；保留当前
  `run()` 作为测试/兼容入口但明确标记非生产；
- 更新 `package.json` 仅新增本地入口命令，不执行远程 Git；
- 新增 production-entry 契约与恢复测试。

E1 验收：

- fresh run 必须绑定真实 repository/base SHA/source provenance；
- resume 只按 requirement/run identity 与 journal 恢复，不能用新聊天文本覆盖已确认来源；
- production entry 无 gateway/shadow/command/env 任意注入面；
- base drift、dirty source、重复 run、并发 resume、非法路径、未知字段均在 Agent spawn 前
  fail closed；
- 前台进程退出后可以用同一 request/resume identity 继续。

### E2 — Real CLI Adapters and Production Gateway

**目标**：三个 Agent 均通过统一 provider profile 和受控 runner 成为 canonical capability
的真实主结果。

候选目标面：

- 新增 `execution/agent-cli-profile.ts`：Kimi/Codex/Hermes profile、能力矩阵和 bounds；
- 新增 `execution/real-capability-adapter.ts`：统一 invocation/result envelope；
- 新增 `execution/real-capability-gateway.ts` 或在 `execution/gateway.ts` 增加单一 real
  canonical route；不得并存第二套 tracing/推进状态机；
- 统一复用 `core/loop-posix-process-runner.ts`，淘汰生产路径上的三个自定义 spawn runner；
- 改造现有 Kimi/Hermes sidecar/contract-only 路径为主 adapter，保留兼容代码只能作为
  archive/测试，不能被 production factory 选中；
- Codex 旧 `shadow_fallback` parser 语义改为 fail closed；
- adapter 输出严格转换为 canonical `ExecutionResult`，仍由 Gateway 做 artifact kind、
  finding、Gate role 和 tracing 校验。

安全边界：

- `spawn(executable, argv, {shell:false})`；无 `sh -c`、无拼接命令、无 eval；
- executable 来自 allowlist/profile，不来自 request；动态需求只走 stdin；
- process group 超时先 TERM 后 KILL，清理失败必须阻塞恢复；
- stdout/stderr 有界并在内存中清洗，原文不进 journal；疑似凭据或 prompt 回显 fail closed；
- cwd 固定 attempt worktree/staging；provider 无可证明的 non-interactive/workspace 边界时
  标记 unavailable；
- adapter 无 commit/push/PR/merge/release 权限。

E2 验收：fake process runner 覆盖三个 profile 的成功、缺命令、非零退出、signal、timeout、
截断、泄密、malformed result 和 cleanup failure；本包不以 fake 结果声称 real CLI 可用。

### E3 — Output Validation, Automatic Progression and Re-Gate

**目标**：只有当前 binding 的合格输出才能提升为 current；finding 自动回流最早节点。

候选目标面：

- 扩展 canonical node output validator：exact schema、artifact kind、stable path、version、
  digest、producer invocation、input binding、generation、allowed write set；
- 为 solution-gate 固化：scan 必写 ledger（即使空），verdict 必须由不同 binding 消费同一
  ledger，并输出 materialized depth；
- 为 task-planning 固化：仅消费 Accepted solution + verdict；未过门时 Task Gate 关闭；
- 为 implementation 固化：workspace diff 只含任务允许路径，implementation record 与
  patch/workspace digest 一致；
- 为 code-review 固化：blocking finding 路由到最早受影响节点，方案缺口不得只在代码层修；
- 为 knowledge-sync 固化：只同步稳定事实，冲突留 blocked；
- 复用现有 finding lifecycle、artifact revision、Re-Gate invalidation 与 dispatch permit。

E3 验收：exit 0 + invalid output、旧 input、错 generation、伪造 digest、错 Agent、同 Agent
双 Gate role、stale revision、未闭合 finding、越界写文件等全部证明“不推进”。

### E4 — Durable Recovery and Human Boundary

**目标**：真实进程和工作区副作用在中断后可判定、可恢复；人工只处理不能自动决定的事。

候选目标面：

- capability execution schema 升级或新增不可分叉的 process evidence artifact；
- `LoopRunStore` append/readback/transaction validator 增加 invocation、process、staging、
  promotion 与 human-action 固定字段；
- recovery context 区分：safe retry、verify staged result、cleanup required、human input required、
  terminal failed/blocked；
- resume lease 覆盖 recovery -> claim -> spawn -> terminal/promotion 决策窗口；
- attempt workspace 清理与保留策略：成功提升，失败隔离，未知副作用保留证据并阻塞；
- 新增 machine-readable `human_action_required` artifact，只允许以下 reason code：
  `MISSING_BUSINESS_FACT`、`SOURCE_CONFLICT`、`RISK_ACCEPTANCE_REQUIRED`、
  `PERMISSION_REQUIRED`、`EXTERNAL_SIDE_EFFECT_AUTHORIZATION_REQUIRED`、
  `MANUAL_GIT_HANDOFF_REQUIRED`；
- `SWITCH_AGENT_REQUIRED`、`SHADOW_FALLBACK_REQUIRED` 不得成为合法 human reason。

E4 验收：对 started/spawn/result/validation/terminal/revision 各 crash window 做 fault injection；
并发 resume 至多一个真实 spawn；fresh operator 只凭 journal/artifact 即可判断下一步。

### E5 — Autonomous Runtime Acceptance（独立授权）

E5 不与 E0～E4 实施授权混合，分三层证据：

1. **自动负向矩阵**：fake runner + fault injection 证明 fail-closed、恢复、Re-Gate、并发和
   Git 边界；只能证明机制，不能证明 provider 可用。
2. **真实 CLI canary**：Kimi/Codex/Hermes 分别在隔离 fixture 上执行最小 canonical
   capability，记录真实 executable/profile/version、started/terminal、output digest；需单独
   外部 Agent 调用授权。
3. **真实自主 fixture run**：一次入口启动，按 Accepted binding 跑完整八 execution point，
   `manual_agent_switch_count=0`，至少一次受控 Re-Gate/恢复，最终只输出人工 Git handoff。

E5 PASS 后才请求下一条真实业务 C05 授权。E5 或 C05 任一失败都不得用 shadow、执行者
自述或本次 `wms-monitor` 旧证据替代。

## 7. 编码前数据场景矩阵

| ID | 模拟输入/故障 | 预期机器结果 | 用户介入 |
| --- | --- | --- | --- |
| S01 | 完整来源、base SHA 匹配、三个 profile 可用 | 八点自动推进到 handoff | 否 |
| S02 | Codex scan 返回 2 个 blocking findings | ledger 持久化；回流 solution-design；下游失效并重走 scan/verdict | 否 |
| S03 | Hermes verdict 未绑定本轮 ledger | `OUTPUT_CONTRACT_VIOLATION`，Gate 不成立 | 否 |
| S04 | CLI 命令不存在/不可执行 | `EXECUTOR_UNAVAILABLE`，无 shadow fallback | 否；修复环境后 resume |
| S05 | 进程非零退出且无工作区变化 | failed event；同 binding 最多一次受控重试 | 否 |
| S06 | 进程 timeout 且 worktree 有变化 | 保留隔离 attempt，进入 recovery verification，不直接 retry | 通常否 |
| S07 | exit 0，但 result JSON 缺 `artifact.digest` | output invalid；不 promotion、不推进 | 否 |
| S08 | result 指向 allowed path 外文件 | `WORKSPACE_BOUNDARY_VIOLATION`，run blocked | 否 |
| S09 | stdout 超限或包含疑似 token/prompt 回显 | 截断/泄密失败证据；原文不落 journal | 否 |
| S10 | result 已写且 digest 合格，terminal append 前崩溃 | resume 重验 staging 并幂等提交；不再调用 Agent | 否 |
| S11 | terminal succeeded，revision 未写时崩溃 | pending materialization 幂等补写 | 否 |
| S12 | 两个进程并发 resume 同一 run | resume lease + claim CAS 保证最多一个 spawn | 否 |
| S13 | 用户提供的新 resume 文本与 pinned 来源冲突 | 保持旧事实；生成 `SOURCE_CONFLICT` human action | 是，裁决事实 |
| S14 | code-review 发现方案级缺口 | 回流 solution-design，再过双角色 Gate | 否 |
| S15 | 七节点通过但用户未授权 Git | `READY_FOR_MANUAL_GIT_HANDOFF`，零 commit/push/PR/merge | 是，线下 Git |
| S16 | real adapter 失败但 deterministic runner 可成功 | real run 仍失败/阻塞；shadow 结果标记非验收证据 | 否 |

编码前必须把上述数据固化为 fixtures/mutations；实现时发现新状态或副作用语义，不得在
代码里就地发明，必须回流本规划并重新过 Gate。

## 8. 设计不变量

1. **INV-E1 单一推进权威**：只有 runtime/store 能推进、回流、暂停或完成 run。
2. **INV-E2 真实执行**：production mode 每个执行点必须由 Accepted real adapter 完成；
   shadow 只能在显式测试/dry-run，且永不产生验收证据。
3. **INV-E3 immutable binding**：一次 run 固定 registry/profile version；历史 attempt 可按
   原 binding 恢复，不能静默改 Agent。
4. **INV-E4 role firewall**：solution-gate scan/verdict 必须不同 binding；verdict 消费同一
   immutable ledger。
5. **INV-E5 证据先于推进**：started/terminal、input/output digest、validation/promotion
   证据不完整时不得进入下一点。
6. **INV-E6 attempt 隔离**：未知或失败 attempt 的文件不能成为 current；真实副作用不明
   时不重试、不伪造失败无副作用。
7. **INV-E7 无 shell 重构**：不可信输入永不形成 shell source；命令/profile 固定、参数
   数组化、prompt 走 stdin。
8. **INV-E8 bounded execution**：stdin/stdout/stderr、artifact、attempt、Re-Gate、进程和
   总时长均有上限；超限 fail closed。
9. **INV-E9 最小人工边界**：用户只补事实、作冲突/风险/权限裁决和处理最终 Git；切换
   Agent 不是合法人工步骤。
10. **INV-E10 Git 边界**：Core 不 commit/push/PR/Ready/merge/release；handoff 明确区分
    已验证、未验证、失败、阻塞和未授权动作。
11. **INV-E11 单轨合同**：无 Direct/Speckit fork、无 DocFlow 治理、无第二状态机。
12. **INV-E12 可恢复事实**：fresh operator 不依赖旧聊天即可从 request、journal、artifact、
    workspace evidence 恢复。

## 9. 推荐 bounds（待 Q4 裁决）

| 项目 | 建议首版值 | 说明 |
| --- | --- | --- |
| 非 implementation capability timeout | 10 分钟/attempt | 方案与审核可能较长，但必须有界 |
| implementation timeout | 30 分钟/attempt | 只覆盖单次 Agent 调用，不含全 run |
| 同 binding 自动 retry | 最多 1 次 | 仅无副作用的 retryable 基础设施失败 |
| Re-Gate rounds | 8 | 沿用八 execution point 的有界思路 |
| 全 run 前台预算 | 2 小时/ invocation | 到期保持 RUNNING/BLOCKED 可恢复，不伪造完成 |
| stdin/prompt | 1 MiB | 超限通过 artifact refs 拆分，不截断语义 |
| stdout | 256 KiB | 仅结构化结果与安全摘要，不承载大制品 |
| stderr | 64 KiB | 仅诊断摘要，原文不进 journal |
| 单 node artifact | 16 MiB | 与现有 artifact 上限保持一致，超大 evidence 用 index |

具体 CLI 能力若无法满足这些 bounds，provider profile 必须 fail closed；不得为“跑通”取消
上限。

## 10. 依赖、迁移与提交边界

```text
E0 active contract closure
  -> E1 production entry
  -> E2 real adapter + production gateway
  -> E3 validation/progression/Re-Gate
  -> E4 recovery/human boundary
  -> independent full-range code review
  -> Current User closure ruling for implementation package
  -> separately authorized E5
  -> separately authorized next real C05
```

实施期建议单分支/单 PR 承载 E0～E4，使默认入口切换、adapter、schema、recovery 与负向测试
在一个 retained commit boundary 内原子成立；禁止中间 commit 让 production entry 指向
shadow、sidecar 或半完成 journal schema。必要时采用 squash 或明确 retained-commit
验证策略。

迁移原则：

- 当前 deterministic `run()` 与 shadow fixtures 可保留为 test-only API；production command
  使用新 factory，两个入口名称和证据类型必须明确区分；
- capability execution schema 若升级，先做当前 v4 journal preflight；发现真实历史 v4 run
  需要跨版本恢复时停止并回 Current User，不默认重写历史 journal；
- old sidecar/contract-only modules 不得继续被 production factory 引用；删除还是 archive 由
  实现期 dependency scan 决定，但不可形成第二条活跃路径；
- E0 先行且与 runtime 原子合入，避免旧 path decision 再次污染真实 run。

## 11. 验收与证据矩阵

| 完成合同 | 自动证据 | 真实证据 | 失败条件 |
| --- | --- | --- | --- |
| production entry 真实身份 | request parser、base drift、path/mutation tests | E5 fixture 的 repo/base/run identity | 假仓库、未 pin SHA、任意 gateway 注入 |
| 三 Agent real adapter | fake runner 全状态矩阵 | 三个独立 real CLI canary | 任一 provider 用 shadow/sidecar 替代 |
| 自动推进 | 八点成功链 + exact output validation | 一次入口完整 real fixture | 人工切换 Agent 或手工搬运产物 |
| Gate firewall | binding/ledger mutation tests | Codex scan + Hermes verdict journal | 同 Agent、错 ledger、depth 未 materialize |
| Re-Gate | finding lifecycle + stale downstream negative tests | fixture 至少一次有效回流 | 只改 Markdown 状态、不失效下游 |
| durable recovery | S06/S10/S11/S12 fault injection | real run 中至少一次受控中断恢复 | 重复 spawn、副作用不明仍推进 |
| 人工边界 | human reason allowlist mutation tests | handoff 停在人工 Git | Agent switch prompt 或自动 Git |
| 可复核 journal | schema/readback/tamper/rehashed blob tests | E5 journal + artifact digest | 仅执行者自述、缺 terminal/process/promotion 证据 |

E0～E4 的代码复审必须覆盖合同 → 不变量 → attack surface → 实现/测试证据，并对最终树与
所有 retained commits 做负向闭合验证。CI 通过只是基线，不自动形成 PASS 或用户收口。

## 12. 风险与控制

| 风险 | 控制 |
| --- | --- |
| 三套历史 adapter/runner 继续并行漂移 | production factory 只引用统一 adapter/profile/runner；旧路径消费面测试为零 |
| CLI 参数或登录态随版本变化 | profile/version pin + E5 canary；不通过时 unavailable，不猜测修复 |
| timeout 后子进程仍存活 | process-group TERM/KILL + cleanup evidence；cleanup 不确定则 blocked |
| Agent 已写文件但 runtime 未记 terminal | attempt 隔离 + pre/post digest + staging recovery，不盲 retry |
| stdout 泄露业务/凭据 | stdin 输入、结构化小输出、redaction/secret scan、原始流不持久化 |
| retry_other_binding 绕过角色/能力选择 | 首版禁止自动跨 binding fallback，变更需新 registry version 和裁决 |
| 旧 Direct/Speckit 语义再生 | manifest active references 闭包扫描 + mutation test |
| 假 runner 被误报真实验收 | evidence type 标记 + E5 real canary + full real fixture 三层证据 |
| E0～E4 中间提交不可运行 | 单实施包、原子 retained boundary、per-commit validator |
| 项目又依赖人工切换 | `manual_agent_switch_count` 与 human reason allowlist 成为 E5 硬门 |

## 13. Current User 裁决结果

2026-08-27，Current User 指示“直接通过”，并明确该指令是方案通过、不是实施授权。
因此以下 Q1～Q7 按规划推荐值全部接受：

1. **Q1 初始 binding**：接受 §3.2 的 Kimi/Codex/Hermes 分工；不做动态路由。
2. **Q2 fallback**：首版禁止 real -> shadow 和自动跨 Agent fallback。
3. **Q3 retry/recovery**：仅无副作用基础设施失败允许同 binding 自动重试一次；存在文件
   变化或中断歧义先恢复核验。
4. **Q4 bounds**：接受 §9 的首版 timeout、输出和总预算建议；profile 不能满足即阻塞。
5. **Q5 attempt promotion**：所有节点使用 attempt staging；implementation 使用隔离 worktree
   + patch/workspace digest，验证后才 promotion。
6. **Q6 授权粒度**：E0～E4 一个实施包；E5 单独外部 Agent 调用授权；下一 C05 再单独授权。
7. **Q7 历史 journal**：采用声明式 cutover；若 preflight 发现需要恢复的真实 v4 journal，
   停止重裁，不自动迁移/重写。

上述裁决冻结方案语义；后续若要改变 binding、fallback、retry、bounds、promotion、授权
粒度或 journal cutover，必须重新进入方案裁决，不得由实现阶段自行漂移。

## 14. 后续 Gate

### 14.1 Solution Gate（未执行，风险已由 Current User 接受）

- 状态：`NOT_RUN / CURRENT_USER_RISK_ACCEPTED`；
- Current User 选择直接通过方案，不再把本轮双 binding adversarial scan/formal verdict 作为
  `ACCEPTED` 的前置条件；本裁决不授权调用 Codex、Hermes 或其他 Agent CLI；
- 被接受的剩余风险集中在 process cleanup、attempt promotion 原子性、journal schema
  cutover、provider profile 安全、真实证据与 fake 证据隔离、Git 边界；
- 实现后的独立代码复审、负向测试和 E5 真实验收仍必须执行，不因本次风险接受而省略。

### 14.2 Task Gate（当前关闭）

只有以下条件全部满足，才允许 `sdlc-task-planning` 生成稳定 task ID：

1. 本计划状态为 `ACCEPTED`（已满足，Decision-063）；
2. Q1～Q7 已有明确裁决（已满足，全部接受推荐值）；
3. Solution Gate 为 PASS 或有明确风险接受（已满足，Current User 风险接受）；
4. E0～E4 实施授权另行成立（**未满足**）；
5. task 集具备目标文件/模块、依赖、source trace、verification 和 exclusions；
6. 任务一致性审计无 stale artifact、未接受风险或 readiness blocker。

## 15. 授权边界与下一有效动作

Current User 本轮只裁决方案通过，不授予实施权限。因此下一有效动作是：

> 单独决定是否授予 E0～E4 实施包授权。若未来授权成立，必须先执行
> `sdlc-task-planning` 形成稳定任务集并通过 Task Gate，不能从“方案通过”直接跳到代码实施。

明确未授权：运行时代码、Skill/reference/validator/metadata 的实际修改；任何 Agent CLI
调用；任务规划；E0～E5；下一条 C05；业务仓 Git 与远程发布。

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 0.1.0 | 2026-08-27 | Draft for Current User review | 根据 C05 只读复审建立 E0～E5、初始场景矩阵、完成合同与授权边界。 |
| 0.2.0 | 2026-08-27 | Draft for Current User review | 经 Decision-062 规划授权，核验真实 Source，补齐生产入口、统一 adapter/profile、严格 output contract、attempt staging/promotion、process journal、恢复、人机边界、E0～E5 工作项、S01～S16、证据矩阵、bounds 与 Q1～Q7；未过 Solution Gate/Task Gate，不授权实施。 |
| 0.3.0 | 2026-08-27 | Accepted | Decision-063 接受 Q1～Q7 全部推荐值；Current User 显式接受本轮不执行双 binding Solution Gate 的剩余风险。Task Gate 因实施授权未成立继续关闭；不授权代码、Agent CLI、E0～E5 或 C05。 |
