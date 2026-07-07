# Hermes Gateway Real Dispatch Phase-2 Operator Runbook

## Status

**runbook_only** — This artifact is documentation-only. It does not execute, validate, expand request types, enable feature flags, or change runtime/Gateway/CI behavior.

## Scope

`gateway_real_dispatch_sidecar_phase_2_operator_runbook` — Phase-2 operator validation runbook for the Hermes Gateway real dispatch sidecar. Adapter: `hermes`. Gateway field: `hermes_gateway_real_dispatch`.

Phase-2 operator targets: `code_review`, `validation`. Current validated request types: `review` only. Supported: `review`, `code_review`, `validation`. Unsupported: `llm_task`, `code_generation`, `bugfix`.

## Non-execution Guarantees

| Field | Value |
|-------|-------|
| `executing_now` | `false` |
| `validates_now` | `false` |
| `expands_request_types_now` | `false` |
| `enables_feature_flags_now` | `false` |
| `changes_runtime_behavior_now` | `false` |
| `changes_gateway_behavior_now` | `false` |
| `adds_enablement_scripts` | `false` |
| `changes_ci_behavior` | `false` |
| `writes_files` | `false` |
| `automatic_enablement_allowed` | `false` |
| `rollout_may_proceed_automatically` | `false` |
| `phase_2_may_proceed_automatically` | `false` |
| All `persists_*` fields | `false` |
| All `contains_*` fields | `false` |
| All `changes_*` / `makes_*` fields | `false` |

## Required Prerequisites

| Prerequisite | Required Status | Current Status |
|---|---|---|
| Readiness verdict | `READY_WITH_CONSTRAINTS` | `READY_WITH_CONSTRAINTS` |
| Controlled rollout plan | `plan_only` | `plan_only` |
| Rollout validation checklist | `checklist_only` | `checklist_only` |
| Operator runbook | `runbook_only` | `runbook_only` |
| Post-enablement review template | `template_only` | `template_only` |
| Phase-2 expansion contract | `contract_only` | `contract_only` |
| Phase-2 validation checklist | `checklist_only` | `checklist_only` |

## Current Scope

- **Current validated request types:** `review` only
- **Phase-2 operator targets:** `code_review`, `validation`
- **Supported request types:** `review`, `code_review`, `validation`
- **Unsupported request types:** `llm_task`, `code_generation`, `bugfix`
- **Feature flagged:** `true` (requires multiple flags)
- **Default disabled:** `true`
- **Operator approval required:** `true`
- **Automatic enablement allowed:** `false`

## Manual Environment Reference

The following three feature flags must be provided **manually by an operator in a controlled environment only**. They must not be set in repository defaults, package scripts, tests, or CI:

1. `SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled`
2. `SDLC_HERMES_GATEWAY_INTEGRATION=enabled`
3. `SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled`

**Manual environment notes:**
- This runbook is documentation-only and does not execute Phase-2 validation.
- This repository must not enable Hermes dispatch by default.
- This PR must not add scripts, package commands, or CI behavior that set Hermes flags.
- All three required flags must be provided manually by an operator in a controlled environment.
- Phase-2 validation targets are `code_review` and `validation` only.
- Unsupported request types remain `llm_task`, `code_generation`, and `bugfix`.

## Procedures

### 1. Phase-2 Pre-Validation Review

| Field | Value |
|-------|-------|
| **ID** | `phase_2_pre_validation_review` |
| **Category** | `pre_validation` |
| **Target request types** | `code_review`, `validation` |
| **Status** | `documented` |
| **Required before Phase-2 enablement** | `true` |

**Description:** Confirm all Phase-2 prerequisites before any operator-managed validation.

**Steps:**
1. Confirm Phase-2 expansion contract status is `contract_only`.
2. Confirm Phase-2 validation checklist status is `checklist_only`.
3. Confirm review-only post-enablement evidence is sanitized.
4. Confirm current validated request type remains review only.
5. Confirm Phase-2 targets are `code_review` and `validation` only.

**Success criteria:**
- All prerequisite artifacts are current.
- Operator approval is available outside this repository process.

**Stop criteria:**
- Phase-2 contract or checklist is missing.
- Review-only evidence requires rollback.
- Raw prompt/artifact/secret is required for decision-making.

---

### 2. Phase-2 Manual Environment Reference

| Field | Value |
|-------|-------|
| **ID** | `phase_2_manual_environment_reference` |
| **Category** | `manual_environment_reference` |
| **Target request types** | `code_review`, `validation` |
| **Status** | `documented` |
| **Required before Phase-2 enablement** | `true` |

**Description:** Document manual operator-provided environment inputs for Phase-2 validation.

