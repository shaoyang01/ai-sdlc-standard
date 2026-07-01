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

## Sync Output

Default output:

```text
sync report in response or requested DocFlow/Gate report
```

When authorized, apply changes to the selected target documents and report exact paths.

Do not modify production code.

## Result Template

```markdown
# Speckit Sync Result: <Requirement ID>

## Source Artifacts

- Technical Specification:
- Solution Review:
- SpecKit Spec:
- SpecKit Plan:
- SpecKit Tasks:
- Implementation Result:
- Implementation Record:
- Code Review:
- Test Feedback:
- Manifest:

## Sync Scope

## Target Documents

| Target | Mode | Authorized | Result |
| --- | --- | --- | --- |

## Synced Facts Or Proposed Updates

| Fact | Source Evidence | Target | Result |
| --- | --- | --- | --- |

## Skipped Items

| Item | Reason | Required Evidence Or Action |
| --- | --- | --- |

## Conflict And Blocking Items

## Verification Basis

## Manifest Speckit Sync Recommendation

## Next Step
```

## Result Values

Use:

- `SYNCED`: authorized updates were applied.
- `PROPOSED`: no-write proposal produced.
- `PARTIAL`: some verified facts synced or proposed; skipped items remain.
- `BLOCKED`: sync cannot proceed.

## Manifest Recommendation

Recommend updates for the `Speckit Sync` section:

- Sync Required: yes/no
- Sync Executed: yes/no
- Target Documents
- Executed At
- Sync Artifact
- Residual Risks

Also recommend Activity Log:

- Actor / Skill: `sdlc-speckit-sync`
- Action: knowledge sync or sync proposal
- Result: `SYNCED`, `PROPOSED`, `PARTIAL`, or `BLOCKED`

Do not silently edit manifest unless explicitly requested.
