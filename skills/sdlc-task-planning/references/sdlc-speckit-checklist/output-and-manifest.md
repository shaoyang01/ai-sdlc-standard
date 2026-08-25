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

## Checklist Artifact Shape

Use this structure:

```md
# {Stage} Checklist

## Source Artifacts

- Requirement ID:
- Feature:
- Stage:
- Sources:

## Checklist Items

| ID | Check | Source | Evidence | Severity | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |

## Traceability Summary

- Covered sources:
- Missing sources:

## Stale Or Invalid Items

- None, or list item with reason.

## Blocking Items

- None, or list item with Re-Gate route.

## Next Step

- Recommended action:
```

## Result Labels

Use one primary result:

- `GENERATED`: new checklist generated from current sources.
- `VALIDATED`: existing checklist remains current.
- `STALE`: existing checklist no longer matches current sources.
- `BLOCKED`: source conflict or missing required artifact prevents checklist output.
- `PROPOSED`: checklist content was proposed but not written.

## Manifest Activity Log Recommendation

Recommend an Activity Log entry containing:

- Timestamp.
- Skill: `sdlc-speckit-checklist`.
- Stage.
- Source artifacts.
- Target checklist path.
- Result label.
- Blocking items.
- Next action.

## Re-Gate Recommendation

When blocked or stale, recommend:

- Earliest affected node.
- Stale checklist path.
- Source artifacts requiring update.
- Whether implementation is blocked.
