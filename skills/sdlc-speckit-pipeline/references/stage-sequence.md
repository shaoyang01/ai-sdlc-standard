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
```

Speckit SDD Core ends exactly at Implement. Sync, Reconcile, Shared Tail, and
Tail Completion Gate are not Pipeline runtime stages.

Do not skip a stage unless its current result already exists, is not stale, and is valid for the active requirement version.

## Child Skill Mapping

| Stage | Primary Skill | Purpose |
| --- | --- | --- |
| Preflight | `sdlc-speckit-pipeline` controller | Read-only readiness inspection: verify Speckit baseline, new-rail runtime redlines, project profile, bootstrap config, and required business knowledge entry points; missing business-domain knowledge routes to `INDEPENDENT_BUSINESS_DOMAIN_BOOTSTRAP_REQUIRED` instead of running a write-mode bootstrap. |
| Domain Route | `sdlc-speckit-pipeline` controller | Decide existing-change, new-flow, integration-change, data-change, or unknown. |
| Specify | `sdlc-speckit-specify` | Sync approved DocFlow specification into `specs/{feature}/spec.md`. |
| Clarify | `sdlc-speckit-clarify` | Validate residual questions only. |
| Plan | `sdlc-speckit-plan` | Produce or validate implementation plan. |
| Tasks | `sdlc-speckit-tasks` | Produce or validate traceable implementation tasks. |
| Analyze | `sdlc-speckit-analyze` | Audit implementation readiness. |
| Implement | `sdlc-speckit-implement` | Modify code for approved tasks. |

Only `sdlc-speckit-*` child Skills may be invoked at runtime. Legacy `speckit-*` Skills are development-time fixtures for standard-package parity review, not pipeline dependencies. Sync and Reconcile are not Pipeline child stages: `sdlc-speckit-sync` and `sdlc-speckit-code-doc-reconcile` execute inside the Shared Documentation Governance Tail.

## Transition Confirmation

Ask whether to enter the next stage only before the Clarify boundary:

- Preflight -> Domain Route: ask.
- Domain Route -> Specify: ask.
- Specify -> Clarify: ask.

Clarify is the last interrupting authoring Gate. When Clarify passes and required Core authorization (implementation authorization or Core accepted-risk owner) is already present, continue through Plan, Tasks, Analyze, and Implement in order without asking whether to enter each next stage.

If Core authorization is missing, stop at the Clarify boundary and report the missing authorization before entering continuous execution. Do not ask whether to enter a Pipeline-internal Sync or Reconcile stage: they are not Pipeline stages.

## Shared Tail Handoff Boundary

Pipeline Core completion ends at Implement. After Implement, the Pipeline produces a Shared Tail Handoff:

- The Handoff is handed to the Shared Documentation Governance Tail.
- The Pipeline does not call Tail Skills (Sync, Reconcile, Tail Completion Gate) and does not form a Tail completion source.
- The Handoff is not a new Pipeline stage; it is the Pipeline exit artifact.

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
and Analyze. Before materialization, hand off the Pipeline
Domain Route Summary instead. After Implement, hand off the Shared Tail Handoff
to the Shared Tail; Sync and Reconcile execute there.

## Existing Artifact Reuse

Reuse existing artifacts only when:

- Requirement ID matches.
- Artifact version is current.
- Manifest does not mark the artifact stale.
- Gate result is passable.
- No accepted change-control record invalidates it.

Otherwise route to the responsible child skill to regenerate or revalidate.

### Existing Sync / Reconcile Evidence

The Pipeline may read existing Sync/Reconcile decision and execution pointers:

- Mark them only as candidate evidence (`candidate_evidence_only=true`).
- Requirement ID, scope, version, and freshness must match.
- Do not automatically reuse stale evidence.
- Do not automatically re-execute Sync or Reconcile.
- Whether the Tail is satisfied is decided by the Manifest current state and the Tail Completion Gate (`sdlc-gate-runner`), never by the Pipeline.
