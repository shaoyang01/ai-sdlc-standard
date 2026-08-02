---
name: sdlc-gate-runner
description: |
  This skill should be used when the user asks to "检查 Gate", "跑门禁", "判断能不能进入下一阶段", "检查 manifest", "验证 PASS_WITH_RISK", "输出 Gate 审计", or asks to verify whether DocFlow artifacts satisfy phase gate requirements before continuing.
version: 0.1.0
---

# Gate Runner

Run a DocFlow Gate check against a requirement manifest and related node artifacts. Treat this skill as a phase-entry auditor; do not replace specialized content reviewers such as `sdlc-solution-reviewer`.

`sdlc-gate-runner` is the generic Gate checker and the owner of two special Gates:

- `development_path_entry` — Development Path Entry Gate, checks entry into the implementation path.
- `documentation_governance_tail_completion` — Shared Documentation Governance Tail Completion Gate, checks entry into Tail completed.

The two special Gate Type values are canonical and must not be renamed, aliased, or extended with a third special value. Generic Gate behavior stays compatible.

## Core Rules

1. Determine the Gate Type before executing gate-specific checks; route to the generic, `development_path_entry`, or `documentation_governance_tail_completion` checks accordingly.
2. Check Gate readiness only.
3. Do not write or rewrite requirement, specification, implementation, review, or test artifacts.
4. Do not modify production code.
5. Do not modify `specs/**` or `.specify/business_domain/**`.
6. Do not approve risk without explicit risk acceptance.
7. Do not use stale or replaced artifacts as a current Gate basis.
8. Do not let a failed or missing Gate enter the next phase.
9. Use `PASS`, `FAIL`, or `PASS_WITH_RISK`.
10. Use `templates/gate-result-template.md` as the output structure.
11. Recommend manifest updates, but do not silently edit `manifest.md` unless explicitly requested.
12. Apply `ai-sdlc/change-control.md` when Change History, Replaced Artifact Paths, or Re-Gate Records indicate a change or rework.
13. Route content-specific findings back to the specialized skill that owns them.
14. `manifest.md` is the Tail status authority; workflow-status snapshot, Pipeline result, Stage Summary, Delivery Summary, and chat conclusions do not override it.
15. Formal Tail completion requires a current, non-stale persisted Gate artifact as `completion_decision_source`; response-only output is only a preview.
16. Never perform professional work: do not generate `03-实现记录`, do not execute code review, do not generate `04-代码审核`, do not execute tests or feedback classification, do not generate `05-测试验收`, do not execute Sync, do not execute Reconcile, do not execute Entry Coverage, and do not replace a specialized skill decision.

## Required Standard Files

Use these repository standard files as authoritative rules:

- `${AI_SDLC_STANDARD_HOME}/skill-contracts/known-skills/sdlc-gate-runner.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/development-path-governance.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/phase-gates.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/artifact-storage.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/artifact-versioning.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/change-control.md`
- `${AI_SDLC_STANDARD_HOME}/templates/gate-result-template.md`
- `${AI_SDLC_STANDARD_HOME}/templates/artifact-manifest-template.md`

## Reference Files

Load these references as needed:

- `references/gate-workflow.md` for the step-by-step Gate execution workflow.
- `references/gate-matrix.md` for phase-specific inputs, blocking checks, and next steps.
- `references/risk-and-regate.md` for `PASS_WITH_RISK`, stale or replaced artifacts, and change-control checks.
- `references/output-report.md` for the Gate report structure and manifest update recommendations.

## Workflow

### 1. Resolve Gate Target

Identify:

- Requirement ID
- `library/{requirement_id}/manifest.md`
- Gate Type
- Gate name or current phase
- Candidate next phase
- Reviewed artifact path
- Required upstream Gate artifact, if applicable
- Current effective versions from Artifact Index
- Change History, Replaced Artifact Paths, and Re-Gate Records

Stop if `manifest.md` is missing or unreadable unless the user explicitly asks for a manifest creation recommendation.

### 2. Determine Gate Type

