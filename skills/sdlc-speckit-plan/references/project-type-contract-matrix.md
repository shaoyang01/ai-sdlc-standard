# Project-Type Contract Matrix

> **Reference**: `${AI_SDLC_STANDARD_HOME}/skills/sdlc-speckit-plan/references/project-type-contract-matrix.md`

## Purpose

This matrix defines the contract artifact granularity required by `sdlc-speckit-plan` for each `project_type_profile`. Plan Gate must verify that every relevant contract surface is covered or explicitly skipped with a complete skip record.

## Companion Artifact Status Table

Plan stage must output a companion artifact status table in `plan.md`:

```markdown
| Artifact | Status | Path | Skip Reason | Risk | Impact | Accepted By | Re-Gate Required |
| --- | --- | --- | --- | --- | --- | --- | --- |
| plan.md | Produced | specs/{feature}/plan.md |  |  |  |  | no |
| research.md | Produced / Reused / Not Applicable / Deferred | specs/{feature}/research.md |  |  |  |  |  |
| data-model.md | Produced / Reused / Not Applicable / Deferred | specs/{feature}/data-model.md |  |  |  |  |  |
| contracts/ | Produced / Reused / Not Applicable / Deferred | specs/{feature}/contracts/ |  |  |  |  |  |
| quickstart.md | Produced / Reused / Not Applicable / Deferred | specs/{feature}/quickstart.md |  |  |  |  |  |
```

**Status values**:

- `Produced`: artifact is newly created for this feature.
- `Reused`: existing artifact from the same or a parent requirement is reused; reference the reused path and version.
- `Not Applicable`: artifact is not needed because the feature does not touch the relevant surface; must include a concrete reason.
- `Deferred`: artifact is needed but deferred with an accepted risk; must include Risk, Impact, Accepted By, and Re-Gate Required.

**Skip Record** (required for Not Applicable or Deferred):

```text
Artifact:
Project Type Profile:
Skip Reason:
Risk:
Impact:
Accepted By:
Re-Gate Required:
```

## Contract Matrix by Project Type

### backend-business-service

| Contract Artifact | Required When |
| --- | --- |
| API contract | Feature changes or adds HTTP/REST endpoints. |
| RPC contract | Feature changes or adds RPC provider methods. |
| MQ producer/consumer contract | Feature changes or adds MQ producer, consumer, topic, or message schema. |
| Schedule/job contract | Feature changes or adds scheduled job trigger, cron, or job behavior. |
| DB side-effect / migration contract | Feature changes DB schema, writes, or introduces migration steps. |
| failure/rollback/idempotency contract | Feature changes transaction boundaries, rollback paths, or idempotency guarantees. |

### admin-mixed-workflow

| Contract Artifact | Required When |
| --- | --- |
| configuration lifecycle contract | Feature changes configuration create, update, approve, or publish flow. |
| approval/audit contract | Feature changes approval chain, audit trail, or audit query behavior. |
| import/export contract | Feature changes data import/export format, source, or target. |
| read-only query contract | Feature changes read-only query behavior, filter, or result shape. |
| concurrency/rollback contract | Feature introduces or changes concurrent operations or rollback behavior. |
| operator permission or visibility contract | Feature changes operator role, permission, or data visibility rules. |

### frontend-application

| Contract Artifact | Required When |
| --- | --- |
| route/page contract | Feature changes or adds route, page, or screen behavior. |
| component/state/store contract | Feature changes or adds component, state management, or store behavior. |
| API client contract | Feature changes or adds API client request/response shape. |
| backend/mock boundary contract | Feature changes backend integration or mock strategy. |
| popup/dialog interaction contract | Feature changes or adds popup, modal, dialog, or sheet behavior. |
| visual verification contract | Feature changes visual behavior that must be verified. |

### data-pipeline-etl

| Contract Artifact | Required When |
| --- | --- |
| trigger contract | Feature changes or adds pipeline trigger (schedule, event, dependency). |
| input contract | Feature changes or adds input tables, topics, files, or formats. |
| output contract | Feature changes or adds output tables, topics, reports, or formats. |
| SQL lineage contract | Feature changes or adds SQL transform or data lineage. |
| partition/window/checkpoint contract | Feature changes partition strategy, time window, or checkpoint behavior. |
| replay/idempotency contract | Feature changes replay strategy or idempotency guarantees. |
| downstream consumer contract | Feature changes downstream consumer expectations or schema. |

### library-shared-component

| Contract Artifact | Required When |
| --- | --- |
| public API contract | Feature changes or adds public API surface. |
| consumer scenario contract | Feature changes consumer usage scenario or integration pattern. |
| compatibility contract | Feature changes backward compatibility or versioning rules. |
| deprecation/migration contract | Feature deprecates or migrates existing API or behavior. |
| representative test contract | Feature changes test coverage expectations or representative test suite. |

## Plan Gate BLOCKED Conditions

Plan Gate is `BLOCKED` when:

1. A companion artifact (`research.md`, `data-model.md`, `contracts/`, `quickstart.md`) is missing and no complete skip record (`Artifact`, `Skip Reason`, `Risk`, `Impact`, `Accepted By`, `Re-Gate Required`) exists.
2. `contracts/` is skipped but the feature changes a contract surface listed in the relevant project-type contract matrix.
3. A contract artifact in the matrix is required by the feature but not covered by any contract file under `specs/{feature}/contracts/` and no skip record exists for that specific contract.
4. A Deferred artifact has no accepted risk or no Re-Gate Required flag.

## Relationship to Companion Product Set

The companion product set (`research.md`, `data-model.md`, `contracts/`, `quickstart.md`) is the outer container. The contract matrix defines what must be inside `contracts/` for each project type. A skipped `contracts/` means all contract artifacts in the matrix are skipped; individual contracts may be skipped even when `contracts/` is produced.
