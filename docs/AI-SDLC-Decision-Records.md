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

# Decision-023：WP-2（Node Capability Contract）授权

## 状态

Accepted（2026-08-19，Current User 授权）

## 背景

WP-1 收口后，按逐 WP 授权粒度，WP-2（Node Capability Contract）为第二个工作包。

## 问题

WP-2 的执行范围与排除边界如何界定？

## 决策

授权 WP-2，scope：① 定义能力类型清单（需求归一化、技术方案生成、方案挑战、方案审核、实现、代码审核、测试验收——能力类型，非 Agent 专属名）；② 每个节点合同声明输入、输出、Gate、副作用边界（不出现 Agent 名）；③ 处理 `loop/types` 静态 `AgentMapEntry` 的废弃/兼容决策；④ 标准文档 `ai-sdlc/node-capability-contract.md` 与类型定义、合同完整性测试。明确排除：binding 实现与注册（WP-3）、任何 Agent 真实调用、Git 发布动作、Ready/merge/publication。

## 原因

逐 WP 授权粒度（Decision-3）下，WP-2 是"能力与 Agent 解耦"的最小可验收包；节点模型脱离 Agent 是 Decision-020（全能力模型）的前提。

## 影响

WP-2 完成后，节点模型以能力为唯一合同面；binding（WP-3）只做选择，不定义节点。

## 实现状态

实施中。

## 代码依据

`docs/LOOP-CORE-C01-PLAN.md` §4 WP-2；`docs/LOOP_CORE_CONTRACT.md` §6.1

# Decision-024：WP-2 收口（用户复审 Approved）

## 状态

Accepted（2026-08-19）

## 背景

WP-2 实施后经三轮 review（round 1：2 P1 + 1 P2；round 2：1 P1 假守卫；round 3：1 P1 fail-open 解析器 + 1 P2 陈旧声明）与三轮 consolidated correction，用户复审 Approved。

## 问题

WP-2 是否满足完成合同并可收口？

## 决策

WP-2 收口：登记 `completed_requirements.WP2_NODE_CAPABILITY_CONTRACT`（closure_basis + 证据 + fact HEAD），消费 `WP2_NODE_CAPABILITY_CONTRACT` 授权（consumed/COMPLETED）。WP-3 仍需单独用户授权，WP-2 通过不构成对 WP-3 的授权。

## 原因

收口流程要求：review 通过 → 用户裁决 → closure 登记。

## 影响

七个 Agent 中立节点能力合同（文档 §4 单一规范源 + fail-closed 解析守卫）成为 C01 已验收基线；binding 层（WP-3）可直接消费机器投影选择执行者。

## 实现状态

已收口（控制平面 STATE 登记；closure handoff 发布中）。

## 代码依据

`docs/LOOP-CORE-C01-PLAN.md` §5/§9.3；控制平面 `projects/ai-sdlc/STATE.yaml`

# Decision-025：WP-3（Agent Capability Binding 层）授权

## 状态

Accepted（2026-08-19，Current User 授权）

## 背景

WP-2 收口后，按逐 WP 授权粒度，WP-3（Agent Capability Binding 层）为第三个工作包。

## 问题

WP-3 的执行范围与排除边界如何界定？

## 决策

授权 WP-3，scope：① binding schema（版本化、enable/disable、输入输出合同、结果校验器、副作用/超时/失败边界）；② 全能力矩阵注册（7 能力 × 3 Agent = 21 bindings；codex enabled、kimi/hermes disabled，符合 Decision-020 全能力模型）；③ codex 请求类型从 `code_generation` 扩展至全部 7 个节点能力；④ binding 替换守卫测试（替换不改变 Requirement ID、产物 schema、finding 语义、Re-Gate 路由、人工 Git 边界）；⑤ 标准文档 `ai-sdlc/agent-capability-binding.md`。明确排除：真实 Agent 调用（real dispatch 保持 feature-flagged）、任何 Git 发布动作、节点合同修改（WP-2 已验收）、Ready/merge/publication。

## 原因

逐 WP 授权粒度（Decision-3）下，WP-3 是"可替换 binding"的最小可验收包；节点合同面（WP-2）已就绪，binding 只做选择与校验。

## 影响

WP-3 完成后，任意节点 × 任意 Agent 的组合可由配置表达；替换 binding 不改变节点合同（LOOP Core Contract §6 验收）。

## 实现状态

实施中。

## 代码依据

`docs/LOOP-CORE-C01-PLAN.md` §4 WP-3；`docs/LOOP_CORE_CONTRACT.md` §6.2

# Decision-026：WP-3 收口（用户复审 Approved）

## 状态

Accepted（2026-08-19）

## 背景

WP-3 实施后经四轮 review（round 1：registry 快照/端到端/AST 字段锁；round 2：能力 prompt/解析/真实分支；round 3：敏感输入输出/超限；round 4：空输出）与四轮 consolidated correction，用户复审 Approved。

## 问题

WP-3 是否满足完成合同并可收口？

## 决策

WP-3 收口：登记 `completed_requirements.WP3_AGENT_CAPABILITY_BINDING`（closure_basis + 证据 + fact HEAD），消费 `WP3_AGENT_CAPABILITY_BINDING` 授权（consumed/COMPLETED）。WP-4 仍需单独用户授权，WP-3 通过不构成对 WP-4 的授权。

## 原因

收口流程要求：review 通过 → 用户裁决 → closure 登记。

## 影响

不可变 binding registry（每能力恰一 enabled 执行者）、全能力矩阵（codex enabled、kimi/hermes disabled）、能力感知 prompt/解析/校验（含敏感/超限/空输出 fail-closed）成为 C01 已验收基线；WP-4 可在其上实现执行溯源与跨入口恢复。

## 实现状态

已收口（控制平面 STATE 登记 ef41d58；closure handoff 发布中）。

## 代码依据

