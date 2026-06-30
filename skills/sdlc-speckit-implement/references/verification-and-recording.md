# Verification And Recording

## Verification Strategy

Select checks based on task scope:

- Compile or type check for affected modules.
- Unit tests for changed business logic.
- Integration tests for API, DB, MQ, schedule, listener, or external integration behavior.
- Regression tests for original-flow compatibility.
- Migration or rollback checks when data or schema behavior changes.
- Manual validation steps when automated tests are unavailable.

Run the narrowest meaningful checks first, then broader checks when risk or repository conventions require them.

## Required Verification Record

Record every check with:

- Command or manual step.
- Scope.
- Result: pass, fail, or skipped.
- Evidence or key output.
- Reason when skipped.
- Follow-up when failed.

## Data Cases

Record the data cases considered before implementation:

- Normal case.
- Empty or missing input case.
- Boundary case.
- Existing-flow compatibility case.
- Failure, timeout, retry, rollback, or idempotency case when applicable.

These cases do not need to be exhaustive, but they must be concrete enough to judge implementation intent.

## Implementation Record

Use or recommend `sdlc-implementation-recorder` after implementation.

The implementation record should include:

- Requirement ID.
- Source spec, plan, tasks, and Analyze Gate.
- Completed task IDs.
- Changed files.
- Verification results.
- Deviations from plan, if any.
- Unfinished tasks.
- Residual risks.
- Next step.

## Failed Or Skipped Verification

If verification fails:

- Stop the completed-state claim.
- Record failing command and key failure.
- Fix only when the fix is inside approved tasks.
- Route upstream when the fix requires new behavior or plan change.

If verification cannot run:

- Record the reason.
- Identify the smallest recommended verification step.
- Do not claim full implementation readiness without accepted risk.
