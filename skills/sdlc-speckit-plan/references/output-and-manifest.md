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

Default target:

```text
specs/{feature}/plan.md
```

Do not write:

```text
specs/{feature}/tasks.md
```

Task generation belongs to `sdlc-speckit-tasks`.

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

## Plan Coverage Summary

| Category | Status | Evidence | Action |
| --- | --- | --- | --- |

## Plan Gate Result

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
- Re-Gate Records, if blocked
- Blocking Issues, if any
- Next Step: `sdlc-speckit-tasks` or DocFlow Re-Gate

Do not silently edit manifest unless explicitly requested.
