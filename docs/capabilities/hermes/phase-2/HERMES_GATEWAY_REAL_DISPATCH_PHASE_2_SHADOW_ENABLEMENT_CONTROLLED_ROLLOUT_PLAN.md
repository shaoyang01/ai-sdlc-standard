# Hermes Gateway Real Dispatch Phase-2 Shadow Enablement Controlled Rollout Plan

## Status

- status: `plan_only`
- plan exists does not mean rollout is approved.
- this PR does not execute operator actions.
- this PR does not execute rollout.
- this PR does not enable feature flags.
- implementation_authorization_scope: `plan_material_only`
- operator_action_authorization: `not_granted`
- rollout_authorization: `not_granted`
- operator_action_executed: `false`
- rollout_executed: `false`
- next governance decision is separate operator action authorization.

## Scope

This document is the plan-only controlled rollout plan for the Hermes Gateway Real Dispatch Phase-2 Shadow Enablement sidecar path. It defines phase structure, per-phase request caps, evidence policy, global stop conditions, and global rollback actions that any future separately-authorized operator action must follow. It is static governance material only: no shell command, package script, CI configuration, or automation in this plan can enable flags, execute requests, or persist logs.

## Current Fact Baseline

- current readiness verdict: `READY_WITH_CONSTRAINTS`
- implementation status: `implemented_phase_2_shadow_sidecar_only`
- validation status: `implemented_phase_2_shadow_sidecar_validation_only`
- operator acceptance status: `operator_acceptance_only`
- controlled rollout gate status: `controlled_rollout_gate_only`
- current validated request types: `["review"]`
- phase-2 shadow targets: `["code_review", "validation"]`
- supported request types: `["review", "code_review", "validation"]`
- initial rollout request types: `["code_review"]`
- unsupported request types: `["llm_task", "code_generation", "bugfix"]`
- Hermes remains default-disabled, feature-flagged, and sidecar-only.

## Non-Execution Boundary

- executingNow: `false`
- This plan changes no Runtime behavior, no Gateway primary dispatch, no Gateway final result, no Hermes dispatch eligibility, no CI behavior, and no ownership.
- Hermes does not become the default agent, the Gateway primary/final result owner, or the final review/code_review/validation owner.
- The three Hermes flags remain default-off; nothing in this plan provides them.
- This PR adds static plan material only; a separate operator action authorization is still required after the plan merges.

## Required Prerequisites

- The phase-2 shadow sidecar implementation, validation, operator acceptance, and controlled rollout gate artifacts exist with the statuses listed in Current Fact Baseline.
- This plan is merged into the fact branch.
- The Project Controller separately approves this plan.
- Operator, controlled environment, and rollback owner are identified in a separate authorization. This plan PR itself does not complete those authorizations.

## Required Flags

Any real phase-2 sidecar request must satisfy all three flags at once, provided temporarily by the operator in an explicit controlled non-default environment:

1. `SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled`
2. `SDLC_HERMES_GATEWAY_INTEGRATION=enabled`
3. `SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled`

## Approval Model

- operator_approval_required: `true`
- per_phase_approval_required: `true` — entering each phase requires a new explicit Project Controller approval; no automatic phase progression.
- per_request_operator_approval_required: `true` — every real request carries its own hermesPhase2ShadowEnablement operator approval.
- automatic_enablement_allowed: `false`
- rollout_may_proceed_automatically: `false`

## Rollout Phases

| # | Phase | executionMode | allowedRequestTypes | maxRealRequests |
| --- | --- | --- | --- | --- |
| 1 | `phase_0_plan_approval` | `none` | `[]` | 0 |
| 2 | `phase_1_fake_preflight` | `fake_only` | `[]` | 0 |
| 3 | `phase_2_code_review_canary_one` | `controlled_real_sidecar` | `["code_review"]` | 1 |
| 4 | `phase_3_code_review_limited_max_five` | `controlled_real_sidecar` | `["code_review"]` | 5 |
| 5 | `phase_4_validation_canary_one` | `controlled_real_sidecar` | `["validation"]` | 1 |
| 6 | `phase_5_mixed_limited_max_five` | `controlled_real_sidecar` | `["code_review", "validation"]` | 5 |
| 7 | `phase_6_post_rollout_review` | `none` | `[]` | 0 |

Phase semantics:

- `phase_0_plan_approval`: the plan file is merged into the fact branch; the Project Controller separately approves the plan; operator, controlled environment, and rollback owner are identified in a separate authorization; this plan PR itself does not complete those authorizations.
- `phase_1_fake_preflight`: fake dispatcher/fake runner only; no real Hermes CLI; no external services; disabled, missing-flag, missing-approval, unsupported, unsafe, exception, guardrail-refusal, and rollback-required paths all pass; all three CI jobs and all related tests pass.
- `phase_2_code_review_canary_one`: entered only after phase_1 succeeds with a new Project Controller approval; exactly one code_review request; the three flags are provided temporarily by the operator in an explicit controlled non-default environment; the request carries hermesPhase2ShadowEnablement operator approval; no automatic progression to the next phase.
- `phase_3_code_review_limited_max_five`: entered only after phase_2 succeeds with a new Project Controller approval; at most five additional code_review requests; each request still requires per-request operator approval; completing part of the requests never raises the cap automatically.
- `phase_4_validation_canary_one`: entered only after phase_3 succeeds with a new Project Controller approval; exactly one validation request; no other request type is expanded at the same time.
- `phase_5_mixed_limited_max_five`: entered only after phase_4 succeeds with a new Project Controller approval; at most five additional requests in total across code_review and validation; review, llm_task, code_generation, and bugfix are never added; concurrency, batching, and request caps are never raised automatically.
- `phase_6_post_rollout_review`: new controlled requests stop first; the three temporary flags are removed from the controlled environment; manual sanitized summaries are reviewed; Gateway, Runtime, ownership, and leakage/persistence boundaries are confirmed unchanged; scope is not expanded and Hermes does not become a default path before an independent post-rollout review completes.

