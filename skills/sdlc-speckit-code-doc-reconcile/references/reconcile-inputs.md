# Reconcile Inputs

## Required Inputs

Collect these inputs before starting reconciliation:

- Requirement ID and feature identifier.
- Current repository status, relevant diff, commit range, or implementation scope.
- `specs/{feature}/spec.md`.
- `specs/{feature}/plan.md`.
- `specs/{feature}/tasks.md`.
- `specs/{feature}/implementation.md`, when implementation details were produced.
- `specs/{feature}/workflow-status.md`, when a pipeline status snapshot was produced.
- `specs/{feature}/debug-guide.md`, when debug or reproduction guidance was produced.
- `specs/{feature}/observability.md`, when logging, metrics, analytics, error-state, or debug-log guidance was produced.
- Implementation result from `sdlc-speckit-implement`.
- Approved DocFlow artifacts from `library/{requirement_id}/01-技术方案` and `library/{requirement_id}/02-方案审核`.
- `manifest.md`, when available.

## Recommended Inputs

Use these when present:

- `library/{requirement_id}/03-实现记录/*`.
- `library/{requirement_id}/04-交付总结/*`.
- `library/{requirement_id}/04-代码审核/*`.
- `library/{requirement_id}/05-测试验收/*`.
- Sync result from `sdlc-speckit-sync`.
- Current `.specify/business_domain/**` or other declared knowledge target.
- Re-Gate Records and Replaced Artifact Paths.
- Accepted risk records.

## Source Priority

Use source priority only to identify the current approved basis; do not use it to overwrite evidence:

1. Active Re-Gate decision or accepted change-control record.
2. Current approved DocFlow Gate result.
3. Current `specs/**` artifacts generated from approved DocFlow input.
4. Verified implementation result and new-rail process products.
5. Implementation record and delivery summary.
6. Authorized sync result and target knowledge document.

manifest.md is the status authority. Use `workflow-status.md` only as a
machine-side snapshot. If the snapshot disagrees with manifest Current Stage,
Current Status, Activity Log, Gate Records, Re-Gate Records, or Blocking Issues,
classify the mismatch instead of overriding manifest.

When these sources conflict, classify the conflict and route to the earliest affected Gate.

## Readiness Checks

Continue only when:

- The feature and requirement can be matched.
- Current artifacts can be distinguished from stale or replaced artifacts.
- The implementation scope can be inspected.
- The audit target is explicit: code, specs, DocFlow, knowledge, manifest, or all.

Stop when the audit would require guessing which artifact is current.
