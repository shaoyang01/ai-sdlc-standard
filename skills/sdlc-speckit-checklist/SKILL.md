---
name: sdlc-speckit-checklist
description: |
  This skill should be used when the user asks to "执行 speckit checklist", "生成需求检查清单", "生成实现前 checklist", "检查 checklist 是否过期", or asks to create or validate a requirement-specific checklist from current `specs/**`, DocFlow artifacts, and Gate results without replacing the Gate itself.
version: 0.1.0
---

# sdlc-speckit-checklist

Create or validate requirement-specific checklists for the Speckit lifecycle. Treat checklist output as structured inspection material for a specific stage; do not use it to create new business rules, approve a Gate, replace Analyze, replace Review, or authorize implementation.

## Core Rules

1. Generate checklist items only from approved current artifacts.
2. Support stage-specific checklists for Specification, Plan, Tasks, Analyze readiness, Implementation readiness, Sync readiness, and Reconcile readiness.
3. Reuse common checklist files from `checklists/*.md` as baseline coverage, then specialize them to the active requirement.
4. Require traceability from every generated checklist item to a source artifact.
5. Do not invent business behavior, technical decisions, acceptance criteria, tests, or release conditions.
6. Do not mark Gate pass or fail; route Gate decisions to the responsible Gate or auditor skill.
7. Do not modify production code.
8. Do not write knowledge targets.
9. Stop when a checklist item would require changing approved scope, plan, tasks, or implementation behavior.
10. Mark stale, superseded, or untraceable checklist items as invalid instead of silently carrying them forward.
11. Route reusable checklist improvements discovered from test or review feedback to `sdlc-test-feedback-sync` or `sdlc-speckit-sync`.
12. Recommend manifest Activity Log and Re-Gate updates.

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
- `${AI_SDLC_STANDARD_HOME}/skill-contracts/known-skills/sdlc-speckit-checklist.md`
- `${AI_SDLC_STANDARD_HOME}/checklists/specification-checklist.md`
- `${AI_SDLC_STANDARD_HOME}/checklists/plan-checklist.md`
- `${AI_SDLC_STANDARD_HOME}/checklists/task-checklist.md`
- `${AI_SDLC_STANDARD_HOME}/checklists/implementation-checklist.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/artifact-storage.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/change-control.md`
- `${AI_SDLC_STANDARD_HOME}/templates/artifact-manifest-template.md`

## Reference Files

Load these references as needed:

- `references/checklist-inputs.md` for required inputs, stage selection, and readiness checks.
- `references/item-generation-rules.md` for item source, traceability, and prohibited item types.
- `references/staleness-and-regate.md` for stale checklist detection and Re-Gate routing.
- `references/output-targets.md` for output paths and write boundaries.
- `references/output-and-manifest.md` for checklist report and manifest recommendations.

## Workflow

### 1. Resolve Checklist Scope

Read `references/checklist-inputs.md`.

Identify:

- Requirement ID
- Target feature under `specs/{feature}`
- Checklist stage
- Current `spec.md`, `plan.md`, `tasks.md`, or implementation evidence required by the stage
- Source DocFlow artifacts
- Gate result and accepted risks
- Existing checklist, if any
- `manifest.md`, if available

Stop when the target stage or source artifacts cannot be identified.

### 2. Verify Source Validity

Read:

- `references/checklist-inputs.md`
- `references/staleness-and-regate.md`

Continue only when source artifacts are current, not superseded, and passable for the target stage.

### 3. Generate Or Validate Items

Read `references/item-generation-rules.md`.

For each item:

- Assign a stable item ID.
- State the check in action form.
- Identify the source artifact and section.
- Identify expected evidence.
- Identify severity if missing.
- Identify owner skill or Gate.

Do not add items that require new behavior or reinterpret approved artifacts.

### 4. Select Output Target

Read `references/output-targets.md`.

Default output:

```text
specs/{feature}/checklists/{stage}-checklist.md
```

Use DocFlow output only when the checklist is intended for human handoff under `library/{requirement_id}/`.

### 5. Output Recommendation

Read `references/output-and-manifest.md`.

Report:

- Source artifacts
- Checklist stage
- Generated or validated items
- Invalid or stale items
- Blocking items
- Re-Gate recommendation
- Manifest update recommendation
- Next step

## Output Requirements

Every checklist result must contain:

- Source Artifacts
- Checklist Stage
- Target Checklist
- Checklist Items
- Traceability Summary
- Stale Or Invalid Items
- Blocking Items
- Re-Gate Recommendation
- Manifest Update Recommendation
- Next Step

## Stop Conditions

Stop instead of generating or approving checklist content when:

- Target stage is unclear.
- Required source artifacts are missing or superseded.
- A checklist item would introduce new business behavior or technical decisions.
- Existing checklist conflicts with current spec, plan, tasks, or DocFlow.
- Checklist generation would replace Gate, Analyze, Review, or Test Acceptance.
- Reusable checklist updates require knowledge or standard sync without authorization.