`docs/LOOP-CORE-C01-PLAN.md` §5/§9.3；控制平面 `projects/ai-sdlc/STATE.yaml`

# Decision-027：WP-4（执行溯源与跨入口恢复）授权

## 状态

Accepted（2026-08-19，Current User 授权）

## 背景

WP-3 收口后，按逐 WP 授权粒度，WP-4（执行溯源与跨入口恢复）为第四个工作包。

## 问题

WP-4 的执行范围与排除边界如何界定？

## 决策

授权 WP-4，scope：① run journal 事件 schema 扩展（每次节点执行记录 bindingId、bindingVersion、inputArtifactRef，nullable 向后兼容 + 旧库列迁移 + fail-closed 校验）；② 执行溯源辅助（recordNodeExecution）；③ 跨入口恢复协议（recoverRunContext：以 Requirement ID 定位最新已验证 run，恢复当前阶段/attempt/fixRound/阻塞与失败原因/最近执行溯源，基于 WP-1 查询接口）；④ 标准文档 ai-sdlc/loop-recovery-protocol.md；⑤ 相关测试。明确排除：checkpoint 发布 phase（D10-A 发布语义不进 C01）、真实 Agent 调用、Git 发布动作、Ready/merge/publication。

## 原因

逐 WP 授权粒度（Decision-3）下，WP-4 是"每节点可记录实际 binding 和输入/输出来源"与"跨入口恢复"的最小可验收包（C01 完成合同第 1、2 条）。

## 影响

WP-4 完成后，每次节点执行可追溯 binding 与输入/输出来源；入口可跨会话恢复同一 Requirement。

## 实现状态

实施中。

## 代码依据

`docs/LOOP-CORE-C01-PLAN.md` §4 WP-4；`docs/LOOP_CORE_CONTRACT.md` §6.2

# Decision-028：WP-4 复审缺口处置与 WP-4B（执行溯源完整性与生产接线）授权拆分

## 状态

Accepted（2026-08-19，Current User 裁决）

## 背景

WP-4 实施后经四轮复审：round 1（真实旧库 STORE_CORRUPT → 迁移事务验证旧 hash 并原子重算）、round 2（读取侧双形态 hash 引入降级绕过 → 单一形式严格校验）、round 3（recordNodeExecution 裸 TypeError、迁移原子性未含补列 → 输入边界 fail-closed + 单事务回滚）、round 4（输入形状校验顺序、user_version 严格校验、返回值冻结已修；其余三项 P1 超出 Decision-027 授权）：P1-2 公开 appendEvent 可写入无溯源节点事件；P1-3 溯源/恢复模型缺 adapter/Agent 实际执行者标识与版本、有效产物版本、Gate、未解决 finding、下一步资格；P1-4 recordNodeExecution/recoverRunContext 无生产调用方，ExecutionGateway 未接线。

## 问题

超出 Decision-027 授权的 P1-2/3/4 如何处理？WP-4 与 C01 能否标记完成？

## 决策

1. WP-4 范围维持 Decision-027 不变；round 4 授权内修正（输入形状校验、user_version fail-closed、返回值冻结）完成后进入复审收口流程，不自行登记完成。
2. P1-2/3/4 拆分为 **WP-4B（执行溯源完整性与生产接线）**（命名避开计划文档既有"WP-5：验证与守卫"），授权 scope：
   - 溯源模型扩展：adapter/Agent 实际执行者标识与版本的历史快照（binding 更换后可反查历史实际执行者）、有效产物版本、Gate 结果、未解决 finding、下一步资格（具体字段在 WP-4B 方案阶段定稿，保持事件 schema 版本化与 fail-closed）；
   - 写入层强制：ExecutionGateway 接线后，stage_started/stage_succeeded/stage_failed 必须携带溯源（含 stage_succeeded 的输出产物引用约束，在 WP-4B 定稿）；journal 层 appendEvent 保持 WP-1 已验收的通用语义不变，不在存储层强制；
   - 接线：ExecutionGateway 携带 run journal 与 binding registry，真实节点执行必经 recordNodeExecution（或其后继 API）；至少一个真实入口接入 recoverRunContext 并恢复同一 Requirement；
   - 对应测试与 ai-sdlc/loop-recovery-protocol.md 更新。
   - 排除不变：checkpoint 发布 phase、真实 Agent 调用、Git 发布动作、Ready/merge/publication。
3. 在 WP-4B 收口前，C01 完成合同第 1、2 条不得登记为完整需求完成；计划文档"WP-5：验证与守卫"的验收以 WP-4B 收口为前置。

## 原因

Decision-027 只授权三个可空字段、helper 与最小恢复上下文；模型扩展与生产接线属于新的授权边界，不应与"已完成"混淆（复审裁决要求）。写入侧强制依赖接线落地，提前在 journal 层强制会回溯破坏 WP-1 已验收语义与存量测试。

## 影响

WP-4 收口路径清晰（Decision-027 范围内复审）；WP-4B 成为 C01 完成合同第 1、2 条的收口前提；ai-sdlc/loop-recovery-protocol.md §6 已如实标注边界与拆分去向。

## 实现状态

已登记；WP-4B 待排期实施。

## 代码依据

`docs/LOOP-CORE-C01-PLAN.md` §4 WP-4/WP-5；`ai-sdlc/loop-recovery-protocol.md` §6；`docs/LOOP_CORE_CONTRACT.md` §6.2

# Decision-029：WP-4 收口（用户复审通过，仅限 Decision-027 窄范围）

## 状态

Accepted（2026-08-19，Current User 裁决通过）

## 背景

WP-4 经五轮复审：round 1 真实旧库 hash 兼容（迁移事务验证旧 hash 并原子重算为扩展格式）；round 2 读取侧双形态 hash 降级绕过（恢复单一形式严格校验）；round 3 输入边界裸 TypeError 与迁移原子性（fail-closed + 单事务回滚含补列）；round 4 输入形状校验顺序、`user_version` 严格校验、返回值冻结，及 P1-2/3/4 授权拆分（Decision-028）；round 5 透明/revoked/带 trap Proxy 经 `util.types.isProxy` 在反射前拒绝、验收映射同步 WP-4B。用户裁决：WP-4（Decision-027 窄范围）通过。

