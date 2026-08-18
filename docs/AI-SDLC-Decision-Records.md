# AI-SDLC Decision Records

> 导航：[架构基线](AI-SDLC-Architecture-Baseline.md) · [工作流设计](AI-SDLC-Workflow-Design.md) · [Agent 规范](AI-SDLC-Agent-Specification.md) · [实施路线图](AI-SDLC-Implementation-Roadmap.md) · [当前状态](CURRENT_STATUS.md)

本文件只记录已确定决策。未确定事项见 [CURRENT_STATUS](CURRENT_STATUS.md#need-decision)。共同背景是：Agent 能力执行与流程控制必须分离，执行过程必须可审计、可回放且默认无真实副作用。

# Decision-001：流程状态不属于 Agent

## 状态

Accepted / Partially Implemented

## 背景

Agent 同时持有能力与全局流程会使路由不可审计。

## 问题

谁拥有生命周期状态和下一节点决策？

## 决策

Agent 不拥有全局状态、不编排 Workflow；Control Plane/Runtime 管理状态，Workflow Graph 决定路由。

## 原因

保持确定性、可测试、可 Replay，并限制多 Agent 的控制边界。

## 影响

Agent 输出必须作为节点结果返回，不能直接跳转或改 Graph。

## 实现状态

进程内 Runtime 与 immutable ExecutionState 已实现；完整 Control Plane 服务未实现。

## 代码依据

`runtime.ts`、`core/execution-state.ts`、`sdlc_graph/transitions.ts`

# Decision-002：Graph 是唯一 Transition Source

## 状态

Accepted / Implemented

## 背景

Runtime 与 Replay 若各自维护流程表会产生漂移。

## 问题

节点顺序和条件跳转如何统一？

## 决策

Graph 定义节点与边，`getNextNode` 统一解释条件；Runtime 和 Replay 都调用同一 transition 实现。

## 原因

消除重复路由逻辑并保证 Replay 一致性。

## 影响

新增正式生命周期节点必须先更新 Graph/transition 契约和测试。

## 实现状态

六节点主 Graph 已实现；code-review/bugfix 仍是 Runtime 附加循环。

## 代码依据

`sdlc_graph/graph.ts`、`sdlc_graph/transitions.ts`、`core/state-machine-vm.ts`、`runtime.ts`

# Decision-003：Event 表达状态变化和执行触发

## 状态

Accepted / TODO

## 背景

生命周期需要可观察、可审计、可恢复的状态变化模型。

## 问题

如何解耦状态变化与执行触发？

## 决策

采用 Event 作为状态变化和触发模型。

## 原因

为审计、恢复和未来异步执行提供稳定边界。

## 影响

需要事件 schema、幂等键、顺序、持久化与失败语义。

## 实现状态

仅有 trace/history 和纯 Replay；完整 Event Bus 未实现。

## 代码依据

`core/execution-trace.ts`、`core/state-machine-vm.ts`

# Decision-004：Skill 显式绑定且与 Agent 分离

## 状态

Accepted / Partially Implemented

## 背景

Skill 是复用契约，Agent 是能力执行主体，两者生命周期不同。

## 问题

Runtime 如何选择 Skill？

## 决策

请求必须显式指定 skillName；禁止根据 `(agent, node, requestType)` 隐式推断。Skill 不等于 Agent，也不拥有 Workflow。

## 原因

避免隐藏绑定，使执行、审计和替换可预测。

## 影响

registry 只能提供元数据或显式校验，不能偷偷注入 Skill。

## 实现状态

registry 为 metadata-only；challenger 显式传递 Skill，但当前是 contract prompt，不是完整动态加载 Skill 文件。

## 代码依据

`core/agent-skill-registry.ts`、`execution/skill-request-validation.ts`、`core/runtime-executors.ts`、`tests/runtime-no-auto-skill-annotation.test.ts`

# Decision-005：Shadow-first 与真实执行默认关闭

## 状态

Accepted / Implemented

## 背景

真实 CLI/Agent 调用具有成本和代码副作用。

## 问题

如何安全引入真实执行？

## 决策

优先 shadow；真实执行必须 feature-flagged 且 default-off，通过 Gateway、guardrail、fallback 和观测逐步启用。

## 原因

降低新适配器对主流程的风险。

## 影响

未显式启用不得声称或触发 real dispatch。

## 实现状态

Codex/Kimi/Hermes real dispatch 均有配置和 guardrail；是否执行过外部 smoke 需以当次记录为准。

## 代码依据

`execution/config.ts`、`execution/codex-real-dispatch-real-runner.ts`、`execution/kimi-gateway-real-dispatch.ts`、`execution/hermes-gateway-real-dispatch.ts`

# Decision-006：Direct Implementation 不绑定 Skill，Speckit 是嵌套流程

## 状态

Accepted / Implemented

## 背景

简单改动与完整 SDD 的执行成本不同。

## 问题

两条实现路径如何表达？

## 决策

Direct Implementation 由 Codex Agent 直接执行，不绑定 Skill；Speckit 由 `sdlc-speckit-pipeline` 作为 flow controller 编排子 Skill。

## 原因

避免为直接实现制造虚假 Skill，同时保留复杂需求的受控子流程。

## 影响

主 Graph 的 implementation 节点可承载 direct/fanout/speckit outcome，但嵌套步骤不等同主 Graph 节点。

## 实现状态

Runtime executor 分支与 metadata registry 已实现。

## 代码依据

`core/runtime-executors.ts`、`core/agent-skill-registry.ts`、`skills/sdlc-speckit-pipeline/SKILL.md`

# Decision-007：`final_status` 与 `implementation_outcome` 语义固定

## 状态

Accepted / Implemented

## 背景

完成状态、质量 Gate 与实现方式容易混淆。

## 问题

Runtime 顶层状态如何解释？

## 决策

`final_status` 仅表示 fanout completion，不表示质量 Gate；`implementation_outcome` 仅允许 `real_code_patch | shadow_code_patch | fanout | speckit | failed`。

## 原因

质量问题应由 review summary、trace、Artifact 和 policy suggestions 暴露。

## 影响

消费方不得把 `final_status=success` 等同评审或发布通过。

## 实现状态

已在 Runtime 类型与解析逻辑中实现。

## 代码依据

`runtime.ts`、`core/runtime-executors.ts`

# Decision-008：Hermes Phase 2 保持 sidecar-only

## 状态

Accepted / Implemented

## 背景

Hermes 扩展仍处于受控观测阶段。

## 问题

Hermes 输出是否可改变主执行？

## 决策

不得影响 routing、`final_status`、primary result 或 ownership。

## 原因

保持主链路稳定，并允许独立验证真实 dispatch。

## 影响

异常必须被隔离，最多附加 sidecar metadata。

## 实现状态

Gateway 与 Runtime attachment 均按 sidecar 处理。

## 代码依据

`execution/gateway.ts`、`execution/hermes-gateway-shadow-sidecar.ts`、`core/hermes-runtime-shadow-attachment.ts`

# Decision-009：Solution Challenger 位于正式 Gate 前且最多两轮

## 状态

Accepted / Partially Implemented

## 背景

设计挑战用于在正式方案 Gate 前发现当前 scope 的技术问题。

## 问题

挑战器的权限、轮次和输出是什么？

## 决策

仅挑战技术方案，遵守 scope/phase firewall，输出 `NEEDS_REVISION` 或 `READY_FOR_GATE`，最多 INITIAL 与 FOLLOW_UP 两轮；第二轮仍有问题则 exhausted 并交给 reviewer，不伪造 READY。

## 原因

限制过度架构和无限循环，保持最终 Gate ownership 清晰。

## 影响

Challenger 不评价商业价值、不决定优先级、Direct/Speckit 或最终 PASS/FAIL。

## 实现状态

Skill 契约与 deterministic state 已实现；gateway 模式仍 shadow pass-through，enforcement 未实现。

## 代码依据

`skills/sdlc-solution-challenger/SKILL.md`、`core/solution-challenge-state.ts`、`core/runtime-executors.ts`

# Decision-010：Post-implementation review 采用标准化链路

## 状态

Accepted / TODO

## 背景

不同 reviewer 输出需要进入统一 Gate。

## 问题

问题发现与格式标准化如何分工？

## 决策

目标链路为 real reviewer → `sdlc-code-review-normalizer` → standardized Gate；normalizer 只标准化，不发现问题。

## 原因

避免 normalizer 同时承担审查判断，保持证据来源可追踪。

## 影响

Runtime 接入前需定义 reviewer 原始输出与 Gate schema。

## 实现状态

code-review/bugfix loop 已有；正式 normalizer 链路未接入。

## 代码依据

`runtime.ts`、`execution/code-review-adapter.ts`、`skills/sdlc-code-review-normalizer/SKILL.md`

# Decision-011：Artifact 是跨节点交接与审计载体

## 状态

Accepted / Partially Implemented

## 背景

仅保留最终文本无法追踪中间过程。

## 问题

节点间如何交接可审计结果？

## 决策

重要输入输出、评审和执行结果使用标准 Artifact，并携带 requirement、node、type、source、agent 和时间元数据。

## 原因

统一交接、追踪和后续知识同步。

## 影响

新增节点需定义 Artifact 类型/映射及证据要求。

## 实现状态

内存 Artifact 模型及节点转换已实现；完整持久化、版本和 lineage 尚未进入 Runtime 契约。

## 代码依据

`core/artifact.ts`、`core/node-artifacts.ts`、`ai-sdlc/artifact-versioning.md`

---

> 2026-08-19 起恢复本文件的持续记录惯例（对齐 personal-knowledge-base 的 DECISIONS.md 行为：每次决定即记录）。以下 Decision-012 起为 LOOP 时代记录。

# Decision-012：LOOP Core Contract v0.3.0 接受

## 状态

Accepted（2026-08-16，历史补记）

## 背景

项目进入 LOOP（Artifact-Driven Delivery Core）产品化阶段前，需要一份明确的产品边界合同，避免需求细节只存在于 Agent 聊天上下文。

## 问题

LOOP 产品的目标、边界、产物链、Agent 协作与 Git 交接边界如何固定？

## 决策

接受 `docs/LOOP_CORE_CONTRACT.md` v0.3.0：任意已支持入口 Agent 以同一套产物和 Gate 启动或恢复单仓需求；节点按可替换 Agent binding 选择执行者；交付终点为 `READY_FOR_MANUAL_GIT_HANDOFF`，commit/push/PR/Ready/merge/发布均不属于 LOOP Core。

## 原因

产物优先于聊天记忆；能力与 Agent 解耦；人工保留 Git 决策权。

## 影响

本合同成为后续调整 Autonomous Delivery Roadmap 的判断基线；不再把自动 Git 发布作为 Core 或单仓验收前置条件。

## 实现状态

合同已接受；C01~C05 执行未开始，等待授权。

## 代码依据

`docs/LOOP_CORE_CONTRACT.md`（Revision Record v0.3.0）

# Decision-013：Autonomous Delivery Roadmap v2.1.0 Rebaseline

## 状态

Accepted（2026-08-16，历史补记）

## 背景

LOOP Core Contract 接受后，旧 Foundation/D01~D10/Advanced 11~14 阶段定义与新产品边界不一致。

## 问题

如何按 Shared PROJECT_CONTROL §14 合同重排 Roadmap？

## 决策

`docs/AI-SDLC-Autonomous-Delivery-Roadmap.md` 重排为 v2.1.0：父需求 LOOP-CORE-00 + 子需求 C01~C05；Advanced 01~03 标记 `PLANNING_REQUIRED` 并写出显式 Definition Gap，不得作为执行入口；动态控制语义（指针、Gate、授权）移出 Roadmap，由控制平面 STATE 承担。

## 原因

满足 Fresh Controller 仅凭权威文档和仓库事实即可恢复项目的要求。

## 影响

旧编号（D01~D10、Advanced 11~14）保留于 Git 历史；历史能力作为 C01~C05 的候选支撑，复用前需以当时 Source 事实确认。

## 实现状态

Roadmap v2.1.0 已生效；STATE 指针指向 LOOP-CORE-00 / LOOP-CORE-01。

## 代码依据

`docs/AI-SDLC-Autonomous-Delivery-Roadmap.md`（Revision Record v2.1.0）

# Decision-014：C01 正式规划落点 = 产品仓库 docs/ 持久合同

## 状态

Accepted（2026-08-18）

## 背景

C01 有界实现规划草稿完成后，需要确定正式规划文档的落点；候选包括 `docs/`、`temp/plans/` 或 Handoff。

## 问题

正式规划文档应该放在哪里？

## 决策

正式 C01 规划是持久规划合同（与 `docs/LOOP_CORE_CONTRACT.md` 同类），落在产品仓库 `docs/LOOP-CORE-C01-PLAN.md`；控制平面 STATE 只记录指针；不写入 Handoff（Handoff 是会话间 transport package，应引用持久权威源而非复制历史）。

## 原因

规划合同与执行记录性质不同；Roadmap/STATE/执行三分权要求规划合同留在产品仓库权威面。

## 影响

`temp/plans/loop-core-c01-planning-draft-20260818.md` 审阅通过后迁移为正式文档；`project-governance-exchange` 只承载执行类 Handoff 材料。

## 实现状态

草稿已就绪，等待用户审阅与授权迁移。

## 代码依据

`temp/plans/loop-core-c01-planning-draft-20260818.md`、`docs/LOOP_CORE_CONTRACT.md`

# Decision-015：决定编号沿用 Decision-NNN

## 状态

Accepted（2026-08-19）

## 背景

ai-sdlc 与 personal-knowledge-base 均注册于同一 ai-project-control-plane；PKB 使用 DEC-NNN 编号（DECISIONS.md），ai-sdlc 既有 `docs/AI-SDLC-Decision-Records.md` 使用 Decision-NNN。

## 问题

决定编号形式是否统一为 PKB 同款 DEC-NNN？

## 决策

沿用 ai-sdlc 现有 `Decision-NNN` 编号（从 Decision-012 续号），不改为 DEC-NNN。

## 原因

既有文件与格式已稳定，避免为编号形式做无价值迁移；记录行为（每次决定即记录）与 PKB 对齐即可。

## 影响

决定记录留在 ai-sdlc-standard 产品仓库 `docs/AI-SDLC-Decision-Records.md`，不经过 exchange。

## 实现状态

本文件自 Decision-012 起恢复持续记录。

## 代码依据

`docs/AI-SDLC-Decision-Records.md`

# Decision-016：进度管理机制阶段 0 先单独授权落地

## 状态

Accepted（2026-08-19）

## 背景

ai-sdlc 的进度管理机制（任务级 Handoff、current 入口、决定记录、STATE 登记、收口流程）长期未运转，与 PKB 模式存在差距。

## 问题

机制恢复与 C01 实施是否一并授权？

## 决策

阶段 0（机制恢复：决定记录 + Handoff 通道 + STATE 扩展 + 收口流程）先单独授权落地，独立于 C01 实施规划。

## 原因

机制先行，后续 C01 工作包才能在完整运转的进度管理框架内执行。

## 影响

阶段 0 落地后再进行 C01 规划授权；C01 各 WP 的授权、实施、审阅、收口均按 PKB 流程运转。

## 实现状态

阶段 0 执行中。

## 代码依据

`temp/plans/loop-core-c01-planning-draft-20260818.md` §9

# Decision-017：Handoff 落点恢复既有 exchange → 10-projects 机制

## 状态

Accepted（2026-08-19）

## 背景

2026-07-13~19（最后活动 07-26）期间，ai-sdlc-standard 的 Handoff 通过 `shaoyang01/project-governance-exchange`（authority=transport_only）传输并发布到 personal-knowledge-base 的 `10-projects/ai-sdlc-standard/`；8 月起项目转入控制平面模式后该通道停用。

## 问题

ai-sdlc 的任务级 Handoff 落点选哪个机制？

## 决策

选项 A：恢复既有 exchange → 10-projects 机制，与现行 ai-project-control-plane 模式并行；不在 ai-sdlc-standard 新建 `90-system/`。分工：控制平面 STATE 管控制状态，exchange 管材料传输，10-projects 管归档导航。

## 原因

既有机制有完整规则（EXCHANGE_POLICY、external-project-publishing.md、exchange-consumption.md）、schema、Publisher 工具与历史；避免重复建设。

## 影响

exchange 保持 transport_only，不得从 Handoff 推导授权/执行/收口；10-projects 写入属 PKB 仓库跨仓写入，需在阶段 0 授权范围内覆盖。

## 实现状态

阶段 0 执行中：exchange 远程 main（45b611a）已验证可访问，Publisher workflow 存在。

## 代码依据

`temp/plans/loop-core-c01-planning-draft-20260818.md` §9.1/§9.4

# Decision-018：exchange 仓库发布操作直接 main

## 状态

Accepted（2026-08-19）

## 背景

exchange 仓库本地存在多个历史工作分支（codex/topic06、feature/exchange-publisher-v1-1、fix/exchange-publisher-deploy-key-auth、chore/remove-accidental-root-file），与 EXCHANGE_POLICY 的单写者 direct-main 设计不一致。

## 问题

exchange 仓库的分支策略如何简化？

## 决策

exchange 仓库的发布与操作直接使用 main 分支：单写者 fast-forward 写入，不创建、不切换 feature 分支做发布；本地已同步至 origin/main（45b611a）；已合并的历史本地分支删除，未合并的历史分支保留（不强制删除，内容在 main 历史中可追溯）。

## 原因

EXCHANGE_POLICY v1 本来就是 central Publisher direct-main 设计（禁止 force push/reset/rebase/amend）；分支只增加混淆。

## 影响

后续 ai-sdlc 的 exchange 发布（Issue 通道 → Actions Publisher）与本地维护均直接基于 main；远程遗留分支 `origin/codex/topic06-governance-drift-clarification` 保留为历史，不参与发布。

## 实现状态

本地已 checkout main 并对齐 origin/main；codex/topic06 本地分支已删除（远程保留）。

## 代码依据

`temp/plans/loop-core-c01-planning-draft-20260818.md` §9.3；exchange 仓库 `EXCHANGE_POLICY.md`、`AGENTS.md`

# Decision-019：进度管理机制固化到控制平面 GOVERNANCE.md

## 状态

Accepted（2026-08-19）

## 背景

阶段 0 机制恢复执行中，用户提醒：治理机制必须固化到持久文档，避免更换 Agent 或会话上下文丢失后无法恢复治理。

## 问题

这套进度管理机制（决定记录、Handoff 通道、STATE 登记、收口流程、恢复路径）的权威落点在哪里？

## 决策

机制固化到控制平面 `projects/ai-sdlc/GOVERNANCE.md` 新增 §15（Progress Management Mechanism），包含：三面分工（STATE 控制 / Exchange 传输 / 10-projects 归档）、Decision-NNN 记录规则、Exchange 发布与归档硬规则、STATE 登记结构、收口流程、Fresh Controller 恢复路径与边界；产品仓库决策记录同步补记本决定。

## 原因

GOVERNANCE.md 是 Fresh Controller 恢复治理时必读的权威源之一（§14 成功条件）；机制必须与聊天记忆解耦。

## 影响

后续任何 Agent/会话均可按 §15.6 恢复路径独立恢复 ai-sdlc 治理；机制变更本身需经用户授权并更新 §15 与决策记录。

## 实现状态

GOVERNANCE.md §15 已写入（控制平面提交待登记）。

## 代码依据

`ai-project-control-plane/projects/ai-sdlc/GOVERNANCE.md` §15

# Decision-020：Agent Binding 全能力模型（所有 Agent 可独立完成所有节点）

## 状态

Accepted（2026-08-19）

## 背景

C01 规划决策点 1（初始 binding 集合）确认中，用户明确：Codex 可以先行，但不能只支持 `code_generation`；需求是**所有已支持 Agent 都能独立完成所有节点（需求归一化、技术方案、方案挑战、方案审核、实现、代码审核、测试验收），binding 支持随意组合**（任意节点 × 任意 Agent）。

## 问题

binding 模型是"能力→固定 Agent 映射"（如 codex 只做实现），还是全能力矩阵？

## 决策

采用全能力模型：binding 不预设任何 Agent 的能力限制，每个已支持 Agent 均可执行任一节点；binding 配置支持任意组合与替换，替换不改变节点合同（Requirement ID、产物 schema、finding 语义、Re-Gate 路由、人工 Git 边界）。初始状态：Codex enabled（请求类型从 `code_generation` 扩展至全部节点能力），Kimi/Hermes 注册为 disabled（全能力模型，真实环境复核后启用）。

## 原因

对齐 LOOP Core Contract §6（节点声明能力、binding 选执行者、不写死角色）；用户明确要求所有 Agent 独立完成所有节点。

## 影响

WP-3 范围扩大：binding schema 支持全矩阵；codex adapter 需按节点扩展请求类型与输出合同校验器；WP-2 能力类型清单成为唯一节点合同面，binding 只做选择。

## 实现状态

已并入 C01 正式规划（docs/LOOP-CORE-C01-PLAN.md）。

## 代码依据

`docs/LOOP_CORE_CONTRACT.md` §6；`temp/plans/loop-core-c01-planning-draft-20260818.md` §8

# Decision-021：WP-1（入口归一化合同）授权

## 状态

Accepted（2026-08-19，Current User 授权）

## 背景

C01 规划定案后，按逐 WP 授权粒度，WP-1（LOOP-CORE-C01 工作包 1：入口归一化合同）为第一个工作包。

## 问题

WP-1 的执行范围与排除边界如何界定？

## 决策

授权 WP-1，scope：① run journal 新增 requirementId 查询接口（`listRunsByRequirement` / `findLatestRunByRequirement`，fail-closed 校验，corruption-first 验证）——支撑跨入口恢复；② 入口合同标准文档 `ai-sdlc/loop-entry-contract.md`（Requirement ID 规则、来源记录、新/补充/变更/返工/反馈分类、运行记录创建与恢复、阻塞条件）；③ 相关测试。明确排除：binding 实现（WP-3）、任何 Agent 真实调用、Git 发布动作、Ready/merge/publication。

## 原因

逐 WP 授权粒度（Decision 3）下，WP-1 是入口能力的最小可验收包；查询接口是已确认缺口（R1 复核）。

## 影响

WP-1 完成后按收口流程：实施 handoff（exchange + 10-projects）→ review → 用户裁决 → closure 登记。

## 实现状态

实施完成（run journal 查询接口 + 测试 30/30 通过；入口合同文档待提交）。

## 代码依据

`core/loop-run-store.ts`；`tests/loop-run-requirement-query.test.ts`；`ai-sdlc/loop-entry-contract.md`

# Decision-022：WP-1 收口（用户复审 Approved）

## 状态

Accepted（2026-08-19）

## 背景

WP-1 实施后经 review round 1（CHANGES_REQUESTED，3 项 P1）与 consolidated correction（产品 2dbd87a），用户复审 Approved。

## 问题

WP-1 是否满足完成合同并可收口？

## 决策

WP-1 收口：登记 `completed_requirements.WP1_ENTRY_NORMALIZATION`（closure_basis + 证据 + fact HEAD），消费 `WP1_ENTRY_NORMALIZATION` 授权（consumed/COMPLETED）。WP-2 仍需单独用户授权，WP-1 通过不构成对 WP-2 的授权。

## 原因

收口流程要求：review 通过 → 用户裁决 → closure 登记。

## 影响

入口合同（v0.1.1）与 requirementId 查询接口成为 C01 已验收能力；WP-2（Node Capability Contract）等待单独授权。

## 实现状态

已收口（控制平面 STATE 登记 8c88e06 后更新；closure handoff 发布中）。

## 代码依据

`docs/LOOP-CORE-C01-PLAN.md` §5/§9.3；控制平面 `projects/ai-sdlc/STATE.yaml`