Resolve the Gate Type before any gate-specific check:

- `generic` for Requirement, Specification, Planning, Task, Implementation, Code Review, Test, and Knowledge Sync Gates.
- `development_path_entry` when checking entry into the implementation path.
- `documentation_governance_tail_completion` when checking Shared Documentation Governance Tail completion.

Both special Gates read `${AI_SDLC_STANDARD_HOME}/ai-sdlc/development-path-governance.md` in addition to the Required Standard Files. If the Gate Type cannot be inferred from the manifest or user request, ask for the target phase.

### 3. Load Gate Rules

Read:

- `references/gate-workflow.md`
- `references/gate-matrix.md`

Read `references/risk-and-regate.md` whenever the manifest contains:

- `PASS_WITH_RISK`
- Stale or replaced artifacts
- Change History
- Re-Gate Records
- Blocking Issues

Read `references/output-report.md` before producing or writing the final report.

### 4. Check Required Inputs

Verify:

- Manifest exists and contains the required sections.
- Required artifact exists for the current Gate.
- Required previous Gate result exists when the next phase depends on it.
- Artifact Index points to the current effective artifact.
- Gate Result is `PASS`, `FAIL`, or `PASS_WITH_RISK`.
- `PASS_WITH_RISK` includes Accepted Risk, Accepted By, Accepted At, Accepted Reason, Accepted Scope, Follow-up Required, and Follow-up Owner.
- Stale or replaced artifacts are not used as current effective Gate evidence.
- Change History entries requiring Re-Gate are resolved or have valid Re-Gate Records.

### 5. Run Development Path Entry Checks

When Gate Type is `development_path_entry`, verify:

- Manifest is readable.
- Requirement ID matches the manifest.
- Specification Gate is current and allows continuation.
- Development Path Decision exists.
- Decision is exactly one of `DIRECT_IMPLEMENTATION`, `SPECKIT_PIPELINE_REQUIRED`, `BLOCKED_NEEDS_REVISION`.
- Decision Scope is current and exactly `FULL_REQUIREMENT` or `DELTA_CHANGE`.
- Complexity is current and exactly `SIMPLE`, `MEDIUM`, `COMPLEX`, or `BLOCKED_UNKNOWN`.
- Development Path Decision source exists.
- Development Path Decision artifact exists and is current.
- Reviewed artifact path and Version are current.
- Tail Required is determined.
- Tail Scope is determined.
- Initial Tail Status is determined.
- No stale evidence.
- No unresolved blocking change.
- Required Re-Gate has passed.

Routing rules:

- `DIRECT_IMPLEMENTATION`: only a `PASS` or valid `PASS_WITH_RISK` Gate may enter direct implementation.
- `SPECKIT_PIPELINE_REQUIRED`: only a `PASS` or valid `PASS_WITH_RISK` Gate may enter the Speckit path; it must not enter Direct Implementation.
- `BLOCKED_NEEDS_REVISION`: must `FAIL`; must not enter implementation or Tail; return to the earliest affected node.
- `BLOCKED_UNKNOWN`: must `FAIL`.
- Missing, stale, invalid, or non-current decision evidence: must `FAIL`.

### 6. Run Tail Completion Checks

When Gate Type is `documentation_governance_tail_completion`, verify:

- Manifest is readable.
- Requirement ID matches the manifest.
- Canonical Documentation Governance Tail section exists.
- Tail Required is current.
- Tail Scope is current.
- Tail Status is current.
- `required_artifacts` is current.
- `completed_artifacts` is current.
- `skipped_items` has complete justification.
- `blocking_items` has no unresolved items.
- business_domain_sync decision is current.
- Reconcile decision is current.
- Required conditional execution is complete.
- Applicable Entry Coverage has passed.
- Required Re-Gate has passed.
- `completion_evidence` is current.
- `completion_decision_source` can be formally established.

For actual code, configuration, or behavior implementation, always require current valid `03-实现记录`, `04-代码审核`, and `05-测试验收`. Pure documentation, analysis, or governance tasks may judge corresponding items `not_required` or `not_applicable`, but must record scope, reason, evidence, decision source, decision owner, artifact/version basis, and the stale condition.

