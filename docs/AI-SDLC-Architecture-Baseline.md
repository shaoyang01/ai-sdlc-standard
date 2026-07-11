# AI-SDLC Architecture Baseline

> 导航：[决策记录](AI-SDLC-Decision-Records.md) · [工作流设计](AI-SDLC-Workflow-Design.md) · [Agent 规范](AI-SDLC-Agent-Specification.md) · [实施路线图](AI-SDLC-Implementation-Roadmap.md) · [当前状态](CURRENT_STATUS.md)

## 文档状态

- 状态：Baseline（后续开发唯一事实来源之一）
- 基线日期：2026-07-12
- 分支：`feature/loop-runtime-v1`
- 基线提交：`256ce76b12707e70f2147b3d8114940bd70d7d02`
- 事实来源：当前代码、测试、仓库 Markdown 是【已实现】事实来源；本文件记录的已确认共识是【设计基线】事实来源。
- 冲突处理：不以设计覆盖实现；差异进入“设计与实现差异”及 [CURRENT_STATUS](CURRENT_STATUS.md)。未确认内容标记【TODO】或【NEED DECISION】。

## 项目目标

### 建设原因

【设计基线】AI-SDLC 是事件驱动、图驱动、以 Agent 执行能力、由 Runtime 管理生命周期、以 Skill 复用能力、以 Artifact 交接和审计的软件研发运行系统，不是简单 CLI 包装层。

它针对信息分散、过程与决策不可追溯、方案/代码/评审/测试状态割裂、Agent 同时执行能力和控制流程、多 Agent 边界不确定，以及人工串联高度依赖个人经验等问题。

### 项目边界

- 编排确定性的 SDLC 节点、路由、重试及执行模式。
- 通过 Gateway 隔离真实 Agent/CLI 调用，通过显式开关控制副作用。
- 以统一 Execution Context、Trace 与 Artifact 保存节点输入输出和审计依据。
- 以 Skill 表达可复用能力契约；Agent 与 Skill 分离。
- 支持 Direct Implementation 与嵌套 Speckit 流程两种开发路径。

### 非目标

【设计基线】当前基线不承诺企业级多租户、权限中心、分布式调度、企业级 UI、完整自治协商、完整发布平台或持久化 Workflow Engine。不得将现有纯函数 VM、元数据 registry 或 sidecar 描述为这些能力。

## 总体架构

| 层 | 职责 | 输入 | 输出 | 不负责 | 当前实现状态 | 实际代码位置 |
| --- | --- | --- | --- | --- | --- | --- |
| Agent 层 | 完成当前节点的需求理解、设计、编码、评审、验证等能力 | Execution Request、上下文、Artifact、显式 Skill | 节点输出与 Artifact | 全局流程、下一节点、全局状态、`final_status` | 【部分实现】静态映射、策略选择与 Kimi/Codex/Hermes adapter 存在；不是独立 Agent 服务 | `runtime.ts`、`core/agent-decision.ts`、`core/agent-policy-engine.ts`、`execution/*adapter*.ts` |
| Control Plane 层 | 管理 Runtime 生命周期、上下文、状态、重试、trace、Artifact、策略和开关 | Graph、RuntimeOptions、节点结果 | RuntimeResult、ExecutionState、审计信息 | 替代 Agent 完成业务能力 | 【部分实现】进程内 Runtime/VM/Gateway 已有；完整服务化 Control Plane 尚无 | `runtime.ts`、`core/execution-state.ts`、`core/state-machine-vm.ts`、`execution/gateway.ts` |
| Workflow 层 | 定义节点、边和确定性 Transition；Graph 是唯一跳转来源 | 当前节点、节点结果、retry count | 下一节点或终止 | Agent 能力实现、CLI 调用 | 【已实现】六节点 Graph 与 review/challenge 路由；目标完整生命周期未全部入图 | `sdlc_graph/graph.ts`、`sdlc_graph/transitions.ts`、`sdlc_graph/types.ts` |
| Skill 层 | 定义能力输入、输出、边界、检查与 handoff | 明确的 skillName 和所需 Artifact | 标准化能力产物 | 全局 Workflow、隐式选择、Agent 身份 | 【部分实现】Skill 文件与 metadata registry 完整；Runtime 普遍未动态加载 Skill 文件，challenger 仅“显式绑定 + contract prompt” | `skills/*/SKILL.md`、`core/agent-skill-registry.ts`、`execution/skill-request-validation.ts` |
| Tool 层 | 提供 CLI、Git、测试、存储和外部系统操作 | Agent/Gateway 请求 | 命令结果或外部数据 | 流程状态和路由决策 | 【部分实现】Codex/Kimi/Hermes CLI runner 与 SQLite policy memory 存在 | `execution/*runner*.ts`、`execution/*command-executor.ts`、`core/policy-memory-store.ts` |
| Knowledge 层 | 保存可复用需求、方案、评审、测试、历史决策和实现事实 | 已验证 Artifact 与同步证据 | 可检索上下文和长期知识 | 未验证事实、流程编排 | 【部分实现】DocFlow、policy memory、business-domain sync 规则存在；无完整 Knowledge Service/Agent | `library/` 约定见 `ai-sdlc/artifact-storage.md`、`core/policy-memory-*.ts`、`skills/sdlc-speckit-sync/` |

