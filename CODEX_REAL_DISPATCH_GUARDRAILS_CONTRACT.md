# Codex Real Dispatch Guardrails Contract

## Purpose

This document defines the operational guardrails contract for future controlled real Codex dispatch in the AI SDLC Runtime.

It is **contract-only**. It does **not** implement guardrail enforcement, invoke real Codex, change Runtime behavior, change Gateway routing, or enable real Codex by default.

## Relationship to Other Contracts

This guardrails contract sits alongside:

- **Codex Real Dispatch Readiness Review** — overall readiness verdict and constraints.
- **Codex Real Dispatch Fallback Policy** — how failures fall back to shadow behavior.
- **Codex Real Dispatch Observability Contract** — what sanitized signals may be observed.

The guardrails contract defines the limits, checks, prohibited content, and fallback mappings that future implementation must enforce before any real Codex CLI invocation.

## Guardrail Scope

- **Adapter**: `codex`
- **Capability**: `codex_real_dispatch`
- **Scope**: `guardrails_contract`
- **Status**: `contract_only`
- **Default enabled**: `false`
- **Feature flagged**: `true`
- **Supported request types**: `code_generation` only
- **Unsupported request types**: `code_review`, `validation`, `bugfix`, `llm_task`, `review`

## Limits

| Limit | Value | Purpose |
|-------|-------|---------|
| `maxPromptChars` | 16000 | Maximum prompt size sent to Codex CLI. |
| `maxOutputChars` | 64000 | Maximum output size accepted from Codex CLI. |
| `timeoutMs` | 120000 | Maximum time allowed for a Codex CLI invocation. |
| `maxSafeMessageChars` | 512 | Maximum length of any human-readable safe message. |
| `maxOutputPreviewChars` | 1024 | Maximum length of a sanitized output preview. |

## Pre-Dispatch Checks

Before any real Codex CLI invocation, future implementation must verify:

- `requestTypeSupported` — the request type is in `supportedRequestTypes`.
- `promptWithinLimit` — prompt length is within `maxPromptChars`.
- `noRawSecretInPrompt` — prompt does not contain secrets, tokens, API keys, passwords, private keys, or environment variables.
- `noRawArtifactDump` — prompt does not contain raw artifact dumps or full patch content.
- `noUnsupportedRequestType` — the request type is not in `unsupportedRequestTypes`.

## Post-Dispatch Checks

After any real Codex CLI invocation, future implementation must verify:

- `outputWithinLimit` — output length is within `maxOutputChars`.
- `noSecretInOutput` — output does not contain secrets, tokens, API keys, passwords, private keys, or environment variables.
- `noFullStdoutPersistence` — full stdout is not persisted.
- `noFullStderrPersistence` — full stderr is not persisted.
- `outputSanitizedBeforeArtifact` — output is sanitized before conversion to artifacts.

## Prohibited Content

Future guardrail implementation must reject prompts and outputs containing patterns such as:

- `secret`, `secrets`
- `token`, `tokens`
- `api_key`, `api-key`, `apikey`
- `password`, `passwords`
- `private_key`, `private-key`, `privatekey`
- `credential`, `credentials`
- `environment_variable`, `env_var`, `envvar`
- `BEGIN RSA PRIVATE KEY`, `BEGIN OPENSSH PRIVATE KEY`, `BEGIN PRIVATE KEY`
- `AKIA`, `ghp_`, `sk-`

## Prohibited Persistence Fields

The following fields must never be persisted as part of guardrail or observability output:

- `raw_prompt`, `full_prompt`
- `raw_stdout`, `full_stdout`
- `raw_stderr`, `full_stderr`
- `raw_output`, `full_output`
- `raw_artifacts`, `full_patch`, `patch_content`
- `secret`, `secrets`, `token`, `tokens`
- `api_key`, `api_keys`
- `password`, `passwords`
- `private_key`, `private_keys`
- `credential`, `credentials`
- `environment_variables`

## Fallback Behavior

| Guardrail Violation | Fallback Action |
|---------------------|-----------------|
| `promptTooLarge` | `reject_and_shadow_fallback` |
| `outputTooLarge` | `truncate_and_shadow_fallback` |
| `prohibitedPromptContent` | `reject_and_shadow_fallback` |
| `prohibitedOutputContent` | `reject_and_shadow_fallback` |
| `timeout` | `shadow_fallback` |
| `unsupportedRequestType` | `reject_and_shadow_fallback` |

## Non-Goals

- Do not implement guardrail enforcement logic in Gateway in this PR.
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

Before any real guardrail enforcement is implemented, the following must be ready:

- Prompt builder that consumes `ImplementationExecutorInput` and enforces `maxPromptChars`.
- Output sanitizer that strips prohibited content and enforces `maxOutputChars`.
- Gateway integration contract wiring guardrail decisions to `ExecutionResult`.
- Fallback policy implementation mapping each guardrail refusal to shadow fallback.
- Fake-runner tests proving guardrail paths without real Codex CLI.
- Observability contract implementation exposing only sanitized summary signals.
- Controlled rollout plan reviewed and approved by operator.

## Verdict

`APPROVED_FOR_PLANNING`

This guardrails contract is approved for planning only. It remains contract-only and default-off. No real Codex execution is enabled by this document.

## Recommended Next PR

**Codex Real Dispatch Prompt Builder Contract**

