# Test Feedback Classification Workflow

## Purpose

Use this workflow to turn raw test, acceptance, or online verification feedback into a structured `05-测试验收` artifact.

The output must decide what happens next: fix implementation, update specification, handle a requirement change, correct the test case, resolve environment/data issues, or hand reusable gaps to `sdlc-test-feedback-sync`.

## Step 1: Identify Feedback Context

Collect:

- Requirement ID
- Feedback source
- Test date and environment
- Tester or reporter
- Test scope
- Passed cases
- Failed cases
- Screenshots, logs, sample data, request/response, or reproduction steps
- Related `01-技术方案`
- Related `02-方案审核`
- Related `03-实现记录`
- Related `04-代码审核`

If the failure has no observed behavior or expected behavior, stop and ask for evidence.

## Step 2: Split Feedback Items

Split raw feedback into independent items.

Each item should have:

- Case ID or short title
- Observed behavior
- Expected behavior
- Reproduction step
- Evidence
- Impact
- Primary classification
- Required action

Do not group unrelated failures into one classification.

## Step 3: Compare Against The Current Basis

Compare each item against:

- Approved specification
- Solution review Gate
- Implementation record
- Code review report
- Test case or acceptance wording

Use the current effective artifact versions from manifest when available.

## Step 4: Classify

Assign exactly one primary classification:

- Implementation Bug
- Specification Missing
- Review Missing
- Requirement Change
- Test Case Issue
- Environment / Data Issue

When two classifications seem plausible, choose the earliest workflow node that must change.

## Step 5: Decide Result

Use:

- `PASS` when all test scope passed and no blocking issue remains.
- `PASS_WITH_RISK` when non-blocking issues remain and risk acceptance is explicit.
- `FAIL` when any failed case blocks acceptance, release, or next phase.

Do not use `PASS_WITH_RISK` without Accepted Risk, Accepted By, Accepted At, Accepted Reason, Accepted Scope, Follow-up Required, and Follow-up Owner.

## Step 6: Recommend Next Step

Use one:

- `Fix implementation and update implementation record`
- `Return to sdlc-specification-writer and rerun sdlc-solution-reviewer`
- `Apply change-control`
- `Update test case or acceptance wording`
- `Resolve environment or data issue`
- `Run sdlc-test-feedback-sync`
- `Run sdlc-gate-runner`

Recommend `sdlc-test-feedback-sync` only after the classification artifact is stable.
