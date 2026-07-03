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
- Companion artifacts: `research.md`, `data-model.md`, `contracts/`, and `quickstart.md` are produced or explicitly skipped with a complete skip record (`Artifact`, `Project Type Profile`, `Skip Reason`, `Risk`, `Impact`, `Accepted By`, `Re-Gate Required`).
- Project-type contract coverage: contracts under `specs/{feature}/contracts/` cover each relevant contract artifact defined in `${AI_SDLC_STANDARD_HOME}/skills/sdlc-speckit-plan/references/project-type-contract-matrix.md` for the feature's project type profiles.

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
- Companion artifact is missing without `Artifact`, `Project Type Profile`, `Skip Reason`, `Risk`, `Impact`, `Accepted By`, and `Re-Gate Required`.
- `contracts/` is skipped while the feature changes a contract surface listed in the project-type contract matrix for the feature's project type profiles.
- A contract artifact in the matrix is required by the feature but not covered by any contract file under `specs/{feature}/contracts/` and no skip record exists for that specific contract.
- A Deferred artifact has no accepted risk or no Re-Gate Required flag.

## Output

Summarize coverage in a compact table with category, status, evidence, and action.

Recommend `sdlc-speckit-tasks` only when there are no Blocking items.