## 问题

WP-4 是否满足 Decision-027 授权范围内的完成合同并可收口？

## 决策

WP-4 收口：登记 `completed_requirements.WP4_EXECUTION_PROVENANCE_RECOVERY`（closure_basis + 证据 + fact HEAD），消费 `Decision-027` 授权（consumed/COMPLETED）。同时约束：

- C01 完成合同第 1、2 条不得完成登记，直至 WP-4B（Decision-028）实施、验证、复审完成；
- WP-4B 授权不在本轮消费；
- 控制平面 STATE 登记与 closure handoff 在提交后按既定治理流程进行。

## 原因

五轮复审的全部 P1/P2 已闭合：旧 hash 迁移原子重算、读取单一 hash 形式、输入边界 fail-closed（含 Proxy）、格式版本 fail-closed、返回值不可变、文档与验收映射一致。超出 Decision-027 的完整性缺口已正确拆分为 WP-4B，不与"已完成"混淆。

## 影响

run journal 事件溯源三字段（含旧库原子迁移与篡改 fail-closed）、recordNodeExecution（fail-closed 输入边界、冻结返回）、recoverRunContext（最小恢复上下文）成为 C01 已验收基线；WP-4B 可在其上扩展完整模型与生产接线。

## 实现状态

已裁决通过；库内文档已更新（ai-sdlc/loop-recovery-protocol.md 0.2.0）。closure 登记（fact HEAD）与控制平面 STATE 登记待提交后执行。

## 代码依据

`docs/LOOP-CORE-C01-PLAN.md` §4 WP-4/§5；`ai-sdlc/loop-recovery-protocol.md`；`docs/LOOP_CORE_CONTRACT.md` §6.2

# Decision-030：三仓库常驻分支策略

## 状态

Accepted（2026-08-19，Current User 指令）

## 背景

C01 实施期间产品仓库使用 `feature/loop-core-contract-roadmap`、控制平面使用 `feature/ai-sdlc-loop-core-rebaseline` 作为临时工作分支，产生合并与多分支管理负担。用户明确指令收敛分支模型，不再随意新增开发分支。

## 问题

三个仓库各自的常驻工作分支是什么，临时功能分支如何处置？

## 决策

- 产品仓库（ai-sdlc-standard）：常驻 `feature/loop-runtime-v1`；C01 全部工作（WP-1~WP-4，至 `0e18a2a`）经 merge commit 合并入该分支，此后以其为唯一工作分支；`feature/loop-core-contract-roadmap` 在合并验证后删除（本地与远端）。
- 控制平面（ai-project-control-plane）：常驻 `main`，直接提交并推送；`feature/ai-sdlc-loop-core-rebaseline` 在 main 推送后删除（本地与远端）。
- PKB（personal-knowledge-base）：常驻 `feature/knowledge-base-v1`（已是当前唯一开发分支，无需变更）。
- 后续工作不得新增长期并行的开发分支；确需临时分支时须在使用完毕后即合并回常驻分支并删除。

## 原因

减少合并面与分支漂移；STATE、Exchange、PKB 中登记的 source_commit 均为主干可达提交，分支收敛不影响已发布材料的 provenance 可追溯性。

## 影响

`projects/ai-sdlc/STATE.yaml` 的 `repository_observation.last_observed.current_rebaseline_worktrees` 更新为 product=`feature/loop-runtime-v1`、control=`main`；两个临时功能分支删除后，任何续作（含 WP-4B）直接在上述常驻分支上进行。

## 实现状态

已执行：产品合并提交后推送 `feature/loop-runtime-v1`；控制平面 STATE 更新随 `main` 推送；临时分支删除。

## 代码依据

`projects/ai-sdlc/STATE.yaml` repository_observation；产品 merge commit（loop-core-contract-roadmap → loop-runtime-v1）

# Decision-031：WP-4B 能力执行事件流与生产接线方案

## 状态

Accepted（2026-08-19，Current User 明确授权执行 WP-4B，并授权产品仓库 commit/push）

## 背景

Decision-028 将 WP-4 复审中超出原授权的三项缺口拆为 WP-4B：完整执行者快照与产物/Gate/finding/资格模型、ExecutionGateway 写入侧强制、至少一个按 Requirement ID 创建或恢复的受支持入口。现有 `LoopStageName` 是八个交付阶段，而 C01 `NodeCapabilityId` 是七个产品能力，两者不是同一命名空间。

## 问题

WP-4B 如何在不破坏 WP-1 已验收的八阶段状态机和通用 `appendEvent` 语义的前提下，形成可验证、可恢复、不可伪造通过的生产执行链？

## 决策

1. 在同一 SQLite run journal 中新增正交的版本化 `loop_capability_executions` 事件流；其 per-run sequence、canonical hash、固定字段集和状态转移独立于八阶段 delivery cursor，但普通 run snapshot 读取同时验证两条事件流，任一损坏均 `STORE_CORRUPT`。
2. 能力尝试固定记录实际 binding/registry 快照、Agent/adapter/executor 版本、输入/输出产物引用与版本、Gate、未解决 findings 引用、下一步资格及失败可重试性；不持久化 prompt/stdout/stderr/任意 JSON。
3. 七能力严格按 canonical chain 执行。started 是互斥 claim；只有取得 claim 的 Gateway 才能 dispatch。Gateway 从 binding registry 选择实际执行者，shadow、Agent 不匹配、错误产物类型、缺失结构化 Gate/finding 或安全落盘失败均写为 failed attempt，不产生有效输出。
4. 新增受支持入口 `LoopCapabilityEntry`：按 Requirement ID 创建或恢复同一 run，验证内容寻址输入，并强制下一能力消费前一能力的有效输出；入口调用已配置 journal/artifact store/binding registry 的 ExecutionGateway。
5. journal 格式升为 v2；v1→v2 在单事务内建表、校验完整 schema/约束并落版本标记。v2 缺表、字段/约束漂移或事件 hash/chain 损坏均 fail-closed。
6. 仍排除 checkpoint 发布 phase、真实 Agent 调用、Ready/merge/publication。用户本轮授权的 commit/push 仅用于发布本次产品仓库实现，不改变 LOOP Core 的人工 Git 边界。

