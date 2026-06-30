# Blocking And Re-Gate

## Blocking Findings

Block review when:

- Critical issue exists.
- High issue lacks explicit risk acceptance.
- Code violates approved scope or behavior.
- Existing flow compatibility is broken without approval.
- Data write, state transition, or transaction behavior is unsafe.
- Security or authorization behavior is undefined or wrong.
- Required verification for core behavior is missing.
- Suggested fix requires new business behavior.

## Result Rules

Use:

- `PASS`: no Critical or unaccepted High issue.
- `PASS_WITH_RISK`: High issue exists, risk acceptance is explicit, owner and follow-up are recorded.
- `FAIL`: any Critical issue, unaccepted High issue, or review cannot be completed safely.

## Earliest Affected Node

Route to:

| Finding | Route |
| --- | --- |
| Requirement unclear | `sdlc-requirement-normalizer` |
| Technical solution incomplete | `sdlc-specification-writer` |
| Solution risk or scope disputed | `sdlc-solution-reviewer` |
| Spec, plan, or tasks stale | relevant `sdlc-speckit-*` authoring skill |
| Implementation deviates from approved tasks | `sdlc-speckit-implement` or direct implementation owner |
| Implementation record missing or stale | `sdlc-implementation-recorder` |
| Review output needs DocFlow report | `sdlc-code-review-normalizer` |
| Review checklist gap discovered | `sdlc-test-feedback-sync` or standard governance |

## Risk Acceptance

`PASS_WITH_RISK` requires:

- Accepted risk.
- Accepted by.
- Reason.
- Follow-up owner.
- Follow-up deadline or trigger.

Do not accept Critical risk inside code review.
