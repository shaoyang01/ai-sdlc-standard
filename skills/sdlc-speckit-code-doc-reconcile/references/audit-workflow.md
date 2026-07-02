# Audit Workflow

## 1. Establish Scope

Define the exact scope before comparing:

- Requirement ID.
- Feature directory under `specs/**`.
- Code modules, files, commits, or diff range.
- DocFlow directories.
- Process product paths:
  `specs/{feature}/implementation.md`,
  `specs/{feature}/workflow-status.md`,
  `specs/{feature}/debug-guide.md`, and
  `specs/{feature}/observability.md`.
- Knowledge target paths.
- Whether the audit is full lifecycle or focused on one suspected drift.

## 2. Build Artifact Inventory

Create an inventory with:

- Path.
- Version or timestamp.
- Current or stale state.
- Gate result.
- Source owner.
- Evidence available.

Mark missing artifacts as gaps. Do not infer absent artifacts from chat.

When `.specify/entry-coverage-profile.yaml` exists, run or reuse the standard entry coverage audit:

```bash
${AI_SDLC_STANDARD_HOME}/scripts/audit-entry-coverage.rb <target-project-path>
```

Include these generated files in the artifact inventory:

- `.specify/reports/entry_coverage/entry_inventory.tsv`
- `.specify/reports/entry_coverage/service_inventory.tsv`
- `.specify/reports/entry_coverage/entry_chain_evidence.md`
- `.specify/reports/entry_coverage/unarchived_entries.md`
- `.specify/reports/entry_coverage/unarchived_services.md`
- `.specify/reports/entry_coverage/cross_domain_conflicts.md`
- `.specify/reports/entry_coverage/entry_coverage_report.md`

## 3. Compare By Behavior

Compare artifacts at the behavior level, not only by file presence:

- Business rule.
- Input and output contract.
- Failure behavior.
- Authorization and data visibility.
- Data model, schema, or persistence.
- Idempotency, retry, and transaction behavior.
- Rollback and compatibility.
- Verification requirements.
- Frontend route, page, component, store, API, popup, visibility, backend/mock
  boundary, and visual verification behavior when applicable.
- Debug, reproduction, mock/real data switching, logging, metrics, frontend
  analytics, error state observation, and debug logs when applicable.

## 4. Trace Tasks To Code

For each implemented task:

- Confirm task exists in current `tasks.md`.
- Confirm task maps to spec and plan.
- Confirm changed code matches the task.
- Confirm verification exists for completed task status.
- Flag untracked code changes as `CODE_DRIFT` unless explicitly out of scope and unrelated.

## 5. Trace Code To Documents

For relevant code behavior:

- Locate supporting spec, plan, task, or DocFlow statement.
- Locate implementation record evidence.
- Locate process product evidence from `implementation.md`, `debug-guide.md`,
  and `observability.md`.
- Locate test or verification evidence.
- Locate synced knowledge fact, when applicable.

Classify any behavior without approved basis.

## 5.1 Trace Process Products To Code And Manifest

Process Product Drift must be evaluated against approved artifacts, the actual
code diff, and manifest.

For each new-rail process product:

- `specs/{feature}/implementation.md`: confirm file changes, technical
  decisions, frontend state, interaction behavior, and backend/mock boundary
  match the actual diff and approved tasks.
- `specs/{feature}/workflow-status.md`: confirm it is only a machine-side
  snapshot and that manifest is status authority. Any mismatch with manifest
  Current Stage, Current Status, Activity Log, Gate Records, Re-Gate Records, or
  Blocking Issues is `MANIFEST_DRIFT` or process product drift.
- `specs/{feature}/debug-guide.md`: confirm API debug steps, quick references,
  mock/real data switching, and reproduction steps still match the code and
  environment assumptions.
- `specs/{feature}/observability.md`: confirm logging, metrics, frontend
  analytics, error state observation, and debug logs match the implemented code
  or are explicitly not applicable.

Missing required frontend/RN process evidence should be recorded as a
documentation or process-product gap, not silently ignored.

## 6. Trace Knowledge To Evidence

For each changed or missing knowledge fact:

- Confirm the fact is reusable and stable.
- Confirm implementation and verification evidence exists.
- Confirm target ownership and authorization.
- Confirm no conflicting knowledge remains.

Route eligible missing facts to `sdlc-speckit-sync`.

## 7. Decide Result

Produce one primary classification and any secondary classifications.

Use `BLOCKED` when source-of-truth conflict prevents a safe decision.

Use entry coverage reports to classify drift:

- `unarchived_entries.md` non-empty: code entry exists without long-term knowledge coverage.
- `unarchived_services.md` non-empty: core unit lacks archived entry or accepted technical reason.
- `cross_domain_conflicts.md` non-empty: code/document routing conflict across L2 domains.
- `entry_coverage_report.md` status `BLOCKED`: reconciliation cannot mark code and business-domain docs consistent.
