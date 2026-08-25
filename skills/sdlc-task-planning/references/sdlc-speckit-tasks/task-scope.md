# Task Scope

## Allowed Task Types

Allowed when traceable to approved spec and plan:

- Implementation tasks for planned modules, files, methods, APIs, jobs, listeners, data access, or integration points.
- Verification tasks mapped to acceptance criteria.
- Unit, integration, regression, compatibility, migration, and manual validation tasks required by the plan.
- Documentation, configuration, observability, rollback, cleanup, and release-support tasks required by the plan.
- Sequencing tasks that clarify dependencies between planned work items.

## Blocked Task Decisions

Return to upstream Re-Gate when a task would define or change:

- In Scope / Out of Scope.
- Original-flow compatibility.
- State transition.
- Data source or write behavior.
- DB schema, cache, MQ, API, schedule, listener, or external integration contract beyond approved plan.
- Failure, timeout, exception, retry, idempotency, transaction, or rollback semantics.
- Acceptance criteria, test oracle, or release condition.
- Development Path Decision.

## Task Quality Rules

Every task must include:

- Stable task ID, such as `T001`.
- Imperative action.
- Target file, module, artifact, or subsystem.
- Source trace to spec, plan, or DocFlow section.
- Dependency or parallelization note.
- Verification method.

Prefer small tasks that can be implemented and reviewed independently.

Avoid tasks that are:

- Vague, such as "handle edge cases" without target and source trace.
- Purely aspirational, such as "improve quality".
- Duplicated across modules without distinguishing scope.
- Missing verification for behavior-changing work.
- Mixing implementation, test, and documentation work into one unreviewable item.

## Relationship To Implementation

Do not modify production code in this skill.

Use `sdlc-speckit-implement` after Task Gate and cross-artifact analysis pass.

The task list may specify intended files or modules, but it must not contain code patches.
