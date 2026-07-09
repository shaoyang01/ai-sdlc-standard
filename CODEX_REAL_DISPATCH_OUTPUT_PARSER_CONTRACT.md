# Codex Real Dispatch Output Parser Contract

## Purpose

This document defines the output parser / sanitizer contract for future controlled real Codex dispatch in the AI SDLC Runtime.

It is **contract-only**. It does **not** implement output parser logic, invoke real Codex, change Runtime behavior, change Gateway routing, or enable real Codex by default.

## Relationship to Other Contracts

This output parser contract sits alongside:

- **Codex Real Dispatch Readiness Review** — overall readiness verdict and constraints.
- **Codex Real Dispatch Fallback Policy** — how failures fall back to shadow behavior.
- **Codex Real Dispatch Observability Contract** — what sanitized signals may be observed.
- **Codex Real Dispatch Guardrails Contract** — limits, checks, and prohibited content rules.
- **Codex Real Dispatch Prompt Builder Contract** — how safe prompts are constructed.

The output parser contract defines how future Codex CLI output may be safely parsed into a `code_patch` artifact.

## Parser Input Source

- **Codex stdout allowed as raw parser input**: `true`
- **Raw stdout persistence allowed**: `false`
- **Raw stderr persistence allowed**: `false`
- **Raw stdout as patch allowed**: `false`

Raw stdout may be fed into the parser, but it must not be persisted or used directly as patch content. Raw stderr must never be persisted.

## Expected Output Artifact

Future parser output must be a single artifact:

- **Artifact type**: `code_patch`
- **Require file path**: `true`
- **Require patch content**: `true`
- **Require sanitized patch**: `true`
- **Prohibit raw stdout as patch**: `true`

## Parser Requirements

A valid parser implementation must:

- `extractFilePath` — extract or infer the target file path.
- `extractPatchContent` — extract the code patch content.
- `rejectEmptyPatch` — reject patches with empty content.
- `rejectMissingFilePath` — reject artifacts without a file path.
- `rejectOversizedOutput` — reject or truncate output exceeding limits.
- `rejectProhibitedContent` — reject output containing prohibited patterns.
- `sanitizeBeforeArtifact` — sanitize content before creating the artifact.

## Limits

| Limit | Value | Purpose |
|-------|-------|---------|
| `maxStdoutChars` | 64000 | Maximum raw stdout size accepted from Codex CLI. |
| `maxPatchChars` | 32000 | Maximum sanitized patch content size. |
| `maxFilePathChars` | 512 | Maximum file path length. |
| `maxSafeMessageChars` | 512 | Maximum parser-safe message length. |

## Prohibited Content

Future parser implementation must reject output containing patterns such as:

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

The following fields must never be persisted as part of parser output or observability:

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

## Allowed Artifact Content Fields

A `code_patch` artifact produced by the parser may contain only these content fields:

- `file` — target file path.
- `patch` — sanitized patch content.
- `parser_summary` — short bounded summary of parser actions.

## Fallback Behavior

| Parser Failure | Fallback Action |
|----------------|-----------------|
| `missingFilePath` | `reject_and_shadow_fallback` |
| `emptyPatch` | `reject_and_shadow_fallback` |
| `outputTooLarge` | `truncate_and_shadow_fallback` |
| `prohibitedOutputContent` | `reject_and_shadow_fallback` |
| `parseError` | `reject_and_shadow_fallback` |
| `unsupportedRequestType` | `reject_and_shadow_fallback` |

## Non-Goals

- Do not implement output parser logic in Gateway or adapter in this PR.
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
- Do not persist raw stdout, raw stderr, raw artifacts, secrets, or full patch content.
- Do not invoke real Codex CLI in tests.

## Required Work Before Implementation

Before any real output parser is implemented, the following must be ready:

- Gateway integration contract wiring parser output to `ExecutionResult`.
- Prompt builder implementation consuming `ImplementationExecutorInput`.
- Fallback policy implementation mapping parser failures to shadow fallback.
- Guardrails enforcement validating output limits and prohibited content.
- Fake-runner tests proving parser paths without real Codex CLI.
- Observability contract implementation exposing only sanitized summary signals.
- Controlled rollout plan reviewed and approved by operator.

## Verdict

`APPROVED_FOR_PLANNING`

This output parser contract is approved for planning only. It remains contract-only and default-off. No real Codex execution is enabled by this document.

## Recommended Next PR

**Codex Real Dispatch Gateway Integration Contract**
