# Sync Inputs

## Sync Source Mode

`sdlc-speckit-sync` supports three sync source modes per `${AI_SDLC_STANDARD_HOME}/ai-sdlc/business-domain-sync-source-modes.md`:

- `speckit_driven`: Specs pipeline artifacts are the primary source. Requires `specs/{feature}/**`.
- `library_driven`: Library DocFlow artifacts are the primary source. Does not require `specs/{feature}/**`.
- `hybrid`: Both specs and library artifacts exist. Source priority determined by manifest freshness.

The mode must be determined before collecting inputs.

## Required Inputs (speckit_driven)

`sdlc-speckit-sync` in `speckit_driven` mode requires:

- `specs/{feature}/spec.md`
- `specs/{feature}/route.md`, when materialized
- `specs/{feature}/plan.md`
- `specs/{feature}/tasks.md`
- Implementation result from `sdlc-speckit-implement`
- Verification evidence for completed tasks
- `library/{requirement_id}/01-技术方案/*`
- `library/{requirement_id}/02-方案审核/*`

Recommended:

- `library/{requirement_id}/03-实现记录/*`
- `library/{requirement_id}/04-代码审核/*`
- `library/{requirement_id}/05-测试验收/*`
- `library/{requirement_id}/manifest.md`
- Accepted risk records
- Re-Gate Records
- Replaced Artifact Paths
- Existing target knowledge documents
- Pipeline Domain Route Summary, when `specs/{feature}/route.md` has not been materialized

## Readiness Checks

Continue only when:

- Implementation status is `COMPLETED`, or sync scope is explicitly limited to verified completed tasks.
- Verification results are present.
- No Blocking Items remain for the facts being synced.
- Current source artifacts are not stale.
- Target knowledge path is explicit.
- User authorized write access if applying changes.

## Missing Implementation Record

If `03-实现记录` is missing:

- Continue only when implementation result and verification evidence are sufficient.
- Recommend running `sdlc-implementation-recorder`.
- Do not sync facts that cannot be traced to code changes and verification.

## Source Priority (Legacy — superseded by Source Priority by Mode below)

This legacy priority was the original speckit_driven source order. Use `## Source Priority (by Mode)` below as authoritative. This section is kept for reference only and must not be used for library_driven mode.

Priority order:

1. Verified implementation result and changed code facts.
2. `03-实现记录`, if available.
3. Current `specs/{feature}/spec.md`, `plan.md`, and `tasks.md`.
4. Current `specs/{feature}/route.md` or Pipeline Domain Route Summary for business-domain route, Project Type Profiles, and create-if-missing decisions.
5. Code review or test feedback after implementation.
6. Current effective `01-技术方案` and `02-方案审核`.
7. Existing target knowledge documents.

Do not use raw chat as a source of long-term truth.

## Required Inputs (library_driven)

`sdlc-speckit-sync` in `library_driven` mode does not require `specs/{feature}/**`. Required inputs:

- `requirement_id`
- `library/{requirement_id}/manifest.md` OR at least one valid current library artifact
- `library/{requirement_id}/01-技术方案/*`
- `library/{requirement_id}/02-方案审核/*` with `PASS` / `PASS_WITH_RISK` or equivalent review decision
- Implementation evidence, which may come from:
  - `library/{requirement_id}/03-实现记录/*`
  - Implementation result
  - Code diff with accepted implementation record
- Verification evidence, which may come from:
  - `library/{requirement_id}/05-测试验收/*`
  - `library/{requirement_id}/04-交付总结/*`
  - Test result
  - Accepted review evidence
- Business domain target resolvable or user-confirmed

Source candidates / recommended:

- `library/{requirement_id}/00-需求资料/*`
- `library/{requirement_id}/03-实现记录/*`
- `library/{requirement_id}/04-交付总结/*`
- `library/{requirement_id}/05-测试验收/*`
- Accepted risk records
- Re-Gate Records
- Existing target knowledge documents
- `.specify/entry-coverage-profile.yaml`

Library_driven mode can run sync evaluation with incomplete evidence, but incomplete evidence can only produce `proposal`, `not_required`, or `blocked` — not direct confirmed write.

Runtime inputs and readiness are defined by `${AI_SDLC_STANDARD_HOME}/ai-sdlc/library-driven-sync-runtime.md`. Key rules:
- specs are not required. specs_run_id is not required. Missing specs is expected and must not block.
- If specs exist, evaluate hybrid or explicitly authorized supplemental sync.
- library_driven direct write requires implementation evidence and verification evidence.
- insufficient evidence produces proposal/not_required/blocked only.
- Sync Need Classification must be one of: SYNC_REQUIRED, NOT_REQUIRED, PROPOSAL_REQUIRED, BLOCKED, DUPLICATE_SYNC_BLOCKED.
- duplicate sync guard must check pipeline_sync_executed, library_sync_executed, source_of_truth, synced_business_domain_targets.
- pipeline_sync_executed=true and result=synced blocks library_driven direct write unless supplemental sync is explicitly authorized.
- supplemental sync requires no duplicate fact and newer/missing stable fact evidence.

## Library-Driven Readiness

Before writing confirmed business_domain facts in `library_driven` mode:

- `requirement_id` must be explicit.
- Manifest or at least one valid current library artifact must be explicit.
- `01-技术方案` must exist.
- `02-方案审核` result must be `PASS` or `PASS_WITH_RISK` (or equivalent review).
- Implementation evidence must exist (from `03-实现记录`, implementation result, or code diff).
- Verification evidence must exist (from `05-测试验收`, `04-交付总结`, test result, or accepted review).
- Business domain target (L1/L2/L4) must be resolvable or user-confirmed.
- Naming pattern must be identifiable per `${AI_SDLC_STANDARD_HOME}/ai-sdlc/business-domain-naming-and-shape.md`.
- Shape profile must be identifiable with confidence `high`/`medium` (or `low` with user confirmation).

Without implementation and verification evidence, generate a sync proposal only. Do not write confirmed business_domain facts. Record `Business Domain Sync: not_required` with reason when no stable, reusable, non-one-off business facts can be identified.

Incomplete evidence can only produce `proposal`, `not_required`, or `blocked` — not direct confirmed write.

## Source Priority (by Mode)

### speckit_driven

Priority order:

1. Verified implementation result and changed code facts.
2. `03-实现记录`, if available.
3. Current `specs/{feature}/spec.md`, `plan.md`, and `tasks.md`.
4. Current `specs/{feature}/route.md` or Pipeline Domain Route Summary.
5. Code review or test feedback after implementation.
6. Current effective `01-技术方案` and `02-方案审核`.
7. Existing target knowledge documents.

### library_driven

Priority order:

1. Manifest current effective version and pipeline status.
2. `01-技术方案` (technical specification).
3. `02-方案审核` (solution review).
4. `03-实现记录` (implementation record).
5. `04-交付总结` (delivery summary).
6. `05-测试验收` (test acceptance).
7. Existing target knowledge documents.

### hybrid

When both specs and library artifacts exist, source priority is determined by:

- Manifest `current effective version` and freshness.
- Pipeline status (whether pipeline reached Sync/Reconcile).
- Gate results (whether review and verification passed).
- Prefer `speckit_driven` as primary when pipeline reached Sync/Reconcile.
