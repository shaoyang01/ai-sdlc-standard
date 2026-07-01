# Test Feedback Output Artifact

## Default Path

When writing a local artifact, use:

```text
library/{requirement_id}/05-测试验收/{requirement_id}__测试验收.md
```

Update the stable artifact file and increment its internal Metadata Version instead of creating a versioned filename.

## Markdown Template

```markdown
# Test Feedback Report: <Requirement ID>

## Conclusion

- Result: PASS / FAIL / PASS_WITH_RISK
- Can Release: yes/no
- Requirement ID:
- Requirement Name:
- Repository:
- Environment:
- Feedback Source:
- Reporter / Tester:
- Date:

## Test Scope

## Passed Cases

| Case | Evidence | Notes |
| --- | --- | --- |

## Failed Cases

| Case | Observed Behavior | Expected Behavior | Evidence | Impact |
| --- | --- | --- | --- | --- |

## Failure Classification

| Case | Primary Classification | Basis | Required Action | Affected Node |
| --- | --- | --- | --- | --- |

## Specification Updates Required

## Checklist Updates Required

## Code Fixes Required

## Review Gaps

## Environment / Data Issues

## Change-Control Decision

- Same Requirement / New Requirement / Undecided:
- Earliest Affected Node:
- Re-Gate Required:
- Reason:

## Risk Acceptance

- Accepted Risk:
- Accepted By:
- Accepted At:
- Accepted Reason:
- Accepted Scope:
- Follow-up Required: yes/no
- Follow-up Owner:

## Missing Information

## Manifest Update Recommendation

## Next Step
```

## Manifest Update Recommendation

Recommend updates for:

- Artifact Index: add or update `05 测试验收`.
- Activity Log: record test feedback classification.
- Change History: record Requirement Change, Specification Missing, Review Missing, Implementation Bug, Test Case Issue, or Environment / Data Issue.
- Re-Gate Records: record required Re-Gate path when applicable.
- Blocking Issues: record unresolved failed cases.
- Missing Artifacts: record missing specification, implementation record, code review, or evidence.
- Next Step: exact next action.

Do not silently edit `manifest.md` unless the user explicitly asks for file updates or output routing through `sdlc-docflow-writer`.

## Response Summary

When returning the result to the user, include:

- Requirement ID
- Whether a file was written
- Result and Can Release
- Classification summary
- Required Re-Gate
- Blocking evidence gaps
- Recommended next step
