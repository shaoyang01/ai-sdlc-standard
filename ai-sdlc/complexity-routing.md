# Complexity Routing

## 目标

复杂度分级用于辅助 `sdlc-solution-reviewer` 输出开发路径建议。

它只决定研发流程应该轻量还是完整，不替代方案审核，也不降低任何 Gate 要求。

输出位置：

- `02-方案审核` 产物中的 Complexity Assessment。
- `manifest.md` 的 Development Path Decision。

## 分级结果

复杂度只能输出以下值之一：

- `SIMPLE`
- `MEDIUM`
- `COMPLEX`
- `BLOCKED_UNKNOWN`

`BLOCKED_UNKNOWN` 表示缺少关键事实，不能可靠分级。它必须路由到 `BLOCKED_NEEDS_REVISION`，而不是在 `MEDIUM` 和 `COMPLEX` 之间猜测。

## SIMPLE

用于范围窄、边界明确、风险低的需求。

典型特征：

- 单文件或少量同模块文件修改。
- 不改变主流程状态流转。
- 不新增 DB 表、字段、写入语义或迁移。
- 不新增 MQ、定时任务、监听器、异步任务或重试语义。
- 不改变事务、幂等、补偿、回滚或权限边界。
- 测试方式清楚，可以用局部单测、接口验证或人工验收覆盖。

开发路径：

- 默认 `DIRECT_IMPLEMENTATION`。
- 仍必须经过 `sdlc-solution-reviewer`。
- 仍必须记录实现结果和验证证据。

示例：

- 修正已定义的字段校验。
- 调整单个接口的返回字段映射。
- 修复明确定位的空指针或边界判断。
- 更新不改变业务语义的文档或提示文本。

## MEDIUM

用于业务影响明确，但仍可在轻量流程内安全推进的需求。

典型特征：

- 单服务或单模块内的业务分支调整。
- 涉及少量配置、查询、DTO、校验或返回结构。
- 不引入新的跨系统协作。
- 不改变核心状态机或关键数据一致性策略。
- 失败策略、兼容策略和测试策略已经在技术方案中写清楚。
- 代码实现可以直接从技术方案拆出任务。

开发路径：

- 默认仍可 `DIRECT_IMPLEMENTATION`。
- 必须在方案审核中记录为什么不需要完整 SDD。
- 如果存在未接受 High 风险，应转为 `BLOCKED_NEEDS_REVISION`。
- 如果 Medium 判断依赖猜测，应转为 `BLOCKED_UNKNOWN`。

示例：

- 在已有流程中增加一个已定义的业务分支。
- 调整单服务内查询条件和返回结构。
- 增加配置开关，但开关语义、默认值和回滚方式明确。
- 修改非核心链路的计算规则，且测试样例完整。

## COMPLEX

用于需要完整 SDD 支撑的需求。

任一强触发因素出现时，默认判为 `COMPLEX`：

- 多模块、多服务或跨仓库协作。
- 新流程或大幅改变既有主流程。
- 状态机、状态流转、任务生命周期或单据生命周期变化。
- DB schema、关键数据写入、迁移、回填或数据一致性变化。
- MQ 生产、消费、重试、幂等、顺序或补偿变化。
- 定时任务、监听器、异步任务、批处理或流程编排变化。
- 事务边界、幂等边界、补偿策略、回滚策略复杂。
- 权限、资金、库存、履约、计费、结算等高影响域。
- 需要沉淀 `.specify/business_domain/**` 或长期知识库事实。
- 用户明确要求完整 SDD / Speckit pipeline。

开发路径：

- 默认 `SPECKIT_PIPELINE_REQUIRED`。
- 必须写明触发因素。
- 如果方案本身不完整，先 `BLOCKED_NEEDS_REVISION`，不能直接进入 pipeline 让后续阶段猜业务规则。

示例：

- 新增 MQ 消费链路。
- 修改订单、库存、履约、结算等关键状态流转。
- 新增 DB 字段并改变写入语义。
- 跨服务改造主流程。
- 需要完整 plan、tasks、analyze、implement、sync、reconcile 链路的需求。

## BLOCKED_UNKNOWN

用于无法可靠判断复杂度的情况。

触发条件：

- 需求目标、范围或成功标准不清楚。
- 原流程保持策略不清楚。
- 失败、超时、异常、幂等、事务或回滚策略缺失。
- 关键数据来源或写入语义不清楚。
- 无法判断是否涉及 DB、MQ、状态流转或跨模块协作。
- 测试标准无法覆盖核心行为。

开发路径：

- 必须 `BLOCKED_NEEDS_REVISION`。
- 回到 `01-技术方案` 补齐事实后重新运行 `sdlc-solution-reviewer`。

## 决策字段

方案审核产物必须包含：

- Complexity: `SIMPLE` / `MEDIUM` / `COMPLEX` / `BLOCKED_UNKNOWN`
- Complexity Triggers: 触发因素列表
- Development Path Decision: `DIRECT_IMPLEMENTATION` / `SPECKIT_PIPELINE_REQUIRED` / `BLOCKED_NEEDS_REVISION`
- Rationale: 为什么选择该路径
- Full SDD Override: `none` / `user_requested` / `later_gate_required`

## 路由规则

| Complexity | 默认 Development Path Decision | 说明 |
| --- | --- | --- |
| `SIMPLE` | `DIRECT_IMPLEMENTATION` | 方案完整且无强触发因素。 |
| `MEDIUM` | `DIRECT_IMPLEMENTATION` | 需说明为什么不需要完整 SDD。 |
| `COMPLEX` | `SPECKIT_PIPELINE_REQUIRED` | 需列出强触发因素。 |
| `BLOCKED_UNKNOWN` | `BLOCKED_NEEDS_REVISION` | 不能靠猜测选择路径。 |

用户明确要求完整 SDD 时：

- 可以覆盖 `SIMPLE` 或 `MEDIUM` 的默认直接实现路径。
- Development Path Decision 可为 `SPECKIT_PIPELINE_REQUIRED`。
- Full SDD Override 必须记录为 `user_requested`。

后续 Gate 发现直接实现过于冒险时：

- 可以从 `DIRECT_IMPLEMENTATION` 改为 `SPECKIT_PIPELINE_REQUIRED`。
- Full SDD Override 必须记录为 `later_gate_required`。
- 必须写入 Change History 或 Re-Gate Records。

## 禁止事项

- 不得因为需求“看起来不大”而跳过 `sdlc-solution-reviewer`。
- 不得把 `COMPLEX` 当作方案缺失的替代结论。
- 不得让 `sdlc-speckit-pipeline` 承担从零澄清核心业务规则的职责。
- 不得用聊天记忆替代复杂度触发因素。
- 不得在缺少关键事实时输出 `DIRECT_IMPLEMENTATION`。
