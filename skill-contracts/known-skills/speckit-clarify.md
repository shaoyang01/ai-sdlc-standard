# speckit-clarify Skill Contract

## Metadata

```yaml
name: speckit-clarify
version: 0.1.0
category: Auditor Skill / Producer Skill
stage: Residual Clarification Validation
standard_package: ai-sdlc-standard
status: proposed
input_artifacts:
  - specs/{feature}/spec.md
  - library/{requirement_id}/01-技术方案/*
  - library/{requirement_id}/02-方案审核/*
  - library/{requirement_id}/manifest.md
output_artifacts:
  - updated specs/{feature}/spec.md Clarifications section
  - clarification coverage summary
  - manifest.md Activity Log update recommendation
required_schema:
  - ess/specification-schema.md
required_checklist:
  - checklists/specification-checklist.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - update specs/{feature}/spec.md after accepted clarification
  - recommend manifest.md Activity Log or Re-Gate updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - core business ambiguity remains after solution review
  - clarification would change approved scope
  - answer requires user/business confirmation but is unavailable
  - clarification contradicts approved technical specification
```

## Responsibilities

`speckit-clarify` 在新流程中只做残余未决问题校验。

它负责：

- 检查 `specs/spec.md` 是否仍存在影响 Plan / Tasks / Test 的未决问题。
- 将非核心、局部、可回答的残余澄清写入 `specs/spec.md`。
- 输出覆盖性摘要，说明哪些类别 Clear / Resolved / Deferred / Blocking。
- 在发现核心需求仍不清楚时阻塞流程，并要求回到 `01-技术方案` / `02-方案审核`。

它不负责：

- 从零澄清需求。
- 在 pipeline 内扩大需求范围。
- 改写方案审核结论。
- 把核心业务问题包装成实现细节。
- 替代 `solution-reviewer` 决定开发路径。

## Input Contract

必需输入：

- `specs/{feature}/spec.md`
- `library/{requirement_id}/01-技术方案/*`
- `library/{requirement_id}/02-方案审核/*`

建议输入：

- `library/{requirement_id}/manifest.md`
- `solution-reviewer` 的 Development Path Recommendation
- 方案审核 Required Actions 和 Pending Confirmation

缺失输入处理：

- 缺少 `specs/spec.md` 时停止并回到 `speckit-specify`。
- 缺少方案或方案审核时停止。
- 若 manifest 不存在，可以继续只读校验，但必须建议创建或更新 Activity Log。

## Clarification Rules

默认假设：

- 进入本 Skill 前，核心需求问题已经由 `specification-writer` 和 `solution-reviewer` 处理。
- 正常情况下不应再出现必须询问用户的核心范围问题。

允许澄清：

- 不改变 Scope 的术语一致性。
- 不改变业务规则的验收表述。
- 不改变开发路径的测试边界补充。
- 不影响方案结论的非核心缺口。

必须回退：

- 影响 In Scope / Out of Scope。
- 改变原流程兼容策略。
- 改变状态流转、数据来源、异常处理或失败策略。
- 需要新增方案中没有定义的业务规则。
- 与方案审核结论冲突。

## Output Contract

如有澄清，更新：

```text
specs/{feature}/spec.md
```

必须保留或新增：

```markdown
## Clarifications

### Session YYYY-MM-DD

- Q: <question> -> A: <answer>
```

最终输出必须包含：

- Questions Asked
- Sections Touched
- Coverage Summary
- Blocking / Deferred Items
- Recommendation: proceed to plan / return to specification / return to solution review

## Side Effects

允许：

- 更新 `specs/{feature}/spec.md` 的 Clarifications section。
- 建议更新 manifest Activity Log。
- 建议创建 Re-Gate Records。

禁止：

- 修改业务代码。
- 修改 `01-技术方案` 或 `02-方案审核`。
- 修改 `.specify/business_domain/**`。
- 在没有用户确认时写入影响业务行为的澄清。

## Blocking Conditions

必须停止的情况：

- 澄清会改变已审核方案范围。
- 澄清会改变状态流转、异常处理、兼容策略、数据写入或测试验收口径。
- 用户无法回答核心问题。
- `specs/spec.md` 与 `01-技术方案` 不一致。
- `specs/spec.md` 与 `02-方案审核` 的 Required Actions 冲突。

## Gate Requirements

前置 Gate：

- `speckit-specify` 已生成或同步 `specs/spec.md`。
- `solution-reviewer` 已通过。

后置 Gate：

- 无核心未决问题时，可进入 `speckit-plan`。
- 存在核心未决问题时，必须回到 `01-技术方案` / `02-方案审核`，并在 manifest Re-Gate Records 中记录。
- 任何新增 clarification 都必须可追溯到已审核方案或用户明确回答。
