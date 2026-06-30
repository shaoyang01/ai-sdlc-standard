# Specification Writer Blocking Rules

## Stop Instead of Guessing

Stop when:

- Requirement source is missing or unreadable.
- Business goal cannot be identified.
- In Scope or Out of Scope is unclear.
- Multiple conflicting sources have no priority.
- Original-flow compatibility is unknown.
- Behavior constraints require guessing.
- State transition has multiple reasonable interpretations.
- Data source or empty-data behavior is unknown and affects core logic.
- Failure, timeout, exception, retry, idempotency, or transaction behavior is unknown.
- Acceptance criteria cannot be tested.

## Mark as Pending Instead of Blocking

Use `待确认事项` when:

- The missing detail does not block the core specification.
- The detail can be safely decided during implementation without changing business behavior.
- The detail is a logging, naming, monitoring, or documentation refinement.

## Do Not Hide Uncertainty

Avoid phrases like:

- "按常规处理"
- "默认兼容"
- "异常正常抛出"
- "后续实现时决定"

Unless the requirement explicitly says so, these phrases hide decisions that `sdlc-solution-reviewer` must audit.

## Change-Control Cases

When working on a changed or reworked requirement:

- Do not overwrite old versions.
- Generate a new `vN`.
- Identify the earliest affected node.
- Recommend Re-Gate through `sdlc-solution-reviewer`.
