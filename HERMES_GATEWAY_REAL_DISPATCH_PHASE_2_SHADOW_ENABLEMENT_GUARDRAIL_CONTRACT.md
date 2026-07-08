# Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Guardrail Contract

## Status

`guardrail_contract_only`

## Scope

Gateway real dispatch sidecar Phase-2 shadow enablement guardrail contract only. This document defines the exact guardrail contract a future shadow-only implementation PR must follow for `code_review` and `validation`. It does not implement Phase-2, enable Phase-2, execute guardrails, or persist guardrail logs.

## Non-execution Guarantees

- no implementation now
- no real guardrail execution now
- no guardrail log persistence now
- no Phase-2 enablement now
- no request type expansion now
- no flag enablement
- no Runtime/Gateway behavior change
- no Hermes dispatch eligibility change
- no package/script/CI enablement
- no persistence

## Guardrail Decision Shape

```
{
  decision: "allow" | "omit" | "fallback" | "rollback_required",
  allowed: boolean,
  reason: string enum,
  checks: string[],
  warningCount: number,
  hasWarnings: boolean,
  fallbackAction: "omit_sidecar" | "preserve_primary_result" | "rollback_required" | "none",
  sanitizedSummaryOnly: true,
  containsRawPrompt: false,
  containsRawArtifacts: false,
  containsSecrets: false,
  containsStdoutStderrOrFullCliOutput: false
}
```

## Allowed Guardrail Decisions

- `allow` — allow sanitized sidecar attach only; Hermes remains sidecar-only and does not take final ownership.
- `omit` — omit sidecar and preserve primary Gateway result.
- `fallback` — fallback to primary Gateway result without Hermes sidecar.
- `rollback_required` — future implementation must trigger rollback process.

## Refusal Conditions

- missing required Hermes flag
- missing operator approval
- unsupported request type
- unsafe metadata
- sanitization failure
- dispatcher exception
- raw prompt detected
- raw artifact detected
- secret detected
- stdout/stderr/full CLI output detected
- full warning text detected
- Hermes output would change Gateway primary result
- Hermes output would change Gateway final result
- Hermes output would change Runtime final_status
- Hermes output would change Runtime routing
- Hermes output would become final code_review decision
- Hermes output would become final validation decision
- persistence attempted without separate contract
- package/script/CI enablement detected
- automatic enablement attempted

## Fallback Requirements

- Fallback must preserve Gateway primary result.
- Fallback must preserve Gateway final result.
- Fallback must preserve Runtime final_status.
- Fallback must preserve Runtime routing.
- Fallback must omit Hermes sidecar when guardrail fails.
- Fallback must not call real Hermes CLI in tests.
- Fallback must not persist guardrail/audit/observability logs.
- Fallback must not expose raw prompt/artifact/secret.
- Fallback must use sanitized reason enum.
- Fallback must record only count/boolean/status/category metadata.

## Guardrail Safety Rules

- Guardrails are sidecar decision metadata only.
- Guardrails must not change Gateway primary/final result.
- Guardrails must not change Runtime final_status/routing.
- Guardrails must not make Hermes final owner.
- Guardrails must not persist logs without separate contract.
- Guardrails must not include raw prompt.
- Guardrails must not include raw artifacts.
- Guardrails must not include secrets.
- Guardrails must not include stdout/stderr/full CLI output.
- Guardrails must not include full warning text.
- Guardrails must omit rather than leak unsafe data.
- Guardrails must fallback rather than degrade primary Gateway result.

## Prohibited Guardrail Data

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

## Recommended Next PR

**Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Rollback Contract**
