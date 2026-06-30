---
name: sdlc-speckit-sync
description: |
  This skill should be used when the user asks to "执行 speckit sync", "同步业务知识", "沉淀实现后的稳定事实", "更新 business_domain", or asks to sync verified implementation facts into `.specify/business_domain/**` after sdlc-speckit-implement.
version: 0.1.0
---

# sdlc-speckit-sync

Sync verified, reusable implementation facts into long-term knowledge targets after implementation. Treat specs, implementation evidence, review, and test results as source evidence; do not sync chat fragments, unverified assumptions, or one-off project notes.

## Core Rules

1. Consume verified implementation evidence only.
2. Require current spec, plan, tasks, implementation result, and DocFlow artifacts.
3. Sync only stable, reusable facts that belong in the selected knowledge target.
4. Do not treat `library/{requirement_id}/` as the long-term knowledge base.
5. Do not sync raw chat, temporary debugging notes, speculative design, unverified test findings, or unresolved risks.
6. Require explicit target path and write authorization before modifying `.specify/business_domain/**` or other knowledge assets.
7. Preserve existing knowledge structure, terminology, and ownership.
8. Stop when the target document cannot be determined or the proposed update conflicts with existing facts.
9. Record every sync target, source evidence, skipped item, and residual risk.
10. Recommend manifest Speckit Sync updates.
11. Route reusable checklist, schema, or review gaps to the appropriate Sync or standard update path.
12. Do not modify production code.

## Required Standard Files

Use these repository standard files as authoritative rules:

- `../../skill-contracts/known-skills/sdlc-speckit-sync.md`
- `../../skill-contracts/sync-skill-contract.md`
- `../../ai-sdlc/artifact-storage.md`
- `../../ai-sdlc/change-control.md`
- `../../templates/artifact-manifest-template.md`

## Reference Files

Load these references as needed:

- `references/sync-inputs.md` for required inputs and readiness checks.
- `references/sync-targets.md` for target selection and write authorization.
- `references/fact-eligibility.md` for what can and cannot be synced.
- `references/conflict-and-blocking.md` for conflicts, uncertainty, and Re-Gate routing.
- `references/output-and-manifest.md` for output format and manifest recommendations.

## Workflow

### 1. Resolve Inputs

Identify:

- Requirement ID
- `specs/{feature}/spec.md`
- `specs/{feature}/plan.md`
- `specs/{feature}/tasks.md`
- Implementation result from `sdlc-speckit-implement`
- Implementation record or `03-实现记录`, if available
- Code review and test feedback, if available
- Target knowledge path
- `manifest.md`, if available

Stop if implementation evidence is missing or unverified.

### 2. Verify Sync Readiness

Read:

- `references/sync-inputs.md`
- `references/fact-eligibility.md`

Continue only when:

- Implementation is completed or the sync scope is limited to completed verified tasks.
- Verification evidence exists.
- Facts are stable and reusable.
- Target path and authorization are explicit.

### 3. Select Targets

Read `references/sync-targets.md`.

Determine whether each fact belongs in:

- `.specify/business_domain/**`
- Checklist or schema updates
- Coding guide or workflow notes
- No long-term target

Stop when target ownership or path is unclear.

### 4. Prepare Or Apply Sync

Read:

- `references/fact-eligibility.md`
- `references/conflict-and-blocking.md`

Prepare updates with source traceability.

Apply updates only when the user explicitly authorized writing to the target. Otherwise, output a sync proposal.

### 5. Output Recommendation

Read `references/output-and-manifest.md`.

Report:

- Source evidence
- Target documents
- Synced facts or proposed updates
- Skipped facts and reasons
- Conflicts or blocking items
- Manifest Speckit Sync recommendation
- Next step: `sdlc-speckit-code-doc-reconcile`, `sdlc-test-feedback-sync`, or upstream Re-Gate

## Output Requirements

Every sync result must contain:

- Source Artifacts
- Sync Scope
- Target Documents
- Synced Facts Or Proposed Updates
- Skipped Items
- Conflict And Blocking Items
- Verification Basis
- Manifest Speckit Sync Recommendation
- Next Step

## Stop Conditions

Stop instead of syncing when:

- Implementation is unverified.
- Required source artifacts are missing or superseded.
- Target path or ownership is unclear.
- User has not authorized writing to the target.
- Proposed fact is only valid for a single temporary requirement.
- Proposed fact conflicts with existing knowledge.
- Sync would require changing spec, plan, tasks, or code.
