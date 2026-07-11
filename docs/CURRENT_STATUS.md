# Current Status

> 导航：[架构基线](AI-SDLC-Architecture-Baseline.md) · [决策记录](AI-SDLC-Decision-Records.md) · [工作流设计](AI-SDLC-Workflow-Design.md) · [Agent 规范](AI-SDLC-Agent-Specification.md) · [实施路线图](AI-SDLC-Implementation-Roadmap.md)

## 基线信息

- branch：`feature/loop-runtime-v1`
- commit：`256ce76b12707e70f2147b3d8114940bd70d7d02`
- 工作区状态（生成文档前）：仅有未跟踪 `.zcode/`；未覆盖、未提交该用户目录。
- 文档生成日期：2026-07-12（Asia/Shanghai）
- 仓库：本地 remote/目录信息与任务预期 `shaoyang01/ai-sdlc-standard` 一致性未作为功能事实使用。

## 已经完成

- 六节点主 Graph 和声明式 edges：`sdlc_graph/graph.ts`。
- Runtime 与 Replay 共享 `getNextNode`：`runtime.ts`、`core/state-machine-vm.ts`、`sdlc_graph/transitions.ts`。
- immutable ExecutionState、ExecutionContext、Trace：`core/execution-state.ts`、`core/execution-context.ts`、`core/execution-trace.ts`。
- review retry limit 与 implementation 后 bounded code-review/bugfix loop：`sdlc_graph/transitions.ts`、`runtime.ts`。
- Artifact 类型、factory 和节点转换：`core/artifact.ts`、`core/node-artifacts.ts`。
- `implementation_outcome` 五值枚举与 `final_status` fanout completion 语义：`core/runtime-executors.ts`、`runtime.ts`。
- Codex/Kimi/Hermes Gateway 与真实 dispatch guardrail 基础；真实执行默认关闭：`execution/config.ts`、`execution/*real-dispatch*.ts`。
- solution challenge shared state validator、两轮状态、gateway shadow pass-through、unavailable 不携带 READY、Gateway Artifact 汇入 RuntimeResult：`core/solution-challenge-state.ts`、`core/runtime-executors.ts`、`runtime.ts`。
- Skill 文件、contract 与 metadata-only flow registry：`skills/`、`skill-contracts/`、`core/agent-skill-registry.ts`。
- 本次六份基线文档已建立；验证结果见下文和最终交付说明。

## 部分完成

- Control Plane：有进程内 Runtime/VM/Gateway/策略，没有完整服务化控制面。
- Event：有 trace/history/replay，没有 Event Bus、持久化订阅和幂等消费。
- Knowledge：有 policy memory、Artifact 治理和 sync Skills，没有统一 Knowledge Service/Agent。
- Skill Runtime：大多数 binding 为 metadata-only；challenger 是 explicit skill binding + contract prompt，不是完整 Skill 文件加载执行。
- 完整 SDLC：任务拆解在 Speckit 子流程；测试、Code Review 部分存在；发布未进入 Graph。
- post-implementation review：有 reviewer adapter 和 bugfix loop，未接入 code-review normalizer 标准链路。
- solution challenge：shadow 观测可用，正式 enforcement 未实现。

## 正在讨论

当前没有应伪装为 Accepted Decision 的新增讨论。所有未决事项列在下一节；确认后必须写入 [Decision Records](AI-SDLC-Decision-Records.md)。

## 待解决

- Gateway available observation 与顶层 `solution_challenge` 的全字段一致性校验。
- Gateway observation `findingIds` 与 state `findingIds` 的一致性校验。
- RR9/RR10 replay 合法路径测试假阳性与断言不足。
- Event 与 Artifact 的最小长期契约。
- real reviewer → normalizer → standardized Gate 的正式 Runtime 集成。
- Knowledge 层最小可用 read/write、授权和冲突契约。

## NEED DECISION

- review FAIL 达 retry 上限后直接进入 `validation` 是否符合长期质量 Gate 语义。
- solution challenge enforcement 的开启指标、批准 owner、回滚条件和 unavailable 策略。
- 任务拆解、测试、Code Review 应成为主 Graph 节点还是保持嵌套/附加流程。
- 发布阶段的 owner、审批 Gate、Artifact、环境与 rollback 契约。
- 是否引入 Skill 文件动态 loader；若引入，其签名、版本、sandbox 和失败边界。
- Agent policy engine 与静态 `AGENT_MAP` 的最终权威关系。

