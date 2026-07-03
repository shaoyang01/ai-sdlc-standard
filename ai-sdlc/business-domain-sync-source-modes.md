# Business-Domain Sync Source Modes

> **Reference**: `${AI_SDLC_STANDARD_HOME}/ai-sdlc/business-domain-sync-source-modes.md`

## Purpose

Define three sync source modes for writing stable facts to `.specify/business_domain/**`. The mode determines which source artifacts are authoritative and whether a sync is appropriate.

## Mode: `speckit_driven`

**When**: The requirement has gone through Speckit pipeline (legacy or new-rail).

**Source artifacts** (in priority order):

1. `specs/{feature}/route.md` (route type, business domain targets, entry coverage surface)
2. `specs/{feature}/spec.md` (approved business behavior)
3. `specs/{feature}/plan.md` (implementation plan and companion artifacts)
4. `specs/{feature}/tasks.md` (implemented tasks)
5. Implementation result and verification evidence
6. `library/{requirement_id}/03-实现记录/*`
7. `library/{requirement_id}/04-交付总结/*`

**Rules**:

- If pipeline has already executed Sync/Reconcile (manifest `pipeline_sync_executed=true`, `result=synced`), this is the authoritative business_domain governance path.
- Do not repeat a library-driven sync after pipeline sync, unless:
  - Pipeline sync was explicitly skipped.
  - Reconcile discovered missing stable facts.
  - A direct patch occurred after pipeline completion.
  - User explicitly requests supplemental sync.
- Specs and library artifacts together form the complete evidence chain.

## Mode: `library_driven`

**When**: Direct Implementation or library-only DocFlow (no Speckit pipeline run).

**Does not require** `specs/{feature}/**` to exist.

**Source artifacts** (in priority order):

1. `library/{requirement_id}/manifest.md` (development path, stage status, gate results)
2. `library/{requirement_id}/00-需求资料/*` (requirement intake)
3. `library/{requirement_id}/01-技术方案/*` (technical specification)
4. `library/{requirement_id}/02-方案审核/*` (solution review)
5. `library/{requirement_id}/03-实现记录/*` (implementation record)
6. `library/{requirement_id}/04-交付总结/*` (delivery summary)
7. `library/{requirement_id}/05-测试验收/*` (test acceptance)

**Readiness for direct business_domain write**:

Before writing confirmed business_domain facts in `library_driven` mode, all of the following must be satisfied:

- `requirement_id` is explicit.
- Manifest or valid library artifacts are explicit.
- `01-技术方案` exists.
- `02-方案审核` result is `PASS` or `PASS_WITH_RISK` (or equivalent review).
- Implementation evidence exists.
- Verification evidence exists.
- Business domain target (L1/L2/L4) is resolvable or user-confirmed.

**Without implementation and verification evidence**:

- Generate a sync proposal only.
- Do not write confirmed business_domain facts.
- Record `Business Domain Sync: not_required` with reason when no stable, reusable, non-one-off business facts can be identified.

## Mode: `hybrid`

**When**: Both specs and library artifacts exist for the same requirement.

**Source priority**: Determined by manifest `current effective version`, pipeline status, source freshness, and gate result.

**Rules**:

- Do not write the same fact twice (once from speckit_driven, once from library_driven).
- If `pipeline_sync_executed=true` and `result=synced`, `library_driven` sync defaults to blocked (duplicate sync guard).
- If `library_sync_executed=true` and pipeline later reaches Sync, pipeline must read manifest to avoid duplicate writes.
- When both sources exist and neither has synced, prefer `speckit_driven` as the primary sync path if the pipeline reached Sync/Reconcile.

## Duplicate Sync Guard

The duplicate sync guard does not replace the naming/shape gate. Before any direct business_domain write, naming pattern and shape profile must be confirmed per `${AI_SDLC_STANDARD_HOME}/ai-sdlc/business-domain-naming-and-shape.md`.

All sync source modes (`speckit_driven`, `library_driven`, `hybrid`) must observe business-domain naming and shape rules. Direct write readiness requires:
- Implementation evidence.
- Verification evidence.
- Naming pattern resolvable.
- Shape profile resolvable (confidence `high` or `medium`, or `low` with user confirmation).

Manifest must record business_domain sync status to prevent duplicate writes:

```yaml
business_domain_sync:
  required: true / false
  mode: none | speckit_driven | library_driven | hybrid
  source_of_truth:
    - "<source-artifact-path>"
  pipeline_sync_executed: true / false
  library_sync_executed: true / false
  duplicate_sync_guard: active
  current_sync_owner: sdlc-speckit-sync | library-driven-sync
  result: synced | proposal | not_required | blocked
  reason: "<reason>"
```

**Guard rules**:

- If `pipeline_sync_executed=true` and `result=synced`, library-driven sync must not execute (unless one of the speckit_driven exceptions applies).
- If `library_sync_executed=true`, subsequent pipeline sync must read manifest and skip already-synced facts.
- `duplicate_sync_guard: active` means the guard is enforced; set to `inactive` only when the user explicitly authorizes a re-sync.

## Manifest Business-Domain Sync Fields

Recommended manifest section:

```yaml
business_domain_sync:
  required: true / false
  mode: none | speckit_driven | library_driven | hybrid
  source_of_truth:
    - specs/{feature}/route.md
    - specs/{feature}/spec.md
    - library/{requirement_id}/01-技术方案/...
  pipeline_sync_executed: true / false
  library_sync_executed: true / false
  duplicate_sync_guard: active
  current_sync_owner: sdlc-speckit-sync | library-driven-sync
  result: synced | proposal | not_required | blocked
  reason: "<reason>"
  stable_fact_candidates:
    - "<fact-description>"
  sync_proposals:
    - "<proposal>"
  blocked_reasons:
    - "<reason>"
```
