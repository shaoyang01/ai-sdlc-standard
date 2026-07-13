# Hermes Gateway Real Dispatch Post-Enablement Review Template

## Status

`template_only`

## Scope

Gateway real dispatch sidecar post-enablement review template only.

## Non-execution Guarantees

- This PR does not collect post-enablement data.
- This PR does not persist review logs.
- This PR does not execute operator actions.
- This PR does not enable feature flags.
- This PR does not change Runtime behavior.
- This PR does not change Gateway behavior.
- This PR does not add enablement scripts.
- This PR does not call Hermes CLI.

## Required Prerequisites

- `READY_WITH_CONSTRAINTS` readiness verdict
- `plan_only` controlled rollout plan
- `checklist_only` rollout validation checklist
- `runbook_only` operator runbook

## Review Scope

- Review request type: `review`
- Sidecar field: `hermes_gateway_real_dispatch`
- Nested metadata: `fallbackPolicy` / `observability` / `guardrails`
- No raw prompts, raw artifacts, secrets, stdout, stderr, or full CLI output

## Template Sections

### 1. review_summary

- **Category:** summary
- **Description:** Summarize the operator-managed enablement review without storing raw prompts, artifacts, or secrets.
- **Fields:**
  - `review_date_placeholder` — Review date placeholder
  - `operator_approval_reference_placeholder` — Operator approval reference placeholder
  - `environment_label_placeholder` — Environment label placeholder
- **Pass Criteria:**
  - Review summary is sanitized.
  - Operator approval reference is present.
- **Fail Criteria:**
  - Summary includes raw prompt, artifact, secret, stdout, or stderr.

### 2. scope_confirmation

- **Category:** scope
- **Description:** Confirm reviewed scope remains review-only and sidecar-only.
- **Fields:**
  - `request_type_scope_placeholder` — Request type scope placeholder
  - `sidecar_scope_placeholder` — Sidecar scope placeholder
  - `unsupported_request_type_check_placeholder` — Unsupported request type check placeholder
- **Pass Criteria:**
  - Reviewed request type is review.
  - Hermes remains sidecar metadata only.
  - Unsupported request types remain omitted.
- **Fail Criteria:**
  - code_review or validation is reviewed before phase-2 approval.
  - llm_task, code_generation, or bugfix invokes Hermes dispatcher.

### 3. sidecar_attach_omit_behavior

- **Category:** sidecar_behavior
- **Description:** Review attach and omit behavior for safe, disabled, unsupported, unsafe, and exception paths.
- **Fields:**
  - `attached_success_count_placeholder` — Attached success count placeholder
  - `omitted_disabled_count_placeholder` — Omitted disabled count placeholder
  - `omitted_unsupported_count_placeholder` — Omitted unsupported count placeholder
  - `omitted_unsafe_count_placeholder` — Omitted unsafe count placeholder
  - `omitted_exception_count_placeholder` — Omitted exception count placeholder
- **Pass Criteria:**
  - Safe review requests attach sidecar metadata.
  - Disabled, unsupported, and exception paths omit sidecar.
- **Fail Criteria:**
  - Unsafe metadata attaches.
  - Disabled or unsupported paths call dispatcher.

### 4. gateway_runtime_safety

- **Category:** safety
- **Description:** Confirm Gateway and Runtime behavior remain independent of Hermes sidecar output.
- **Fields:**
  - `gateway_primary_result_check_placeholder` — Gateway primary result check placeholder
  - `gateway_final_result_check_placeholder` — Gateway final result check placeholder
  - `runtime_final_status_check_placeholder` — Runtime final_status check placeholder
  - `runtime_routing_check_placeholder` — Runtime routing check placeholder
- **Pass Criteria:**
  - Gateway primary result is unchanged.
  - Gateway final result is unchanged.
  - Runtime final_status and routing are unchanged.
- **Fail Criteria:**
  - Hermes sidecar output changes Gateway primary/final result.
  - Hermes sidecar output changes Runtime final_status or routing.

### 5. fallback_policy_review

- **Category:** sidecar_behavior
- **Description:** Review fallbackPolicy reason/action values without copying raw payloads.
- **Fields:**
  - `fallback_reason_distribution_placeholder` — Fallback reason distribution placeholder
  - `fallback_action_distribution_placeholder` — Fallback action distribution placeholder
- **Pass Criteria:**
  - fallbackPolicy contains expected reason/action values only.
  - No raw prompt/artifact/secret is present.
