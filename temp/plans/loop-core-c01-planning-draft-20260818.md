# LOOP-CORE-01 有界实现规划草稿（C01 Bounded Implementation Planning Draft）

> 状态：DRAFT（只读评估 + 规划提案，**无任何执行授权含义**）
> 日期：2026-08-18
> 依据：
> - [LOOP Core Contract](../docs/LOOP_CORE_CONTRACT.md) v0.3.0（Accepted）
> - [Autonomous Delivery Roadmap](../docs/AI-SDLC-Autonomous-Delivery-Roadmap.md) v2.1.0 §4 `LOOP-CORE-01`
> - `ai-project-control-plane/projects/ai-sdlc/STATE.yaml`：`next_valid_transition = LOOP_CORE_C01_BOUNDDED_IMPLEMENTATION_PLANNING`

## 1. 文档定位与授权边界

本草稿是 C01 进入受控执行前的准备材料，包含两部分：

1. **现有能力复用评估**（只读，基于当前仓库 Source 事实）；
2. **有界实现规划提案**（工作包分解、验收映射、风险与待授权决策点）。

本草稿不授予任何权限：

- 不创建 C01 代码、不调用 Agent、不产生 Git 副作用（commit / push / PR / Ready / merge / publication 均不授权）；
- 不推断用户授权：本草稿被阅读或保存不构成对任何工作包的批准；
- 用户审阅并单独授权后，才进入正式的有界 C01 implementation planning。

## 2. C01 完成合同（Roadmap 2.1.0 §4，作为规划验收基线）

> - **objective**：让任意已支持入口 Agent 或等价 Skill/命令，以同一 Requirement ID、来源记录和运行状态启动或恢复 LOOP；节点按 capability binding 选择实际执行 Agent，而不写死角色。
> - **scope**：Requirement ID 与来源识别；新需求/补充/变更/返工/反馈分类；binding 的启用、版本、输入输出校验、副作用、超时、失败和替换边界；跨入口恢复。
> - **completion_contract**：
>   1. 至少一个已支持入口可以创建或恢复同一 Requirement；
>   2. 每个节点可记录实际 binding 和输入/输出来源；
>   3. binding 替换不改变 Requirement ID、产物 schema、finding 语义、Re-Gate 路由或人工 Git 边界；
>   4. 不可用/超时/不合格结果产生可恢复的失败尝试而非伪造通过。

## 3. 现有能力复用评估（只读结论）

评估基线：当前工作树（`feature/loop-core-contract-roadmap`）+ `feature/loop-runtime-v1` 事实分支上已存在的实现资产。Roadmap §6 要求"复用前以当时 Source 和验证事实确认"，本表为初步判断，正式规划期需逐个资产复核测试状态。

| 资产 | 位置 | C01 用途 | 复用判断 |
| --- | --- | --- | --- |
| 入口 Skill `sdlc-requirement-normalizer` | `skills/sdlc-requirement-normalizer/`（合同在 `skill-contracts/known-skills/`） | 统一入口归一化：Requirement ID 识别、来源类型/优先级、新/补充/变更/返工/反馈分类、阻塞条件（找不到业务目标即停） | **直接复用**为入口语义基底，状态 `prompt_skill_ready`；缺口：未与运行记录创建/恢复挂钩 |
| 运行日志（run journal） | `core/loop-run-state.ts`（纯函数状态机）+ `core/loop-run-store.ts`（SQLite 追加式、跨连接并发安全、fail-closed 校验） | 运行记录：run/requirement id、阶段事件（started/succeeded/failed/paused/resumed/blocked…）、`attempt` 计数 | **复用**为 run-record 基底；缺口：事件不含 binding id、adapter/agent 版本、输入产物版本引用 |
| checkpoint 恢复 | `core/loop-delivery-checkpoint.ts` + `-store.ts` | 跨入口恢复机制候选：不可变 artifact、generation 线性链、`fresh/recovery` 模式 | **部分复用**；其 phase 表含发布语义（commit/push/pr 等），C01 只取 fresh/recovery 与不可变链语义，发布 phase 不进 C01 |
| Codex 适配 | `execution/codex-adapter.ts`、`codex-real-dispatch-*`（prompt builder、output parser、fallback policy、guardrails、observability、real runner、readiness review）、`core/loop-codex-implementation-adapter.ts` | binding 的"实际执行者"适配层候选 | **复用**为 adapter 资产；现状是 feature-flagged 直连，无版本化 binding 配置层 |
| Kimi / Hermes 适配 | `execution/kimi-cli-*`、`hermes-cli-*`、`cli-adapter-contract-types.ts`、`gateway.ts`、`config.ts` | 多执行者候选 | 同上：复用为 adapter 资产，作为初始 binding 注册候选 |
| PCE 紧凑执行信封 | `ai-sdlc/compact-prompt-standard.md`、`core/loop-codex-implementation-adapter.ts`、`codex/pce-*` 分支历史 | 执行者调用协议（输入输出合同、结果校验）候选 | **复用**为 binding 的调用/校验语义；规划期需明确 PCE（执行信封）与 binding（选择+校验）不重复定义 |
| 过程运行器 | `core/loop-posix-process-runner.ts` | binding 失败/超时/可恢复尝试的执行边界 | 复用 |
| 产物合同 | `ai-sdlc/artifact-flow.md`、`artifact-storage.md`、`artifact-versioning.md`、`templates/artifact-manifest-template.md` | 产物 schema 与版本引用（C01 不得改变） | 复用，只读不改 |
| 图/编排 | `loop/`（engine、node_router、agent_router、types）、`core/state-machine-vm.ts`、`loop-autonomous-delivery-loop.ts`、`loop-requirement-design-orchestrator.ts` | 节点流转参考 | **部分复用**；注意 `loop/types/index.ts` 的 `AgentMapEntry` 是 node→agent 静态绑定，与 C01"能力与 Agent 解耦"冲突，正式规划须决定废弃或改造 |
| 失败/回退策略 | `execution/*-fallback-policy.ts` 等 | 不可用/超时/不合格处理语义 | 复用语义，需抽象为 binding 级统一策略，避免各 adapter 各自实现 |

