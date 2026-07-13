# Hermes Gateway Real Dispatch Phase-2 Enablement Guard Contract

## Status

contract_only

## Scope

Gateway real dispatch sidecar Phase-2 enablement guard contract only. Defines the mandatory guard contract that any future implementation PR must satisfy before Phase-2 enablement for `code_review` and `validation` may proceed.

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
- **Phase-2 guard targets:** code_review, validation
- **Unsupported:** llm_task, code_generation, bugfix

## Required Guard Conditions

1. Phase-2 implementation must be in a separate future PR.
2. Phase-2 targets are exactly code_review and validation.
3. Current validated request type remains review until implementation PR.
4. All three Hermes flags must remain explicit and default-off.
5. Operator approval must be required.
6. Automatic enablement must be disallowed.
7. Gateway primary/final result must remain independent of Hermes sidecar.
8. Runtime final_status/routing must remain independent of Hermes sidecar.
9. Hermes must remain sidecar-only.
10. Hermes must not become final code_review or validation owner.
11. Unsupported request types must remain omitted.
12. Rollback and post-enablement review must be mandatory.

## Prohibited Implementation Behaviors

- Changing Runtime final_status.
- Changing Runtime routing.
- Changing Gateway primary dispatch result.
- Changing Gateway final result.
- Making Hermes default.
- Making Hermes final review/code_review/validation owner.
- Enabling any Hermes flag by default.
- Adding package/script/CI enablement.
- Persisting raw prompts, artifacts, secrets, stdout, stderr, or full CLI output.
- Persisting enablement/validation/review/audit/observability/guardrail logs without separate contract.
- Routing llm_task, code_generation, or bugfix to Hermes.
- Automatic Phase-2 validation, expansion, rollout, or enablement.

## Future Implementation Requirements

- Future implementation must remain feature-flagged.
- Future implementation must include shadow-first behavior.
- Future implementation must keep Hermes sidecar-only.
- Future implementation must preserve Gateway primary/final results.
- Future implementation must preserve Runtime final_status/routing.
- Future implementation must include tests for disabled, unsupported, unsafe, exception, code_review, and validation paths.
- Future implementation must include rollback tests.
- Future implementation must not call real Hermes CLI in tests.
- Future implementation must not add package/script/CI enablement.
- Future implementation must require a separate post-enablement review.

## Rollback Required When

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

## Recommended Next PR

**Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Implementation Plan**
