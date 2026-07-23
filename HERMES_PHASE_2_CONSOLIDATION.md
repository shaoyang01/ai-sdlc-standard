# Hermes Phase-2 Artifact Consolidation and Workflow Simplification

## Status

`consolidation_only`

Root placement classification: `DEFER_WITH_EXPLICIT_REASON` (see
`docs/CAPABILITY-REFERENCE-MATRIX.md`, section "Accepted Root Material
Classification").

This document is a consolidation/governance reference. It is **not** an
implementation fact authority, a current project status authority, a planning
authorization authority, an execution authorization authority, or a rollout
authorization authority.

## Authority Boundaries

- Current implementation facts: Git commit/tree/diff, tests, PRs, and CI.
- Current human-readable status: `docs/CURRENT_STATUS.md`.
- Repository structure and status authority model: `docs/REPOSITORY-STRUCTURE.md`.
- Capability path and migration ledger: `docs/CAPABILITY-REFERENCE-MATRIX.md`.
- `SYSTEM_STATUS.md`: historical snapshot — non-authoritative.
- `SYSTEM_CAPABILITY_REVIEW.md`: historical snapshot — non-authoritative.

## Historical Completed Phase (Shadow Enablement)

Historical: the following Hermes Gateway Real Dispatch Phase-2 shadow
enablement stages were completed:

- Shadow Enablement Implementation Plan
- Shadow Enablement Contract
- Shadow Enablement Test Plan
- Shadow Enablement Fixture Contract
- Shadow Enablement Observability Contract
- Shadow Enablement Guardrail Contract
- Shadow Enablement Rollback Contract
- Shadow Enablement Readiness Gate
- Shadow Enablement Implementation
- Shadow Enablement Validation
- Shadow Enablement Operator Acceptance
- Shadow Enablement Controlled Rollout Gate

## Historical Pause Decision (Superseded)

Historical: after the Controlled Rollout Gate, further Phase-2 rollout
progression was paused pending this consolidation. That pause decision has
since been superseded by the merged source facts below; it is retained here
only as historical context.

## Current Source Implementation Facts

The following are merged source implementation facts on the fact branch
(`feature/loop-runtime-v1`):

- PR #31: the plan-only Controlled Rollout Plan has entered the fact branch.
- PR #32: Topic 09 Task A — the structured approval gate has entered the fact branch.
- PR #33: Topic 09 Task B — the fixed synthetic payload, dedicated executor,
  and POSIX process runner have entered the fact branch.
- PR #34: Topic 09 Task C — the isolated process-local session entry has
  entered the fact branch.

Tasks A/B/C are isolated supporting capabilities; they are not an automatic
execution path of the Gateway or the Runtime:

- There is currently no Task C Gateway wiring.
- There is currently no Task C Runtime wiring.
- There is currently no real Hermes canary execution.
- There is currently no rollout execution.
- There is currently no Phase 3 execution.

The earlier Phase-2 shadow sidecar and the newer code-review canary are
distinct implementation paths.

Capability artifact directory migrations: the approved migration batches are
complete (see the migration ledger in `docs/CAPABILITY-REFERENCE-MATRIX.md`).
There is currently no new capability migration that must be executed before
document governance closure.

## Project Controller Governance State

The following is Project Controller governance state. It is not a code
implementation fact and not a permanent repository capability state:

- Topic 09 is currently frozen.
- Topic 09 Task D is currently on hold.
- The document governance stage is not yet closed.
- Project main-line resumption still waits for Topic 04 closure.

## Historical Minimal E2E Smoke Test Result

Historical: the minimal end-to-end SDLC flow smoke test passed in default
shadow/mock mode.

Validated:

- `requirement-summary` entry step
- `tech-design` planning step
- `implementation` step
- `code-review`/`review` representation
- `validation` step
- no real adapter flags required
- no Hermes final ownership
- no runtime skill inference for implementation

## Non-goals (Unchanged Boundaries)

This consolidation does not authorize:

- Runtime changes.
- Gateway changes.
- Hermes implementation changes.
- Rollout execution.
- Feature flag enablement.
- File moves.
- Deletion of existing evidence files.
