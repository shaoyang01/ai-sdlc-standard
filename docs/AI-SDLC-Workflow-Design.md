# AI-SDLC Workflow Design

> 导航：[架构基线](AI-SDLC-Architecture-Baseline.md) · [决策记录](AI-SDLC-Decision-Records.md) · [Agent 规范](AI-SDLC-Agent-Specification.md) · [实施路线图](AI-SDLC-Implementation-Roadmap.md) · [当前状态](CURRENT_STATUS.md)

## 工作流职责边界

【设计基线】Workflow 决定何时执行和下一节点；Agent 决定如何完成当前能力。Agent 不拥有全局状态、不改 Graph、不决定 `final_status`。Runtime 解释 Graph、管理上下文/重试/Artifact；Gateway 隔离真实执行。

## A. 当前实际 Runtime Graph

```text
requirement-summary → tech-design → solution-challenge → review → implementation → validation
                           ↑             │               │
                           └─────────────┘               └─ Runtime 内 code-review ↔ bugfix（非 Graph 节点）
```

- `solution-challenge`：deterministic shadow 中 `NEEDS_REVISION && !exhausted` 回 `tech-design`；READY 或 exhausted 进入 `review`。gateway shadow 无论观察结果均实际进入 `review`。
- `review`：PASS 进入 `implementation`；FAIL 在 retry count `< 3` 时回 `tech-design`，达到上限后进入 `validation`。
- `validation` 无出边，是当前 Graph 终点。
- `solutionChallengeMode=disabled` 时 Runtime 跳过 challenge 执行，但通过 Graph transition 继续；这是 Runtime 执行策略，不是删除 Graph 节点。

## 当前 Graph 路由表

| 当前节点 | 条件 | 下一节点 | 状态 |
| --- | --- | --- | --- |
| requirement-summary | 默认 | tech-design | 【已实现】 |
| tech-design | 默认 | solution-challenge | 【已实现】 |
| solution-challenge | gateway shadow + 合法 observation | review | 【已实现】shadow pass-through |
| solution-challenge | READY_FOR_GATE | review | 【已实现】 |
| solution-challenge | NEEDS_REVISION 且未 exhausted | tech-design | 【已实现】deterministic/enforcement-ready routing function |
| solution-challenge | NEEDS_REVISION 且 exhausted | review | 【已实现】 |
| review | PASS | implementation | 【已实现】 |
| review | FAIL 且 retry `< 3` | tech-design | 【已实现】 |
| review | FAIL 且 retry `>= 3` | validation | 【已实现】 |
| implementation | 默认 | validation | 【已实现】 |
| validation | 无出边 | 终止 | 【已实现】 |

代码依据：`sdlc_graph/graph.ts`、`sdlc_graph/transitions.ts`、`runtime.ts`。

## B. 目标 SDLC 生命周期

