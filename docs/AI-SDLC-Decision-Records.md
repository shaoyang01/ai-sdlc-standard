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
