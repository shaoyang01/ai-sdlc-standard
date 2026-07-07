# Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Implementation Plan

## Status

plan_only

## Scope

Gateway real dispatch sidecar Phase-2 shadow enablement implementation plan only. Defines how a future PR should safely implement shadow-only Phase-2 enablement for `code_review` and `validation` without changing primary Gateway/Runtime outcomes.

## Non-execution Guarantees

- No implementation now
- No Phase-2 enablement now
- No request type expansion now
- No flag enablement
- No Runtime/Gateway behavior change
- No Hermes dispatch eligibility change
- No package/script/CI enablement
- No persistence

## Current State

- **Readiness verdict:** READY_WITH_CONSTRAINTS
- **Current validated request type:** review only
- **Phase-2 shadow targets:** code_review, validation
- **Unsupported:** llm_task, code_generation, bugfix

## Implementation Phases

1. Add shadow-only eligibility contract for code_review and validation.
2. Add disabled-by-default guard checks.
3. Add sidecar-only attach/omit behavior for Phase-2 targets.
4. Add observability and guardrail summary checks.
5. Add fake-runner tests for disabled, unsupported, unsafe, exception, code_review, and validation paths.
6. Add rollback and post-enablement review requirements.

These phases are not implemented by this PR.

## Required Shadow Behaviors

- Shadow sidecar may attach only under explicit flags and operator-approved conditions.
- Shadow sidecar must never change Gateway primary/final result.
- Shadow sidecar must never change Runtime final_status/routing.
- Shadow sidecar must remain nested under `hermes_gateway_real_dispatch`.
- Shadow sidecar must omit when disabled.
- Shadow sidecar must omit unsupported request types.
- Shadow sidecar must omit unsafe metadata.
- Shadow sidecar must omit on exception.
- Hermes output must not be final code_review decision.
- Hermes output must not be final validation decision.

## Required Test Coverage

- disabled path
- unsupported request type path
- unsafe metadata path
- exception path
- code_review shadow attach path
- validation shadow attach path
- Gateway primary/final unchanged
- Runtime final_status/routing unchanged
- no real Hermes CLI in tests
- no package/script/CI flag enablement
- rollback trigger coverage

## Prohibited Implementation Behaviors

- Changing Runtime final_status.
- Changing Runtime routing.
- Changing Gateway primary dispatch result.
- Changing Gateway final result.
- Changing Hermes dispatch eligibility in this PR.
- Making Hermes default.
- Making Hermes final review/code_review/validation owner.
- Enabling any Hermes flag by default.
- Adding package/script/CI enablement.
- Persisting raw prompts, artifacts, secrets, stdout, stderr, or full CLI output.
- Persisting enablement/validation/review/audit/observability/guardrail logs without separate contract.
- Routing llm_task, code_generation, or bugfix to Hermes.
- Automatic Phase-2 validation, expansion, rollout, or enablement.

## Rollback Required When

- Hermes output becomes final code_review decision.
- Hermes output becomes final validation decision.
- Gateway primary result changes.
- Gateway final result changes.
- Runtime final_status or routing changes.
- Unsupported request type invokes Hermes dispatcher.
- Raw prompt, raw artifact, or secret appears in sidecar metadata.
- Any enablement, validation, audit, observability, or guardrail log is persisted without separate contract.
- Any feature flag is enabled by default.
- Any package/script/CI path enables Hermes flags.

## Recommended Next PR

**Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Contract**
