# Process Products

This reference defines new-rail process products for implementation-stage work.
These files are the standard landing zones for frontend, React Native, and
general implementation evidence. They are not compatibility aliases for legacy
files.

## New-Rail Process Product Paths

Use these stable paths when the workflow requires implementation process
evidence:

```text
specs/{feature}/implementation.md
specs/{feature}/workflow-status.md
specs/{feature}/debug-guide.md
specs/{feature}/observability.md
library/{requirement_id}/03-实现记录/{requirement_id}__实现记录.md
library/{requirement_id}/04-交付总结/{requirement_id}__交付总结.md
```

`manifest.md` is the status authority. `workflow-status.md` is a machine-side
snapshot for pipeline readability and must not override manifest stage, status,
Gate, Activity Log, Re-Gate, or blocking issue records.

## Legacy Semantic Mapping Source Only

The following names may be mentioned only as development-time semantic mapping
sources when explaining parity. Do not read them as runtime inputs, do not write
them as outputs, and do not treat them as compatibility formats:

```text
implementation-details.md
SDD_WORKFLOW_STATUS.md
API_DEBUG_GUIDE.md
QUICK_DEBUG_REFERENCE.md
LOGGING_IMPLEMENTATION.md
FINAL_SUMMARY.md
```

## specs/{feature}/implementation.md

Purpose: record implementation details that are useful to Speckit machine flow
and later reconciliation.

Required sections:

- Metadata: requirement id, feature id, source artifacts, author or skill,
  updated at.
- Implementation Scope: approved task ids and included or excluded scope.
- File Changes: changed files, task mapping, and behavioral intent.
- Key Technical Decisions: local design choices, alternatives rejected, and
  approved basis.
- Frontend State And Interaction Implementation: route, page, component, store,
  API client, popup, visibility, loading, empty, error, retry, and submit state
  behavior when applicable.
- Backend Or Mock Boundary: real API, mock data, fixture, local stub, and switch
  condition when applicable.
- Verification Evidence: commands, manual steps, visual checks, screenshots or
  comparison notes when applicable.
- Residual Risks And Follow-up.

## specs/{feature}/workflow-status.md

Purpose: record a pipeline machine-side status snapshot for the current feature.

Required sections:

- Metadata: requirement id, feature id, snapshot time, author or skill.
- Status Authority: explicitly state that manifest is status authority.
- Stage Snapshot: stage, result, produced artifacts, blocking item, next action.
- Gate Snapshot: latest known Gate result and evidence pointer.
- Authorization Snapshot: implementation, sync, reconcile apply, and risk owner
  authorization status when applicable.
- Drift Or Staleness Notes: differences from manifest or stale process products.

If this file disagrees with manifest, classify it as `MANIFEST_DRIFT` or process
product drift during reconcile. Do not use it to override manifest.

## specs/{feature}/debug-guide.md

Purpose: provide repeatable debugging and reproduction instructions.

Required sections:

- Metadata: requirement id, feature id, environment, updated at.
- API Debug: endpoint, RPC, request payload, response shape, auth or tenant
  context, and expected error behavior when applicable.
- Quick Debug Reference: shortest local commands or UI paths to reach the
  behavior.
- Mock / Real Data Switching: mock source, real backend source, switch flag,
  fixture location, and safety notes.
- Reproduction Steps: setup, input data, action, expected result, cleanup.
- Known Failure Modes: symptoms, logs, likely owner, and next evidence to collect.

## specs/{feature}/observability.md

Purpose: record runtime visibility for implementation, debugging, and support.

Required sections:

- Metadata: requirement id, feature id, updated at.
- Logging: logger or console policy, key log points, correlation fields, and
  debug log enablement.
- Metrics: counters, timers, dashboards, alerts, or explicit not-applicable
  reason.
- Frontend Analytics: exposure, click, submit, popup, error, page route, and
  business event tracking when applicable.
- Error State Observation: user-visible error state, recoverability, retry, and
  backend error mapping.
- Debug Logs: local debug output, retention expectation, and privacy or PII
  guardrail.

## DocFlow Human Handoff Products

`library/{requirement_id}/03-实现记录/{requirement_id}__实现记录.md` is the
human handoff implementation record. It summarizes actual code changes,
verification, unfinished items, and residual risk.

`library/{requirement_id}/04-交付总结/{requirement_id}__交付总结.md` is the final
delivery summary. It must cover final scope, delivered artifacts, verification
results, residual risk, release or rollback notes, and next owner.

Both DocFlow artifacts must use stable-path internal versioning, include
Metadata, include `## 修订记录`, and be recorded or recommended in manifest
Artifact Index and Activity Log when produced.

## Creation Rules

Create or update these process products when:

- frontend or React Native behavior changes route, page, component, store, API,
  popup, visibility, error, loading, or visual behavior;
- implementation needs repeatable debug, mock, real data, or reproduction
  instructions;
- implementation introduces or changes logging, metrics, analytics, error
  observation, or debug logs;
- the pipeline needs a machine-readable status snapshot for downstream stages;
- final handoff or delivery summary is requested by the workflow or user.

For backend, ETL, or library changes, create only the process products that
carry real evidence. Do not create empty artifacts to satisfy a checklist.
