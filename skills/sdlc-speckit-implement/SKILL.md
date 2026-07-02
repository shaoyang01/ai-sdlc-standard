---
name: sdlc-speckit-implement
description: |
  This skill should be used when the user asks to "执行 speckit implement", "按 tasks.md 实现", "开始实现阶段", "执行实现任务", or asks to modify production code from a Task Gate-passed `specs/{feature}/tasks.md` after sdlc-speckit-analyze.
version: 0.1.0
---

# sdlc-speckit-implement

Execute approved implementation tasks after `sdlc-speckit-analyze`. Treat `specs/{feature}/tasks.md` as the implementation boundary; modify code only for approved tasks, verify the result, update task status, and record implementation evidence.

## Core Rules

1. Consume Analyze Gate-passed artifacts only.
2. Require current `specs/{feature}/tasks.md`, `specs/{feature}/plan.md`, `specs/{feature}/spec.md`, and approved DocFlow artifacts.
3. Read or inherit `specs/{feature}/route.md` or the Analyze Gate route source; Implement does not reinterpret Route Type or Business Domain Targets.
4. Implement only tasks that are present in `specs/{feature}/tasks.md` and traceable to `specs/{feature}/spec.md` and `specs/{feature}/plan.md`.
5. Before modifying code, model concrete normal, edge, and failure data cases for affected behavior and use them to guide implementation.
6. Inspect existing code, tests, and local conventions before editing.
7. Preserve approved Scope, behavior, rollback, compatibility, failure, retry, idempotency, transaction, and verification requirements.
8. Protect unrelated user or local changes; do not revert or overwrite work outside approved tasks.
9. Stop when implementation requires undefined behavior, unapproved Scope change, missing technical decision, or route/source-boundary conflict.
10. Run the most relevant compile, test, lint, or validation commands available for the affected area.
11. Record verification results, skipped checks, residual risk, and unfinished tasks.
12. Update task status only for tasks actually completed and verified; do not rewrite task descriptions, scope, or ordering.
13. Do not perform knowledge sync; route stable fact sync to `sdlc-speckit-sync`.

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
- `${AI_SDLC_STANDARD_HOME}/skill-contracts/known-skills/sdlc-speckit-implement.md`
- `${AI_SDLC_STANDARD_HOME}/checklists/implementation-checklist.md`
- `${AI_SDLC_STANDARD_HOME}/checklists/task-checklist.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/artifact-storage.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/change-control.md`
- `${AI_SDLC_STANDARD_HOME}/templates/artifact-manifest-template.md`

## Reference Files

Load these references as needed:

- `references/implementation-inputs.md` for required inputs and readiness checks.
- `references/execution-boundaries.md` for allowed code and documentation side effects.
- `references/verification-and-recording.md` for validation, task status, and implementation evidence.
- `references/process-products.md` for new-rail implementation, workflow-status, debug, observability, implementation record, and delivery summary products.
- `references/blocking-and-regate.md` for stop conditions and upstream routing.
- `references/output-and-manifest.md` for output format and manifest recommendations.

## Workflow

### 1. Resolve Inputs

Identify:

- Requirement ID
- `specs/{feature}/route.md` or Analyze Gate route source
- `specs/{feature}/spec.md`
- `specs/{feature}/plan.md`
- `specs/{feature}/tasks.md`
- Analyze Gate result
- Source `01-技术方案`
- Source `02-方案审核`
- `manifest.md`, if available
- Existing `specs/{feature}/implementation.md`, `specs/{feature}/workflow-status.md`, `specs/{feature}/debug-guide.md`, and `specs/{feature}/observability.md`, if available
- Current repository status and existing local changes

Stop if any current core artifact is missing or stale.

### 2. Verify Implementation Readiness

Read:

- `references/implementation-inputs.md`
- `references/blocking-and-regate.md`

Continue only when:

