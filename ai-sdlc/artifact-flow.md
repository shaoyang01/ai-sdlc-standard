# Artifact Flow

## 核心观点

不同 Agent 之间只通过文档联系时，文档就是接口。

每个阶段的输出必须能被下一阶段直接消费，不能依赖口头记忆或隐含上下文。

## 标准产物流

```text
Raw Requirement
  -> Requirement Understanding
  -> Requirement Boundary
  -> Technical Specification
  -> Specification Gate Result
  -> Development Path Decision
  -> [DIRECT_IMPLEMENTATION] Implementation
  -> [SPECKIT_PIPELINE_REQUIRED] Speckit SDD Core -> Implementation
  -> [BLOCKED_NEEDS_REVISION] Earliest Affected Upstream Node -> Re-Gate
  -> Shared Documentation Governance Tail
       (03-实现记录 -> 04-代码审核 -> Fix / Re-Gate loop -> 05-测试验收
        -> business_domain_sync decision / conditional execution
        -> Reconcile decision / conditional execution
        -> Manifest update)
  -> Tail Completion Gate Result
```

Development Path 分流与 Shared Tail 汇合的正式语义遵循 `ai-sdlc/development-path-governance.md`。`specs/**` 仍是 Speckit 机器事实源；`library/{requirement_id}/` 仍是人工交接和 Gate 视图，两者不互相替代。Shared Tail 复用现有 Implementation Recorder、Code Review、Test、`sdlc-speckit-sync` 与 `sdlc-speckit-code-doc-reconcile` 能力，不创建重复 artifact rail。Tail 产物必须落盘，不能依赖聊天上下文。

## 产物要求

所有跨 Agent 人工交接产物落盘时必须遵循 `ai-sdlc/artifact-storage.md`。同一需求的人工产物放在 `library/{requirement_id}/` 下，不同节点放入不同子目录。`specs/**` 仍是 SpecKit 机器事实源，不由 `library` 目录替代。

### Requirement Understanding

必须说明：
- 业务目标
- 用户意图
- 当前问题
- 初步范围
- 不确定点

### Requirement Boundary

必须说明：
- In Scope
- Out of Scope
- 本次明确不做的内容
- 成功标准
- 待确认事项

### Technical Specification

必须遵循 `ess/specification-schema.md`。

### Gate Result

必须遵循 `templates/gate-result-template.md`。

### Implementation Plan

必须说明：
- 涉及模块
- 主链路
- 数据变更
- 状态流转
- 失败策略
- 回滚策略
- 测试策略

### Tasks

每个任务必须：
- 有唯一 ID。
- 有明确文件或模块范围。
- 能追溯到 Specification 或 Plan。
- 可执行、可验证。

### Code Review Report

必须遵循 `ess/code-review-schema.md`。

### Test Report

必须遵循 `ess/test-feedback-schema.md`。
