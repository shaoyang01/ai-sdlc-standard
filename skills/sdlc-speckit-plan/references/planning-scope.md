# Planning Scope

## Allowed Planning Decisions

Allowed when traceable to approved spec behavior:

- Module and file ownership.
- Technical sequencing.
- Interface implementation approach without contract change.
- Data access strategy that matches approved data source and write behavior.
- Transaction, retry, idempotency, timeout, and rollback mechanics already implied by approved behavior.
- Logging, metrics, alerts, rollout, and verification details.
- Technical risks and mitigations.

## Blocked Planning Decisions

Return to DocFlow Re-Gate when a decision would change:

- In Scope / Out of Scope.
- Original-flow compatibility.
- State transition.
- Data source.
- DB schema, cache, MQ, API, schedule, or listener behavior beyond approved specification.
- Failure, timeout, exception, retry, idempotency, or transaction semantics.
- Acceptance criteria or test oracle.
- Development Path Decision.

## Risk Handling

Plan risks may include:

- Technical uncertainty.
- Migration sequencing.
- Rollout and rollback concerns.
- Observability gaps.
- Test environment constraints.

Plan risks must not hide:

- Undefined business behavior.
- Unaccepted product risk.
- Missing acceptance criteria.
- Incomplete failure strategy.

## Relationship To Tasks

Do not break down implementation tasks in this skill.

Use `sdlc-speckit-tasks` after Plan Gate passes.

The plan may identify work areas, but not produce executable task lists.
