# Risk And Re-Gate Rules

## PASS_WITH_RISK

`PASS_WITH_RISK` is valid only when all fields exist:

- Accepted Risk
- Accepted By
- Reason
- Follow-up

If any field is missing, downgrade the Gate check result to `FAIL`.

Do not infer acceptance from casual language such as "先这样", "问题不大", or "后面再看" unless the user explicitly accepts the risk and the manifest records who accepted it.

## Risk Severity

Use `PASS_WITH_RISK` only for accepted High issues.

Do not allow `PASS_WITH_RISK` for Critical issues.

Medium and Low issues do not require risk acceptance, but must be recorded as TODO or follow-up notes.

## Superseded Artifact Checks

Read `Superseded Artifacts` before accepting a Gate result.

Block continuation when:

- Artifact Index points to a superseded artifact.
- Gate Decisions refer to a superseded artifact.
- The newest artifact has no corresponding required Gate.
- The user wants to continue based on an older passed Gate after a newer version exists.

Allow continuation when:

- Superseded entries only describe older versions.
- Artifact Index points to the new effective artifact.
- Required Re-Gate result exists and passes.

## Re-Gate Triggers

Require Re-Gate when Change History contains open or unresolved entries affecting:

- Requirement goal, scope, or success criteria
- Behavior constraints
- Failure, timeout, exception, retry, idempotency, or transaction behavior
- Data source, DB, cache, MQ, API, or state transition
- Development path decision
- Implementation scope
- Test feedback classified as Specification Missing

## Re-Gate Evidence

A valid Re-Gate record must include:

- Date
- Trigger
- From Node
- Required Gate
- Gate Artifact
- Result
- Next Step

The result must be `PASS` or valid `PASS_WITH_RISK` to continue.

## Change Classifications

Treat these classifications as potentially blocking:

- Requirement Change
- Specification Missing
- Review Missing
- Implementation Bug

Treat these as non-blocking only when the manifest says they are resolved or not release-blocking:

- Test Case Issue
- Environment / Data Issue
- Documentation Correction

## Next Step Rules

Use:

- `Return to sdlc-requirement-normalizer` when the goal or scope changed.
- `Return to sdlc-specification-writer` when the technical specification is missing or outdated.
- `Run sdlc-solution-reviewer` when specification content changed and needs a new Specification Gate.
- `Continue to direct implementation` only when the Development Path Decision is `DIRECT_IMPLEMENTATION` and the Gate passes.
- `Run sdlc-speckit-pipeline` when the Development Path Decision is `SPECKIT_PIPELINE_REQUIRED`.
- `Resolve blocking issues` when any Critical or unaccepted High remains.
