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
- Entry coverage reports, which are mandatory before implementation readiness.
- Project Type Profiles and route artifact consistency.

## Entry Coverage Gate

Analyze Gate must run or require the standard runner before marking Analyze clear:

```bash
${AI_SDLC_STANDARD_HOME}/scripts/audit-entry-coverage.rb <target-project-path>
```

If `.specify/entry-coverage-profile.yaml` is missing, Analyze Gate Result is
`FAIL`; record the missing profile as a `BLOCKED` Blocking Item.

If only `.specify/entry-coverage-profile.candidate.yaml` exists, Analyze Gate
Result is `FAIL`; record Required Action status as `PENDING_CONFIRMATION` until
the candidate is reviewed and promoted to `.specify/entry-coverage-profile.yaml`.

Required Action:

```bash
${AI_SDLC_STANDARD_HOME}/scripts/bootstrap-entry-coverage-profile.sh --dry-run
${AI_SDLC_STANDARD_HOME}/scripts/bootstrap-entry-coverage-profile.sh
```

Full project bootstrap is also acceptable when the repository has not been
initialized at all.

Do not skip entry coverage audit because the profile is missing.

Read:

- `.specify/reports/entry_coverage/entry_coverage_report.md`
- `.specify/reports/entry_coverage/entry_inventory.tsv`
- `.specify/reports/entry_coverage/service_inventory.tsv`
- `.specify/reports/entry_coverage/entry_chain_evidence.md`
- `.specify/reports/entry_coverage/unarchived_entries.md`
- `.specify/reports/entry_coverage/unarchived_services.md`
- `.specify/reports/entry_coverage/cross_domain_conflicts.md`

Decision source:

- Parse `entry_inventory.tsv` and `service_inventory.tsv` as TSV using headers.
- Required `entry_inventory.tsv` fields include `entry_type`,
  `evidence_mode`, `symbol`, `path`, `archived`, `classification`,
  `classification_reason`, `match_strength`, `match_reason`, and
  `requirement_scope`.
- Required `service_inventory.tsv` fields include `kind`, `symbol`, `path`,
  `classification`, `match_strength`, `match_reason`,
  `reverse_coverage_status`, and `requirement_scope`.
- Use markdown reports only for human-readable context and details, not as the
  primary blocker detector.
- Do not grep whole markdown reports to infer blockers.

The enhanced runner no longer relies only on full-text contains. It uses
EntryCoverage table parsing, code anchor, path, method, route, topic, job,
function, SQL, connector, sink, frontend API/client, and backend/mock boundary
evidence.

Inspect `classification`, `classification_reason`, `match_strength`,
`match_reason`, `requirement_scope`, and `reverse_coverage_status` before
deciding blockers.

Treat these as Analyze Gate blocking unless the project profile records an
explicit accepted exception:

- business entry unarchived;
- core business unit unarchived;
- Service / Manager / Mapper reverse coverage missing for a business unit, including `reverse_coverage_status=no_entry_reverse_coverage`;
- cross-domain conflict that is not accepted by `specs/{feature}/route.md` or profile;
- business_domain L4 missing.

The following non-blocking classifications must remain visible in the reports
but do not by themselves block Analyze:

- `technical_bridge`
- `framework_bridge`
- `generated_or_vendor`
- `native_shell`
- `abstract_or_base`
- `annotation_or_marker`
- `not_applicable`

technical bridge, framework bridge, generated/vendor, and frontend native shell
rows are visible audit evidence but not default blockers.

`native_shell` blocks only when route, profile, or code evidence marks it as
explicit user-visible business behavior.

`business_entry` rows block when unarchived or missing L4 evidence.

## Shared-Domain Duplication Decision

Repeated L2 hits for shared/platform/scheduling/integration domains are
Blocking by default when they create ownership ambiguity.

Downgrade repeated shared/platform/scheduling/integration hits to Warning only
when one of these sources explicitly accepts the shared boundary:

- `specs/{feature}/route.md` accepted shared boundary;
- `.specify/entry-coverage-profile.yaml` accepted shared boundary;
- manifest Re-Gate or risk acceptance record tied to the current feature.

The output must record the decision under `Shared-Domain Duplication Decision`
with source, evidence, and owner.

## Business-Domain L4 Missing

If entry coverage reports indicate missing or empty business_domain L4
documents, Analyze Gate Result is `FAIL`; record a Blocking Item. Required Action must route to
`sdlc-speckit-sync` create-if-missing or business-domain bootstrap, not to
implementation.

## Project Type Profile Checks

Apply the checks in `project-type-checks.md` for:

- `backend-business-service`
- `admin-mixed-workflow`
- `frontend-application`
- `data-pipeline-etl`
- `library-shared-component`

## Required Speckit Inputs

The gate covers `specs/{feature}/route.md`, `specs/{feature}/spec.md`,
`specs/{feature}/plan.md`, and `specs/{feature}/tasks.md`.

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

Analyze output must include:

- Project Type Profile Checks
- Entry Coverage Gate
- Parsed Entry Inventory Summary
- Parsed Service Inventory Summary
- Shared-Domain Duplication Decision
- Blocking Items
- Earliest Affected Node
- Re-Gate Recommendation
- Manifest Update Recommendation
- Next Step

Recommend `sdlc-speckit-implement` only when there are no Blocking items.
