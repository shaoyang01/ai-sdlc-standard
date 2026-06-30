# Output And Manifest

## Default Output

Target:

```text
specs/{feature}/spec.md
```

Optional:

```text
specs/{feature}/checklists/requirements.md
```

Do not use the optional checklist as a replacement for `02-方案审核`.

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

## Sections Not Synced

## Assumptions

## Blocking Items

## Manifest Update Recommendation

## Next Step
```

## Manifest Recommendation

Recommend updates for:

- Activity Log: `speckit-specify`
- Related Specs Directory
- Artifact Index note linking `specs/{feature}/spec.md`
- Re-Gate Records, if blocked
- Next Step: `speckit-clarify`

Do not silently edit manifest unless explicitly requested.
