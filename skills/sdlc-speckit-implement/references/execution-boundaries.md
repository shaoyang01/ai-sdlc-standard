# Execution Boundaries

## Allowed Side Effects

Allowed when traceable to approved tasks:

- Modify production code for listed tasks.
- Add or update tests required by listed tasks.
- Update configuration, migrations, scripts, or docs only when listed or required by plan.
- Update `specs/{feature}/tasks.md` task status for completed and verified tasks.
- Generate or recommend `library/{requirement_id}/03-实现记录/*`.
- Recommend manifest Activity Log updates.

## Blocked Side Effects

Stop and route upstream when implementation would:

- Add behavior outside `tasks.md`.
- Change Scope or acceptance criteria.
- Change API, DB, cache, MQ, schedule, listener, state, transaction, rollback, or compatibility behavior beyond approved plan.
- Replace required tests with assumptions.
- Hide a failing test or compile error.
- Revert unrelated local changes.
- Sync knowledge into `.specify/business_domain/**`.
- Treat implementation as Code Review or Test Acceptance.

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
