# code-review-normalizer Skill Contract

## Metadata

```yaml
name: code-review-normalizer
version: 0.1.0
category: Reviewer Skill / Producer Skill
stage: Code Review Normalization
standard_package: ai-sdlc-standard
status: active
input_artifacts:
  - raw code review report
  - code diff or changed file list
  - library/{requirement_id}/01-技术方案/*
  - optional library/{requirement_id}/03-实现记录/*
output_artifacts:
  - library/{requirement_id}/04-代码审核/{requirement_id}__代码审核__vN.md
  - manifest.md gate decision update recommendation
required_schema:
  - ess/code-review-schema.md
required_checklist:
  - checklists/code-review-checklist.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - write normalized code review artifact when explicitly requested
  - recommend manifest.md updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - review report is missing
  - code diff or changed file list is missing
  - specification basis is missing for behavioral findings
  - finding cannot be mapped to file, line, or symbol
  - suggested fix expands business scope
```

## Responsibilities

`code-review-normalizer` 将 DeepSeek、Codex、人工或其他 Reviewer 的代码审查输出归一成可执行的 Code Review Report。

它负责：

- 将自由格式 Review 转换为 `ess/code-review-schema.md`。
- 为每个问题补齐 Severity、File、Line or Symbol、Specification Basis、Impact、Suggested Fix、Blocking。
- 判断 Review 是否可被实现者直接消费。
- 识别代码实现与 `01-技术方案`、`02-方案审核`、`03-实现记录` 的不一致。
- 建议更新 manifest 的 `04 代码审核`、Gate Decisions、Activity Log 和 Blocking Issues。

它不负责：

- 修改业务代码。
- 替代 Reviewer 发现所有问题。
- 凭空补造规格依据。
- 将 Review 建议扩大成新需求。
- 替代 `test-feedback-sync` 处理测试反馈。

## Input Contract

必需输入：

- 原始代码审查报告。
- 代码 diff、提交范围或变更文件列表。
- `library/{requirement_id}/01-技术方案/*`

建议输入：

- `library/{requirement_id}/02-方案审核/*`
- `library/{requirement_id}/03-实现记录/*`
- `ess/code-review-schema.md`
- `checklists/code-review-checklist.md`

缺失输入处理：

- 缺少 Review 报告时停止。
- 缺少 diff 或变更文件列表时停止。
- 缺少规格依据时，可以归一格式，但涉及行为正确性的发现必须标记为 Missing Information。
- 如果 Review 只有泛泛建议，没有文件位置和规格依据，结果必须标记为不可直接消费。

## Output Contract

默认输出：

```text
library/{requirement_id}/04-代码审核/{requirement_id}__代码审核__vN.md
```

输出必须符合 `ess/code-review-schema.md`，包含：

- Conclusion
- Critical / High / Medium / Low
- Architecture
- Behavior Compatibility
- Data Consistency
- Transaction and Idempotency
- Exception Handling
- Performance
- Security
- Maintainability
- Test Gap
- Suggested Fixes
- Next Step

每个问题必须包含：

- ID
- Severity
- File
- Line or Symbol
- Specification Basis
- Problem
- Impact
- Suggested Fix
- Blocking: yes/no

建议更新：

- Artifact Index: `04 代码审核`
- Gate Decisions: `代码审核`
- Activity Log
- Blocking Issues
- Next Step

## Side Effects

允许：

- 写入 `04-代码审核` 归一化报告。
- 输出 manifest 更新建议。
- 读取代码 diff 或文件内容以定位 Review 问题。

禁止：

- 修改业务代码。
- 修改技术方案或实现记录。
- 修改 `.specify/business_domain/**`。
- 自动接受风险。
- 将无规格依据的建议变成必须实现项。

## Blocking Conditions

必须停止或输出不可消费结论的情况：

- Review 报告缺失。
- diff 或变更文件列表缺失。
- Critical / High 无文件位置。
- 行为类问题缺少 Specification Basis。
- Suggested Fix 会引入方案外行为。
- Review 结论与已通过方案冲突。

## Gate Requirements

前置 Gate：

- 实现已完成或已有可审查 diff。
- `01-技术方案` 应存在。

后置 Gate：

- Critical 必须修复后才能进入测试。
- High 原则上必须修复；若风险接受，必须写明 Accepted By、Reason、Follow-up。
- Review Missing 应交给 `test-feedback-sync` 或后续 Sync 流程沉淀到 Review Checklist。