### 3.1 关键缺口（C01 必须新建，仓库当前不存在）

1. **Node Capability Contract** 表示层：当前节点模型直接绑定 `LoopAgent`（kimi/codex/hermes），没有"能力类型"抽象（需求归一化、技术方案、方案挑战、方案审核、实现、代码审核、测试验收是能力，不是 Agent 专属名）。
2. **Agent Capability Binding 版本化 schema + 配置**：仓库 grep 无任何 `capability binding` / `Node Capability` 概念。需要新建：binding id、能力类型与适用节点、实际执行者标识及 CLI/工具/adapter、输入格式与输出合同、结果校验器、副作用边界、超时、失败处理、binding 版本与启用状态。
3. **每节点执行溯源记录扩展**：现有 run journal 记录阶段事件和 `attempt`，但不记录本次执行实际使用的 binding、adapter/agent 版本、输入产物版本。需扩展事件字段或新增事件类型，保持 fail-closed 与向后兼容（版本化事件 schema）。
4. **跨入口恢复协议**：入口如何用同一 Requirement ID 定位既有运行记录并恢复指针（当前 checkpoint 是 loop 内部机制，未接入口）。
5. **binding 替换守卫测试**：A→B 替换后 Requirement ID、产物 schema、finding 语义、Re-Gate 路由、人工 Git 边界不变的自动化验证。

## 4. 有界实现规划（工作包提案）

按 LOOP 产品原则（产物优先、能力与 Agent 解耦、最早受影响节点返工）拆为 5 个有界工作包。每个 WP 都是独立 material outcome，不是 prompt/PR/会话。

```text
WP-1 入口归一化合同
  ↓
WP-2 Node Capability Contract ──┐
WP-3 Agent Capability Binding ──┴─（设计可并行，落地有依赖）
  ↓
WP-4 执行溯源与跨入口恢复
  ↓
WP-5 验证与守卫（完成合同验收）
```

### WP-1：入口归一化合同（Entry Contract）

- 基于 `sdlc-requirement-normalizer` 合同扩展为 LOOP Core 入口合同：
  - Requirement ID 规则与识别；
  - 来源记录（类型、位置、优先级、冲突、缺失上下文）；
  - 分类：新需求 / 补充 / 变更 / 返工 / 反馈驱动变更；
  - 创建或恢复同一 Requirement 的运行记录（调用 run journal）；
  - 业务目标/范围/优先级/授权不可确定时停止并说明阻塞原因。
- 输出：入口合同文档（`docs/` 或 `ai-sdlc/` 正式落点待定）、运行记录创建/恢复调用。
- 验收：至少一个已支持入口可用同一 Requirement ID 创建并再次恢复同一运行记录，不重解释已确认事实。

### WP-2：Node Capability Contract

