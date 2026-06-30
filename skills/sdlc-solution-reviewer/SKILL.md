---
name: sdlc-solution-reviewer
description: |
  This skill should be used when the user asks to "审阅技术方案", "方案审阅", "检查方案是否能开发", "判断是否需要 Speckit", "审核 DeepSeek 方案", "输出方案审核", or asks Codex to review a technical specification and decide whether to implement directly or enter sdlc-speckit-pipeline.
version: 0.1.0
---

# Solution Reviewer

Review a technical specification as the global DocFlow Specification Gate. Decide whether the requirement can proceed to direct implementation, must enter `sdlc-speckit-pipeline`, or must return to specification revision.

## Core Rules

1. Review only the technical specification and supporting context.
2. Do not write or rewrite the technical specification.
3. Do not modify production code.
4. Do not modify `specs/**` or `.specify/business_domain/**`.
5. Do not silently continue when core business behavior is undefined.
6. Treat `library/{requirement_id}/01-技术方案/` as the primary input.
7. Write or recommend output under `library/{requirement_id}/02-方案审核/`.
8. Use `PASS`, `FAIL`, or `PASS_WITH_RISK`.
9. Always output a development path recommendation:
   - `DIRECT_IMPLEMENTATION`
   - `SPECKIT_PIPELINE_REQUIRED`
   - `BLOCKED_NEEDS_REVISION`
10. Require explicit risk acceptance for `PASS_WITH_RISK`.

## Required Standard Files

Use these repository standard files as authoritative rules:

- `../../skill-contracts/known-skills/sdlc-solution-reviewer.md`
- `../../ess/specification-schema.md`
- `../../ess/review-schema.md`
- `../../checklists/specification-checklist.md`
- `../../templates/gate-result-template.md`
- `../../templates/artifact-manifest-template.md`
- `../../ai-sdlc/artifact-storage.md`
- `../../ai-sdlc/change-control.md`

## Reference Files

Load these references as needed:

- `references/review-workflow.md` for the step-by-step review workflow.
- `references/development-path-decision.md` for direct implementation vs Speckit routing.
- `references/checklist.md` for severity and coverage checks.
- `references/output-report.md` for the report structure and manifest update suggestions.

## Workflow

### 1. Resolve Input

Identify:

- Requirement ID
- Technical specification path
- Optional requirement source path
- Optional manifest path
- Optional repository context
- Requested output format, if any

If the technical specification path is missing, search the current repository for:

```text
library/{requirement_id}/01-技术方案/*
```

If no technical specification can be found, stop and report the missing artifact.

### 2. Load Review Rules

Read:

- `references/review-workflow.md`
- `references/development-path-decision.md`
- `references/checklist.md`

Also read `references/output-report.md` before producing a final report or writing an artifact.

### 3. Review Specification

Check the technical specification against:

- ESS required sections
- Behavior preservation
- Original-flow compatibility
- Failure, timeout, exception, retry, idempotency, and transaction handling
- State transitions
- Data source and empty-data behavior
- DB, cache, MQ, API, and logging impact
- Monitoring and observability
- Test strategy and acceptance criteria
- Requirement change and Re-Gate implications

Classify every issue as Critical, High, Medium, or Low.

### 4. Decide Gate Result

Use these rules:

- Any Critical issue -> `FAIL`
- Any High issue without explicit risk acceptance -> `FAIL`
- High issues with explicit risk acceptance -> `PASS_WITH_RISK`
- No Critical / unaccepted High -> `PASS`

Do not produce `PASS_WITH_RISK` unless accepted risk, accepted by, reason, and follow-up are known.

### 5. Decide Development Path

Output exactly one recommendation:

- `DIRECT_IMPLEMENTATION`
- `SPECKIT_PIPELINE_REQUIRED`
- `BLOCKED_NEEDS_REVISION`

Use `BLOCKED_NEEDS_REVISION` whenever the Gate Result is `FAIL`.

Use `SPECKIT_PIPELINE_REQUIRED` for complex changes involving multi-module flow, state machine changes, DB/MQ/schedule/listener/process changes, complex rollback, or knowledge sync needs.

Use `DIRECT_IMPLEMENTATION` only when the specification is complete and the implementation can proceed without a full SDD pipeline.

### 6. Output or Write Report

By default, return the review report in the response.

When the user explicitly asks to generate an artifact, write:

```text
library/{requirement_id}/02-方案审核/{requirement_id}__方案审核__vN.md
```

If the user asks for HTML or Lark/Feishu output, use `sdlc-docflow-writer` for routing and publishing. Keep this skill responsible for review content only.

### 7. Report Manifest Updates

Always recommend manifest updates for:

- Artifact Index: `02 方案审核`
- Gate Decisions: `方案审核`
- Development Path Decision
- Activity Log
- Blocking Issues or Next Step

Do not silently edit manifest unless the user explicitly asks for file updates.

## Output Requirements

Every review report must contain:

- Reviewed Artifact
- Result
- Can Continue
- Development Path Recommendation
- Recommendation Reason
- Critical / High / Medium / Low
- Missing Constraint
- Missing Branch
- Behavior Risk
- Compatibility Risk
- Implementation Risk
- Test Gap
- Pending Confirmation
- Required Actions
- Manifest Update Recommendation
- Next Step

## Stop Conditions

Stop instead of guessing when:

- Technical specification is missing or unreadable.
- Requirement boundary cannot be determined.
- Original-flow compatibility is undefined.
- Failure strategy is undefined for behavior-changing logic.
- State transition or data source is undefined.
- Development path cannot be decided without inventing business rules.
