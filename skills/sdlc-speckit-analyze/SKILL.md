---
name: sdlc-speckit-analyze
description: |
  This skill should be used when the user asks to "执行 speckit analyze", "检查 spec plan tasks 一致性", "实现前一致性审计", "检查 Analyze Gate", or asks to audit `specs/{feature}/spec.md`, `plan.md`, and `tasks.md` before implementation.
version: 0.1.0
---

# sdlc-speckit-analyze

Audit cross-artifact consistency after `sdlc-speckit-tasks` and before implementation. Treat DocFlow artifacts, SpecKit spec, plan, and tasks as inputs to inspect; do not use analysis to rewrite requirements, change plans, add tasks, or start implementation.

## Core Rules

1. Consume Task Gate-passed `specs/{feature}/tasks.md` only.
2. Require current `specs/{feature}/spec.md`, `specs/{feature}/plan.md`, and approved DocFlow artifacts.
3. Preserve approved Scope, behavior, plan, task list, risks, and acceptance criteria.
4. Do not modify `01-技术方案`, `02-方案审核`, `specs/{feature}/spec.md`, `plan.md`, or `tasks.md`.
5. Do not modify production code.
6. Do not generate implementation tasks; route task fixes to `sdlc-speckit-tasks`.
7. Do not replace `sdlc-solution-reviewer`, Plan Gate, or Task Gate.
8. Identify inconsistency, missing traceability, stale artifacts, unaccepted risk, and implementation-readiness blockers.
9. Stop when analysis reveals undefined behavior, unapproved Scope change, or conflicting artifacts.
10. Require Analyze Gate readiness before `sdlc-speckit-implement`.
11. Recommend manifest Activity Log and Re-Gate updates.
12. Return each blocker to the earliest affected upstream node.

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
- `${AI_SDLC_STANDARD_HOME}/skill-contracts/known-skills/sdlc-speckit-analyze.md`
- `${AI_SDLC_STANDARD_HOME}/checklists/specification-checklist.md`
- `${AI_SDLC_STANDARD_HOME}/checklists/plan-checklist.md`
- `${AI_SDLC_STANDARD_HOME}/checklists/task-checklist.md`
- `${AI_SDLC_STANDARD_HOME}/ess/specification-schema.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/artifact-storage.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/change-control.md`
- `${AI_SDLC_STANDARD_HOME}/templates/artifact-manifest-template.md`

## Reference Files

Load these references as needed:

- `references/analyze-inputs.md` for required inputs and readiness checks.
- `references/consistency-scope.md` for cross-artifact consistency dimensions.
- `references/analyze-gate-check.md` for Analyze Gate coverage and blocking rules.
- `references/output-and-manifest.md` for output format and manifest recommendations.

## Workflow

### 1. Resolve Inputs

Identify:

- Requirement ID
- `specs/{feature}/spec.md`
- `specs/{feature}/plan.md`
- `specs/{feature}/tasks.md`
- Task Gate result
- Source `01-技术方案`
- Source `02-方案审核`
- `manifest.md`, if available

Stop if any current core artifact is missing.

### 2. Verify Analyze Readiness

Read:

- `references/analyze-inputs.md`
- `references/analyze-gate-check.md`

Continue only when:

- Task Gate has no Blocking items.
- Spec, plan, and tasks are current and not superseded.
- Solution Review, Plan Gate, and Task Gate results are passable.
- Development path is `SPECKIT_PIPELINE_REQUIRED` or full SDD was explicitly requested.

### 3. Audit Consistency

Read `references/consistency-scope.md`.

Check consistency across:

- DocFlow technical specification and solution review.
- SpecKit spec.
- SpecKit plan.
- SpecKit tasks.
- Accepted risks and Re-Gate records.
- Acceptance criteria and verification tasks.
- Data, state, API, DB, cache, MQ, schedule, listener, failure, rollback, and compatibility rules.

### 4. Run Analyze Gate

Read `references/analyze-gate-check.md`.

Block when:

- Any artifact conflicts with another current artifact.
- Any implementation task lacks approved spec or plan basis.
- A required behavior has no implementation or verification path.
- A risk is unaccepted, stale, contradicted, or hidden in tasks.
- A current artifact has been superseded.

### 5. Output Recommendation

Read `references/output-and-manifest.md`.

Report:

- Source artifacts
- Cross-artifact consistency summary
- Analyze Gate result
- Blocking or deferred items
- Earliest affected upstream node
- Manifest Activity Log or Re-Gate recommendation
- Next step: `sdlc-speckit-implement` or upstream Re-Gate

## Output Requirements

Every analysis result must contain:

- Source Artifacts
- Consistency Matrix
- Analyze Gate Result
- Blocking Items
- Earliest Affected Node
- Re-Gate Recommendation
- Manifest Update Recommendation
- Next Step

## Stop Conditions

Stop instead of approving implementation readiness when:

- `sdlc-speckit-tasks` has unresolved Blocking items.
- Spec, plan, tasks, or DocFlow artifacts conflict.
- A task requires new business or technical behavior.
- A planned behavior has no task or verification path.
- Risk acceptance is missing or contradicted.
- Current artifacts are superseded.
