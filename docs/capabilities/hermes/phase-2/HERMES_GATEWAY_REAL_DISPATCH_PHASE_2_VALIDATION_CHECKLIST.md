# Hermes Gateway Real Dispatch Phase-2 Validation Checklist

## Status

`checklist_only`

## Scope

Gateway real dispatch sidecar Phase-2 validation checklist only.

## Non-execution Guarantees

- This PR does not execute Phase-2 validation.
- This PR does not expand request types now.
- This PR does not enable feature flags.
- This PR does not change Runtime behavior.
- This PR does not change Gateway behavior.
- This PR does not add enablement scripts.
- This PR does not collect or persist validation evidence.

## Required Prerequisites

- `READY_WITH_CONSTRAINTS` readiness verdict
- `plan_only` controlled rollout plan
- `checklist_only` rollout validation checklist
- `runbook_only` operator runbook
- `template_only` post-enablement review template
- `contract_only` Phase-2 expansion contract

## Current Scope

- Current validated request type: `review`
- Phase-2 validation targets: `code_review` / `validation`
- Unsupported types remain: `llm_task` / `code_generation` / `bugfix`

## Validation Gates

### 1. phase_2_non_execution_gate

- **Category:** non_execution
- **Target Request Types:** code_review, validation
- **Description:** Confirm this checklist does not execute Phase-2 validation or expansion.
- **Validation Method:** Static artifact and metadata review.
- **Pass Criteria:**
  - Checklist PR contains only checklist artifacts, metadata, and tests.
  - Runtime and Gateway implementation files are unchanged.
  - No feature flags are enabled by default.
- **Fail Criteria:**
  - Runtime or Gateway behavior changes.
  - Actual Phase-2 validation is executed.
  - Any enablement script is added.

### 2. prerequisite_status_gate

- **Category:** prerequisite
- **Target Request Types:** code_review, validation
- **Description:** Confirm all prior artifacts have required non-executing statuses.
- **Validation Method:** Metadata and static artifact review.
- **Pass Criteria:**
  - Readiness verdict is READY_WITH_CONSTRAINTS.
  - Controlled rollout plan is plan_only.
  - Rollout validation checklist is checklist_only.
  - Operator runbook is runbook_only.
  - Post-enablement review template is template_only.
  - Phase-2 expansion contract is contract_only.
- **Fail Criteria:**
  - Any prerequisite status is missing or stale.
  - Phase-2 validation proceeds before contract-only artifact exists.

### 3. phase_2_request_scope_gate

- **Category:** request_scope
- **Target Request Types:** code_review, validation
- **Description:** Confirm Phase-2 validation targets are exactly code_review and validation.
- **Validation Method:** Static request-type scope review.
- **Pass Criteria:**
  - Phase-2 validation targets are exactly code_review and validation.
  - Current validated request types remain review only.
  - Unsupported request types remain llm_task, code_generation, and bugfix.
- **Fail Criteria:**
  - bugfix is included in Phase-2 validation.
  - llm_task or code_generation can trigger Hermes dispatcher.

### 4. code_review_target_gate

- **Category:** request_scope
- **Target Request Types:** code_review
- **Description:** Confirm code_review validation remains sidecar-only and non-final.
- **Validation Method:** Contract and ownership-boundary review.
- **Pass Criteria:**
  - code_review remains sidecar-only.
  - Hermes does not become final code review owner.
  - Gateway primary/final result remains unchanged.
- **Fail Criteria:**
  - Hermes output becomes final code review decision.
  - code_review expansion enables Hermes by default.

### 5. validation_target_gate

- **Category:** request_scope
- **Target Request Types:** validation
- **Description:** Confirm validation request validation remains sidecar-only and non-final.
- **Validation Method:** Contract and ownership-boundary review.
- **Pass Criteria:**
  - validation remains sidecar-only.
  - Hermes does not become final validation owner.
  - Gateway primary/final result remains unchanged.
- **Fail Criteria:**
  - Hermes output becomes final validation decision.
  - validation expansion enables Hermes by default.

### 6. phase_2_sidecar_safety_gate

- **Category:** sidecar_safety
- **Target Request Types:** code_review, validation
- **Description:** Confirm Phase-2 sidecar metadata remains bounded and nested.
- **Validation Method:** Static sidecar metadata review.
- **Pass Criteria:**
  - fallbackPolicy, observability, and guardrails remain nested under hermes_gateway_real_dispatch.
  - No top-level fallback/observability/guardrails fields are introduced.
  - Raw prompt/artifact/secret collection remains disallowed.
