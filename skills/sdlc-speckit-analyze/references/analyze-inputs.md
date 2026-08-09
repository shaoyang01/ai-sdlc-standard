# Analyze Inputs

## Required Inputs

`sdlc-speckit-analyze` requires:

- `specs/{feature}/route.md`
- `specs/{feature}/spec.md`
- `specs/{feature}/plan.md`
- `specs/{feature}/tasks.md`
- `.specify/entry-coverage-profile.yaml`
- `.specify/reports/entry_coverage/entry_coverage_report.md`
- `.specify/reports/entry_coverage/entry_inventory.tsv`
- `.specify/reports/entry_coverage/service_inventory.tsv`
- `.specify/reports/entry_coverage/cross_domain_conflicts.md`
- `.specify/reports/entry_coverage/unarchived_entries.md`
- `.specify/reports/entry_coverage/unarchived_services.md`
- Task Gate result from `sdlc-speckit-tasks`
- `library/{requirement_id}/01-技术方案/*`
- `library/{requirement_id}/02-方案审核/*`

Recommended:

- `library/{requirement_id}/manifest.md`
- Accepted risk records
- Re-Gate Records
- Replaced Artifact Paths
- `specs/{feature}/implementation.md`
- `specs/{feature}/workflow-status.md`
- `specs/{feature}/debug-guide.md`
- `specs/{feature}/observability.md`
- Plan Gate result from `sdlc-speckit-plan`
- Clarification result from `sdlc-speckit-clarify`

## Entry Coverage Profile Readiness

Analyze Gate must not skip entry coverage audit.

Stop with `FAIL` when `.specify/entry-coverage-profile.yaml` is missing.

If `.specify/entry-coverage-profile.candidate.yaml` exists but the stable
`.specify/entry-coverage-profile.yaml` does not exist, stop with Analyze Gate
Result `FAIL`, record Required Action status `PENDING_CONFIRMATION`, and require
a human to confirm the candidate.

Required Action must point to one of:

```bash
${AI_SDLC_STANDARD_HOME}/scripts/bootstrap-entry-coverage-profile.sh --dry-run
${AI_SDLC_STANDARD_HOME}/scripts/bootstrap-entry-coverage-profile.sh
${AI_SDLC_STANDARD_HOME}/scripts/bootstrap-current-project.sh --here
```

Do not approve Analyze readiness by treating a missing profile as "not applicable".

## Readiness Checks

Per `ai-sdlc/goal-anchored-global-reasoning.md`, readiness and Gate blockers
do **not** fail-fast: record each one as a material blocker, complete the
remaining reliable bounded consistency scan, then conclude with Analyze Gate
Result `FAIL` / upstream Re-Gate as appropriate. Hard-stop is limited to
unreadable/missing required source, fundamentally indeterminable scope, or
continuation requiring invented behavior.

Recorded readiness/Gate blockers (each is scanned and reported, then drives
`FAIL` / Re-Gate):

- `sdlc-speckit-tasks` has Blocking Items.
- `specs/{feature}/route.md` is missing or not current.
- `specs/{feature}/spec.md`, `specs/{feature}/plan.md`, or
  `specs/{feature}/tasks.md` is stale.
- `.specify/entry-coverage-profile.yaml` is missing or unstable.
- Entry coverage reports are missing or `entry_inventory.tsv` /
  `service_inventory.tsv` cannot be parsed by TSV fields.
- `02-方案审核` result is not `PASS` / valid `PASS_WITH_RISK`.
- Plan Gate result or Task Gate result is not passable.
- Development Path Decision is not `SPECKIT_PIPELINE_REQUIRED` (unless the
  user explicitly requested full SDD).
- An open Required Action affects implementation readiness.

## Missing Task Gate

If no Task Gate result exists:

- Record it as a readiness blocker per the Readiness Checks section; the
  scan completes and the Gate concludes `FAIL` unless
  `specs/{feature}/tasks.md` contains an explicit no-blocking Task Gate
  section and the user explicitly confirms it is current.
- Recommend running `sdlc-speckit-tasks`.
- Do not approve implementation readiness from raw tasks or unreviewed implementation notes.

## Source Priority

Priority order:

1. Current `specs/{feature}/route.md`, including Project Type Profiles, route type, accepted shared boundary, and Business Domain Targets.
2. Current `.specify/entry-coverage-profile.yaml`.
3. Current entry coverage TSV reports and conflict reports.
4. Current `02-方案审核` result and accepted risks.
5. Current `specs/{feature}/spec.md`.
6. Current `specs/{feature}/plan.md`.
7. Current `specs/{feature}/tasks.md`.
8. Current `01-技术方案`.
9. Current manifest Development Path Decision and Re-Gate Records.
10. Explicit user confirmation that does not change approved behavior, plan, or tasks.

If user input changes approved behavior, plan, or task scope, stop and apply change-control.
