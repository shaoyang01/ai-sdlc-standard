# Hermes Gateway Real Dispatch Phase-2 Expansion Contract

## Status

`contract_only`

## Scope

Gateway real dispatch sidecar phase-2 expansion contract only.

## Non-execution Guarantees

- This PR does not execute phase-2 expansion.
- This PR does not expand request types now.
- This PR does not enable feature flags.
- This PR does not change Runtime behavior.
- This PR does not change Gateway behavior.
- This PR does not add enablement scripts.
- This PR does not collect or persist expansion evidence.

## Required Prerequisites

- `READY_WITH_CONSTRAINTS` readiness verdict
- `plan_only` controlled rollout plan
- `checklist_only` rollout validation checklist
- `runbook_only` operator runbook
- `template_only` post-enablement review template

## Current Scope

- Current validated request type: `review`
- Phase-2 targets: `code_review` / `validation`
- Unsupported types remain: `llm_task` / `code_generation` / `bugfix`

## Expansion Targets

### code_review

- **Status:** `contracted_not_enabled`
- **Eligible for future operator validation:** yes
- **Enabled now:** no
- **Executes now:** no
- **Final decision owner:** no
- **Sidecar only:** yes
- **Requires separate operator approval:** yes
- **Requires post-enablement review for review scope:** yes
- **Pass Criteria:**
  - code_review remains sidecar-only.
  - Hermes does not become final code review owner.
  - Gateway primary/final result remains unchanged.
  - Runtime final_status/routing remains unchanged.
- **Fail Criteria:**
  - code_review expansion enables Hermes by default.
  - Hermes output becomes final code review decision.
  - Hermes sidecar changes Gateway primary/final result.

### validation

- **Status:** `contracted_not_enabled`
- **Eligible for future operator validation:** yes
- **Enabled now:** no
- **Executes now:** no
- **Final decision owner:** no
- **Sidecar only:** yes
- **Requires separate operator approval:** yes
- **Requires post-enablement review for review scope:** yes
- **Pass Criteria:**
  - validation remains sidecar-only.
  - Hermes does not become final validation owner.
  - Gateway primary/final result remains unchanged.
  - Runtime final_status/routing remains unchanged.
- **Fail Criteria:**
  - validation expansion enables Hermes by default.
  - Hermes output becomes final validation decision.
  - Hermes sidecar changes Gateway primary/final result.

## Expansion Gates

### 1. post_enablement_review_gate

- **Category:** post_enablement_review
- **Target Request Types:** code_review, validation
- **Description:** Confirm review-only post-enablement evidence is sanitized and complete before phase-2 expansion.
- **Pass Criteria:**
  - Review-only post-enablement review is completed.
  - Review outcomes do not include rollback.
  - Evidence contains no raw prompt, artifact, secret, stdout, stderr, or full CLI output.
- **Fail Criteria:**
  - Review-only phase is not reviewed.
  - Review-only phase requires rollback.
  - Raw or sensitive evidence is required for phase-2 decision.

### 2. request_scope_gate

- **Category:** request_scope
- **Target Request Types:** code_review, validation
- **Description:** Confirm phase-2 targets are only code_review and validation.
- **Pass Criteria:**
  - Expansion targets are exactly code_review and validation.
  - llm_task, code_generation, and bugfix remain unsupported.
- **Fail Criteria:**
  - Any unsupported request type is added.
  - bugfix is included in phase-2 expansion.

### 3. sidecar_safety_gate

- **Category:** sidecar_safety
- **Target Request Types:** code_review, validation
- **Description:** Confirm sidecar metadata remains bounded and nested.
- **Pass Criteria:**
  - fallbackPolicy, observability, and guardrails remain nested under hermes_gateway_real_dispatch.
  - No top-level fallback/observability/guardrails fields are introduced.
  - Raw prompt/artifact/secret collection remains disallowed.
- **Fail Criteria:**
  - Metadata is promoted to top-level fields.
  - Raw prompt/artifact/secret is collected or persisted.

### 4. gateway_runtime_safety_gate

- **Category:** gateway_runtime_safety
- **Target Request Types:** code_review, validation
- **Description:** Confirm phase-2 expansion cannot affect Gateway or Runtime outcomes.
- **Pass Criteria:**
  - Gateway primary result remains unchanged.
  - Gateway final result remains unchanged.
  - Runtime final_status/routing remains unchanged.
- **Fail Criteria:**
  - Hermes sidecar changes Gateway primary/final result.
  - Hermes sidecar changes Runtime final_status or routing.

### 5. ownership_boundary_gate

- **Category:** ownership_boundary
- **Target Request Types:** code_review, validation
- **Description:** Confirm Hermes remains advisory sidecar metadata, not final decision owner.
- **Pass Criteria:**
  - Hermes is not final review owner.
  - Hermes is not final code_review owner.
  - Hermes is not final validation owner.
- **Fail Criteria:**
  - Hermes output becomes final review/code_review/validation decision.
  - Hermes becomes default or primary Gateway owner.

### 6. operator_approval_gate

- **Category:** operator_approval
- **Target Request Types:** code_review, validation
- **Description:** Confirm phase-2 expansion requires separate operator approval.
- **Pass Criteria:**
  - Operator approval is required before phase-2 validation.
  - Phase-2 cannot proceed automatically.
  - Automatic enablement is disallowed.
- **Fail Criteria:**
  - Any automatic expansion path is introduced.
  - Any flag becomes enabled by default.

### 7. rollback_gate

- **Category:** rollback
- **Target Request Types:** code_review, validation
- **Description:** Confirm rollback criteria exist before phase-2 validation.
- **Pass Criteria:**
  - Rollback triggers include Gateway primary/final result changes.
  - Rollback triggers include Runtime final_status/routing changes.
  - Rollback triggers include raw prompt/artifact/secret leakage.
  - Rollback triggers include repeated guardrail rejection.
- **Fail Criteria:**
  - Rollback criteria are missing.
  - Rollback depends on raw sensitive evidence.

## Required Sanitized Evidence

- review-only post-enablement decision
- review-only attach/omit summary
- review-only fallbackPolicy reason/action summary
- review-only observability outcome/count summary
- review-only guardrail decision/check summary
- review-only rollback/escalation summary
- operator approval reference

## Disallowed Evidence

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

## Allowed Phase-2 Outcomes

- `remain_review_only`
- `proceed_to_phase_2_validation_checklist`
- `rollback`

## Constraints

- This PR is contract-only and does not execute phase-2 expansion.
- This PR does not change actual Gateway dispatch behavior.
- This PR does not enable Hermes feature flags.
- This PR does not add enablement scripts or CI behavior.
- Phase-2 targets are code_review and validation only.
- Current validated request type remains review only.
- Hermes remains Gateway sidecar metadata only.
- Hermes remains default-off and requires explicit flags.
- Hermes must not become final review, code_review, or validation owner without a separate ownership contract.
- Runtime final_status and routing must not depend on Hermes sidecar output.
- No expansion, review, rollout, audit, observability, or guardrail logs may persist without a separate contract.
- raw prompt, raw artifact, secret, stdout, stderr, full CLI output, and full warning text remain disallowed.
- No automatic phase-2 expansion or automatic enablement is allowed.

## Not Included

- No phase-2 execution
- No flag enablement
- No runtime behavior change
- No Gateway behavior change
- No Hermes default routing
- No final review/code_review/validation ownership
- No persistence
- No automatic expansion

## Recommended Next PR

**Hermes Gateway Real Dispatch Phase-2 Validation Checklist**