**Steps:**
1. In an operator-managed environment only, provide `SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled`.
2. In the same controlled environment, provide `SDLC_HERMES_GATEWAY_INTEGRATION=enabled`.
3. In the same controlled environment, provide `SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled`.
4. Do not set these flags in repository defaults, package scripts, tests, or CI.

**Success criteria:**
- All flags are manually provided outside repository defaults.
- Repository remains default-off.

**Stop criteria:**
- Any flag is enabled by default.
- Any package script, CI config, or test sets Hermes enablement flags.

---

### 3. Code Review Sidecar Validation

| Field | Value |
|-------|-------|
| **ID** | `code_review_sidecar_validation` |
| **Category** | `target_scope_validation` |
| **Target request types** | `code_review` |
| **Status** | `documented` |
| **Required before Phase-2 enablement** | `true` |

**Description:** Document how an operator validates `code_review` sidecar behavior without making Hermes final owner.

**Steps:**
1. Submit a controlled `code_review` request in the operator-managed environment.
2. Confirm `hermes_gateway_real_dispatch` is sidecar metadata only.
3. Confirm Gateway primary and final result remain unchanged.
4. Confirm Hermes output is not treated as final code review decision.
5. Confirm `fallbackPolicy`, `observability`, and `guardrails` are nested.

**Success criteria:**
- `code_review` sidecar attaches only when safe.
- Hermes is not final code review owner.
- Gateway and Runtime behavior remain unchanged.

**Stop criteria:**
- Hermes output becomes final code review decision.
- Sidecar affects Gateway primary/final result.
- Runtime `final_status`/routing changes.

---

### 4. Validation Sidecar Validation

| Field | Value |
|-------|-------|
| **ID** | `validation_sidecar_validation` |
| **Category** | `target_scope_validation` |
| **Target request types** | `validation` |
| **Status** | `documented` |
| **Required before Phase-2 enablement** | `true` |

**Description:** Document how an operator validates `validation` sidecar behavior without making Hermes final owner.

**Steps:**
1. Submit a controlled `validation` request in the operator-managed environment.
2. Confirm `hermes_gateway_real_dispatch` is sidecar metadata only.
3. Confirm Gateway primary and final result remain unchanged.
4. Confirm Hermes output is not treated as final validation decision.
5. Confirm `fallbackPolicy`, `observability`, and `guardrails` are nested.

**Success criteria:**
- `validation` sidecar attaches only when safe.
- Hermes is not final validation owner.
- Gateway and Runtime behavior remain unchanged.

**Stop criteria:**
- Hermes output becomes final validation decision.
- Sidecar affects Gateway primary/final result.
- Runtime `final_status`/routing changes.

---

### 5. Phase-2 Monitoring Review

| Field | Value |
|-------|-------|
| **ID** | `phase_2_monitoring_review` |
| **Category** | `monitoring` |
| **Target request types** | `code_review`, `validation` |
| **Status** | `documented` |
| **Required before Phase-2 enablement** | `true` |

**Description:** Review allowed in-memory sidecar signals during Phase-2 operator validation.

**Steps:**
1. Inspect `fallbackPolicy.reason` and `fallbackPolicy.action`.
2. Inspect `observability.outcome`, `observability.warningCount`, and `observability.hasWarnings`.
3. Inspect `guardrails.decision`, `guardrails.allowed`, `guardrails.warningCount`, and `guardrails.checks`.
4. Do not copy raw prompts, raw artifacts, secrets, stdout, stderr, full CLI output, or full warning text.

**Success criteria:**
- Only sanitized counts, booleans, decisions, and checks are reviewed.
- No Phase-2 validation logs are persisted.

**Stop criteria:**
- Raw prompt/artifact/secret is needed for review.
- Any observability, guardrail, validation, or expansion log is persisted without a separate contract.

---

### 6. Phase-2 Rollback Procedure

| Field | Value |
|-------|-------|
| **ID** | `phase_2_rollback_procedure` |
| **Category** | `rollback` |
| **Target request types** | `code_review`, `validation` |
| **Status** | `documented` |
| **Required before Phase-2 enablement** | `true` |

**Description:** Document rollback criteria for Phase-2 operator validation.

**Steps:**
1. Stop Phase-2 operator validation immediately.
2. Remove any manually provided Hermes enablement flags from the controlled environment.
3. Confirm disabled path does not call dispatcher.
4. Confirm Gateway primary/final result remains unchanged.
5. Keep current validated request type as review only.

**Success criteria:**
- Phase-2 validation stops.
- Hermes dispatcher is not called after manual flags are removed.
- Gateway and Runtime behavior remain unchanged.

**Stop criteria:**
- Dispatcher is still called after flags are removed.
- `code_review` or `validation` remains enabled after rollback.

---

### 7. Phase-2 Escalation Path

