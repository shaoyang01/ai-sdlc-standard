# Output And Manifest

## Tasks Output

Default target:

```text
specs/{feature}/tasks.md
```

Do not write production code.

Do not update `specs/{feature}/plan.md` in this skill.

## Tasks Template

```markdown
# Tasks: <Feature>

## Source Artifacts

- SpecKit Spec:
- SpecKit Plan:
- Technical Specification:
- Solution Review:
- Plan Gate:
- Manifest:

## Task List

- [ ] T001 <imperative action> | Scope: <file/module/artifact> | Source: <spec/plan/docflow section> | Depends on: <task id or none> | Verify: <check>

## Implementation Coverage

## Verification Coverage

## Dependency Order

## Task Gate
```

## Result Template

```markdown
# Speckit Tasks Result: <Requirement ID>

## Source Artifacts

- SpecKit Spec:
- SpecKit Plan:
- Technical Specification:
- Solution Review:
- Plan Gate:
- Manifest:

## Target

- Tasks:

## Task Coverage Summary

| Category | Status | Evidence | Action |
| --- | --- | --- | --- |

## Task Gate Result

## Blocking Items

## Re-Gate Recommendation

## Manifest Update Recommendation

## Next Step
```

## Manifest Recommendation

Recommend updates for:

- Activity Log: `sdlc-speckit-tasks`
- Related Specs Directory
- Artifact Index note linking `specs/{feature}/tasks.md`
- Re-Gate Records, if blocked
- Blocking Issues, if any
- Next Step: `sdlc-speckit-analyze` or upstream Re-Gate

Do not silently edit manifest unless explicitly requested.
