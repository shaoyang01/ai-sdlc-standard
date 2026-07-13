# Hermes Gateway Real Dispatch Controlled Rollout Plan

## Status

plan_only

## Scope

Gateway real dispatch sidecar rollout plan only.

## Non-execution Guarantees

- This PR does not execute rollout.
- This PR does not enable feature flags.
- This PR does not change Runtime behavior.
- This PR does not change Gateway behavior.
- This PR does not call Hermes CLI.
- This PR does not persist rollout/audit/observability/guardrail logs.

## Required Readiness

READY_WITH_CONSTRAINTS

## Required Flags

- `SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled`
- `SDLC_HERMES_GATEWAY_INTEGRATION=enabled`
- `SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled`

## Rollout Phases

### phase_0_plan_only

- Allowed request types: none
- Required before next phase:
  - Controlled rollout plan reviewed and approved.
  - Readiness verdict remains READY_WITH_CONSTRAINTS.
- Rollback criteria:
  - Any request to enable flags in this PR.
  - Any runtime or Gateway behavior change in this PR.

### phase_1_local_fake_dispatcher_validation

- Allowed request types: `review`
- Required before next phase:
  - Local validation uses fake dispatcher only.
  - No real Hermes CLI is invoked.
  - Disabled and unsupported paths do not call dispatcher.
  - Sidecar remains omitted on unsafe/exception paths.
- Rollback criteria:
  - Fake validation shows primary Gateway result changes.
  - Any raw prompt/artifact/secret appears in sidecar metadata.

### phase_2_ci_fake_runner_validation

- Allowed request types: `review`
- Required before next phase:
  - CI validates fake runner/fake dispatcher only.
  - Warning limit rejection is covered.
  - Guardrails reject unsafe metadata.
- Rollback criteria:
  - CI invokes real Hermes CLI.
  - CI requires external services.

### phase_3_single_request_type_manual_enablement

- Allowed request types: `review`
- Required before next phase:
  - Manual enablement remains operator-controlled.
  - All three Hermes flags are explicitly enabled only in controlled environment.
  - Sidecar metadata is reviewed for attach/omit behavior.
- Rollback criteria:
  - Sidecar changes primary Gateway result.
  - Sidecar changes Runtime `final_status`/routing.
  - Dispatcher exception leaks raw text.

### phase_4_limited_operator_enablement

- Allowed request types: `review`, `code_review`, `validation`
- Required before next phase:
  - Operators confirm request-type bounded behavior.
  - No unsupported request types trigger dispatcher.
  - Guardrails remain below warning threshold.
- Rollback criteria:
  - Unsupported request type invokes dispatcher.
  - Warning limit exceeded repeatedly.
  - Any final review/validation ownership is inferred from sidecar output.

### phase_5_post_rollout_readiness_review

- Allowed request types: `review`, `code_review`, `validation`
- Required before next phase:
  - Post-rollout readiness review is completed.
  - Any move from sidecar metadata to decision ownership has a separate contract.
- Rollback criteria:
  - Rollout proposes Hermes as default.
  - Rollout proposes primary Gateway result ownership without separate contract.

## Global Rollback Criteria

- Any Hermes sidecar output changes Gateway primary result.
- Any Hermes sidecar output changes Gateway final result.
- Any Hermes sidecar output changes Runtime `final_status` or routing.
- Any unsupported request type invokes Hermes dispatcher.
- Any raw prompt, raw artifact, or secret appears in sidecar metadata.
- Any persisted rollout, audit, observability, or guardrail log is introduced without a separate contract.
- Any real Hermes CLI invocation appears in tests.
- Any feature flag becomes enabled by default.

## Constraints

- This PR is plan-only and does not execute rollout.
- Hermes remains Gateway sidecar metadata only.
- Hermes remains default-off and requires explicit flags.
- Hermes may initially roll out only for review request type.
- Expansion to `code_review` and `validation` requires operator approval.
- Hermes must not become final review or validation owner without a separate contract.
- Runtime `final_status` and routing must not depend on Hermes sidecar output.
- No rollout logs, audit logs, observability logs, or guardrail logs may persist without a separate contract.

## Not Included

- No rollout execution
- No flag enablement
- No runtime behavior change
- No Gateway behavior change
- No Hermes default routing
- No final review/validation ownership
- No persistence

## Recommended Next PR

Hermes Gateway Real Dispatch Rollout Validation Checklist
