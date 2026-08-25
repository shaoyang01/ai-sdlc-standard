# Task Gate Check

## Coverage Categories

Check tasks for:

- Traceability to `specs/{feature}/spec.md`.
- Traceability to `specs/{feature}/plan.md`.
- Coverage of all acceptance criteria.
- Implementation coverage for planned modules and files.
- Data, state, DB, cache, MQ, API, schedule, and listener coverage.
- Failure, timeout, exception, retry, idempotency, transaction, rollback, and compatibility coverage.
- Test coverage mapped to acceptance criteria and risk.
- Observability, logging, metrics, rollout, and rollback support.
- Dependency order and parallelization.
- No undefined behavior or unapproved technical decision.

## Status Values

Use:

- `Clear`: covered and consistent.
- `Resolved`: prior task uncertainty resolved within approved plan.
- `Deferred non-blocking`: not required before implementation and explicitly safe to defer.
- `Blocking`: affects implementation readiness or approved behavior.

## Blocking Conditions

Block when:

- A core requirement has no implementation task.
- A core acceptance criterion has no verification task.
- A task is not traceable to spec or plan.
- A task requires changing approved Scope, plan, or behavior.
- A task introduces undefined business or technical behavior.
- A task conflicts with `specs/{feature}/spec.md`, `specs/{feature}/plan.md`, `01-技术方案`, or `02-方案审核`.
- Required dependency order is missing or impossible.
- Verification is missing for behavior-changing work.
- Accepted risk is missing, contradicted, or not traceable.

## Output

Summarize coverage in a compact table with category, status, evidence, and action.

Recommend `sdlc-speckit-analyze` only when there are no Blocking items.
