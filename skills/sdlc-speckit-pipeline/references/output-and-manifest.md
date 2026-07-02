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

## Pipeline Report Shape

Use this structure:

```md
# Speckit Pipeline Result

## Activation Basis

- Requirement ID:
- Development Path Decision:
- User confirmation:

## New-Rail Runtime Check

- Runtime child skills: `sdlc-speckit-*` only
- Legacy Skill usage: none
- Legacy document runtime input: none
- Project private context read set:
- Standard package:

## Domain Route Summary

- Route Type:
- Project Type Profiles:
- Entry Coverage Surface:
- Business Knowledge Read Set:
- Missing Knowledge:
- Next route action:

## Source Artifacts

- Requirement:
- Technical specification:
- Solution review:
- Manifest:
- Existing specs:

## Stage Timeline

| Stage | Skill | Result | Artifact | Blocking Item | Next |
| --- | --- | --- | --- | --- | --- |

## Gate Results

- Preflight:
- Domain Route:
- Specify:
- Clarify:
- Plan:
- Tasks:
- Analyze:
- Implement:
- Sync:
- Reconcile:

## Produced Or Reused Artifacts

- Specs:
- DocFlow:
- Code:
- Knowledge:

## Side Effects

- Code:
- Docs:
- Knowledge:
- Commands:
- Legacy rail paths touched: none

## Blocking Or Deferred Items

- None, or list each item with owner and route.

## Re-Gate Recommendation

- Required:
- Earliest affected node:
- Stale or replaced artifacts:

## Manifest Update Recommendation

- Activity Log:
- Gate Records:
- Change History:
- Speckit Sync:
- Reconcile:

## Next Step

- Recommended action:
```

## Pipeline Result Labels

Use one primary result:

- `COMPLETED`: implementation, required sync, and reconcile completed without blocking items.
- `PARTIAL`: some stages completed, remaining work is explicit and non-blocking.
- `BLOCKED`: a required stage cannot proceed.
- `REGATE_REQUIRED`: approved upstream artifacts must be revised before continuing.
- `DIRECT_IMPLEMENTATION_RECOMMENDED`: Pipeline was not activated because the reviewed solution supports direct implementation.

## Manifest Recommendations

For each stage, recommend manifest updates with:

- Timestamp.
- Stage.
- Skill.
- Input artifacts.
- Output artifacts.
- Gate result.
- Blocking items.
- Next action.

When the pipeline stops, record:

- Stop reason.
- Earliest affected node.
- Whether implementation is blocked.
- Whether the online admission summary needs a risk note.
