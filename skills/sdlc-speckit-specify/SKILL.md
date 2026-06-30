---
name: sdlc-speckit-specify
description: |
  This skill should be used when the user asks to "同步到 specs/spec.md", "执行 speckit specify", "把已审阅方案转成 SpecKit spec", "从 01-技术方案 生成 specs", or asks to reuse DocFlow specification and sdlc-solution-reviewer output as the SDD spec source.
version: 0.1.0
---

# sdlc-speckit-specify

Sync an approved DocFlow technical specification into SpecKit `specs/{feature}/spec.md`. Treat `01-技术方案` and `02-方案审核` as the source of truth; do not reinterpret requirements from scratch.

## Core Rules

1. Consume reviewed DocFlow artifacts only.
2. Do not create a specification from raw chat or unreviewed requirement text.
3. Do not replace `sdlc-specification-writer`.
4. Do not replace `sdlc-solution-reviewer`.
5. Do not modify production code.
6. Do not modify `.specify/business_domain/**`.
7. Do not expand In Scope, Out of Scope, or acceptance criteria.
8. Do not downgrade unresolved core questions into assumptions.
9. Require `sdlc-solution-reviewer` result `PASS` or valid `PASS_WITH_RISK`.
10. Require Development Path Decision `SPECKIT_PIPELINE_REQUIRED` unless the user explicitly asks for full SDD.
11. Preserve links back to `01-技术方案`, `02-方案审核`, and `manifest.md`.
12. Stop and return to DocFlow when sync would require inventing business rules.

## Required Standard Files

Use these repository standard files as authoritative rules:

- `../../skill-contracts/known-skills/sdlc-speckit-specify.md`
- `../../ess/specification-schema.md`
- `../../checklists/specification-checklist.md`
- `../../ai-sdlc/artifact-storage.md`
- `../../ai-sdlc/change-control.md`
- `../../templates/artifact-manifest-template.md`

## Reference Files

Load these references as needed:

- `references/docflow-inputs.md` for required DocFlow input artifacts and readiness checks.
- `references/spec-sync-mapping.md` for mapping ESS sections into SpecKit spec sections.
- `references/blocking-and-regate.md` for stopping conditions and Re-Gate routing.
- `references/output-and-manifest.md` for output paths and manifest update recommendations.

## Workflow

### 1. Resolve Inputs

Identify:

- Requirement ID
- Target feature name or `specs/{feature}` directory
- `01-技术方案` current version
- `02-方案审核` current version
- `manifest.md`
- Development Path Decision
- Risk acceptance, if `PASS_WITH_RISK`

Stop if the technical specification or solution review is missing.

### 2. Verify Readiness

Read:

- `references/docflow-inputs.md`
- `references/blocking-and-regate.md`

Continue only when:

- Solution review is `PASS` or valid `PASS_WITH_RISK`.
- Development path is `SPECKIT_PIPELINE_REQUIRED`, or full SDD is explicitly requested.
- Core Scope, behavior, failure strategy, and acceptance criteria are stable.
- Current artifacts are not superseded.

### 3. Sync Specification

Read `references/spec-sync-mapping.md`.

Create or update:

```text
specs/{feature}/spec.md
```

Preserve:

- Business goal
- In Scope / Out of Scope
- Original flow and new flow
- Behavior constraints
- State transitions
- Data source and data changes
- Failure, timeout, exception, retry, idempotency, and transaction behavior
- Test strategy and acceptance criteria
- Risks and accepted risks
- DocFlow source links

### 4. Output And Manifest Recommendations

Read `references/output-and-manifest.md`.

Report:

- Target `specs/{feature}/spec.md`
- Source DocFlow artifacts
- Sync coverage
- Missing or blocked sections
- Manifest Activity Log recommendation
- Next step: run `sdlc-speckit-clarify`

## Output Requirements

Every sync result must include:

- Source Technical Specification
- Source Solution Review
- Target SpecKit Feature
- Sections Synced
- Sections Not Synced
- Assumptions: must be empty unless explicitly approved
- Blocking Items
- Manifest Update Recommendation
- Next Step

## Stop Conditions

Stop instead of writing or recommending a `specs/spec.md` update when:

- Solution review is missing, failed, or superseded.
- Development path is `BLOCKED_NEEDS_REVISION`.
- Development path is `DIRECT_IMPLEMENTATION` and the user did not explicitly request full SDD.
- Technical specification has unresolved core ambiguity.
- Sync would require new business rules.
- `01-技术方案` and `02-方案审核` conflict.