## 原因

把七能力强行映射为八交付阶段会制造错误业务语义；正交事件流可保持已验收状态机兼容，同时让 Capability Execution 成为强制溯源写入边界。结构化 Gate/finding 与严格产物 lineage 防止“有文本输出即通过”和跨节点替换输入。

## 影响

WP-4B 实现完成后，C01 完成合同第 1、2 条具备产品代码和测试证据，但在用户复审裁决前不登记完成、不消费授权。WP-5 仍负责完成合同第 3、4 条的综合守卫与最终验收。

## 实现状态

Round 1 `CHANGES_REQUESTED` 的两项发现已完成产品修正，等待用户重新复审，授权仍未消费：

- 中断恢复：journal 新增原子 interruption terminal API；受支持入口在 active claim 的 capability/lineage 完全匹配后，复制其历史执行者快照并按 binding failurePolicy 关闭、重试；`RUNNING` 不再暴露不可执行的 `nextCapability`；
- tracing 强制：配置 capabilityTracing 的 Gateway 对缺少 loopExecution 的 canonical capability 请求在 dispatch 前 `INVALID_INPUT`；legacy 非 capability 类型不受影响；
- 回归覆盖 claim 后、dispatch 中、terminal 写入前三个中断窗口，以及无 tracing context 绕过的零写入/零 dispatch 负例。

产品仓库 correction 的 commit/push 继续沿用本轮明确授权；目标常驻分支受保护时使用最小合规 PR 路径。

## 代码依据

`core/loop-capability-execution.ts`；`core/loop-capability-entry.ts`；`core/loop-run-store.ts`；`core/loop-recovery.ts`；`execution/gateway.ts`；`tests/loop-capability-execution.test.ts`

# Decision-032：WP-4B 复审通过与 C01 完成合同第 1、2 条收口

## 状态

Accepted（2026-08-19，Current User 裁决并授权执行收口）

## 背景

WP-4B 首次实现（`b27e551`，经 PR #80 合入 `5cd5b66`）完成 capability execution 事件流、完整执行者/产物/Gate/finding/资格模型、ExecutionGateway 强制溯源和 `LoopCapabilityEntry`。独立复审 round 1 提出两项未闭合问题：进程在 started claim 后中断会使 run 永久 wedge；配置 tracing 的 Gateway 仍允许 canonical capability 在缺少 `loopExecution` 时无溯源 dispatch。修正提交 `6c548e9` 经 PR #81 合入 `d886eaa`。

Round 2 独立复审重新执行 WP-4B 专项 86/86、全量 `npm test`、`tsc --noEmit` 与提交区间 `git diff --check`，并对 claim 后恢复、过期 started id、错误 lineage、错误 capability、binding 替换、interrupt 幂等和无 tracing context 绕过进行对抗验证，均符合合同；用户据此裁决通过并指令执行收口。

## 问题

WP-4B 是否已闭合 Decision-028/031 的完整性与生产接线范围，并可消费授权、登记 C01 完成合同第 1、2 条完成？

## 决策

1. WP-4B 通过并收口；控制平面消费 `WP4B_PROVENANCE_MODEL_COMPLETENESS_AND_WIRING` 授权并登记完成需求。
2. C01 完成合同第 1 条“至少一个已支持入口创建或恢复同一 Requirement”和第 2 条“每节点可记录实际 binding 和输入/输出来源”由 WP-4 + WP-4B 联合证据登记完成。
3. `ai-sdlc/loop-recovery-protocol.md` 升为 0.4.0 Accepted；本计划的 WP-4B 与验收映射同步为已完成。
4. C01 完成合同第 3、4 条仍属于 WP-5。本决定不授权 WP-5，也不扩大 checkpoint 发布、真实 Agent、自动 Git/Ready/merge/publication 等边界。

## 原因

Round 1 的两个问题均在真实生产边界闭合：受支持入口可按已持久化 started claim 的历史 binding policy 原子记录中断失败并重试，且不会伪造或改写历史执行者；配置 tracing 的 Gateway 对缺少 `loopExecution` 的 canonical capability 在 dispatch 和 journal 写入前 fail-closed。Round 2 对抗复核未发现新的完整性或恢复缺口。

## 影响

跨入口恢复与完整执行溯源成为 C01 已验收基线。后续工作只能在获得单独授权后进入 WP-5，验证 binding 替换不改变契约与失败尝试不伪造通过；C01 在第 3、4 条完成前仍不整体收口。

## 实现状态

已裁决通过；产品仓库收口文档、控制平面 STATE、Exchange closure handoff 与 PKB current 指针按既定治理流程发布。

## 代码依据

`core/loop-capability-execution.ts`；`core/loop-capability-entry.ts`；`core/loop-run-store.ts`；`core/loop-recovery.ts`；`execution/gateway.ts`；`tests/loop-capability-execution.test.ts`；`ai-sdlc/loop-recovery-protocol.md` 0.4.0；`docs/LOOP-CORE-C01-PLAN.md` §4/§5/§10

# Decision-033：WP-5 验证与守卫实施方案

## 状态

Accepted（2026-08-19，Current User 明确授权执行 WP-5，并沿用产品仓库 commit/push 授权）

## 背景

