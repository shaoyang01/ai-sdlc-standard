---
name: speckit-clarify
description: |
  This skill should be used when the user asks to "执行 speckit clarify", "校验残余澄清", "检查 specs/spec.md 是否还有未决问题", "补 Clarifications", or asks to validate residual clarification after speckit-specify has synced reviewed DocFlow artifacts.
version: 0.1.0
---

# Speckit Clarify Adapter

Validate residual clarification after `speckit-specify`. Treat this as a narrow consistency gate, not a from-scratch requirement interview.

## Core Rules

1. Validate residual clarification only.
2. Do not clarify from raw requirements or chat history.
3. Do not expand approved Scope.
4. Do not change approved business behavior.
5. Do not modify production code.
6. Do not modify `01-技术方案` or `02-方案审核`.
7. Do not modify `.specify/business_domain/**`.
8. Only write clarifications that are traceable to approved DocFlow artifacts or explicit user confirmation.
9. Stop when clarification would affect Scope, state, data, failure behavior, compatibility, or acceptance.
10. Return core ambiguity to `specification-writer` and `solution-reviewer`.
11. Recommend manifest Activity Log or Re-Gate updates.
12. Proceed to `speckit-plan` only when no core ambiguity remains.

## Required Standard Files

Use these repository standard files as authoritative rules:

- `../../skill-contracts/known-skills/speckit-clarify.md`
- `../../ess/specification-schema.md`
- `../../checklists/specification-checklist.md`
- `../../ai-sdlc/artifact-storage.md`
- `../../ai-sdlc/change-control.md`
- `../../templates/artifact-manifest-template.md`

## Reference Files

Load these references as needed:

- `references/clarification-scope.md` for allowed vs blocked clarification.
- `references/coverage-check.md` for residual ambiguity coverage checks.
- `references/regate-routing.md` for Re-Gate routing when core ambiguity is found.
- `references/output-and-manifest.md` for output format and manifest recommendations.

## Workflow

### 1. Resolve Inputs

Identify:

- `specs/{feature}/spec.md`
- Source `01-技术方案`
- Source `02-方案审核`
- Manifest, if available
- Pending confirmations
- Required Actions from solution review

Stop if `specs/spec.md` or approved DocFlow sources are missing.

### 2. Validate Clarification Scope

Read:

- `references/clarification-scope.md`
- `references/coverage-check.md`

Classify each issue as:

- Clear
- Resolved
- Deferred non-blocking
- Blocking core ambiguity

### 3. Write Only Safe Clarifications

Allowed clarifications:

- Terminology alignment
- Acceptance wording that does not change behavior
- Non-core test boundary notes
- Traceability notes
- Local ambiguity already answered by approved artifacts

Do not write clarifications that change business behavior or approved scope.

### 4. Route Blocking Ambiguity

Read `references/regate-routing.md`.

When blocking ambiguity exists, recommend:

- Return to `specification-writer`
- Rerun `solution-reviewer`
- Update manifest Re-Gate Records

### 5. Output Recommendation

Read `references/output-and-manifest.md`.

Report:

- Questions Asked
- Sections Touched
- Coverage Summary
- Blocking / Deferred Items
- Recommendation: proceed to plan / return to specification / return to solution review

## Output Requirements

Every clarify result must contain:

- Source SpecKit Spec
- Source DocFlow Artifacts
- Coverage Summary
- Clarifications Added
- Deferred Items
- Blocking Items
- Re-Gate Recommendation
- Manifest Update Recommendation
- Next Step

## Stop Conditions

Stop instead of updating `specs/spec.md` when:

- Clarification changes approved scope.
- Clarification changes state, data source, exception, compatibility, or acceptance.
- Clarification requires unavailable business confirmation.
- `specs/spec.md` conflicts with `01-技术方案`.
- Required Actions from `02-方案审核` are unresolved.
