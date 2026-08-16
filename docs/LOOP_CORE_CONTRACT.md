# AI-SDLC LOOP Core Contract

> Status: Accepted
> Scope: AI-SDLC Standard 的 LOOP Core 产品合同。它定义目标、边界、运行语义和完成条件；不声明当前实现状态，不授予执行、Git 或发布权限。
> Related: [Autonomous Delivery Roadmap](AI-SDLC-Autonomous-Delivery-Roadmap.md) · [Artifact Flow](../ai-sdlc/artifact-flow.md) · [Workflow Design](AI-SDLC-Workflow-Design.md)

## 1. Purpose

LOOP Core 的目标是把一次需求从来源材料推进到可人工接管的、完整可核验的交付结果，避免需求细节只存在于某个 Agent 的聊天上下文中。

使用者可以在已支持的任意入口 Agent 中提供需求，例如 Kimi、Codex 或 Hermes。入口 Agent 不是固定的产品总控；它启动同一个 LOOP，并依据明确的能力映射协调后续 Agent 工作。

LOOP Core 的交付终点是：需求产物、技术决策、实现、审核和验证结果均可追溯，目标仓库工作区具备待人工处理的变更结果。提交、推送、创建或更新 Pull Request、Ready、合并和发布均不属于 LOOP Core。

## 2. Product Principles

1. **产物优先于聊天记忆。** 跨 Agent 的输入必须来自已记录的需求、方案、Gate、实现和验证产物，而不是对前序聊天的假设。
2. **入口一致。** 同一份需求从 Kimi、Codex 或 Hermes 启动，应进入同一套阶段、产物和 Re-Gate 语义。
3. **能力与 Agent 解耦。** 节点只声明所需能力和输出合同；实际 Agent、CLI 或工具由可版本化的显式绑定配置选择，可在不改变 Core 流程的前提下替换。
4. **最早受影响节点返工。** 发现问题时必须回到最早被证据影响的产物节点，并使依赖它的下游产物失效或待重新验证。
5. **复杂度只决定路径，不丢失上游事实。** Direct 与 Speckit 是实现路径分流；它们共享同一份已批准的需求与技术方案事实。
6. **人工保留 Git 决策权。** LOOP 不以远程 Git 副作用作为成功条件，也不自动代替用户做提交或发布决策。

## 3. Entry Contract

入口应以一个可在已支持 Agent 中使用的 Skill 或等价命令提供。它至少接收一份可读取的需求来源：当前对话、飞书/Lark 文档、Markdown、HTML/PDF 提取内容、截图说明或历史资料。

入口必须：

- 建立或识别 Requirement ID；
- 记录来源、优先级、读取方式、冲突和缺失上下文；
- 读取同一 Requirement ID 的既有当前产物和 Gate 状态；
- 判断是新需求、补充、变更、返工还是反馈驱动变更；
- 在无法确定业务目标、范围、来源优先级或必要授权时停止并说明阻塞原因；
- 创建或恢复一个可继续的运行记录，其中至少包含当前节点、有效产物版本、Gate 结果、阻塞项和下一步资格。

入口不应因为启动者不同而重新解释已确认的需求，也不应把不可读取的来源、历史聊天摘要或 Agent 自述当作已确认事实。

## 4. Canonical Artifact Chain

目标项目中的标准产物是跨 Agent 的规范接口。Core 必须以当前有效版本和明确引用维持以下链路：

```text
Requirement Source
  -> 00-需求资料 / 需求摘要
  -> 01-技术方案 / 技术方案
  -> 方案挑战
  -> 02-方案审核 / Development Path Decision
       -> Direct Implementation
       -> Speckit SDD Core
  -> Shared Documentation Governance Tail
  -> 03-实现记录、04-代码审核、05-测试验收
  -> Manual Git Handoff
```

现有 Standard Package 的 `library/{requirement_id}/` 是人工交接和 Gate 视图；复杂需求的 `specs/{feature}/` 是 Speckit 的机器产物。两者通过 Requirement ID、版本、引用和 Gate 关系连接，不能互相替代，也不能形成两套彼此矛盾的业务事实。

LOOP Core 不要求在 AI-SDLC Standard 自身仓库建立 `library/` 目录。本合同是标准库自身的产品文档；具体目标项目才依其适用的标准路径落盘交付产物。

## 5. Core Execution Semantics

### 5.1 Requirement and Design Loop

