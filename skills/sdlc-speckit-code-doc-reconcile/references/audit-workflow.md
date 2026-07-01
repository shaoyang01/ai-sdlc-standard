# Audit Workflow

## 1. Establish Scope

Define the exact scope before comparing:

- Requirement ID.
- Feature directory under `specs/**`.
- Code modules, files, commits, or diff range.
- DocFlow directories.
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
- Locate test or verification evidence.
- Locate synced knowledge fact, when applicable.

Classify any behavior without approved basis.

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
