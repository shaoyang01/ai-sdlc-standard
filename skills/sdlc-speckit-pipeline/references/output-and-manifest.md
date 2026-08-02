# Output And Manifest

## Artifact Versioning Requirements

When this reference produces or updates a DocFlow requirement artifact under
`library/{requirement_id}/`, it must use a stable path and update the same file.
Do not create `_vN.md` or other filename-versioned artifacts.

The artifact must include:

```markdown
## Metadata

- Requirement ID:
- Artifact Type:
- Version: 1.0.0
- Status: draft / active / passed / failed / stale / replaced
- Author / Skill:
- Created At:
- Updated At:
- Reviewed Artifact:
- Reviewed Artifact Version:
- Gate Artifact Version:

## 修订记录

| Version | Date | Author / Skill | Change Type | Summary | Re-Gate |
| --- | --- | --- | --- | --- | --- |
| 1.0.0 |  |  | initial | Initial current artifact. | no |
```

For non-Gate artifacts, `Reviewed Artifact`, `Reviewed Artifact Version`, and
`Gate Artifact Version` may be omitted when there is no reviewed upstream
artifact. For Gate, review, sync, and reconcile artifacts, they are required.

The body must contain only the current effective content. Historical changes
belong in `## 修订记录`, manifest `Change History`, and Git history.

## Pipeline Report Shape

Use this structure:

```md
# Speckit Pipeline Result

## Activation Basis

- Requirement ID:
- Development Path Decision:
- User confirmation:

## New-Rail Runtime Check

- Runtime child skills: `sdlc-speckit-*` only
- Legacy Skill usage: none
- Legacy document runtime input: none
- Legacy document write target: none
- Project private context read set:
- Standard package:

## Domain Route Summary

- Requirement ID:
- Feature ID:
- Route Type: existing-change / new-flow / integration-change / data-change / unknown
- Project Type Profiles:
- Business Domain Targets:
- Entry Coverage Surface:
- Business Knowledge Read Set:
- Sync Targets:
- Create-If-Missing Decision:
- Missing Knowledge:
- Unresolved Questions:
- Blocking Items:
- Route Artifact: `specs/{feature}/route.md` or Pipeline Domain Route Summary
- Next route action:

## Source Artifacts

- Requirement:
- Technical specification:
- Solution review:
- Manifest:
- Existing specs:

## Result Scope

- Result Scope: Speckit SDD Core
- Core Completion: yes / no
- Shared Tail Status: pending
- Tail Completion Gate Result: not_evaluated
- Completion Source Established: false

## Stage Timeline

| Stage | Skill | Result | Artifact | Blocking Item | Next |
| --- | --- | --- | --- | --- | --- |

Stage Timeline lists Core stages only: Preflight, Domain Route, Specify,
Clarify, Plan, Tasks, Analyze, Implement. Sync and Reconcile are not Pipeline
stages and do not appear as Stage Timeline rows.

## Gate Results

- Preflight:
- Domain Route:
- Specify:
- Clarify:
- Plan:
- Tasks:
- Analyze:
- Implement:

Gate Results list Core stages only. There are no fixed Sync or Reconcile result rows in the Pipeline report.

## Produced Or Reused Artifacts

- Specs:
  - Route:
  - Implementation:
  - Workflow Status Snapshot:
  - Debug Guide:
  - Observability:
- DocFlow:
  - Implementation Record:
  - Delivery Summary:
- Code:
- Knowledge: none (Pipeline does not write knowledge)

## Side Effects

- Code:
- Docs:
- Knowledge: none
- Commands:
- Legacy rail paths touched: none

## Blocking Or Deferred Items

- None, or list each item with owner and route. Tail blockers are listed here
  and also carried into the Shared Tail Handoff; they do not erase Core
  completion.

## Re-Gate Recommendation

- Required:
- Earliest affected node:
- Stale or replaced artifacts:

## Shared Tail Handoff

The Shared Tail Handoff is the Pipeline exit artifact for the Shared
Documentation Governance Tail. It is not a new Pipeline stage.

- Requirement ID:
- Feature ID:
- Decision Scope:
- Pipeline Result:
- Result Scope: Speckit SDD Core
- Core Completion:
- Implementation Result:
- Implementation Artifacts:
- Implementation Record Status:
- Code Review Status:
- Test Acceptance Status:
- Existing business_domain_sync decision/artifact/current/scope/execution (candidate_evidence_only=true):
- Existing Reconcile decision/artifact/current/scope/execution (candidate_evidence_only=true):
- Entry Coverage Status:
- Re-Gate Status:
- Blockers:
- Earliest Affected Node:
- Tail Status Recommendation: in_progress
- Tail Completion Gate Result: not_evaluated
- Completion Source Established: false
- Next Owner: Shared Documentation Governance Tail
- Next Step: Shared Documentation Governance Tail

The Handoff is not a formal Gate artifact, not a Manifest, not completion
evidence, and not a completion_decision_source. It does not prove that Sync or
Reconcile satisfies the Tail. Existing Sync/Reconcile pointers are candidate
evidence only (`candidate_evidence_only=true`).

## Manifest Update Recommendation

- Activity Log:
- Gate Records:
- Route Artifact:
- Process Products:
- Change History:
- Next Step: Shared Documentation Governance Tail

## Next Step

- Recommended action: Shared Documentation Governance Tail
```

