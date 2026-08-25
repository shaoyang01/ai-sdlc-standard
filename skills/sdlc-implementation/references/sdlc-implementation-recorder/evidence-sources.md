# Implementation Evidence Sources

## Acceptable Evidence

| Evidence Type | Examples | Confidence |
| --- | --- | --- |
| Git diff | `git diff`, patch file, staged diff | high |
| Commit range | `main..HEAD`, commit hash range | high |
| Changed file list | `git status`, PR file list | medium |
| Task status | Speckit `tasks.md`, checked task list | medium |
| Verification output | compile, tests, lint, manual validation logs | high |
| User-confirmed summary | explicit file/symbol-level implementation summary | medium |
| Chat memory | vague description without file evidence | low |

Use low-confidence sources only as context. Do not use them as the sole basis for a ready-for-review implementation record.

## Source Priority

Default priority:

1. Current code diff or commit range.
2. Test and verification output.
3. Current tasks or implementation plan.
4. Approved specification and solution review.
5. User-confirmed file-level summary.
6. Historical chat or delegated context.

When evidence conflicts, prefer current code facts over older summaries, but treat a code/spec mismatch as a deviation that must be classified.

## Required Implementation Facts

Record:

- Changed file path
- Changed symbol, method, endpoint, SQL, config, or job where available
- Purpose of the change
- Specification basis
- Behavior impact
- Verification evidence
- Risk or unknowns

## Verification Evidence

Acceptable verification evidence includes:

- Command and success output.
- Command and failure output.
- Manual validation steps and observed result.
- Explicit reason why a check was skipped.
- Environment or data blocker preventing execution.

Unacceptable verification evidence:

- "Should work"
- "Looks fine"
- "No need to test" without risk acceptance
- Old test output from before the implementation
- A test name without result

## Missing Evidence

If evidence is missing, record it as:

- Missing changed file list
- Missing specification basis
- Missing verification output
- Missing task traceability
- Missing rollback or compatibility evidence

Missing evidence that affects behavior correctness is blocking.
