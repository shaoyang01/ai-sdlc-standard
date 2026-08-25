# Solution Review Checklist

## Severity Rules

### Critical

Mark Critical when:

- Requirement boundary is unclear.
- New behavior affects existing flow and fallback behavior is undefined.
- State transition is missing or contradictory.
- Failure strategy is missing for core behavior.
- Implementation requires guessing business logic.
- Core test path cannot be validated.
- Data correctness, duplicate execution, or status consistency could break.

Critical blocks continuation.

### High

Mark High when:

- Exception branch is missing.
- Retry, timeout, idempotency, or transaction boundary is unclear.
- Data source is unclear.
- Multiple reasonable implementation paths exist and the specification does not choose one.
- Compatibility risk exists but is not fully addressed.
- Key test scenarios are missing.

High blocks continuation unless the user explicitly accepts the risk.

### Medium

Mark Medium when:

- Logs or monitoring are incomplete but core behavior remains clear.
- Non-core tests are missing.
- Documentation needs more details but implementation is not blocked.
- Residual risks need follow-up.

Medium does not block, but must be tracked.

### Low

Mark Low for:

- Naming suggestions.
- Formatting issues.
- Minor comments.
- Non-core readability improvements.

Low does not block.

## Required Coverage

Check all items:

- Business background and goal are clear.
- In Scope and Out of Scope are explicit.
- Current flow is described.
- New flow is described.
- Trigger conditions are defined.
- Miss path keeps or changes original flow explicitly.
- Failure behavior is defined.
- Timeout behavior is defined.
- Exception propagation is defined.
- Retry and idempotency are defined.
- Transaction boundary is defined.
- Status changes are complete.
- Data sources and empty handling are defined.
- DB writes are defined when relevant.
- Cache impact is defined when relevant.
- MQ impact is defined when relevant.
- API/RPC contract impact is defined when relevant.
- Logs include troubleshooting fields.
- Monitoring or alerting is defined.
- Boundary conditions are covered.
- Tests cover main path, miss path, failure path, idempotency, and old-flow compatibility.
- Risks and residual risks are listed.
- Pending confirmations do not block implementation.

## Review Evidence

For each Critical or High issue, include:

- Location in the technical specification.
- Problem summary.
- Evidence from the specification.
- Impact.
- Required fix.
- Whether it blocks continuation.

Do not invent missing evidence.