1. 归一化需求来源，明确业务目标、In Scope、Out of Scope、成功标准、约束、不确定点和来源冲突。
2. 基于当前需求摘要生成或更新技术方案。
3. 执行方案挑战；若发现有效问题，更新最早受影响的需求或技术方案，再执行后续挑战与审核。
4. 执行方案审核。只有审核通过且不存在阻塞项时，才能作出 Development Path Decision。

方案挑战、方案审核和其后的返工都必须引用当前方案版本与已解决/未解决 finding；不得仅凭“再次执行了 Agent”推定问题已关闭。

### 5.2 Development Path Decision

方案审核通过后，Core 必须选择且记录互斥路径：

- **DIRECT_IMPLEMENTATION**：范围和复杂度适合直接实现时，使用已批准的方案、约束、验收要求和代码库事实进入实现。
- **SPECKIT_PIPELINE_REQUIRED**：复杂需求需要完整 SDD 时，进入 Speckit SDD Core。
- **BLOCKED_NEEDS_REVISION**：存在未解决问题、需求变更、风险或缺失事实时，回到最早受影响节点并 Re-Gate。

`specify` 的职责是将已批准的 DocFlow 方案同步为可追溯的 `spec.md`，不是重新发明需求或技术方案；`clarify` 只处理剩余问题，并在必要时回流上游。`plan`、`tasks`、`analyze` 和 `implement` 消费这些已批准事实生成实现级产物。

### 5.3 Implementation, Review and Verification Loop

实现必须受当前方案、路径决定和任务边界约束。每轮实现后至少形成：改动事实、执行的验证、代码审核结果、测试/验收结果、未完成事项和残余风险。

返工路由遵循以下最低规则：

| 发现类型 | 最早回流节点 | 后续动作 |
| --- | --- | --- |
| 业务目标、范围、验收标准或来源冲突 | 需求摘要 | 更新需求资料，重新生成方案并 Re-Gate |
| 架构、接口、数据、异常、兼容性或风险控制缺口 | 技术方案 | 更新方案，重新挑战、审核并刷新下游实现边界 |
| Speckit 规格、计划或任务与已批准方案不一致 | 对应 Speckit 产物或技术方案 | 修正派生产物；若改变已批准行为，回流技术方案 |
| 实现错误且不改变已批准行为 | 实现 | 修复后重新执行相关代码审核和验证 |
| 代码审核或测试揭示方案缺口 | 技术方案 | 不得只修代码；更新方案并重新挑战、审核、实现和复核 |

Core 可以设置有界重试和超时，但耗尽预算必须给出 `blocked` 或 `failed` 的可恢复结果，不能伪造通过。

## 6. Agent Coordination and Replaceable Binding Contract

每个节点由能力映射选择实际执行者。入口 Agent 只负责启动，并不天然拥有全部节点的执行权；Kimi、Codex、Hermes 是当前可绑定的执行能力，而不是写死在节点协议中的唯一执行者。

### 6.1 Node Capability Contract

节点合同只定义完成该节点所需的能力、输入、输出、Gate 与副作用边界。例如需求归一化、技术方案生成、方案挑战、方案审核、实现、代码审核和测试/验收都是能力类型，而不是某个 Agent 的专属名称。

节点合同不得出现“需求摘要必须由某 Agent 执行”或“代码实现必须由某 Agent 执行”这类固定绑定。替换执行者不能改变需求 ID、上游产物引用、输出 schema、finding 语义、Re-Gate 路由或人工 Git 边界。

### 6.2 Agent Capability Binding Protocol

Core 必须通过一个独立、可版本化的 Agent Capability Binding 选择当前节点执行者。每条 binding 至少声明：

- 能力类型与适用节点；
- 实际执行者标识及其 CLI、工具或 adapter；
- 可接受的输入格式、要求的输出合同和结果校验器；
- 允许的副作用、超时与失败处理边界；
- binding 版本与启用状态。

初期 binding 可以将能力映射到已支持的 Kimi、Codex 或 Hermes CLI/工具。新增、停用或替换 binding 应是配置或协议层操作，不应要求修改 LOOP 主流程、产物链或每个节点的业务合同。

每次节点执行必须记录实际使用的 binding、Agent/adapter 标识和版本、输入产物版本、执行尝试与结果。这样可以在下一节点、失败重试或 Re-Gate 后改用另一执行者，同时保留结果来源和可追溯性。

若某 binding 不可用、超时或输出不合格，协调器可以按当前策略选择另一已启用 binding 重新执行该节点；这是一轮新的、可追溯的尝试，不得把前一执行者的失败、shadow 结果或历史结果伪装成新执行者的通过。

