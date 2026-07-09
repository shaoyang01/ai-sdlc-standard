# Codex Real Dispatch Fake Runner Test Plan Contract

## Purpose

This document defines the fake-runner test plan contract for future controlled real Codex dispatch in the AI SDLC Runtime.

It is **contract-only**. It does **not** implement fake runner logic, invoke real Codex, change Runtime behavior, change Gateway routing, attach metadata to `ExecutionResult` in production code, or enable real Codex by default.

## Relationship to Other Contracts

This fake-runner test plan contract sits alongside:

- **Codex Real Dispatch Readiness Review** — overall readiness verdict and constraints.
- **Codex Real Dispatch Fallback Policy** — how failures fall back to shadow behavior.
- **Codex Real Dispatch Observability Contract** — what sanitized signals may be observed.
- **Codex Real Dispatch Guardrails Contract** — limits, checks, and prohibited content rules.
- **Codex Real Dispatch Prompt Builder Contract** — how safe prompts are constructed.
- **Codex Real Dispatch Output Parser Contract** — how Codex CLI output becomes a `code_patch` artifact.
- **Codex Real Dispatch Gateway Integration Contract** — how sanitized metadata may attach to `ExecutionResult`.

The fake-runner test plan defines the validation boundary that must pass before any real Codex CLI or Gateway implementation is enabled.

## Fake Runner Boundary

A compliant fake runner must guarantee:

- **Real Codex CLI invoked**: `false`
- **Process spawn allowed**: `false`
- **Network allowed**: `false`
- **Filesystem writes allowed**: `false`
- **Production Gateway mutation allowed**: `false`
- **ExecutionResult metadata attachment now**: `false`

## Fake Runner Scenarios

Future fake-runner tests must cover:

1. `success_code_patch` — happy path producing a sanitized `code_patch` artifact.
2. `cli_missing` — Codex CLI binary not present.
3. `timeout` — Codex CLI invocation exceeds timeout.
4. `non_zero_exit` — Codex CLI exits with non-zero status.
5. `prompt_too_large` — prompt exceeds `maxPromptChars`.
6. `output_too_large` — output exceeds `maxOutputChars`.
7. `prohibited_prompt_content` — prompt contains secrets or prohibited patterns.
8. `prohibited_output_content` — output contains secrets or prohibited patterns.
9. `missing_file_path` — parser output lacks file path.
10. `empty_patch` — parser output has empty patch content.
11. `parse_error` — parser cannot parse output.
12. `unsupported_request_type` — request type is not `code_generation`.

## Expected Fallback Assertions

| Scenario | Expected Fallback |
|----------|-------------------|
| `cli_missing` | `shadow_fallback` |
| `timeout` | `shadow_fallback` |
| `non_zero_exit` | `shadow_fallback` |
| `prompt_too_large` | `reject_and_shadow_fallback` |
| `output_too_large` | `truncate_and_shadow_fallback` |
| `prohibited_prompt_content` | `reject_and_shadow_fallback` |
| `prohibited_output_content` | `reject_and_shadow_fallback` |
| `missing_file_path` | `reject_and_shadow_fallback` |
| `empty_patch` | `reject_and_shadow_fallback` |
| `parse_error` | `reject_and_shadow_fallback` |
| `unsupported_request_type` | `reject_and_shadow_fallback` |

## Expected Success Assertions

- **Artifact type**: `code_patch`
- **Require file path**: `true`
- **Require sanitized patch**: `true`
- **Raw stdout not persisted**: `true`
- **Raw stderr not persisted**: `true`
- **Raw prompt not persisted**: `true`

## Gateway Boundary Assertions

- **Primary result unchanged**: `true`
- **Final result shape unchanged**: `true`
- **Runtime routing unchanged**: `true`
- **Runtime final_status unchanged**: `true`
- **Codex output not routing signal**: `true`
- **Codex output not final decision**: `true`

## Metadata Boundary Assertions

- **Metadata key**: `codexRealDispatch`
- **Sanitized summary only**: `true`
- **Raw prompt forbidden**: `true`
- **Raw stdout forbidden**: `true`
- **Raw stderr forbidden**: `true`
- **Raw artifacts forbidden**: `true`
- **Full patch forbidden**: `true`
- **Secrets forbidden**: `true`

## Rollout Dependency

- **Required before real CLI**: `true`
- **Required before Gateway implementation**: `true`
- **Operator approval required after passing**: `true`

## Non-Goals

- Do not implement fake runner logic in production code in this PR.
- Do not implement Gateway integration logic in this PR.
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

Before any real fake runner is implemented, the following must be ready:

- Prompt builder implementation consuming `ImplementationExecutorInput`.
- Output parser implementation converting synthetic Codex-like output to `code_patch` artifacts.
- Guardrails enforcement validating prompt/output limits and prohibited content against synthetic inputs.
- Fallback policy implementation mapping all synthetic failures to shadow fallback.
- Gateway integration contract wiring synthetic metadata to `ExecutionResult` in test environment only.
- Controlled rollout plan reviewed and approved by operator after fake-runner tests pass.

## Verdict

`APPROVED_FOR_PLANNING`

This fake-runner test plan contract is approved for planning only. It remains contract-only and default-off. No real Codex execution is enabled by this document.

## Recommended Next PR

**Codex Real Dispatch Controlled Rollout Plan**
