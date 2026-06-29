# Auditor Skill Contract

## 定义

Auditor Skill 用于审计产物是否完整、一致、可执行。

## 必须遵守

- 只输出问题和风险，不直接实现。
- 不直接重写完整方案。
- 不扩大需求范围。
- 每个 Critical / High 必须给出依据和修复方向。
- 输出必须可被下一阶段消费。

## 输入

- Artifact under review
- Required Schema
- Required Checklist
- Repository Context

## 输出

- Review Report
- Gate Result

## 副作用

默认无写操作。

## 阻塞条件

- 产物缺失。
- 核心上下文不可读。
- 无法判断业务边界。

