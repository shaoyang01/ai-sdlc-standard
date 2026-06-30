# Review Inputs

## Required Inputs

Collect these inputs before review:

- Requirement ID.
- Reviewed diff, commit range, PR, or changed file list.
- `library/{requirement_id}/01-技术方案/*` or current `specs/{feature}/spec.md`.
- Implementation record or implementation summary.
- Verification evidence or explicit skipped verification.

## Recommended Inputs

Use when present:

- `library/{requirement_id}/02-方案审核/*`.
- `library/{requirement_id}/03-实现记录/*`.
- `specs/{feature}/plan.md`.
- `specs/{feature}/tasks.md`.
- `library/{requirement_id}/manifest.md`.
- Re-Gate Records.
- Superseded Artifacts.
- Accepted risks.
- Existing `04-代码审核` report.

## Readiness Checks

Continue only when:

- Reviewed code scope is explicit.
- The reviewed code maps to a requirement or implementation scope.
- Specification basis exists for behavior-changing code.
- Current artifacts are not superseded.

Stop when the review would require guessing which requirement or artifact is current.

## Missing Input Handling

- Missing diff: stop.
- Missing implementation record: review the diff if enough specification basis exists, but mark the record gap.
- Missing verification evidence: continue review and classify as Test Gap when relevant.
- Missing specification basis for behavior: block behavioral approval and route upstream.
