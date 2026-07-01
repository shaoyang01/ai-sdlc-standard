---
name: sdlc-speckit-tasks
description: |
  This skill should be used when the user asks to "执行 speckit tasks", "生成 tasks.md", "拆解实现任务", "检查 Task Gate", or asks to create implementation tasks from `specs/{feature}/plan.md` after sdlc-speckit-plan.
version: 0.1.0
---

# sdlc-speckit-tasks

Create or validate SpecKit implementation tasks after `sdlc-speckit-plan`. Treat the approved spec and plan as fixed inputs; do not use task breakdown to invent behavior, change technical decisions, or start implementation.

## Core Rules

1. Consume a Plan Gate-passed `specs/{feature}/plan.md` only.
2. Require `sdlc-speckit-plan` pass or an explicit no-blocking Plan Gate result.
3. Preserve approved Scope, behavior, technical plan, risks, and acceptance criteria.
4. Do not modify `01-技术方案`, `02-方案审核`, `specs/{feature}/spec.md`, or `specs/{feature}/plan.md`.
5. Do not modify production code.
6. Generate implementation tasks only; route execution to `sdlc-speckit-implement`.
7. Do not create new business rules, API contracts, DB behavior, state transitions, integration semantics, or acceptance criteria.
8. Stop when task breakdown requires changing Scope, plan, compatibility, exception, retry, idempotency, transaction, rollback, or test behavior.
9. Require every task to have a stable ID, executable action, target file/module/artifact, dependency, source trace, and verification method.
10. Include test, documentation, config, migration, observability, rollback, and cleanup tasks only when supported by the approved plan.
11. Require Task Gate readiness before implementation.
12. Recommend manifest Activity Log updates.

## Standard Package Resolution

Before loading shared files, resolve `AI_SDLC_STANDARD_HOME` using this order:

1. Environment variable `AI_SDLC_STANDARD_HOME` when it points to a directory containing `manifest.yaml`.
2. Target repository `.specify/project-governance-profile.yaml` `standard_package.source.location` when it points to a local standard package.
3. Current repository root when it contains `manifest.yaml` and `ai-sdlc/`.
4. Installed Skill development fallback only when this Skill still lives inside the standard repository.

After resolution, read `${AI_SDLC_STANDARD_HOME}/ai-sdlc/standard-package-resolution.md` and validate required files before continuing.

Do not resolve shared standard files from the target repository `.specify/memory/**`, `.specify/workflow/**`, or `.specify/coding_guide/**`. Target repositories store only project profiles, generated business-domain documents, reports, and explicit overrides.

## Required Standard Files

Use these files from the resolved `AI_SDLC_STANDARD_HOME` as authoritative rules:

- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/standard-package-resolution.md`
- `${AI_SDLC_STANDARD_HOME}/skill-contracts/known-skills/sdlc-speckit-tasks.md`
- `${AI_SDLC_STANDARD_HOME}/checklists/task-checklist.md`
- `${AI_SDLC_STANDARD_HOME}/checklists/plan-checklist.md`
- `${AI_SDLC_STANDARD_HOME}/ess/specification-schema.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/artifact-storage.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/change-control.md`
- `${AI_SDLC_STANDARD_HOME}/templates/artifact-manifest-template.md`

## Reference Files

Load these references as needed:

- `references/task-inputs.md` for required inputs and readiness checks.
- `references/task-scope.md` for allowed task types and blocked task decisions.
- `references/task-gate-check.md` for Task Gate coverage and blocking rules.
- `references/output-and-manifest.md` for output format and manifest recommendations.

## Workflow

### 1. Resolve Inputs

Identify:

- Requirement ID
- `specs/{feature}/spec.md`
- `specs/{feature}/plan.md`
- Plan Gate result
- Source `01-技术方案`
- Source `02-方案审核`
- `manifest.md`, if available
- Existing `specs/{feature}/tasks.md`, if any

Stop if the plan or Plan Gate evidence is missing.

### 2. Verify Task Readiness

Read:

- `references/task-inputs.md`
- `references/task-gate-check.md`

Continue only when:

- Plan Gate has no Blocking items.
- `specs/plan.md` is consistent with `specs/spec.md` and approved DocFlow artifacts.
- Development path is `SPECKIT_PIPELINE_REQUIRED` or full SDD was explicitly requested.
- Current artifacts are not stale.

### 3. Create Or Validate Tasks

Read `references/task-scope.md`.

Create or update:

```text
specs/{feature}/tasks.md
```

Tasks must cover:

- Implementation work mapped to plan sections.
- Verification work mapped to acceptance criteria.
- Data, integration, config, migration, observability, rollback, and documentation work required by the plan.
- Dependency order and parallelizable work.
- Traceability to `specs/spec.md`, `specs/plan.md`, and DocFlow sources.

### 4. Run Task Gate

Read `references/task-gate-check.md`.

Block when:

- A task is not traceable to spec and plan.
- A core acceptance criterion has no implementation or verification task.
- A task requires behavior or technical decisions not approved by the plan.
- Task order hides a missing dependency.
- Verification is absent for behavior-changing work.

### 5. Output Recommendation

Read `references/output-and-manifest.md`.

Report:

- Source spec
- Source plan
- Source DocFlow artifacts
- Tasks path
- Task coverage
- Task Gate result
- Blocking or deferred items
- Manifest Activity Log recommendation
- Next step: `sdlc-speckit-analyze` or upstream Re-Gate

## Output Requirements

Every tasks result must contain:

- Source SpecKit Spec
- Source SpecKit Plan
- Source DocFlow Artifacts
- Target Tasks
- Task Coverage Summary
- Task Gate Result
- Blocking Items
- Re-Gate Recommendation
- Manifest Update Recommendation
- Next Step

## Stop Conditions

Stop instead of writing or approving tasks when:

- `sdlc-speckit-plan` has unresolved Blocking items.
- Task breakdown requires changing approved Scope, plan, or behavior.
- Task breakdown requires new business rules.
- Tasks contradict `specs/spec.md`, `specs/plan.md`, `01-技术方案`, or `02-方案审核`.
- Required implementation or verification coverage cannot be derived from approved artifacts.
- Current artifacts are stale.
