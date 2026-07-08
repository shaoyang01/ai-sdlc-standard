# Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Validation

## Status

`validation_only`

## Scope

Validation of the implemented Phase-2 shadow sidecar attachment for `code_review` and `validation`. This artifact only records the validation contract; it does not execute Phase-2 shadow enablement, does not change Runtime/Gateway behavior, and does not enable any feature flags.

## Non-execution Guarantees

- no Phase-2 enablement by default
- no request type expansion beyond `code_review` / `validation` shadow sidecar
- no Runtime `final_status` / routing change
- no Gateway primary / final result change
- no Hermes final ownership
- no package / script / CI flag enablement
- no persistence
- no real Hermes CLI in tests

## Implementation Under Validation

- `execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement.ts`
- `execution/gateway.ts`
- `execution/types.ts`

## Validation Matrix

| Name | Expected Outcome | Validated By | Required |
|------|------------------|--------------|----------|
| disabled path | omit_sidecar | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |
| missing SDLC_HERMES_GATEWAY_REAL_DISPATCH | omit_sidecar | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |
| missing SDLC_HERMES_GATEWAY_INTEGRATION | omit_sidecar | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |
| missing SDLC_HERMES_CLI_COMMAND_EXECUTION | omit_sidecar | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |
| missing operator approval | omit_sidecar | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |
| unsupported llm_task | omit_sidecar | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |
| unsupported code_generation | omit_sidecar | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |
| unsupported bugfix | omit_sidecar | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |
| unsafe metadata | omit_sidecar | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |
| sanitization failure | omit_sidecar | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |
| dispatcher exception | omit_sidecar | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |
| guardrail refusal | omit_sidecar | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |
| rollback required | omit_sidecar | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |
| safe code_review attach | attach_sanitized_sidecar | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |
| safe validation attach | attach_sanitized_sidecar | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |
| raw prompt leakage prevention | no_leak | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |
| raw artifact leakage prevention | no_leak | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |
| secret leakage prevention | no_leak | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |
| stdout/stderr/full CLI output prevention | no_leak | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |
| full warning text prevention | no_leak | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |
| Gateway primary/final preservation | preserved | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |
| Runtime final_status/routing preservation | preserved | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |
| Hermes non-final-owner guarantee | not_owner | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |
| no persistence guarantee | no_persistence | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |
| no real Hermes CLI in tests | fake_dispatcher_only | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |
| no package/script/CI flag enablement | no_enablement | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |
| roadmap numbering continuity | continuous | `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts` | yes |

## Pass Criteria

- disabled path omits sidecar
- missing each required flag omits sidecar
- missing operator approval omits sidecar
- unsupported request types omit sidecar
- unsafe metadata omits sidecar
- sanitization failure omits sidecar
- dispatcher exception omits sidecar
- guardrail refusal omits sidecar
- rollback required omits sidecar
- safe `code_review` attaches sanitized sidecar only
- safe `validation` attaches sanitized sidecar only
- Gateway primary/final result unchanged
- Runtime `final_status` / routing unchanged
- Hermes output never final `code_review` decision
- Hermes output never final `validation` decision
- sidecar contains no raw prompt
- sidecar contains no raw artifact
- sidecar contains no secret
- sidecar contains no stdout/stderr/full CLI output
- sidecar contains no full warning text
- no readiness/audit/rollback/guardrail/observability/review/validation persistence
- no real Hermes CLI in tests
- no package/script/CI flag enablement
- roadmap numbering continuous

## Failure Criteria

- sidecar attaches when disabled
- sidecar attaches with missing flag
- sidecar attaches without operator approval
- unsupported request type reaches Phase-2 sidecar
- unsafe metadata reaches sidecar
- sanitization failure reaches sidecar
- dispatcher exception attaches sidecar
- guardrail refusal attaches sidecar
- rollback required attaches sidecar
- Hermes output changes Gateway primary result
- Hermes output changes Gateway final result
- Hermes output changes Runtime `final_status`
- Hermes output changes Runtime routing
- Hermes output becomes final `code_review` decision
- Hermes output becomes final `validation` decision
- raw prompt leaks into sidecar
- raw artifact leaks into sidecar
- secret leaks into sidecar
- stdout/stderr/full CLI output leaks into sidecar
- full warning text leaks into sidecar
- any persistence is added
- real Hermes CLI is called in tests
- package/script/CI flag enablement is added
- roadmap numbering jumps

## Evidence

- `execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement.ts`
- `execution/gateway.ts`
- `execution/types.ts`
- `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement.test.ts`
- `tests/hermes-gateway-real-dispatch-gateway-integration.test.ts`
- `runtime-capabilities.json`
- `real-agent-adapter-capability-matrix.json`
- `SYSTEM_STATUS.md`
- `SYSTEM_CAPABILITY_REVIEW.md`
- `system-capability-review.json`

## Prohibited Validation Behaviors

- Enabling Hermes flags by default.
- Adding package scripts that set Hermes flags.
- Adding CI env that sets Hermes flags.
- Calling real Hermes CLI in tests.
- Reading real API keys.
- Spawning real external processes.
- Persisting readiness/audit/rollback/guardrail/observability/review/validation logs.
- Changing Runtime `final_status`.
- Changing Runtime routing.
- Changing Gateway primary dispatch.
- Changing Gateway final result.
- Making Hermes final review owner.
- Making Hermes final `code_review` owner.
- Making Hermes final `validation` owner.
- Routing `llm_task` / `code_generation` / `bugfix` to Hermes.
- Storing raw prompt / artifact / secret / stdout / stderr / full CLI output / full warning text.

## Recommended Next PR

**Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Operator Acceptance**
