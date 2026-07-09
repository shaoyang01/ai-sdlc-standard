# Codex Real Dispatch Gateway Integration Contract

## Purpose

This document defines the Gateway integration contract for future controlled real Codex dispatch in the AI SDLC Runtime.

It is **contract-only**. It does **not** implement Gateway integration logic, attach metadata to `ExecutionResult` in production code, invoke real Codex, change Runtime behavior, change Gateway routing, or enable real Codex by default.

## Relationship to Other Contracts

This Gateway integration contract sits alongside:

- **Codex Real Dispatch Readiness Review** — overall readiness verdict and constraints.
- **Codex Real Dispatch Fallback Policy** — how failures fall back to shadow behavior.
- **Codex Real Dispatch Observability Contract** — what sanitized signals may be observed.
- **Codex Real Dispatch Guardrails Contract** — limits, checks, and prohibited content rules.
- **Codex Real Dispatch Prompt Builder Contract** — how safe prompts are constructed.
- **Codex Real Dispatch Output Parser Contract** — how Codex CLI output becomes a `code_patch` artifact.

The Gateway integration contract defines how future implementation may attach sanitized Codex real-dispatch metadata to `ExecutionResult` without changing Gateway primary result behavior, Runtime routing, or `final_status`.

## Gateway Integration Boundary

Future implementation must guarantee:

- **Gateway primary result unchanged**: `true`
- **Gateway final result shape unchanged**: `true`
- **Runtime routing unchanged**: `true`
- **Runtime final_status unchanged**: `true`
- **Codex output is not a routing signal**: `true`
- **Codex output is not a final decision owner**: `true`

## Future ExecutionResult Metadata

If future implementation attaches metadata to `ExecutionResult`, it must use:

- **Metadata key**: `codexRealDispatch`
- **Attach only sanitized summary**: `true`
- **Attach raw prompt**: `false`
- **Attach raw stdout**: `false`
- **Attach raw stderr**: `false`
- **Attach raw artifacts**: `false`
- **Attach full patch**: `false`
- **Attach secrets**: `false`

## Allowed Metadata Fields

Only these sanitized metadata fields may be attached:

- `enabled`
- `attempted`
- `success`
- `outcome`
- `fallback_reason`
- `fallback_action`
- `duration_ms`
- `prompt_char_count`
- `output_char_count`
- `warning_count`
- `has_warnings`
- `parser_summary`
- `safe_message`
- `request_type`
- `node`
- `agent`

## Prohibited Metadata Fields

The following fields must never be attached:

- `raw_prompt`, `full_prompt`
- `raw_stdout`, `full_stdout`
- `raw_stderr`, `full_stderr`
- `raw_output`, `full_output`
- `raw_artifacts`, `full_patch`, `patch_content`
- `secret`, `secrets`
- `token`, `tokens`
- `api_key`, `api_keys`
- `password`, `passwords`
- `private_key`, `private_keys`
- `credential`, `credentials`
- `environment_variables`

## Integration Inputs

Future Gateway integration must consume these upstream contracts:

1. `fallback_policy`
2. `observability_contract`
3. `guardrails_contract`
4. `prompt_builder_contract`
5. `output_parser_contract`

## Fallback Behavior

- **Fallback keeps primary shadow result**: `true`
- **Fallback does not change Runtime status**: `true`
- **Fallback does not change routing**: `true`
- **Fallback reason is summary-only**: `true`

## Rollout Boundary

- **Requires explicit feature flag**: `true`
- **Default off**: `true`
- **Fake-runner tests required before real CLI**: `true`
- **Operator approval required**: `true`

## Non-Goals

- Do not implement Gateway integration logic in Gateway or adapter in this PR.
- Do not attach metadata to `ExecutionResult` in production code in this PR.
- Do not invoke real Codex CLI.
- Do not change Runtime graph transitions.
- Do not change Runtime `final_status` semantics.
- Do not change Execution Gateway primary dispatch behavior.
- Do not change Execution Gateway final result shape.
- Do not expand supported request types beyond `code_generation`.
- Do not make Codex output a routing signal.
- Do not make Codex the default agent for any node.
- Do not make Codex the final owner of review, code_review, or validation decisions.
- Do not add package scripts, CI steps, or default environment values that enable real Codex.
- Do not persist raw prompts, raw artifacts, secrets, full stdout, or full stderr.
- Do not invoke real Codex CLI in tests.

## Required Work Before Implementation

Before any real Gateway integration is implemented, the following must be ready:

- Fake-runner tests proving prompt builder, output parser, and Gateway integration paths without real Codex CLI.
- Prompt builder implementation consuming `ImplementationExecutorInput`.
- Output parser implementation converting Codex CLI stdout to `code_patch` artifacts.
- Guardrails enforcement validating prompt/output limits and prohibited content.
- Fallback policy implementation mapping all failures to shadow fallback.
- Observability contract implementation exposing only sanitized summary signals.
- Controlled rollout plan reviewed and approved by operator.

## Verdict

`APPROVED_FOR_PLANNING`

This Gateway integration contract is approved for planning only. It remains contract-only and default-off. No real Codex execution is enabled by this document.

## Recommended Next PR

**Codex Real Dispatch Controlled Rollout Plan**
