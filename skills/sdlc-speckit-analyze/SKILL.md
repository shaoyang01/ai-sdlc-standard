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
2. Require current `specs/{feature}/route.md`, `specs/{feature}/spec.md`, `specs/{feature}/plan.md`, and approved DocFlow artifacts.
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
13. Require `.specify/entry-coverage-profile.yaml`; missing profile blocks Analyze and must point to `scripts/bootstrap-entry-coverage-profile.sh` or full bootstrap.
14. Parse entry coverage TSV fields for Gate decisions; do not grep markdown reports to infer blockers.
15. Apply project-type-specific checks from Project Type Profiles before approving implementation readiness.
16. Apply the Goal-Anchored Global Reasoning contract: record material blockers and continue the remaining reliable bounded consistency scan; hard-stop only for missing/unreadable required source, fundamentally indeterminable scope, or continuation requiring invented behavior (see `ai-sdlc/goal-anchored-global-reasoning.md`). Do not fail-fast on the first blocker.

## Standard Package Resolution

Before loading shared files, resolve `AI_SDLC_STANDARD_HOME` using this order:

1. Environment variable `AI_SDLC_STANDARD_HOME` when it points to a directory containing `manifest.yaml`.
2. Target repository `.specify/project-governance-profile.yaml` `standard_package.source.location` when it points to a local standard package.
3. Current repository root when it contains `manifest.yaml` and `ai-sdlc/`.
4. Installed Skill development fallback only when this Skill still lives inside the standard repository.

After resolution, read `${AI_SDLC_STANDARD_HOME}/ai-sdlc/standard-package-resolution.md` and validate required files before continuing.

Do not resolve shared standard files from the target repository `.specify/memory/**`, `.specify/workflow/**`, or `.specify/coding_guide/**`. Target repositories store only project profiles, generated business-domain documents, reports, and explicit overrides.

## Entry Coverage TSV Semantics

Analyze must parse `entry_inventory.tsv` and `service_inventory.tsv` by TSV
headers, including `classification`, `classification_reason`, `match_strength`,
`match_reason`, `requirement_scope`, and `reverse_coverage_status`.

Non-blocking classifications remain visible but do not block by themselves:
`technical_bridge`, `framework_bridge`, `generated_or_vendor`, `native_shell`,
`abstract_or_base`, `annotation_or_marker`, and `not_applicable`.

Blocking entry coverage signals include `business_entry` unarchived,
core business unit unarchived, `reverse_coverage_status=no_entry_reverse_coverage`,
unaccepted cross-domain conflict, and business_domain L4 missing.

Repeated shared/platform/scheduling/integration L2 hits require an accepted
shared boundary in `specs/{feature}/route.md` or the entry coverage profile
before they can be downgraded to warnings.

The accepted shared boundary must name the shared domain, owner, evidence, and
risk acceptance source.

## Project Type Profiles

Apply project-type-specific checks for every profile listed in route/profile:

- `backend-business-service`
- `admin-mixed-workflow`
- `frontend-application`
- `data-pipeline-etl`
- `library-shared-component`

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
- `references/project-type-checks.md` for project_type_profiles-specific readiness checks.
- `references/output-and-manifest.md` for output format and manifest recommendations.
- `ai-sdlc/goal-anchored-global-reasoning.md` for the shared goal-anchored global reasoning contract (anchor, global-first, impact closure, root-cause consolidation, bounded continuation).

## Workflow

### 1. Resolve Inputs

Identify:

- Requirement ID
- `specs/{feature}/route.md`
- `specs/{feature}/spec.md`
- `specs/{feature}/plan.md`
- `specs/{feature}/tasks.md`
- Project Type Profiles
- `.specify/entry-coverage-profile.yaml`
- `.specify/reports/entry_coverage/entry_coverage_report.md`
- `.specify/reports/entry_coverage/entry_inventory.tsv`
- `.specify/reports/entry_coverage/service_inventory.tsv`
- `.specify/reports/entry_coverage/cross_domain_conflicts.md`
- `.specify/reports/entry_coverage/unarchived_entries.md`
- `.specify/reports/entry_coverage/unarchived_services.md`
- Task Gate result
- Source `01-技术方案`
- Source `02-方案审核`
- `manifest.md`, if available

Stop if any current core artifact is missing.

### 2. Verify Analyze Readiness

Read:

- `references/analyze-inputs.md`
- `references/analyze-gate-check.md`
- `references/project-type-checks.md`

Continue only when:

- Task Gate has no Blocking items.
- Spec, plan, and tasks are current and not stale.
- Route artifact is current and Project Type Profiles are known.
- Entry coverage profile and entry coverage reports are present and current.
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

- `.specify/entry-coverage-profile.yaml` is missing.
- Only `.specify/entry-coverage-profile.candidate.yaml` exists and has not been confirmed.
- Entry coverage audit is missing or stale.
- Parsed TSV fields show unarchived business entries, unarchived core business units, `reverse_coverage_status=no_entry_reverse_coverage`, unaccepted cross-domain conflicts, or missing business_domain L4.
- Any artifact conflicts with another current artifact.
- Any implementation task lacks approved spec or plan basis.
- A required behavior has no implementation or verification path.
- A risk is unaccepted, stale, contradicted, or hidden in tasks.
- A current artifact has been stale.

### 5. Output Recommendation

Read `references/output-and-manifest.md`.

Report:

- Source artifacts
- Cross-artifact consistency summary
- Project Type Profile Checks
- Entry Coverage Gate
- Parsed Entry Inventory Summary
- Parsed Service Inventory Summary
- Shared-Domain Duplication Decision
- Analyze Gate result
- Blocking or deferred items
- Earliest affected upstream node
- Manifest Activity Log or Re-Gate recommendation
- Next step: `sdlc-speckit-implement` or upstream Re-Gate

## Output Requirements

Every analysis result must contain:

- Source Artifacts
- Project Type Profile Checks
- Entry Coverage Gate
- Parsed Entry Inventory Summary
- Parsed Service Inventory Summary
- Shared-Domain Duplication Decision
- Consistency Matrix
- Analyze Gate Result
- Blocking Items
- Earliest Affected Node
- Re-Gate Recommendation
- Manifest Update Recommendation
- Next Step

## Stop Conditions

Hard-stop instead of continuing the scan when:

- A required source is missing or unreadable (`specs/{feature}/route.md`, `spec.md`, `plan.md`, `tasks.md`, `.specify/entry-coverage-profile.yaml`, or parsed TSV entry coverage data).
- Scope is fundamentally indeterminable from the available artifacts.
- Continuing would require inventing business or technical behavior.

All other blocking conditions below are recorded as material blockers and reported; they do not end discovery — continue the remaining reliable bounded consistency scan before concluding:

- `.specify/entry-coverage-profile.candidate.yaml` exists without confirmed stable profile.
- `sdlc-speckit-tasks` has unresolved Blocking items.
- Spec, plan, tasks, or DocFlow artifacts conflict.
- A planned behavior has no task or verification path.
- Risk acceptance is missing or contradicted.
- Current artifacts are stale.