## 已知风险

- `final_status=success` 可能被下游误解为质量或发布通过。
- gateway shadow validator 的跨对象一致性缺口允许状态字段漂移而不报错。
- RR9/RR10 可能在 `replayExecution` 抛异常时仍通过，降低回归测试可信度。
- Runtime 额外管理 code-review/bugfix，容易被误述为 Graph 已覆盖完整生命周期。
- 多份历史 readiness/runbook Markdown 可能记录当时结论，不能替代当前代码和当次验证。
- metadata-only Skill registry 容易被误解为 Runtime 已执行 Skill。

## 技术债务

- `core/runtime-executors.ts` 中“real Gateway skill invocation not implemented”注释与 gateway shadow 已有真实 Gateway 调用存在表述偏差，需要未来代码任务澄清；当前准确说法是未动态加载完整 Skill 文件。
- Artifact 当前主要是内存对象，版本/lineage/持久化尚未形成统一 Runtime 契约。
- `RuntimeNode` 扩展 `code-review`/`bugfix`，但 Graph `NodeType` 不包含它们。
- state-machine 文件自称 event-sourced，当前证据仅支持 trace-based replay，不支持完整 Event System。

## 最近代码审查结论

审查基线：`256ce76b12707e70f2147b3d8114940bd70d7d02`。

1. 【未修复】`validateGatewayShadowChallengeOutput` 在 available 时分别校验两个 state，但只比较 `status`。尚未比较 `mode`、`currentCycle`、`maxCycles`、`exhausted`、`findingIds`、`reportPath`、`artifactStatus`；observation `findingIds` 也未与 state 对齐。依据：`core/solution-challenge-state.ts`。
2. 【未修复】RR9/RR10 catch 将成功标志设为 true；只检查 `status !== "completed"`，未断言 `result.currentNode === "review"`，也未验证 unavailable history 不含 READY state。依据：`tests/solution-challenge-graph.test.ts`。
3. 【已实现】available/unavailable 基础 shape、observedStatus、fallback、counts、wouldRouteTo 和 shadow pass-through 校验；Graph 与 Replay 共享 validator。
4. 【已实现】Gateway failure/malformed output 为 unavailable，无顶层 `solution_challenge`，实际路由继续 review；Gateway Artifact 可进入 RuntimeResult。

## 设计与实现差异摘要

- 设计要求 Event-driven；实现是 trace/history + Replay，非完整 Event System。
- 设计目标包含十阶段 SDLC；Graph 只有六节点，任务拆解/Code Review/发布没有全部正式入图。
- 设计包含 Control Plane 与 Knowledge 层；当前分别是进程内组件与若干 memory/sync 基础。
- 设计要求显式 Skill；当前 challenger 已显式绑定，但整体 registry 仍 metadata-only，未动态加载 Skill 文件。
- 设计允许未来 enforcement；当前 gateway challenge 必须 side-effect-free shadow pass-through。

## 下一步建议

### P0

1. 修复 gateway state 全字段及 findingIds 一致性校验，并增加逐字段负例。
2. 修复 RR9/RR10：catch 必须失败；明确断言 `currentNode === "review"` 和 unavailable trace 不含 READY。
3. 以修复后的 targeted test、typecheck、全量测试作为 enforcement 讨论的最低输入。

### P1

1. 固化 Event 最小契约与 Artifact version/lineage/persistence 契约。
2. 接入 real reviewer → `sdlc-code-review-normalizer` → standardized Gate。
3. 决定 review retry exhaustion 语义与完整生命周期入图边界。
4. 定义最小 Knowledge read/write、授权和冲突处理。

### P2

1. 在 shadow 指标充分后评估 solution challenge enforcement。
2. 定义发布阶段，不提前建设企业平台。
3. 有真实规模证据后再评估持久化引擎、多租户、权限与 UI。

## 后续讨论规则

- 后续讨论默认以这六份文档为项目基线。
- 新的已确认决策必须更新 [Decision Records](AI-SDLC-Decision-Records.md)。
- 实现状态变化必须更新本文件；工作流变化必须更新 [Workflow Design](AI-SDLC-Workflow-Design.md)。
- Agent/Skill 边界变化必须同步 [Architecture Baseline](AI-SDLC-Architecture-Baseline.md) 与 [Agent Specification](AI-SDLC-Agent-Specification.md)。
- 若文档与当前代码冲突，代码是实现事实；差异必须显式记录，不得静默改写任一侧。
