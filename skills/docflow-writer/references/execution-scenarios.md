# Execution Scenarios

Use these scenarios as dry-run checks before writing or publishing DocFlow artifacts.

## Dry-Run Matrix

| User prompt | Artifact node | Output format | Requirement ID | Expected action |
| --- | --- | --- | --- | --- |
| 生成订单下发规则 HTML 技术方案 | `01-技术方案` | HTML | `20260629-order-dispatch-rule` | Write `library/20260629-order-dispatch-rule/01-技术方案/20260629-order-dispatch-rule__技术方案__v1.html` and update `manifest.md`. |
| 生成方案审核报告 20260629-ai-sdlc-standard | `02-方案审核` | unknown | `20260629-ai-sdlc-standard` | Ask for Markdown, HTML, or Lark/Feishu before writing. |
| 生成飞书代码审核报告，更新这个文档 URL | `04-代码审核` | Lark/Feishu | from URL/context, or unknown | Read `lark-cli skills read lark-doc`; confirm append, overwrite, or section replacement if the update mode is unspecified. |
| 整理测试反馈成文档，已有 v1 | `05-测试验收` | user-specified | existing requirement ID | Write the next version, such as `v2`; do not overwrite `v1` unless explicitly requested. |
| 只发飞书，不要本地备份 | inferred from intent | Lark/Feishu | provided or generated | Publish through `lark-cli`; update `manifest.md` with the URL when possible; do not create a local Gate artifact unless requested. |
| 生成技术文档 | `01-技术方案` | unknown | possibly unknown | Ask for the output format first; ask for a short requirement name only if the ID cannot be safely generated. |

## Required Dry-Run Output

Before changing files or publishing documents, determine and report:

- Artifact node and node directory.
- Output format.
- Requirement ID.
- Target local path or Lark/Feishu document target.
- Whether the artifact is new, next-version, or an update.
- Blocking questions, if any.

## Blocking Examples

Stop and ask one short question when:

- The output format is unknown.
- The artifact node cannot be inferred.
- The requirement ID cannot be safely generated.
- A Lark/Feishu update target exists but the update mode is unspecified.
- Required schema sections would be omitted due to missing source material.

## Non-Blocking Defaults

Use these defaults when they are safe:

- Use `v1` when no prior artifact exists in the node directory.
- Use the next integer version when prior versions exist.
- Use today's date for a newly generated requirement ID.
- Use the standard DocFlow path before any legacy summary path.
