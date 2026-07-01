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

## Default Output

Target:

```text
specs/{feature}/spec.md
```

If the target file already exists, update it only when it is traceable to the same requirement and current DocFlow source artifacts. Otherwise stop and request a new feature id, Re-Gate, or explicit user decision.

Optional:

```text
specs/{feature}/checklists/requirements.md
```

Do not use the optional checklist as a replacement for `02-方案审核`.

## Spec Product Shape Checklist

Before reporting success, verify `specs/{feature}/spec.md` contains:

```text
## Domain Route / Scope Baseline
## Requirement Type
## Business Domain Targets
## Entry Coverage Target
## Sync Targets
## Representative Data Simulation
## Edge Cases
## Functional Requirements
## Key Entities / Data Contracts
## Success Criteria
## Source Artifact Traceability
## Branch / Repository Boundary
```

The sync result must classify each section as:

- `synced`: source artifact supplied sufficient evidence;
- `pending`: source artifact names the topic but needs owner confirmation;
- `not applicable`: project type makes the section irrelevant, with reason;
- `blocked`: source artifact lacks mandatory evidence or conflicts with review/manifest.

Do not mark the Skill complete when any required section is missing from the target file. Use `blocked` when filling the section would require inventing facts.

## Report Template

```markdown
# Speckit Specify Sync: <Requirement ID>

## Source Artifacts

- Technical Specification:
- Solution Review:
- Manifest:

## Target

- Feature:
- Spec Path:

## Sections Synced

| Required Section | Status | Source Evidence | Notes |
| --- | --- | --- | --- |
| Domain Route / Scope Baseline |  |  |  |
| Requirement Type |  |  |  |
| Business Domain Targets |  |  |  |
| Entry Coverage Target |  |  |  |
| Sync Targets |  |  |  |
| Representative Data Simulation |  |  |  |
| Edge Cases |  |  |  |
| Functional Requirements |  |  |  |
| Key Entities / Data Contracts |  |  |  |
| Success Criteria |  |  |  |
| Source Artifact Traceability |  |  |  |
| Branch / Repository Boundary |  |  |  |

## Sections Not Synced

## Assumptions

## Blocking Items

## Manifest Update Recommendation

## Next Step
```

## Manifest Recommendation

Recommend updates for:

- Activity Log: `sdlc-speckit-specify`
- Related Specs Directory
- Artifact Index note linking `specs/{feature}/spec.md`
- Re-Gate Records, if blocked
- Next Step: `sdlc-speckit-clarify`

Do not silently edit manifest unless explicitly requested.