- Analyze Gate has no Blocking items.
- Route source has already been established by Domain Route / Analyze.
- Implement does not reinterpret Route Type.
- Implement does not reinterpret Business Domain Targets.
- Implement executes only inside `specs/{feature}/route.md`, Analyze Gate, and
  approved `specs/{feature}/tasks.md` boundaries.
- Tasks are current, approved, and traceable.
- Required risks are accepted.
- Implementation can be performed without guessing behavior.

### 3. Prepare Implementation Data Cases

Before editing code, model concrete cases:

- Normal input and expected output.
- Boundary and empty cases.
- Failure, timeout, retry, rollback, or compatibility cases.
- Existing-flow regression cases.

Use these cases to decide code paths and verification.

### 4. Execute Approved Tasks

Read `references/execution-boundaries.md`.

Implement only approved tasks:

- Follow existing project patterns.
- Keep changes scoped to task targets.
- Add or update tests when tasks or plan require verification.
- Keep compatibility and rollback behavior explicit.
- Keep implementation inside `specs/{feature}/route.md`, Analyze Gate, and
  approved `specs/{feature}/tasks.md` boundaries.
- Update task status only after verification.
- Do not modify task descriptions, task scope, task ordering, or acceptance mapping. If a task is wrong, stop and return to Task Gate or Re-Gate.

If route boundaries conflict with actual code boundaries, stop and return to
Analyze / Domain Route / Re-Gate instead of editing route in Implement.

### 5. Verify And Record

Read `references/verification-and-recording.md`.
Read `references/process-products.md` when frontend/RN behavior, debug flow,
observability, pipeline status, implementation handoff, or delivery summary
evidence is required.

Run relevant checks and record:

- Commands executed.
- Pass, fail, or skipped result.
- Changed files and task mapping.
- Unfinished tasks.
- Residual risks.
- Recommended `03-实现记录` or `sdlc-implementation-recorder` handoff.
- Recommended or produced process products:
  `specs/{feature}/implementation.md`,
  `specs/{feature}/workflow-status.md`,
  `specs/{feature}/debug-guide.md`,
  `specs/{feature}/observability.md`,
  `library/{requirement_id}/03-实现记录/{requirement_id}__实现记录.md`,
  and `library/{requirement_id}/04-交付总结/{requirement_id}__交付总结.md`.
  `manifest.md` is the status authority; manifest is status authority for
  pipeline status decisions.

### 6. Output Recommendation

Read `references/output-and-manifest.md`.

Report:

- Implemented tasks
- Changed files
- Verification results
- Blocking items
- Manifest Activity Log recommendation
- Implementation record and delivery summary recommendation
- Process product recommendation
- Next step: `sdlc-implementation-recorder`, `sdlc-code-review-normalizer`, `sdlc-speckit-sync`, or upstream Re-Gate

## Output Requirements

Every implementation result must contain:

- Source Artifacts
- Implementation Scope
- Data Cases Considered
- Completed Tasks
- Changed Files
- Verification Results
- Blocking Or Unfinished Items
- Re-Gate Recommendation
- Process Products Produced Or Recommended
- Implementation Record Recommendation
- Delivery Summary Recommendation
- Manifest Update Recommendation
- Next Step

## Stop Conditions

Stop instead of modifying or continuing code when:

- `sdlc-speckit-analyze` has unresolved Blocking items.
- Required artifacts are missing or stale.
- Implementation requires behavior outside tasks, plan, spec, or DocFlow approval.
- Implementation requires reinterpreting Route Type or Business Domain Targets.
- `specs/{feature}/route.md` or Analyze Gate route source conflicts with actual
  code boundaries.
- Existing code contradicts approved assumptions.
- Required verification cannot be defined.
- Local unrelated changes make safe edits impossible.
- Compile or core verification fails and cannot be fixed within approved tasks.
- Required process product content would contradict manifest status authority.
- The request requires writing legacy process filenames as compatibility outputs.
