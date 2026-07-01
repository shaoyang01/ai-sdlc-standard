# Output And Manifest

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
