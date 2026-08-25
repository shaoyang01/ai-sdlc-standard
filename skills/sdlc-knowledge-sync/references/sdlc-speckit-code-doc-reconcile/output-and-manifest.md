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

## Reconciliation Report Shape

Use this structure:

```md
# Reconciliation Report

## Source Artifacts

- Requirement ID:
- Feature:
- Code scope:
- Specs:
- Process products:
- DocFlow:
- Knowledge targets:
- Manifest:

## Audit Scope

- Included:
- Excluded:

## Drift Matrix

| Area | Evidence | Expected Basis | Actual State | Classification | Owner |
| --- | --- | --- | --- | --- | --- |

## Process Product Drift

Use the actual code diff, current manifest, and approved artifacts as evidence
for this table.

| Artifact | Expected Basis | Actual Code / Manifest State | Drift | Owner |
| --- | --- | --- | --- | --- |
| `specs/{feature}/implementation.md` | approved tasks and implementation result |  | none / stale / missing / contradicted |  |
| `specs/{feature}/workflow-status.md` | manifest is status authority |  | none / stale / manifest drift / contradicted |  |
| `specs/{feature}/debug-guide.md` | API, mock/real switch, reproduction behavior |  | none / stale / missing / contradicted |  |
| `specs/{feature}/observability.md` | logging, metrics, frontend analytics, error state, debug logs |  | none / stale / missing / contradicted |  |

## Result Classification

- Primary:
- Secondary:

## Evidence

- Code:
- Specs:
- Process products:
- DocFlow:
- Knowledge:
- Manifest:

## Blocking Items

- None, or list blocking item with required decision.

## Recommended Owner Or Skill

- Next owner:
- Reason:

## Manifest Update Recommendation

- Activity Log:
- Re-Gate Records:
- Sync Status:
- Residual Risk:

## Next Step

- Recommended action:
```

## Manifest Activity Log Recommendation

When reconciliation runs, recommend an Activity Log entry containing:

- Timestamp.
- Actor or Skill: `sdlc-speckit-code-doc-reconcile`.
- Source artifacts inspected.
- Result classification.
- Drift summary.
- Next action.

## Manifest Re-Gate Recommendation

When drift requires upstream correction, recommend:

- Affected Gate.
- Reason.
- Stale or replaced artifacts.
- Required new artifacts.
- Blocking status until Re-Gate completes.

## Manifest Sync Recommendation

When knowledge drift is found, recommend:

- Target path.
- Sync status: `NOT_RUN`, `PROPOSED`, `SYNCED`, `PARTIAL`, or `BLOCKED`.
- Source evidence.
- Residual risk.

## Result Labels

Allowed result labels:

- `CONSISTENT`
- `CODE_DRIFT`
- `SPEC_DRIFT`
- `DOCFLOW_DRIFT`
- `KNOWLEDGE_DRIFT`
- `MANIFEST_DRIFT`
- `UNVERIFIED_FACT`
- `BLOCKED`

Use multiple labels when necessary, but name one primary label.