## Pipeline Result Labels

Use one primary result. These five labels are preserved and no additional Core
completion result enum is introduced:

- `COMPLETED`: Speckit SDD Core through Implement completed without a Core blocking item; the result can be handed off to the Shared Tail.
- `PARTIAL`: some Core stages completed, remaining Core work is explicit and non-blocking.
- `BLOCKED`: a required Core stage cannot proceed.
- `REGATE_REQUIRED`: approved upstream artifacts must be revised before continuing.
- `DIRECT_IMPLEMENTATION_RECOMMENDED`: Pipeline was not activated because the reviewed solution supports direct implementation.

`COMPLETED` must also output:

- `Result Scope: Speckit SDD Core`
- `Shared Tail Status: pending`
- `Tail Completion Gate Result: not_evaluated`
- `Completion Source Established: false`

Pipeline `COMPLETED` must never be interpreted as:

- Requirement completed.
- Shared Tail completed.
- Sync completed.
- Reconcile completed.
- Tail Gate passed.
- Manifest completed.

`PARTIAL` and `BLOCKED` describe Core results only and carry the applicable Tail Handoff state.

## Manifest Recommendations

For each Core stage, recommend manifest updates with:

- Timestamp.
- Stage.
- Skill.
- Input artifacts.
- Output artifacts.
- Gate result.
- Blocking items.
- Next action.

For the Implement stage, include process product outputs or explicit
not-applicable reasons for:

- `specs/{feature}/implementation.md`
- `specs/{feature}/workflow-status.md`
- `specs/{feature}/debug-guide.md`
- `specs/{feature}/observability.md`
- `library/{requirement_id}/03-实现记录/{requirement_id}_实现记录.md`
- `library/{requirement_id}/04-交付总结/{requirement_id}_交付总结.md`

`manifest.md` is the status authority; manifest is status authority. A workflow status snapshot must be
reported as a process product only; it must not override manifest Current Stage,
Current Status, Activity Log, Gate Records, Re-Gate Records, or Blocking Issues.

After Core `COMPLETED`, recommend only:

- Pipeline Core result = `COMPLETED`.
- result scope = `speckit_sdd_core`.
- Tail required / scope unchanged.
- Tail status = `in_progress`.
- Tail Completion Gate = `not_evaluated`.
- completion source absent.
- Next Step: Shared Documentation Governance Tail.

Do not recommend:

- requirement completed.
- Tail completed.
- completion source pointing to the Pipeline.
- Sync / Reconcile default completed.
- Pipeline report as Tail Gate.

When the pipeline stops, record:

- Stop reason.
- Earliest affected node.
- Whether implementation is blocked.
- Whether the online admission summary needs a risk note.

## Existing Sync / Reconcile Evidence

The Pipeline may read and report existing Sync/Reconcile evidence pointers.

Candidate reuse must satisfy all of:

- Requirement ID matches.
- Active scope matches.
- Artifact path exists.
- Artifact version is current.
- Non-stale.
- Decision and execution result are distinguishable.
- No change-control record invalidates it.

The Pipeline only outputs:

- candidate evidence.
- current / stale.
- scope match.
- execution status.
- recommended Tail owner review.

The Pipeline must not:

- automatically execute Sync or Reconcile.
- automatically decide `NOT_REQUIRED`.
- automatically decide the Tail is satisfied.
- automatically request duplicate execution.
- automatically mark the Manifest completed.
