# Sync Inputs

## Single-Rail Source Baseline

`sdlc-knowledge-sync` has a single rail (Decision-044/045/088): the current
requirement's `library/{requirement_id}/` artifacts plus the target repository's
code state and verification evidence are the only sync sources. There are no
source modes, no mode switch, and no run-level working-materials input; the
absence of such materials never blocks sync evaluation.

The knowledge target is resolved deterministically from
`.specify/business_domain/knowledge-target.yaml` (created by
`scripts/bootstrap-knowledge-target.sh`); see `sync-targets.md`.

## Required Inputs

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

Sync evaluation may run with incomplete evidence, but incomplete evidence can
only produce `proposal`, `not_required`, or `blocked` — not direct confirmed
write.

Runtime inputs and readiness are defined by
`${AI_SDLC_STANDARD_HOME}/ai-sdlc/library-driven-sync-runtime.md`. Key rules:

- Single rail: current requirement `library/{requirement_id}/` artifacts + code + verification evidence.
- Direct write requires implementation evidence and verification evidence.
- Insufficient evidence produces proposal/not_required/blocked only.
- Sync Need Classification must be one of: SYNC_REQUIRED, NOT_REQUIRED, PROPOSAL_REQUIRED, BLOCKED, DUPLICATE_SYNC_BLOCKED.
- Duplicate sync guard must check the current requirement manifest sync record, `synced_business_domain_targets`, and existing knowledge entries (SKILL Core Rule 11).

## Readiness Checks

Continue only when:

- Implementation status is `COMPLETED`, or sync scope is explicitly limited to verified completed tasks.
- Verification results are present.
- No Blocking Items remain for the facts being synced.
- Current source artifacts are not stale.
- Target knowledge path is explicit (see `sync-targets.md` declaration resolution).
- User authorized write access if applying changes.

## Missing Implementation Record

If `03-实现记录` is missing:

- Continue only when implementation result and verification evidence are sufficient.
- Recommend running `sdlc-implementation-recorder`.
- Do not sync facts that cannot be traced to code changes and verification.

## Readiness

Before writing confirmed business_domain facts:

- `requirement_id` must be explicit.
- Manifest or at least one valid current library artifact must be explicit.
- `01-技术方案` must exist.
- `02-方案审核` result must be `PASS` or `PASS_WITH_RISK` (or equivalent review).
- Implementation evidence must exist (from `03-实现记录`, implementation result, or code diff).
- Verification evidence must exist (from `05-测试验收`, `04-交付总结`, test result, or accepted review).
- Business domain target (L1/L2/L4) must be resolvable or user-confirmed.
- Naming pattern must be identifiable per `${AI_SDLC_STANDARD_HOME}/ai-sdlc/business-domain-naming-and-shape.md`.
- Shape profile must be identifiable with confidence `high`/`medium` (or `low` with user confirmation).

Without implementation and verification evidence, generate a sync proposal only.
Do not write confirmed business_domain facts. Record
`Business Domain Sync: not_required` with reason when no stable, reusable,
non-one-off business facts can be identified.

Incomplete evidence can only produce `proposal`, `not_required`, or `blocked` —
not direct confirmed write.

## Source Priority

1. Current requirement manifest, current effective version.
2. `01-技术方案` (technical specification).
3. `02-方案审核` (solution review).
4. Implementation evidence: verified code state, implementation result, or `03-实现记录`.
5. Verification evidence: `05-测试验收`, `04-交付总结`, test results, or accepted review.
6. Classified feedback, when re-entered through requirement-intake (Decision-045).
7. Existing target knowledge documents.

Do not use raw chat as a source of long-term truth.