| 阶段 | 输入 / 输出 | Agent / Skill / Tool | Artifact | 状态变化与触发事件 | Workflow 与 Agent 职责 | 当前实现状态 |
| --- | --- | --- | --- | --- | --- | --- |
| 需求输入 | 原始资料 → intake | Requirement Agent；`sdlc-requirement-normalizer`；文档/外部输入工具 | `00-需求资料` | 【设计基线】RequirementReceived | Workflow 建立执行；Agent 归一化 | 【部分实现】Skill 存在；Graph 从 requirement-summary 开始，无独立 intake 节点 |
| 需求理解 | intake → requirement summary | Requirement Agent；normalizer；Kimi Gateway | requirement_summary | 【设计基线】RequirementSummarized | Workflow 调度；Agent 解释需求 | 【已实现】Graph 节点；Skill 未由 Runtime 动态执行 |
| 技术方案设计 | summary → design | Design Agent；`sdlc-specification-writer` | tech_design / `01-技术方案` | 【设计基线】DesignProduced | Workflow 进入设计；Agent 生成方案 | 【已实现】Graph 节点；Skill 绑定为 metadata-only |
| 方案挑战 | design → challenge report/status | Requirement/Design-capable Kimi；`sdlc-solution-challenger`；Gateway | solution_challenge | 【设计基线】ChallengeObserved/Completed | Workflow 控轮次与路由；Agent 只挑战 | 【部分实现】disabled/shadow/gateway_shadow；正式 enforcement 未实现 |
| 方案评审 | design + challenge → Gate/开发路径 | Review Agent；`sdlc-solution-reviewer` | solution_review / `02-方案审核` | 【设计基线】SolutionReviewed | Workflow 按结果路由；Agent 做 Gate | 【已实现】review 节点；完整 Skill 文件执行未接入 |
| 任务拆解 | approved design → tasks | Coding/Planning Agent；Speckit tasks Skill | `tasks.md` | 【设计基线】TasksPrepared | Workflow 选择嵌套路径；Agent 拆任务 | 【部分实现】Speckit 内部 Skill，未进入主 Graph |
| 代码开发 | design/tasks → patch/result | Coding Agent；Direct 无 Skill或 `sdlc-speckit-pipeline`；Codex CLI | code_patch、fanout_result、implementation_plan | 【设计基线】ImplementationCompleted | Workflow 选执行模式；Agent 编码 | 【已实现】implementation 节点及多 outcome |
| 测试 | implementation → test evidence | Test Agent；测试工具/Hermes | validation_report / `05-测试验收` | 【设计基线】TestsCompleted | Workflow 决定 Gate；Agent/Tool 执行测试 | 【部分实现】validation 节点，不是完整独立测试阶段 |
| Code Review | patch/test → findings/Gate | Review Agent；目标为 reviewer → normalizer → Gate | code_review、bugfix_patch | 【设计基线】CodeReviewed/BugfixCompleted | Workflow 管重试；Agent 审查/修复 | 【部分实现】Runtime 附加 loop；未入 Graph，normalizer 未接入 |
| 发布 | validated delivery → release record | 【NEED DECISION】Release owner/Skill/Tool | 【TODO】release/rollback Artifact | 【设计基线】ReleaseApproved/Released/RolledBack | Workflow 管审批与回滚；Agent 不自行发布 | 【尚未实现】Graph 无发布节点 |

## Review/Retry 规则

- 方案 review 的失败回到 `tech-design`，`MAX_LOOP_DEPTH=3`；达到上限后当前实现直接进入 `validation`。该行为是代码事实，但是否符合长期质量 Gate 语义为【NEED DECISION】。
- solution challenge 最多两轮：`INITIAL_CHALLENGE` 与 `FOLLOW_UP_VERIFICATION`。第二轮仍 `NEEDS_REVISION` 时 `exhausted=true` 并交给 reviewer。
- implementation 后 code review 最多两次 bugfix（初次 review 加最多两次修复后的复审）；失败结果进入 Runtime trace/feedback，不改变 Graph 定义。

## Shadow/Real 执行规则

- 默认 deterministic/shadow，real dispatch 必须显式 feature flag；真实执行默认关闭。
- Codex 用于 real code generation；Direct Implementation 不注入 Skill。
- Kimi 可执行 requirement-summary real dispatch；solution challenge gateway shadow 显式绑定 `sdlc-solution-challenger` 并发送 contract prompt。不得描述为完整加载执行 Skill 文件。
- gateway shadow 保留 `observedStatus`，`wouldRouteTo` 表示未来 enforcement 理论路由，`routingEffect=shadow_pass_through` 保证实际进入 review。
- Gateway failure/malformed output 产生 unavailable observation；不得携带或伪造 READY state。
- Hermes Phase 2 仅附加 sidecar metadata，不改变 primary result、routing、ownership、`final_status`。

## 人机协作节点

【设计基线】澄清、方案正式审批、高风险真实执行、发布与回滚需要明确人工边界。当前仓库用 Gate/Skill 规则及 feature flag 表达部分边界，但没有完整审批平台。发布审批 owner、超限 review 的处置和 enforcement 开启权限均为【NEED DECISION】。

## Event 模型

【设计基线】建议的最小语义类别是 execution started、node requested/completed/failed、artifact produced、review requested/completed、retry scheduled、human decision requested/recorded 和 execution completed。Event 必须关联 requirement/execution/node、因果关系、幂等键、payload schema 和时间。

【尚未实现】当前 `ExecutionTraceItem` 与 immutable history 可支持进程内 Replay，但没有 Event Bus、持久化订阅、幂等消费或外部触发契约。因此上述事件名不是当前代码 API；落地前需通过 Decision Record 固化。

## Graph 与 Replay 一致性

Runtime 和 `replayExecution` 共享 `getNextNode` 及 gateway shadow validator，这是【已实现】。但当前 available observation 的跨对象一致性只比较 `status`；RR9/RR10 测试也可能吞掉异常。详细状态见 [CURRENT_STATUS](CURRENT_STATUS.md#最近代码审查结论)。
