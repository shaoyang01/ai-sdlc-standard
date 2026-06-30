# test-feedback-sync Skill Contract

## Metadata

```yaml
name: test-feedback-sync
version: 0.1.0
category: Sync Skill / Producer Skill
stage: Test Feedback Classification / Knowledge Sync
standard_package: ai-sdlc-standard
status: proposed
input_artifacts:
  - raw test feedback
  - library/{requirement_id}/01-技术方案/*
  - library/{requirement_id}/02-方案审核/*
  - optional library/{requirement_id}/03-实现记录/*
  - optional library/{requirement_id}/04-代码审核/*
output_artifacts:
  - library/{requirement_id}/05-测试验收/{requirement_id}__测试验收__vN.md
  - checklist or schema update recommendation
  - manifest.md change or re-gate update recommendation
required_schema:
  - ess/test-feedback-schema.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - write structured test feedback artifact when explicitly requested
  - recommend checklist, schema, or manifest updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - raw feedback is missing
  - failure cannot be classified
  - specification missing is detected but no re-gate path is recorded
  - requirement change is detected but no change-control decision exists
```

## Responsibilities

`test-feedback-sync` 将测试、验收、线上验证反馈结构化，并判断是否需要回写方案、Checklist、Schema 或变更流程。

它负责：

- 将测试反馈转换为 `ess/test-feedback-schema.md`。
- 对失败项分类：
  - Implementation Bug
  - Specification Missing
  - Review Missing
  - Requirement Change
  - Test Case Issue
- 判断是否需要回到 `01-技术方案` / `02-方案审核` Re-Gate。
- 建议更新 Specification Checklist、Code Review Checklist、Test Feedback Schema 或 manifest。
- 生成 `05-测试验收` 产物。

它不负责：

- 修改业务代码。
- 直接修复测试失败。
- 直接修改长期业务知识库。
- 把测试反馈中的新诉求直接塞回当前需求。
- 跳过 change-control 处理需求变化。

## Input Contract

必需输入：

- 原始测试反馈、验收反馈或线上验证反馈。
- `library/{requirement_id}/01-技术方案/*`
- `library/{requirement_id}/02-方案审核/*`

建议输入：

- `library/{requirement_id}/03-实现记录/*`
- `library/{requirement_id}/04-代码审核/*`
- 复现步骤、截图、日志、环境、数据样本。
- `ai-sdlc/change-control.md`

缺失输入处理：

- 缺少原始反馈时停止。
- 缺少方案或方案审核时，可以记录反馈，但必须标记 Missing Artifacts。
- 无法判断失败分类时，输出 `FAIL` 并要求补充复现、日志或业务口径。

## Output Contract

默认输出：

```text
library/{requirement_id}/05-测试验收/{requirement_id}__测试验收__vN.md
```

输出必须符合 `ess/test-feedback-schema.md`，包含：

- Conclusion
- Test Scope
- Passed Cases
- Failed Cases
- Failure Classification
- Specification Updates Required
- Checklist Updates Required
- Code Fixes Required
- Review Gaps
- Next Step

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

- 写入 `05-测试验收` 结构化反馈。
- 输出 Checklist / Schema / manifest 更新建议。
- 建议 Re-Gate。

必须显式确认：

- 修改 Checklist 或 Schema。
- 将经验沉淀到 `.specify/memory/**`、`.specify/workflow/**` 或 `.specify/coding_guide/**`。

禁止：

- 修改业务代码。
- 直接修改技术方案或代码审核报告。
- 未经确认修改长期知识库。
- 将 Requirement Change 当作 Implementation Bug 直接修。

## Blocking Conditions

必须停止或阻塞的情况：

- 反馈缺少复现或现象，无法分类。
- 核心路径失败。
- 原流程被破坏。
- Specification Missing 但未记录 Re-Gate。
- Requirement Change 但未进入 change-control。
- 测试结果无法复现且缺少环境/数据说明。

## Gate Requirements

前置 Gate：

- 已有可验证实现或测试反馈。
- 方案和方案审核应存在。

后置 Gate：

- Implementation Bug 进入 Fix。
- Specification Missing 必须回到方案并重新审核。
- Review Missing 必须进入 Review Checklist 更新建议。
- Requirement Change 必须进入 change-control。
- Test Case Issue 可更新测试口径后继续验收。
