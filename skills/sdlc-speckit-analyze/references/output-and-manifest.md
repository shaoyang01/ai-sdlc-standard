# Output And Manifest

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
- SpecKit Spec:
- SpecKit Plan:
- SpecKit Tasks:
- Manifest:

## Consistency Matrix

| Category | Status | Evidence | Earliest Affected Node | Action |
| --- | --- | --- | --- | --- |

## Analyze Gate Result

## Blocking Items

## Deferred Non-Blocking Items

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
- Next Step: `sdlc-speckit-implement` or upstream Re-Gate

Do not silently edit manifest unless explicitly requested.
