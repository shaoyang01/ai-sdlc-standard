# Coverage Check

## Coverage Categories

Check `specs/spec.md` against approved DocFlow sources for:

- Business goal
- In Scope / Out of Scope
- Original flow compatibility
- New behavior
- State transitions
- Data source
- Data changes
- API / DB / cache / MQ / schedule / listener impact
- Failure and exception behavior
- Idempotency, retry, timeout, transaction behavior
- Acceptance criteria
- Test strategy
- Accepted risks

## Status Values

Use:

- `Clear`: present and consistent.
- `Resolved`: previously unclear but answered by approved artifact.
- `Deferred non-blocking`: not required for plan/tasks/implementation/test.
- `Blocking`: affects core behavior or Gate readiness.

## Consistency Checks

Block when:

- `specs/spec.md` omits a required behavior from `01-技术方案`.
- `specs/spec.md` contradicts `02-方案审核`.
- Accepted risk is missing from SpecKit spec.
- Required Action from solution review is unresolved.
- A clarification would require changing approved artifacts.

## Output

Summarize coverage in a compact table with category, status, evidence, and action.
