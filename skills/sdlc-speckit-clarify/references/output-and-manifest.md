# Output And Manifest

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
