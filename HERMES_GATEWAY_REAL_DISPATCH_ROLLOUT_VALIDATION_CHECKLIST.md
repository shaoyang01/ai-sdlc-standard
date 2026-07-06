# Hermes Gateway Real Dispatch Rollout Validation Checklist

## Status

checklist_only

## Scope

Gateway real dispatch sidecar rollout validation only.

## Non-execution Guarantees

- This PR does not execute rollout.
- This PR does not enable feature flags.
- This PR does not change Runtime behavior.
- This PR does not change Gateway behavior.
- This PR does not call Hermes CLI.
- This PR does not persist validation/rollout/audit/observability/guardrail logs.

## Required Readiness

READY_WITH_CONSTRAINTS

## Required Rollout Plan Status

plan_only

## Required Flags

- `SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled`
- `SDLC_HERMES_GATEWAY_INTEGRATION=enabled`
- `SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled`

## Validation Gates

### non_execution_guard

- Category: non_execution
- Description: Validate this checklist does not execute rollout, enable flags, call CLI, or mutate runtime state.
- Validation method: Static review of checklist artifacts, metadata, package scripts, and forbidden implementation files.
- Pass criteria:
  - Checklist PR contains only checklist artifacts, metadata, and tests.
  - Runtime and Gateway implementation files are unchanged.
  - No feature flags are enabled by default.
- Fail criteria:
  - Runtime or Gateway behavior changes.
  - Any rollout execution is introduced.
  - Any CLI invocation is added to tests.

### feature_flag_gate

- Category: feature_flags
- Description: Validate Hermes dispatch still requires all explicit Hermes flags.
- Validation method: Compare required flag metadata and checklist artifacts against the three-flag dispatch contract.
- Pass criteria:
  - Required flags remain exactly three.
  - No default-on flag behavior exists.
  - Operator enablement requires explicit environment configuration.
- Fail criteria:
  - Any required flag is removed.
  - Any flag becomes default enabled.
  - Any new production flag path bypasses the three-flag gate.

### request_scope_gate

- Category: request_scope
- Description: Validate initial validation is review-only and unsupported request types never call dispatcher.
- Validation method: Static metadata review plus existing fake dispatcher coverage for supported and unsupported request types.
- Pass criteria:
  - Initial validation request types equal review only.
  - Supported request types remain review/code_review/validation.
  - Unsupported request types remain llm_task/code_generation/bugfix.
- Fail criteria:
  - Initial validation includes code_review or validation without approval.
  - llm_task/code_generation/bugfix can trigger Hermes dispatcher.

### gateway_runtime_safety_gate

- Category: gateway_runtime_safety
- Description: Validate Hermes sidecar cannot affect Gateway primary/final result or Runtime final_status/routing.
- Validation method: Review sidecar-only metadata contracts and Gateway integration tests for primary result preservation.
- Pass criteria:
  - Gateway primary dispatch remains unchanged.
  - Gateway final result remains unchanged.
  - Runtime final_status and routing remain independent of Hermes sidecar.
- Fail criteria:
  - Hermes sidecar output changes primary Gateway result.
  - Hermes sidecar output changes Runtime final_status/routing.

### sidecar_metadata_safety_gate

- Category: sidecar_metadata_safety
- Description: Validate fallbackPolicy, observability, and guardrails remain nested sidecar metadata only.
- Validation method: Static artifact review plus existing sidecar field and raw-leak regression tests.
- Pass criteria:
  - Sidecar field remains hermes_gateway_real_dispatch.
  - fallbackPolicy/observability/guardrails are nested under sidecar only.
  - No top-level fallback/observability/guardrails fields exist.
  - No raw prompt/artifact/secret appears in sidecar metadata.
- Fail criteria:
  - Any top-level metadata field appears.
  - Any raw prompt/artifact/secret appears.

### test_safety_gate

- Category: test_safety
- Description: Validate tests use fake dispatcher/fake runner only and never call real Hermes CLI.
- Validation method: Review test runners, injected fakes, and forbidden CLI invocation assertions.
- Pass criteria:
  - Fake dispatcher tests remain present.
  - Fake runner tests remain present.
  - No real Hermes CLI is invoked in tests.
- Fail criteria:
  - Tests invoke real Hermes CLI.
  - Tests require external services.

### rollback_readiness_gate

- Category: rollback_readiness
- Description: Validate rollback criteria are defined before any operator enablement.
- Validation method: Review global failure criteria and rollout plan rollback criteria coverage.
- Pass criteria:
  - Rollback criteria include primary Gateway result change.
  - Rollback criteria include Runtime final_status/routing change.
  - Rollback criteria include raw prompt/artifact/secret leakage.
  - Rollback criteria include unsupported request type dispatcher invocation.
- Fail criteria:
  - Rollback criteria are absent.
  - Rollback criteria omit Gateway/Runtime safety violations.

### operator_approval_gate

- Category: operator_approval
- Description: Validate no rollout can proceed automatically.
- Validation method: Review checklist metadata for explicit operator approval and automatic enablement denial.
- Pass criteria:
  - Operator approval is required.
  - rolloutMayProceedAutomatically is false.
  - automaticEnablementAllowed is false.
- Fail criteria:
  - Any automatic enablement path is introduced.
  - Any phase proceeds without operator approval.

## Global Failure Criteria

- Runtime or Gateway implementation files change in this checklist PR.
- Any Hermes feature flag becomes enabled by default.
- Any real Hermes CLI invocation is introduced in tests.
- Any unsupported request type can invoke Hermes dispatcher.
- Any Hermes sidecar output changes Gateway primary result.
- Any Hermes sidecar output changes Gateway final result.
- Any Hermes sidecar output changes Runtime `final_status` or routing.
- Any raw prompt, raw artifact, or secret appears in sidecar metadata.
- Any validation, rollout, audit, observability, or guardrail log is persisted without a separate contract.
- Any automatic rollout or automatic feature flag enablement path is introduced.

## Checklist Constraints

- This PR is checklist-only and does not execute rollout.
- This PR does not enable Hermes feature flags.
- Hermes remains Gateway sidecar metadata only.
- Hermes remains default-off and requires explicit flags.
- Initial validation is review-only.
- Expansion to `code_review` and `validation` requires operator approval.
- Hermes must not become final review or validation owner without a separate contract.
- Runtime `final_status` and routing must not depend on Hermes sidecar output.
- No validation, rollout, audit, observability, or guardrail logs may persist without a separate contract.
- No rollout may proceed automatically.

## Not Included

- No rollout execution
- No flag enablement
- No runtime behavior change
- No Gateway behavior change
- No Hermes default routing
- No final review/validation ownership
- No persistence
- No automatic rollout

## Recommended Next PR

Hermes Gateway Real Dispatch Operator Runbook
