# Clarification Scope

## Allowed Clarifications

Allowed only when they do not change approved behavior:

- Terminology consistency.
- Non-core wording clarification.
- Acceptance wording copied from approved artifacts.
- Local test boundary note.
- Traceability note linking SpecKit spec to DocFlow artifacts.
- Clarification already answered by `01-技术方案` or `02-方案审核`.

## Blocked Clarifications

Do not clarify inside Speckit when the answer would affect:

- In Scope / Out of Scope.
- Original-flow compatibility.
- State transition.
- Data source.
- DB, cache, MQ, API, schedule, or listener behavior.
- Failure, timeout, exception, retry, idempotency, or transaction strategy.
- Acceptance criteria.
- Development path decision.

Return these to DocFlow Re-Gate.

## User Answers

If the user provides a new answer during clarify:

- Use it only if it does not change approved scope or behavior.
- If it changes scope or behavior, record it as Requirement Change or Specification Missing and return to DocFlow.

## Assumptions

Do not add assumptions for core business behavior.

Use `Deferred non-blocking` only when the item does not affect plan, tasks, implementation, tests, or release.