协调器在调用某一 Agent 前必须提供：

- 当前 Requirement ID 与有效上游产物引用；
- 当前节点的目标、范围、禁止项和输出合同；
- 当前 Gate、未解决 finding、已接受风险和必要的代码库上下文；
- 允许的副作用边界和验证要求。

协调器在接收结果后必须校验：结果是否对应当前产物版本、是否满足节点输出合同、是否出现新的 blocking finding，以及下一节点是否仍具资格。Agent 失败、结果缺失、输出不合格或调用环境不可用时，必须停止或交接，不得以 shadow 或历史成功替代本次结果。

## 7. Manual Git Handoff

满足以下条件时，LOOP Core 输出 `READY_FOR_MANUAL_GIT_HANDOFF`：

- 当前需求、技术方案和路径决定均为有效版本；
- 所有要求的方案挑战、方案审核、代码审核和测试/验收已记录且通过；
- 无未处理 Blocking finding；
- 已记录改动文件、验证命令及结果、未执行检查、残余风险和回滚/恢复说明；
- 工作区状态与交付产物一致。

此状态只说明 LOOP Core 的交付包已完成。它不意味着自动或隐含授权：

```text
commit
push
Draft PR
Ready
merge
publication
```

上述动作均由用户在 LOOP 之外手动决定和执行。

## 8. Non-Goals and Deferred Work

以下不属于 LOOP Core 的当前完成条件：

- 自动 commit、push、Draft PR、Ready、merge 或发布；
- 围绕远程 Git 发布副作用设计的跨进程恢复；
- 多仓事务、自动跨仓发布或无人监督高风险操作；
- 企业级队列、服务化、租户、UI、HA 或 SLO；
- 扩展新的模型/Agent 提供商。

已有的隔离工作区、受控进程、artifact、测试修复和 checkpoint 能力可以作为后续实现的内部支撑，但其存在不构成 LOOP Core 成功，也不应阻塞 Core MVP。

## 9. Advanced Multi-Repository Delivery

多仓需求属于 Advanced 阶段，但应提前保留正确的产品边界。它不是把多个单仓代码修改并列执行，而是需要：

- 一个全局需求、全局范围、跨仓依赖与整体验收；
- 每个目标仓库拥有独立、可追溯的需求子范围、方案、实现、审核和验收产物；
- 仓库间 finding、接口或范围变化能触发受影响仓库的 Re-Gate；
- 最终形成全局验收结论，同时保留各仓独立的人工 Git 交接边界。

在单仓 Core 未被真实使用验证前，不实现该阶段。

## 10. Acceptance Criteria for the Core MVP

Core MVP 必须在一个真实单仓需求上证明：

1. 可从至少一个已支持入口 Agent 启动，并处理一份真实需求来源；
2. 需求、方案、挑战、审核、实现、代码审核和测试/验收以标准产物串联；
3. 至少一次有效 finding 可回流到正确的最早节点，并使后续产物重新通过必要 Gate；
4. 已使用的 Agent 结果均可追溯到明确的输入产物与执行记录；
5. 最终输出 `READY_FOR_MANUAL_GIT_HANDOFF`，不产生 commit、push 或 PR；
6. 过程在中断、Agent 不可用或输入不完整时给出明确、可继续的状态，不伪造完成。

## 11. Roadmap Interpretation

本合同是后续调整 Autonomous Delivery Roadmap 的判断基线：

- Direct 单仓 LOOP 与真实产物 Re-Gate 是近期主线；
- Speckit 是 Core 的复杂需求分支，不应与 DocFlow 重复定义业务事实；
- 多仓是后续 Advanced 能力；
- 自动 Git 发布及其恢复只可作为可选后续能力，不能成为 Core 或单仓验收的前置条件。

本合同已获用户确认，并作为本轮 Roadmap 重排的判断基线。它不改写任何既有代码、Git、PR 或 CI 事实。

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 0.3.0 | 2026-08-16 | Accepted | 用户确认 Core 边界：任意入口、可替换 Agent binding、产物驱动 Re-Gate 与人工 Git 交接；据此启动 Roadmap 重排。 |
| 0.2.0 | 2026-08-16 | Draft for user confirmation | 增加能力与 Agent 解耦、可替换 binding 和执行溯源合同。 |
| 0.1.0 | 2026-08-16 | Draft for user confirmation | 基于用户确认的任意入口、多 Agent 协作、产物驱动 Re-Gate 和手动 Git 边界生成。 |
