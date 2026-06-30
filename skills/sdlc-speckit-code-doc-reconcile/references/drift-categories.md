# Drift Categories

## `CONSISTENT`

Use when inspected code, `specs/**`, DocFlow artifacts, knowledge targets, and manifest state agree for the audited scope.

Routing:

- No Re-Gate required.
- Recommend normal next step such as code review, test acceptance, or release reporting.

## `CODE_DRIFT`

Use when production code behavior, diff, tests, or task status does not match approved spec, plan, tasks, or DocFlow.

Examples:

- Code implements behavior not present in `tasks.md`.
- Code omits approved behavior.
- Code contradicts rollback, compatibility, idempotency, transaction, failure, or authorization requirements.
- Task status is marked complete without corresponding code or verification.

Routing:

- Return to `sdlc-speckit-implement` for code correction when the approved artifacts are clear.
- Return to upstream Re-Gate when approved artifacts are insufficient or contradictory.

## `SPEC_DRIFT`

Use when `specs/**` is stale or inconsistent with approved DocFlow and change-control records.

Examples:

- Approved solution changed, but `spec.md` still reflects an older scope.
- `plan.md` or `tasks.md` misses approved behavior.
- `tasks.md` includes work not justified by spec or plan.

Routing:

- Return to `sdlc-speckit-specify`, `sdlc-speckit-plan`, or `sdlc-speckit-tasks`.
- Do not let implementation continue until the machine source is corrected and re-analyzed.

## `DOCFLOW_DRIFT`

Use when DocFlow artifacts or Gate records no longer reflect the active approved state.

Examples:

- `01-技术方案` was superseded but manifest still points to it as current.
- `02-方案审核` lacks the current risk acceptance.
- A Re-Gate decision exists but the old Gate result remains presented as active.

Routing:

- Return to `sdlc-specification-writer`, `sdlc-solution-reviewer`, or `sdlc-gate-runner`.
- Update DocFlow only with explicit authorization.

## `KNOWLEDGE_DRIFT`

Use when long-term knowledge targets miss verified reusable facts or contain facts contradicted by the current approved implementation.

Examples:

- `.specify/business_domain/**` lacks a stable rule proven by implementation and tests.
- Knowledge document still describes obsolete behavior after an accepted change.
- Sync proposal exists but has not been applied or recorded.

Routing:

- Return to `sdlc-speckit-sync` for authorized sync.
- Stop if the target owner or path is unclear.

## `MANIFEST_DRIFT`

Use when `manifest.md` does not match the observed lifecycle state.

Examples:

- Activity Log lacks implementation, sync, or reconcile event.
- Change History omits an accepted scope change.
- Re-Gate Records do not point to superseded artifacts.
- Sync status is missing target path or result.

Routing:

- Recommend manifest update.
- Use `sdlc-docflow-writer` or the responsible stage Skill when a written artifact is required.

## `UNVERIFIED_FACT`

Use when a claimed behavior or document fact has no acceptable evidence.

Routing:

- Require implementation evidence, test evidence, code review evidence, or Gate decision.
- Do not sync or normalize the fact.

## `BLOCKED`

Use when reconciliation cannot reach a trustworthy result.

Examples:

- Approved sources conflict.
- Current code cannot be inspected.
- Required artifacts are missing.
- The user asks to treat unapproved code as truth.

Routing:

- Stop and name the missing decision or artifact.
- Recommend the earliest affected Gate.
