# Codex Real Dispatch Readiness Review

## Verdict

**READY_WITH_CONSTRAINTS**

This review is contract-only. It does not enable real Codex execution, expand request types, or change Runtime or Gateway behavior.

## Purpose

Define the safety boundary for a future controlled real Codex dispatch path. The shadow LOOP Runtime baseline is now coherent:

- Structured tech-design output exists.
- Default implementation emits a deterministic `code_patch` artifact.
- Code-review checks `code_patch` is non-empty.
- Validation checks implementation output.
- Feedback reflects code-review and validation results.
- Executor injection seam and typed implementation contracts exist.

Before any real Codex CLI is wired into the Execution Gateway, this review records the required flags, guardrails, fallback policy, observability boundaries, and non-goals.

## Scope

Real Codex dispatch for `code_generation` only. No other request types are in scope.

## Current Shadow Baseline

- `execution/codex-adapter.ts` already implements a real Codex CLI path behind `SDLC_EXECUTION_MODE=codex`.
- The Execution Gateway routes to Codex only when `mode === "codex"` and `agent === "codex"`.
- Default execution remains shadow.
- No real Codex CLI is required for tests.

## What Real Codex Dispatch Would Mean

A future implementation PR would:

1. Keep `SDLC_EXECUTION_MODE=codex` as the sole required flag.
2. Support `code_generation` request type only.
3. Build prompts from `ImplementationExecutorInput`, not from raw context dump.
4. Parse and sanitize Codex CLI stdout into `code_patch` artifacts.
5. Apply prompt/output size guardrails.
6. Fall back to shadow output on CLI failure, timeout, or oversized output.
7. Emit only summary, non-persisted observability metadata.
8. Never change Runtime routing or `final_status`.
9. Never make Codex the final owner of review, code_review, or validation decisions.

## Required Flags

- `SDLC_EXECUTION_MODE=codex`

No package script, CI step, or default environment value enables this flag.

## Supported Request Types

- `code_generation`

## Unsupported Request Types

- `code_review`
- `validation`
- `bugfix`
- `llm_task`
- `review`

Expansion beyond `code_generation` requires a separate contract/review PR.

## Guardrails

| Guardrail | Limit |
|-----------|-------|
| Maximum prompt length | 20,000 characters |
| Maximum output length | 50,000 characters |
| CLI timeout | 120,000 ms |
| Raw prompt persistence | Prohibited |
| Secret persistence | Prohibited |
| Full stdout persistence | Prohibited |
| Full stderr persistence | Prohibited |

## Fallback Policy

| Failure Mode | Action |
|--------------|--------|
| Codex CLI missing | `shadow_fallback` |
| CLI timeout | `shadow_fallback` |
| Non-zero exit | `shadow_fallback` |
| Output too large | `truncate_and_shadow_fallback` |

All fallback paths preserve the Gateway primary result and Runtime `final_status` / routing.

## Observability Boundaries

- Observability is in-memory only.
- No persisted audit, observability, or guardrail logs.
- No raw prompts, raw artifacts, secrets, full stdout, or full stderr.
- Summary signals only (counts, booleans, outcomes).

## Non-Goals

- Do not change Runtime graph transitions.
- Do not change Runtime `final_status` semantics.
- Do not change Execution Gateway primary dispatch behavior.
- Do not change Execution Gateway final result shape.
- Do not expand supported request types beyond `code_generation`.
- Do not route `code_review`, `validation`, `bugfix`, `llm_task`, or `review` through Codex.
- Do not make Codex output a routing signal.
- Do not make Codex the default agent for any node.
- Do not make Codex the final owner of review, code_review, or validation decisions.
- Do not add package scripts, CI steps, or default environment values that enable real Codex.
- Do not persist raw prompts, raw artifacts, secrets, full stdout, or full stderr.
- Do not invoke real Codex CLI in tests.

## Required Work Before Enablement

1. Fallback policy contract defining `shadow_fallback` behavior for all CLI failure modes.
2. Observability contract defining in-memory, summary-only, non-persisted observability signals.
3. Operational guardrails contract enforcing prompt/output size limits and prohibited content.
4. Prompt builder that consumes `ImplementationExecutorInput` instead of raw context dump.
5. Output parser/sanitizer that converts Codex CLI stdout into `code_patch` artifacts without storing raw output.
6. Fake-runner tests proving Gateway integration without real Codex CLI.
7. Controlled rollout plan reviewed and approved by operator.

## Recommended Next PR

**Codex Real Dispatch Fallback Policy Contract**

Define the exact fallback decisions, refusal conditions, and sanitized summaries future shadow-only implementation must apply.
