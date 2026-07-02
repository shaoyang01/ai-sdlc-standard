# Execution Boundaries

## Allowed Side Effects

Allowed when traceable to approved tasks:

- Modify production code for listed tasks.
- Add or update tests required by listed tasks.
- Update configuration, migrations, scripts, or docs only when listed or required by plan.
- Update `specs/{feature}/tasks.md` task status for completed and verified tasks.
- Mark completed task checkboxes or status fields only after verification.
- Generate or recommend `specs/{feature}/implementation.md` for implementation
  details, file changes, key technical decisions, and frontend state or
  interaction behavior.
- Generate or recommend `specs/{feature}/workflow-status.md` as a machine-side
  status snapshot only; manifest is status authority.
- Generate or recommend `specs/{feature}/debug-guide.md` for API debug, quick
  debug reference, mock or real data switching, and reproduction steps.
- Generate or recommend `specs/{feature}/observability.md` for logging, metrics,
  frontend analytics, error state observation, and debug logs.
- Generate or recommend `library/{requirement_id}/03-实现记录/*`.
- Generate or recommend `library/{requirement_id}/04-交付总结/*`.
- Recommend manifest Activity Log updates.

## Blocked Side Effects

Stop and route upstream when implementation would:

- Add behavior outside `tasks.md`.
- Rewrite task descriptions, task scope, task ordering, or acceptance mapping in `tasks.md`.
- Change Scope or acceptance criteria.
- Change API, DB, cache, MQ, schedule, listener, state, transaction, rollback, or compatibility behavior beyond approved plan.
- Replace required tests with assumptions.
- Hide a failing test or compile error.
- Revert unrelated local changes.
- Sync knowledge into `.specify/business_domain/**`.
- Treat implementation as Code Review or Test Acceptance.
- Write legacy process filenames as compatibility outputs.
- Use `specs/{feature}/workflow-status.md` to override manifest status.

## Code Editing Rules

Before editing code:

- Read nearby implementation patterns.
- Identify existing tests and fixtures.
- Model concrete data cases and edge cases.
- Prefer the smallest change that satisfies the approved task.
- Preserve existing behavior outside the approved task.

During editing:

- Keep task-to-change traceability.
- Avoid unrelated refactors.
- Avoid broad formatting churn.
- Add comments only where implementation intent would otherwise be unclear.
- Prefer existing helpers, abstractions, and conventions.

## Task Status Rules

Mark a task complete only when:

- The implementation change is made.
- Required tests or checks pass, or an accepted reason for skipping is recorded.
- The change remains within approved scope.
- The result can be explained in the implementation record.

Do not mark a task complete when verification failed or was not attempted without justification.
