# Code Review Output Artifact

## Default Path

When writing a local artifact, use:

```text
library/{requirement_id}/04-代码审核/{requirement_id}__代码审核.md
```

Update the stable artifact file and increment its internal Metadata Version instead of creating a versioned filename.

## Markdown Template

```markdown
# Code Review Report: <Requirement ID>

## Metadata

- Requirement ID:
- Artifact Type: 代码审核
- Version: 1.0.0
- Status: draft / active / passed / failed / stale / replaced
- Reviewer / Skill:
- Normalized By:
- Created At:
- Updated At:
- Reviewed Artifact:
- Reviewed Artifact Version:
- Gate Artifact Version:
- Result: PASS / FAIL / PASS_WITH_RISK
- Can Continue: yes/no
- Reviewed Diff:
- Specification:
- Specification Artifact Version:
- Implementation Record:
- Implementation Record Version:

## Conclusion

## Critical

| ID | File | Line or Symbol | Specification Basis | Problem | Impact | Suggested Fix | Blocking |
| --- | --- | --- | --- | --- | --- | --- | --- |

## High

| ID | File | Line or Symbol | Specification Basis | Problem | Impact | Suggested Fix | Blocking |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Medium

| ID | File | Line or Symbol | Specification Basis | Problem | Impact | Suggested Fix | Blocking |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Low

| ID | File | Line or Symbol | Problem | Suggestion |
| --- | --- | --- | --- | --- |

## Architecture

## Behavior Compatibility

## Data Consistency

## Transaction and Idempotency

## Exception Handling

## Performance

## Security

## Maintainability

## Test Gap

## Suggested Fixes

## Missing Information

## Risk Acceptance

- Accepted Risk:
- Accepted By:
- Accepted At:
- Accepted Reason:
- Accepted Scope:
- Follow-up Required: yes/no
- Follow-up Owner:

## Manifest Update Recommendation

- Manifest Stable Path:
- Manifest Version:
- Manifest Status:

## Next Step

## 修订记录

| Version | Date | Reviewer / Skill | Change Type | Summary | Re-Gate |
| --- | --- | --- | --- | --- | --- |
| 1.0.0 |  |  | initial | Initial code review report. | no |
```

## Manifest Update Recommendation

Recommend updates for:

- Artifact Index: add or update `04 代码审核`.
- Gate Decisions: update `代码审核`.
- Activity Log: record code review normalization.
- Blocking Issues: record unresolved Critical and High findings.
- Change History: record Review Missing, Implementation Bug, Specification Missing, or Requirement Change when discovered.
- Re-Gate Records: record required Re-Gate path when applicable.
- Next Step: exact next action.

Do not silently edit `manifest.md` unless the user explicitly asks for file updates or output routing through `sdlc-docflow-writer`.

## Response Summary

When returning the result to the user, include:

- Requirement ID
- Whether a file was written
- Result and Can Continue
- Critical / High count
- Missing information
- Required fixes or Re-Gate
- Recommended next step
