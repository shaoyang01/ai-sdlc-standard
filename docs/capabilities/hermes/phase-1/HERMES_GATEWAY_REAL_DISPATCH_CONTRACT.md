# Hermes Gateway Real Dispatch Contract

## Status

implemented_contract_only

## Scope

Defines future Hermes Gateway real dispatch eligibility for review/code_review/validation request types. This contract does not wire Hermes into ExecutionGateway, does not call Hermes CLI, and does not spawn processes.

## Required Flags

- `SDLC_HERMES_GATEWAY_REAL_DISPATCH=enabled`
- `SDLC_HERMES_GATEWAY_INTEGRATION=enabled`
- `SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled`

All three flags must be explicitly enabled for real dispatch eligibility.

## Supported Request Types

- `review`
- `code_review`
- `validation`

## Unsupported Request Types

- `llm_task` (Kimi-owned)
- `code_generation` (Codex-owned)
- `bugfix` (requires separate review loop contract)

## Contract Guarantees

- Default disabled
- Contract-only — no Gateway wiring in this PR
- Does not modify ExecutionGateway
- Does not call Hermes CLI
- Does not spawn process
- Does not change Runtime final_status
- Does not change Runtime routing
- Does not affect primary Gateway result
- No file writes
- No persisted audit
- No raw prompt/artifact/secrets

## Fallback Policy

| Condition | Fallback Action |
|-----------|----------------|
| Real dispatch disabled | Preserve existing Gateway behavior |
| Gateway integration disabled | Preserve existing Gateway behavior |
| Command execution disabled | Preserve existing Gateway behavior |
| Unsupported request type | Preserve existing Gateway behavior |
| Adapter disabled | Preserve existing Gateway behavior |
| Missing CLI command | Preserve existing Gateway behavior |
| Future execution failure | Fallback without final_status change |

All fallback paths preserve existing Gateway behavior and do not change Runtime final_status or routing.

## Not Included

- No Gateway wiring
- No CLI execution
- No fallback implementation
- No guardrails
- No observability
- No readiness verdict
- No Runtime sidecar changes

## Recommended Next PR

**Feature-flagged Hermes Gateway Real Dispatch**

Real dispatch implementation behind explicit flags, following Kimi's pattern — default-off, Gateway-controlled, with fake runners in tests.
