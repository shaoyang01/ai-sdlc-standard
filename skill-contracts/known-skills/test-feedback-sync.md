# test-feedback-sync Skill Contract

## Metadata

```yaml
name: test-feedback-sync
version: 0.1.0
category: Sync Skill / Producer Skill
stage: Test Feedback Sync / Knowledge Sync
standard_package: ai-sdlc-standard
status: active
input_artifacts:
  - library/{requirement_id}/05-测试验收/*
  - library/{requirement_id}/01-技术方案/*
  - library/{requirement_id}/02-方案审核/*
  - optional library/{requirement_id}/03-实现记录/*
  - optional library/{requirement_id}/04-代码审核/*
output_artifacts:
  - checklist or schema update recommendation
  - manifest.md change or re-gate update recommendation
required_schema:
  - ess/test-feedback-schema.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - recommend checklist, schema, or manifest updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - classified test feedback artifact is missing
  - feedback classification is unresolved
  - specification missing is detected but no re-gate path is recorded
  - requirement change is detected but no change-control decision exists
```

## Responsibilities

`test-feedback-sync` 消费已结构化的测试验收产物，判断是否需要回写 Checklist、Schema、manifest 或后续知识同步。

它负责：

- 读取 `test-feedback-classifier` 生成的 `05-测试验收` 产物。
- 判断是否需要回到 `01-技术方案` / `02-方案审核` Re-Gate。
- 建议更新 Specification Checklist、Code Review Checklist、Test Feedback Schema 或 manifest。
- 为后续知识同步提供稳定的更新建议。

它不负责：

- 修改业务代码。
- 直接修复测试失败。
- 直接修改长期业务知识库。
- 重新分类原始测试反馈。
- 覆盖 `05-测试验收` 分类结果。
- 把测试反馈中的新诉求直接塞回当前需求。
- 跳过 change-control 处理需求变化。

## Input Contract

必需输入：

- `library/{requirement_id}/05-测试验收/*`
- `library/{requirement_id}/01-技术方案/*`
- `library/{requirement_id}/02-方案审核/*`

建议输入：

- `library/{requirement_id}/03-实现记录/*`
- `library/{requirement_id}/04-代码审核/*`
- `ai-sdlc/change-control.md`

缺失输入处理：

- 缺少已分类测试验收产物时停止。
- 缺少方案或方案审核时，可以记录反馈，但必须标记 Missing Artifacts。
- 反馈分类未决时，返回 `test-feedback-classifier` 补充分类。

## Output Contract

默认输出：

- Checklist / Schema 更新建议。
- manifest Change History / Re-Gate Records / Blocking Issues 更新建议。
- 后续 Sync 目标和残余风险。

分类处理规则：

| Classification | 必需动作 |
| --- | --- |
| Implementation Bug | 进入 Fix，更新实现记录，必要时重新代码审核。 |
| Specification Missing | 回到 `01-技术方案`，生成新版本并重新方案审核；如具复用价值，更新 Specification Checklist 或 Schema。 |
| Review Missing | 记录 Review 缺口，建议更新 Code Review Checklist。 |
| Requirement Change | 按 `ai-sdlc/change-control.md` 判断沿用当前 requirement_id 或新建需求。 |
| Test Case Issue | 更新测试口径，不要求改方案或代码。 |

建议更新：

- Artifact Index: `05 测试验收`
- Activity Log
- Change History
- Re-Gate Records
- Blocking Issues
- Next Step

## Side Effects

允许：

- 输出 Checklist / Schema / manifest 更新建议。
- 建议 Re-Gate。

必须显式确认：

- 修改 Checklist 或 Schema。
- 将经验沉淀到 `.specify/memory/**`、`.specify/workflow/**` 或 `.specify/coding_guide/**`。

禁止：

- 修改业务代码。
- 直接修改技术方案或代码审核报告。
- 覆盖 `05-测试验收` 分类结果。
- 未经确认修改长期知识库。
- 将 Requirement Change 当作 Implementation Bug 直接修。

## Blocking Conditions

必须停止或阻塞的情况：

- 已分类反馈证据不足，无法判断是否需要 Sync 或 Re-Gate。
- 已分类测试验收产物缺失。
- 核心路径失败。
- 原流程被破坏。
- Specification Missing 但未记录 Re-Gate。
- Requirement Change 但未进入 change-control。
- 测试结果无法复现且 `05-测试验收` 缺少环境/数据说明。

## Gate Requirements

前置 Gate：

- 已有可验证实现或测试反馈。
- `test-feedback-classifier` 已产出 `05-测试验收`，或用户提供等价结构化分类。
- 方案和方案审核应存在。

后置 Gate：

- Implementation Bug 进入 Fix。
- Specification Missing 必须回到方案并重新审核。
- Review Missing 必须进入 Review Checklist 更新建议。
- Requirement Change 必须进入 change-control。
- Test Case Issue 可更新测试口径后继续验收。
