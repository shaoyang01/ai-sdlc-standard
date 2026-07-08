# Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Readiness Gate

## Status

`readiness_gate_only`

## Scope

Gateway real dispatch sidecar Phase-2 shadow enablement readiness gate only. This document defines the final readiness gate that must pass before any future shadow-only implementation PR for `code_review` and `validation` can proceed. It does not implement Phase-2, enable Phase-2, execute shadow enablement, execute readiness evaluation, or persist readiness/audit/rollback/guardrail/observability logs.

## Non-execution Guarantees

- no implementation now
- no real shadow enablement execution now
- no real readiness evaluation execution now
- no readiness/audit/rollback/guardrail/observability log persistence now
- no Phase-2 enablement now
- no request type expansion now
- no flag enablement
- no Runtime/Gateway behavior change
- no Hermes dispatch eligibility change
- no package/script/CI enablement
- no persistence

## Readiness Gate Decision Shape

```
{
  decision: "ready" | "not_ready" | "blocked",
  verdict: "READY_FOR_IMPLEMENTATION_PR" | "NOT_READY" | "BLOCKED",
  reason: string enum,
  sanitizedSummaryOnly: true,
  requiredInputsPresent: boolean,
  contractCoverageComplete: boolean,
  testPlanCoverageComplete: boolean,
  fixtureContractComplete: boolean,
  observabilityContractComplete: boolean,
  guardrailContractComplete: boolean,
  rollbackContractComplete: boolean,
  operatorApprovalRequired: true,
  implementationPrRequired: true,
  automaticEnablementAllowed: false,
  containsRawPrompt: false,
  containsRawArtifacts: false,
  containsSecrets: false,
  persistsLogs: false
}
```

## Required Gate Inputs

- Phase-2 shadow enablement implementation plan
- Phase-2 shadow enablement contract
- Phase-2 shadow enablement test plan
- Phase-2 shadow enablement fixture contract
- Phase-2 shadow enablement observability contract
- Phase-2 shadow enablement guardrail contract
- Phase-2 shadow enablement rollback contract
- operator approval requirement
- three required Hermes flags requirement
- sidecar-only ownership boundary
- no Runtime final_status/routing change boundary
- no Gateway primary/final result change boundary
- no raw prompt/artifact/secret boundary
- no persistence without separate contract boundary

## Pass Criteria

- all required gate inputs are present
- all prerequisite artifacts are contract/plan/checklist/runbook/template/review-only as expected
- current validated request type remains review only
- phase-2 targets are code_review and validation only
- Hermes remains sidecar-only
- Hermes does not own final review decision
- Hermes does not own final code_review decision
- Hermes does not own final validation decision
- future implementation PR is required
- operator approval is required
- automatic enablement is disallowed
- all three Hermes flags are required
- Runtime final_status/routing changes are disallowed
- Gateway primary/final result changes are disallowed
- raw prompt/artifact/secret exposure is disallowed
- stdout/stderr/full CLI output exposure is disallowed
- readiness/audit/rollback/guardrail/observability persistence is disallowed without separate contract

## Fail Criteria

- missing required prerequisite artifact
- missing test plan coverage
- missing fixture contract
- missing observability contract
- missing guardrail contract
- missing rollback contract
- unclear operator approval requirement
- unclear required flag requirement
- unclear sidecar-only boundary
- unclear ownership boundary
- unclear Runtime final_status/routing preservation
- unclear Gateway primary/final result preservation
- unclear raw prompt/artifact/secret prohibition
- unclear persistence boundary

## Blocked Criteria

- any current PR implementation of Phase-2 shadow enablement
- any current PR request type expansion
- any current PR feature flag enablement
- any current PR package/script/CI enablement
- any current PR Runtime behavior change
- any current PR Gateway behavior change
- any current PR Hermes dispatch eligibility change
- any current PR Hermes final ownership change
- any current PR raw prompt/artifact/secret persistence
- any current PR readiness/audit/rollback/guardrail/observability log persistence

## Required Future Implementation Tests

- disabled path omits sidecar
- missing each required flag omits sidecar
- missing operator approval omits sidecar
- unsupported llm_task/code_generation/bugfix omits sidecar
- unsafe metadata omits sidecar
- sanitization failure omits sidecar
- dispatcher exception omits sidecar
- code_review safe path attaches sanitized sidecar only
- validation safe path attaches sanitized sidecar only
- Gateway primary/final result unchanged for all paths
- Runtime final_status/routing unchanged for all paths
- Hermes output never final code_review decision
- Hermes output never final validation decision
- no raw prompt/artifact/secret/stdout/stderr/full CLI output
- rollback trigger coverage
- guardrail refusal coverage
- observability summary-only coverage
- no real Hermes CLI in tests
- no package/script/CI flag enablement

## Prohibited Readiness Data

- raw prompt
- raw artifact
- raw Hermes response
- raw validation payload
- secret
- credential
- token
- customer data
- stdout
- stderr
- full CLI output
- full warning text
- unsanitized error text
- unsanitized review payload
- unsanitized validation payload
- real API key
- environment variable value
- persisted audit log content
- persisted observability log content
- persisted guardrail log content
- persisted rollback log content
- persisted readiness log content

## Safety Rules

- Readiness gate is contract-only in this PR.
- Readiness gate does not execute evaluation in this PR.
- Readiness gate does not enable Phase-2 in this PR.
- Readiness gate does not change Runtime final_status/routing.
- Readiness gate does not change Gateway primary/final result.
- Readiness gate does not change Hermes dispatch eligibility.
- Readiness gate does not make Hermes final owner.
- Readiness gate requires a future implementation PR.
- Readiness gate requires operator approval.
- Readiness gate disallows automatic enablement.
- Readiness gate disallows package/script/CI flag enablement.
- Readiness gate must not persist logs without separate persistence contract.
- Readiness gate must not include raw prompt.
- Readiness gate must not include raw artifacts.
- Readiness gate must not include secrets.
- Readiness gate must not include stdout/stderr/full CLI output.
- Readiness gate must use sanitized reason enum.
- Readiness gate must use bounded status/category/count/boolean metadata.

## Recommended Next PR

**Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Implementation**
