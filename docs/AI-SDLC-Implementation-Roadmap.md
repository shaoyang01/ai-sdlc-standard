# AI-SDLC Implementation Roadmap

> 导航：[架构基线](AI-SDLC-Architecture-Baseline.md) · [决策记录](AI-SDLC-Decision-Records.md) · [工作流设计](AI-SDLC-Workflow-Design.md) · [Agent 规范](AI-SDLC-Agent-Specification.md) · [当前状态](CURRENT_STATUS.md)

路线图以当前 HEAD 为起点；“已完成”只列代码可验证事实，不把仓库历史声明当作本次重新验证结果。

## Phase 1：最小可用版本

### 目标

固化确定性主 Graph、Runtime/Gateway 边界、Artifact/Trace 基础和安全的 shadow/real 执行入口。

### 范围与已完成

- 【已完成】六节点 Graph、共享 transition、immutable state 和 Replay。
- 【已完成】review retry、implementation 后 code-review/bugfix bounded loop。
- 【已完成】Artifact 基础模型与节点输出转换。
- 【已完成】Codex/Kimi/Hermes Gateway/adapter 基础；真实执行 feature-flagged/default-off；Hermes sidecar-only。
- 【已完成】solution challenge disabled、deterministic shadow、gateway shadow 与显式 Skill 字段。
- 【已完成】本轮六份项目基线文档。

### 技术任务

- P0：修复 gateway available 状态跨对象全字段一致性验证，包括 mode、cycle、exhausted、findingIds、reportPath、artifactStatus。
- P0：修复 RR9/RR10，让异常必然失败，断言 `currentNode === "review"`，并验证 unavailable history 无 READY state。
- P1：补齐 Artifact version/lineage/persistence 的最小契约，不扩建平台。
- P1：消除 Runtime 注释与 gateway shadow 实现现状不一致（仅在后续代码任务中处理）。

### 验收标准

- Graph 与 Replay 对合法/非法 challenge history 给出相同路由/拒绝结果。
- shadow unavailable 绝不生成 READY；gateway Artifact 可追踪到 RuntimeResult。
- typecheck、solution challenge tests 和全量 `npm test` 通过。
- 文档中的代码路径、枚举、节点和相对链接可自动验证。

### 风险

当前测试可能假阳性；`final_status` 易被误作质量 Gate；code-review loop 不在 Graph。

### 不在本阶段范围

正式 enforcement、Event Bus、发布流程、多租户、分布式调度、企业 UI。

## Phase 2：Workflow 自动化

### 目标

在不削弱 Graph 唯一路由原则的前提下，补齐事件与完整生命周期的可执行契约。

### 范围与已完成

- 【已完成】Graph interpreter、Runtime/Replay 共用 transition、执行模式和 retry 基础。
- 【部分完成】任务拆解在 Speckit 子流程，测试/Code Review 有运行能力但未完整入主 Graph。

### 技术任务

- 定义最小 Event schema、因果/幂等/失败语义和持久化边界；先契约后实现。
- 明确任务拆解、独立测试、Code Review 是否及如何进入主 Graph。
- 正式接入 real reviewer → `sdlc-code-review-normalizer` → standardized Gate。
- 定义 solution challenge enforcement 的进入条件、回滚和人工 owner；仅在 shadow 数据满足门槛后实现。
- 对 review retry 达上限后直达 validation 的质量语义做决策。

### 验收标准

- Runtime 无内联流程表；新增路由均由 Graph/transition 驱动。
- Event 与 Artifact 可关联并可重复消费；Replay 结果确定。
- normalizer 不发现新问题，原 reviewer evidence 保留。
- enforcement 失败可降回 shadow，不改变历史审计事实。

### 风险

把 Event trace 误当 Event Bus、把嵌套 Speckit 节点与主 Graph 混合、在数据不足时过早 enforcement。

### 不在本阶段范围

企业级调度、跨租户隔离、完整审批 UI。

## Phase 3：多 Agent 协作

### 目标

在 Control Plane ownership 明确后扩展多个 Agent 的确定性协作与最小 Knowledge 层。

### 范围与已完成

- 【已完成】Kimi/Codex/Hermes 静态映射、策略选择基础和 Gateway 隔离。
- 【部分完成】policy memory、Skill flow metadata、shadow attachment。

### 技术任务

- 建立最小 Knowledge read/write contract：证据资格、授权、冲突、lineage、proposal-only fallback。
- 将 Agent capability、Tool permission、显式 Skill binding 和 ownership 形成可验证请求契约。
- 定义跨 Agent handoff Artifact，不引入自治协商路由。
- 评估 Agent policy engine 与静态 `AGENT_MAP` 的唯一权威关系，消除歧义。

### 验收标准

- 任一 Agent 都不能修改 Graph、全局状态或隐式选择 Skill。
- 跨 Agent handoff 可由 Artifact/trace 完整还原。
- Knowledge 写入只接受已验证事实和明确授权，冲突不静默覆盖。

### 风险

元数据 registry 被误作真实运行时、策略选择改变 ownership、Knowledge 写入污染长期事实。

### 不在本阶段范围

完整多 Agent 自治协商、无人工监督的高风险操作、企业级知识图谱。

## Phase 4：企业级平台化

### 目标

在前述契约稳定并有实际规模需求后，评估服务化、治理与运营能力。

### 范围与已完成

【尚未实现】本阶段没有可声称完成的平台能力；当前 guardrail、runbook 和 observability 合同只是基础证据。

### 技术任务

- 【NEED DECISION】持久化 Workflow Engine、租户/权限、审计保留、分布式执行的实际需求与 SLO。
- 【NEED DECISION】发布节点、审批、制品、回滚和环境 ownership。
- 在有容量证据后评估 UI、队列、HA 和灾备。

### 验收标准

- 租户与权限模型经过威胁建模；审计不可抵赖；执行可恢复且有 SLO。
- 发布与回滚有明确 owner、Gate、Artifact 和演练证据。
- 服务化不改变 Graph 唯一路由和 Agent 无流程 ownership 原则。

### 风险

过早平台化、把文档合同当运行能力、运维复杂度超过真实收益。

### 不在本阶段范围

在无业务证据时预建“大而全”平台或新增架构层。
