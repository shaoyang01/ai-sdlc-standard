# Complexity Routing — 设计深度档位模型（v2 单轨）

> 状态：Draft（2026-08-22，C02-WP3.5 合同重基线，Decision-044 Q2；收口后升 Accepted）
> 关联：[Development Path Governance（单轨重写）](development-path-governance.md) · [Node Capability Contract](node-capability-contract.md) · [LOOP Core Contract](../docs/LOOP_CORE_CONTRACT.md) §5.2

## 目标

复杂度分级用于辅助 `solution-gate` 的 `formal_verdict` 输出**设计深度裁决**。它只决定方案与任务内容应该多深，不改变七节点链结构，不替代方案审核，也不降低任何 Gate 要求。

Decision-044 Q2 起不再存在 `DIRECT_IMPLEMENTATION` / `SPECKIT_PIPELINE_REQUIRED` 路径分流：所有需求走同一条七节点链，深度调节载体是"深度档位 + finding/Re-Gate 机器"。

## 深度档位

深度裁决只输出以下值之一：

- `LIGHT`：范围窄、边界明确、风险低；方案与任务内容可精简。
- `STANDARD`：常规单模块改造；方案覆盖架构、接口、数据、异常、兼容性与验证。
- `DEEP`：跨模块状态变更或高风险；方案强制包含状态机/DB/MQ/事务/回滚/代表数据/边界场景章节，任务规划承担实现前一致性审计。
- `BLOCKED_UNKNOWN`（对应 `decision_status = BLOCKED_UNKNOWN`）：缺少关键事实，不能可靠分级；必须回到需求/方案补齐事实，不能靠猜测。

`solution-gate` 是**唯一深度裁决点**；`decision_status` 只取 `DECIDED` / `BLOCKED_UNKNOWN`；`BLOCKED_UNKNOWN` 不进入实现。

## Decision Scope

深度判断必须先确定 Decision Scope：

```text
Same Requirement Decision:
Requirement Supplement:
Decision Scope: FULL_REQUIREMENT / DELTA_CHANGE
```

- `FULL_REQUIREMENT`：从完整需求范围判断深度。
- `DELTA_CHANGE`：补充需求、Requirement Change、Rework、Specification Missing、测试或 Review 暴露规格遗漏时，只基于 Current Change Scope / Delta Scope 判断深度。

当 Decision Scope = `DELTA_CHANGE`：

- Aggregate Requirement Scope 只能作为上下文。
- Aggregate Complexity 只能标记为 `reference only`。
- 原需求中的 DB/MQ/schedule/多模块/长期知识库沉淀等深度触发因素必须进入 Ignored Aggregate Triggers，不能自动成为 Delta Depth Triggers。
- 深度裁决必须基于 Delta Scope。
- 只有 Delta Scope 自身触发强深度因素时，才能输出 `DEEP`。
- 缺少 Delta Scope 或影响范围不清时，输出 `decision_status = BLOCKED_UNKNOWN` 并回到方案补齐事实。

## LIGHT

用于范围窄、边界明确、风险低的需求。

典型特征：

- 单文件或少量同模块文件修改。
- 不改变主流程状态流转。
- 不新增 DB 表、字段、写入语义或迁移。
- 不新增 MQ、定时任务、监听器、异步任务或重试语义。
- 不改变事务、幂等、补偿、回滚或权限边界。
- 测试方式清楚，可以用局部单测、接口验证或人工验收覆盖。

规则：

- 默认 `LIGHT`。
- 仍必须经过 `solution-gate`（对抗扫描 + 正式裁决）。
- 仍必须记录实现结果和验证证据。

示例：

- 修正已定义的字段校验。
- 调整单个接口的返回字段映射。
- 修复明确定位的空指针或边界判断。
- 更新不改变业务语义的文档或提示文本。

## STANDARD

用于业务影响明确，但仍可在常规流程内安全推进的需求。

典型特征：

- 单服务或单模块内的业务分支调整。
- 涉及少量配置、查询、DTO、校验或返回结构。
- 不引入新的跨系统协作。
- 不改变核心状态机或关键数据一致性策略。
- 失败策略、兼容策略和测试策略已经在技术方案中写清楚。

规则：

- 默认 `STANDARD`。
- 必须在方案门禁中记录为什么不需要 `DEEP`。
- 如果存在未接受 High 风险，应转为 `BLOCKED_UNKNOWN`（回到方案）或经风险接受后继续。

## DEEP

用于需要完整设计支撑的需求。

任一强触发因素出现时，默认判为 `DEEP`：

- 多模块、多服务或跨仓库协作。
- 新流程或大幅改变既有主流程。
- 状态机、状态流转、任务生命周期或单据生命周期变化。
- DB schema、关键数据写入、迁移、回填或数据一致性变化。
- MQ 生产、消费、重试、幂等、顺序或补偿变化。
- 定时任务、监听器、异步任务、批处理或流程编排变化。
- 事务边界、幂等边界、补偿策略、回滚策略复杂。
- 权限、资金、库存、履约、计费、结算等高影响域。
- 用户明确要求完整深度设计。

