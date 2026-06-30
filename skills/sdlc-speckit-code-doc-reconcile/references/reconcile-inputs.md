# Reconcile Inputs

## Required Inputs

Collect these inputs before starting reconciliation:

- Requirement ID and feature identifier.
- Current repository status, relevant diff, commit range, or implementation scope.
- `specs/{feature}/spec.md`.
- `specs/{feature}/plan.md`.
- `specs/{feature}/tasks.md`.
- Implementation result from `sdlc-speckit-implement`.
- Approved DocFlow artifacts from `library/{requirement_id}/01-技术方案` and `library/{requirement_id}/02-方案审核`.
- `manifest.md`, when available.

## Recommended Inputs

Use these when present:

- `library/{requirement_id}/03-实现记录/*`.
- `library/{requirement_id}/04-代码审核/*`.
- `library/{requirement_id}/05-测试验收/*`.
- Sync result from `sdlc-speckit-sync`.
- Current `.specify/business_domain/**` or other declared knowledge target.
- Re-Gate Records and Superseded Artifacts.
- Accepted risk records.

## Source Priority

Use source priority only to identify the current approved basis; do not use it to overwrite evidence:

1. Active Re-Gate decision or accepted change-control record.
2. Current approved DocFlow Gate result.
3. Current `specs/**` artifacts generated from approved DocFlow input.
4. Verified implementation result and implementation record.
5. Authorized sync result and target knowledge document.

When these sources conflict, classify the conflict and route to the earliest affected Gate.

## Readiness Checks

Continue only when:

- The feature and requirement can be matched.
- Current artifacts can be distinguished from superseded artifacts.
- The implementation scope can be inspected.
- The audit target is explicit: code, specs, DocFlow, knowledge, manifest, or all.

Stop when the audit would require guessing which artifact is current.
