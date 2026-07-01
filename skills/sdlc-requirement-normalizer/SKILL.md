---
name: sdlc-requirement-normalizer
description: |
  This skill should be used when the user asks to "整理需求", "归一化需求", "生成需求摘要", "输出 00-需求资料", "把飞书/HTML/Markdown/聊天记录整理成需求", or asks to turn raw requirement sources into a stable DocFlow requirement intake artifact before sdlc-specification-writer.
version: 0.1.0
---

# Requirement Normalizer

Normalize raw requirement sources into the DocFlow `00-需求资料` artifact. Treat this artifact as the stable intake input for `sdlc-specification-writer`; do not write the technical specification in this skill.

## Core Rules

1. Normalize requirement intake only.
2. Do not write technical specifications.
3. Do not review or approve a solution.
4. Do not decide the development path.
5. Do not modify production code.
6. Do not modify `specs/**` or `.specify/business_domain/**`.
7. Do not invent business goals, scope, or acceptance criteria.
8. Preserve uncertainty as `待确认事项`.
9. Preserve source conflicts as `来源冲突`.
10. Use `library/{requirement_id}/00-需求资料/` as the default local output node.
11. Follow `ai-sdlc/change-control.md` when the input looks like a change, rework, or requirement misunderstanding.
12. Recommend `sdlc-specification-writer` only when core scope is stable enough to write a specification.

## Required Standard Files

Use these repository standard files as authoritative rules:

- `${AI_SDLC_STANDARD_HOME}/skill-contracts/known-skills/sdlc-requirement-normalizer.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/artifact-flow.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/artifact-storage.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/change-control.md`
- `${AI_SDLC_STANDARD_HOME}/templates/artifact-manifest-template.md`

## Reference Files

Load these references as needed:

- `references/intake-workflow.md` for the step-by-step normalization workflow.
- `references/source-handling.md` for supported source types, source metadata, and priority rules.
- `references/conflict-and-blocking.md` for conflict handling, blocking conditions, and change detection.
- `references/output-artifact.md` for the required output structure and manifest recommendations.

## Workflow

### 1. Resolve Inputs

Identify:

- Requirement ID or short name
- Raw requirement source
- Source type and source location
- Source priority, if multiple sources exist
- Existing `library/{requirement_id}/00-需求资料/` artifacts, if any
- Existing downstream artifacts that may be affected by a change
- Missing attachments, screenshots, links, or context

At least one readable source must exist:

- User-confirmed requirement content in the conversation
- Lark/Feishu document content or link summary
- HTML, Markdown, PDF extraction, or exported requirement document
- Screenshot OCR or user-provided screenshot explanation
- Historical context summary

Stop if the business goal cannot be identified.

### 2. Classify The Intake

Classify the input as one of:

- New requirement
- Requirement supplement
- Requirement change
- Rework after misunderstood requirement
- Test or review feedback that changes scope
- Documentation-only correction

Use `ai-sdlc/change-control.md` when the input affects an existing requirement. Default to the existing `requirement_id` when the business goal is unchanged.

### 3. Normalize Sources

Read:

- `references/intake-workflow.md`
- `references/source-handling.md`

Extract:

- Business goal
- User intent
- Current problem
- Initial In Scope
- Initial Out of Scope
- Draft success criteria
- Constraints and known non-goals
- Uncertainty
- Conflicts
- Missing context

Do not turn unclear statements into confirmed requirements.

### 4. Handle Conflicts And Blocking

Read `references/conflict-and-blocking.md` before finalizing the artifact.

Stop instead of producing a definitive summary when:

- Requirement source is missing.
- Key source is unreadable.
- Business goal is unclear.
- Multiple sources conflict on business goal, scope, success criteria, or compatibility.
- Required attachment or context is missing.
- Any confirmed statement would require guessing the user's intent.

When useful, produce a `待确认需求摘要` that clearly marks unresolved items and blocks progression to specification writing.

### 5. Output Or Write

Read `references/output-artifact.md` before producing or writing the final artifact.

By default, return the normalized requirement summary in the response.

When the user explicitly asks to generate a local artifact, write:

```text
library/{requirement_id}/00-需求资料/{requirement_id}__需求摘要__vN.md
```

Use `sdlc-docflow-writer` for HTML, Lark/Feishu, manifest writes, and output routing when requested. Keep this skill responsible for requirement semantics only.

### 6. Report Next Step

Always report:

- Requirement ID
- Output artifact path or recommended path
- Intake classification
- Source coverage
- Source conflicts
- Missing context
- Whether the artifact is ready for `sdlc-specification-writer`
- Manifest update recommendations
- Next step

## Output Requirements

Every normalized requirement summary must contain:

- 原始来源
- 来源元数据
- 需求入口分类
- 业务目标
- 用户意图
- 当前问题
- 初步 In Scope
- 初步 Out of Scope
- 成功标准草案
- 约束与非目标
- 不确定点
- 来源冲突
- 待确认事项
- 变更/返工判断
- 建议下一步

## Stop Conditions

Stop instead of writing a definitive requirement summary when:

- Requirement source is missing or unreadable.
- Business goal cannot be identified.
- In Scope or Out of Scope cannot be separated.
- Multiple source interpretations exist without priority.
- Required attachments, screenshots, or referenced documents are unavailable.
- The next step would depend on guessed business intent.
