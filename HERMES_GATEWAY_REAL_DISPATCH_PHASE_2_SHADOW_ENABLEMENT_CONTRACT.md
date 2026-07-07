# Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Contract

## Status

contract_only

## Scope

Gateway real dispatch sidecar Phase-2 shadow enablement contract only. Defines the exact behavior contract a future shadow-only implementation must satisfy for `code_review` and `validation` without changing primary Gateway/Runtime outcomes.

## Non-execution Guarantees

- No implementation now
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

## Attach Contract

- May attach only for `code_review` and `validation`.
- May attach only when all required Hermes flags are explicitly enabled.
- May attach only after operator approval.
- May attach only in shadow sidecar mode.
- May attach only when metadata is safe and sanitized.
- Must attach under `hermes_gateway_real_dispatch`.
- Must never affect Gateway primary/final result.
- Must never affect Runtime final_status/routing.
- Must never make Hermes final owner.

## Omit Contract

- Must omit when disabled.
- Must omit when any required flag is missing.
- Must omit when operator approval is missing.
- Must omit for unsupported request types.
- Must omit for `llm_task`, `code_generation`, and `bugfix`.
- Must omit when metadata is unsafe.
- Must omit on dispatcher exception.
- Must omit when sanitization fails.
- Must omit rather than degrade primary Gateway result.

## Sidecar Contract

- Sidecar field must be `hermes_gateway_real_dispatch`.
- Sidecar must contain only sanitized summary metadata.
- Sidecar must not contain raw prompt.
- Sidecar must not contain raw artifacts.
- Sidecar must not contain secrets.
- Sidecar must not contain stdout/stderr/full CLI output.
- Sidecar must include fallbackPolicy, observability, and guardrails summaries only.
- Sidecar must preserve existing primary Gateway result.
- Sidecar must preserve Runtime final_status/routing.

## Safety Contract

- Default disabled.
- Feature-flagged.
- Operator approval required.
- Automatic enablement disallowed.
- Automatic rollout disallowed.
- Automatic Phase-2 expansion disallowed.
- No package/script/CI enablement.
- No real Hermes CLI in tests.
- No persistence without separate contract.
- Rollback required on any primary behavior change.

## Required Test Contract

- disabled path omits sidecar
- missing flag path omits sidecar
- missing operator approval path omits sidecar
- unsupported request type omits sidecar
- unsafe metadata omits sidecar
- dispatcher exception omits sidecar
- sanitization failure omits sidecar
- code_review shadow attach path attaches sanitized sidecar only
- validation shadow attach path attaches sanitized sidecar only
- Gateway primary/final result unchanged
- Runtime final_status/routing unchanged
- Hermes output not final code_review decision
- Hermes output not final validation decision
- no real Hermes CLI in tests
- no package/script/CI flag enablement

## Prohibited Behaviors

- Changing Runtime final_status.
- Changing Runtime routing.
- Changing Gateway primary dispatch result.
- Changing Gateway final result.
- Changing Hermes dispatch eligibility in this PR.
- Making Hermes default.
- Making Hermes final review/code_review/validation owner.
- Enabling any Hermes flag by default.
- Adding package/script/CI enablement.
- Persisting raw prompts, artifacts, secrets, stdout, stderr, or full CLI output.
- Persisting enablement/validation/review/audit/observability/guardrail logs without separate contract.
- Routing llm_task, code_generation, or bugfix to Hermes.
- Automatic Phase-2 validation, expansion, rollout, or enablement.

## Recommended Next PR

**Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Test Plan**