WP-4 + WP-4B 已完成 C01 完成合同第 1、2 条。剩余第 3 条要求 binding 替换不能改变 Requirement ID、产物 schema、finding 语义、Re-Gate 路由或人工 Git 边界；第 4 条要求不可用、超时或不合格结果形成可恢复失败尝试而非伪造通过。WP-3 已有静态 binding schema 与不可变 replacement，WP-4B 已有 durable capability attempt，但尚缺 production runtime registry 校验、统一 timeout、不可用分类、迟到结果丢弃和跨替换综合守卫。

## 问题

如何在不引入真实 Agent、自动 Git/发布或 C02 Re-Gate 编排的前提下，为第 3、4 条建立可执行、可恢复、可独立复审的生产边界？

## 决策

1. 增加 `validateBindingRegistry` 作为 replacement 与 traced Gateway 共用的 fail-closed 边界：深冻结固定字段集、完整 7×3 矩阵、canonical contract 与副作用、每能力唯一 enabled；replacement 只允许同能力 enabled source → disabled target。
2. Node Capability Contract 在运行时深冻结；replacement 只能生成新 registry 快照并切换 enabled，不能修改节点合同、产物类型、finding/Gate 解释或人工 Git 边界。
3. ExecutionGateway 按 binding `timeoutMs` 约束 durable dispatch，并将不可用/shadow、timeout、exception、output contract violation 分别记录为稳定 failed attempt；失败不产生 output ref/digest。
4. adapter 不支持取消时，迟到完成值/异常只能被观察并丢弃；恢复必须以 attempt + 1 fresh dispatch，不得复用 shadow、迟到或历史结果。
5. `tests/loop-validation-guards.test.ts` 通过默认 `npm test` 执行，综合覆盖 replacement、unavailable、timeout、late result、unqualified output、fresh retry、历史执行者快照与 finding 阻塞。
6. 排除：真实 Agent 启用、新 Provider、C02 Re-Gate 编排、checkpoint 发布、自动 commit/push/PR/Ready/merge/publication。产品仓库的人工 commit/push 是治理发布动作，不构成 LOOP capability 副作用。

## 原因

静态 TS 类型和孤立 helper 测试不能约束运行时注入的 registry，也不能证明超时或 shadow 不会成为有效结果。把校验、timeout 与失败 terminal 放在 traced Gateway 的 durable 边界，才能使恢复上下文只接受已验证事实，同时保持 WP-2/WP-3 合同不变。

## 影响

产品实现具备 C01 第 3、4 条的候选证据，但在独立复审与用户裁决前保持未完成：不消费 WP-5 授权，不登记 C01 第 3、4 条或 C01 整体完成。复审若发现问题，继续在本授权范围内修正。

## 实现状态

产品实现与专项测试已完成，等待独立复审；治理收口未执行。

## 代码依据

`core/agent-capability-bindings.ts`；`core/node-capability-contracts.ts`；`execution/gateway.ts`；`tests/loop-validation-guards.test.ts`；`ai-sdlc/loop-validation-guards.md`

# Decision-034：WP-5 复审通过与 C01 整体收口

## 状态

Accepted（2026-08-19，Current User 接受独立复审结论并指令执行 WP-5 与 C01 收口）

## 背景

WP-5 实现提交 `24bee8d` 经 PR #83 合入常驻分支 `feature/loop-runtime-v1`，merge commit 为 `432c705c35d24183a524382554814c9c319ace7f`。实现增加 BindingRegistry 运行时 fail-closed 校验、契约保持 replacement、节点能力合同深冻结，以及 traced ExecutionGateway 对不可用、超时、异常、不合格输出、迟到结果和 fresh retry 的持久语义。实施 handoff 已经 Exchange run `20260819T150020Z-ai-sdlc-wp5-validation-guards` 与 PKB 镜像发布，但明确保持“等待独立复审”，未消费授权或登记 C01 第 3、4 条完成。

独立复审覆盖 `57cd272..432c705` 的全部 11 个变更文件，复跑 WP-5 49/49、WP-4B 86/86、binding 537/537、node contract 144/144、默认 `npm test`、typecheck 与 diff-check；另执行 53 项 registry 边界探针和 6 组时序/恢复场景。复审确认 C01 第 3、4 条均 PASS，无未解决 P1/P2，并提出三项非阻塞 P3：registry 错误类型可统一、等值 timeout 竞态可补充确定性说明、当前 21-binding 全量校验的性能仅作观察。

## 问题

WP-5 是否已经在真实入口、Gateway、journal 与 artifact store 路径闭合 C01 完成合同第 3、4 条，并可消费授权、登记 C01 整体完成？

## 决策

1. 接受独立复审 `APPROVED` 结论；WP-5 通过并收口。
2. C01 完成合同第 3 条“binding 替换不改变 Requirement ID、产物 schema、finding 语义、Re-Gate 路由或人工 Git 边界”由 WP-2、WP-3、WP-5 联合证据登记完成。
3. C01 完成合同第 4 条“不可用、超时或不合格结果产生可恢复失败尝试而非伪造通过”由 WP-3、WP-4B、WP-5 联合证据登记完成。
4. C01 第 1～4 条至此全部完成，`LOOP-CORE-01` 整体收口；控制平面消费 `WP5_VALIDATION_AND_GUARDS` 授权并登记 WP-5 与 C01 完成。
5. `ai-sdlc/loop-validation-guards.md` 升为 0.2.0 Accepted；binding、recovery 协议与 C01 计划同步最终验收状态。
6. 三项 P3 作为非阻塞观察保留，不建立 material open finding，也不阻止收口。
7. 收口不授权真实 Agent 启用、新 Provider、C02 Re-Gate 编排、checkpoint 发布或自动 Git/PR/Ready/merge/publication。C02 仅成为 Roadmap 上的下一规划候选，不因 C01 完成自动获得执行授权。

## 原因

