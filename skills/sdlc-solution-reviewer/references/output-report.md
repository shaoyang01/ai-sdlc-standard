# Solution Review Output Report

## Default Report Structure

Use this structure for response output and Markdown artifacts.

```markdown
# Solution Review Report: <Requirement Name>

## Conclusion

- Result: PASS / FAIL / PASS_WITH_RISK
- Can Continue: yes/no
- Reviewed Artifact:
- Reviewer:
- Date:
- Complexity: SIMPLE / MEDIUM / COMPLEX / BLOCKED_UNKNOWN
- Complexity Triggers:
- Full SDD Override: none / user_requested / later_gate_required
- Development Path Recommendation: DIRECT_IMPLEMENTATION / SPECKIT_PIPELINE_REQUIRED / BLOCKED_NEEDS_REVISION
- Recommendation Reason:

## Critical

| ID | Location | Summary | Required Action |
| --- | --- | --- | --- |

## High

| ID | Location | Summary | Required Action |
| --- | --- | --- | --- |

## Medium

| ID | Location | Summary | Required Action |
| --- | --- | --- | --- |

## Low

| ID | Location | Summary | Suggestion |
| --- | --- | --- | --- |

## Missing Constraint

## Missing Branch

## Behavior Risk

## Compatibility Risk

## Implementation Risk

## Test Gap

## Pending Confirmation

## Required Actions

## Risk Acceptance

- Accepted Risk:
- Accepted By:
- Accepted At:
- Accepted Reason:
- Accepted Scope:
- Follow-up Required: yes/no
- Follow-up Owner:

## Manifest Update Recommendation

- Artifact Index:
- Gate Decisions:
- Development Path Decision:
  - Complexity:
  - Complexity Triggers:
  - Full SDD Override:
- Activity Log:
- Blocking Issues:
- Next Step:

## Next Step
```

## Result Rules

| Result | Can Continue | Required Path |
| --- | --- | --- |
| PASS | yes | Follow Development Path Recommendation. |
| PASS_WITH_RISK | yes | Continue only if Risk Acceptance is complete. |
| FAIL | no | Return to `01-技术方案`. |

## Manifest Update Suggestions

For `DIRECT_IMPLEMENTATION`:

```text
Development Path Decision: DIRECT_IMPLEMENTATION
Complexity: SIMPLE or MEDIUM
Full SDD Override: none
Next Step: enter implementation and write 03-实现记录 after code changes
```

For `SPECKIT_PIPELINE_REQUIRED`:

```text
Development Path Decision: SPECKIT_PIPELINE_REQUIRED
Complexity: COMPLEX, or SIMPLE/MEDIUM with explicit full SDD override
Full SDD Override: none / user_requested / later_gate_required
Next Step: ask user to confirm entering sdlc-speckit-pipeline
```

For `BLOCKED_NEEDS_REVISION`:

```text
Current Status: blocked
Current Stage: 01-技术方案
Development Path Decision: BLOCKED_NEEDS_REVISION
Complexity: BLOCKED_UNKNOWN when complexity cannot be classified
Next Step: revise technical specification and re-run sdlc-solution-reviewer
```

## Artifact Naming

When writing a local artifact, use:

```text
library/{requirement_id}/02-方案审核/{requirement_id}__方案审核__vN.md
```

Use the next version number. Do not overwrite old versions.
