# Analyze Inputs

## Required Inputs

`sdlc-speckit-analyze` requires:

- `specs/{feature}/spec.md`
- `specs/{feature}/plan.md`
- `specs/{feature}/tasks.md`
- Task Gate result from `sdlc-speckit-tasks`
- `library/{requirement_id}/01-技术方案/*`
- `library/{requirement_id}/02-方案审核/*`

Recommended:

- `library/{requirement_id}/manifest.md`
- Accepted risk records
- Re-Gate Records
- Superseded Artifacts
- Plan Gate result from `sdlc-speckit-plan`
- Clarification result from `sdlc-speckit-clarify`

## Readiness Checks

Continue only when:

- `sdlc-speckit-tasks` has no Blocking Items.
- `specs/spec.md`, `specs/plan.md`, and `specs/tasks.md` are current and not superseded.
- `02-方案审核` result is `PASS` or valid `PASS_WITH_RISK`.
- Plan Gate result is passable.
- Task Gate result is passable.
- Development Path Decision is `SPECKIT_PIPELINE_REQUIRED`, unless the user explicitly requested full SDD.
- No open Required Action affects implementation readiness.

## Missing Task Gate

If no Task Gate result exists:

- Continue only when `specs/tasks.md` contains an explicit no-blocking Task Gate section and the user explicitly confirms it is current.
- Recommend running `sdlc-speckit-tasks`.
- Do not approve implementation readiness from raw tasks or unreviewed implementation notes.

## Source Priority

Priority order:

1. Current `02-方案审核` result and accepted risks.
2. Current `specs/{feature}/spec.md`.
3. Current `specs/{feature}/plan.md`.
4. Current `specs/{feature}/tasks.md`.
5. Current `01-技术方案`.
6. Current manifest Development Path Decision and Re-Gate Records.
7. Explicit user confirmation that does not change approved behavior, plan, or tasks.

If user input changes approved behavior, plan, or task scope, stop and apply change-control.
