# Development Path Decision

## Recommendations

Output exactly one value:

- `DIRECT_IMPLEMENTATION`
- `SPECKIT_PIPELINE_REQUIRED`
- `BLOCKED_NEEDS_REVISION`

Before choosing the recommendation, classify Complexity using `../../../ai-sdlc/complexity-routing.md`:

- `SIMPLE`
- `MEDIUM`
- `COMPLEX`
- `BLOCKED_UNKNOWN`

Record Complexity Triggers and Full SDD Override in the review output and manifest recommendation.

## BLOCKED_NEEDS_REVISION

Use when:

- Gate Result is `FAIL`.
- Any Critical issue exists.
- Any High issue exists without explicit risk acceptance.
- Requirement boundary is unclear.
- Core behavior requires guessing.
- Compatibility with the original flow is undefined.
- Failure, timeout, exception, idempotency, transaction, or state handling is undefined.
- Test strategy cannot validate the core requirement.
- Complexity is `BLOCKED_UNKNOWN`.

Next step:

```text
Return to 01-技术方案, create a new version, then re-run sdlc-solution-reviewer.
```

## SPECKIT_PIPELINE_REQUIRED

Use when the specification is reviewable and continuing is allowed, but full SDD is valuable or necessary.

Typical triggers:

- Multi-module or cross-repository implementation.
- New flow or large existing-flow change.
- State machine changes.
- DB schema, important data writes, or migration.
- MQ producer/consumer/retry/idempotency changes.
- Listener, schedule, process, or async task changes.
- Complex rollback or compatibility requirements.
- Significant code/doc sync requirement.
- Need to update `.specify/business_domain/**`.
- User explicitly requests full SDD.

Complexity:

- Default for `COMPLEX`.
- Allowed for `SIMPLE` or `MEDIUM` only when the user explicitly requests full SDD or a later Gate requires switching paths.

Allowed Gate Results:

- `PASS`
- `PASS_WITH_RISK` with risk acceptance

Next step:

```text
Ask for user confirmation, then invoke sdlc-speckit-pipeline.
```

## DIRECT_IMPLEMENTATION

Use when:

- Gate Result is `PASS` or accepted `PASS_WITH_RISK`.
- Complexity is `SIMPLE` or `MEDIUM`.
- Scope is narrow and well bounded.
- Technical specification fully defines behavior.
- No full SDD route is needed.
- Implementation does not require new domain knowledge sync.
- Tasks can be safely derived directly from the technical specification.

Typical examples:

- Small isolated code change.
- Clear bug fix with no behavior ambiguity.
- Simple configuration or validation change.
- Minor UI/API behavior already fully specified.

Next step:

```text
Proceed to implementation, then write 03-实现记录.
```

## Tie-Breaking Rules

When uncertain between direct implementation and Speckit:

- Prefer `SPECKIT_PIPELINE_REQUIRED` if the change touches state, data consistency, MQ, DB, scheduler, or multiple modules.
- Prefer `BLOCKED_NEEDS_REVISION` if uncertainty is about business behavior.
- Prefer `DIRECT_IMPLEMENTATION` only if uncertainty is non-core and documented as a residual risk.
- Prefer `BLOCKED_NEEDS_REVISION` if complexity cannot be classified from current evidence.
