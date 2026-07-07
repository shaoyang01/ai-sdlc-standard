# Hermes Gateway Real Dispatch Phase-2 Post-Validation Review Template

## Status

`template_only`

## Scope

Gateway real dispatch sidecar Phase-2 post-validation review template only.

## Non-execution Guarantees

- This PR does not collect Phase-2 validation data.
- This PR does not persist Phase-2 post-validation review logs.
- This PR does not execute Phase-2 validation.
- This PR does not expand request types now.
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
- `template_only` post-enablement review template
- `contract_only` Phase-2 expansion contract
- `checklist_only` Phase-2 validation checklist
- `runbook_only` Phase-2 operator runbook

## Current Scope

- Current validated request type: `review`
- Phase-2 review targets: `code_review` / `validation`
- Unsupported types remain: `llm_task` / `code_generation` / `bugfix`

## Allowed Monitoring Signals

- fallbackPolicy.reason
- fallbackPolicy.action
- observability.outcome
- observability.warningCount
- observability.hasWarnings
- guardrails.decision
- guardrails.allowed
- guardrails.warningCount
- guardrails.checks

## Allowed Review Outcomes

- `remain_review_only`
- `proceed_to_phase_2_final_readiness_review`
- `rollback`
- `propose_separate_ownership_contract`

## Disallowed Review Evidence

- raw prompts, raw artifacts, secrets, stdout, stderr, full Hermes CLI output, full warning text, customer data, credentials, tokens, unsanitized review payloads

## Constraints

- This PR is template-only and does not collect Phase-2 validation data.
- Fields are placeholders only.
- No raw prompt/artifact/secret collection allowed.

## Not Included

- No Phase-2 validation data collection
- No post-validation review log persistence
- No flag enablement
- No Hermes default routing

## Recommended Next PR

**Hermes Gateway Real Dispatch Phase-2 Final Readiness Review**
