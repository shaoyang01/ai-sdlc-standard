# Routing Rules

## Artifact Node Inference

Map user intent to one DocFlow node.

| User intent examples | Node directory | Artifact type |
| --- | --- | --- |
| 需求资料, 原始需求, 保存截图说明, 飞书需求整理 | `00-需求资料/` | `需求资料` |
| 技术文档, 技术方案, 设计方案, 需求文档, 接口文档, 架构文档 | `01-技术方案/` | `技术方案` |
| 方案审核, 方案审查, 审阅方案, 开发前 Gate, 方案评审报告 | `02-方案审核/` | `方案审核` |
| 实现记录, 实现总结, Codex 实现摘要, 开发记录, 改动说明 | `03-实现记录/` | `实现记录` |
| 代码审核, 代码审查, Code Review, Review 报告 | `04-代码审核/` | `代码审核` |
| 测试反馈, 测试验收, 整理 bug, 测试截图, 复现步骤, 验收问题 | `05-测试验收/` | `测试验收` |

If multiple nodes match, prefer the more specific node:

1. 测试验收
2. 代码审核
3. 方案审核
4. 实现记录
5. 技术方案
6. 需求资料

## Output Format Inference

| User wording | Output format |
| --- | --- |
| html, HTML, 网页, 页面版 | HTML |
| markdown, md, Markdown | Markdown |
| 飞书, Lark, 在线文档, 云文档, docx | Lark/Feishu |

If the user says only `生成技术文档`, `生成方案`, `生成报告`, or similar wording without an output format, ask the user to choose Markdown, HTML, or Lark/Feishu.

## Requirement ID Inference

Use an existing `YYYYMMDD-short-name` when present in the user prompt, file paths, or nearby context.

If no existing ID is present:

1. Use today's date.
2. Derive a short semantic name from the requirement.
3. Prefer stable English kebab-case.
4. Ask for a short name if the requirement is too vague.

Examples:

```text
20260629-ai-sdlc-standard
20260629-straight-order-outbound-receipt
20260629-prod-batch-schedule-config
```

## Clarification Rules

Ask only the minimum blocking question.

Ask for output format when format is unknown:

```text
这份文档要输出为哪种格式：Markdown、HTML，还是飞书文档？
```

Ask for requirement short name when the requirement ID cannot be safely generated:

```text
这个需求目录要用哪个短名？例如 20260629-order-dispatch-rule。
```
