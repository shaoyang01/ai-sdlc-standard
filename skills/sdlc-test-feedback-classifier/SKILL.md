---
name: sdlc-test-feedback-classifier
description: |
  This skill should be used when the user asks to "整理测试反馈", "分类测试问题", "输出 05-测试验收", "判断测试失败原因", "验收反馈归类", "线上验证反馈整理", or asks to classify failed test, acceptance, or verification feedback before fixes or sync.
version: 0.1.0
---

# Test Feedback Classifier

Classify test, acceptance, and online verification feedback into the DocFlow `05-测试验收` artifact. Treat the output as the decision point for fix, re-Gate, requirement change, test-case correction, or later feedback sync.

## Core Rules

1. Classify feedback only.
2. Do not modify production code.
3. Do not fix tests or business logic.
4. Do not revise technical specifications or implementation records.
5. Do not modify `specs/**` or `.specify/business_domain/**`.
6. Do not update Checklist, Schema, or long-term knowledge; hand those needs to `sdlc-test-feedback-sync`.
7. Do not guess classification when feedback lacks observed behavior, expected behavior, or reproduction context.
8. Preserve uncertainty as `无法分类 / 待补充证据`.
9. Use `library/{requirement_id}/05-测试验收/` as the default local output node.
10. Apply `ai-sdlc/change-control.md` for Specification Missing, Requirement Change, and rework.
11. Use `ess/test-feedback-schema.md` as the output structure.
12. Recommend the next owner and next node explicitly.

## Required Standard Files

Use these repository standard files as authoritative rules:

- `${AI_SDLC_STANDARD_HOME}/skill-contracts/known-skills/sdlc-test-feedback-classifier.md`
- `${AI_SDLC_STANDARD_HOME}/ess/test-feedback-schema.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/artifact-storage.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/change-control.md`
- `${AI_SDLC_STANDARD_HOME}/templates/artifact-manifest-template.md`

## Reference Files

Load these references as needed:

- `references/classification-workflow.md` for the step-by-step feedback classification workflow.
- `references/classification-rules.md` for failure categories and routing decisions.
- `references/evidence-and-blocking.md` for required evidence, missing context, and blocking rules.
- `references/output-artifact.md` for the report structure and manifest recommendations.

## Workflow

### 1. Resolve Inputs

Identify:

- Requirement ID
- Raw feedback source
- Test scope
- Passed cases
- Failed cases
- Observed behavior
- Expected behavior
- Reproduction steps
- Environment and data context
- Related specification, solution review, implementation record, and code review artifacts

Stop if no raw feedback exists.

### 2. Load Classification Rules

Read:

- `references/classification-workflow.md`
- `references/classification-rules.md`

Read `references/evidence-and-blocking.md` whenever:

- A failure cannot be reproduced.
- Expected behavior is missing.
- The classification affects release or re-Gate.
- Feedback may be a requirement change.
- Specification Missing or Review Missing is suspected.

Read `references/output-artifact.md` before producing or writing the final artifact.

### 3. Classify Each Feedback Item

Use exactly one primary classification for each failed item:

- Implementation Bug
- Specification Missing
- Review Missing
- Requirement Change
- Test Case Issue
- Environment / Data Issue

Add secondary tags only as supporting context. Do not use them to avoid the required primary classification.

### 4. Decide Required Action

For each classification:

- Implementation Bug -> fix code, update `03-实现记录`, possibly rerun Code Review.
- Specification Missing -> return to `01-技术方案`, regenerate or revise specification, rerun `sdlc-solution-reviewer`.
- Review Missing -> record review gap and recommend later sync to review checklist.
- Requirement Change -> apply `ai-sdlc/change-control.md`.
- Test Case Issue -> update test case or acceptance wording.
- Environment / Data Issue -> resolve environment/data blocker and decide release impact.

### 5. Output Or Write

By default, return the structured feedback report in the response.

When the user explicitly asks to generate a local artifact, write:

```text
library/{requirement_id}/05-测试验收/{requirement_id}__测试验收__vN.md
```

Use `sdlc-docflow-writer` for HTML, Lark/Feishu, manifest writes, and output routing when requested. Keep this skill responsible for classification content only.

### 6. Report Next Step

Always report:

- Requirement ID
- Output artifact path or recommended path
- Classification summary
- Blocking issues
- Required Re-Gate, if any
- Checklist or Schema update recommendation for `sdlc-test-feedback-sync`
- Manifest update recommendations
- Next step

## Output Requirements

Every test feedback report must contain:

- Conclusion
- Test Scope
- Passed Cases
- Failed Cases
- Failure Classification
- Specification Updates Required
- Checklist Updates Required
- Code Fixes Required
- Review Gaps
- Environment / Data Issues
- Change-Control Decision
- Next Step

## Stop Conditions

Stop instead of writing a definitive classification when:

- Raw feedback is missing.
- Failed case lacks observed behavior.
- Expected behavior or acceptance basis is unknown.
- Classification would require guessing business intent.
- Specification Missing or Requirement Change is suspected but affected node cannot be determined.
- Release impact is material and evidence is missing.
