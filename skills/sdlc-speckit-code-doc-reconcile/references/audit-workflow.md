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
