# Plan Inputs

## Required Inputs

`sdlc-speckit-plan` requires:

- `specs/{feature}/spec.md`
- `library/{requirement_id}/01-技术方案/*`
- `library/{requirement_id}/02-方案审核/*`
- Clarification result from `sdlc-speckit-clarify`

Recommended:

- `library/{requirement_id}/manifest.md`
- Accepted risk records
- Re-Gate Records
- Replaced Artifact Paths
- Existing `specs/{feature}/plan.md`

## Readiness Checks

Continue only when:

- `sdlc-speckit-clarify` has no Blocking Items.
- `specs/spec.md` is current and not stale.
- `02-方案审核` result is `PASS` or valid `PASS_WITH_RISK`.
- Development Path Decision is `SPECKIT_PIPELINE_REQUIRED`, unless the user explicitly requested full SDD.
- No open Required Action affects Scope, data, state, failure behavior, or acceptance.

## Missing Clarify Result

If no clarify result exists:

- Continue only when `specs/spec.md` contains no open clarification and the user explicitly confirms no residual ambiguity.
- Recommend running `sdlc-speckit-clarify`.
- Do not create a plan from raw chat or unreviewed assumptions.

## Source Priority

Priority order:

1. Current `specs/{feature}/spec.md`.
2. Current effective `01-技术方案`.
3. Current effective `02-方案审核`.
4. Current manifest Development Path Decision and Re-Gate Records.
5. Explicit user confirmation that does not change approved behavior.

If user input changes approved behavior, stop and apply change-control.