独立复审不仅验证已有测试，还对运行时输入反射边界、深冻结、Symbol/非枚举字段、Proxy/accessor、矩阵和 timeout 上下界进行对抗检查；并验证 timeout 迟到 resolve/reject、等值竞态、terminal 写入失败恢复、binding 替换后重试与 finding 阻塞。结果证明 replacement 只改变 registry version 和同能力 enabled 选择，历史执行者与 lineage 不被改写；失败 attempt 不产生有效输出，shadow、迟到或历史结果不能冒充本次成功，恢复通过 fresh attempt 继续。

## 影响

`LOOP-CORE-01` 成为已完成、可恢复的入口与可替换 binding 基线。Roadmap 的下一依赖项是 `LOOP-CORE-02`，但其规划、授权和实施必须另行登记；本决定不扩展 C01 已验收边界。

## 实现状态

用户已最终裁决通过；产品收口文档通过受保护分支 PR 发布后，按既定机制登记控制平面、Exchange closure handoff 与 PKB current 指针。

## 代码与验证依据

`core/agent-capability-bindings.ts`；`core/node-capability-contracts.ts`；`core/loop-capability-entry.ts`；`execution/gateway.ts`；`tests/loop-validation-guards.test.ts`；`ai-sdlc/loop-validation-guards.md`；实现 merge `432c705c35d24183a524382554814c9c319ace7f`；独立复审 49/86/537/144、默认 `npm test`、typecheck、diff-check、53 项 registry 探针与 6 组时序/恢复场景。

# Decision-035：授权 LOOP-CORE-02 有界规划，实施保持未授权

## 状态

Accepted（2026-08-20，Current User 明确“授权开始 C02 有界规划”）

## 背景

Decision-034 已收口 WP-5 与 LOOP-CORE-01；控制平面已将 active sub-requirement 指向 `LOOP-CORE-02`，四项 completion contract 保持 `INCOMPLETE / NOT_AUTHORIZED`，下一有效边界是 C02 bounded implementation planning authorization。C02 Roadmap 合同已经 `DEFINED`，但尚无基于 C01 最终 Source 事实的工作包分解、复用审计和验收映射。

## 问题

是否可以开始 C02 的有界规划；本次授权是否同时包含任一 C02 实现、Agent 调用、目标项目修改或外部发布？

## 决策

1. 授权读取当前产品/控制平面权威源，执行 C02 decomposition assessment 和能力复用审计。
2. 在产品仓库生成 `docs/LOOP-CORE-C02-PLAN.md` 规划草案，覆盖工作包、依赖、设计不变量、验收映射、风险、排除项和待用户裁决点。
3. 规划草案状态为 `DRAFT FOR USER REVIEW`；通过受保护分支的 Draft PR 提交供审阅，不因文件落库自动成为 Accepted implementation contract。
4. 控制平面只登记本次规划授权、草案位置和下一审阅边界，不复制规划全文，不把 C02 任一完成项改为 completed。
5. 本授权不包含 C02 工作包实现、真实 Agent 调用、Kimi/Hermes 启用、C03/C04/C05、目标项目 workspace 修改、LOOP runtime Git 副作用或 Exchange/PKB 外部发布。
6. 规划被 Current User 接受后，再逐 WP 单独授权；在此之前不得启动 C02-WP1。

## 原因

Shared `PROJECT_CONTROL.md` §14 要求在首次 material execution 前基于父目标、完成合同和当前 Source 做最小充分分解；Roadmap 与 STATE/Execution 必须分权。C01 已提供入口、binding、attempt、Gate/finding 和恢复基底，但 C02 仍缺 current artifact revision、finding lifecycle、下游失效和 Re-Gate generation，因此必须先形成可审阅的持久规划合同，不能从聊天直接进入实现。

## 影响

项目从“C02 等待规划授权”进入“C02 规划草案编制与审阅”状态。C02 Roadmap 定义不改变；四项完成合同和全部实现权限保持未授权。产品规划草案成为审阅对象，控制平面下一边界切换为用户审阅/裁决 C02 规划。

## 实现状态

规划授权已生效；Source 审计与规划草案编制中。规划草案须经 commit、push、Draft PR 和文档/基线验证后交付用户审阅；未开始任何 C02 实现。

## 代码与验证依据

`docs/AI-SDLC-Autonomous-Delivery-Roadmap.md` §4 `LOOP-CORE-02`；`docs/LOOP_CORE_CONTRACT.md` §2/§4/§5；`docs/LOOP-CORE-C02-PLAN.md`；C01 closure merge `93e9c45f1b8ae8512451090284ce90d715429458`；控制平面 baseline `515fa2193e55a79f15c01e20225d87ca14a8331d`。

# Decision-036：接受 LOOP-CORE-02 有界规划并授予 planning handoff 发布授权

## 状态

Accepted（2026-08-20，Current User 裁决接受 C02 规划全部六个裁决点，并澄清第 6 点后一并授予 planning handoff 发布授权）

## 背景

Decision-035 授权的 C02 有界规划草案 `docs/LOOP-CORE-C02-PLAN.md` 已通过产品提交 `791f8de` 以 Draft PR #85 发布供审阅；控制平面已登记 `C02_PLAN_DRAFT_AWAITING_USER_REVIEW` 与 `LOOP_CORE_C02_PLAN_REVIEW_GATE`。规划 §11 列出六个待用户裁决点，未裁决前 C02 四项完成合同保持 `INCOMPLETE / NOT_AUTHORIZED`，不得启动 C02-WP1。

## 问题

Current User 是否接受六个裁决点（工作包分解与顺序、change kind 五 token、双权威边界、append-only generation、逐 WP 流程、planning handoff 发布安排）；其中第 6 点"单独授权发布"是指本次裁决一并授予，还是覆盖后续所有流程的逐次授权要求？

## 决策