## 核心设计原则

- 【设计基线】Agent 负责能力执行，不负责流程控制；不拥有全局状态，不直接修改 Graph。
- 【设计基线】Control Plane 管理生命周期和执行状态；Workflow/Graph 是唯一节点跳转来源，Runtime 解释 Graph，不复制流程表。
- 【已实现】Runtime 与 Replay 均调用 `sdlc_graph/transitions.ts#getNextNode`。
- 【设计基线】Event 表达状态变化和触发执行；【尚未实现】完整 Event Bus/Event System。
- 【设计基线】Skill 是能力契约，必须显式指定 `skillName`，不得从 `(agent, node, requestType)` 隐式推断。
- 【已实现】Direct Implementation 是不绑定 Skill 的 Codex 执行；Speckit 是 `sdlc-speckit-pipeline` 控制的嵌套流程。
- 【设计基线】Tool 仅提供操作能力，不决定状态；Artifact 是跨节点交接与审计核心载体，重要决策必须可追踪。
- 【已实现】真实执行 shadow-first、feature-flagged、default-off；具体开关见 `execution/config.ts` 及各 real-dispatch guardrail。
- 【已实现】Hermes Phase 2 为 sidecar-only，不影响 routing、ownership、primary result 和 `final_status`。
- 【已实现】`final_status` 仅表示 fanout completion，不是质量 Gate；质量问题通过 review、trace、Artifact 和 policy suggestions 暴露。
- 【已实现】`implementation_outcome` 枚举：`real_code_patch`、`shadow_code_patch`、`fanout`、`speckit`、`failed`。
- 【设计基线】人工审批、澄清和高风险操作应有明确节点；【尚未实现】完整人机审批平台。

## 核心组件

| 组件 | 输入 | 输出 | 职责与依赖 | 当前实现状态 | 代码对应关系 |
| --- | --- | --- | --- | --- | --- |
| Requirement Agent | 原始 requirement | requirement summary Artifact | 需求理解；依赖 Kimi/Gateway 或 deterministic executor | 【部分实现】Graph 节点与 Kimi gateway 模式存在；不是独立服务 | `runtime.ts`、`core/runtime-executors.ts`、`execution/kimi-gateway-real-dispatch.ts` |
| Design Agent | requirement summary | tech design Artifact | 生成技术设计；不路由 | 【部分实现】确定性节点及 Agent 映射存在 | `core/runtime-executors.ts`、`runtime.ts` |
| Coding Agent | 已评审方案、执行模式 | code patch / fanout / speckit 结果 | Direct 或嵌套 Speckit 实现 | 【已实现】shadow/real/fanout/speckit 分支；真实 Codex 默认关闭 | `core/runtime-executors.ts`、`execution/codex-real-dispatch-*.ts` |
| Review Agent | 方案或代码 Artifact | review result/findings | pre-implementation review；post-implementation code review | 【部分实现】review 节点和 code-review/bugfix loop 存在；正式 normalizer 链路未接入 Runtime | `runtime.ts`、`execution/code-review-adapter.ts`、`skills/sdlc-code-review-normalizer/` |
| Test Agent | implementation output/Artifact | validation report | 验证实现结果 | 【部分实现】validation 节点和 Hermes sidecar 存在；完整测试阶段未独立建模 | `core/runtime-executors.ts`、`execution/hermes-gateway-shadow-sidecar.ts` |
| Knowledge Agent | 已验证事实、Artifact | 长期知识更新 | 筛选、同步和提供上下文 | 【尚未实现】仅有 policy memory 与同步 Skill/治理规则，无 Agent 模块 | `core/policy-memory-*.ts`、`skills/sdlc-speckit-sync/` |
| Workflow Engine | Graph、节点结果、retry count | ExecutionState/下一节点 | 生命周期解释、重试、Replay | 【已实现】进程内 Graph interpreter/immutable VM；非持久化引擎 | `runtime.ts`、`core/state-machine-vm.ts`、`sdlc_graph/` |
| Event System | 状态变化、外部触发 | 事件流、订阅触发 | 解耦状态表达和执行触发 | 【尚未实现】trace/history 不是完整 Event Bus | `core/execution-trace.ts`、`core/execution-state.ts`（仅现有基础） |

