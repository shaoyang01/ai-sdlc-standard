# Output And Manifest

## Reconciliation Report Shape

Use this structure:

```md
# Reconciliation Report

## Source Artifacts

- Requirement ID:
- Feature:
- Code scope:
- Specs:
- DocFlow:
- Knowledge targets:
- Manifest:

## Audit Scope

- Included:
- Excluded:

## Drift Matrix

| Area | Evidence | Expected Basis | Actual State | Classification | Owner |
| --- | --- | --- | --- | --- | --- |

## Result Classification

- Primary:
- Secondary:

## Evidence

- Code:
- Specs:
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
