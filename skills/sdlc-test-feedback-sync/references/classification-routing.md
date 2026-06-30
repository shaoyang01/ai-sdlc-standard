# Classification Routing

## Routing Table

| Classification | Primary Route | Checklist / Schema Recommendation | Knowledge Sync |
| --- | --- | --- | --- |
| Implementation Bug | Fix code and update `03-实现记录`. | Only recommend if the bug reveals a reusable implementation checklist gap. | Do not sync failed behavior. |
| Specification Missing | Return to `01-技术方案` and rerun `sdlc-solution-reviewer`. | Recommend Specification Checklist or Schema update when the missing rule is reusable. | Sync only after new Gate passes. |
| Review Missing | Record review gap and improve review checklist. | Recommend Code Review Checklist update. | Sync review lesson only after fix is validated. |
| Requirement Change | Apply change-control. | No checklist/schema update unless the change reveals a reusable intake rule. | Do not sync until requirement is confirmed and Gate passes. |
| Test Case Issue | Update test case or acceptance wording. | Recommend test feedback schema wording only if the issue is systemic. | Usually no knowledge sync. |
| Environment / Data Issue | Resolve environment or data blocker. | Recommend environment validation checklist only if repeatable. | Sync only reusable environment guidance, not failed data state. |

## Specification Missing

Recommend:

- New `01-技术方案` version.
- New `02-方案审核` Gate.
- Manifest Change History update.
- Re-Gate Records update.
- Specification Checklist or Schema update when the omission is generally useful.

Do not:

- Treat the missing behavior as implemented fact.
- Sync the old superseded specification.

## Review Missing

Recommend:

- Code Review Checklist update.
- Review gap entry in manifest.
- Optional reviewer prompt or rubric update in a later workflow.

Do not:

- Modify the code review report directly.
- Treat the missed issue as a new required code fix without implementation owner action.

## Requirement Change

Recommend:

- Same requirement vs new requirement decision.
- Earliest affected node.
- New requirement artifact or specification version as needed.

Do not:

- Store the changed request as stable knowledge before confirmation.
- Merge independent new scope into the old Gate result.
