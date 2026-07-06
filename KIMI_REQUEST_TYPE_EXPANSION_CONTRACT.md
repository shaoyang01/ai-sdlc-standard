# Kimi Request Type Expansion Contract

## 1. Executive Summary

This contract defines whether Kimi Gateway real dispatch should support request types beyond `llm_task`. It is contract-only and review-only. No request type expansion is implemented in this PR.

**Verdict: NO_EXPANSION_IN_THIS_PR**

Kimi remains `llm_task` only. All other request types are explicitly deferred to their appropriate owners: code_generation to Codex, review/code_review/validation to Hermes, and bugfix to a separate review.

## 2. Current Supported Scope

Kimi Gateway real dispatch currently supports **`llm_task` only**. It is feature-flagged, default-off, Gateway-controlled, and protected by fallback policy, observability, and operational guardrails. The final readiness review verdict is READY_WITH_CONSTRAINTS.

## 3. Expansion Decision Matrix

| Request Type | Recommendation | Future Owner | Rationale |
|-------------|---------------|--------------|-----------|
| `llm_task` | approved_candidate | Kimi | Already supported behind explicit flags |
| `code_generation` | defer_to_codex | Codex | Codex owns code_generation; Kimi expansion risks agent ownership drift |
| `code_review` | defer_to_hermes | Hermes | Hermes is the review/validation adapter; requires Hermes dispatch contract first |
| `validation` | defer_to_hermes | Hermes | Aligns with Hermes validation path; wait for Hermes dispatch contract |
| `review` | defer_to_hermes | Hermes | Review-like tasks remain Hermes candidates until Hermes path is implemented |
| `bugfix` | requires_separate_review | TBD | Requires review-loop semantics, artifact safety, and patch boundary review |

## 4. Request Type Assessments

### llm_task
- **Status:** Already supported behind 3 explicit feature flags
- **Verdict:** No expansion needed; remains the only Kimi-supported type

### code_generation
- **Why not Kimi:** Codex already owns code_generation with real execution via `SDLC_EXECUTION_MODE=codex`
- **Risk if expanded:** Agent ownership drift, dual-agent routing ambiguity
- **Deferred to:** Codex — no further action needed for Kimi

### code_review
- **Why not Kimi now:** Hermes is the intended review/validation-oriented adapter
- **Required before Kimi expansion:** Hermes real dispatch contract must exist first
- **Deferred to:** Hermes

### validation
- **Why not Kimi now:** Validation aligns with Hermes review/validation path
- **Required before Kimi expansion:** Hermes real dispatch contract must exist first
- **Deferred to:** Hermes

### review
- **Why not Kimi now:** Review-like tasks should remain Hermes candidates
- **Required before Kimi expansion:** Hermes real dispatch contract must exist first
- **Deferred to:** Hermes

### bugfix
- **Why not Kimi now:** Bugfix can mutate implementation artifacts; requires review-loop semantics, artifact safety, and patch application boundary review
- **Deferred to:** Separate review — no agent assigned yet
- **Required before any assignment:** Full review-loop and artifact-safety review

## 5. Safety Boundaries

| Boundary | Status |
|----------|--------|
| No Gateway dispatch change | Enforced — this PR does not modify Gateway |
| No Runtime routing change | Enforced — this PR does not modify Runtime |
| No Runtime final_status change | Enforced |
| No Kimi support for code_generation | Enforced — deferred to Codex |
| No Kimi support for review/code_review/validation | Enforced — deferred to Hermes |
| No Kimi support for bugfix | Enforced — requires separate review |
| No real Kimi CLI invocation | Enforced — contract-only |

## 6. Required Future PRs

1. **Hermes CLI Command Executor Implementation Behind Feature Flag** — Prerequisite for Kimi review/validation expansion
2. **Hermes Gateway Real Dispatch Contract** — Required before any review/validation dispatch
3. **Bugfix Review-Loop and Artifact Safety Review** — Required before any bugfix agent assignment

## 7. Explicit Non-goals

This PR does not change Gateway dispatch.
This PR does not change Runtime routing.
This PR does not change Runtime final_status.
This PR does not add Kimi support for code_generation.
This PR does not add Kimi support for review.
This PR does not add Kimi support for code_review.
This PR does not add Kimi support for validation.
This PR does not add Kimi support for bugfix.
This PR does not call real Kimi CLI.
This PR does not modify any implementation dispatch files.

## 8. Contract Verdict

**NO_EXPANSION_IN_THIS_PR**

Kimi remains `llm_task` only. No request type expansion is implemented. code_generation remains Codex-owned. review/code_review/validation are deferred to Hermes. bugfix requires a separate review-loop and artifact-safety review.

## 9. Recommended Next Step

**Hermes CLI Command Executor Implementation Behind Feature Flag**

Since review, code_review, and validation are all deferred to Hermes, Hermes should be advanced next. Kimi should remain `llm_task`-only until Hermes path is reviewed. The Hermes executor should follow the same isolated, feature-flagged pattern as Kimi (`SDLC_HERMES_CLI_COMMAND_EXECUTION=enabled`), with no Gateway or Runtime wiring until a separate integration contract.
