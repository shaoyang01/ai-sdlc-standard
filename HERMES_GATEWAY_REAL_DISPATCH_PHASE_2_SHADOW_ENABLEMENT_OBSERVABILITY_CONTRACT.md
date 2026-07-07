# Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Observability Contract

## Status

observability_contract_only

## Scope

Gateway real dispatch sidecar Phase-2 shadow enablement observability contract only.

## Non-execution Guarantees

- no implementation now
- no real observability collection now
- no observability log persistence now
- No Phase-2 enablement now
- No request type expansion now
- no flag enablement
- no Runtime/Gateway behavior change
- no Hermes dispatch eligibility change
- no package/script/CI enablement
- no persistence

## Allowed Observability Signals

Allowed only sanitized, bounded metadata signals:

- requestType
- sidecarDecision
- sidecarAttached
- sidecarOmitted
- omitReason
- fallbackPolicy.reason
- fallbackPolicy.action
- observability.outcome
- observability.warningCount
- observability.hasWarnings
- guardrails.decision
- guardrails.allowed
- guardrails.warningCount
- guardrails.checks
- operatorApprovalPresent
- requiredFlagsPresent
- sanitizationStatus
- metadataSafetyStatus
- dispatcherOutcome
- exceptionCategory

Notes:

- warningCount is allowed; full warning text is not allowed.
- Boolean/status/category/enum fields are allowed.
- Raw prompt/artifact/secret/stdout/stderr/full CLI output is not allowed.

## Prohibited Observability Signals

- raw prompt
- raw artifact
- raw Hermes response
- raw validation payload
- secrets
- credentials
- tokens
- customer data
- stdout
- stderr
- full CLI output
- full warning text
- unsanitized error text
- unsanitized review payload
- unsanitized validation payload
- real API keys
- environment variable values
- persisted audit log content
- persisted observability log content
- persisted guardrail log content

## Observability Shape

Shape contract only (not real collection):

```json
{
  "sidecarDecision": "attach | omit",
  "sidecarAttached": "boolean",
  "sidecarOmitted": "boolean",
  "omitReason": "string enum",
  "requestType": "code_review | validation | unsupported",
  "fallbackPolicy": {
    "reason": "string enum",
    "action": "string enum"
  },
  "observability": {
    "outcome": "string enum",
    "warningCount": "number",
    "hasWarnings": "boolean"
  },
  "guardrails": {
    "decision": "string enum",
    "allowed": "boolean",
    "warningCount": "number",
    "checks": "string[]"
  },
  "operatorApprovalPresent": "boolean",
  "requiredFlagsPresent": "boolean",
  "sanitizationStatus": "sanitized | failed | not_applicable",
  "metadataSafetyStatus": "safe | unsafe | not_applicable",
  "dispatcherOutcome": "not_called | success | failed",
  "exceptionCategory": "none | dispatcher_exception | sanitization_failure | guardrail_failure"
}
```

## Observability Safety Rules

- Observability is sidecar metadata only.
- Observability must not change Gateway primary/final result.
- Observability must not change Runtime final_status/routing.
- Observability must not make Hermes final owner.
- Observability must not persist logs without a separate persistence contract.
- Observability must not include raw prompt.
- Observability must not include raw artifacts.
- Observability must not include secrets.
- Observability must not include stdout/stderr/full CLI output.
- Observability must not include full warning text.
- Observability must use bounded enum/status/category fields where possible.
- Observability must use counts/booleans instead of raw text where possible.
- Observability must omit rather than leak unsafe data.

## Recommended Next PR

Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Guardrail Contract
