# Library-Driven Sync Runtime

> **Reference**: `${AI_SDLC_STANDARD_HOME}/ai-sdlc/library-driven-sync-runtime.md`

## Purpose

This file supplements `${AI_SDLC_STANDARD_HOME}/ai-sdlc/business-domain-sync-source-modes.md`, `${AI_SDLC_STANDARD_HOME}/ai-sdlc/shared-business-domain-governance.md`, and `${AI_SDLC_STANDARD_HOME}/ai-sdlc/specs-run-metadata-and-archive.md`. It hardens the `library_driven` sync runtime for `sdlc-speckit-sync`.

`library_driven` is used for Direct Implementation / library-only DocFlow. It:
- Does not require `specs/{feature}/**` or `specs_run_id`.
- Requires `requirement_id`, implementation evidence, verification evidence, and business_domain target for direct write.
- Insufficient evidence produces proposal/not_required/blocked only.

## Library-Driven Runtime Inputs

### Required Inputs

- `requirement_id`
- `library/{requirement_id}/manifest.md` OR at least one valid current library artifact
- `library/{requirement_id}/01-技术方案/*`
- `library/{requirement_id}/02-方案审核/*` with PASS / PASS_WITH_RISK or equivalent
- implementation evidence
- verification evidence
- business_domain target resolvable or user-confirmed
- existing target knowledge documents when updating existing L4
- write authorization for direct write

### Optional Inputs

- `library/{requirement_id}/00-需求资料/*`
- `library/{requirement_id}/03-实现记录/*`
- `library/{requirement_id}/04-交付总结/*`
- `library/{requirement_id}/04-代码审核/*`
- `library/{requirement_id}/05-测试验收/*`
- accepted risk records
- Re-Gate Records
- current code diff
- explicit user sync request
- `.specify/entry-coverage-profile.yaml`
- existing `.specify/business_domain/01DomainCatalog.md`
- L2 main document index

### Not Required

- `specs/{feature}/**` is not required (specs are not required). Missing specs is expected and must not block (missing specs is expected and must not block).
- `specs_run_id` is not required.
- If specs exist, evaluate whether mode should be `hybrid` instead.

## Evidence Classification

### Implementation Evidence Sources

- `library/{requirement_id}/03-实现记录/*`
- implementation result
- accepted code diff summary
- accepted review evidence
- delivery summary when it maps code behavior to requirement
- commit range with explicit implementation scope

### Verification Evidence Sources

- `library/{requirement_id}/05-测试验收/*`
- test result
- accepted review/test feedback
- delivery summary with verification outcome
- CI/test log summary when tied to requirement scope

### Insufficient Evidence

- only chat discussion
- only speculative design
- only pending review
- only unverified code diff
- only one-off implementation note
- missing `02-方案审核` decision
- `02-方案审核` rejected / blocked
- business fact not traceable to implementation and verification

Insufficient evidence produces PROPOSAL / NOT_REQUIRED / BLOCKED only. No direct confirmed write without implementation evidence and verification evidence.

## Runtime Decision Flow

1. **Determine sync_source_mode**: If no specs exist and library artifacts exist → `library_driven`. If specs exist and library exists → `hybrid` unless user explicitly selects `library_driven` supplemental sync. If `pipeline_sync_executed=true` and `result=synced` → duplicate sync guard blocks `library_driven` by default. If user explicitly requests supplemental sync, continue only with duplicate fact detection.

2. **Resolve requirement and current artifacts**: `requirement_id` required. Manifest preferred. Distinguish current/stale/replaced artifacts. Use manifest current effective version when available.

3. **Check library readiness**: `01` exists. `02` PASS / PASS_WITH_RISK or equivalent. Implementation evidence exists. Verification evidence exists. Target L1/L2/L4 resolvable or user-confirmed.

4. **Classify sync need**: SYNC_REQUIRED, NOT_REQUIRED, PROPOSAL_REQUIRED, BLOCKED, DUPLICATE_SYNC_BLOCKED.

5. **Select target**: Use business_domain target from `01`/manifest/user confirmation. Target L4 exists → compatible update. Target L4 missing → create-if-missing with project naming + project shape. Target unclear → proposal only.

