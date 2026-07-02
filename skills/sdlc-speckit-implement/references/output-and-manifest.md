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
specs/{feature}/implementation.md
specs/{feature}/workflow-status.md
specs/{feature}/debug-guide.md
specs/{feature}/observability.md
library/{requirement_id}/03-实现记录/{requirement_id}__实现记录.md
library/{requirement_id}/04-交付总结/{requirement_id}__交付总结.md
```

`manifest.md` is the status authority. `specs/{feature}/workflow-status.md` is
only a machine-side status snapshot and must not override manifest Activity Log,
Gate Records, Re-Gate Records, Current Stage, Current Status, or Blocking
Issues.

Use `references/process-products.md` to decide which process products are
required. Frontend and React Native work normally needs implementation, debug,
and observability process products when route, page, component, store, API,
popup, state, visibility, backend/mock boundary, visual behavior, logging, or
analytics are affected.

## Route Boundary

Implement uses `specs/{feature}/route.md`, Pipeline Domain Route Summary, or
Analyze Gate route evidence as an inherited boundary.

Implement does not reinterpret Route Type.
Implement does not reinterpret Business Domain Targets.
Implement only executes inside `specs/{feature}/route.md`, Analyze Gate, and
approved `specs/{feature}/tasks.md` boundaries.
The approved task boundary must remain traceable to `specs/{feature}/spec.md`
and `specs/{feature}/plan.md`.

If implementation discovers that the inherited route conflicts with actual code
boundaries, stop and recommend Analyze / Domain Route / Re-Gate. Do not rewrite
route from Implement to make the implementation fit.

## Result Template

```markdown
# Speckit Implementation Result: <Requirement ID>

## Source Artifacts

- Technical Specification:
- Solution Review:
- Route Artifact:
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

## Process Products Produced Or Recommended

| Artifact | Path | Action | Reason |
| --- | --- | --- | --- |
| Implementation Details | `specs/{feature}/implementation.md` | produced / update recommended / not applicable |  |
| Workflow Status Snapshot | `specs/{feature}/workflow-status.md` | produced / update recommended / not applicable | manifest is status authority |
| Debug Guide | `specs/{feature}/debug-guide.md` | produced / update recommended / not applicable |  |
| Observability | `specs/{feature}/observability.md` | produced / update recommended / not applicable |  |
| Implementation Record | `library/{requirement_id}/03-实现记录/{requirement_id}__实现记录.md` | produced / update recommended / not applicable |  |
| Delivery Summary | `library/{requirement_id}/04-交付总结/{requirement_id}__交付总结.md` | produced / update recommended / not applicable |  |

## Implementation Record Recommendation

## Delivery Summary Recommendation

## Manifest Update Recommendation

## Next Step
```

## Manifest Recommendation

Recommend updates for:

- Activity Log: `sdlc-speckit-implement`
- Artifact Index note for `03-实现记录`, if produced
- Artifact Index note for `04-交付总结`, if produced
- Process Products note for `specs/{feature}/implementation.md`,
  `specs/{feature}/workflow-status.md`, `specs/{feature}/debug-guide.md`, and
  `specs/{feature}/observability.md`, if produced or updated
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
