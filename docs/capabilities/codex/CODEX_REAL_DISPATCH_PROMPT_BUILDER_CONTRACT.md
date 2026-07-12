# Codex Real Dispatch Prompt Builder Contract

## Purpose

This document defines the prompt builder contract for future controlled real Codex dispatch in the AI SDLC Runtime.

It is **contract-only**. It does **not** implement prompt builder logic, invoke real Codex, change Runtime behavior, change Gateway routing, or enable real Codex by default.

## Relationship to Other Contracts

This prompt builder contract sits alongside:

- **Codex Real Dispatch Readiness Review** — overall readiness verdict and constraints.
- **Codex Real Dispatch Fallback Policy** — how failures fall back to shadow behavior.
- **Codex Real Dispatch Observability Contract** — what sanitized signals may be observed.
- **Codex Real Dispatch Guardrails Contract** — limits, checks, and prohibited content rules.

The prompt builder contract defines how future implementation may construct safe Codex prompts from `ImplementationExecutorInput`.

## Prompt Source

- **Required input**: `ImplementationExecutorInput`
- **Raw Runtime context dump allowed**: `false`
- **Raw artifacts allowed**: `false`
- **Full patch content allowed**: `false`

Future implementation must not dump the entire Runtime context into the prompt. It must consume only the typed `ImplementationExecutorInput` fields.

## Required Prompt Sections

A valid Codex prompt must include these sections in order:

1. `task_summary` — concise description of the requested code generation task.
2. `requirement` — normalized requirement text and summary.
3. `structured_design` — design output from the tech-design node (approach, components, interfaces, dependencies, test strategy, risks).
4. `implementation_constraints` — complexity, execution mode, and any bounded constraints.
5. `expected_output_contract` — the expected `code_patch` artifact shape (file path + patch content).

## Allowed Input Fields

The prompt builder may read only these fields from `ImplementationExecutorInput`:

- `requirement`
- `requirementId`
- `summary`
- `designOutput`
- `reviewOutput`
- `complexity`
- `executionMode`

## Prohibited Input Fields

The following fields must never be included in the prompt:

- `raw_context`
- `raw_artifacts`
- `full_patch`
- `patch_content`
- `raw_prompt`
- `full_prompt`
- `raw_stdout`
- `full_stdout`
- `raw_stderr`
- `full_stderr`
- `raw_output`
- `full_output`
- `secret`, `secrets`
- `token`, `tokens`
- `api_key`, `api_keys`
- `password`, `passwords`
- `private_key`, `private_keys`
- `credential`, `credentials`
- `environment_variables`

## Prompt Limits

| Limit | Value | Purpose |
|-------|-------|---------|
| `maxPromptChars` | 16000 | Maximum total prompt size. |
| `maxRequirementChars` | 4000 | Maximum requirement section size. |
| `maxDesignChars` | 4000 | Maximum structured design section size. |
| `maxReviewChars` | 2000 | Maximum review section size. |

## Sanitization Rules

Before any prompt is sent to Codex, future implementation must:

- `stripSecrets` — remove secrets, tokens, API keys, passwords, private keys, and credentials.
- `stripRawArtifacts` — remove raw artifact dumps.
- `stripFullPatchContent` — remove full patch content.
- `truncateLongFields` — truncate fields that exceed per-section limits.
- `omitUnsafeFields` — omit any field not in the allowed list rather than include it.

## Expected Output Contract

Future Codex output must be converted to a single artifact:

- **Artifact type**: `code_patch`
- **Must include patch content**: `true`
- **Must include file path**: `true`
- **Must prohibit using raw stdout directly as patch content**: `true`

Raw CLI stdout must be parsed and sanitized; it must not be stored verbatim as the patch.

## Fallback Behavior

| Prompt Builder Failure | Fallback Action |
|------------------------|-----------------|
| `promptTooLarge` | `reject_and_shadow_fallback` |
| `prohibitedPromptContent` | `reject_and_shadow_fallback` |
| `unsupportedRequestType` | `reject_and_shadow_fallback` |

## Non-Goals

- Do not implement prompt builder logic in Gateway or adapter in this PR.
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

Before any real prompt builder is implemented, the following must be ready:

- Output parser/sanitizer contract defining how Codex CLI output becomes `code_patch` artifacts.
- Gateway integration contract wiring prompt builder output to `ExecutionResult`.
- Fallback policy implementation mapping prompt builder failures to shadow fallback.
- Guardrails enforcement validating prompt limits and prohibited content.
- Fake-runner tests proving prompt builder paths without real Codex CLI.
- Observability contract implementation exposing only sanitized summary signals.
- Controlled rollout plan reviewed and approved by operator.

## Verdict

`APPROVED_FOR_PLANNING`

This prompt builder contract is approved for planning only. It remains contract-only and default-off. No real Codex execution is enabled by this document.

## Recommended Next PR

**Codex Real Dispatch Output Parser Contract**
