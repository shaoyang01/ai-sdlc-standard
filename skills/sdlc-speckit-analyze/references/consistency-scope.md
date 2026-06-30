# Consistency Scope

## Consistency Dimensions

Audit these dimensions across DocFlow, spec, plan, and tasks:

- Business goal and in-scope / out-of-scope boundary.
- Functional behavior and acceptance criteria.
- State transition and data lifecycle.
- API, DB, cache, MQ, schedule, listener, and external integration behavior.
- Failure, timeout, exception, retry, idempotency, transaction, rollback, and compatibility strategy.
- Observability, logging, metrics, alerting, rollout, and release support.
- Test strategy and verification task coverage.
- Accepted risks, deferred items, and Re-Gate decisions.
- Artifact currency and superseded status.

## Allowed Findings

Allowed findings include:

- Missing traceability.
- Inconsistent wording that changes implementation meaning.
- Plan item missing a task.
- Task missing approved plan basis.
- Acceptance criterion missing verification.
- Risk accepted in solution review but absent from plan or tasks.
- Superseded artifact still being used.
- Manifest state not matching current artifacts.

## Blocked Analysis Decisions

Return to upstream Re-Gate when resolving a finding would require:

- Changing approved Scope.
- Adding business behavior.
- Changing API, DB, cache, MQ, schedule, listener, state, transaction, rollback, or compatibility behavior.
- Changing acceptance criteria or test oracle.
- Adding implementation work not supported by spec and plan.
- Accepting or hiding a new risk.

## Earliest Affected Node

Route findings to the earliest affected node:

- Requirement meaning or business goal issue -> `00-需求资料` or `01-技术方案`.
- Technical specification issue -> `01-技术方案`.
- Solution review gap or unaccepted risk -> `02-方案审核`.
- SpecKit spec mismatch -> `sdlc-speckit-specify`.
- Residual ambiguity -> `sdlc-speckit-clarify`.
- Technical plan issue -> `sdlc-speckit-plan`.
- Task breakdown issue -> `sdlc-speckit-tasks`.

Do not route all findings to implementation. Implementation starts only after Analyze Gate passes.
