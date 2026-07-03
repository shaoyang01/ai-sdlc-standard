# Project-Type Contract Matrix — Expected Semantics

This is a **development-time fixture**, not target project runtime input.

## Required Semantic Surface

### Companion Artifact Status Table

Plan stage must output a companion artifact status table:

| Artifact | Status | Path | Skip Reason | Risk | Impact | Accepted By | Re-Gate Required |
| --- | --- | --- | --- | --- | --- | --- | --- |
| plan.md | Produced | specs/{feature}/plan.md |  |  |  |  | no |
| research.md | Produced / Reused / Not Applicable / Deferred |  |  |  |  |  |  |
| data-model.md | Produced / Reused / Not Applicable / Deferred |  |  |  |  |  |  |
| contracts/ | Produced / Reused / Not Applicable / Deferred |  |  |  |  |  |  |
| quickstart.md | Produced / Reused / Not Applicable / Deferred |  |  |  |  |  |  |

Status values:
- `Produced`: newly created
- `Reused`: existing artifact reused
- `Not Applicable`: not needed with concrete reason
- `Deferred`: needed but deferred with accepted risk

### Skip Record

Missing artifacts require:

```
Artifact:
Project Type Profile:
Skip Reason:
Risk:
Impact:
Accepted By:
Re-Gate Required:
```

### Contract Matrix Coverage

For each project type, contracts/ must cover the relevant contract surfaces:

- **backend-business-service**: API contract, RPC contract, MQ producer/consumer contract, Schedule/job contract, DB side-effect / migration contract, failure/rollback/idempotency contract
- **admin-mixed-workflow**: configuration lifecycle contract, approval/audit contract, import/export contract, read-only query contract, concurrency/rollback contract, operator permission or visibility contract
- **frontend-application**: route/page contract, component/state/store contract, API client contract, backend/mock boundary contract, popup/dialog interaction contract, visual verification contract
- **data-pipeline-etl**: trigger contract, input contract, output contract, SQL lineage contract, partition/window/checkpoint contract, replay/idempotency contract, downstream consumer contract
- **library-shared-component**: public API contract, consumer scenario contract, compatibility contract, deprecation/migration contract, representative test contract

### Plan Gate BLOCKED

Plan Gate is BLOCKED when:
- Companion artifact missing without complete skip record
- contracts/ skipped while feature changes a contract surface listed in the matrix
- Contract artifact required but not covered and no skip record
- Deferred artifact without accepted risk or Re-Gate Required

## Redlines

- Must not use `.specify/memory/**` as runtime input
- Must not use `.specify/workflow/**` as runtime input
- Must not use `.specify/coding_guide/**` as runtime input
- Must not recommend filename-versioned artifacts

Legacy Skill usage: none
Legacy document runtime input: none
Legacy document write target: none
