# Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance

## Status

`operator_acceptance_only`

## Scope

Operator acceptance of the validated Phase-2 shadow sidecar attachment for `code_review` and `validation`. This artifact records the acceptance criteria and checklist an operator must review before any broader rollout. It does not execute operator actions, does not change Runtime/Gateway behavior, and does not enable any feature flags.

## Non-execution Guarantees

- no Phase-2 enablement by default
- no operator action execution
- no request type expansion beyond `code_review` / `validation` shadow sidecar
- no Runtime `final_status` / routing change
- no Gateway primary / final result change
- no Hermes final ownership
- no package / script / CI flag enablement
- no persistence
- no real Hermes CLI in tests

## Operator Acceptance Checklist

| Name | Expected Outcome | Accepted By | Required |
|------|------------------|-------------|----------|
| implementation artifact present | operator_accepts_implementation_present | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance | yes |
| validation artifact present | operator_accepts_validation_present | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance | yes |
| disabled path validated | operator_accepts_omit_sidecar | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance | yes |
| missing flag paths validated | operator_accepts_omit_sidecar | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance | yes |
| missing operator approval validated | operator_accepts_omit_sidecar | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance | yes |
| unsupported request types validated | operator_accepts_omit_sidecar | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance | yes |
| unsafe metadata validated | operator_accepts_omit_sidecar | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance | yes |
| sanitization failure validated | operator_accepts_omit_sidecar | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance | yes |
| dispatcher exception validated | operator_accepts_omit_sidecar | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance | yes |
| guardrail refusal validated | operator_accepts_omit_sidecar | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance | yes |
| rollback required validated | operator_accepts_omit_sidecar | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance | yes |
| safe code_review attach validated | operator_accepts_sanitized_sidecar_only | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance | yes |
| safe validation attach validated | operator_accepts_sanitized_sidecar_only | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance | yes |
| raw prompt leakage prevention validated | operator_accepts_no_leak | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance | yes |
| raw artifact leakage prevention validated | operator_accepts_no_leak | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance | yes |
| secret leakage prevention validated | operator_accepts_no_leak | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance | yes |
| stdout/stderr/full CLI output prevention validated | operator_accepts_no_leak | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance | yes |
| full warning text prevention validated | operator_accepts_no_leak | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance | yes |
| Gateway primary/final preservation validated | operator_accepts_preserved | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance | yes |
| Runtime final_status/routing preservation validated | operator_accepts_preserved | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance | yes |
| Hermes non-final-owner guarantee validated | operator_accepts_not_owner | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance | yes |
| no persistence validated | operator_accepts_no_persistence | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance | yes |
| no real Hermes CLI in tests validated | operator_accepts_fake_dispatcher_only | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance | yes |
| no package/script/CI flag enablement validated | operator_accepts_no_enablement | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance | yes |
| roadmap numbering continuity validated | operator_accepts_continuous | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance | yes |
| operator acceptance recorded as static artifact only | operator_accepts_static_artifact_only | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance | yes |

## Required Operator Inputs

- implementation status
- validation status
- validation matrix
- pass criteria
- failure criteria
- operator approval requirement
- three required Hermes flags requirement
- sidecar-only ownership boundary
- Gateway primary/final preservation guarantee
- Runtime final_status/routing preservation guarantee
- no raw prompt/artifact/secret guarantee
- no stdout/stderr/full CLI output/full warning text guarantee
- no persistence guarantee
- no package/script/CI flag enablement guarantee
- next rollout gate requirement

## Pass Criteria

- implementation is present
- validation is present
- implementation remains sidecar-only
- validation remains validation-only
- operator approval remains required
- all three Hermes flags remain required
- default remains disabled
- unsupported request types remain unsupported
- Gateway primary/final result preservation is validated
- Runtime final_status/routing preservation is validated
- Hermes non-final-owner guarantee is validated
- leakage prevention is validated
- persistence prohibition is validated
- real Hermes CLI is not called in tests
- package/script/CI flag enablement is absent
- roadmap numbering is continuous
- future controlled rollout gate is required before broader rollout

## Reject Criteria

- implementation missing
- validation missing
- operator approval no longer required
- one or more required Hermes flags missing
- Phase-2 enabled by default
- unsupported request types included
- Hermes becomes final review/code_review/validation owner
- Gateway primary/final result preservation not guaranteed
- Runtime final_status/routing preservation not guaranteed
- raw prompt/artifact/secret leakage risk unresolved
- stdout/stderr/full CLI output/full warning text leakage risk unresolved
- persistence introduced
- real Hermes CLI called in tests
- package/script/CI flag enablement introduced
- roadmap numbering jumps
- controlled rollout gate skipped

## Evidence

- `execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement.ts`
- `execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement-validation.ts`
- `execution/gateway.ts`
- `execution/types.ts`
- `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts`
- `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement-validation.test.ts`
- `runtime-capabilities.json`
- `real-agent-adapter-capability-matrix.json`
- `SYSTEM_STATUS.md`
- `SYSTEM_CAPABILITY_REVIEW.md`
- `system-capability-review.json`

## Prohibited Operator Acceptance Behaviors

- Executing operator actions.
- Enabling Hermes flags by default.
- Adding package scripts that set Hermes flags.
- Adding CI env that sets Hermes flags.
- Calling real Hermes CLI in tests.
- Reading real API keys.
- Spawning real external processes.
- Persisting readiness/audit/rollback/guardrail/observability/review/validation/operator logs.
- Changing Runtime `final_status`.
- Changing Runtime routing.
- Changing Gateway primary dispatch.
- Changing Gateway final result.
- Making Hermes final review owner.
- Making Hermes final `code_review` owner.
- Making Hermes final `validation` owner.
- Routing `llm_task` / `code_generation` / `bugfix` to Hermes.
- Storing raw prompt / artifact / secret / stdout / stderr / full CLI output / full warning text.
- Skipping future controlled rollout gate.

## Recommended Next PR

**Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Gate**
