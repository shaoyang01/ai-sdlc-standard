# Domain Route Artifact

## Purpose

Use the Domain Route artifact as the stable input boundary between Pipeline,
Specify, Plan, Analyze, Sync, and Reconcile.

The Pipeline report must always keep a compact Pipeline Domain Route Summary.
When a feature id is known and the requirement enters full SDD, materialize the
same route decision as:

```text
specs/{feature}/route.md
```

Keep this path stable. Do not create filename-versioned route artifacts.

## Route Type

Use exactly one value:

- `existing-change`
- `new-flow`
- `integration-change`
- `data-change`
- `unknown`

`unknown` is blocking before Specify unless the user explicitly confirms the
route type, target business-domain documents, entry coverage surface, and risk
owner. Record that confirmation in the route artifact and the pipeline report.

## Required Schema

Every `specs/{feature}/route.md` must contain:

```markdown
# Domain Route: <Feature ID>

## Metadata

- Requirement ID:
- Feature ID:
- Artifact Type: domain-route
- Version: 1.0.0
- Status: draft / active / blocked / stale / replaced
- Author / Skill: sdlc-speckit-pipeline
- Created At:
- Updated At:

## Route Decision

- Route Type:
- Explicit Route Confirmation: yes / no / not-needed
- Route Confirmation Owner:
- Route Confirmation Evidence:

## Project Type Profiles

| Source | Active Profiles | Evidence |
| --- | --- | --- |
| .specify/project-governance-profile.yaml |  |  |
| .specify/entry-coverage-profile.yaml |  |  |

## Business Domain Targets

| Level | Target | Target Status | Owner | Evidence |
| --- | --- | --- | --- | --- |
| L1 |  | existing / missing / create-if-missing-candidate / pending-confirmation |  |  |
| L2 |  | existing / missing / create-if-missing-candidate / pending-confirmation |  |  |
| L4 |  | existing / missing / create-if-missing-candidate / pending-confirmation |  |  |

## Business Knowledge Read Set

| Document | Reason | Status |
| --- | --- | --- |
| 00BusinessLandscape.md |  | read / missing / not-applicable |
| 00UbiquitousLanguage.md |  | read / missing / not-applicable |
| 01DomainCatalog.md |  | read / missing / not-applicable |
| L2 document |  | read / missing / not-applicable |
| L4 document |  | read / missing / not-applicable |
| .specify/business-domain-bootstrap.yaml |  | read / missing / not-applicable |

## Entry Coverage Surface

| Surface | Entries | Evidence | Coverage Status |
| --- | --- | --- | --- |
| backend entries |  |  | covered / pending / blocked / not-applicable |
| admin entries |  |  | covered / pending / blocked / not-applicable |
| frontend entries |  |  | covered / pending / blocked / not-applicable |
| ETL entries |  |  | covered / pending / blocked / not-applicable |
| library/shared-component entries |  |  | covered / pending / blocked / not-applicable |

## Sync Targets

| Target | Fact Type | Write Timing | Authorization Status | Evidence |
| --- | --- | --- | --- | --- |
|  |  | after implementation / after verification / not-applicable | authorized / pending / blocked / not-needed |  |

## Create-If-Missing Decision

| Field | Value |
| --- | --- |
| Applies | yes / no |
| Target L1 |  |
| Target L2 |  |
| Target L4 Id |  |
| Target L4 Document |  |
| Owner |  |
| Authorization | authorized / pending / blocked / not-needed |
| Entry Coverage Status | covered / pending / blocked / not-applicable |
| Source Evidence |  |

## Unresolved Questions

| Question | Severity | Owner | Blocks Specify |
| --- | --- | --- | --- |
|  | critical / major / minor |  | yes / no |

## Blocking Items

| Item | Earliest Affected Node | Owner | Required Action |
| --- | --- | --- | --- |
|  | Domain Route / Specify / Plan / Analyze / Sync / Reconcile |  |  |

## New-Rail Runtime Check

- Runtime child skills: `sdlc-speckit-*` only
- Legacy Skill usage: none
- Legacy document runtime input: none
- Legacy document write target: none
- Project private context read set:
- Standard package resolution:

## Source Artifacts

- Requirement:
- Technical specification:
- Solution review:
- Manifest:
- Pipeline report:
- Existing specs:

## Manifest Recommendation

- Artifact Index:
- Activity Log:
- Gate Records:
- Re-Gate Records:
- Next Step:

## Revision History

| Version | Date | Author / Skill | Change Type | Summary | Re-Gate |
| --- | --- | --- | --- | --- | --- |
| 1.0.0 |  | sdlc-speckit-pipeline | initial | Initial route artifact. | no |
```

## Materialization Rules

1. During early Pipeline execution, report the route in Pipeline Domain Route Summary.
2. When the feature id is known and full SDD proceeds, write or update
   `specs/{feature}/route.md`.
3. `specs/{feature}/spec.md` must reference `specs/{feature}/route.md` when it
   exists. If no feature directory exists yet, it must reference the Pipeline
   Domain Route Summary.
4. Plan, Analyze, Sync, and Reconcile must use `route.md` or the recorded
   Pipeline Domain Route Summary as the route boundary. They must not independently
   reclassify route type or business-domain targets without Re-Gate.

## Data Cases

Use these cases to validate route behavior:

| Case | Expected Route Behavior |
| --- | --- |
| Existing backend flow with known L1/L2/L4 | `existing-change`; all targets `existing`; Specify may continue after user confirms the Domain Route -> Specify transition. |
| New business flow with known L1/L2 and missing L4 | `new-flow`; L4 is `create-if-missing-candidate`; record owner, authorization, and entry coverage status before Sync can write. |
| Mixed backend plus frontend project | Entry Coverage Surface lists both backend/admin and frontend entries; missing one side is `pending` or `blocked`, not silently ignored. |
| ETL or data pipeline change | `data-change` or `integration-change`; Entry Coverage Surface records ETL entries, inputs, outputs, lineage, and rerun/replay evidence. |
| Insufficient business-domain evidence | `unknown`; block Specify unless the user explicitly confirms route and target documents. |

## Stop Conditions

Stop before Specify when:

- Route Type is `unknown` and explicit route confirmation is absent.
- Business Domain Targets require invented L1/L2/L4 values.
- Create-if-missing applies but L1, L2, L4 id, owner, authorization, or entry
  coverage status is missing.
- New-Rail Runtime Check cannot state `Legacy Skill usage: none`, `Legacy
  document runtime input: none`, and `Legacy document write target: none`.
- The route depends on forbidden legacy paths such as `.specify/memory/**`,
  `.specify/workflow/**`, or `.specify/coding_guide/**`.
