# Implementation Recording Workflow

## Purpose

Use this workflow to produce a factual `03-实现记录` artifact after implementation.

The output must help the next reviewer understand what changed, what was verified, and whether the implementation can enter Code Review.

## Step 1: Identify The Implementation Scope

Collect:

- Requirement ID
- Repository and branch
- Commit range or diff range
- Changed files
- Related tasks
- Related specification and solution review artifacts
- Verification commands
- Known skipped checks

If only a chat summary exists, ask for diff, changed files, or commit range before writing a ready-for-review record.

## Step 2: Map Changes To Specification

For each meaningful change, map it to:

- `01-技术方案`
- `02-方案审核`
- Speckit `plan.md` or `tasks.md`
- User-confirmed implementation request

Use `Specification Basis: missing` only when no basis exists. Do not invent a basis.

## Step 3: Summarize Changed Files

Group changed files by module or responsibility:

- API / controller
- service / domain logic
- repository / DAO
- database migration
- MQ / listener
- schedule / job
- cache
- configuration
- tests
- documentation

For each group, record the implementation purpose and behavior impact.

## Step 4: Record Verification

For each command or check, record:

- Command
- Scope
- Result: passed / failed / skipped / not run
- Evidence or output summary
- Failure reason
- Follow-up action

Do not mark a check as passed without evidence.

## Step 5: Evaluate Readiness For Code Review

Mark `Ready for Code Review: yes` only when:

- Implementation scope is clear.
- Changed files are listed.
- Behavior-changing work has specification basis.
- Required verification passed or skipped with accepted reason.
- No open blocker remains.

Mark `Ready for Code Review: no` when:

- Any blocking condition exists.
- Implementation deviates from approved scope.
- Required verification failed.
- Specification Missing or Requirement Change requires Re-Gate.

## Step 6: Recommend Next Step

Use one of:

- `Run sdlc-code-review-normalizer`
- `Fix implementation bug`
- `Return to sdlc-specification-writer`
- `Run sdlc-solution-reviewer`
- `Apply change-control and re-Gate`
- `Run missing verification`

Do not recommend testing or release before Code Review Gate unless the user explicitly chooses a lighter workflow and accepts the risk.
