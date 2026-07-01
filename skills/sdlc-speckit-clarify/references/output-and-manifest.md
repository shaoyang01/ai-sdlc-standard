# Output And Manifest

## Artifact Versioning Requirements

When this reference produces or updates a DocFlow requirement artifact under
`library/{requirement_id}/`, it must use a stable path and update the same file.
Do not create `__vN.md` or other filename-versioned artifacts.

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

## Spec Update

If safe clarifications exist, update:

```text
specs/{feature}/spec.md
```

Use:

```markdown
## Clarifications

### Session YYYY-MM-DD

- Q: <question> -> A: <answer>
```

Only add answers traceable to approved artifacts or explicit user confirmation.

## Result Template

```markdown
# Speckit Clarify Result: <Requirement ID>

## Source Artifacts

- SpecKit Spec:
- Technical Specification:
- Solution Review:
- Manifest:

## Questions Asked

## Sections Touched

## Coverage Summary

| Category | Status | Evidence | Action |
| --- | --- | --- | --- |

## Clarifications Added

## Deferred Items

## Blocking Items

## Re-Gate Recommendation

## Manifest Update Recommendation

## Next Step
```

## Manifest Recommendation

Recommend updates for:

- Activity Log: `sdlc-speckit-clarify`
- Re-Gate Records, if blocked
- Blocking Issues, if any
- Related Specs Directory
- Next Step: `sdlc-speckit-plan` or DocFlow Re-Gate

Do not silently edit manifest unless explicitly requested.
