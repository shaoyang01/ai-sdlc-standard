# Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Fixture Contract

## Status

fixture_contract_only

## Scope

Gateway real dispatch sidecar Phase-2 shadow enablement fixture contract only. Defines the exact fixture shapes and fixture safety rules a future shadow-only implementation PR must use for `code_review` and `validation` tests.

## Non-execution Guarantees

- No implementation now
- No real implementation fixtures now
- No real implementation tests now
- No Phase-2 enablement now
- No request type expansion now
- No flag enablement
- No Runtime/Gateway behavior change
- No Hermes dispatch eligibility change
- No package/script/CI enablement
- No persistence

## Current State

- **Readiness verdict:** READY_WITH_CONSTRAINTS
- **Current validated request type:** review only
- **Phase-2 shadow targets:** code_review, validation
- **Unsupported:** llm_task, code_generation, bugfix

## Fixture Groups

- `safe_code_review_request`
- `safe_validation_request`
- `unsupported_llm_task_request`
- `unsupported_code_generation_request`
- `unsupported_bugfix_request`
- `missing_gateway_real_dispatch_flag`
- `missing_gateway_integration_flag`
- `missing_cli_command_execution_flag`
- `missing_operator_approval`
- `unsafe_metadata_request`
- `dispatcher_exception_result`
- `sanitization_failure_result`

## Required Fixture Shapes

### Safe `code_review` fixture

- `request_type` = `code_review`
- Sanitized prompt summary only
- No raw prompt
- No raw artifacts
- No secrets
- Expected sidecar attach allowed only under full flags + operator approval

### Safe `validation` fixture

- `request_type` = `validation`
- Sanitized validation summary only
- No raw prompt
- No raw artifacts
- No secrets
- Expected sidecar attach allowed only under full flags + operator approval

### Unsupported request fixtures

- `request_type` in `llm_task` / `code_generation` / `bugfix`
- Expected sidecar omitted
- Gateway primary/final result unchanged
- Runtime final_status/routing unchanged

### Missing flag fixtures

- Exactly one required Hermes flag absent per fixture
- Expected sidecar omitted
- No dispatcher call required

### Missing operator approval fixture

- All flags present
- Operator approval absent
- Expected sidecar omitted

### Unsafe metadata fixture

- Metadata marked unsafe
- Expected sidecar omitted
- Raw unsafe payload must not be stored

### Dispatcher exception fixture

- Fake dispatcher throws
- Expected sidecar omitted
- Primary Gateway result preserved

### Sanitization failure fixture

- Fake sanitizer fails
- Expected sidecar omitted
- No raw payload retained

## Fixture Safety Rules

- Fixtures must be synthetic.
- Fixtures must be sanitized.
- Fixtures must not contain real prompts.
- Fixtures must not contain raw artifacts.
- Fixtures must not contain secrets.
- Fixtures must not contain credentials or tokens.
- Fixtures must not contain stdout/stderr/full CLI output.
- Fixtures must not contain customer data.
- Fixtures must not read environment variables.
- Fixtures must not read real API keys.
- Fixtures must not invoke real Hermes CLI.
- Fixtures must not spawn external processes.
- Fixtures must not persist enablement/review/validation/audit/observability/guardrail logs.
- Fixtures must preserve Gateway primary/final result expectations.
- Fixtures must preserve Runtime final_status/routing expectations.

## Prohibited Fixture Data

- raw prompts
- raw artifacts
- secrets
- credentials
- tokens
- customer data
- stdout
- stderr
- full CLI output
- real API keys
- real repository-private payloads
- unsanitized Hermes responses
- unsanitized warning text
- persisted audit logs
- persisted observability logs
- persisted guardrail logs

## Recommended Next PR

**Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Observability Contract**
