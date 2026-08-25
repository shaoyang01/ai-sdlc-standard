# Item Generation Rules

## Item Shape

Each checklist item must include:

- `id`: stable local ID, such as `CHK-001`.
- `stage`: target stage.
- `check`: action-oriented inspection statement.
- `source`: source artifact path and section.
- `evidence`: expected proof.
- `severity`: `Critical`, `High`, `Medium`, or `Low` if missing.
- `owner`: responsible skill or Gate.
- `status`: `open`, `checked`, `blocked`, or `not_applicable`.

## Allowed Item Sources

Generate items from:

- Approved DocFlow technical specification.
- Approved solution review findings.
- Current `specs/{feature}/spec.md`.
- Current `specs/{feature}/plan.md`.
- Current `specs/{feature}/tasks.md`.
- Accepted risk records.
- Existing standard checklist files under `checklists/`.
- Verified implementation, review, or test evidence when generating post-implementation checklists.

## Prohibited Items

Do not generate items that:

- Add new business behavior.
- Add new acceptance criteria.
- Add new API, DB, MQ, cache, schedule, listener, or state behavior not in approved artifacts.
- Change rollback, retry, idempotency, transaction, compatibility, or failure policy.
- Require implementation outside approved tasks.
- Treat a review or test suggestion as accepted scope without Re-Gate.

## Traceability Rule

Every item must trace to at least one current source artifact.

When a useful item has no source:

- Mark it as `blocked`.
- Route to the earliest affected upstream node.
- Do not include it as executable checklist scope.

## Severity Guidance

Use:

- `Critical`: missing item blocks safe Gate or implementation.
- `High`: missing item affects core behavior, compatibility, or verification.
- `Medium`: missing item affects completeness but can be deferred with acceptance.
- `Low`: missing item is informational or non-blocking.
