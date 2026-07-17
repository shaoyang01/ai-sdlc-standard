# Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Rollback Contract

## Status

`rollback_contract_only`

## Scope

Gateway real dispatch sidecar Phase-2 shadow enablement rollback contract only. This document defines the exact rollback contract a future shadow-only implementation PR must follow for `code_review` and `validation`. It does not implement Phase-2, enable Phase-2, execute rollback, or persist rollback/audit/guardrail/observability logs.

## Non-execution Guarantees

- no implementation now
- no real rollback execution now
- no rollback/audit/guardrail/observability log persistence now
- no Phase-2 enablement now
- no request type expansion now
- no flag enablement
- no Runtime/Gateway behavior change
- no Hermes dispatch eligibility change
- no package/script/CI enablement
- no persistence

## Rollback Decision Shape

```
{
  decision: "not_required" | "rollback_required" | "rollback_executed_by_operator" | "blocked",
  required: boolean,
  trigger: string enum,
  action: "omit_sidecar" | "disable_phase_2_shadow" | "preserve_primary_result" | "operator_manual_rollback" | "none",
  reason: string enum,
  sanitizedSummaryOnly: true,
  preservesGatewayPrimaryResult: true,
  preservesGatewayFinalResult: true,
  preservesRuntimeFinalStatus: true,
  preservesRuntimeRouting: true,
  containsRawPrompt: false,
  containsRawArtifacts: false,
  containsSecrets: false,
  containsStdoutStderrOrFullCliOutput: false,
  persistsLogs: false
}
```

## Rollback Triggers

- Hermes sidecar would affect Gateway primary result
- Hermes sidecar would affect Gateway final result
- Hermes sidecar would affect Runtime final_status
- Hermes sidecar would affect Runtime routing
- Hermes output would become final code_review decision
- Hermes output would become final validation decision
- unsupported request type reached Hermes path
- required Hermes flag missing after enablement
- operator approval missing after enablement
- raw prompt detected
- raw artifact detected
- secret detected
- stdout/stderr/full CLI output detected
- full warning text detected
- unsafe metadata detected
- sanitization failure detected
- dispatcher exception detected
- persistence attempted without separate contract
- package/script/CI flag enablement detected
- automatic rollout or enablement detected

## Rollback Actions

- omit Hermes sidecar
- preserve Gateway primary result
- preserve Gateway final result
- preserve Runtime final_status
- preserve Runtime routing
- disable future Phase-2 shadow attachment until operator review
- require operator manual rollback approval
- require post-rollback review before re-enable
- record only sanitized summary metadata if a later persistence contract exists
- do not persist rollback logs in this PR

*This PR defines actions only; it does not execute them. Any actual rollback execution requires a future implementation PR and operator-managed process.*

## Rollback Safety Rules

- Rollback is contract-only in this PR.
- Rollback must preserve Gateway primary/final result.
- Rollback must preserve Runtime final_status/routing.
- Rollback must not make Hermes final owner.
- Rollback must omit sidecar rather than degrade primary result.
- Rollback must disable future Phase-2 shadow attach until operator review when primary behavior impact is detected.
- Rollback must not persist logs without separate persistence contract.
- Rollback must not include raw prompt.
- Rollback must not include raw artifacts.
- Rollback must not include secrets.
- Rollback must not include stdout/stderr/full CLI output.
- Rollback must not include full warning text.
- Rollback must use sanitized reason enum.
- Rollback must use bounded status/category/count/boolean metadata.

## Prohibited Rollback Data

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

## Recommended Next PR

**Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Readiness Gate**
