# Gate And Re-Gate

## Gate Stops

Stop Pipeline when any stage returns:

- `FAIL`.
- `BLOCKED`.
- Unresolved Critical issue.
- Unaccepted High risk.
- Missing current artifact.
- Superseded artifact.
- Undefined business behavior.
- Scope change without approval.

## Earliest Affected Node

Route blockers to the earliest affected node:

| Blocker | Route |
| --- | --- |
| Requirement source is unclear | `sdlc-requirement-normalizer` |
| Technical solution is incomplete | `sdlc-specification-writer` |
| Solution review failed or risk not accepted | `sdlc-solution-reviewer` |
| Spec does not match approved DocFlow | `sdlc-speckit-specify` |
| Core question remains unanswered | `sdlc-speckit-clarify` then DocFlow Re-Gate |
| Plan changes approved behavior | `sdlc-speckit-plan` then DocFlow Re-Gate |
| Tasks are untraceable | `sdlc-speckit-tasks` |
| Cross-artifact inconsistency exists | `sdlc-speckit-analyze` |
| Code implementation is wrong | `sdlc-speckit-implement` |
| Stable knowledge is missing | `sdlc-speckit-sync` |
| Code and documents drift | `sdlc-speckit-code-doc-reconcile` |

## Confirmation Boundaries

Require explicit user confirmation before:

- Entering full SDD when the route was `DIRECT_IMPLEMENTATION`.
- Starting implementation.
- Applying knowledge sync.
- Applying reconciliation updates.
- Continuing after a `PASS_WITH_RISK` when risk ownership changed.

## Re-Gate Record

Recommend a Re-Gate record containing:

- Triggering stage.
- Blocking evidence.
- Earliest affected node.
- Superseded artifacts.
- Required new artifacts.
- Whether implementation or release is blocked.
