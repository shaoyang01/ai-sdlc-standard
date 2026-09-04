# Reconcile Inputs

## Single-Rail Source Baseline

Reconcile has a single rail (Decision-044/088/089): the current requirement's
`library/{requirement_id}/` artifacts plus the target repository's code state
and verification evidence are the only inputs. There is no source mode, no mode
switch, and no run-level working-materials input; legacy specs paths are not
required and are not single-rail inputs.

## Required Inputs

- Requirement ID (and feature identifier when available).
- Current repository status, relevant diff, commit range, or implementation scope.
- Approved DocFlow artifacts from `library/{requirement_id}/01-技术方案` and `library/{requirement_id}/02-方案审核`.
- Implementation evidence when auditing implemented behavior (`library/{requirement_id}/03-实现记录/*`).
- Verification evidence when auditing sync completeness (`library/{requirement_id}/05-测试验收/*`).
- `manifest.md` when available.
- `.sdlc/business_domain/**` or declared knowledge target when auditing knowledge sync.

Absence of legacy specs paths is never a blocker on the single rail.

## Recommended Inputs

Use these when present:

- `library/{requirement_id}/03-实现记录/*`.
- `library/{requirement_id}/04-交付总结/*`.
- `library/{requirement_id}/04-代码审核/*`.
- `library/{requirement_id}/05-测试验收/*`.
- Current `.sdlc/business_domain/**` or other declared knowledge target.
- Re-Gate Records and Replaced Artifact Paths.
- Accepted risk records.

## Source Priority

Use source priority only to identify the current approved basis; do not use it to overwrite evidence:

1. Active Re-Gate decision or accepted change-control record.
2. Current approved DocFlow Gate result.
3. Verified implementation result and single-rail process products.
4. Implementation record and delivery summary.
5. Authorized sync result and target knowledge document.

manifest.md is the status authority. Machine-side status snapshots are not
authorities. If a snapshot disagrees with manifest Current Stage, Current
Status, Activity Log, Gate Records, Re-Gate Records, or Blocking Issues,
classify the mismatch instead of overriding manifest.

When these sources conflict, classify the conflict and route to the earliest affected Gate.

## Readiness Checks

Continue only when:

- Sync provenance is traceable to `library/{requirement_id}/` artifacts, code state, or verification evidence.
- The feature and requirement can be matched.
- Current artifacts can be distinguished from stale or replaced artifacts.
- The implementation scope can be inspected.
- The audit target is explicit: code, specs, DocFlow, knowledge, manifest, or all.

Stop when the audit would require guessing which artifact is current.
