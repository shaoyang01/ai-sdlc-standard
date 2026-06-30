---
name: sdlc-implementation-recorder
description: |
  This skill should be used when the user asks to "生成实现记录", "整理实现摘要", "记录代码改动", "输出 03-实现记录", "根据 diff 写实现记录", "整理验证结果", or asks to document what was implemented before code review or testing.
version: 0.1.0
---

# Implementation Recorder

Generate the DocFlow `03-实现记录` artifact from implementation evidence. Treat the record as a factual handoff to Code Review and Test; do not modify code or invent implementation facts.

## Core Rules

1. Record implementation facts only.
2. Do not modify production code.
3. Do not review code quality as a replacement for `sdlc-code-review-normalizer`.
4. Do not write or revise the technical specification.
5. Do not modify `specs/**` or `.specify/business_domain/**`.
6. Do not turn chat memory into implementation evidence.
7. Do not mark verification as passed unless evidence exists.
8. Preserve missing verification as `验证缺口`.
9. Preserve implementation/specification mismatch as `方案偏离`.
10. Apply `ai-sdlc/change-control.md` when implementation exposes undefined behavior, Specification Missing, or Requirement Change.
11. Use `library/{requirement_id}/03-实现记录/` as the default local output node.
12. Recommend `sdlc-code-review-normalizer` as the next step only when no blocking issue remains.

## Required Standard Files

Use these repository standard files as authoritative rules:

- `../../skill-contracts/known-skills/sdlc-implementation-recorder.md`
- `../../ai-sdlc/artifact-flow.md`
- `../../ai-sdlc/artifact-storage.md`
- `../../ai-sdlc/change-control.md`
- `../../checklists/implementation-checklist.md`
- `../../templates/artifact-manifest-template.md`

## Reference Files

Load these references as needed:

- `references/recording-workflow.md` for the step-by-step implementation record workflow.
- `references/evidence-sources.md` for acceptable evidence and source priority.
- `references/deviation-and-blocking.md` for implementation deviation, missing specification, and blocking rules.
- `references/output-artifact.md` for the required output structure and manifest recommendations.

## Workflow

### 1. Resolve Inputs

Identify:

- Requirement ID
- Implementation source: diff, changed file list, commit range, task status, or user-confirmed summary
- Specification basis
- Solution review or Gate result
- Optional Speckit plan/tasks
- Verification commands and results
- Known failures, skipped checks, or incomplete work

At least one implementation evidence source must exist:

- `git diff` or patch
- Changed file list
- Commit range
- Explicit implementation summary tied to files or symbols
- Task completion evidence

Stop if no implementation evidence can be found.

### 2. Load Recording Rules

Read:

- `references/recording-workflow.md`
- `references/evidence-sources.md`

Read `references/deviation-and-blocking.md` whenever:

- Implementation differs from the approved specification.
- Verification failed or was skipped.
- Undefined behavior was discovered.
- Scope or requirement changed during implementation.

Read `references/output-artifact.md` before producing or writing the final artifact.

### 3. Build The Implementation Record

Extract and record:

- Implementation scope
- Specification basis
- Changed files and symbols
- Key implementation points
- Behavior compatibility
- Data, API, DB, cache, MQ, schedule, listener, logging, and monitoring impact
- Verification commands and results
- Unfinished items
- Residual risks
- Rollback or compatibility notes

Use `不涉及` only when the evidence supports that the area is not affected.

### 4. Check Deviation And Blocking

Classify any mismatch:

- Implementation Bug
- Specification Missing
- Requirement Change
- Documentation Correction
- Environment / Data Issue

Stop instead of producing a ready-for-review record when:

- Behavior-changing code lacks specification basis.
- Implementation contradicts the approved specification.
- Required verification failed.
- Required verification is missing without an explicit reason.
- Continuing would rely on undefined business behavior.

### 5. Output Or Write

By default, return the implementation record in the response.

When the user explicitly asks to generate a local artifact, write:

```text
library/{requirement_id}/03-实现记录/{requirement_id}__实现记录__vN.md
```

Use `sdlc-docflow-writer` for HTML, Lark/Feishu, manifest writes, and output routing when requested. Keep this skill responsible for implementation record content only.

### 6. Report Next Step

Always report:

- Requirement ID
- Output artifact path or recommended path
- Evidence sources used
- Verification result
- Blocking issues
- Whether the record is ready for Code Review
- Manifest update recommendations
- Next step

## Output Requirements

Every implementation record must contain:

- 实现范围
- 规格依据
- 变更文件
- 关键实现点
- 行为一致性检查
- 方案偏离与分类
- 影响面
- 验证命令与结果
- 未完成项
- 残余风险
- 回滚与兼容说明
- 建议下一步

## Stop Conditions

Stop instead of writing a ready-for-review implementation record when:

- Changed files, diff, or commit range are missing.
- Behavior-changing implementation has no specification basis.
- Implementation contradicts approved specification or Gate decisions.
- Required verification failed.
- Required verification is missing and no reason is documented.
- Undefined behavior was implemented instead of escalated.
