# Phase Gates（v2 单轨）

> 状态：Draft（2026-08-22，C02-WP3.5 合同重基线，Decision-044/045；收口后升 Accepted）
> 关联：[LOOP Core Contract](../docs/LOOP_CORE_CONTRACT.md) §5 · [Node Capability Contract](node-capability-contract.md) · [Finding Lifecycle Contract](loop-finding-lifecycle.md) · [Lifecycle](lifecycle.md)

## Gate 定位

Gate 是阶段准入条件，不是建议。

如果 Gate 未通过：
- 不进入下一阶段。
- 不让实现阶段承担需求澄清职责。
- 不让 Agent 自行补业务规则。
- 必须回到最早受影响节点补齐信息并重新过 Gate。

## 严重等级

### Critical

满足任一条件即为 Critical：
- 需求边界不清。
- 新增逻辑可能影响原流程，但未定义影响策略。
- 存在未定义状态流转。
- 存在未定义失败策略。
- 实现必须依赖猜测。
- 可能导致主流程中断、数据错误、重复执行或状态错乱。
- 核心需求无法测试。

处理规则：禁止进入下一阶段。

### High

满足任一条件即为 High：
- 异常分支缺失。
- 幂等、重试、超时或事务边界未定义。
- 数据来源不明确。
- 与现有代码可能冲突。
- 缺少关键测试场景。
- 存在两种以上合理实现方式，但方案未裁定。

处理规则：原则上禁止进入下一阶段。若用户明确接受风险，必须记录原因。

### Medium

示例：
- 日志字段不完整。
- 监控指标不完整。
- 测试覆盖不充分但不影响主流程判断。
- 文档章节细节不足。

处理规则：允许进入下一阶段，但必须记录 TODO。

### Low

示例：
- 命名建议。
- 排版建议。
- 注释补充。
- 非核心日志优化。

处理规则：不阻塞。

## 标准 Gate 输出

所有 Gate 统一输出：

```markdown
# Gate Result: <Phase Name>

## Conclusion

- Result: PASS / FAIL / PASS_WITH_RISK
- Can Continue: yes/no
- Reviewed Artifact:
- Reviewed Artifact Version:
- Gate Artifact Version:
- Design Depth Decision（solution-gate 输出）: LIGHT / STANDARD / DEEP

## Critical

## High

## Medium

## Low

## Missing Information

## Required Actions

## Next Step
```

## 必须执行的 Gate

### solution-gate（方案门禁）

检查（formal_verdict 消费 adversarial_scan 的 Finding Ledger 后裁决）：
- 技术方案是否为当前有效版本，并包含 ESS 必填章节（按深度档位）。
- 条件未命中时是否保持原流程。
- 新逻辑失败、超时、异常时是否影响原流程。
- 是否改变返回值、状态、事务、日志、MQ、缓存或 DB 写入。
- 状态流转、数据来源、异常处理、测试方案是否完整。
- 输出 Gate Result 与设计深度裁决（depth = LIGHT/STANDARD/DEEP；decision_status = DECIDED/BLOCKED_UNKNOWN）。
- `BLOCKED_UNKNOWN` 不进入实现。
- 对抗扫描与正式裁决必须由不同 Agent binding 执行（Decision-044）；同一 Agent 执行两角色即 fail-closed。
- 下游审核必须记录被审阅技术方案的稳定路径和内部 Version。

### task-planning 准入（实现前一致性审计）

进入实现前的一致性检查（原 Plan/Task Gate 的降级形态，由 task-planning 节点承担）：
- 任务计划是否改变已批准方案边界。
- 是否引入未定义业务规则。
- 是否覆盖异常、降级、补偿、回滚、监控与测试任务。
- 每个任务是否能追溯到方案或深度裁决。
- 是否存在顺序错误或凭空新增业务任务。
- 方案缺口必须先回 `solution-design`，不得在拆任务时自行补规则。

### code-review（代码审核与收敛复审）

检查（首轮 Finding Ledger baseline + 后续 closure review）：
- 是否符合行为约束与已批准方案。
- 是否保持原流程。
- 异常处理、幂等、事务边界是否符合方案。
- 是否引入兼容性、性能或安全风险。
- 是否审阅了当前实现记录 Version。
- 新 blocking finding 必须证明由本轮修复直接引入或证明 baseline 失效；否则不阻塞本轮 closure（作为后续 improvement）。
- 方案缺口必须按根因回流 `solution-design` / `task-planning`，不得只修代码。

### knowledge-sync 准入

- 当前 generation 七节点 current revisions 有效；无未关闭 blocking finding。
- 输入不得包含 stale revision、未关闭 blocking finding、旧 specs-run 或历史 sync 结果。
- 原始测试/线上反馈不得直接进入 knowledge-sync，必须先经 requirement-intake。
- `PASS_WITH_RISK` 只消费具有当前证据的 `ACCEPTED_RISK`；Critical 与未接受 High 始终阻塞。

## 非 Gate 阶段总结

### 上线准入结论

上线准入结论只记录实现与审核后的阶段性总结：
- 当前证据下是否具备上线条件。
- 是否存在已接受风险。
- 是否存在需要人工关注的上线风险。
- 准入依据来自当前有效的 Gate、代码审核和 manifest 状态。

上线准入结论不是 Gate：
- 不输出 `Can Continue`。
- 不作为任何节点的进入门槛。
- 不阻塞知识同步、日报沉淀或其他后续工作。
- 不代表需求已经结束。

上线、灰度、投产、回滚执行和外部发布动作不属于本工作流。

## Re-Gate 与版本绑定

Gate 产物必须绑定被审阅产物的稳定路径和内部 Version。

当上游产物 Version 与 Gate 中记录的 Reviewed Artifact Version 不一致时，该 Gate 结论视为 stale，必须重新判断是否仍可放行。stale Gate、stale 深度裁决或旧 generation 产物不得放行后续节点。

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 2.0.0 | 2026-08-22 | Draft | C02-WP3.5 重基线：Specification Gate 改为 solution-gate（对抗扫描 + 正式裁决 + 设计深度裁决）；删除 Development Path Entry Check、Plan/Task/Implementation/Test Gate 与 Tail Completion Gate（职责迁入 task-planning 一致性审计、runtime 确定性准入与 C03 Delivery Tail）；新增 knowledge-sync 准入；收敛协议与 PASS_WITH_RISK 证据规则对齐 v2。 |
