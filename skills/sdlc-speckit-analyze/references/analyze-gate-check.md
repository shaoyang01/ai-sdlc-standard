# Analyze Gate Check

## Coverage Categories

Check for:

- Current artifact set and stale status.
- Solution Review pass or accepted risk.
- Spec to DocFlow consistency.
- Plan to spec consistency.
- Tasks to plan consistency.
- Acceptance criteria to verification task coverage.
- Risk propagation from review to plan and tasks.
- Data, state, DB, cache, MQ, API, schedule, listener, and integration consistency.
- Failure, retry, idempotency, transaction, rollback, and compatibility consistency.
- Manifest Development Path Decision and Activity Log consistency.
- Implementation readiness.
- Entry coverage reports when `.specify/entry-coverage-profile.yaml` exists.

## Entry Coverage Audit

When the target repository has `.specify/entry-coverage-profile.yaml`, run or require the standard runner before marking Analyze clear:

```bash
${AI_SDLC_STANDARD_HOME}/scripts/audit-entry-coverage.rb <target-project-path>
```

Read:

- `.specify/reports/entry_coverage/entry_coverage_report.md`
- `.specify/reports/entry_coverage/unarchived_entries.md`
- `.specify/reports/entry_coverage/unarchived_services.md`
- `.specify/reports/entry_coverage/cross_domain_conflicts.md`

Treat `BLOCKED`, non-empty unarchived reports, or non-empty conflict reports as Analyze Gate blocking unless the project profile records an explicit accepted exception.

## Status Values

Use:

- `Clear`: covered and consistent.
- `Resolved`: prior inconsistency resolved with traceable evidence.
- `Deferred non-blocking`: explicitly safe to defer until implementation or later Gate.
- `Blocking`: prevents implementation readiness.

## Blocking Conditions

Block when:

- Current artifacts conflict.
- A required artifact is missing or stale.
- `02-方案审核`, Plan Gate, or Task Gate is failed or unresolved.
- `PASS_WITH_RISK` lacks accepted risk evidence.
- A task requires behavior not in spec or plan.
- A plan item has no task and affects implementation.
- An acceptance criterion has no verification path.
- Failure, rollback, compatibility, or data behavior differs across artifacts.
- Manifest state points to stale or stale or replaced artifacts.
- Implementation would require guessing.

## Output

Summarize coverage in a compact table with category, status, evidence, earliest affected node, and action.

Recommend `sdlc-speckit-implement` only when there are no Blocking items.