## 设计与实现差异

| 设计能力 | 当前实现 | 状态 | 代码依据 | 后续动作 |
| --- | --- | --- | --- | --- |
| 完整 Event System | 仅 ExecutionTraceItem/history 与纯 Replay | 【尚未实现】 | `core/execution-trace.ts`、`core/state-machine-vm.ts` | 【TODO】定义事件契约、幂等和持久化边界 |
| 完整 Control Plane | 单进程 Runtime、VM、Gateway 与配置 | 【部分实现】 | `runtime.ts`、`execution/gateway.ts` | 【TODO】先固化边界，不提前服务化 |
| 完整 SDLC 生命周期 | Graph 仅 requirement-summary 至 validation；code-review/bugfix 是 Runtime 附加循环 | 【部分实现】 | `sdlc_graph/graph.ts`、`runtime.ts` | 【TODO】任务拆解、独立测试、Code Review、发布入图条件待明确 |
| solution challenge enforcement | disabled/deterministic shadow/gateway shadow；gateway shadow 强制 pass-through | 【尚未实现】 | `core/runtime-executors.ts`、`sdlc_graph/transitions.ts` | 【TODO】满足一致性、回放和观测门槛后再决定启用 |
| Skill 文件动态加载执行 | registry 为 metadata-only；challenger 用显式 skill + prompt | 【部分实现】 | `core/agent-skill-registry.ts`、`core/runtime-executors.ts` | 【NEED DECISION】是否以及如何引入受控 loader |
| Gateway shadow 完整一致性 | available 仅比较顶层 state 与 observation state 的 status | 【部分实现】 | `core/solution-challenge-state.ts` | 【TODO】比较所有状态字段及 findingIds |
| Replay 合法路径测试 | RR9/RR10 可能把异常当成功，缺少 currentNode/history 断言 | 【部分实现】 | `tests/solution-challenge-graph.test.ts` | 【TODO】修复测试逻辑 |
| Knowledge Service/Agent | policy memory、Artifact 规则、sync Skill | 【部分实现】 | `core/policy-memory-*.ts`、`skills/sdlc-speckit-sync/` | 【TODO】定义最小读取/写入/证据契约 |
| 发布流程 | Graph 无 release 节点 | 【尚未实现】 | `sdlc_graph/graph.ts` | 【NEED DECISION】发布 Gate、owner、rollback Artifact |

## 架构边界

- Agent 不编排；Graph 决定路由；Runtime 管理生命周期；Gateway 管理真实执行、fallback 与 sidecar 边界。
- Skill 是显式能力契约，不是 Agent，也不是全局状态机；Tool 不决定流程。
- Runtime 管理的 `code-review`/`bugfix` 当前不是 Graph 节点，这是已知实现边界，不应被描述为 Graph 已完整建模。
- `library/{requirement_id}/` 是需求级工作区；`.specify/business_domain/` 才是现有治理定义中的长期业务知识目标。