## Request Caps

The 1/5/1/5 caps are per-phase maximums, never automatic batching, concurrency, or approval-free quotas:

- `phase_2`: at most exactly 1 code_review canary request.
- `phase_3`: at most 5 additional code_review requests.
- `phase_4`: at most exactly 1 validation canary request.
- `phase_5`: at most 5 additional requests in total across code_review and validation.

## Evidence Policy

- mode: `manual_sanitized_summary_only`
- automatic_collection_allowed: `false`
- persisted_by_plan: `false`
- repository_persistence_allowed: `false`
- manual_summary_required_after_each_phase: `true`

Allowed sanitized fields only:

`source_fact_head`, `plan_status`, `phase_id`, `environment_class`, `request_type`, `attempted_count`, `attached_count`, `omitted_count`, `dispatcher_call_count`, `fallback_reason_counts`, `guardrail_decision_counts`, `rollback_decision_counts`, `warning_count_total`, `warning_count_max`, `gateway_primary_preserved`, `gateway_final_preserved`, `runtime_final_status_preserved`, `runtime_routing_preserved`, `unsupported_dispatch_count`, `leakage_detected`, `persistence_detected`, `stop_triggered`, `stop_reason_enum`

Explicitly forbidden to collect or persist:

raw prompt; raw artifacts; request input/payload; requirement ID; repository content; business/customer data; secrets, tokens, credentials, API keys; stdout; stderr; full CLI output; full warning text; unbounded exception text; real personal names; unsanitized environment identifiers; automatically generated long-term logs; validation, rollout, audit, observability, guardrail, rollback, or operator raw logs.

This task defines the evidence policy only; it does not generate, collect, or persist any actual rollout evidence.

## Global Stop Conditions

1. A separate Project Controller phase approval is missing.
2. Operator, controlled environment, or rollback owner is not identified.
3. Any real request is missing any of the three required flags.
4. Any real request is missing per-request operator approval.
5. An unsupported request type invokes the dispatcher.
6. An approved canary/limited request does not attach the expected safe sidecar.
7. A dispatcher exception, sanitization failure, guardrail refusal, or rollback-required outcome occurs.
8. `guardrails.allowed` is not true or `guardrails.decision` is not allow.
9. Gateway primary result or Gateway final result changes.
10. Runtime `final_status` or Runtime routing changes.
11. Hermes is inferred to be the final review, code_review, or validation owner.
12. Raw prompt, artifact, business data, secret, stdout, stderr, full CLI output, or full warning text leaks.
13. Any persistence not separately approved is introduced.
14. `package.json`, scripts, or CI sets Hermes flags by default.
15. A feature flag becomes enabled by default.
16. A test invokes a real Hermes CLI or an external service.
17. Phase request types or the 1/5/1/5 caps are exceeded.
18. Any warning pauses further requests for manual review; exceeding the existing guardrail warning limit stops and rolls back.
19. A phase is entered automatically without a new approval.
20. A change to Runtime, Gateway, ownership, request-type contracts, or persistence contracts is required.

After any stop condition, neither the next request nor the next phase may continue.

## Rollback Actions

1. Stop new controlled requests immediately.
2. Remove all three Hermes flags from the controlled environment.
3. Stop providing hermesPhase2ShadowEnablement operator approval.
4. Confirm the disabled path does not invoke the dispatcher and does not attach the sidecar.
5. Confirm Gateway primary/final result and Runtime `final_status`/routing are unchanged.
6. Produce only a manual sanitized summary; do not keep raw inputs, outputs, or logs.
7. Report the stop reason and completed request counts to the Project Controller.
8. Do not resume a phase or expand scope without a new explicit approval.

## Ownership Boundaries

- hermes_final_review_owner: `false`
- hermes_final_code_review_owner: `false`
- hermes_final_validation_owner: `false`
- gateway_primary_result_preserved: `true`
- gateway_final_result_preserved: `true`
- runtime_final_status_preserved: `true`
- runtime_routing_preserved: `true`

## Next Governance Decision

- next_governance_decision: `separate_operator_action_authorization`
- legacy_recommended_next_pr_fulfilled: `true` — the legacy `recommended_next_pr` compatibility reference is fulfilled by this plan; legacy `recommended_next_pr` fields remain compatibility references only and carry no planning, authorization, or sequencing authority.
- Merging this plan does not authorize operator action or rollout.

## Prohibited Behaviors

- No real enablement commands, shell snippets, package scripts, CI env, or automation that sets Hermes flags.
- No operator action, canary, limited rollout, or post-rollout review execution.
- No expansion to review, llm_task, code_generation, or bugfix.
- No change to Gateway primary/final result, Runtime `final_status`/routing, or ownership.
- No collection or persistence of rollout logs or raw evidence.
- No representation of this plan as operator-approved, executed, enabled, rolled_out, or published.

## Evidence

- `execution/hermes-gateway-real-dispatch-phase-2-shadow-enablement-controlled-rollout-plan.ts`
- `tests/hermes-gateway-real-dispatch-phase-2-shadow-enablement-controlled-rollout-plan.test.ts`
- `docs/capabilities/hermes/phase-2/HERMES_GATEWAY_REAL_DISPATCH_PHASE_2_SHADOW_ENABLEMENT_CONTROLLED_ROLLOUT_PLAN.md`
- `metadata/capabilities/hermes/phase-2/hermes-gateway-real-dispatch-phase-2-shadow-enablement-controlled-rollout-plan.json`
