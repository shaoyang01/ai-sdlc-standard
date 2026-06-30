# Phase Gates

## Gate 定位

Gate 是阶段准入条件，不是建议。

如果 Gate 未通过：
- 不进入下一阶段。
- 不让实现阶段承担需求澄清职责。
- 不让 Agent 自行补业务规则。
- 必须回到上游产物补齐信息。

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

## Critical

## High

## Medium

## Low

## Missing Information

## Required Actions

## Next Step
```

## 必须执行的 Gate

### Specification Gate

检查：
- Specification 是否包含 ESS 必填章节。
- 条件未命中时是否保持原流程。
- 新逻辑失败、超时、异常时是否影响原流程。
- 是否改变返回值、状态、事务、日志、MQ、缓存或 DB 写入。
- 状态流转、数据来源、异常处理、测试方案是否完整。

### Plan Gate

检查：
- Plan 是否改变 Specification 边界。
- Plan 是否引入未定义业务规则。
- Plan 是否覆盖异常、降级、补偿、回滚和监控。
- Plan 是否可支持验收标准。

### Task Gate

检查：
- 每个任务是否能追溯到 Specification 或 Plan。
- 是否包含测试任务。
- 是否包含文档、配置、监控或回滚任务。
- 是否存在顺序错误。
- 是否有凭空新增业务任务。

### Implementation Gate

检查：
- 是否只实现 tasks.md 中的任务。
- 是否新增未定义业务逻辑。
- 是否遇到未定义行为。
- 是否编译或基础测试通过。
- 是否记录未完成项。

### Code Review Gate

检查：
- 是否符合行为约束。
- 是否保持原流程。
- 异常处理、幂等、事务边界是否符合方案。
- 是否引入兼容性、性能或安全风险。

### Test Gate

测试失败必须分类：
1. Implementation Bug
2. Specification Missing
3. Review Missing
4. Requirement Change
5. Test Case Issue

Specification Missing 必须回写 Checklist 或 Schema。

## 非 Gate 阶段总结

### 上线准入结论

上线准入结论只记录测试验收后的阶段性总结：
- 当前证据下是否具备上线条件。
- 是否存在已接受风险。
- 是否存在需要人工关注的上线风险。
- 准入依据来自当前有效的 Gate、测试验收、代码审核和 manifest 状态。

上线准入结论不是 Gate：
- 不输出 `Can Continue`。
- 不作为任何节点的进入门槛。
- 不阻塞知识同步、日报沉淀或其他后续工作。
- 不代表需求已经结束。

上线、灰度、投产、回滚执行和外部发布动作不属于本工作流。
