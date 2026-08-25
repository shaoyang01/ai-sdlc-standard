# ESS Schema Mapping

## Required Sections

| Section | Required Content |
| --- | --- |
| 背景 | Business background and problem source. |
| 目标 | Business goal and expected outcome. |
| Scope | In Scope and Out of Scope. |
| 原流程 | Current behavior, trigger, state, data, and call chain. |
| 新流程 | New behavior, trigger conditions, branches, and exit conditions. |
| 行为约束 | What must not change. |
| 实现约束 | Development rules and constraints. |
| 状态流转 | Added, changed, and unchanged states. |
| 数据来源 | Source, reliability, empty handling. |
| 数据变更 | Required when data writes or structure change. |
| 接口变更 | Required when API/RPC/message contracts change. |
| 数据库变更 | Required when DDL, index, or field changes. |
| 缓存影响 | Required when Redis/local cache behavior changes. |
| MQ 影响 | Required when producer, consumer, retry, or idempotency changes. |
| 日志 | Key logs and troubleshooting fields. |
| 监控 | Metrics, alerts, rollout observation points. |
| 异常处理 | Failure, timeout, retry, downgrade, propagation. |
| 边界条件 | Empty data, duplicate execution, concurrency, historical data, compatibility. |
| 测试方案 | Main path, miss path, failure downgrade, idempotency, compatibility. |
| 风险 | Known risks, acceptance conditions, residual risk. |
| 待确认事项 | Questions requiring user or business confirmation. |

## Behavior Constraint Questions

Answer explicitly:

- 条件未命中时是否保持原流程。
- 新逻辑失败时是否影响原流程。
- 新逻辑超时时是否影响原流程。
- 新逻辑异常是否允许向上传播。
- 是否改变原返回值。
- 是否改变原状态。
- 是否改变原事务边界。
- 是否改变原日志、MQ、缓存、DB 写入。

## Test Coverage

Include at least:

- 主路径。
- 条件未命中。
- 失败降级。
- 幂等与重复执行。
- 原流程兼容。

If any test cannot be defined, explain why in `待确认事项` or `风险`.
