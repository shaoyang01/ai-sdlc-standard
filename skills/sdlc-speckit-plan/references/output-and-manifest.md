# Output And Manifest

## Plan Output

Default target:

```text
specs/{feature}/plan.md
```

Do not write:

```text
specs/{feature}/tasks.md
```

Task generation belongs to `sdlc-speckit-tasks`.

## Plan Template

```markdown
# Implementation Plan: <Feature>

## Source Artifacts

- SpecKit Spec:
- Technical Specification:
- Solution Review:
- Clarification Result:
- Manifest:

## Technical Approach

## Affected Modules And Files

## Data, State, And Integration Impact

## Failure, Retry, Idempotency, Transaction, And Rollback

## Observability And Rollout

## Verification Strategy

## Risks And Mitigations

## Traceability

## Plan Gate
```

## Result Template

```markdown
# Speckit Plan Result: <Requirement ID>

## Source Artifacts

- SpecKit Spec:
- Technical Specification:
- Solution Review:
- Clarification Result:
- Manifest:

## Target

- Plan:

## Plan Coverage Summary

| Category | Status | Evidence | Action |
| --- | --- | --- | --- |

## Plan Gate Result

## Risks And Mitigations

## Blocking Items

## Re-Gate Recommendation

## Manifest Update Recommendation

## Next Step
```

## Manifest Recommendation

Recommend updates for:

- Activity Log: `sdlc-speckit-plan`
- Related Specs Directory
- Artifact Index note linking `specs/{feature}/plan.md`
- Re-Gate Records, if blocked
- Blocking Issues, if any
- Next Step: `sdlc-speckit-tasks` or DocFlow Re-Gate

Do not silently edit manifest unless explicitly requested.
