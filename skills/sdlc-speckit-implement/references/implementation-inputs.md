# Implementation Inputs

## Required Inputs

`sdlc-speckit-implement` requires:

- `specs/{feature}/spec.md`
- `specs/{feature}/plan.md`
- `specs/{feature}/tasks.md`
- Analyze Gate result from `sdlc-speckit-analyze`
- `library/{requirement_id}/01-技术方案/*`
- `library/{requirement_id}/02-方案审核/*`

Recommended:

- `specs/{feature}/route.md` or the Pipeline Domain Route Summary carried by Analyze Gate
- `library/{requirement_id}/manifest.md`
- Accepted risk records
- Re-Gate Records
- Replaced Artifact Paths
- Current repository status
- Relevant existing tests and build commands
- Prior implementation record, if continuing work

## Readiness Checks

Continue only when:

- `sdlc-speckit-analyze` has no Blocking Items.
- `specs/{feature}/spec.md`, `specs/{feature}/plan.md`, and `specs/{feature}/tasks.md` are current and not stale.
- Route source is known from `specs/{feature}/route.md`, Pipeline Domain Route Summary, or Analyze Gate evidence.
- `02-方案审核` result is `PASS` or valid `PASS_WITH_RISK`.
- Task Gate and Analyze Gate are passable.
- Development Path Decision is `SPECKIT_PIPELINE_REQUIRED`, unless the user explicitly requested full SDD.
- Tasks identify implementation targets and verification expectations.

## Repository State Checks

Before editing:

- Inspect current branch and changed files.
- Identify unrelated local changes.
- Avoid reverting, overwriting, or reformatting unrelated files.
- If a target file already has unrelated local changes, understand them and work with them.
- Stop when unrelated changes make the approved task unsafe to implement.

## Missing Analyze Gate

If no Analyze Gate result exists:

- Continue only when the user explicitly confirms all artifacts are current and implementation readiness has no open blocker.
- Recommend running `sdlc-speckit-analyze`.
- Do not implement from raw tasks when artifact consistency is unresolved.

## Source Priority

Priority order:

1. Current `specs/{feature}/tasks.md`.
2. Current Analyze Gate result.
3. Current `specs/{feature}/route.md` or Analyze Gate route source.
4. Current `specs/{feature}/plan.md`.
5. Current `specs/{feature}/spec.md`.
6. Current effective `02-方案审核`.
7. Current effective `01-技术方案`.
8. Current manifest Development Path Decision and Re-Gate Records.

Implement does not reinterpret Route Type or Business Domain Targets. If the
route source conflicts with actual code boundaries, stop and route to Analyze /
Domain Route / Re-Gate instead of editing route in Implement.

If user input changes approved behavior, plan, or task scope, stop and apply change-control.
