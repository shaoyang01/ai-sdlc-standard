# Output And Manifest

## Artifact Versioning Requirements

When this reference produces or updates a DocFlow requirement artifact under
`library/{requirement_id}/`, it must use a stable path and update the same file.
Do not create `__vN.md` or other filename-versioned artifacts.

The artifact must include:

```markdown
## Metadata

- Requirement ID:
- Artifact Type:
- Version: 1.0.0
- Status: draft / active / passed / failed / stale / replaced
- Author / Skill:
- Created At:
- Updated At:
- Reviewed Artifact:
- Reviewed Artifact Version:
- Gate Artifact Version:

## 修订记录

| Version | Date | Author / Skill | Change Type | Summary | Re-Gate |
| --- | --- | --- | --- | --- | --- |
| 1.0.0 |  |  | initial | Initial current artifact. | no |
```

For non-Gate artifacts, `Reviewed Artifact`, `Reviewed Artifact Version`, and
`Gate Artifact Version` may be omitted when there is no reviewed upstream
artifact. For Gate, review, sync, and reconcile artifacts, they are required.

The body must contain only the current effective content. Historical changes
belong in `## 修订记录`, manifest `Change History`, and Git history.

## Plan Output

Plan stage must produce or explicitly skip with reason:

```text
specs/{feature}/plan.md
specs/{feature}/research.md
specs/{feature}/data-model.md
specs/{feature}/contracts/
specs/{feature}/quickstart.md
```

Do not write:

```text
specs/{feature}/tasks.md
```

Task generation belongs to `sdlc-speckit-tasks`.

## Companion Artifact Skip Record

If any companion artifact is not produced, record the skip in both `plan.md` and the Plan result:

```text
Artifact:
Skip Reason:
Risk:
Impact:
Accepted By:
Re-Gate Required:
```

Allowed skip reasons must be concrete, for example:

- no data model changes and existing data contracts are referenced;
- no external/API/MQ/frontend/ETL contract changes;
- quickstart is not applicable because verification is fully covered by existing automated commands;
- research is not needed because all technical decisions are already covered by reviewed artifacts.

Do not skip an artifact merely because it is inconvenient to write.

## Companion Artifact Requirements

### `research.md`

Capture technical decisions, alternatives considered, rejected options, dependency constraints, and unresolved technical unknowns.

### `data-model.md`

Capture entities, state transitions, persistence side effects, frontend state shape, ETL input/output schema, and compatibility constraints.

### `contracts/`

Create one or more contract files for changed or relied-on external surfaces.

Backend/Admin contracts must cover:

- API/RPC/MQ contract;
- request/response shape;
- state transition;
- persistence side effects;
- transaction/rollback;
- operator-visible behavior.

Frontend contracts must cover:

- page/route behavior;
- component/state/API mapping;
- popup trigger and visibility;
- backend/mock boundary;
- visual verification notes.

ETL/data pipeline contracts must cover:

- input tables/topics/files;
- output tables/topics/reports;
- SQL/data lineage;
- partition/window/checkpoint;
- rerun/replay/idempotency;
- downstream consumer contract.

### `quickstart.md`

Capture how to verify the planned behavior: commands, environment, seed data, representative cases, rollback checks, and expected observations.

## Plan Template

```markdown
# Implementation Plan: <Feature>

## Source Artifacts

- SpecKit Spec:
- Technical Specification:
- Solution Review:
- Clarification Result:
- Manifest:

## Technical Approach

## Companion Artifacts

| Artifact | Status | Path | Skip Reason | Risk | Impact | Accepted By | Re-Gate Required |
| --- | --- | --- | --- | --- | --- | --- | --- |
| plan.md | produced | specs/{feature}/plan.md |  |  |  |  | no |
| research.md | produced / skipped | specs/{feature}/research.md |  |  |  |  |  |
| data-model.md | produced / skipped | specs/{feature}/data-model.md |  |  |  |  |  |
| contracts/ | produced / skipped | specs/{feature}/contracts/ |  |  |  |  |  |
| quickstart.md | produced / skipped | specs/{feature}/quickstart.md |  |  |  |  |  |

## Affected Modules And Files

## Data, State, And Integration Impact

## Failure, Retry, Idempotency, Transaction, And Rollback

## Observability And Rollout

## Verification Strategy

## Risks And Mitigations

## Traceability

## Plan Gate
```

## Result Template

```markdown
# Speckit Plan Result: <Requirement ID>

## Source Artifacts

- SpecKit Spec:
- Technical Specification:
- Solution Review:
- Clarification Result:
- Manifest:

## Target

- Plan:
- Research:
- Data Model:
- Contracts:
- Quickstart:

## Plan Coverage Summary

| Category | Status | Evidence | Action |
| --- | --- | --- | --- |

## Plan Gate Result

## Companion Artifact Status

| Artifact | Status | Evidence | Skip Record |
| --- | --- | --- | --- |
| plan.md |  |  |  |
| research.md |  |  |  |
| data-model.md |  |  |  |
| contracts/ |  |  |  |
| quickstart.md |  |  |  |

## Risks And Mitigations

## Blocking Items

## Re-Gate Recommendation

## Manifest Update Recommendation

## Next Step
```

## Manifest Recommendation

Recommend updates for:

- Activity Log: `sdlc-speckit-plan`
- Related Specs Directory
- Artifact Index note linking `specs/{feature}/plan.md`
- Artifact Index notes for `research.md`, `data-model.md`, `contracts/`, and `quickstart.md` when produced or explicitly skipped.
- Re-Gate Records, if blocked
- Blocking Issues, if any
- Next Step: `sdlc-speckit-tasks` or DocFlow Re-Gate

Do not silently edit manifest unless explicitly requested.
