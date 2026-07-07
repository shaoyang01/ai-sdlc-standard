# Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Test Plan

## Status

test_plan_only

## Scope

Gateway real dispatch sidecar Phase-2 shadow enablement test plan only. Defines the exact test coverage a future shadow-only implementation PR must include for `code_review` and `validation` before it can be safely accepted.

## Non-execution Guarantees

- No implementation now
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

## Required Test Suites

- disabled behavior suite
- missing flag behavior suite
- missing operator approval behavior suite
- unsupported request type behavior suite
- unsafe metadata behavior suite
- dispatcher exception behavior suite
- sanitization failure behavior suite
- code_review shadow attach suite
- validation shadow attach suite
- Gateway primary/final preservation suite
- Runtime final_status/routing preservation suite
- ownership boundary suite
- persistence/leakage suite
- rollback trigger suite
- metadata consistency suite

## Required Path Coverage

- disabled path omits sidecar
- missing SDLC_HERMES_GATEWAY_REAL_DISPATCH flag omits sidecar
- missing SDLC_HERMES_GATEWAY_INTEGRATION flag omits sidecar
- missing SDLC_HERMES_CLI_COMMAND_EXECUTION flag omits sidecar
- missing operator approval omits sidecar
- unsupported llm_task omits sidecar
- unsupported code_generation omits sidecar
- unsupported bugfix omits sidecar
- unsafe metadata omits sidecar
- dispatcher exception omits sidecar
- sanitization failure omits sidecar
- code_review safe shadow path attaches sanitized sidecar only
- validation safe shadow path attaches sanitized sidecar only

## Required Safety Assertions

- Gateway primary result unchanged for all paths
- Gateway final result unchanged for all paths
- Runtime final_status unchanged for all paths
- Runtime routing unchanged for all paths
- Hermes output never becomes final code_review decision
- Hermes output never becomes final validation decision
- Hermes never becomes final review owner
- Hermes never becomes final code_review owner
- Hermes never becomes final validation owner
- sidecar contains no raw prompt
- sidecar contains no raw artifacts
- sidecar contains no secrets
- sidecar contains no stdout/stderr/full CLI output
- no enablement/review/validation/audit/observability/guardrail persistence
- no real Hermes CLI in tests
- no package/script/CI flag enablement

## Required Fixture Coverage

- safe code_review request fixture
- safe validation request fixture
- unsupported llm_task fixture
- unsupported code_generation fixture
- unsupported bugfix fixture
- unsafe metadata fixture
- dispatcher exception fixture
- sanitization failure fixture
- missing operator approval fixture
- missing each required flag fixture

## Prohibited Test Behaviors

- Calling real Hermes CLI.
- Spawning real external processes.
- Reading real API keys.
- Writing enablement logs.
- Persisting validation/review/audit/observability/guardrail logs.
- Enabling Hermes flags in package scripts.
- Enabling Hermes flags in CI.
- Changing Runtime behavior.
- Changing Gateway behavior.
- Changing Hermes dispatch eligibility in this PR.
- Treating Hermes output as final code_review or validation result.
- Using raw prompts, raw artifacts, secrets, stdout, stderr, or full CLI output as expected test data.

## Recommended Next PR

**Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Fixture Contract**
