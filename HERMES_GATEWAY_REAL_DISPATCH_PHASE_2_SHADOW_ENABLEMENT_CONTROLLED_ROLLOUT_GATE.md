# Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Gate

## Status

`controlled_rollout_gate_only`

## Scope

Controlled rollout gate for the operator-accepted Phase-2 shadow sidecar attachment for `code_review` and `validation`. This artifact records the gate criteria an operator must review before any rollout execution. It does not execute rollout, does not execute operator actions, does not change Runtime/Gateway behavior, and does not enable any feature flags.

## Non-execution Guarantees

- no Phase-2 rollout execution
- no operator action execution
- no request type expansion beyond `code_review` / `validation` shadow sidecar
- no Runtime `final_status` / routing change
- no Gateway primary / final result change
- no Hermes final ownership
- no package / script / CI flag enablement
- no persistence
- no real Hermes CLI in tests

## Controlled Rollout Gate Checklist

| Name | Expected Outcome | Accepted By | Required |
|------|------------------|-------------|----------|
| operator acceptance artifact present | operator_accepts_present | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Gate | yes |
| implementation artifact present | operator_accepts_implementation_present | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Gate | yes |
| validation artifact present | operator_accepts_validation_present | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Gate | yes |
| rollout plan present | operator_accepts_rollout_plan_present | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Gate | yes |
| controlled rollout gate only | operator_accepts_gate_only | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Gate | yes |
| rollout not executed now | operator_accepts_rollout_not_executed | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Gate | yes |
| rollout plan required before execution | operator_accepts_rollout_plan_required | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Gate | yes |
| operator approval required | operator_accepts_operator_approval_required | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Gate | yes |
| three required Hermes flags required | operator_accepts_three_flags_required | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Gate | yes |
| default disabled validated | operator_accepts_default_disabled | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Gate | yes |
| unsupported request types validated | operator_accepts_omit_sidecar | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Gate | yes |
| sidecar-only validated | operator_accepts_sidecar_only | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Gate | yes |
| Gateway primary/final preservation validated | operator_accepts_preserved | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Gate | yes |
| Runtime final_status/routing preservation validated | operator_accepts_preserved | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Gate | yes |
| Hermes non-final-owner guarantee validated | operator_accepts_not_owner | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Gate | yes |
| raw prompt/artifact/secret leakage prevention validated | operator_accepts_no_leak | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Gate | yes |
| stdout/stderr/full CLI output/full warning text leakage prevention validated | operator_accepts_no_leak | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Gate | yes |
| no persistence validated | operator_accepts_no_persistence | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Gate | yes |
| no package/script/CI flag enablement validated | operator_accepts_no_enablement | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Gate | yes |
| no real Hermes CLI in tests validated | operator_accepts_fake_dispatcher_only | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Gate | yes |
| roadmap numbering continuity validated | operator_accepts_continuous | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Gate | yes |
| controlled rollout gate recorded as static artifact only | operator_accepts_static_artifact_only | Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Gate | yes |

## Required Controlled Rollout Gate Inputs

- operator acceptance status
- implementation status
- validation status
- rollout plan requirement
- controlled rollout gate requirement
- operator approval requirement
- three required Hermes flags requirement
- sidecar-only ownership boundary
- Gateway primary/final preservation guarantee
- Runtime final_status/routing preservation guarantee
- no raw prompt/artifact/secret guarantee
- no stdout/stderr/full CLI output/full warning text guarantee
- no persistence guarantee
- no package/script/CI flag enablement guarantee
- next rollout plan requirement

## Pass Criteria

- operator acceptance is present
- implementation is present
- validation is present
- rollout plan is present
- controlled rollout gate only
- rollout not executed
- rollout plan required before execution
- operator approval remains required
- all three Hermes flags remain required
- default remains disabled
- unsupported request types remain unsupported
- sidecar-only remains enforced
- Gateway primary/final result preservation is validated
- Runtime final_status/routing preservation is validated
- Hermes non-final-owner guarantee is validated
- leakage prevention is validated
- persistence prohibition is validated
- real Hermes CLI is not called in tests
- package/script/CI flag enablement is absent
- roadmap numbering is continuous
- future controlled rollout plan is required before any execution

## Reject Criteria

- operator acceptance missing
- implementation missing
- validation missing
- rollout plan missing
- rollout executed now
- rollout plan not required
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
- controlled rollout plan skipped

## Evidence

- `execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement-operator-acceptance.ts`
- `execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement.ts`
- `execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement-validation.ts`
- `execution/gateway.ts`
- `execution/types.ts`
- `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement-operator-acceptance.test.ts`
- `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts`
- `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement-validation.test.ts`
- `runtime-capabilities.json`
- `real-agent-adapter-capability-matrix.json`
- `SYSTEM_STATUS.md`
- `SYSTEM_CAPABILITY_REVIEW.md`
- `system-capability-review.json`

## Prohibited Controlled Rollout Gate Behaviors

- Executing rollout.
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
- Skipping future controlled rollout plan.

## Recommended Next PR

**Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Plan**
