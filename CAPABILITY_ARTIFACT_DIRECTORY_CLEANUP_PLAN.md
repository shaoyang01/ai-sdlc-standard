# Capability Artifact Directory Cleanup Plan

## Status

`cleanup_plan_only`

## Current Problem

The repository root currently contains many capability-related artifacts, including:

- Kimi capability, readiness, and contract Markdown/JSON files
- Hermes capability, readiness, and contract Markdown/JSON files
- Phase-2 shadow enablement Markdown/JSON files

These are **not temporary files**. They are evidence and reference artifacts that document the system's capability boundaries, contracts, and rollout decisions.

Keeping them in the root directory creates noise, increases review cost, and raises token usage during large reviews. They should be reorganized into capability-specific directories in a future, dedicated cleanup PR.

## Proposed Future Layout

```
docs/capabilities/hermes/
docs/capabilities/kimi/
docs/capabilities/shared/
metadata/capabilities/hermes/
metadata/capabilities/kimi/
metadata/capabilities/shared/
```

`docs/capabilities/` would hold human-readable Markdown evidence files.
`metadata/capabilities/` would hold machine-readable JSON contract/status files.

## What Stays in Root

Only high-level canonical entry files should remain in the repository root:

- `SYSTEM_STATUS.md`
- `SYSTEM_CAPABILITY_REVIEW.md`
- `runtime-capabilities.json`
- `real-agent-adapter-capability-matrix.json`
- `system-capability-review.json`
- `HERMES_PHASE_2_CONSOLIDATION.md`
- `README.md`
- `package.json`

## What Moves Later

Examples of files that should move into the proposed directories:

- `HERMES_GATEWAY_REAL_DISPATCH_*.md`
- `hermes-gateway-real-dispatch-*.json`
- `KIMI_GATEWAY_REAL_DISPATCH_*.md`
- `kimi-gateway-real-dispatch-*.json`

An exhaustive list is not required now; the future cleanup PR will inventory and move files.

## Migration Rules

A future migration PR must:

- Move files only.
- Preserve file contents exactly.
- Update any references or tests in the same PR.
- Not modify Runtime or Gateway behavior.
- Not modify agent implementations.
- Not enable any feature flags.
- Not delete evidence files.
- Keep redirects or reference notes if needed.

## Review Scope Reduction

Future reviews should default to these canonical files first:

- `execution/gateway.ts`
- `execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement.ts`
- `execution/types.ts`
- `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts`
- `tests/hermes-gateway-real-dispatch-gateway-integration.test.ts`
- `SYSTEM_STATUS.md`
- `SYSTEM_CAPABILITY_REVIEW.md`
- `HERMES_PHASE_2_CONSOLIDATION.md`

Individual evidence artifacts should be inspected only when directly modified.

## Non-goals

- No file moves in this PR.
- No file deletions in this PR.
- No Runtime changes.
- No Gateway changes.
- No implementation changes.
- No rollout plan.
- No new gate/checklist/runbook chain.
- No resumption of Hermes Phase-2 rollout planning.

## Recommended Next Step

Review this cleanup plan. If accepted, perform a dedicated file-move-only PR.