1. 接受六个工作包（C02-WP1～WP6）及依赖顺序（WP1/WP2 可并行设计，WP3 依赖 WP2，WP4 依赖 WP1～3，WP5 依赖 WP4，WP6 最终综合验收）。
2. 接受 change kind 五个 canonical token：`NEW_REQUIREMENT`、`SUPPLEMENT`、`CHANGE`、`REWORK`、`FEEDBACK_DRIVEN_CHANGE`。
3. 接受双权威边界：run journal 为 runtime orchestration authority，`manifest.md` 为目标项目 DocFlow/Tail authority，二者交叉绑定，漂移即 STOP。
4. 接受 append-only generation 方案；C01 capability event 历史一律不改写。
5. 沿用 C01 流程：逐 WP 单独授权、实施、独立复审、Current User 裁决、收口登记。
6. 第 6 点澄清：单独授权仅针对本规划的 planning handoff 这一次性发布（因 Decision-035 授权 scope 明确排除了 Exchange/PKB 发布）；Current User 在本次裁决中一并授予该发布授权。后续各 WP 的实施/closure handoff 沿用既有机制、随逐 WP 授权流程发布，不需逐次单独授权。
7. 规划升为 Accepted（v1.0.0），成为正式规划合同；本决定不授权任何 C02 实现、真实 Agent 调用、C03～C05、Ready/merge/publication，C02-WP1 启动仍需单独授权。

## 原因

规划草案已完成 Source 复用审计、缺口确认、设计不变量与验收映射，并经用户逐项审阅；第 6 点的歧义经澄清后按一次性授权处理，避免给既有 handoff 机制增加无必要的逐次审批负担，同时保持 Decision-035 排除项的授权边界显式闭合。

## 影响

项目从"C02 规划草案待审"进入"C02 规划 Accepted、等待 WP-1 单独授权"状态。控制平面登记规划 Accepted、发布授权与发布证据；Exchange/PKB 发布 planning handoff；`next_valid_transition` 指向 C02-WP1 授权边界。规划 Accepted 本身不产生任何执行授权。

## 实现状态

Current User 裁决已记录；规划文档升为 1.0.0 Accepted。随后按既定机制执行：Exchange planning handoff 发布、PKB 归档与 current.md 同 commit 更新、控制平面 STATE 登记。

## 代码与验证依据

`docs/LOOP-CORE-C02-PLAN.md`（v0.1.0 草案，产品提交 `791f8de`，Draft PR #85）；控制平面 `projects/ai-sdlc/STATE.yaml` C02 规划授权与评审登记；Decision-034/035。发布与登记证据（Exchange run、PKB 提交、控制平面提交）以控制平面 STATE 登记为准。
# Decision-037：授权并实施 C02-WP1 需求变更分类合同

## 状态

Accepted（2026-08-20，Current User 单独授权实施 C02-WP1；实现完成后待独立复审）

## 背景

Decision-036 裁决接受 C02 有界规划（`docs/LOOP-CORE-C02-PLAN.md` v1.0.0）全部六个裁决点，但 C02 四项完成合同保持 `INCOMPLETE / NOT_AUTHORIZED`，各工作包需逐 WP 单独授权。Current User 本轮通过控制平面授权条目 `C02_WP1_REQUIREMENT_CHANGE_CLASSIFICATION` 单独授权 C02-WP1：为同一 Requirement 建立机器可判定、可恢复、可审计的 change record，关闭规划 §4 缺口 G1 的分类持久面。C01 已收口的 run journal（SQLite v2、corruption-first、事务迁移）与入口合同 §6 的五类分类语义是直接基线。

## 问题

如何在不触碰 C01 历史、不实现 artifact 失效计算与 Re-Gate dispatch、不接线生产入口的前提下，把"新需求 / 补充 / 变更 / 返工 / 反馈驱动变更"的分类结果以固定 schema 持久化，并满足幂等重放、并发冲突、blocked 持久化与跨入口一致读取的验收要求？

## 决策

1. 新增 `core/loop-change-classification.ts` 纯函数模型：五个 canonical change kind（`NEW_REQUIREMENT`/`SUPPLEMENT`/`CHANGE`/`REWORK`/`FEEDBACK_DRIVEN_CHANGE`）、`FULL_REQUIREMENT`/`DELTA_CHANGE` 载荷形态、来源引用、当前 change scope、confirmed-fact 边界、触发证据、分类原因与 previousGeneration 引用绑定的固定字段 schema；`NEW_REQUIREMENT` 与 `FULL_REQUIREMENT`、其余四类与 `DELTA_CHANGE` 的一致性规则 fail-closed。
2. 分类不确定或来源冲突持久化 BLOCKED 记录：blockedReasonCode 五个 canonical 值对齐入口合同 §8 STOP 条件；BLOCKED 记录不得携带任何分类字段，不猜测业务事实；BLOCKED 非终态，后续记录可携带解决后的分类，历史保持可审计。
3. `core/loop-run-store.ts` 前进到格式 v3：新增 `loop_requirement_changes` 主表与 source refs / confirmed facts / trigger evidence 三个子表（固定标量列，不存 JSON 载荷）；v2→v3 与既有迁移同事务原子完成，失败全回滚、可幂等重试，未知版本/缺表/schema 漂移 fail-closed；C01 历史一行不改。
4. 写入唯一入口为 `appendRequirementChange`：精确重放幂等（`appended: false`），同 id 不同内容 `EVENT_ID_CONFLICT`，同 `(runId, sequence)` 被占用 `EVENT_SEQUENCE_CONFLICT`；terminal run、活动 stage、活动 capability execution 期间拒绝追加；每次快照读取同时验证 change 链（corruption-first）。
5. 跨入口读取经 `listRequirementChanges(runId)` 与 `findLatestRequirementChangeByRequirement(requirementId)`，读到相同分类与 confirmed-fact 边界；requirementId 与创建共用同一校验器。
6. 明确排除：artifact 失效计算、Re-Gate dispatch、generation 推进权威、恢复上下文扩展与生产入口接线、业务实现、真实 Agent 调用、任何 Git/PR/发布副作用；这些属于 WP2～WP6 或完全不做。

## 原因

