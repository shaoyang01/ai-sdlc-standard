# Output And Manifest

## Artifact Versioning Requirements

When this reference produces or updates a DocFlow requirement artifact under
`library/{requirement_id}/`, it must use a stable path and update the same file.
Do not create `_vN.md` or other filename-versioned artifacts.

The artifact must include:

```markdown
## Metadata

- Requirement ID:
- Artifact Type:
- Version: 1.0.0
- Status: draft / active / passed / failed / stale / replaced
- Author / Skill:
- Created At:
- Updated At:
- Reviewed Artifact:
- Reviewed Artifact Version:
- Gate Artifact Version:

## 修订记录

| Version | Date | Author / Skill | Change Type | Summary | Re-Gate |
| --- | --- | --- | --- | --- | --- |
| 1.0.0 |  |  | initial | Initial current artifact. | no |
```

For non-Gate artifacts, `Reviewed Artifact`, `Reviewed Artifact Version`, and
`Gate Artifact Version` may be omitted when there is no reviewed upstream
artifact. For Gate, review, sync, and reconcile artifacts, they are required.

The body must contain only the current effective content. Historical changes
belong in `## 修订记录`, manifest `Change History`, and Git history.

## Analysis Output

Default output:

```text
analysis result in response or requested DocFlow/Gate report
```

Do not write production code.

Do not update `specs/{feature}/spec.md`, `plan.md`, or `tasks.md` in this skill.

## Result Template

```markdown
# Speckit Analyze Result: <Requirement ID>

## Source Artifacts

- Technical Specification:
- Solution Review:
- Domain Route:
- SpecKit Spec:
- SpecKit Plan:
- SpecKit Tasks:
- Entry Coverage Profile:
- Entry Coverage Report:
- Manifest:

## Project Type Profile Checks

| Project Type Profile | Check | Status | Evidence | Blocking Item | Earliest Affected Node |
| --- | --- | --- | --- | --- | --- |

## Entry Coverage Gate

| Check | Status | Evidence | Action |
| --- | --- | --- | --- |

## Parsed Entry Inventory Summary

| Classification | Entry Type | Count | Blocking Count | Notes |
| --- | --- | ---: | ---: | --- |

## Parsed Service Inventory Summary

| Classification | Reverse Coverage Status | Count | Blocking Count | Notes |
| --- | --- | ---: | ---: | --- |

## Shared-Domain Duplication Decision

| Domain / L2 | Status | Decision Source | Owner | Action |
| --- | --- | --- | --- | --- |

## Consistency Matrix

| Category | Status | Evidence | Earliest Affected Node | Action |
| --- | --- | --- | --- | --- |

## Analyze Gate Result

## Blocking Items

## Deferred Non-Blocking Items

## Earliest Affected Node

## Re-Gate Recommendation

## Manifest Update Recommendation

## Next Step
```

## Result Values

Use:

- `PASS`: no Blocking items; implementation can proceed.
- `FAIL`: Blocking item exists; return to upstream Re-Gate.
- `PASS_WITH_RISK`: only when all remaining risk is explicitly accepted and does not require undefined implementation behavior.

Do not use `PASS_WITH_RISK` for missing core behavior, missing verification, or unresolved artifact conflict.

## Manifest Recommendation

Recommend updates for:

- Activity Log: `sdlc-speckit-analyze`
- Related Specs Directory
- Artifact Index notes for spec, plan, and tasks
- Re-Gate Records, if blocked
- Blocking Issues, if any
- Project Type Profile Checks
- Entry Coverage Gate
- Parsed Entry Inventory Summary
- Parsed Service Inventory Summary
- Shared-Domain Duplication Decision
- Next Step: `sdlc-speckit-implement` or upstream Re-Gate

Do not silently edit manifest unless explicitly requested.