| Field | Value |
|-------|-------|
| **ID** | `phase_2_escalation_path` |
| **Category** | `escalation` |
| **Target request types** | `code_review`, `validation` |
| **Status** | `documented` |
| **Required before Phase-2 enablement** | `true` |

**Description:** Escalate Phase-2 safety boundary violations without persisting sensitive data.

**Steps:**
1. Stop Phase-2 validation immediately.
2. Preserve only sanitized reproduction notes.
3. Open follow-up work for a separate ownership or routing contract if needed.
4. Do not persist raw prompts, artifacts, secrets, stdout, stderr, full CLI output, or warning text.

**Success criteria:**
- Phase-2 validation is stopped.
- Follow-up evidence is sanitized.
- Hermes remains sidecar-only until a separate contract exists.

**Stop criteria:**
- Follow-up requires raw sensitive evidence.
- Follow-up proposes Hermes as default or final `code_review`/`validation` owner without a separate contract.

---

## Allowed Monitoring Signals

The following 9 sidecar metadata signals are allowed for review during Phase-2 operator validation:

1. `fallbackPolicy.reason`
2. `fallbackPolicy.action`
3. `observability.outcome`
4. `observability.warningCount`
5. `observability.hasWarnings`
6. `guardrails.decision`
7. `guardrails.allowed`
8. `guardrails.warningCount`
9. `guardrails.checks`

## Disallowed Operator Evidence

The following evidence types must not be collected, persisted, or required for operator decision-making:

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

## Rollback Triggers

- Hermes output becomes final code review decision.
- Hermes output becomes final validation decision.
- Gateway primary result changes.
- Gateway final result changes.
- Runtime `final_status` or routing changes.
- Unsupported request type invokes Hermes dispatcher.
- Raw prompt, raw artifact, or secret appears in sidecar metadata.
- Guardrails reject repeatedly due to warning limit or unsafe metadata.
- Any Phase-2 validation, expansion, audit, observability, or guardrail log is persisted without a separate contract.
- Any feature flag becomes enabled by default.

## Escalation Triggers

- Phase-2 validation requires raw prompt, artifact, secret, stdout, stderr, full CLI output, or warning text.
- Hermes sidecar output is requested as final `code_review` or `validation` decision.
- Hermes is proposed as default or primary Gateway owner.
- Runtime `final_status` or routing is proposed to depend on Hermes sidecar.
- `bugfix`, `llm_task`, or `code_generation` support is requested without a separate contract.

## Allowed Operator Outcomes

- `remain_review_only` — Keep current validated request type as `review` only.
- `complete_phase_2_operator_validation` — Complete Phase-2 validation with all procedures satisfied.
- `rollback` — Stop Phase-2 validation and remove manual flags.
- `propose_separate_ownership_contract` — Escalate for a separate ownership or routing contract.

## Constraints

- This PR is runbook-only and does not execute Phase-2 validation.
- This PR does not expand request types now.
- This PR does not change actual Gateway dispatch behavior.
- This PR does not enable Hermes feature flags.
- This PR does not add enablement scripts or CI behavior.
- Phase-2 operator targets are `code_review` and `validation` only.
- Current validated request type remains `review` only.
- Hermes remains Gateway sidecar metadata only.
- Hermes remains default-off and requires explicit flags.
- Hermes must not become final review, `code_review`, or `validation` owner without a separate ownership contract.
- Runtime `final_status` and routing must not depend on Hermes sidecar output.
- No Phase-2 runbook, validation, expansion, review, rollout, audit, observability, or guardrail logs may persist without a separate contract.
- Raw prompt, raw artifact, secret, stdout, stderr, full CLI output, and full warning text remain disallowed.
- No automatic Phase-2 validation, Phase-2 expansion, or automatic enablement is allowed.

## Not Included

| Capability | Included |
|------------|----------|
| Execute Phase-2 validation | No |
| Expand request types | No |
| Enable feature flags | No |
| Change Runtime behavior | No |
| Change Gateway behavior | No |
| Add enablement scripts | No |
| Change CI behavior | No |
| Change Gateway primary dispatch | No |
| Change Gateway final result | No |
| Change Runtime final status | No |
| Change Runtime routing | No |
| Affect primary Gateway result | No |
| Make Hermes default | No |
| Make Hermes final review owner | No |
| Make Hermes final code review owner | No |
| Make Hermes final validation owner | No |
| Write files | No |
| Persist any logs | No |
| Contain raw prompt | No |
| Contain raw artifacts | No |
| Contain secrets | No |

## Recommended Next PR

**Title:** Hermes Gateway Real Dispatch Phase-2 Post-Validation Review Template

**Safety rationale:** Template remains non-executing and documents Phase-2 review criteria without changing defaults.
