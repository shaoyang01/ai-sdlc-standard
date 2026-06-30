# Plan Gate Check

## Coverage Categories

Check the plan for:

- Fidelity to `specs/spec.md`.
- No approved Scope change.
- Affected modules and files.
- Data, state, DB, cache, MQ, API, schedule, and listener impact.
- Transaction boundaries.
- Failure, timeout, exception, retry, idempotency, and rollback behavior.
- Compatibility with original flow.
- Observability, logging, metrics, and alerts.
- Verification strategy mapped to acceptance criteria.
- Risks and mitigations.

## Status Values

Use:

- `Clear`: covered and consistent.
- `Resolved`: prior planning uncertainty resolved within approved scope.
- `Deferred non-blocking`: not required before tasks or implementation.
- `Blocking`: affects implementation readiness or approved behavior.

## Blocking Conditions

Block when:

- Plan conflicts with `specs/spec.md`.
- Plan changes approved business behavior.
- Plan introduces undefined business rule.
- Plan omits core exception, rollback, compatibility, or verification strategy.
- Plan cannot support acceptance criteria.
- Plan requires changing API, DB, cache, MQ, schedule, listener, state, transaction, or data behavior not already approved.
- Accepted risk is missing, contradicted, or not traceable.

## Output

Summarize coverage in a compact table with category, status, evidence, and action.

Recommend `sdlc-speckit-tasks` only when there are no Blocking items.