- 定义能力类型清单（需求归一化、技术方案生成、方案挑战、方案审核、实现、代码审核、测试/验收…）；
- 每个节点合同只声明：所需能力、输入、输出、Gate、副作用边界——**不出现 Agent 专属名**；
- 处理 `loop/types` 静态 `AgentMapEntry` 的废弃/兼容决策。
- 验收：节点模型可脱离具体 Agent 描述；任何节点合同不包含"必须由某 Agent 执行"。

### WP-3：Agent Capability Binding 层

- 版本化 binding schema（YAML 类型定义 + TS 校验），字段对齐 LOOP_CORE_CONTRACT §6.2：能力类型与适用节点、实际执行者标识及其 CLI/工具/adapter、输入格式/输出合同/结果校验器、副作用/超时/失败边界、版本与启用状态；
- 将现有 codex/kimi/hermes adapters 注册为初始 binding（启用状态按当时 Source 事实确认）；
- binding 的启用、停用、替换是配置/协议层操作，不修改 LOOP 主流程、产物链或节点业务合同；
- 失败/超时/不合格 → 按 binding 策略产生可追溯的新尝试，禁止用 shadow/历史结果冒充本次通过。
- 验收：替换 binding 不改变 Requirement ID、产物 schema、finding 语义、Re-Gate 路由、人工 Git 边界（自动化守卫）。

### WP-4：执行溯源与跨入口恢复

- run journal 事件扩展：记录 binding id、adapter/agent 版本、输入产物版本、尝试与结果（版本化事件 schema，保持 fail-closed）；
- 跨入口恢复协议：入口以 Requirement ID 定位运行记录 → 恢复当前节点/有效产物版本/Gate/阻塞项/下一步资格；
- checkpoint 复用裁剪：只取 fresh/recovery 与不可变链语义。
- 验收：每次节点执行可追溯 binding 与输入/输出来源；中断后可由另一入口/binding 继续。

### WP-5：验证与守卫

- 单元测试：binding schema 校验、run journal 扩展、恢复协议、替换守卫；
- 真实/样例验证：至少一个真实入口创建+恢复；一次 binding 替换；一次不可用/超时/不合格 → 可恢复失败尝试；
- 伪造通过禁令：无 shadow/历史结果冒充本次通过的测试断言。
- 验收：覆盖 C01 completion_contract 全部 4 条。

## 5. 验收映射（完成合同 ↔ 工作包）

| 完成合同条款 | 覆盖 WP | 验收证据 |
| --- | --- | --- |
| 至少一个已支持入口创建或恢复同一 Requirement | WP-1、WP-4 | 入口运行记录创建+恢复测试与真实执行记录 |
| 每节点可记录实际 binding 和输入/输出来源 | WP-3、WP-4 | run journal 事件含 binding/版本/产物版本字段 |
| binding 替换不改变 ID/schema/finding/Re-Gate/人工 Git 边界 | WP-2、WP-3、WP-5 | 替换守卫测试（替换前后契约断言） |
| 不可用/超时/不合格 → 可恢复失败尝试而非伪造通过 | WP-3、WP-5 | 失败注入测试 + 禁止 shadow 通过的断言 |

## 6. 明确不做（Out of Scope）

- 自动 commit / push / Draft PR / Ready / merge / 发布（Advanced-02，含 checkpoint 中发布 phase 的接线）；
- 新增 Agent Provider（Advanced-03）；
- 多仓交付（Advanced-01）；
- C02 的 Re-Gate 编排本体（C01 只保证"可记录、可恢复、可替换"，不实现 artifact-led orchestration loop）；
- 调度平台 / daemon / UI / 服务化。

## 7. 风险与开放问题

| # | 风险/问题 | 处理方向 |
| --- | --- | --- |
| R1 | 历史 D01~D06 资产与新 Roadmap 合同对齐度未知 | 正式规划期逐资产复核测试状态与合同匹配（Roadmap §6） |
| R2 | run journal 事件 schema 扩展可能破坏现有消费者 | 版本化事件 schema，新增字段 fail-closed，向后兼容测试 |
| R3 | checkpoint 含发布语义，复用裁剪边界 | 只取 fresh/recovery + 不可变链，发布 phase 留在历史 |
| R4 | PCE 与 binding 职责重叠 | 规划期明确：binding = 选择+校验+版本；PCE = 执行信封，不重复定义 |
| R5 | 真实入口 Agent 可用性（Kimi/Codex/Hermes CLI 现状） | 以 Source 事实复核，初始 binding 只注册已验证的适配能力 |
| R6 | `loop/types` 静态 Agent 映射与能力解耦冲突 | WP-2 明确废弃/兼容决策，避免半迁移状态 |

## 8. 需要用户授权的决策点（本草稿不预设答案）