注意：需要沉淀 `.specify/business_domain/**` 或长期知识库事实本身不是自动 `DEEP` 触发因素；只有当知识同步需求伴随上述当前实现范围自身的强触发因素时，才默认 `DEEP`。

规则：

- 默认 `DEEP`。
- 必须写明触发因素。
- 方案必须包含完整状态机/DB/MQ/事务/回滚/代表数据/边界场景章节；`task-planning` 承担实现前一致性审计。
- 如果方案本身不完整，先 `BLOCKED_UNKNOWN`，不能直接进入实现让后续阶段猜业务规则。

## BLOCKED_UNKNOWN

用于无法可靠判断深度的情况。

触发条件：

- 需求目标、范围或成功标准不清楚。
- 原流程保持策略不清楚。
- 失败、超时、异常、幂等、事务或回滚策略缺失。
- 关键数据来源或写入语义不清楚。
- 无法判断是否涉及 DB、MQ、状态流转或跨模块协作。
- 测试标准无法覆盖核心行为。

规则：

- `decision_status = BLOCKED_UNKNOWN`，不进入实现。
- 回到 `01-技术方案`（或更早受影响节点）补齐事实后重新过 `solution-gate`。

## 决策字段

`solution-gate` 产物必须包含：

- Decision Scope: `FULL_REQUIREMENT` / `DELTA_CHANGE`
- Depth: `LIGHT` / `STANDARD` / `DEEP`
- decision_status: `DECIDED` / `BLOCKED_UNKNOWN`
- Delta Depth: `LIGHT` / `STANDARD` / `DEEP` / `BLOCKED_UNKNOWN`
- Aggregate Depth: reference only
- Depth Triggers: 触发因素列表
- Delta Depth Triggers
- Ignored Aggregate Triggers
- Re-Gate Source
- Earliest Affected Node
- Depth Override: `none` / `user_requested` / `later_gate_required`
- Rationale: 为什么选择该深度

## 路由规则

| Depth | 默认裁决 | 说明 |
| --- | --- | --- |
| `LIGHT` | solution-gate `DECIDED` | 方案完整且无强触发因素；内容精简。 |
| `STANDARD` | solution-gate `DECIDED` | 需说明为什么不需要 DEEP。 |
| `DEEP` | solution-gate `DECIDED` | 需列出强触发因素；方案与任务按 DEEP 档位内容执行。 |
| `BLOCKED_UNKNOWN` | solution-gate `BLOCKED_UNKNOWN` | 不能靠猜测选择深度；回到方案补齐事实。 |

用户明确要求加深设计时：

- 可以覆盖 `LIGHT` / `STANDARD` 的默认深度。
- Depth Override 必须记录为 `user_requested`。
- 只能覆盖深度档位，不能跳过 `01-技术方案`、`02-方案审核` 或 `solution-gate`。

后续 Gate 发现深度不足时：

- later Gate（如 `code-review`）发现方案缺口，经 finding → 最早受影响节点 Re-Gate 提升深度。
- Depth Override 必须记录为 `later_gate_required`。
- 深度升级由 finding 机器强制下游失效（WP3/WP4），并写入 Change History 或 Re-Gate Records。

## Delta Change Mode

补充需求的常见路由：

| Delta Scope | Delta Depth | 裁决 | 说明 |
| --- | --- | --- | --- |
| 遗漏判断、字段映射、边界规则、校验条件、文案、局部查询条件、局部兼容规则，且 01/02 已覆盖 | `LIGHT` / `STANDARD` | `DECIDED` | 原需求深度只作为 context。 |
| Delta 自身新增 DB schema、MQ、schedule、关键数据写入、跨模块、状态机或其他强触发因素 | `DEEP` | `DECIDED` | 理由必须来自 Delta Depth Triggers；Delta 自身的知识同步需求不单独构成触发因素。 |
| Delta 影响行为但技术方案未更新 | `BLOCKED_UNKNOWN` | `BLOCKED_UNKNOWN` | Earliest Affected Node = `01-技术方案`。 |
| Delta 已写入方案但方案门禁未覆盖 | `BLOCKED_UNKNOWN` | `BLOCKED_UNKNOWN` | Required Re-Gate = `02-方案审核`。 |

## 禁止事项

- 不得因为需求"看起来不大"而跳过 `solution-gate`。
- 不得因为用户要求完整深度设计而跳过 `solution-gate`。
- 不得把 `DEEP` 当作方案缺失的替代结论。
- 不得让任何 Skill 承担从零澄清核心业务规则的职责（方案缺口必须回流 `solution-design`）。
- 不得用聊天记忆替代深度触发因素。
- 不得在缺少关键事实时输出 `DECIDED`。
- 不得恢复任何 Direct/Speckit 路径分流语义（Decision-044）。

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 2.0.0 | 2026-08-22 | Draft | Decision-044 Q2 重基线：SIMPLE/MEDIUM/COMPLEX/BLOCKED_UNKNOWN 与路径分流整体替换为 LIGHT/STANDARD/DEEP + DECIDED/BLOCKED_UNKNOWN 深度档位模型；Development Path Decision 字段删除；solution-gate 为唯一深度裁决点；Decision Scope/Delta 隔离与 user_requested/later_gate_required override 语义平移保留。 |
