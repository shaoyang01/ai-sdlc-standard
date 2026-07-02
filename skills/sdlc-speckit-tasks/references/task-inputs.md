# Task Inputs

## Required Inputs

`sdlc-speckit-tasks` requires:

- `specs/{feature}/spec.md`
- `specs/{feature}/plan.md`
- Plan Gate result from `sdlc-speckit-plan`
- `library/{requirement_id}/01-技术方案/*`
- `library/{requirement_id}/02-方案审核/*`

Recommended:

- `library/{requirement_id}/manifest.md`
- Accepted risk records
- Re-Gate Records
- Replaced Artifact Paths
- Existing `specs/{feature}/tasks.md`

## Readiness Checks

Continue only when:

- `sdlc-speckit-plan` has no Blocking Items.
- `specs/{feature}/plan.md` is current and not stale.
- `specs/{feature}/plan.md` is consistent with `specs/{feature}/spec.md`.
- `02-方案审核` result is `PASS` or valid `PASS_WITH_RISK`.
- Development Path Decision is `SPECKIT_PIPELINE_REQUIRED`, unless the user explicitly requested full SDD.
- No open Required Action affects task scope, dependency order, implementation behavior, or verification.

## Missing Plan Gate

If no Plan Gate result exists:

- Continue only when `specs/{feature}/plan.md` contains an explicit no-blocking Plan Gate section and the user explicitly confirms it is current.
- Recommend running `sdlc-speckit-plan`.
- Do not create tasks from raw chat, an unreviewed plan, or partially approved implementation notes.

## Source Priority

Priority order:

1. Current `specs/{feature}/plan.md`.
2. Current `specs/{feature}/spec.md`.
3. Current effective `01-技术方案`.
4. Current effective `02-方案审核`.
5. Current manifest Development Path Decision and Re-Gate Records.
6. Explicit user confirmation that does not change approved behavior or plan.

If user input changes approved behavior or plan, stop and apply change-control.
