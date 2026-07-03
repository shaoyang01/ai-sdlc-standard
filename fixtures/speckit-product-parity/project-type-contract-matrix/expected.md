# Project-Type Contract Matrix — Expected Semantics

This is a **development-time fixture**, not target project runtime input.

## Required Semantic Surface

### Companion Artifact Status Table

Plan stage must output a companion artifact status table in output-and-manifest.md:

| Artifact | Status | Project Type Profile | Contract Type | Evidence | Skip Record | Blocking Item |
| --- | --- | --- | --- | --- | --- | --- |

Status values: `Produced`, `Reused`, `Not Applicable`, `Deferred`.

### Project-Type Contract Matrix Table

| Project Type Profile | Contract Type | Required When | Artifact Target | Status | Evidence | Risk |
| --- | --- | --- | --- | --- | --- | --- |

### Contract Skip Records Table

| Artifact | Project Type Profile | Contract Type | Status | Skip Reason | Risk | Impact | Accepted By | Re-Gate Required | Verification Alternative |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

### Skip Record

Any `Not Applicable` or `Deferred` artifact requires:

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

### Contract Matrix Coverage

- **backend-business-service**: API contract, RPC contract, MQ producer / consumer contract, Schedule / job contract, DB side-effect / migration contract, failure / rollback / idempotency contract, transaction boundary contract
- **admin-mixed-workflow**: configuration lifecycle contract, approval / audit contract, import / export contract, read-only query contract, concurrency / rollback contract, operator permission / visibility contract, data console operation contract
- **frontend-application**: route / page contract, component / state / store contract, API client contract, backend / mock boundary contract, popup / dialog interaction contract, navigation / visibility contract, visual verification contract
- **data-pipeline-etl**: trigger contract, input contract, output contract, SQL lineage contract, partition / window / checkpoint contract, replay / idempotency contract, downstream consumer contract, connector / sink / publisher contract
- **library-shared-component**: public API contract, consumer scenario contract, compatibility contract, deprecation / migration contract, representative test contract, extension point / adapter contract

### Plan Gate BLOCKED

- `Deferred` without `Accepted By` → BLOCKED
- Vague skip reason → BLOCKED
- Contract surface changed but contracts/ skipped without concrete reason → BLOCKED
- Companion artifact missing without complete skip record → BLOCKED

### Redlines

- Must not use `.specify/memory/**` as runtime input
- Must not use `.specify/workflow/**` as runtime input
- Must not use `.specify/coding_guide/**` as runtime input
- Must not create filename-versioned artifacts

Legacy Skill usage: none
Legacy document runtime input: none
Legacy document write target: none
