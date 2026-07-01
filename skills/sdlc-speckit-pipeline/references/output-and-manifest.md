# Output And Manifest

## Pipeline Report Shape

Use this structure:

```md
# Speckit Pipeline Result

## Activation Basis

- Requirement ID:
- Development Path Decision:
- User confirmation:

## Source Artifacts

- Requirement:
- Technical specification:
- Solution review:
- Manifest:
- Existing specs:

## Stage Timeline

| Stage | Skill | Result | Artifact | Blocking Item | Next |
| --- | --- | --- | --- | --- | --- |

## Gate Results

- Preflight:
- Specify:
- Clarify:
- Plan:
- Tasks:
- Analyze:
- Implement:
- Sync:
- Reconcile:

## Produced Or Reused Artifacts

- Specs:
- DocFlow:
- Code:
- Knowledge:

## Side Effects

- Code:
- Docs:
- Knowledge:
- Commands:

## Blocking Or Deferred Items

- None, or list each item with owner and route.

## Re-Gate Recommendation

- Required:
- Earliest affected node:
- Stale or replaced artifacts:

## Manifest Update Recommendation

- Activity Log:
- Gate Records:
- Change History:
- Speckit Sync:
- Reconcile:

## Next Step

- Recommended action:
```

## Pipeline Result Labels

Use one primary result:

- `COMPLETED`: implementation, required sync, and reconcile completed without blocking items.
- `PARTIAL`: some stages completed, remaining work is explicit and non-blocking.
- `BLOCKED`: a required stage cannot proceed.
- `REGATE_REQUIRED`: approved upstream artifacts must be revised before continuing.
- `DIRECT_IMPLEMENTATION_RECOMMENDED`: Pipeline was not activated because the reviewed solution supports direct implementation.

## Manifest Recommendations

For each stage, recommend manifest updates with:

- Timestamp.
- Stage.
- Skill.
- Input artifacts.
- Output artifacts.
- Gate result.
- Blocking items.
- Next action.

When the pipeline stops, record:

- Stop reason.
- Earliest affected node.
- Whether implementation is blocked.
- Whether the online admission summary needs a risk note.
