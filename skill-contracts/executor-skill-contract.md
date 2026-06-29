# Executor Skill Contract

## 定义

Executor Skill 用于修改代码、执行任务、运行测试或更新任务状态。

## 必须遵守

- 只能实现 tasks.md 中定义的任务。
- 不得自行补业务规则。
- 遇到未定义行为必须停止并反馈。
- 不得扩大 Scope。
- 必须记录副作用。
- 必须执行可行的验证。

## 输入

- Specification
- Plan
- Tasks
- Repository Context

## 输出

- Code Changes
- Implementation Summary
- Test Result
- Unfinished Items

## 副作用

可能修改代码、文档、配置或测试。必须在 Skill Contract 中声明。

## 阻塞条件

- 任务不可追溯到 Specification 或 Plan。
- 实现必须依赖猜测。
- 编译或核心测试失败且无法继续。
- 用户边界与任务冲突。

