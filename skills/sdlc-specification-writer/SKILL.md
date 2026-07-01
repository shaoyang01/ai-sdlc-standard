---
name: sdlc-specification-writer
description: |
  This skill should be used when the user asks to "写技术方案", "生成技术规格", "整理需求成方案", "把 DeepSeek 方案规范化", "输出 01-技术方案", or asks to turn requirements, notes, or a draft solution into an ESS-compliant technical specification before sdlc-solution-reviewer.
version: 0.1.0
---

# Specification Writer

Generate an ESS-compliant technical specification as the DocFlow `01-技术方案` artifact. Treat this specification as the stable input for `sdlc-solution-reviewer` and, when needed, for `sdlc-speckit-specify`.

## Core Rules

1. Generate specification content only.
2. Do not review or approve the specification.
3. Do not decide the final development path.
4. Do not modify production code.
5. Do not modify `specs/**` or `.specify/business_domain/**`.
6. Do not invent business rules.
7. Preserve uncertainty as `待确认事项`.
8. Use `library/{requirement_id}/01-技术方案/` as the default local output node.
9. Use `sdlc-docflow-writer` for HTML, Lark/Feishu, manifest writes, and output routing when requested.
10. After generating the specification, recommend `sdlc-solution-reviewer` as the next Gate.

## Required Standard Files

Use these repository standard files as authoritative rules:

- `${AI_SDLC_STANDARD_HOME}/skill-contracts/known-skills/sdlc-specification-writer.md`
- `${AI_SDLC_STANDARD_HOME}/ess/specification-schema.md`
- `${AI_SDLC_STANDARD_HOME}/templates/technical-specification-template.md`
- `${AI_SDLC_STANDARD_HOME}/checklists/specification-checklist.md`
- `${AI_SDLC_STANDARD_HOME}/templates/artifact-manifest-template.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/artifact-storage.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/change-control.md`

## Reference Files

Load these references as needed:

- `references/writing-workflow.md` for the step-by-step writing workflow.
- `references/schema-mapping.md` for ESS section requirements.
- `references/blocking-rules.md` for when to stop instead of guessing.
- `references/output-artifact.md` for output paths and manifest recommendations.

## Workflow

### 1. Resolve Inputs

Identify:

- Requirement ID or short name
- Requirement source or draft solution
- Existing `00-需求资料` path, if any
- Existing draft technical specification, if any
- Optional repository context
- Requested output format

At least one source must exist:

- `library/{requirement_id}/00-需求资料/*`
- User-confirmed requirement content in the conversation
- Existing draft technical solution

Stop if the business goal or Scope cannot be identified.

### 2. Load Writing Rules

Read:

- `references/writing-workflow.md`
- `references/schema-mapping.md`
- `references/blocking-rules.md`

Read `references/output-artifact.md` before producing or writing the final artifact.

### 3. Build Specification

Generate a technical specification using `${AI_SDLC_STANDARD_HOME}/templates/technical-specification-template.md`.

Preserve all ESS sections:

- 背景
- 目标
- Scope
- 原流程
- 新流程
- 行为约束
- 实现约束
- 状态流转
- 数据来源
- 数据变更
- 接口变更
- 数据库变更
- 缓存影响
- MQ 影响
- 日志
- 监控
- 异常处理
- 边界条件
- 测试方案
- 风险
- 待确认事项

Use "不涉及" only when the section is genuinely not applicable. Use "待确认" when information is missing but relevant.

### 4. Preserve Uncertainty

Do not turn missing information into assumptions when it affects:

- Scope
- Original-flow compatibility
- Failure behavior
- Timeout behavior
- Exception propagation
- Idempotency
- Transaction boundary
- State transitions
- Data source
- DB / cache / MQ writes
- Acceptance criteria

If missing information blocks a reliable specification, stop and ask for clarification.

### 5. Output or Write

By default, return the specification content in the response.

When the user explicitly asks to generate a local artifact, write:

```text
library/{requirement_id}/01-技术方案/{requirement_id}__技术方案.md
```

For HTML or Lark/Feishu output, use `sdlc-docflow-writer` for routing and publishing. Keep this skill responsible for specification content only.

### 6. Report Next Step

Always report:

- Requirement ID
- Output artifact path or recommended path
- Missing information
- Whether the specification is ready for `sdlc-solution-reviewer`
- Manifest update recommendations
- Next step: run `sdlc-solution-reviewer`

## Output Requirements

Every specification must:

- Follow `ess/specification-schema.md`.
- Preserve In Scope / Out of Scope.
- Explain original flow and new flow.
- Define behavior constraints.
- Define implementation constraints.
- Define failure and exception behavior.
- Define testing and acceptance.
- Mark uncertainty explicitly.
- Avoid sdlc-solution-reviewer Gate language such as `PASS` or `FAIL`.

## Stop Conditions

Stop instead of writing a definitive specification when:

- Requirement source is missing.
- Business goal is unclear.
- In Scope or Out of Scope is unclear.
- Original-flow impact is unknown.
- Multiple business interpretations exist.
- Any required behavior would need to be guessed.
