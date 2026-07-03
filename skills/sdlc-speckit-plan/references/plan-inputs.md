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
- `specs/{feature}/spec.md` is current and not stale.
- `02-方案审核` result is `PASS` or valid `PASS_WITH_RISK`.
- Development Path Decision is `SPECKIT_PIPELINE_REQUIRED`, unless the user explicitly requested full SDD.
- No open Required Action affects Scope, data, state, failure behavior, or acceptance.

## Missing Clarify Result

If no clarify result exists:

- Continue only when `specs/{feature}/spec.md` contains no open clarification and the user explicitly confirms no residual ambiguity.
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

## Contract Matrix Readiness

Before producing contracts, resolve the project type profiles from `.specify/project-governance-profile.yaml` or `specs/{feature}/route.md`, then read `${AI_SDLC_STANDARD_HOME}/skills/sdlc-speckit-plan/references/project-type-contract-matrix.md` to identify the contract artifacts required for the current feature's project type profiles.

## Project-Type Matrix Inputs

Required inputs for Project-Type Contract Artifact Matrix:

- project_type_profile
- profile_source
- existing reusable companion artifacts
- source_artifacts
- freshness
- explicit user confirmation when profile unknown
- accepted_by for Deferred
- verification_alternative for Deferred
- project-type justification for Not Applicable
- no filename-versioned artifacts

Rules: Reused requires source_artifacts and freshness. Deferred requires accepted_by and verification_alternative. Not Applicable requires project-type justification.
