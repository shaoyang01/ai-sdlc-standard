# AI SDLC Lifecycle

## 适用场景

本生命周期适用于人工唤醒 Skill 的 AI 辅助研发流程，尤其适用于不同 Agent 之间只能通过文档交接的场景。

## 标准阶段

```text
0. Requirement Intake
1. Requirement Understanding
2. Requirement Confirmation
3. Specification Writing
4. Specification Gate
5. Planning
6. Plan Gate
7. Task Generation
8. Task Gate
9. Implementation
10. Implementation Gate
11. Code Review
12. Fix
13. Test
14. Knowledge Sync
15. Reconcile
```

## 阶段职责

### 0. Requirement Intake

接收原始需求，不做实现判断。

输出：
- Source
- Format
- Missing Context
- Conflicting Sources

### 1. Requirement Understanding

复述业务目标、用户意图、当前问题、初步范围和不确定点。

输出：
- Business Goal
- User Intent
- Current Problem
- Initial Scope
- Uncertainties

### 2. Requirement Confirmation

确认边界，避免后续方案扩散。

输出：
- In Scope
- Out of Scope
- Success Criteria
- Pending Questions

### 3. Specification Writing

生成符合 ESS 的技术方案。

输出：
- Technical Specification
- Open Questions
- Assumptions

### 4. Specification Gate

开发前审计规格是否完整，阻止未定义行为进入实现阶段。

输出：
- Gate Result
- Critical / High / Medium / Low
- Missing Constraints
- Required Actions

### 5. Planning

将通过规格审计的方案转化为实现计划。

输出：
- plan.md
- research.md
- data-model.md
- contracts/
- rollback and monitoring notes

### 6. Plan Gate

审计计划是否改变需求边界，是否引入未定义业务行为。

### 7. Task Generation

生成可执行、可追溯、可测试的任务清单。

### 8. Task Gate

审计任务是否覆盖规格、计划、测试、回滚和风险项。

### 9. Implementation

按任务实现。遇到未定义行为时停止并反馈，不自行补业务规则。

### 10. Implementation Gate

确认实现是否符合任务和规格，是否有未声明副作用。

### 11. Code Review

审查代码是否符合规格，而不只是审查代码风格。

### 12. Fix

按结构化 Review 报告修复，修复不得引入新业务行为。

### 13. Test

验证实现结果，失败必须分类。

### 14. Knowledge Sync

将稳定业务事实、规格遗漏和反复出现的问题沉淀到知识库、Checklist 或 Schema。

### 15. Reconcile

校对代码、规格、业务文档之间的一致性。默认只读，明确授权后才写入。

## 裁剪规则

简单需求可以裁剪阶段，但必须说明裁剪原因。

裁剪原因必须遵循 `ai-sdlc/complexity-routing.md`：

- `SIMPLE` 和 `MEDIUM` 默认可以走直接实现路径。
- `COMPLEX` 默认进入完整 SDD / Speckit pipeline。
- `BLOCKED_UNKNOWN` 必须回到技术方案补齐事实，不能靠猜测裁剪。

不可裁剪的内容：
- Scope / Out of Scope
- 行为保持
- 失败策略
- 测试方式
- 副作用边界
