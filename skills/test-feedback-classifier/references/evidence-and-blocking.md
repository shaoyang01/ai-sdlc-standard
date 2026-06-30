# Evidence And Blocking Rules

## Required Evidence

Each failed item should include:

- Observed behavior
- Expected behavior
- Reproduction steps or trigger condition
- Environment
- Test data or account context when relevant
- Evidence: screenshot, log, request/response, SQL result, or tester note
- Related artifact basis when available

## Missing Evidence

Record missing evidence as:

- Missing observed behavior
- Missing expected behavior
- Missing reproduction steps
- Missing environment
- Missing data sample
- Missing specification basis
- Missing implementation record
- Missing code review result

Missing observed behavior or expected behavior is blocking.

## Blocking Conditions

Block classification or mark report as `FAIL` when:

- Raw feedback is missing.
- Failed case lacks observed behavior.
- Expected behavior cannot be identified from source or user confirmation.
- Classification would require guessing business intent.
- Core path failure has no reproduction evidence.
- Specification Missing is detected but no Re-Gate path is recorded.
- Requirement Change is detected but no change-control decision is recommended.
- Release impact is unknown for a blocking failure.

## Non-Blocking Conditions

Continue with explicit notes when:

- Optional screenshot is missing but logs and reproduction are enough.
- Environment issue is isolated and not release-blocking.
- Test case issue is clear from approved specification.
- A passed case lacks detailed evidence but does not affect failed classification.

## Risk Acceptance

`PASS_WITH_RISK` requires:

- Accepted Risk
- Accepted By
- Reason
- Follow-up

Do not infer risk acceptance from informal wording.

## Re-Gate Evidence

When Re-Gate is required, record:

- Trigger
- Affected node
- Required new artifact
- Required Gate
- Current blocking reason
- Next owner

Do not claim the requirement can continue until the required Re-Gate passes.
