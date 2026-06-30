# Deviation And Blocking Rules

## Deviation Types

| Type | Use When | Required Action |
| --- | --- | --- |
| Implementation Bug | Code does not follow an approved specification. | Fix code and update implementation record. |
| Specification Missing | Code needed behavior not defined by the specification. | Return to `01-技术方案` and rerun solution review. |
| Requirement Change | User goal or scope changed during implementation. | Return to `00-需求资料` or `01-技术方案` and Re-Gate. |
| Documentation Correction | Record wording or path correction only. | Update record or manifest activity; no Re-Gate if behavior unchanged. |
| Environment / Data Issue | Verification blocked by env, data, config, or permission. | Record blocker and whether release is blocked. |

## Blocking Conditions

Block readiness for Code Review when:

- Changed file list or diff is missing.
- Behavior-changing implementation has no specification basis.
- Implementation contradicts an approved Gate decision.
- Implementation added out-of-scope behavior.
- Required verification failed.
- Required verification did not run and no accepted reason exists.
- Undefined behavior was implemented instead of escalated.
- Transaction, idempotency, retry, timeout, state, or data-source behavior is changed without specification.

## Non-Blocking Conditions

Continue with explicit notes when:

- Only comments, formatting, or documentation changed.
- A non-critical optional verification was skipped with a reason.
- Medium or Low TODO items remain and are documented.
- Manual validation substitutes for automated tests with a clear reason.

## Re-Gate Rules

Require Re-Gate when:

- Requirement goal or scope changed.
- Approved technical behavior changed.
- Failure or compatibility behavior changed.
- Data source, DB, cache, MQ, API, schedule, listener, or state transition changed outside the approved specification.
- Test feedback or implementation discovery reveals Specification Missing.

Use `ai-sdlc/change-control.md` to identify the earliest affected node.

## Code Review Readiness

`Ready for Code Review: yes` requires:

- No Critical blocker.
- No unclassified implementation/specification mismatch.
- Required verification passed or skipped with documented risk.
- Implementation record clearly maps changes to specification basis.

`Ready for Code Review: no` when any blocker remains.
