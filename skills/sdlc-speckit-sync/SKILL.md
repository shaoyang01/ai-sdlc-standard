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
13. When a `.specify/business_domain/**` L4 target is missing, use create-if-missing only after L1/L2 are confirmed, target owner is explicit, create authorization is recorded, and the new L4 id can be reserved.
14. After any business-domain write or authorized create-if-missing, run the standard entry coverage audit and block final Sync when it fails.

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
- `${AI_SDLC_STANDARD_HOME}/skill-contracts/known-skills/sdlc-speckit-sync.md`
- `${AI_SDLC_STANDARD_HOME}/skill-contracts/sync-skill-contract.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/artifact-storage.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/change-control.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/speckit-project-bootstrap.md`
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/speckit-project-type-profiles.md`
- `${AI_SDLC_STANDARD_HOME}/templates/artifact-manifest-template.md`

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
- `.specify/business_domain/01DomainCatalog.md`, if syncing to business_domain
- L1/L2/L4 route, owner, and create-if-missing authorization when target L4 is missing
- `.specify/entry-coverage-profile.yaml`, if available
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
- Business-domain target routes use confirmed L1/L2 and either an existing L4 or an authorized create-if-missing path.

### 3. Select Or Create Targets

Read `references/sync-targets.md`.

Determine whether each fact belongs in:

- `.specify/business_domain/**`
- Checklist or schema updates
- Coding guide or workflow notes
- No long-term target

Stop when target ownership or path is unclear.

For `.specify/business_domain/**` targets:

1. Resolve the L1/L2/L4 target from `specs/{feature}/spec.md` `Business Domain Targets` and `Sync Targets`, the existing `01DomainCatalog.md`, and current business-domain documents.
2. Verify target ownership and that the fact belongs to that bounded context.
3. If the L4 document exists, prepare an update against the existing file.
4. If the L4 document is missing, continue only when create-if-missing is explicitly authorized, L1/L2 are confirmed, owner is explicit, and a stable L4 id can be reserved.
5. Create the L4 skeleton only after reserving the id; update the L2 main document index and `01DomainCatalog.md` in the same Sync change.
6. Do not create or write missing domain facts under `99PendingConfirmation`.
7. Run `${AI_SDLC_STANDARD_HOME}/scripts/audit-entry-coverage.rb <target-project-path> --strict` before reporting final `SYNCED`.

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
- Create-If-Missing Decision
- Synced Facts Or Proposed Updates
- Skipped Items
- Conflict And Blocking Items
- Verification Basis
- Manifest Speckit Sync Recommendation
- Next Step

## Stop Conditions

Stop instead of syncing when:

- Implementation is unverified.
- Required source artifacts are missing or stale.
- Target path or ownership is unclear.
- L1/L2 are unconfirmed for a missing business-domain L4 target.
- L4 id cannot be reserved for an authorized create-if-missing target.
- Target owner is unclear for an existing or new business-domain document.
- User has not authorized writing to the target.
- Proposed fact is one-off or only valid for a single temporary requirement.
- Proposed fact conflicts with existing knowledge.
- Standard entry coverage audit fails for `.specify/business_domain/**` Sync.
- Sync would require changing spec, plan, tasks, or code.
