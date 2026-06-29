# Producer Skill Contract

## 定义

Producer Skill 用于生成研发产物，例如需求理解、技术方案、计划、任务或报告。

## 必须遵守

- 输出必须符合对应 Schema。
- 不得绕过 ESS 自定义核心章节。
- 不得隐式扩大 Scope。
- 不得把不确定内容写成确定事实。
- 不得将 Renderer 样式要求混入业务语义。

## 输入

- Requirement
- Repository Context
- Business Context
- Required Schema
- Required Checklist

## 输出

- Specification
- Plan
- Tasks
- Report

## 阻塞条件

- 缺少关键需求。
- Scope 无法判断。
- 存在多种合理业务解释。
- 输出需要依赖未确认业务规则。

