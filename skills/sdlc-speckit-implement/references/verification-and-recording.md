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

## Process Product Recording

Use `references/process-products.md` when implementation evidence needs a
new-rail process product.

Record frontend and React Native implementation details in
`specs/{feature}/implementation.md` when route, page, component, store, API
client, popup, state, visibility, backend/mock boundary, or visual behavior is
changed.

Record pipeline status in `specs/{feature}/workflow-status.md` only as a
machine-side snapshot. manifest.md is the status authority; if the snapshot
disagrees with manifest, record the drift instead of changing status from the
snapshot.

Record debugging instructions in `specs/{feature}/debug-guide.md` when API
debug, quick debug reference, mock/real data switching, or reproduction steps
are needed.

Record logging, metrics, frontend analytics, error state observation, and debug
logs in `specs/{feature}/observability.md` when observability behavior is part
of implementation or support.

Use `library/{requirement_id}/04-交付总结/{requirement_id}__交付总结.md` for the
final human-facing delivery summary when final scope, verification result,
residual risk, release note, rollback note, or next owner must be handed off.

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