6. **Apply or propose**: Direct write only when all gates pass. Proposal when target/section/evidence is incomplete but useful. Not_required when no stable reusable business facts exist. Blocked when evidence/gate/target conflict prevents safe decision.

## Sync Need Classification

| Classification | Condition |
| --- | --- |
| `SYNC_REQUIRED` | Stable reusable business facts exist, implementation evidence exists, verification evidence exists, target business_domain path is resolvable, duplicate sync guard is clear. |
| `NOT_REQUIRED` | No stable reusable business facts, facts are one-off or purely technical, already synced and no delta, requirement only changes local implementation details. |
| `PROPOSAL_REQUIRED` | Candidate stable facts exist but target unresolved, target section unclear, insertion point unclear, evidence partial but useful, write authorization missing, library artifact freshness unclear. |
| `BLOCKED` | `requirement_id` missing, `01` missing, `02` missing or failed, implementation evidence missing, verification evidence missing, target ownership conflict, naming/shape gate fails, fact conflicts with existing business_domain, duplicate sync unresolved, manifest/source-of-truth conflict. |
| `DUPLICATE_SYNC_BLOCKED` | `pipeline_sync_executed=true` and `result=synced`, `library_sync_executed=true` for same facts, same fact already exists in business_domain with traceability, no explicit supplemental sync authorization. |

## Duplicate Sync Guard

Rules:
- Read manifest `business_domain_sync`.
- Compare `source_of_truth`, `requirement_id`, `specs_run_id` when present, library artifacts, `synced_business_domain_targets`.
- If `pipeline_sync_executed=true` and `result=synced`, `library_driven` direct write is blocked by default.
- Supplemental sync allowed only when: user explicitly authorizes supplemental sync; candidate facts are not already synced; source evidence is newer or covers missing stable fact; duplicate fact detection passes.
- If duplicate fact detected → NOT_REQUIRED or DUPLICATE_SYNC_BLOCKED.
- Manifest must record `duplicate_sync_guard` result.

## Manifest Recording

```yaml
business_domain_sync:
  required: true / false
  mode: library_driven
  source_of_truth:
    - library/{requirement_id}/01-技术方案/...
    - library/{requirement_id}/02-方案审核/...
    - library/{requirement_id}/03-实现记录/...
    - library/{requirement_id}/05-测试验收/...
  pipeline_sync_executed: true / false
  library_sync_executed: true / false
  duplicate_sync_guard: active
  current_sync_owner: sdlc-speckit-sync
  result: synced | proposal | not_required | blocked
  reason: "<reason>"
  stable_fact_candidates:
    - "<fact>"
  synced_business_domain_targets:
    - "<path>"
  blocked_reasons:
    - "<reason>"
  proposal_paths:
    - "<path>"
  last_sync_source_mode: library_driven
```

- No `specs_run_id` required in `library_driven` without specs.
- If specs exist and mode is hybrid/supplemental, record `specs_run_id` when available.
- Manifest update recommendation must not invent `source_of_truth`.

## Output Contract

Library_driven sync result must contain:
- Requirement ID, Sync Source Mode, Library Source Artifacts, Current Artifact Freshness
- Implementation Evidence, Verification Evidence
- Sync Need Classification, Duplicate Sync Guard Result
- Target Documents, Target Resolution Evidence
- Create-If-Missing Decision when applicable, Compatible Update Decision when applicable
- Synced Facts Or Proposed Updates, NOT_REQUIRED Reason when applicable, BLOCKED Reasons when applicable
- Manifest Update Recommendation, Next Step

## Blocking Rules

- `requirement_id` missing
- no current library artifact
- `01-技术方案` missing
- `02-方案审核` missing / failed / blocked
- implementation evidence missing
- verification evidence missing
- source_of_truth unclear
- specs exist but mode conflict unresolved
- manifest source freshness conflict
- duplicate sync guard unresolved
- `pipeline_sync_executed=true` and `result=synced` without supplemental authorization
- target L1/L2/L4 unresolved
- business_domain naming/shape gate fails
- compatible update safe insertion point unknown for direct write
- fact conflicts with existing business_domain
- write authorization missing
- entry coverage audit BLOCKED/PENDING when required