1. **初始 binding 集合**：先注册哪个/哪些执行者（Codex 先行？Kimi/Hermes 一并？）；
2. **首个验收入口**：以哪个入口 Agent 作为 C01 创建/恢复验收入口；
3. **授权粒度**：WP-1~WP-5 一次性授权，还是逐 WP 授权推进；
4. **正式规划落点**（已对照 PKB 惯例澄清，建议采用）：正式 C01 规划是**持久规划合同**（与 `docs/LOOP_CORE_CONTRACT.md` 同类），建议落在产品仓库 `docs/LOOP-CORE-C01-PLAN.md`，控制平面 STATE 只记录指针。对照说明：
   - PKB 的 `90-system/handoffs/*.md` 是**任务完成后的证据/交接记录**（产品仓库内书写 + STATE 登记），不是规划合同的权威载体；Shared `SESSION_LIFECYCLE.md` §12 同样定义 Handoff 为"供下一会话的 transport package，应引用持久权威源而非复制历史"。
   - 因此正式规划不直接写进 handoff；审阅与授权以规划文档本身为载体，STATE 记录授权结果。
   - 若 ai-sdlc 后续要引入 PKB 同款任务级 handoff 记录结构（`90-system/handoffs/` + current 入口指针），属于新增仓库惯例，可在 C01 正式规划范围内另行决定，不影响本草稿落点。
   - 附注：`project-governance-exchange` 在两仓库中仅作为 PKB `GOVERNANCE.md` §16 排除条款存在（外部治理交换系统不得替代 Controller/routing/Control Plane），不是可写入的文档或机制，不存在"写进 exchange"的落点。
5. **决策记录惯例**（按 PKB `DECISIONS.md` 惯例，用户已确认）：本规划涉及的所有决定逐项记录到 `docs/AI-SDLC-Decision-Records.md`——该文件已存在（Decision-001～011，固定格式：状态/背景/问题/决策/原因/影响/实现状态/代码依据），编号继续。记录对象包括：规划落点决定、本 §8 各决策点、WP 边界调整、验收口径变化。同时建议补记 2026-08-16 已接受的 LOOP Core Contract（v0.3.0）与 Roadmap v2.1.0 rebaseline 为历史决策条目；补记只记录既有已接受事实，不改变合同内容。

## 9. 进度管理机制对齐（PKB 模式，用户方向已确认）

> 背景：ai-sdlc 与 PKB 均注册于同一 ai-project-control-plane；用户要求 ai-sdlc 的进度管理（Roadmap / 决定 / Handoff）参考 PKB 运作方式。用户指出：2026-07 期间 ai-sdlc 的 handoff 已通过 project-governance-exchange 写入 PKB `10-projects/ai-sdlc-standard/`，该既有机制应作为落点基线。

### 9.1 既有机制盘点（三仓库分工）

| 仓库 | 角色 | 关键事实 |
| --- | --- | --- |
| `ai-project-control-plane` | 权威控制状态（STATE 指针/授权/Gate）+ 共享协议 | 现行模式（2026-08 起）；ai-sdlc STATE 已注册 |
| `shaoyang01/project-governance-exchange` | Handoff/Audit/Prompt/Review 跨项目传输通道，authority=`transport_only` | 本地 `/Users/eric/knowledge/project-governance-exchange`；结构 `projects/{slug}/topics/{topic}/runs/{run-id}/`（manifest + handoff + artifacts）+ `current.yaml`；不可变 run + 双 commit 协议（run commit → pointer commit）；Publisher v1.1 Issue-driven + Deploy Key；schema 三份（current-v1 / manifest-v1 / publish-request-v1）；ai-sdlc-standard 已有 topics 05/06 |
| `personal-knowledge-base` 的 `10-projects/ai-sdlc-standard/` | 归档镜像 + 导航（README + current.md + handoffs/audits/prompts） | 发布规则 `90-system/rules/external-project-publishing.md`；消费规则 `project-governance-exchange-consumption.md`；硬约束：current 与新 Handoff 须在同一 PKB commit 更新；2026-07-13~19 活跃后停用 |

### 9.2 PKB 模式 vs ai-sdlc 现状

