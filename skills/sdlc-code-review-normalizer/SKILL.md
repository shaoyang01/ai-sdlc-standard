---
name: sdlc-code-review-normalizer
description: |
  This skill should be used when the user asks to "整理代码审查", "归一化 Code Review", "输出 04-代码审核", "整理 DeepSeek Review", "整理 Codex Review", "判断 Review 是否阻塞", or asks to convert raw code review feedback into a DocFlow code review report.
version: 0.1.0
---

# Code Review Normalizer

Normalize raw code review feedback into the DocFlow `04-代码审核` artifact. Treat the output as a consumable review report for implementers and Gate decisions; do not modify code or invent specification basis.

## Core Rules

1. Normalize code review feedback only.
2. Do not modify production code.
3. Do not rewrite technical specifications or implementation records.
4. Do not modify `specs/**` or `.specify/business_domain/**`.
5. Do not replace the reviewer by inventing findings.
6. Do not turn vague advice into a blocking issue without file location and impact.
7. Do not convert suggestions that expand business scope into implementation tasks.
8. Preserve missing file, line, symbol, or specification basis as Missing Information.
9. Use `library/{requirement_id}/04-代码审核/` as the default local output node.
10. Apply `ai-sdlc/change-control.md` when review findings reveal Specification Missing, Requirement Change, or implementation deviation.
11. Use `ess/code-review-schema.md` as the output structure.
12. Recommend fixes, Re-Gate, or `sdlc-test-feedback-classifier` only when the review evidence supports it.

## Required Standard Files

Use these repository standard files as authoritative rules:

- `${AI_SDLC_STANDARD_HOME}/skill-contracts/known-skills/sdlc-code-review-normalizer.md`
- `${AI_SDLC_STANDARD_HOME}/ess/code-review-schema.md`
- `${AI_SDLC_STANDARD_HOME}/checklists/code-review-checklist.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/artifact-storage.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/change-control.md`
- `${AI_SDLC_STANDARD_HOME}/templates/artifact-manifest-template.md`

## Reference Files

Load these references as needed:

- `references/normalization-workflow.md` for the step-by-step review normalization workflow.
- `references/finding-mapping.md` for severity, category, and field mapping.
- `references/blocking-and-scope.md` for blocking conditions, risk acceptance, and out-of-scope suggestions.
- `references/output-artifact.md` for the report structure and manifest recommendations.

## Workflow

### 1. Resolve Inputs

Identify:

- Requirement ID
- Raw review report source
- Reviewed diff, commit range, PR, or changed file list
- Technical specification basis
- Solution review or Gate result
- Implementation record, if available
- Existing code review artifact, if any

Stop if the raw review report is missing.

### 2. Load Normalization Rules

Read:

- `references/normalization-workflow.md`
- `references/finding-mapping.md`

Read `references/blocking-and-scope.md` whenever:

- Findings are Critical or High.
- Findings lack file location.
- Findings lack specification basis.
- Suggested fixes expand business scope.
- Review conflicts with approved specification or implementation record.

Read `references/output-artifact.md` before producing or writing the final artifact.

### 3. Normalize Findings

For each finding, extract or mark missing:

- ID
- Severity
- Category
- File
- Line or Symbol
- Specification Basis
- Problem
- Impact
- Suggested Fix
- Blocking: yes/no

Do not silently drop vague findings. Move non-actionable items into Missing Information or Low notes.

### 4. Decide Review Result

Use:

- `FAIL` when any Critical issue exists.
- `FAIL` when any High issue lacks explicit risk acceptance.
- `PASS_WITH_RISK` when High issues exist and risk acceptance is complete.
- `PASS` when no Critical or unaccepted High issue exists.

Do not use `PASS_WITH_RISK` without Accepted Risk, Accepted By, Accepted At, Accepted Reason, Accepted Scope, Follow-up Required, and Follow-up Owner.

### 5. Output Or Write

By default, return the normalized review report in the response.

When the user explicitly asks to generate a local artifact, write:

```text
library/{requirement_id}/04-代码审核/{requirement_id}__代码审核__vN.md
```

Use `sdlc-docflow-writer` for HTML, Lark/Feishu, manifest writes, and output routing when requested. Keep this skill responsible for review report content only.

### 6. Report Next Step

Always report:

- Requirement ID
- Output artifact path or recommended path
- Reviewed diff or changed files
- Result and Can Continue
- Blocking findings
- Missing information
- Required fixes or Re-Gate
- Manifest update recommendations
- Next step

## Output Requirements

Every normalized code review report must contain:

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
- Missing Information
- Risk Acceptance
- Manifest Update Recommendation
- Next Step

## Stop Conditions

Stop instead of writing a directly consumable report when:

- Raw review report is missing.
- Reviewed diff, commit range, or changed file list is missing.
- Critical or High finding has no file, line, symbol, or actionable location.
- Behavioral finding lacks specification basis.
- Suggested fix would expand business scope.
- Review conclusion conflicts with an approved Gate and cannot be reconciled.
