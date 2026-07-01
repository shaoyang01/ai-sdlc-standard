---
name: sdlc-docflow-writer
description: |
  This skill should be used when the user asks to "生成技术文档", "生成html技术文档", "生成markdown技术方案", "生成飞书文档", "生成方案审核", "生成代码审核报告", "整理测试反馈成文档", "输出实现记录", or asks to create Markdown, HTML, or Lark/Feishu documents for DocFlow artifacts.
version: 0.1.0
---

# DocFlow Writer

## Purpose

Generate DocFlow-aligned documents from user intent. Determine the artifact node, output format, requirement ID, and target path before writing or publishing.

Support three output targets:

- Markdown file
- HTML file
- Lark/Feishu online document through `lark-cli` user identity

## Core Rules

1. Classify the requested artifact node before generating content.
2. Classify the requested output format before writing or publishing.
3. If the output format cannot be inferred, ask the user to choose Markdown, HTML, or Lark/Feishu.
4. Write local DocFlow artifacts under `library/{requirement_id}/{node_directory}/`.
5. Do not use legacy `library/技术方案/` or `library/代码审核/` as the primary DocFlow path.
6. Treat `specs/**` as the SpecKit machine source of truth and `library/{requirement_id}/**` as the human handoff view.
7. When publishing to Lark/Feishu, use `lark-cli` with user identity. If authorization expires, stop and ask the user to renew authorization.
8. Do not silently downgrade a requested Lark/Feishu document into a local-only file.

## Required References

Load these references as needed:

- `references/routing-rules.md` for artifact node and output format inference.
- `references/output-targets.md` for local file paths, naming, and manifest behavior.
- `references/lark-cli.md` for Lark/Feishu output rules.
- `references/legacy-html-style.md` for compatibility with the old `html-doc-style` visual constraints.

Load `references/execution-scenarios.md` before any write or publish operation.

Use repository standard files as authoritative rules:

- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/artifact-storage.md`
- `${AI_SDLC_STANDARD_HOME}/ess/specification-schema.md`
- `${AI_SDLC_STANDARD_HOME}/ess/review-schema.md`
- `${AI_SDLC_STANDARD_HOME}/ess/code-review-schema.md`
- `${AI_SDLC_STANDARD_HOME}/ess/test-feedback-schema.md`
- `${AI_SDLC_STANDARD_HOME}/templates/artifact-manifest-template.md`

## Workflow

### 1. Parse Intent

Extract:

- Artifact node
- Output format
- Requirement ID or requirement short name
- Source materials
- Whether the document is a new artifact or an update

If the artifact node cannot be inferred, ask one short clarification question.

If the output format cannot be inferred, ask:

```text
这份文档要输出为哪种格式：Markdown、HTML，还是飞书文档？
```

### 2. Resolve Requirement ID

Use an existing requirement ID if the user provides one.

If no requirement ID is provided:

1. Generate `YYYYMMDD-short-name`.
2. Use a concise lowercase kebab-case English short name when possible.
3. If only a Chinese requirement name exists, use a short pinyin-like or semantic English slug when obvious; otherwise ask for a short name.

### 3. Resolve Target

For local output, use:

```text
library/{requirement_id}/{node_directory}/{requirement_id}__{artifact_type}__vN.{ext}
```

For Lark/Feishu output:

1. Create or update the online document through `lark-cli`.
2. Record the online document URL in `library/{requirement_id}/manifest.md` when local filesystem access is available.
3. If the user requests local backup, also write Markdown or HTML to the standard node directory.

### 4. Dry-Run Before Output

Before changing files or publishing documents, report the dry-run result from `references/execution-scenarios.md`:

- Artifact node and node directory
- Output format
- Requirement ID
- Target local path or Lark/Feishu document target
- Whether the artifact is new, next-version, or an update
- Blocking questions, if any

Stop before writing or publishing if any blocking question remains.

### 5. Generate Content

Use the schema matching the artifact node:

- 技术方案: `${AI_SDLC_STANDARD_HOME}/ess/specification-schema.md`
- 方案审核: `${AI_SDLC_STANDARD_HOME}/ess/review-schema.md` and `${AI_SDLC_STANDARD_HOME}/templates/gate-result-template.md`
- 实现记录: include implementation summary, verification, unfinished items, and residual risks
- 代码审核: `${AI_SDLC_STANDARD_HOME}/ess/code-review-schema.md`
- 测试验收: `${AI_SDLC_STANDARD_HOME}/ess/test-feedback-schema.md`
- 需求资料: preserve source facts and clearly mark unresolved context

Do not invent business rules. Mark missing or uncertain information explicitly.

Do not omit required schema sections. If source material is missing, keep the section and mark the missing information explicitly.

### 6. Write or Publish

For Markdown:

- Write `.md` to the resolved node directory.

For HTML:

- Write complete `.html` to the resolved node directory.
- Follow `references/legacy-html-style.md` unless the user requests a different style.

For Lark/Feishu:

- Use `lark-cli` user identity.
- Stop if authorization is missing or expired.
- Report the document URL after success.

### 7. Report Result

Always report:

- Artifact node
- Output format
- Requirement ID
- Local path or Lark/Feishu URL
- Any missing information
- Whether the artifact can be used as a Gate input

## Side Effects

Allowed:

- Create directories under `library/{requirement_id}/`
- Write Markdown or HTML files
- Update `manifest.md`
- Create or update Lark/Feishu documents through `lark-cli`

Not allowed:

- Modify production code
- Modify `specs/**` as the source of truth
- Modify `.specify/business_domain/**`
- Commit or push git changes
- Treat Lark/Feishu publication as complete when authorization failed
