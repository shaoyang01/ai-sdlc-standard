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

## Implementation Output

Default output:

```text
implementation summary in response plus code changes in the target repository
```

When requested or required by the workflow, also produce or recommend:

```text
library/{requirement_id}/03-实现记录/{requirement_id}__实现记录.md
```

## Result Template

```markdown
# Speckit Implementation Result: <Requirement ID>

## Source Artifacts

- Technical Specification:
- Solution Review:
- SpecKit Spec:
- SpecKit Plan:
- SpecKit Tasks:
- Analyze Gate:
- Manifest:

## Implementation Scope

## Data Cases Considered

| Case | Input / State | Expected Behavior | Verification |
| --- | --- | --- | --- |

## Completed Tasks

| Task ID | Summary | Changed Files | Verification |
| --- | --- | --- | --- |

## Changed Files

## Verification Results

| Check | Scope | Result | Notes |
| --- | --- | --- | --- |

## Blocking Or Unfinished Items

## Re-Gate Recommendation

## Implementation Record Recommendation

## Manifest Update Recommendation

## Next Step
```

## Manifest Recommendation

Recommend updates for:

- Activity Log: `sdlc-speckit-implement`
- Artifact Index note for `03-实现记录`, if produced
- Task status summary
- Re-Gate Records, if blocked
- Blocking Issues, if any
- Next Step: `sdlc-implementation-recorder`, `sdlc-code-review-normalizer`, `sdlc-speckit-sync`, or upstream Re-Gate

Do not silently edit manifest unless explicitly requested.

## Next Step Rules

Use:

- `sdlc-implementation-recorder` when implementation evidence needs DocFlow handoff.
- `sdlc-code-review-normalizer` when code review output must be normalized.
- `sdlc-speckit-sync` only after implementation is verified and stable facts are ready for knowledge sync.
- Upstream Re-Gate when implementation reveals a specification, plan, task, or analysis gap.