C01 的 capability attempt journal 只能表达线性能力执行，无法区分"一次新执行"与"对既有 Requirement 的变更"（规划 §4 G1）。把分类合同落为 run journal 内的 append-only change 链，沿用同一迁移与 corruption-first 模式，可以在不引入第二份权威、不改写历史的前提下满足验收：五类正反例由 schema 一致性规则保证，幂等与并发由唯一约束 + canonical hash 重分类保证，blocked 与跨入口一致由持久化记录本身保证。

## 影响

C02-WP1 具备候选实现证据，但在独立复审与 Current User 裁决前保持未完成：不消费 `C02_WP1_REQUIREMENT_CHANGE_CLASSIFICATION` 的收口语义，不登记 C02 任一完成合同项。本决定不授权 C02-WP2～WP6，不扩展真实 Agent、Git/PR/发布或 C03～C05 边界。

## 实现状态

产品实现与专项测试已完成，等待独立复审；治理收口未执行。

## 代码与验证依据

`core/loop-change-classification.ts`；`core/loop-run-store.ts`（v3 迁移与 change 链读写）；`ai-sdlc/loop-change-classification.md` 0.1.0 Draft；`tests/loop-change-classification.test.ts`（100/100，含五类正反例、幂等重放、并发冲突、blocked 持久化、跨入口读取、plain-data/Proxy/accessor/Symbol/注入边界、v2→v3 迁移回滚与幂等重试）；既有断言随格式版本前进更新：`tests/loop-run-provenance.test.ts`（79/79）、`tests/loop-capability-execution.test.ts`（86/86）；完整默认 `npm test`、`tsc --noEmit` 与 `git diff --check` 结果记录在实施 handoff。

# Decision-038：C02-WP1 复审通过与收口

## 状态

Accepted（2026-08-20，Current User 接受 Round 2 独立复审 PASS 结论并裁决 C02-WP1 收口）

## 背景

C02-WP1 由 Decision-037 单独授权并实施：实现提交 `b1d29dc`（WP-1 requirement change classification contract）与 Round 1 修正 `8fecdb3`，经 PR #86 合入常驻分支 `feature/loop-runtime-v1`，merge commit 为 `aaf5e32a4e9719ff8c521c9d29990e8c5d35f6d0`，四项 CI 检查全部 SUCCESS。Round 1 独立复审提出四项 finding：读回记录未与 run identity 交叉绑定（错绑记录可通过校验）、`source:<locator>` 未强制命中本记录 sourceRefs、主表与子表外键 from/to 映射校验不完整、规划基线 PR #85 未合入导致评审依据死链。Round 2 独立复审覆盖 `b1d29dc..85e9602`，确认四项 finding 全部关闭，Result: PASS、无 Critical/High/Medium/Low finding、无阻塞缺口。

## 问题

C02-WP1 是否满足规划 §6 验收（五类正反例、分类与 Requirement ID/source refs/前一 generation 绑定、跨入口恢复一致读取、幂等与并发冲突语义、blocked 持久化），并可消费 `C02_WP1_REQUIREMENT_CHANGE_CLASSIFICATION` 授权完成治理收口？

## 决策

1. 接受 Round 2 独立复审 PASS 结论；C02-WP1 通过并收口。
2. 控制平面消费 `C02_WP1_REQUIREMENT_CHANGE_CLASSIFICATION` 授权并登记 WP1 完成；C02 四项完成合同保持 `INCOMPLETE`（合同 1 需 WP1+WP5+WP6 联合证据，合同 2～4 由 WP2～WP6 覆盖）。
3. `ai-sdlc/loop-change-classification.md` 升为 1.0.0 Accepted；C02 规划同步 WP1 收口状态。
4. 本决定不授权 C02-WP2～WP6，不登记 C02 任一完成合同项，不授权真实 Agent 启用、新 Provider、Git/PR 自动化或 C03～C05。
5. WP1 收口后提出的并发回归改造不属于本次收口范围：若为 WP1 已交付语义的缺陷，按 finding 流程回到 WP1 复审；若为新增 material outcome，回到 C02 规划受控重排（规划 §12）。

## 原因

复审在同一 HEAD 独立复验：loop-change-classification 107/107、loop-run-provenance 79/79、loop-capability-execution 86/86、`tsc --noEmit`、`git diff --check` 与完整 `npm test` 全部通过，工作区干净，远端与本地同为 `85e9602`。四项 Round 1 finding 的修正均被验证为 fail-closed：读回记录与 run identity 交叉绑定，错绑记录重算 hash 后在链、快照、跨入口读取均 STORE_CORRUPT；`source:<locator>` 在构造期与持久化读回均强制命中本记录 sourceRefs；主表与三个子表外键精确校验 from/to 映射；PR #85 合入后规划基线与引用链接可复现。

## 影响

C02 缺口 G1 的分类持久面关闭：同一 Requirement 的每次入口变化具备固定 schema、可恢复、可审计的 change record，run journal 格式前进到 v3 且 C01 历史一行未改。WP2（Artifact Revision Authority）成为下一个可申请授权的工作包；WP1 收口不构成 WP2～WP6 的实施入口。

## 实现状态

用户已最终裁决通过；产品收口文档通过受保护分支 PR 发布后，按既定机制登记控制平面、Exchange closure handoff 与 PKB current 指针。

## 代码与验证依据

`core/loop-change-classification.ts`；`core/loop-run-store.ts`（v3 迁移、change 链读写、外键校验）；`ai-sdlc/loop-change-classification.md` 1.0.0 Accepted；`tests/loop-change-classification.test.ts`（107/107）；`tests/loop-run-provenance.test.ts`（79/79）；`tests/loop-capability-execution.test.ts`（86/86）；实现 merge `aaf5e32a4e9719ff8c521c9d29990e8c5d35f6d0`（PR #86，CI 全绿）；Round 2 独立复审 PASS 与收口前本地复验（107/79/86、`tsc --noEmit`）。
