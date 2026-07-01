---
name: sdlc-speckit-code-doc-reconcile
description: |
  This skill should be used when the user asks to "执行 speckit reconcile", "审计代码和文档一致性", "检查 code doc drift", "核对实现和 specs 是否一致", or asks to compare production code, `specs/**`, DocFlow artifacts, and `.specify/business_domain/**` after sdlc-speckit-implement or sdlc-speckit-sync.
version: 0.1.0
---

# sdlc-speckit-code-doc-reconcile

Audit consistency between implemented code, Speckit artifacts, DocFlow artifacts, and long-term business knowledge. Treat this skill as a read-first reconciliation gate: identify drift, classify the source of truth, recommend the earliest required Re-Gate or sync path, and avoid masking implementation errors by silently rewriting documents.

## Core Rules

1. Consume current code state, `specs/**`, DocFlow artifacts, implementation evidence, and knowledge targets.
2. Default to read-only audit; do not modify production code.
3. Treat `specs/**` as the Speckit machine fact source and `library/{requirement_id}/` as the human handoff and gate view.
4. Treat `.specify/business_domain/**` or the declared knowledge target as long-term reusable knowledge only after sync authorization.
5. Classify every inconsistency before recommending changes.
6. Route code behavior that violates approved spec, plan, tasks, or DocFlow back to `sdlc-speckit-implement` or the earliest affected Gate.
7. Route verified code or spec facts missing from the knowledge base to `sdlc-speckit-sync`.
8. Route ambiguous requirement, solution, or acceptance facts to the earliest affected DocFlow or Speckit Gate.
9. Do not treat chat fragments as reconciliation evidence unless they were already captured in approved artifacts.
10. Do not rewrite spec, plan, tasks, DocFlow, or knowledge documents to legitimize unapproved code behavior.
11. Record source artifacts, drift category, recommended owner, and manifest update recommendations.
12. Stop when the current source of truth cannot be identified.

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
- `${AI_SDLC_STANDARD_HOME}/skill-contracts/known-skills/sdlc-speckit-code-doc-reconcile.md`
- `${AI_SDLC_STANDARD_HOME}/skill-contracts/auditor-skill-contract.md`
- `${AI_SDLC_STANDARD_HOME}/skill-contracts/sync-skill-contract.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/artifact-storage.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/change-control.md`
- `${AI_SDLC_STANDARD_HOME}/templates/artifact-manifest-template.md`

## Reference Files

Load these references as needed:

- `references/reconcile-inputs.md` for required inputs, source priority, and readiness checks.
- `references/drift-categories.md` for drift labels and routing semantics.
- `references/audit-workflow.md` for the audit sequence and comparison matrix.
- `references/apply-boundaries.md` for allowed side effects and write authorization.
- `references/output-and-manifest.md` for report structure and manifest recommendations.

## Workflow

### 1. Resolve Inputs

Identify:

- Requirement ID
- Current repository status and relevant code diff or implementation scope
- `specs/{feature}/spec.md`
- `specs/{feature}/plan.md`
- `specs/{feature}/tasks.md`
- Implementation result from `sdlc-speckit-implement`
- Sync result from `sdlc-speckit-sync`, if available
- DocFlow artifacts under `library/{requirement_id}/`
- Existing `.specify/business_domain/**` or declared knowledge target
- `manifest.md`, if available

Stop if the current feature, requirement, or source artifacts cannot be identified.

### 2. Verify Reconcile Readiness

Read:

- `references/reconcile-inputs.md`
- `references/apply-boundaries.md`

Continue only when the audit scope and source artifacts are explicit. Mark missing optional artifacts as audit gaps instead of inventing facts.

### 3. Build Drift Matrix

Read:

- `references/audit-workflow.md`
- `references/drift-categories.md`

Compare:

- Code behavior versus `spec.md`, `plan.md`, and `tasks.md`
- Code behavior versus approved DocFlow technical specification and review
- Implementation record versus actual code diff
- Sync result versus verified implementation facts
- Knowledge target versus approved reusable facts
- Manifest Activity Log, Change History, Re-Gate Records, and Sync state

### 4. Classify And Route

Assign one or more result labels:

- `CONSISTENT`
- `CODE_DRIFT`
- `SPEC_DRIFT`
- `DOCFLOW_DRIFT`
- `KNOWLEDGE_DRIFT`
- `MANIFEST_DRIFT`
- `UNVERIFIED_FACT`
- `BLOCKED`

Recommend the earliest responsible step:

- `sdlc-speckit-implement`
- `sdlc-speckit-sync`
- `sdlc-implementation-recorder`
- `sdlc-gate-runner`
- `sdlc-solution-reviewer`
- `sdlc-specification-writer`
- upstream Re-Gate

### 5. Output Recommendation

Read `references/output-and-manifest.md`.

Report:

- Source artifacts
- Audit scope
- Drift matrix
- Evidence and affected files or documents
- Required Re-Gate, sync, or recording action
- Optional authorized document or knowledge update proposal
- Manifest update recommendation
- Next step

## Output Requirements

Every reconciliation result must contain:

- Source Artifacts
- Audit Scope
- Drift Matrix
- Result Classification
- Evidence
- Blocking Items
- Recommended Owner Or Skill
- Manifest Update Recommendation
- Next Step

## Stop Conditions

Stop instead of continuing or writing updates when:

- Requirement ID or feature scope is unclear.
- Required current artifacts are missing or superseded.
- Code behavior cannot be inspected sufficiently.
- The current source of truth conflicts across approved artifacts.
- Drift would require changing production code.
- User did not authorize document or knowledge updates.
- Reconciliation would rely on raw chat rather than approved artifacts.
