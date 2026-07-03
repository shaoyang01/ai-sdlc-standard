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

## Companion Artifact Rules

### `research.md`

Must contain or explicitly skip:

- technical decisions
- alternatives considered
- dependency constraints
- open technical questions
- selected approach rationale

### `data-model.md`

Must contain or explicitly skip:

- entities
- state
- persistence side effects
- frontend state, when `frontend-application` applies
- ETL schema / input-output shape, when `data-pipeline-etl` applies
- migration / compatibility notes, when data changes apply

### `contracts/`

Must contain or explicitly skip contract artifacts for each applicable project type profile, per this matrix.

### `quickstart.md`

Must contain or explicitly skip:

- verification commands
- environment assumptions
- seed data / representative sample
- main path verification
- failure / rollback / idempotency verification
- expected observation
- rollback check

## Skip Record / Contract Skip Records

Any companion artifact or contract artifact that is `Not Applicable` or `Deferred` must have a complete Contract Skip Record:

```text
Artifact:
Project Type Profile:
Contract Type:
Status: Not Applicable / Deferred
Skip Reason:
Risk:
Impact:
Accepted By:
Re-Gate Required:
Verification Alternative:
Expiry / Follow-up: (when Deferred)
```

Rules:

- If `Accepted By` is missing and Status is `Deferred`, Plan Gate is BLOCKED (Deferred without Accepted By).
- If `Skip Reason` is vague (e.g., "not needed"), Plan Gate is BLOCKED.
- `Expiry / Follow-up` is required when Status is `Deferred`.

## Contract Matrix by Project Type

### backend-business-service

| Contract Artifact | Required When |
| --- | --- |
| API contract | Feature changes or adds HTTP/REST endpoints. |
| RPC contract | Feature changes or adds RPC provider methods. |
| MQ producer / consumer contract | Feature changes or adds MQ producer, consumer, topic, or message schema. |
| Schedule / job contract | Feature changes or adds scheduled job trigger, cron, or job behavior. |
| DB side-effect / migration contract | Feature changes DB schema, writes, or introduces migration steps. |
| failure / rollback / idempotency contract | Feature changes transaction boundaries, rollback paths, or idempotency guarantees. |
| transaction boundary contract | Feature introduces or changes transaction scope, propagation, or isolation. |

### admin-mixed-workflow

| Contract Artifact | Required When |
| --- | --- |
| configuration lifecycle contract | Feature changes configuration create, update, approve, or publish flow. |
| approval / audit contract | Feature changes approval chain, audit trail, or audit query behavior. |
| import / export contract | Feature changes data import/export format, source, or target. |
| read-only query contract | Feature changes read-only query behavior, filter, or result shape. |
| concurrency / rollback contract | Feature introduces or changes concurrent operations or rollback behavior. |
| operator permission / visibility contract | Feature changes operator role, permission, or data visibility rules. |
| data console operation contract | Feature changes data console operation entry or behavior. |

### frontend-application

| Contract Artifact | Required When |
| --- | --- |
| route / page contract | Feature changes or adds route, page, or screen behavior. |
| component / state / store contract | Feature changes or adds component, state management, or store behavior. |
| API client contract | Feature changes or adds API client request/response shape. |
| backend / mock boundary contract | Feature changes backend integration or mock strategy. |
| popup / dialog interaction contract | Feature changes or adds popup, modal, dialog, or sheet behavior. |
| navigation / visibility contract | Feature changes navigation flow, guard, or conditional visibility. |
| visual verification contract | Feature changes visual behavior that must be verified. |

### data-pipeline-etl

| Contract Artifact | Required When |
| --- | --- |
| trigger contract | Feature changes or adds pipeline trigger (schedule, event, dependency). |
| input contract | Feature changes or adds input tables, topics, files, or formats. |
| output contract | Feature changes or adds output tables, topics, reports, or formats. |
| SQL lineage contract | Feature changes or adds SQL transform or data lineage. |
| partition / window / checkpoint contract | Feature changes partition strategy, time window, or checkpoint behavior. |
| replay / idempotency contract | Feature changes replay strategy or idempotency guarantees. |
| downstream consumer contract | Feature changes downstream consumer expectations or schema. |
| connector / sink / publisher contract | Feature changes connector, sink, or publisher behavior or configuration. |

### library-shared-component

| Contract Artifact | Required When |
| --- | --- |
| public API contract | Feature changes or adds public API surface. |
| consumer scenario contract | Feature changes consumer usage scenario or integration pattern. |
| compatibility contract | Feature changes backward compatibility or versioning rules. |
| deprecation / migration contract | Feature deprecates or migrates existing API or behavior. |
| representative test contract | Feature changes test coverage expectations or representative test suite. |
| extension point / adapter contract | Feature changes SPI, extension point, or adapter behavior. |

## Plan Gate BLOCKED Conditions

Plan Gate is `BLOCKED` when:

1. `project_type_profiles` are unknown or not identified.
2. `route.md` does not provide Route Type, Business Domain Targets, or Entry Coverage Surface.
3. Companion artifact status table is missing.
4. Project-type contract matrix has not been applied to the current profiles.
5. A required or conditional contract artifact is not `Produced`, `Reused`, `Not Applicable with reason`, or `Deferred with accepted risk`.
6. API/RPC/MQ/DB/schedule/frontend route/state/ETL input-output/library public API surfaces change and `contracts/` is skipped without concrete reason.
7. A companion artifact is missing without complete skip record.
8. A `Deferred` contract artifact would cause implementation guessing (Plan Gate BLOCKED).
9. Plan changes reviewed business behavior.
10. Plan uses contract artifacts to back-fill unreviewed business rules.
11. `Deferred` without `Accepted By`.
12. `Skip Reason` is vague (e.g., "not needed").

## Relationship to Companion Product Set

The companion product set (`research.md`, `data-model.md`, `contracts/`, `quickstart.md`) is the outer container. The contract matrix defines what must be inside `contracts/` for each project type. A skipped `contracts/` means all contract artifacts in the matrix are skipped; individual contracts may be skipped even when `contracts/` is produced.
