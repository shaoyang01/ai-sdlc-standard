# Hermes Phase-2 Artifact Consolidation and Workflow Simplification

## Status

`consolidation_only`

## Current Completed Phase

The following Hermes Gateway Real Dispatch Phase-2 shadow enablement stages are complete:

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

## Pause Decision

Further Hermes Phase-2 rollout progression is paused after the Controlled Rollout Gate.
The Controlled Rollout Plan is deferred.
No new rollout, gate, checklist, runbook, or execution-path artifact should be added until this consolidation is reviewed.

## Canonical Sources

For future Hermes Phase-2 review and small fixes, treat these files as canonical:

- `execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement.ts`
- `execution/gateway.ts`
- `execution/types.ts`
- `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts`
- `tests/hermes-gateway-real-dispatch-gateway-integration.test.ts`
- `SYSTEM_STATUS.md`
- `SYSTEM_CAPABILITY_REVIEW.md`

All other phase-specific `md`/`json` artifacts are evidence/reference files, not primary review targets unless directly modified.

## Future Prompt Modes

### Small Fix Mode

Use this mode for targeted changes:

- Modify only the files explicitly requested.
- Do not update global metadata unless a test fails because of it.
- Do not modify `package.json` unless required.
- Do not create new artifacts.
- Do not add tests unless required.
- Do not move files.
- Do not change the recommended next PR unless explicitly requested.

### Stage Artifact Mode

Use this mode if a future stage artifact is truly needed:

- Require explicit user approval before creating `ts`/`md`/`json`/`test` quartets.
- Avoid duplicate `md`/`json`/`ts` artifacts when one consolidated artifact can represent the stage.
- Prevent current/next stage wording drift.
- Forbid claiming that future artifacts are already present.

## Future Directory Cleanup Proposal

Later, after consolidation is accepted, consider moving evidence files into capability directories:

- `docs/capabilities/hermes/`
- `docs/capabilities/kimi/`
- `metadata/capabilities/hermes/`
- `metadata/capabilities/kimi/`

This cleanup is proposed only; do not move or delete files in this PR.

## Non-goals

- No Runtime changes.
- No Gateway changes.
- No Hermes implementation changes.
- No rollout execution.
- No feature flag enablement.
- No file moves in this PR.
- No deletion of existing evidence files in this PR.

## Minimal E2E Smoke Test Result

The minimal end-to-end SDLC flow smoke test passed in default shadow/mock mode.

Validated:

- `requirement-summary` entry step
- `tech-design` planning step
- `implementation` step
- `code-review`/`review` representation
- `validation` step
- no real adapter flags required
- no Hermes final ownership
- no runtime skill inference for implementation

## Recommended Next Step

Review this consolidation, then decide whether to:

1. Perform the proposed directory cleanup, or
2. Resume rollout planning with a lighter artifact set.
