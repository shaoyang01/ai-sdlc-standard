# sdlc-specification-writer Skill Contract

## Metadata

```yaml
name: sdlc-specification-writer
version: 0.1.0
category: Producer Skill
stage: Specification Writing
standard_package: ai-sdlc-standard
status: active
input_artifacts:
  - library/{requirement_id}/00-需求资料/*
  - optional existing draft specification
  - optional repository context
output_artifacts:
  - library/{requirement_id}/01-技术方案/{requirement_id}__技术方案.md
  - manifest.md artifact index update recommendation
required_schema:
  - ess/specification-schema.md
required_checklist:
  - checklists/specification-checklist.md
required_templates:
  - templates/technical-specification-template.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/artifact-versioning.md
  - ai-sdlc/change-control.md
side_effects:
  - write technical specification when explicitly asked to produce output
  - recommend manifest.md updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - missing requirement source
  - unclear business goal
  - unclear in-scope or out-of-scope boundary
  - multiple reasonable business interpretations
  - required behavior would need to be guessed
```

## Responsibilities

`sdlc-specification-writer` 是 Speckit 之外的通用规格生成入口。

它负责：

- 将已归一化需求、用户确认内容、现有草稿方案或代码上下文整理成 ESS 技术规格。
- 生成 `01-技术方案` 节点产物。
- 保留 In Scope / Out of Scope、行为约束、异常处理、兼容性、测试方案等关键章节。
- 明确哪些内容是事实、哪些是待确认事项。
- 为 `sdlc-solution-reviewer` 提供可审阅输入。
- 在轻量需求中，让 `01-技术方案` 直接作为规格事实。
- 在进入 Speckit 时，让 `01-技术方案` 成为 `sdlc-speckit-specify` 派生或同步 `specs/spec.md` 的输入。

它不负责：

- 审阅方案是否通过 Gate。
- 判断最终开发路径。
- 执行业务代码修改。
- 渲染 HTML 样式或发布飞书文档。
- 替代 `sdlc-speckit-pipeline` 执行完整 SDD。
- 将不确定业务规则写成确定事实。

## Input Contract

必需输入至少满足其一：

- `library/{requirement_id}/00-需求资料/*`
- 用户在当前对话中确认的需求边界
- 现有技术方案草稿

建议输入：

- `sdlc-requirement-normalizer` 输出的需求摘要
- 相关业务知识库或代码事实
- 当前仓库模块、接口、数据模型、状态流转上下文
- `templates/technical-specification-template.md`
- `ess/specification-schema.md`
- `checklists/specification-checklist.md`

缺失输入处理：

- 业务目标无法判断时停止。
- In Scope / Out of Scope 无法判断时停止。
- 对原流程影响无法判断时，不得生成可执行结论。
- 缺少代码上下文但不影响方案框架时，可以继续，但必须在待确认事项或风险中记录。

## Output Contract

### Artifact Versioning Contract

Any DocFlow requirement artifact produced or updated by this skill must follow
`ai-sdlc/artifact-versioning.md`:

- use the stable path recorded in manifest, not a filename-versioned path;
- include Metadata `Version` and `Status`;
- include `## 修订记录`;
- keep the body to current effective content only;
- recommend manifest updates with stable path, internal version, and status;
- include `Reviewed Artifact` and `Reviewed Artifact Version` for Gate,
  review, sync, and reconcile artifacts, plus `Gate Artifact Version` when
  the artifact is itself a Gate result.

默认输出：

```text
library/{requirement_id}/01-技术方案/{requirement_id}__技术方案.md
```

如果需要 HTML、飞书或其他发布格式：

- `sdlc-specification-writer` 只负责规格内容。
- `sdlc-docflow-writer` 负责落盘、渲染或发布。

输出必须遵循 `ess/specification-schema.md`，至少包含：

- 背景
- 目标
- Scope / In Scope / Out of Scope
- 原流程
- 新流程
- 行为约束
- 实现约束
- 状态流转
- 数据来源
- 数据变更（条件必填）
- 接口变更（条件必填）
- 数据库变更（条件必填）
- 缓存影响（条件必填）
- MQ 影响（条件必填）
- 日志
- 监控
- 异常处理
- 边界条件
- 测试方案
- 风险
- 待确认事项

输出还应建议更新：

- Artifact Index: `01 技术方案`
- Activity Log
- Missing Artifacts
- Next Step: 执行 `sdlc-solution-reviewer`

## Side Effects

允许：

- 写入 `01-技术方案` 产物。
- 输出 `manifest.md` 更新建议。
- 在用户明确要求时调用 `sdlc-docflow-writer` 做输出路由。

禁止：

- 修改业务代码。
- 修改 `.specify/business_domain/**`。
- 输出 `PASS` / `FAIL` Gate 结论。
- 直接唤醒 Speckit pipeline。
- 为了通过审核而省略不确定点。

## Blocking Conditions

必须停止的情况：

- 缺少需求来源或需求来源不可读。
- 无法判断业务目标。
- 无法判断 In Scope / Out of Scope。
- 存在互相冲突的需求来源且没有优先级。
- 行为约束需要猜测。
- 原流程兼容策略无法判断。
- 状态流转、数据来源或异常策略存在多种合理解释。
- 用户要求直接生成确定方案，但仍有核心待确认问题。

## Gate Requirements

前置 Gate：

- Requirement Intake / Requirement Confirmation 应至少有可用结果。
- 如果是变更或返工，必须遵守 `ai-sdlc/change-control.md`。

后置 Gate：

- 生成 `01-技术方案` 后，必须进入 `sdlc-solution-reviewer`。
- 未经 `sdlc-solution-reviewer` 审阅，不得直接进入实现。
- 如果方案内仍存在待确认事项，`sdlc-solution-reviewer` 应判断是否 `BLOCKED_NEEDS_REVISION`。

## Relationship With Other Skills

### sdlc-docflow-writer

`sdlc-docflow-writer` 负责文档路由、格式输出和发布。

`sdlc-specification-writer` 负责规格语义。

二者不能互相替代。

### sdlc-solution-reviewer

`sdlc-solution-reviewer` 消费 `sdlc-specification-writer` 的产物，输出方案审核和开发路径建议。

### sdlc-speckit-specify

当需求进入 `sdlc-speckit-pipeline` 时，`sdlc-speckit-specify` 应复用 `sdlc-specification-writer` 的已审阅产物，派生或同步 `specs/spec.md`。

`sdlc-speckit-specify` 不应重新解释已经审阅通过的需求。

### sdlc-speckit-clarify

`sdlc-speckit-clarify` 只校验残余未决问题。

如果仍有核心问题，应回到 `01-技术方案` / `02-方案审核`，而不是在 pipeline 内扩大范围。
