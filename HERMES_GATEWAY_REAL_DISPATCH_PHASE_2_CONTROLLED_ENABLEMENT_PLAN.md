# Hermes Gateway Real Dispatch Phase-2 Controlled Enablement Plan

## Status

plan_only

## Scope

Gateway real dispatch sidecar Phase-2 controlled enablement plan only. Defines how a future PR may safely enable Phase-2 targets (`code_review`, `validation`) under operator control.

## Non-execution Guarantees

- No Phase-2 enablement now
- No request type expansion now
- No flag enablement
- No Runtime/Gateway behavior change
- No Hermes final ownership
- No package/script/CI enablement
- No persistence

## Current State

- **Readiness verdict:** READY_WITH_CONSTRAINTS
- **Current validated request type:** review only
- **Phase-2 targets:** code_review, validation
- **Unsupported:** llm_task, code_generation, bugfix

## Required Operator Gates

1. Operator approval must be recorded outside repository automation.
2. All three Hermes flags must be manually provided in a controlled environment.
3. Phase-2 targets are exactly code_review and validation.
4. Current validated request type remains review until a separate implementation PR.
5. Gateway primary/final result must remain independent of Hermes sidecar.
6. Runtime final_status/routing must remain independent of Hermes sidecar.
7. Hermes must remain sidecar-only.
8. Hermes must not become final code_review or validation owner.
9. Rollback criteria must be defined before any future enablement.
10. Post-enablement review must be required after future enablement.

## Manual Enablement Steps

1. Confirm Phase-2 final readiness review verdict is READY_WITH_CONSTRAINTS.
2. Confirm operator approval outside repository automation.
3. Prepare controlled environment.
4. Manually provide the three Hermes required flags.
5. Validate only code_review and validation targets.
6. Confirm unsupported request types remain omitted.
7. Confirm Gateway primary/final result is unchanged.
8. Confirm Runtime final_status/routing is unchanged.
9. Confirm Hermes sidecar metadata is nested under hermes_gateway_real_dispatch.
10. Stop immediately if any blocking condition occurs.

These steps are not executed by this PR. They must not be encoded into package scripts, CI, tests, or defaults.

## Rollback Triggers

- Hermes output becomes final code_review decision.
- Hermes output becomes final validation decision.
- Gateway primary result changes.
- Gateway final result changes.
- Runtime final_status or routing changes.
- Unsupported request type invokes Hermes dispatcher.
- Raw prompt, raw artifact, or secret appears in sidecar metadata.
- Any enablement/validation/audit/observability/guardrail log is persisted without separate contract.
- Any feature flag is enabled by default.
- Any package/script/CI path enables Hermes flags.

## Blocking Conditions

- Any Runtime or Gateway implementation change.
- Any actual request type expansion in this PR.
- Any feature flag enabled by default.
- Any package/script/CI enablement path.
- Any real Hermes CLI call in tests.
- Any Hermes output treated as final code_review or validation decision.
- Any raw prompt/artifact/secret collection.
- Any persisted enablement/review/validation/observability/guardrail log.
- Any unsupported request type routed to Hermes.
- Any automatic Phase-2 validation, expansion, rollout, or enablement.

## Recommended Next PR

**Hermes Gateway Real Dispatch Phase-2 Enablement Guard Contract**
