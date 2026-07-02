# Plan Gate Check

## Coverage Categories

Check the plan for:

- Fidelity to `specs/{feature}/spec.md`.
- No approved Scope change.
- Affected modules and files.
- Data, state, DB, cache, MQ, API, schedule, and listener impact.
- Transaction boundaries.
- Failure, timeout, exception, retry, idempotency, and rollback behavior.
- Compatibility with original flow.
- Observability, logging, metrics, and alerts.
- Verification strategy mapped to acceptance criteria.
- Risks and mitigations.
- Companion artifacts: `research.md`, `data-model.md`, `contracts/`, and `quickstart.md` are produced or explicitly skipped with a complete skip record.
- Project-type contract coverage for backend/admin, frontend, ETL/data pipeline, or mixed projects.

## Status Values

Use:

- `Clear`: covered and consistent.
- `Resolved`: prior planning uncertainty resolved within approved scope.
- `Deferred non-blocking`: not required before tasks or implementation.
- `Blocking`: affects implementation readiness or approved behavior.

## Blocking Conditions

Block when:

- Plan conflicts with `specs/{feature}/spec.md`.
- Plan changes approved business behavior.
- Plan introduces undefined business rule.
- Plan omits core exception, rollback, compatibility, or verification strategy.
- Plan cannot support acceptance criteria.
- Plan requires changing API, DB, cache, MQ, schedule, listener, state, transaction, or data behavior not already approved.
- Accepted risk is missing, contradicted, or not traceable.
- Companion artifact is missing without `Artifact`, `Skip Reason`, `Risk`, `Impact`, `Accepted By`, and `Re-Gate Required`.
- `contracts/` is skipped while the feature changes API/RPC/MQ, frontend route/page/state/API, or ETL input/output/data lineage.

## Output

Summarize coverage in a compact table with category, status, evidence, and action.

Recommend `sdlc-speckit-tasks` only when there are no Blocking items.
