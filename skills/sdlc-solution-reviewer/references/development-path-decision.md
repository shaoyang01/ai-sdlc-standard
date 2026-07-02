# Development Path Decision

## Recommendations

Output exactly one value:

- `DIRECT_IMPLEMENTATION`
- `SPECKIT_PIPELINE_REQUIRED`
- `BLOCKED_NEEDS_REVISION`

Before choosing the recommendation, classify Complexity using `${AI_SDLC_STANDARD_HOME}/ai-sdlc/complexity-routing.md`:

- `SIMPLE`
- `MEDIUM`
- `COMPLEX`
- `BLOCKED_UNKNOWN`

Record Complexity Triggers and Full SDD Override in the review output and manifest recommendation.

## Delta Change Mode

When the reviewed specification is a Requirement Supplement, Requirement Change,
Rework, Specification Missing, or Feedback-Driven Change, first decide:

```text
Decision Scope: FULL_REQUIREMENT / DELTA_CHANGE
```

If Decision Scope = `DELTA_CHANGE`, output:

- Same Requirement Decision
- Delta Complexity: SIMPLE / MEDIUM / COMPLEX / BLOCKED_UNKNOWN
- Aggregate Complexity: reference only
- Delta Complexity Triggers
- Ignored Aggregate Triggers
- Re-Gate Source
- Earliest Affected Node
- Re-Gate Records
- Current Change Scope / Delta Scope
- Aggregate Requirement Scope
- Original Implemented / Approved Scope
- Out of Delta Scope

Rules:

- Development Path Decision must be based on Delta Scope.
- Do not route by aggregate complexity for requirement supplements.
- Aggregate Requirement Scope is context only.
- Original DB/MQ/schedule/multi-module/business_domain triggers must be listed as Ignored Aggregate Triggers unless the Delta Scope itself changes them.
- If Delta Scope itself adds DB schema, MQ, schedule, key data writes, cross-module work, state machine changes, or long-term knowledge sync, Delta Complexity may be COMPLEX.
- If the Delta Scope is a missing judgment, field mapping, boundary rule, validation condition, copy text, local query condition, or local compatibility rule, and the 1.1.0 technical specification plus review covers it, default to DIRECT_IMPLEMENTATION.
- If Delta Scope affects behavior but the technical specification has no updated version, use BLOCKED_NEEDS_REVISION and set Earliest Affected Node to `01-技术方案`.
- If the solution review does not cover the new Delta Scope, use BLOCKED_NEEDS_REVISION or require a new `02-方案审核`.
- Do not output SPECKIT_PIPELINE_REQUIRED just because the original full requirement was COMPLEX.

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

For Decision Scope = `DELTA_CHANGE`, these triggers must come from Delta Complexity Triggers, not from Aggregate Complexity.

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
- Decision Scope = `DELTA_CHANGE` and the Current Change Scope / Delta Scope is SIMPLE or MEDIUM, reviewed, and does not itself trigger full SDD.

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
