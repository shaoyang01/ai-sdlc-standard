# sdlc-speckit-specify Skill Contract

## Metadata

```yaml
name: sdlc-speckit-specify
version: 0.1.0
category: Producer Skill
stage: Speckit Specify / Spec Sync
standard_package: ai-sdlc-standard
status: active
input_artifacts:
  - library/{requirement_id}/01-技术方案/*
  - library/{requirement_id}/02-方案审核/*
  - library/{requirement_id}/manifest.md
output_artifacts:
  - specs/{feature}/spec.md
  - optional specs/{feature}/checklists/requirements.md
required_schema:
  - ess/specification-schema.md
required_checklist:
  - checklists/specification-checklist.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - create or update specs/**
  - optionally create feature branch when executing the SDD workflow script
  - recommend manifest.md Activity Log updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - solution review is missing or failed
  - development path is not SPECKIT_PIPELINE_REQUIRED and user did not explicitly request full SDD
  - technical specification has unresolved core ambiguity
  - sync to specs/spec.md would require reinterpreting business scope
  - existing specs/{feature}/spec.md belongs to another requirement or unknown source
```

## Standard Path Resolution

本合同中 `required_schema`、`required_checklist`、`required_storage`、`skill_path` 与 `references` 里的共享标准路径，均相对 `AI_SDLC_STANDARD_HOME` 解析。

执行 Skill 前必须先读取 `${AI_SDLC_STANDARD_HOME}/ai-sdlc/standard-package-resolution.md`，确认标准包根目录有效。目标项目不需要、也不应该复制共享 `ai-sdlc/**`、`ess/**`、`checklists/**`、`templates/**` 或 `skill-contracts/**` 文件。

## Responsibilities

`sdlc-speckit-specify` 在新流程中不再从零理解需求。

它负责：

- 读取已审阅的 `01-技术方案` 和 `02-方案审核`。
- 将 `sdlc-specification-writer` 的规格事实同步或派生为 `specs/{feature}/spec.md`。
- 保持 `specs/spec.md` 与已通过方案的 Scope、行为约束、测试要求一致。
- 将方案审核中的 Required Actions、风险接受或开发路径决策映射到 SpecKit 规格中。
- 记录与 DocFlow 产物的引用关系，便于后续 plan/tasks/implement 追溯。
- 在目标 `specs/{feature}/spec.md` 已存在时，确认它属于同一需求与当前 DocFlow 来源后再更新。

它不负责：

- 替代 `sdlc-specification-writer` 编写技术方案。
- 替代 `sdlc-solution-reviewer` 审阅方案。
- 重新解释已审阅通过的需求。
- 绕过方案审核直接创建实现计划。
- 在存在核心未决问题时用 assumptions 继续推进。
- 覆盖来源不明或属于其他需求的 `specs/{feature}/spec.md`。

## Input Contract

必需输入：

- `library/{requirement_id}/01-技术方案/{requirement_id}__技术方案.*`
- `library/{requirement_id}/02-方案审核/{requirement_id}__方案审核.*`
- `library/{requirement_id}/manifest.md`

前置条件：

- 方案审核结果必须是 `PASS` 或带风险接受说明的 `PASS_WITH_RISK`。
- Development Path Decision 应为 `SPECKIT_PIPELINE_REQUIRED`，或用户明确要求完整 SDD。
- 如果方案审核建议 `DIRECT_IMPLEMENTATION`，默认不执行本 Skill。

缺失输入处理：

- 缺少技术方案或方案审核时停止。
- 缺少 manifest 时可以建议创建，但必须记录 Activity Log。
- 如果 `01-技术方案` 与 `02-方案审核` 冲突，应停止并回到 `sdlc-solution-reviewer` 或方案修订。

## Output Contract

输出到：

```text
specs/{feature}/spec.md
```

输出必须保留：

- 需求目标。
- In Scope / Out of Scope。
- 原流程和新流程。
- 行为约束。
- 状态流转。
- 数据来源和数据变更。
- 异常处理。
- 测试方案和验收标准。
- 风险和残余风险。
- 与 DocFlow 方案和方案审核的引用。

允许生成：

```text
specs/{feature}/checklists/requirements.md
```

但 checklist 不能替代 `02-方案审核`。

## Side Effects

允许：

- 创建或更新 `specs/**`。
- 执行 SDD 规格生成或同步脚本。
- 建议更新 manifest Activity Log。

禁止：

- 修改业务代码。
- 修改 `.specify/business_domain/**`。
- 改写 `01-技术方案` 或 `02-方案审核` 的结论。
- 自行扩大 Scope。
- 将核心待确认问题降级为 assumptions。

## Blocking Conditions

必须停止的情况：

- 方案审核缺失。
- 方案审核结果为 `FAIL`。
- Development Path Decision 为 `BLOCKED_NEEDS_REVISION`。
- 技术方案仍有核心待确认事项。
- `specs/spec.md` 需要加入未在方案中定义的新业务规则。
- 方案审核与技术方案存在冲突。

## Gate Requirements

前置 Gate：

- `sdlc-solution-reviewer` 已通过。
- `PASS_WITH_RISK` 已记录风险接受说明。

后置 Gate：

- `specs/spec.md` 必须能追溯到 `01-技术方案` 和 `02-方案审核`。
- 若同步过程中发现规格遗漏，必须停止并回到 `01-技术方案` / `02-方案审核` 重新 Gate。
- 完成后建议进入 `sdlc-speckit-clarify` 做残余未决问题校验。
