# Stage Sequence

## Stage Order

Run stages in this fixed order:

```text
Preflight
-> Domain Route
-> Specify
-> Clarify
-> Plan
-> Tasks
-> Analyze
-> Implement
-> Sync
-> Reconcile
```

Do not skip a stage unless its current result already exists, is not stale, and is valid for the active requirement version.

## Child Skill Mapping

| Stage | Primary Skill | Purpose |
| --- | --- | --- |
| Preflight | `sdlc-speckit-pipeline` controller plus standard-package bootstrap/audit scripts | Verify Speckit baseline, new-rail runtime redlines, and required business knowledge entry points. |
| Domain Route | `sdlc-speckit-pipeline` controller | Decide existing-change, new-flow, integration-change, data-change, or unknown. |
| Specify | `sdlc-speckit-specify` | Sync approved DocFlow specification into `specs/{feature}/spec.md`. |
| Clarify | `sdlc-speckit-clarify` | Validate residual questions only. |
| Plan | `sdlc-speckit-plan` | Produce or validate implementation plan. |
| Tasks | `sdlc-speckit-tasks` | Produce or validate traceable implementation tasks. |
| Analyze | `sdlc-speckit-analyze` | Audit implementation readiness. |
| Implement | `sdlc-speckit-implement` | Modify code for approved tasks. |
| Sync | `sdlc-speckit-sync` | Persist stable reusable implementation facts. |
| Reconcile | `sdlc-speckit-code-doc-reconcile` | Audit code, specs, DocFlow, knowledge, and manifest consistency. |

Only `sdlc-speckit-*` child Skills may be invoked at runtime. Legacy `speckit-*` Skills are development-time fixtures for standard-package parity review, not pipeline dependencies.

## Transition Confirmation

Ask whether to enter the next stage only before the Clarify boundary:

- Preflight -> Domain Route: ask.
- Domain Route -> Specify: ask.
- Specify -> Clarify: ask.

Clarify is the last interrupting authoring Gate. When Clarify passes and required downstream authorization is already present, continue through Plan, Tasks, Analyze, Implement, Sync, and Reconcile in order without asking whether to enter each next stage.

If implementation, Sync target/write, Reconcile apply, or accepted-risk owner authorization is missing, stop at the Clarify boundary and report the missing authorization before entering continuous execution.

## Handoff Rule

Each stage handoff must include:

- Source artifacts.
- Output artifacts.
- Gate result.
- Blocking items.
- Accepted risks.
- Manifest recommendation.
- Next stage eligibility.

Preflight and Domain Route must also include a Domain Route Summary:

- Requirement ID.
- Feature ID, when known.
- Route Type.
- Project Type Profiles.
- Entry Coverage Surface.
- Business Domain Targets.
- Business Knowledge Read Set.
- Missing Knowledge.
- Create-If-Missing Decision.
- New-Rail Runtime Check.

When a feature id is known and full SDD proceeds, materialize the Domain Route
Summary as `specs/{feature}/route.md`. Hand off `route.md` to Specify, Plan,
Analyze, Sync, and Reconcile. Before materialization, hand off the Pipeline
Domain Route Summary instead.

## Existing Artifact Reuse

Reuse existing artifacts only when:

- Requirement ID matches.
- Artifact version is current.
- Manifest does not mark the artifact stale.
- Gate result is passable.
- No accepted change-control record invalidates it.

Otherwise route to the responsible child skill to regenerate or revalidate.
