# Finding Standards

## Finding Shape

Every actionable finding must include:

- `ID`
- `Severity`: Critical, High, Medium, Low, or Note
- `Category`
- `File`
- `Line or Symbol`
- `Specification Basis`
- `Problem`
- `Impact`
- `Suggested Fix`
- `Blocking`: yes or no

## Severity Rules

Use `Critical` when:

- Code violates approved core behavior.
- Data corruption, security exposure, or severe production incident risk exists.
- Implementation changes existing flow without approval.
- Transaction, idempotency, or rollback failure can break core business.

Use `High` when:

- Important behavior is incomplete or risky.
- Compatibility, data consistency, or verification risk is significant.
- A required test or validation for core behavior is missing.

Use `Medium` when:

- Issue affects maintainability, observability, or edge behavior but has bounded impact.
- Test coverage is incomplete for non-core paths.

Use `Low` when:

- Issue is minor and actionable.

Use `Note` for:

- Learning comments.
- Non-blocking suggestions.
- Praise or neutral observations.

## Evidence Rules

Do not create a finding without code or artifact evidence.

Behavioral findings require:

- File, line, or symbol.
- Specification basis.
- Impact tied to approved behavior.

When evidence is incomplete:

- Record Missing Information.
- Avoid blocking unless the missing information itself blocks review confidence.

## Suggestion Boundaries

Suggestions must not:

- Add new business behavior.
- Change accepted scope.
- Require unapproved schema, API, or state behavior.
- Convert reviewer preference into mandatory work.

When a suggestion implies new scope, route to Re-Gate instead of labeling it as a normal fix.
