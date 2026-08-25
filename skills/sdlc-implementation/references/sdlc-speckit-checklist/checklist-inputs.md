# Checklist Inputs

## Required Inputs By Stage

| Stage | Required Inputs |
| --- | --- |
| Specification | `library/{requirement_id}/01-技术方案/*`, `library/{requirement_id}/02-方案审核/*`, optional `specs/{feature}/spec.md` |
| Plan | `specs/{feature}/spec.md`, `specs/{feature}/plan.md`, Plan Gate result |
| Tasks | `specs/{feature}/spec.md`, `specs/{feature}/plan.md`, `specs/{feature}/tasks.md`, Task Gate result |
| Analyze readiness | `spec.md`, `plan.md`, `tasks.md`, DocFlow artifacts, accepted risks |
| Implementation readiness | Analyze Gate result, `tasks.md`, implementation checklist baseline |
| Sync readiness | implementation result, verification evidence, target knowledge path |
| Reconcile readiness | code scope, specs, DocFlow, sync result or sync status |

## Recommended Inputs

Use when present:

- `library/{requirement_id}/manifest.md`.
- Re-Gate Records.
- Replaced Artifact Paths.
- Code review findings.
- Test feedback classifications.
- Existing checklist under `specs/{feature}/checklists/`.

## Readiness Checks

Continue only when:

- Requirement ID and feature are clear.
- The checklist stage is explicit or safely inferred.
- Source artifacts are current.
- Gate status for the prior stage is passable.

Stop when checklist generation would require selecting between conflicting current artifacts.
