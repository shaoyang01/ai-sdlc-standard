# Test Feedback Sync Output Report

## Default Output

By default, return the sync recommendation report in the response.

When writing a local artifact, use:

```text
library/{requirement_id}/05-测试验收/{requirement_id}__测试反馈同步建议.md
```

Update the stable artifact file and increment its internal Metadata Version
instead of creating a versioned filename.

## Markdown Template

```markdown
# Test Feedback Sync Recommendation: <Requirement ID>

## Metadata

- Requirement ID:
- Artifact Type: 测试反馈同步建议
- Version: 1.0.0
- Status: draft / active / stale / replaced
- Author / Skill:
- Created At:
- Updated At:
- Feedback Artifact:
- Feedback Artifact Version:
- Reviewed Artifact:
- Reviewed Artifact Version:
- Gate Artifact Version:
- Feedback Result:
- Can Release:
- Current Effective Version:

## Source Feedback Artifact

## Classification Summary

| Classification | Count | Blocking | Notes |
| --- | --- | --- | --- |

## Re-Gate Recommendation

| Item | Required | From Node | Required Gate | Reason | Status |
| --- | --- | --- | --- | --- | --- |

## Checklist Update Recommendation

| Target Checklist | Recommendation | Source Evidence | Requires Confirmation |
| --- | --- | --- | --- |

## Schema Update Recommendation

| Target Schema | Recommendation | Source Evidence | Requires Confirmation |
| --- | --- | --- | --- |

## Manifest Update Recommendation

- Manifest Stable Path:
- Manifest Version:
- Manifest Status:

## Knowledge Sync Recommendation

| Target | Recommendation | Source Artifact | Gate Dependency | Residual Risk |
| --- | --- | --- | --- | --- |

## Do Not Sync Items

| Item | Reason |
| --- | --- |

## Blocking Issues

## Next Step

## 修订记录

| Version | Date | Author / Skill | Change Type | Summary | Re-Gate |
| --- | --- | --- | --- | --- | --- |
| 1.0.0 |  |  | initial | Initial test feedback sync recommendation. | no |
```

## Manifest Update Recommendation

Recommend updates for:

- Artifact Index: optional sync recommendation artifact under `05 测试验收`.
- Activity Log: record `sdlc-test-feedback-sync`.
- Change History: record reusable feedback classifications.
- Re-Gate Records: record required Re-Gate.
- Blocking Issues: record unresolved sync blockers.
- Speckit Sync: record whether later sync is required.
- Next Step: exact next action.

Do not silently edit `manifest.md` unless the user explicitly asks for file updates or output routing through `sdlc-docflow-writer`.

## Response Summary

When returning the result to the user, include:

- Requirement ID
- Whether a file was written
- Required Re-Gate
- Checklist / Schema recommendations
- Knowledge sync recommendation
- Blocking issues
- Recommended next step
