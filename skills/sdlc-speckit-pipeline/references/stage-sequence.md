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
| Preflight | project governance or existing preflight command | Verify Speckit baseline and required business knowledge entry points. |
| Domain Route | pipeline controller | Decide existing-change, new-flow, integration-change, data-change, or unknown. |
| Specify | `sdlc-speckit-specify` | Sync approved DocFlow specification into `specs/spec.md`. |
| Clarify | `sdlc-speckit-clarify` | Validate residual questions only. |
| Plan | `sdlc-speckit-plan` | Produce or validate implementation plan. |
| Tasks | `sdlc-speckit-tasks` | Produce or validate traceable implementation tasks. |
| Analyze | `sdlc-speckit-analyze` | Audit implementation readiness. |
| Implement | `sdlc-speckit-implement` | Modify code for approved tasks. |
| Sync | `sdlc-speckit-sync` | Persist stable reusable implementation facts. |
| Reconcile | `sdlc-speckit-code-doc-reconcile` | Audit code, specs, DocFlow, knowledge, and manifest consistency. |

## Handoff Rule

Each stage handoff must include:

- Source artifacts.
- Output artifacts.
- Gate result.
- Blocking items.
- Accepted risks.
- Manifest recommendation.
- Next stage eligibility.

## Existing Artifact Reuse

Reuse existing artifacts only when:

- Requirement ID matches.
- Artifact version is current.
- Manifest does not mark the artifact stale.
- Gate result is passable.
- No accepted change-control record invalidates it.

Otherwise route to the responsible child skill to regenerate or revalidate.
