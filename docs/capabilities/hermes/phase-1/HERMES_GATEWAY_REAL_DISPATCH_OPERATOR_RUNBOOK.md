# Hermes Gateway Real Dispatch Operator Runbook

## Status

runbook_only

## Scope

Gateway real dispatch sidecar operator runbook only.

## Non-execution Guarantees

- This PR does not execute operator actions.
- This PR does not enable feature flags.
- This PR does not change Runtime behavior.
- This PR does not change Gateway behavior.
- This PR does not add enablement scripts.
- This PR does not call Hermes CLI.
- This PR does not persist runbook/validation/rollout/audit/observability/guardrail logs.

## Required Prerequisites

- READY_WITH_CONSTRAINTS readiness verdict
- plan_only controlled rollout plan
- checklist_only rollout validation checklist
- operator approval outside this repository process

## Required Manual Flags

These are manual operator-provided flags, not repository defaults.

- `SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled`
- `SDLC_HERMES_GATEWAY_INTEGRATION=enabled`
- `SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled`

## Procedures

### pre_enablement_review

- Category: pre_enablement
- Description: Confirm readiness, rollout plan, and validation checklist before any manual enablement.
- Steps:
  - Confirm readiness verdict is READY_WITH_CONSTRAINTS.
  - Confirm controlled rollout plan status is plan_only.
  - Confirm rollout validation checklist status is checklist_only.
  - Confirm initial operator scope is review only.
  - Confirm no automatic rollout or automatic enablement path exists.
- Success criteria:
  - All prerequisite artifacts are present and current.
  - Operator approval is recorded outside this repository process.
- Stop criteria:
  - Readiness verdict is not READY_WITH_CONSTRAINTS.
  - Rollout validation checklist is missing or failed.

### manual_flag_enablement_reference

- Category: manual_enablement
- Description: Document the flags an operator would manually provide in a controlled environment.
- Steps:
  - In an operator-managed environment only, provide SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled.
  - In the same controlled environment, provide SDLC_HERMES_GATEWAY_INTEGRATION=enabled.
  - In the same controlled environment, provide SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled.
  - Limit initial requests to review.
- Success criteria:
  - All three required flags are explicitly set by the operator in the controlled environment.
  - No repository default or CI default enables these flags.
- Stop criteria:
  - Any flag is enabled by default in code, package scripts, CI, or tests.
  - Any request type outside review is included before approval.

### sidecar_validation

- Category: validation
- Description: Validate Hermes sidecar behavior after manual operator enablement.
- Steps:
  - Submit a controlled review request.
  - Confirm Gateway primary result is unchanged.
  - Confirm hermes_gateway_real_dispatch appears only as sidecar metadata when safe.
  - Confirm fallbackPolicy, observability, and guardrails are nested under the sidecar.
  - Confirm unsupported request types do not call dispatcher.
- Success criteria:
  - Sidecar attaches only for safe review requests.
  - Unsupported request types remain omitted.
  - Primary Gateway result and Runtime final_status/routing are unchanged.
- Stop criteria:
  - Hermes output changes primary Gateway result.
  - Runtime final_status or routing changes because of Hermes sidecar.
  - Unsupported request type invokes dispatcher.

### monitoring_signals_review

- Category: monitoring
- Description: Review in-memory sidecar signals for safe attach/omit behavior.
- Steps:
  - Inspect fallbackPolicy reason/action.
  - Inspect observability outcome and warningCount only.
  - Inspect guardrails decision and checks.
  - Confirm no raw warning text, raw prompt, raw artifact, or secret appears.
- Success criteria:
  - observability contains counts/booleans only.
  - guardrails decision is allow_attach only for safe bounded metadata.
  - no persistence is introduced.
- Stop criteria:
  - raw prompt/artifact/secret appears.
  - guardrails rejects repeatedly due to warning limits or unsafe metadata.
  - any observability/guardrail logs are persisted without a separate contract.

### rollback_procedure

- Category: rollback
- Description: Roll back by removing manual operator-provided enablement and returning to default-off sidecar omission.
- Steps:
  - Remove SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled from the controlled environment.
  - Remove SDLC_HERMES_GATEWAY_INTEGRATION=enabled from the controlled environment.
  - Remove SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled from the controlled environment.
  - Confirm disabled path does not call dispatcher.
  - Confirm Gateway primary result is unchanged.
- Success criteria:
  - Hermes dispatcher is not called after flags are removed.
  - hermes_gateway_real_dispatch is omitted.
  - Gateway and Runtime behavior remain unchanged.
- Stop criteria:
  - Dispatcher is still called after manual flags are removed.
  - Sidecar remains attached after rollback.

### escalation_path

- Category: escalation
- Description: Escalate if safety boundaries are violated during operator-managed validation.
- Steps:
  - Stop manual enablement immediately.
  - Preserve non-sensitive reproduction details outside sidecar metadata.
  - Open a follow-up review issue or PR with sanitized evidence.
  - Do not persist raw prompts, artifacts, secrets, stdout, or stderr.
- Success criteria:
  - Enablement is stopped.
  - Evidence is sanitized.
  - Follow-up work preserves sidecar-only constraints.
- Stop criteria:
  - Raw prompt/artifact/secret would need to be persisted.
  - Follow-up proposes Hermes as default or primary Gateway owner without separate contract.

## Monitoring Signals

Allowed signals only:

- fallbackPolicy.reason
- fallbackPolicy.action
- observability.outcome
- observability.warningCount
- observability.hasWarnings
- guardrails.decision
- guardrails.allowed
- guardrails.checks

Do not include warning text, raw prompts, raw artifacts, secrets, stdout, or stderr.

## Rollback Triggers

- Gateway primary result changes.
- Gateway final result changes.
- Runtime final_status or routing changes.
- Unsupported request type invokes Hermes dispatcher.
- Hermes sidecar includes raw prompt, raw artifact, or secret.
- Guardrails reject repeatedly due to warning limit or unsafe metadata.
- Any validation, rollout, audit, observability, or guardrail log is persisted without a separate contract.
- Any feature flag becomes enabled by default.

## Escalation Triggers

- Raw prompt, artifact, secret, stdout, or stderr would need to be persisted.
- Hermes sidecar output is requested as final review or validation decision.
- Hermes is proposed as default or primary Gateway owner.
- Runtime final_status or routing is proposed to depend on Hermes sidecar.
- Unsupported request type support is requested without a separate contract.

## Constraints

- This PR is runbook-only and does not execute operator actions.
- This PR does not enable Hermes feature flags.
- This PR does not add enablement scripts or package commands.
- Hermes remains Gateway sidecar metadata only.
- Hermes remains default-off and requires explicit flags.
- Initial operator validation is review-only.
- Expansion to code_review and validation requires operator approval.
- Hermes must not become final review or validation owner without a separate contract.
- Runtime final_status and routing must not depend on Hermes sidecar output.
- No validation, rollout, audit, observability, guardrail, or runbook logs may persist without a separate contract.
- No automatic rollout or automatic enablement is allowed.

## Not Included

- No operator action execution
- No flag enablement
- No enablement scripts
- No runtime behavior change
- No Gateway behavior change
- No Hermes default routing
- No final review/validation ownership
- No persistence
- No automatic rollout

## Recommended Next PR

Hermes Gateway Real Dispatch Post-Enablement Review Template
