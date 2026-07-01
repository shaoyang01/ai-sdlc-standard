# Sync Inputs

## Required Inputs

`sdlc-speckit-sync` requires:

- `specs/{feature}/spec.md`
- `specs/{feature}/plan.md`
- `specs/{feature}/tasks.md`
- Implementation result from `sdlc-speckit-implement`
- Verification evidence for completed tasks
- `library/{requirement_id}/01-技术方案/*`
- `library/{requirement_id}/02-方案审核/*`

Recommended:

- `library/{requirement_id}/03-实现记录/*`
- `library/{requirement_id}/04-代码审核/*`
- `library/{requirement_id}/05-测试验收/*`
- `library/{requirement_id}/manifest.md`
- Accepted risk records
- Re-Gate Records
- Replaced Artifact Paths
- Existing target knowledge documents

## Readiness Checks

Continue only when:

- Implementation status is `COMPLETED`, or sync scope is explicitly limited to verified completed tasks.
- Verification results are present.
- No Blocking Items remain for the facts being synced.
- Current source artifacts are not stale.
- Target knowledge path is explicit.
- User authorized write access if applying changes.

## Missing Implementation Record

If `03-实现记录` is missing:

- Continue only when implementation result and verification evidence are sufficient.
- Recommend running `sdlc-implementation-recorder`.
- Do not sync facts that cannot be traced to code changes and verification.

## Source Priority

Priority order:

1. Verified implementation result and changed code facts.
2. `03-实现记录`, if available.
3. Current `specs/{feature}/spec.md`, `plan.md`, and `tasks.md`.
4. Code review or test feedback after implementation.
5. Current effective `01-技术方案` and `02-方案审核`.
6. Existing target knowledge documents.

Do not use raw chat as a source of long-term truth.
