# requirement-normalizer Skill Contract

## Metadata

```yaml
name: requirement-normalizer
version: 0.1.0
category: Intake Skill / Producer Skill
stage: Requirement Intake / Requirement Normalization
standard_package: ai-sdlc-standard
status: proposed
input_artifacts:
  - raw requirement text
  - optional Lark/Feishu document
  - optional HTML or Markdown requirement document
  - optional screenshots or user conversation summary
output_artifacts:
  - library/{requirement_id}/00-需求资料/{requirement_id}__需求摘要__vN.md
  - manifest.md metadata update recommendation
required_schema:
  - ai-sdlc/artifact-flow.md
required_storage:
  - ai-sdlc/artifact-storage.md
  - ai-sdlc/change-control.md
side_effects:
  - write normalized requirement artifact when explicitly asked to produce output
  - recommend manifest.md updates
can_modify_code: false
can_modify_docs: true
can_modify_knowledge_base: false
can_execute_commands: true
blocking_conditions:
  - requirement source is missing
  - requirement source is unreadable
  - business goal cannot be identified
  - conflicting sources have no priority
  - required attachment or context is missing
```

## Responsibilities

`requirement-normalizer` 是需求入口整理器。

它负责：

- 接收飞书、HTML、Markdown、纯文本、截图说明或对话摘要等原始需求来源。
- 提取业务目标、用户意图、当前问题、初步范围和不确定点。
- 记录来源元数据、来源优先级和冲突点。
- 生成 `00-需求资料` 节点的标准需求摘要。
- 为 `specification-writer` 提供稳定输入。

它不负责：

- 编写技术方案。
- 审阅技术方案。
- 判断开发路径。
- 修改业务代码。
- 将冲突来源中的任一方擅自当作确定事实。

## Input Contract

允许输入：

- 飞书 / Lark 文档内容或链接摘要。
- HTML、Markdown、PDF 提取内容。
- 用户在当前对话中的需求描述。
- 截图 OCR 或人工说明。
- 历史上下文摘要。

必须记录：

- Source Type
- Source Location / Reference
- Captured At
- Parsed By
- Source Priority
- Missing Context
- Conflicts

缺失输入处理：

- 无法判断业务目标时停止。
- 关键附件不可读时停止。
- 多个来源冲突且没有优先级时停止。
- 可以生成“待确认需求摘要”，但不得把待确认内容写成确定事实。

## Output Contract

默认输出：

```text
library/{requirement_id}/00-需求资料/{requirement_id}__需求摘要__vN.md
```

输出必须包含：

- 原始来源
- 来源元数据
- 业务目标
- 用户意图
- 当前问题
- 初步 In Scope
- 初步 Out of Scope
- 成功标准草案
- 不确定点
- 来源冲突
- 待确认事项
- 建议下一步

建议更新：

- manifest Metadata
- Artifact Index: `00 需求资料`
- Activity Log
- Missing Artifacts
- Next Step: 执行 `specification-writer`

## Side Effects

允许：

- 写入 `00-需求资料` 产物。
- 输出 manifest 更新建议。
- 在用户明确要求时调用读取类工具提取文档内容。

禁止：

- 修改业务代码。
- 修改 `.specify/business_domain/**`。
- 生成 `01-技术方案`。
- 输出 Gate Result。
- 自动唤醒 Speckit pipeline。

## Blocking Conditions

必须停止的情况：

- 需求来源为空。
- 关键来源不可读。
- 无法识别需求要解决什么问题。
- 来源冲突影响业务目标或范围。
- 缺少必须附件、截图或上下文。
- 需要猜测用户真实意图。

## Gate Requirements

后置要求：

- 输出可被 `specification-writer` 消费。
- 如果存在待确认事项，必须显式记录。
- 如果待确认事项影响核心 Scope，不得进入 `specification-writer` 生成确定方案。
- 如果是变更或返工，必须遵守 `ai-sdlc/change-control.md`。
