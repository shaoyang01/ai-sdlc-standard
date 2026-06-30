# Blocking And Scope Rules

## Missing Information

Mark Missing Information when:

- Reviewed diff or changed file list is missing.
- Finding lacks file location.
- Finding lacks line or symbol for an actionable code issue.
- Behavioral finding lacks specification basis.
- Suggested fix lacks enough detail to implement.
- Review source does not state whether the issue is blocking.

Missing Information can make the report not directly consumable.

## Out-Of-Scope Suggestions

Do not convert a suggestion into a required fix when it:

- Adds behavior not defined in the specification.
- Expands In Scope.
- Changes acceptance criteria.
- Introduces new API, DB, MQ, schedule, or state behavior not reviewed.
- Conflicts with Development Path Decision or solution review.

Route it as:

- Specification Missing, if the suggestion reveals a needed but missing behavior.
- Requirement Change, if it changes business scope.
- Low / non-blocking suggestion, if it is optional cleanup.

## Blocking Conditions

Block continuation when:

- Any Critical issue exists.
- Any High issue lacks explicit risk acceptance.
- Review identifies implementation outside approved scope.
- Suggested fix requires changing the technical specification.
- Review result conflicts with current Gate decision.
- Required code evidence is missing.

## Risk Acceptance

`PASS_WITH_RISK` requires:

- Accepted Risk
- Accepted By
- Reason
- Follow-up

Do not infer risk acceptance from informal wording.

## Re-Gate Triggers

Recommend Re-Gate when review findings show:

- Specification Missing
- Requirement Change
- Approved behavior needs revision
- Existing solution review no longer matches the implementation
- Code fix would require adding undefined behavior

Use `ai-sdlc/change-control.md` to identify the earliest affected node.

## Fix Routing

Use:

- `Fix implementation and update implementation record` for Implementation Bug.
- `Return to specification-writer and rerun solution-reviewer` for Specification Missing.
- `Apply change-control` for Requirement Change.
- `Run test-feedback-classifier` only after code review is passable or risk accepted.
