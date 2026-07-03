---
name: sdlc-speckit-sync
description: |
  This skill should be used when the user asks to "执行 speckit sync", "同步业务知识", "沉淀实现后的稳定事实", "更新 business_domain", or asks to sync verified implementation facts into `.specify/business_domain/**` after sdlc-speckit-implement.
version: 0.1.0
---

# sdlc-speckit-sync

Sync verified, reusable implementation facts into long-term knowledge targets after implementation. Treat specs, implementation evidence, review, and test results as source evidence; do not sync chat fragments, unverified assumptions, or one-off project notes.

## Core Rules

1. Determine sync_source_mode before collecting required inputs: speckit_driven, library_driven, or hybrid. See `${AI_SDLC_STANDARD_HOME}/ai-sdlc/business-domain-sync-source-modes.md`.
2. In speckit_driven mode, require current specs/{feature}/spec.md, plan.md, tasks.md, implementation result, verification evidence, and relevant DocFlow artifacts.
3. In library_driven mode, do not require specs/{feature}/**. Require requirement_id, current library artifacts, approved 01-技术方案, approved 02-方案审核, implementation evidence, verification evidence, and business_domain target. Missing specs is expected and must not block.
4. In hybrid mode, collect both when present and use manifest current effective version, pipeline status, source freshness, and gate result to determine priority.
5. Sync only stable, reusable facts that belong in the selected knowledge target.
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
14. Observe project naming and project shape before writing business_domain. Use project canonical naming and project shape for create-if-missing. See `${AI_SDLC_STANDARD_HOME}/ai-sdlc/business-domain-naming-and-shape.md`.
15. Do not default to standard L4 skeleton in existing projects. Standard templates are fallback-only for new projects or when no project shape exists and user confirms. Standard template fallback requires explicit user confirmation and `standard_template_fallback_allowed=true`.
16. Preserve existing shape when updating existing L4 documents. Unknown naming or unknown shape → proposal only.
17. For create-if-missing, first resolve project canonical naming, project shape, naming_pattern_source, shape_profile_source, and shape_confidence. Use `${AI_SDLC_STANDARD_HOME}/templates/business-domain-l4/{profile}.md` only as explicit standard template fallback when no project shape exists, the user confirms fallback, `standard_template_fallback_allowed=true`, and fallback does not conflict with existing legacy/project shape.
18. After any business-domain write or authorized create-if-missing, run the standard entry coverage audit and block final Sync when it fails.

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
- `${AI_SDLC_STANDARD_HOME}/ai-sdlc/business-domain-naming-and-shape.md` for naming conventions and project shape rules.
- `${AI_SDLC_STANDARD_HOME}/templates/business-domain-sync-proposal-template.md` for sync proposal format.
- `${AI_SDLC_STANDARD_HOME}/templates/business-domain-governance-profile-template.yaml` for governance profile.
- `${AI_SDLC_STANDARD_HOME}/templates/business-domain-l4/` — loaded only when standard template fallback is explicitly active.

## Workflow

### Sync Source Mode Resolution

Determine sync_source_mode before collecting inputs:

- `speckit_driven`: selected when Speckit pipeline produced specs and pipeline Sync/Reconcile is the intended path.
- `library_driven`: selected when Direct Implementation / library-only DocFlow did not produce specs.
- `hybrid`: selected when both specs and library exist for the same requirement.
- Stop when mode cannot be determined and business_domain write is requested.

See `${AI_SDLC_STANDARD_HOME}/ai-sdlc/business-domain-sync-source-modes.md`.

### 1. Resolve Inputs (per mode)

**speckit_driven identify:**
- Requirement ID, feature id
- `specs/{feature}/spec.md`
- `specs/{feature}/route.md`, when materialized
- `specs/{feature}/plan.md`
- `specs/{feature}/tasks.md`
- Implementation result from `sdlc-speckit-implement`
- Verification evidence
- `library/{requirement_id}/01-技术方案/*`, `02-方案审核/*`
- Implementation record, code review, test feedback if available
- `manifest.md`, if available

**library_driven identify:**
- Requirement ID
- `library/{requirement_id}/manifest.md` OR at least one valid current library artifact
- `library/{requirement_id}/01-技术方案/*`
- `library/{requirement_id}/02-方案审核/*`
- Implementation evidence: `03-实现记录` / implementation result / code diff with accepted implementation record
- Verification evidence: `05-测试验收` / `04-交付总结` / test result / accepted review
- Business domain target or user confirmation
- `manifest.md`, if available

**hybrid identify:**
- Both specs and library when present
- `manifest.md` current effective version
- Pipeline status
- Source freshness
- Gate results

### 2. Verify Sync Readiness

Read:

- `references/sync-inputs.md`
- `references/fact-eligibility.md`

Continue only when:

- Sync source mode is explicit.
- In speckit_driven mode: specs are present, implementation is completed or sync scope is limited to verified tasks, verification evidence exists.
- In library_driven mode: specs are not required. Implementation evidence exists, verification evidence exists, library artifacts are current.
- In hybrid mode: missing specs blocks only if manifest marks specs as current source-of-truth.
- Incomplete evidence can only produce proposal/not_required/blocked, not confirmed write.

### 3. Select Or Create Targets

Read `references/sync-targets.md`.

Determine whether each fact belongs in:

- `.specify/business_domain/**`
- Checklist or schema updates
- Coding guide or workflow notes
- No long-term target

Stop when target ownership or path is unclear.

For `.specify/business_domain/**` targets:

1. Resolve the L1/L2/L4 target from `specs/{feature}/route.md` when available, `specs/{feature}/spec.md` `Business Domain Targets` and `Sync Targets`, the existing `01DomainCatalog.md`, and current business-domain documents.
2. Detect project canonical naming pattern and naming_pattern_source.
3. Detect project shape profile and shape_profile_source.
4. Determine shape_confidence.
5. If the L4 document exists, prepare compatible update against the existing file and preserve existing shape.
6. If the L4 document is missing:
   - require create-if-missing authorization;
   - require confirmed L1/L2, owner, and reserved L4 id;
   - create using project canonical naming and project shape;
   - update L2 main document index and `01DomainCatalog.md`;
   - record naming_pattern_source, shape_profile_source, shape_confidence.
7. Use `${AI_SDLC_STANDARD_HOME}/templates/business-domain-l4/{profile}.md` only when standard template fallback is explicitly active:
   - no existing project shape exists;
   - user confirms fallback;
   - `standard_template_fallback_allowed=true`;
   - fallback does not conflict with existing legacy/project shape.
   - When fallback is active, Selected L4 Template is recorded for traceability.
8. Do not write missing domain facts under `99PendingConfirmation`.
9. Run `${AI_SDLC_STANDARD_HOME}/scripts/audit-entry-coverage.rb <target-project-path> --strict` before reporting final `SYNCED`.

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
- naming_pattern_source, shape_profile_source, or shape_confidence is missing for create-if-missing.
- standard template fallback is attempted without explicit fallback conditions.
- fallback is active but Project Type Profiles or selected fallback template cannot be resolved.
- target document would be created under `99PendingConfirmation`.
- L2 index or `01DomainCatalog.md` cannot be updated.
- Target owner is unclear for an existing or new business-domain document.
- User has not authorized writing to the target.
- Proposed fact is one-off or only valid for a single temporary requirement.
- Proposed fact conflicts with existing knowledge.
- Standard entry coverage audit fails for `.specify/business_domain/**` Sync.
- Sync would require changing spec, plan, tasks, or code.
- Unknown sync_source_mode when business_domain write is requested.
- Missing specs blocks only in speckit_driven or hybrid when specs are current source-of-truth.
- Missing specs must not block library_driven mode.
- In library_driven mode, missing implementation or verification evidence → proposal/not_required/blocked, not direct write.
