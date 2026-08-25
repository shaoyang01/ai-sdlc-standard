# Finding Mapping Rules

## Required Finding Fields

Every actionable finding must include:

- ID
- Severity
- File
- Line or Symbol
- Specification Basis
- Problem
- Impact
- Suggested Fix
- Blocking: yes/no

If any field is missing, preserve the finding but mark the missing field explicitly.

## Severity Rules

### Critical

Use Critical when:

- Code violates approved behavior constraints.
- Original flow compatibility is broken.
- Data may be corrupted, duplicated, lost, or written to the wrong state.
- State transition is wrong or undefined.
- Transaction, idempotency, retry, timeout, or exception behavior can break the core path.
- Security issue exposes data or permission risk.
- Core tests would fail or cannot validate the requirement.

### High

Use High when:

- Failure branch does not follow the specification.
- Data source or empty-data behavior is wrong.
- Important compatibility behavior is missing.
- Required monitoring, logging, rollback, or compensation is absent for risky behavior.
- Test coverage misses a required branch.

### Medium

Use Medium when:

- Non-core logs or metrics are incomplete.
- Maintainability issue can slow later changes.
- Test coverage is useful but not release-blocking.
- Documentation or implementation record needs clarification.

### Low

Use Low when:

- Naming, comments, formatting, or local simplification is suggested.
- The issue has no behavior impact and no release risk.

## Category Mapping

Map findings to these report sections:

- Architecture
- Behavior Compatibility
- Data Consistency
- Transaction and Idempotency
- Exception Handling
- Performance
- Security
- Maintainability
- Test Gap
- Suggested Fixes

One finding may appear in a severity table and be summarized under one category section.

## Blocking Flag

Set `Blocking: yes` when:

- Severity is Critical.
- Severity is High without complete risk acceptance.
- Suggested fix requires Re-Gate before implementation.

Set `Blocking: no` when:

- Severity is Medium or Low.
- High risk is explicitly accepted with follow-up.
