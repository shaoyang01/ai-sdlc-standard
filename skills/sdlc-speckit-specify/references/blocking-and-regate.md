# Blocking And Re-Gate Rules

## Blocking Conditions

Stop when:

- Solution review is missing.
- Solution review result is `FAIL`.
- Solution review result is `PASS_WITH_RISK` without complete risk acceptance.
- Development Path Decision is `BLOCKED_NEEDS_REVISION`.
- Development Path Decision is `DIRECT_IMPLEMENTATION` and full SDD was not explicitly requested.
- Technical specification has unresolved core ambiguity.
- Current artifacts are stale.
- Sync would require reinterpreting business scope.

## Re-Gate Required

Return to DocFlow when:

- Scope changes.
- Behavior constraints change.
- Failure, exception, timeout, retry, idempotency, or transaction behavior changes.
- Data source, state transition, API, DB, cache, MQ, schedule, or listener behavior changes.
- Acceptance criteria change.
- Required Actions from `sdlc-solution-reviewer` are unresolved.

## Output When Blocked

Report:

- Blocking reason
- Affected node
- Required artifact update
- Required Gate
- Recommended next skill

Use:

- `sdlc-specification-writer` for technical specification revisions.
- `sdlc-solution-reviewer` for renewed Specification Gate.
- `sdlc-gate-runner` for checking readiness after updates.
