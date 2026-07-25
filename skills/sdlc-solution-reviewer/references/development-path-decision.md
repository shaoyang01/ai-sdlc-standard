# Development Path Decision

## Canonical 路径决定规则

Development Path 只由 Current Implementation Scope 或 Delta Scope 自身的复杂度决定。business_domain_sync need 本身不自动触发 `SPECKIT_PIPELINE_REQUIRED`；knowledge sync need、stable business fact recording、significant documentation sync、更新 `.specify/business_domain/**`、entry coverage need 或 Shared Tail 工作本身都不是 Speckit 触发因素，也不是 Direct Implementation 的排除条件。

允许 `SPECKIT_PIPELINE_REQUIRED` 的条件只有：

1. Current Implementation Scope 或 Delta Scope 本身为 `COMPLEX`；
2. Full SDD Override = `user_requested`；
3. 当前有效的后续 Gate 要求切换路径：Full SDD Override = `later_gate_required`。

## Compatibility-Read 边界（Legacy Recommendation）

历史 artifact 中的 `Development Path Recommendation` 只允许 compatibility-read：读取时解释为对应的 canonical `Development Path Decision`。新写 response、Markdown artifact、Manifest recommendation 和示例不得输出旧字段，不得双写 Recommendation 和 Decision，不要求迁移或重写历史 artifact。

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
- If Delta Scope itself adds DB schema, MQ, schedule, key data writes, cross-module work, or state machine changes, Delta Complexity may be COMPLEX.
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
- Tasks can be safely derived directly from the technical specification.
- Decision Scope = `DELTA_CHANGE` and the Current Change Scope / Delta Scope is SIMPLE or MEDIUM, reviewed, and does not itself trigger full SDD.

Direct Implementation 不排除需要 business_domain_sync 或知识沉淀评估的实现；这些需求在实现后的 Shared Documentation Governance Tail 中处理，不影响路径选择。

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

- For Decision Scope = `FULL_REQUIREMENT`, prefer `SPECKIT_PIPELINE_REQUIRED` if the change touches state, data consistency, MQ, DB, scheduler, or multiple modules.
- For Decision Scope = `DELTA_CHANGE`, only the Current Change Scope / Delta Scope may trigger `SPECKIT_PIPELINE_REQUIRED`. Original Aggregate Requirement Scope DB/MQ/scheduler/multi-module evidence must be listed as Ignored Aggregate Triggers and must not alone trigger `SPECKIT_PIPELINE_REQUIRED`. Prefer `SPECKIT_PIPELINE_REQUIRED` only when the delta itself is complex (e.g., the delta adds DB schema, MQ, schedule, key data writes, cross-module work, or state machine changes).
- Prefer `BLOCKED_NEEDS_REVISION` if uncertainty is about business behavior.
- Prefer `DIRECT_IMPLEMENTATION` only if uncertainty is non-core and documented as a residual risk.
- Prefer `BLOCKED_NEEDS_REVISION` if complexity cannot be classified from current evidence.
