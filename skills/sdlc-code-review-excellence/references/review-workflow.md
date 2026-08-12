# Review Workflow

## 1. Context Pass

Before line-level review:

- Read the requirement and approved scope.
- Identify files changed.
- Identify intended behavior and acceptance criteria.
- Identify explicit non-goals and compatibility requirements.
- Identify relevant risks, rollback, and verification requirements.

Then anchor the current goal and build the global model before any detailed
review (per `${AI_SDLC_STANDARD_HOME}/ai-sdlc/goal-anchored-global-reasoning.md`,
sections 1, 2 and 7):

- State current goal, Scope (in/out), non-goals, and acceptance from the requirement and approved artifacts.
- Enumerate the frozen applicable material surfaces per the shared reference (section 7); mark each surface as applicable or `NOT_APPLICABLE` (不涉及).
- Local examples here defer to the shared surface list; they never narrow it.
- Only then start the detailed review (scope and traceability, behavioral, data and integration, operational, test, maintainability).

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

## 8. Impact Closure And Root-Cause Consolidation

Per `${AI_SDLC_STANDARD_HOME}/ai-sdlc/goal-anchored-global-reasoning.md`, for every material finding close its direct impacts before moving on:

- Caller / callee or dependency.
- Consumer.
- State / data.
- Failure / compatibility.
- Verification.

Then consolidate findings to the root cause: same-root manifestations merge into one finding; closing the root cause, not each surface symptom. A blocking issue does not end the review of the remaining reliable bounded surfaces.
