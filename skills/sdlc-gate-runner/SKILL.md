---
name: sdlc-gate-runner
description: |
  This skill should be used when the user asks to "检查 Gate", "跑门禁", "判断能不能进入下一阶段", "检查 manifest", "验证 PASS_WITH_RISK", "输出 Gate 审计", or asks to verify whether DocFlow artifacts satisfy phase gate requirements before continuing.
version: 0.1.0
---

# Gate Runner

Run a generic DocFlow Gate check against a requirement manifest and related node artifacts. Treat this skill as a phase-entry auditor; do not replace specialized content reviewers such as `sdlc-solution-reviewer`.

## Core Rules

1. Check Gate readiness only.
2. Do not write or rewrite requirement, specification, implementation, review, or test artifacts.
3. Do not modify production code.
4. Do not modify `specs/**` or `.specify/business_domain/**`.
5. Do not approve risk without explicit risk acceptance.
6. Do not use superseded artifacts as a current Gate basis.
7. Do not let a failed or missing Gate enter the next phase.
8. Use `PASS`, `FAIL`, or `PASS_WITH_RISK`.
9. Use `templates/gate-result-template.md` as the output structure.
10. Recommend manifest updates, but do not silently edit `manifest.md` unless explicitly requested.
11. Apply `ai-sdlc/change-control.md` when Change History, Superseded Artifacts, or Re-Gate Records indicate a change or rework.
12. Route content-specific findings back to the specialized skill that owns them.

## Required Standard Files

Use these repository standard files as authoritative rules:

- `${AI_SDLC_STANDARD_HOME}/skill-contracts/known-skills/sdlc-gate-runner.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/phase-gates.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/artifact-storage.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/change-control.md`
- `${AI_SDLC_STANDARD_HOME}/templates/gate-result-template.md`
- `${AI_SDLC_STANDARD_HOME}/templates/artifact-manifest-template.md`

## Reference Files

Load these references as needed:

- `references/gate-workflow.md` for the step-by-step Gate execution workflow.
- `references/gate-matrix.md` for phase-specific inputs, blocking checks, and next steps.
- `references/risk-and-regate.md` for `PASS_WITH_RISK`, superseded artifacts, and change-control checks.
- `references/output-report.md` for the Gate report structure and manifest update recommendations.

## Workflow

### 1. Resolve Gate Target

Identify:

- Requirement ID
- `library/{requirement_id}/manifest.md`
- Gate name or current phase
- Candidate next phase
- Reviewed artifact path
- Required upstream Gate artifact, if applicable
- Current effective versions from Artifact Index
- Change History, Superseded Artifacts, and Re-Gate Records

Stop if `manifest.md` is missing or unreadable unless the user explicitly asks for a manifest creation recommendation.

### 2. Load Gate Rules

Read:

- `references/gate-workflow.md`
- `references/gate-matrix.md`

Read `references/risk-and-regate.md` whenever the manifest contains:

- `PASS_WITH_RISK`
- Superseded artifacts
- Change History
- Re-Gate Records
- Blocking Issues

Read `references/output-report.md` before producing or writing the final report.

### 3. Check Required Inputs

Verify:

- Manifest exists and contains the required sections.
- Required artifact exists for the current Gate.
- Required previous Gate result exists when the next phase depends on it.
- Artifact Index points to the current effective artifact.
- Gate Result is `PASS`, `FAIL`, or `PASS_WITH_RISK`.
- `PASS_WITH_RISK` includes Accepted Risk, Accepted By, Accepted At, Accepted Reason, Accepted Scope, Follow-up Required, and Follow-up Owner.
- Superseded artifacts are not used as current effective Gate evidence.
- Change History entries requiring Re-Gate are resolved or have valid Re-Gate Records.

### 4. Decide Gate Result

Use these rules:

- Missing manifest -> `FAIL`
- Missing required artifact -> `FAIL`
- Superseded current artifact -> `FAIL`
- Required Re-Gate missing -> `FAIL`
- Existing Gate result is `FAIL` -> `FAIL`
- `PASS_WITH_RISK` without complete risk acceptance -> `FAIL`
- Critical issue -> `FAIL`
- High issue without explicit risk acceptance -> `FAIL`
- High issue with complete risk acceptance -> `PASS_WITH_RISK`
- No Critical / unaccepted High / missing required input -> `PASS`

### 5. Output Or Write Report

By default, return the Gate report in the response.

When the user explicitly asks to generate a local artifact, write a Markdown report under the Gate-related node:

```text
library/{requirement_id}/{node_directory}/{requirement_id}__门禁检查__vN.md
```

For HTML or Lark/Feishu output, use `sdlc-docflow-writer` for routing and publishing. Keep this skill responsible for Gate evaluation content only.

### 6. Report Manifest Updates

Always recommend manifest updates for:

- Gate Decisions
- Artifact Index
- Activity Log
- Blocking Issues
- Missing Artifacts
- Re-Gate Records
- Next Step

Do not silently edit manifest unless explicitly requested.

## Output Requirements

Every Gate report must contain:

- Gate Name
- Requirement ID
- Manifest Path
- Reviewed Artifact
- Gate Basis
- Result
- Can Continue
- Critical / High / Medium / Low
- Missing Information
- Required Actions
- Risk Acceptance
- Re-Gate Check
- Superseded Artifact Check
- Manifest Update Recommendation
- Next Step

## Stop Conditions

Stop instead of producing a passing Gate result when:

- Manifest is missing or unreadable.
- Required artifact is missing.
- Gate result cannot be determined.
- `PASS_WITH_RISK` lacks complete risk acceptance.
- Change-control evidence requires Re-Gate and no valid Re-Gate result exists.
- The only available Gate evidence points to a superseded artifact.
