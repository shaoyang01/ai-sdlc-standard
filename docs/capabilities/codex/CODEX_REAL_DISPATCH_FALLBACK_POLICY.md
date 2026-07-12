# Codex Real Dispatch Fallback Policy

## Verdict

**APPROVED_FOR_PLANNING**

This policy is contract-only. It does not implement fallback logic, invoke real Codex, or change Runtime or Gateway behavior.

## Purpose

Define how future real Codex CLI failures must fall back to shadow behavior so that:

- Runtime routing is never affected.
- `final_status` is never affected.
- Gateway primary result remains unchanged.
- No raw prompts, raw stdout/stderr, secrets, or full artifacts are persisted.
- Only sanitized summary fields are exposed.

This contract follows the Codex Real Dispatch Readiness Review, which established `READY_WITH_CONSTRAINTS` for `code_generation` only with `SDLC_EXECUTION_MODE=codex` as the required flag.

## Scope

- Adapter: Codex
- Capability: `codex_real_dispatch`
- Request type: `code_generation` only
- Status: `contract_only`
- Default: disabled

## Fallback Reasons

| Reason | Trigger |
|--------|---------|
| `cli_missing` | `codex` binary is not available |
| `timeout` | Codex CLI exceeds timeout limit |
| `non_zero_exit` | Codex CLI exits with non-zero code |
| `output_too_large` | Codex CLI output exceeds max output chars |
| `prompt_too_large` | Constructed prompt exceeds max prompt chars |
| `prohibited_content` | Output contains secrets, raw prompts, or other prohibited content |
| `unsupported_request_type` | Request type is not `code_generation` |
| `unknown_error` | Any other unexpected failure |

## Fallback Actions

| Action | Meaning |
|--------|---------|
| `shadow_fallback` | Return the default shadow result instead of the real Codex result |
| `truncate_and_shadow_fallback` | Truncate any summary to safe length, then return shadow result |
| `reject_and_shadow_fallback` | Reject the request before invoking Codex, then return shadow result |

## Fallback Matrix

| Reason | Action |
|--------|--------|
| `cli_missing` | `shadow_fallback` |
| `timeout` | `shadow_fallback` |
| `non_zero_exit` | `shadow_fallback` |
| `output_too_large` | `truncate_and_shadow_fallback` |
| `prompt_too_large` | `reject_and_shadow_fallback` |
| `prohibited_content` | `reject_and_shadow_fallback` |
| `unsupported_request_type` | `reject_and_shadow_fallback` |
| `unknown_error` | `shadow_fallback` |

## Sanitized Summary Fields

Fallback observability may expose only these summary fields:

- `reason`
- `action`
- `outcome`
- `warning_count`
- `has_warnings`
- `truncated_output_preview`
- `safe_message`

## Prohibited Persistence Fields

The following must never be persisted or emitted in fallback metadata:

- `raw_prompt`
- `full_prompt`
- `raw_output`
- `full_stdout`
- `full_stderr`
- `full_cli_output`
- `raw_artifacts`
- `patch_content`
- `secret`
- `token`
- `api_key`
- `password`
- `private_key`

## Allowed Persistence Fields

Only these safe fields may be persisted in fallback metadata:

- `reason`
- `action`
- `outcome`
- `summary`
- `warning_count`
- `has_warnings`
- `timestamp`
- `request_id`
- `request_type`

## Non-Goals

- Do not implement fallback logic in Gateway in this PR.
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

## Required Work Before Implementation

1. Observability contract defining allowed in-memory summary signals.
2. Operational guardrails contract enforcing prompt/output limits and prohibited content.
3. Prompt builder that consumes `ImplementationExecutorInput`.
4. Output parser/sanitizer that converts Codex CLI stdout into `code_patch` artifacts.
5. Gateway integration contract defining how `fallbackPolicy` attaches to `ExecutionResult`.
6. Fake-runner tests proving fallback paths without real Codex CLI.
7. Controlled rollout plan reviewed and approved by operator.

## Recommended Next PR

**Codex Real Dispatch Observability Contract**
