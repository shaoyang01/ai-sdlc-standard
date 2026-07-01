# Gate Runner Output Report

## Default Output

By default, return the Gate report in the response.

When writing a local artifact, use the Gate-related node directory:

```text
library/{requirement_id}/{node_directory}/{requirement_id}__门禁检查__vN.md
```

Do not overwrite an existing report.

## Markdown Template

```markdown
# Gate Result: <Gate Name>

## Conclusion

- Result: PASS / FAIL / PASS_WITH_RISK
- Can Continue: yes/no
- Requirement ID:
- Manifest Path:
- Reviewed Artifact:
- Gate Basis:
- Reviewer:
- Date:

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

## Missing Information

## Risk Acceptance

- Accepted Risk:
- Accepted By:
- Accepted At:
- Accepted Reason:
- Accepted Scope:
- Follow-up Required: yes/no
- Follow-up Owner:

## Re-Gate Check

- Required:
- From Node:
- Gate Artifact:
- Result:
- Status:

## Superseded Artifact Check

- Current Artifact Superseded: yes/no
- Evidence:
- Required Action:

## Required Actions

## Manifest Update Recommendation

## Next Step
```

## Result Rules

Use `PASS` when:

- Required evidence exists.
- No Critical issue exists.
- No unaccepted High issue exists.
- No required Re-Gate is missing.
- No current evidence is superseded.

Use `PASS_WITH_RISK` when:

- No Critical issue exists.
- High issues exist.
- Complete risk acceptance exists.
- Re-Gate and superseded checks are valid.

Use `FAIL` when:

- Any Critical issue exists.
- Any unaccepted High issue exists.
- Required input is missing.
- Current evidence is superseded.
- Required Re-Gate is missing.
- Existing required Gate result is `FAIL`.

## Manifest Update Recommendation

Recommend updates for:

- Artifact Index: current Gate report path and result.
- Gate Decisions: current Gate result and continuation decision.
- Activity Log: `sdlc-gate-runner` action.
- Blocking Issues: unresolved Critical and High issues.
- Missing Artifacts: missing manifest or node artifacts.
- Re-Gate Records: required or completed Re-Gate.
- Next Step: exact next action.

Do not silently edit `manifest.md` unless the user explicitly requests it.
