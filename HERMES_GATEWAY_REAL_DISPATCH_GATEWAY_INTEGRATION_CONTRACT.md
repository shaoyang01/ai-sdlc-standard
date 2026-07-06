# Hermes Gateway Real Dispatch Gateway Integration Contract

## Status
implemented_contract_only

## Scope
Defines how the Hermes Gateway real dispatch helper may later attach to Gateway result metadata.

## Future Gateway Field
hermes_gateway_real_dispatch

## Required Flag
SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled

## Supported Request Types
review, code_review, validation

## Unsupported Request Types
llm_task, code_generation, bugfix

## Contract Guarantees
- Contract-only
- Does not modify execution/gateway.ts
- Does not call dispatchHermesGatewayReal
- Does not call Hermes CLI
- Does not change Gateway primary dispatch
- Does not change Gateway final result now
- Does not change Runtime final_status/routing
- Omit field when disabled
- Never write undefined key
- No persisted audit
- No file writes
- No raw prompt/artifacts/secrets

## Unsafe Result Rejection
The future Gateway attachment must reject a dispatch result when any of these fields is not false:

- changesGatewayPrimaryDispatch
- changesRuntimeFinalStatus
- changesRuntimeRouting
- affectsPrimaryGatewayResult
- writesFiles
- persistsAudit
- containsRawPrompt
- containsRawArtifacts
- containsSecrets

## Not Included
- No actual Gateway wiring
- No Gateway result field yet
- No final Gateway decision ownership
- No fallback implementation
- No guardrails
- No observability
- No readiness verdict

## Recommended Next PR
Feature-flagged Hermes Gateway Real Dispatch Gateway Integration
