# solution-reviewer Skill Contract

## Metadata

```yaml
name: solution-reviewer
version: 0.1.0
category: Auditor Skill
stage: Specification Audit / Development Path Routing
standard_package: ai-sdlc-standard
status: active
input_artifacts:
  - library/{requirement_id}/01-技术方案/*
  - optional specs/**
  - optional repository context
output_artifacts:
  - library/{requirement_id}/02-方案审核/{requirement_id}__方案审核__vN.md
  - manifest.md gate decision update recommendation
  - development path decision recommendation
required_schema:
  - ess/specification-schema.md
  - ess/review-schema.md
required_checklist:
  - checklists/specification-checklist.md
  - templates/gate-result-template.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - write review artifact when explicitly asked to produce output
  - recommend manifest.md updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - missing technical specification
  - unreadable required artifact
  - missing core requirement boundary
  - implementation would require undefined business behavior
  - PASS_WITH_RISK requested without risk acceptance
```

## Responsibilities

`solution-reviewer` 审阅技术方案是否足以进入开发路径选择。

它负责：

- 审查 `01-技术方案` 是否符合 ESS Specification Schema。
- 按 Critical / High / Medium / Low 输出缺口、风险和修复动作。
- 判断技术方案是否可以继续。
- 输出开发路径建议：
  - `DIRECT_IMPLEMENTATION`
  - `SPECKIT_PIPELINE_REQUIRED`
  - `BLOCKED_NEEDS_REVISION`
- 说明是否需要更新 `manifest.md` 的 Gate Decisions、Development Path Decision、Activity Log 或 Blocking Issues。

它不负责：

- 编写或重写技术方案。
- 修改业务代码。
- 代替 `docflow-writer` 做文档路由和发布。
- 代替 `speckit-pipeline-confirmed-single` 执行完整 SDD 流程。
- 在方案不完整时自行补业务规则。

## Input Contract

必需输入：

- `library/{requirement_id}/01-技术方案/*`
- `ess/specification-schema.md`
- `ess/review-schema.md`
- `checklists/specification-checklist.md`
- `templates/gate-result-template.md`
- `ai-sdlc/artifact-storage.md`

可选输入：

- `library/{requirement_id}/00-需求资料/*`
- `specs/**`
- 当前代码事实、diff、接口或数据模型上下文
- `library/{requirement_id}/manifest.md`

缺失输入处理：

- 找不到技术方案时必须停止。
- 找不到可选上下文时，可以继续审阅，但必须在 Missing Information 中记录。
- 如果缺失上下文会影响核心判断，结果必须是 `FAIL` 或 `BLOCKED_NEEDS_REVISION`。

## Output Contract

方案审核产物必须输出到：

```text
library/{requirement_id}/02-方案审核/{requirement_id}__方案审核__vN.md
```

若用户要求 HTML 或飞书文档，`solution-reviewer` 只负责审核内容，实际落盘或发布应交给 `docflow-writer`。

输出结构必须包含：

- Reviewed Artifact
- Result: `PASS` / `FAIL` / `PASS_WITH_RISK`
- Can Continue: yes/no
- Development Path Recommendation
- Recommendation Reason
- Critical / High / Medium / Low
- Missing Constraint
- Missing Branch
- Behavior Risk
- Compatibility Risk
- Implementation Risk
- Test Gap
- Pending Confirmation
- Required Actions
- Manifest Update Recommendation
- Next Step

开发路径建议规则：

| Recommendation | 使用条件 | 后续动作 |
| --- | --- | --- |
| `DIRECT_IMPLEMENTATION` | 方案完整、边界清楚、改动范围小或中等、无必须完整 SDD 的复杂协作。 | 进入实现，仍需遵守实现记录和代码审核 Gate。 |
| `SPECKIT_PIPELINE_REQUIRED` | 涉及多模块协作、状态流转、DB/MQ/定时任务、复杂回滚、知识沉淀或用户明确要求完整 SDD。 | 唤醒 `speckit-pipeline-confirmed-single`。 |
| `BLOCKED_NEEDS_REVISION` | 存在 Critical / 未接受 High / 核心待确认问题 / 方案缺必填行为约束。 | 回到 `01-技术方案` 生成新版本并重新审核。 |

## Side Effects

允许：

- 写入 `02-方案审核` 审阅产物。
- 输出 `manifest.md` 更新建议。
- 在用户明确要求时调用 `docflow-writer` 写入 Markdown、HTML 或飞书文档。

禁止：

- 修改业务代码。
- 修改 `.specify/business_domain/**`。
- 自动提交代码。
- 自动唤醒 Speckit pipeline 并进入实现；只能给出建议或在用户明确确认后继续。

## Blocking Conditions

必须停止的情况：

- 技术方案不存在。
- 技术方案无法读取。
- 需求目标或范围无法判断。
- 新逻辑影响原流程但没有定义兼容策略。
- 关键异常、失败降级、幂等、事务、状态流转或测试策略缺失。
- 存在 Critical。
- 存在 High 且没有用户明确风险接受。
- 需要猜测业务规则才能判断开发路径。

## Gate Requirements

前置 Gate：

- `01-技术方案` 必须存在。
- 如果存在需求变更，必须遵守 `ai-sdlc/change-control.md` 的版本和 Re-Gate 规则。

后置 Gate：

- `PASS` 才能直接进入开发路径选择。
- `PASS_WITH_RISK` 必须记录风险接受说明，才能继续。
- `FAIL` 必须回到 `01-技术方案`。
- Development Path Recommendation 必须写入方案审核产物，并建议同步到 `manifest.md`。

## Manifest Update Recommendation

审阅完成后，建议更新：

- Artifact Index: `02 方案审核`
- Gate Decisions: `方案审核`
- Development Path Decision
- Activity Log
- Blocking Issues
- Missing Artifacts

如果结果是 `BLOCKED_NEEDS_REVISION`，必须建议：

- Current Status: `blocked`
- Current Stage: `01-技术方案` 或 `02-方案审核`
- Next Step: 修订技术方案并重新审核

如果结果是 `SPECKIT_PIPELINE_REQUIRED`，必须建议：

- Development Path Decision: `SPECKIT_PIPELINE_REQUIRED`
- Next Step: 唤醒 `speckit-pipeline-confirmed-single`