- **Fail Criteria:**
  - fallbackPolicy includes raw text or unbounded payloads.

### 6. observability_review

- **Category:** observability
- **Description:** Review observability outcomes and warning counts only.
- **Fields:**
  - `observability_outcome_distribution_placeholder` — Observability outcome distribution placeholder
  - `warning_count_summary_placeholder` — Warning count summary placeholder
  - `has_warnings_summary_placeholder` — Has warnings summary placeholder
- **Pass Criteria:**
  - Observability uses counts/booleans only.
  - Warning text is not copied.
- **Fail Criteria:**
  - Warning text, raw prompt, artifact, secret, stdout, or stderr is copied.

### 7. guardrails_review

- **Category:** guardrails
- **Description:** Review guardrail decisions and checks without storing raw evidence.
- **Fields:**
  - `guardrail_decision_distribution_placeholder` — Guardrail decision distribution placeholder
  - `guardrail_reject_reason_summary_placeholder` — Guardrail reject reason summary placeholder
  - `guardrail_checks_summary_placeholder` — Guardrail checks summary placeholder
- **Pass Criteria:**
  - Guardrails allow only safe bounded metadata.
  - Rejects are explainable using decision/check fields.
- **Fail Criteria:**
  - Guardrails allow unsafe metadata.
  - Guardrail review requires raw prompt/artifact/secret.

### 8. rollback_and_escalation_review

- **Category:** rollback
- **Description:** Record whether rollback or escalation criteria were triggered using sanitized placeholders only.
- **Fields:**
  - `rollback_triggered_placeholder` — Rollback triggered placeholder
  - `rollback_reason_placeholder` — Rollback reason placeholder
  - `escalation_triggered_placeholder` — Escalation triggered placeholder
  - `escalation_reason_placeholder` — Escalation reason placeholder
- **Pass Criteria:**
  - Rollback/escalation decisions are based on sanitized criteria.
  - No raw prompt/artifact/secret is persisted.
- **Fail Criteria:**
  - Rollback evidence requires raw sensitive data.
  - Escalation proposes Hermes default or primary Gateway ownership without contract.

### 9. post_enablement_decision

- **Category:** decision
- **Description:** Record sanitized review decision for whether to remain in current phase, roll back, or propose separate phase-2 contract.
- **Fields:**
  - `review_decision_placeholder` — Review decision placeholder
  - `follow_up_owner_placeholder` — Follow-up owner placeholder
  - `follow_up_pr_placeholder` — Follow-up PR placeholder
- **Pass Criteria:**
  - Decision is one of remain_current_phase, rollback, or propose_phase_2_contract.
  - Any phase-2 expansion is routed through a separate contract.
- **Fail Criteria:**
  - Decision enables automatic expansion.
  - Decision makes Hermes final review/validation owner without separate contract.

## Allowed Non-Persisted Signals

- `fallbackPolicy.reason`
- `fallbackPolicy.action`
- `observability.outcome`
- `observability.warningCount`
- `observability.hasWarnings`
- `guardrails.decision`
- `guardrails.allowed`
- `guardrails.warningCount`
- `guardrails.checks`

## Disallowed Evidence

- Raw prompts
- Raw artifacts
- Secrets
- stdout
- stderr
- Full Hermes CLI output
- Full warning text
- Customer data
- Credentials
- Tokens

## Review Outcomes

- `remain_current_phase`
- `rollback`
- `propose_phase_2_contract`

## Constraints

- This PR is template-only and does not collect post-enablement data.
- This PR does not persist review, validation, rollout, audit, observability, guardrail, or runbook logs.
- Template fields are placeholders only.
- No raw prompts, raw artifacts, secrets, stdout, or stderr may be copied into the review.
- Hermes remains Gateway sidecar metadata only.
- Hermes remains default-off and requires explicit flags.
- Initial post-enablement review scope is review-only.
- Expansion to code_review and validation requires a separate contract for phase-2 expansion.
- Hermes must not become final review or validation owner without a separate contract.
- Runtime final_status and routing must not depend on Hermes sidecar output.
- No automatic rollout or automatic enablement is allowed.

## Not Included

- No data collection
- No log persistence
- No flag enablement
- No runtime behavior change
- No Gateway behavior change
- No Hermes default routing
- No final review/validation ownership
- No automatic expansion

## Recommended Next PR

**Hermes Gateway Real Dispatch Phase-2 Expansion Contract**
