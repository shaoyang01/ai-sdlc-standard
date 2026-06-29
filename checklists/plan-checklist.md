# Plan Checklist

## 使用时机

Planning 完成后、Task Generation 前执行。

## 必查项

- [ ] Plan 是否忠实于 Specification。
- [ ] Plan 是否改变需求边界。
- [ ] Plan 是否新增未定义业务规则。
- [ ] 是否覆盖核心链路。
- [ ] 是否覆盖异常分支。
- [ ] 是否覆盖降级和补偿。
- [ ] 是否覆盖回滚策略。
- [ ] 是否覆盖监控指标。
- [ ] 是否说明涉及模块和文件范围。
- [ ] 是否说明数据、状态、事务、缓存、MQ 影响。
- [ ] 是否支持 Specification 中的验收标准。

## 阻塞条件

- Plan 与 Specification 冲突。
- Plan 引入未定义业务行为。
- Plan 无法支持核心验收标准。
- 核心异常分支缺失。

