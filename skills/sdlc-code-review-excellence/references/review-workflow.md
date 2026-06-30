# Review Workflow

## 1. Context Pass

Before line-level review:

- Read the requirement and approved scope.
- Identify files changed.
- Identify intended behavior and acceptance criteria.
- Identify explicit non-goals and compatibility requirements.
- Identify relevant risks, rollback, and verification requirements.

## 2. Scope And Traceability

Check whether changed code:

- Maps to approved tasks or implementation scope.
- Avoids unapproved behavior.
- Preserves out-of-scope behavior.
- Updates only expected modules, configuration, tests, and documents.

Classify scope violations as blocking.

## 3. Behavioral Review

Inspect:

- Normal path.
- Empty, null, missing, duplicate, and boundary inputs.
- Failure and timeout behavior.
- Retry and idempotency behavior.
- Transaction and rollback behavior.
- Existing flow compatibility.

## 4. Data And Integration Review

Inspect:

- DB writes and reads.
- Cache behavior.
- MQ, schedule, listener, or async behavior.
- API contracts and DTO compatibility.
- State transitions.
- Data visibility and authorization.

## 5. Operational Review

Inspect:

- Logs and correlation fields.
- Metrics and alerts.
- Error messages and diagnosability.
- Migration, backfill, rollout, and rollback needs.
- Performance impact in hot paths.

## 6. Test Review

Inspect:

- Unit, integration, or regression tests.
- Coverage of normal, boundary, failure, and compatibility cases.
- Determinism and maintainability of tests.
- Verification commands and results.

Missing tests for behavior-changing code should usually be at least Medium, and High when core behavior or rollback depends on it.

## 7. Maintainability Review

Inspect:

- Fit with existing project patterns.
- Simplicity of control flow.
- Duplication that creates maintenance risk.
- Naming and comments only when they affect correctness or maintainability.

Avoid blocking on preference-only style comments.