Do not accept as Tail Completion Gate substitutes: `04-交付总结`, Delivery Summary, Pipeline result, Stage Summary, workflow-status snapshot, or chat conclusions.

Do not treat as completed: Tail Status `planned` or `in_progress`, Pipeline `COMPLETED`, a Draft PR, pending required conditional execution, or an unpersisted completion source.

### 7. Decide Gate Result

Use these rules:

- Missing manifest -> `FAIL`
- Missing required artifact -> `FAIL`
- Stale current artifact -> `FAIL`
- Required Re-Gate missing -> `FAIL`
- Existing Gate result is `FAIL` -> `FAIL`
- `PASS_WITH_RISK` without complete risk acceptance -> `FAIL`
- Critical issue -> `FAIL`
- High issue without explicit risk acceptance -> `FAIL`
- High issue with complete risk acceptance -> `PASS_WITH_RISK`
- No Critical / unaccepted High / missing required input -> `PASS`

`PASS_WITH_RISK` never exempts always-required evidence, persistence, Re-Gate, or required conditional execution, and never applies to Critical issues or the always-FAIL items in `references/risk-and-regate.md`.

### 8. Output Or Write Report

By default, return the Gate report in the response.

When the user explicitly asks to generate a local artifact, write a Markdown report under the Gate-related node:

```text
library/{requirement_id}/{node_directory}/{requirement_id}_门禁检查.md
```

Use the stable paths below for the two special Gates (no filename-based versioning):

```text
library/{requirement_id}/02-方案审核/{requirement_id}_开发路径准入门禁.md   # development_path_entry
library/{requirement_id}/05-测试验收/{requirement_id}_治理尾段完成门禁.md   # documentation_governance_tail_completion
```

Response-only output is a preview only: it must not claim a current persisted Gate artifact exists, must not invent artifact paths or Versions, must not mark the Manifest Tail as completed, must not become `completion_decision_source`, and must not emit a formal Tail completion `PASS` claim. When the user does not authorize persisting the Gate report, record the persistence absence as a blocking item, set Tail Completion Eligible to `no`, leave the Manifest status unchanged, and return only the preview.

When the user explicitly asks to persist the Gate report, write only the Gate report, recommend Manifest updates, and never silently edit the Manifest. Only a persisted `PASS` or valid `PASS_WITH_RISK` Gate may output Tail Completion Eligible `yes`. The Manifest may be marked `completed` only after it records the current Gate artifact path, current Gate Artifact Version, Gate result, `completion_evidence`, and `completion_decision_source`.

For HTML or Lark/Feishu output, use `sdlc-docflow-writer` for routing and publishing. Keep this skill responsible for Gate evaluation content only.

### 9. Report Manifest Updates

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
- Gate Type
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
- Stale Artifact Check
- Manifest Update Recommendation
- Next Step

For `development_path_entry`, fill `## Development Path Check`. For `documentation_governance_tail_completion`, fill `## Documentation Governance Tail Evidence Check` and `## Tail Completion Decision`. Other Gates may mark the special sections `not_applicable` but must not delete fields from the canonical template.

## Stop Conditions

Stop instead of producing a passing Gate result when:

- Manifest is missing or unreadable.
- Required artifact is missing.
- Gate result cannot be determined.
- `PASS_WITH_RISK` lacks complete risk acceptance.
- Change-control evidence requires Re-Gate and no valid Re-Gate result exists.
- The only available Gate evidence points to a stale or replaced artifact.
- `BLOCKED_NEEDS_REVISION` or `BLOCKED_UNKNOWN` with implementation entry requested.
- Development Path decision evidence is missing, stale, invalid, or not current.
- Actual implementation lacks current `03-实现记录`, `04-代码审核`, or `05-测试验收`.
- Required conditional execution is incomplete.
- Blocking items remain unresolved.
- Formal Tail completion lacks a current persisted completion source.
