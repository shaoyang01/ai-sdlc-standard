# Output And Manifest

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

- Activity Log: `sdlc-speckit-specify`
- Related Specs Directory
- Artifact Index note linking `specs/{feature}/spec.md`
- Re-Gate Records, if blocked
- Next Step: `sdlc-speckit-clarify`

Do not silently edit manifest unless explicitly requested.