| 机制 | PKB 做法 | ai-sdlc 现状 |
| --- | --- | --- |
| Roadmap | PKB 仓库 ROADMAP v2.6，STATE 观察版本 | `docs/AI-SDLC-Autonomous-Delivery-Roadmap.md` v2.1.0（同构） |
| 工作包层级 | M5-E1 + SR1~SR5 | LOOP-CORE-00 + C01~C05（同构） |
| 任务级 Handoff | PKB 仓库 `90-system/handoffs/` | ai-sdlc 既有：exchange → `10-projects/ai-sdlc-standard/handoffs/`（7 月停用） |
| current 入口 | `90-system/indexes/*-current.md` | 既有：`10-projects/ai-sdlc-standard/current.md` + exchange `current.yaml`（7 月停用） |
| 决定记录 | DECISIONS.md，DEC-NNN | `docs/AI-SDLC-Decision-Records.md` Decision-NNN（断更，08-16 后未记） |
| STATE 登记 | completed_requirements / active_authorizations / recently_closed_findings / evidence/ | 仅 active 指针 + 授权全 false |
| 收口流程 | 实施 → review → correction → 复审 → 用户裁决 → closure handoff | 无运转 |

### 9.3 对齐方案（阶段 0：机制恢复与补全；用户已定：先单独授权落地）

1. **决定记录**（决策 1 已定：沿用 `Decision-NNN`）：恢复 `docs/AI-SDLC-Decision-Records.md` 运转，从 Decision-012 续号；补记 08-16 以来缺失决定（LOOP Core 合同接受、Roadmap rebaseline、本规划各决策点）；决定记录留在 ai-sdlc-standard 产品仓库，不经过 exchange。
2. **Handoff 通道**（决策 3 候选：恢复既有 exchange 机制，见 §9.4）：
   - 验证 exchange 仓库远程可用（main 状态、Publisher v1.1、Deploy Key、AGENTS.md 规则）；
   - 恢复 ai-sdlc-standard 的 exchange topic 写入（不可变 run + current.yaml 双 commit 协议）；
   - 恢复 `10-projects/ai-sdlc-standard/` 发布：新 Handoff 与 current.md 同一 PKB commit 更新；遵守 external-project-publishing.md 与 exchange-consumption.md；
   - 7 月历史 handoff 原样保留、不可覆盖；错误以 correction 新文件处理。
3. **STATE 扩展**（控制平面）：`completed_requirements` / `active_authorizations`（scope + 明确排除 + review round + correction + outcome）/ `recently_closed_findings` / 证据目录 `projects/ai-sdlc/evidence/`；分工：STATE 管控制状态，exchange 管材料传输，10-projects 管归档导航。
4. **收口流程固化**：实施 → review CHANGES_REQUESTED → consolidated correction → 复审 PASS → 用户裁决 → closure handoff（exchange + 10-projects）→ STATE 登记。
5. **机制边界**：exchange 是 `transport_only`，不得从 handoff 推导授权/执行/收口（EXCHANGE_POLICY §2 与 PKB GOVERNANCE §16 排除条款；exchange 不替代 Controller / routing / 控制平面）。

**阶段 1+：C01 起按此模式运转**：每个 WP 的授权（STATE `active_authorizations`）、实施 handoff（exchange → 10-projects）、决定（Decision-NNN）、收口（closure handoff + STATE 登记）；C01 正式规划合同仍落 ai-sdlc-standard `docs/`（§8.4）。

### 9.4 待用户确认（决策 3 最终落点）

- **选项 A（推荐）**：恢复既有 exchange → 10-projects 机制，与现行控制平面模式并行；不在 ai-sdlc-standard 新建 `90-system/`。
- **选项 B**：在 ai-sdlc-standard 仓库内建 `90-system/handoffs/`（PKB 同款结构，但放自己仓库内）。
- **选项 C（混合）**：产品仓库内建 handoffs/，exchange 仅作传输备份。

无论选哪个，决策 1（Decision-NNN）与决策 2（先单独授权）不变。另需确认两点：exchange 远程仓库当前可写状态（GitHub 侧验证，含 Publisher 机制是否沿用）；10-projects 写入属 PKB 仓库跨仓写入，阶段 0 授权需覆盖该路径。

## 10. 下一步

1. 用户审阅本草稿；
2. 用户确认 §9.4 落点选项后，**先单独授权阶段 0 机制恢复**（决定记录 + handoff 通道 + STATE 扩展 + 收口流程），独立于 C01；
3. 机制落地后，再就 §8 决策点授权 C01 规划；本草稿迁移为 `docs/LOOP-CORE-C01-PLAN.md`（正式规划合同），STATE 登记指针；
4. 每个决策点确认后即记录 Decision-NNN（从 012 起），并补记 LOOP Core Contract 接受与 Roadmap rebaseline 两条历史决策；
5. 正式规划期先完成 R1 逐资产 Source 复核，再展开 WP 分解与实现；每完成一个 WP 按 §5 验收映射与 §9.3 收口流程更新证据与 STATE。