- **Fail Criteria:**
  - Metadata is promoted to top-level fields.
  - Raw prompt/artifact/secret is collected or persisted.

### 7. phase_2_gateway_runtime_safety_gate

- **Category:** gateway_runtime_safety
- **Target Request Types:** code_review, validation
- **Description:** Confirm Phase-2 validation cannot affect Gateway or Runtime outcomes.
- **Validation Method:** Static Gateway/Runtime behavior review.
- **Pass Criteria:**
  - Gateway primary result remains unchanged.
  - Gateway final result remains unchanged.
  - Runtime final_status/routing remains unchanged.
- **Fail Criteria:**
  - Hermes sidecar changes Gateway primary/final result.
  - Hermes sidecar changes Runtime final_status or routing.

### 8. phase_2_test_safety_gate

- **Category:** test_safety
- **Target Request Types:** code_review, validation
- **Description:** Confirm tests remain fake/static and do not call real Hermes CLI.
- **Validation Method:** Static test and package-script review.
- **Pass Criteria:**
  - No real Hermes CLI is invoked in tests.
  - Tests do not require external services.
  - Package scripts do not enable Hermes dispatch.
- **Fail Criteria:**
  - Tests call real Hermes CLI.
  - Tests require network or external services.
  - Package scripts set Hermes enablement flags.

### 9. phase_2_operator_approval_gate

- **Category:** operator_approval
- **Target Request Types:** code_review, validation
- **Description:** Confirm Phase-2 validation requires separate operator approval.
- **Validation Method:** Metadata and checklist review.
- **Pass Criteria:**
  - Operator approval is required before Phase-2 validation.
  - Phase-2 cannot proceed automatically.
  - Automatic enablement is disallowed.
- **Fail Criteria:**
  - Any automatic Phase-2 validation path is introduced.
  - Any flag becomes enabled by default.

### 10. phase_2_rollback_gate

- **Category:** rollback
- **Target Request Types:** code_review, validation
- **Description:** Confirm rollback criteria exist before Phase-2 validation.
- **Validation Method:** Rollback criteria review.
- **Pass Criteria:**
  - Rollback triggers include Gateway primary/final result changes.
  - Rollback triggers include Runtime final_status/routing changes.
  - Rollback triggers include raw prompt/artifact/secret leakage.
  - Rollback triggers include repeated guardrail rejection.
- **Fail Criteria:**
  - Rollback criteria are missing.
  - Rollback depends on raw sensitive evidence.

## Required Sanitized Inputs

- phase-2 expansion contract
- review-only post-enablement decision
- review-only attach/omit summary
- review-only fallbackPolicy reason/action summary
- review-only observability outcome/count summary
- review-only guardrail decision/check summary
- operator approval reference
- rollback owner reference

## Disallowed Validation Evidence

- raw prompts
- raw artifacts
- secrets
- stdout
- stderr
- full Hermes CLI output
- full warning text
- customer data
- credentials
- tokens
- unsanitized review payloads

## Allowed Validation Outcomes

- `remain_review_only`
- `proceed_to_phase_2_operator_runbook`
- `rollback`

## Constraints

- This PR is checklist-only and does not execute Phase-2 validation.
- This PR does not expand request types now.
- This PR does not change actual Gateway dispatch behavior.
- This PR does not enable Hermes feature flags.
- This PR does not add enablement scripts or CI behavior.
- Phase-2 validation targets are code_review and validation only.
- Current validated request type remains review only.
- Hermes remains Gateway sidecar metadata only.
- Hermes remains default-off and requires explicit flags.
- Hermes must not become final review, code_review, or validation owner without a separate ownership contract.
- Runtime final_status and routing must not depend on Hermes sidecar output.
- No Phase-2 validation, expansion, review, rollout, audit, observability, or guardrail logs may persist without a separate contract.
- Raw prompt, raw artifact, secret, stdout, stderr, full CLI output, and full warning text remain disallowed.
- No automatic Phase-2 validation, Phase-2 expansion, or automatic enablement is allowed.

## Not Included

- No Phase-2 validation execution
- No request type expansion now
- No flag enablement
- No runtime behavior change
- No Gateway behavior change
- No Hermes default routing
- No final review/code_review/validation ownership
- No persistence
- No automatic expansion

## Recommended Next PR

**Hermes Gateway Real Dispatch Phase-2 Operator Runbook**
