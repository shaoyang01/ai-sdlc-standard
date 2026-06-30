---
name: sdlc-speckit-plan
description: |
  This skill should be used when the user asks to "执行 speckit plan", "生成 plan.md", "制定技术计划", "检查 Plan Gate", or asks to create a technical implementation plan from a clarified `specs/{feature}/spec.md` after sdlc-speckit-clarify.
version: 0.1.0
---

# sdlc-speckit-plan

Create or validate the SpecKit technical plan after `sdlc-speckit-clarify`. Treat `specs/{feature}/spec.md` and approved DocFlow artifacts as fixed scope; do not use planning to add business behavior.

## Core Rules

1. Consume clarified SpecKit specs only.
2. Require `sdlc-speckit-clarify` pass or an explicit no-open-clarification result.
3. Preserve approved Scope, behavior, failure strategy, and acceptance criteria.
4. Do not modify `01-技术方案` or `02-方案审核`.
5. Do not modify production code.
6. Do not generate implementation tasks; route task breakdown to `sdlc-speckit-tasks`.
7. Do not create new business rules, state transitions, data sources, or acceptance criteria.
8. Stop when planning requires changing Scope, API, DB, cache, MQ, schedule, listener, exception, retry, idempotency, transaction, rollback, or test behavior.
9. Keep Plan risks traceable to accepted risks or concrete technical uncertainty.
10. Require Plan Gate readiness before `sdlc-speckit-tasks`.
11. Recommend manifest Activity Log updates.
12. Return core ambiguity to DocFlow Re-Gate.

## Standard Package Resolution

Before loading shared files, resolve `AI_SDLC_STANDARD_HOME` using this order:

1. Environment variable `AI_SDLC_STANDARD_HOME` when it points to a directory containing `manifest.yaml`.
2. Target repository `.specify/project-governance-profile.yaml` `standard_package.source.location` when it points to a local standard package.
3. Current repository root when it contains `manifest.yaml` and `ai-sdlc/`.
4. Installed Skill development fallback only when this Skill still lives inside the standard repository.

After resolution, read `${AI_SDLC_STANDARD_HOME}/ai-sdlc/standard-package-resolution.md` and validate required files before continuing.

Do not resolve shared standard files from the target repository `.specify/memory/**` or `.specify/workflow/**`. Target repositories store only project profiles, generated business-domain documents, reports, and explicit overrides.

## Required Standard Files

Use these files from the resolved `AI_SDLC_STANDARD_HOME` as authoritative rules:

- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/standard-package-resolution.md`
- `${AI_SDLC_STANDARD_HOME}/skill-contracts/known-skills/sdlc-speckit-plan.md`
- `${AI_SDLC_STANDARD_HOME}/checklists/plan-checklist.md`
- `${AI_SDLC_STANDARD_HOME}/ess/specification-schema.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/artifact-storage.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/change-control.md`
- `${AI_SDLC_STANDARD_HOME}/templates/artifact-manifest-template.md`

## Reference Files

Load these references as needed:

- `references/plan-inputs.md` for required inputs and readiness checks.
- `references/planning-scope.md` for allowed planning decisions and blocked changes.
- `references/plan-gate-check.md` for Plan Gate coverage and blocking rules.
- `references/output-and-manifest.md` for output format and manifest recommendations.

## Workflow

### 1. Resolve Inputs

Identify:

- Requirement ID
- `specs/{feature}/spec.md`
- Clarification result or Clarifications section
- Source `01-技术方案`
- Source `02-方案审核`
- `manifest.md`, if available
- Existing `specs/{feature}/plan.md`, if any

Stop if the spec or approved DocFlow sources are missing.

### 2. Verify Planning Readiness

Read:

- `references/plan-inputs.md`
- `references/plan-gate-check.md`

Continue only when:

- Clarification has no blocking core ambiguity.
- `specs/spec.md` is consistent with approved DocFlow artifacts.
- Development path is `SPECKIT_PIPELINE_REQUIRED` or full SDD was explicitly requested.
- Current artifacts are not superseded.

### 3. Create Or Validate Plan

Read `references/planning-scope.md`.

Create or update:

```text
specs/{feature}/plan.md
```

The plan must cover:

- Technical approach
- Affected modules and files
- Data, state, transaction, cache, MQ, schedule, listener, and API impact
- Failure, timeout, retry, idempotency, rollback, and compatibility strategy
- Observability, logging, metrics, and rollout notes
- Verification strategy mapped to acceptance criteria
- Risks and mitigations
- Traceability to `specs/spec.md` and DocFlow sources

### 4. Run Plan Gate

Read `references/plan-gate-check.md`.

Block when:

- Plan changes approved business behavior.
- Plan cannot support acceptance criteria.
- Core exception, rollback, compatibility, or verification strategy is missing.
- Required technical decision would alter Scope or Gate conclusions.

### 5. Output Recommendation

Read `references/output-and-manifest.md`.

Report:

- Source spec
- Source DocFlow artifacts
- Plan path
- Plan coverage
- Plan Gate result
- Blocking or deferred items
- Manifest Activity Log recommendation
- Next step: `sdlc-speckit-tasks` or DocFlow Re-Gate

## Output Requirements

Every plan result must contain:

- Source SpecKit Spec
- Source DocFlow Artifacts
- Target Plan
- Plan Coverage Summary
- Plan Gate Result
- Risks And Mitigations
- Blocking Items
- Re-Gate Recommendation
- Manifest Update Recommendation
- Next Step

## Stop Conditions

Stop instead of writing or approving a plan when:

- `sdlc-speckit-clarify` has unresolved blocking ambiguity.
- Planning requires changing approved Scope or behavior.
- Planning requires new business rules.
- Plan contradicts `specs/spec.md`, `01-技术方案`, or `02-方案审核`.
- Accepted risks are missing or contradicted.
- Current artifacts are superseded.
