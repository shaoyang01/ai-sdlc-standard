# Test Feedback Output Artifact

## Default Path

When writing a local artifact, use:

```text
library/{requirement_id}/00-需求资料/反馈/{requirement_id}_测试反馈分类.md
```

原始测试/线上反馈由 requirement-intake 归一化并分类为
`FEEDDBACK_DRIVEN_CHANGE` 等变更记录后由相应节点消费；intake 不设
"测试验收"节点，不做发布判定（manual-runtime-semantic-contract §6.1/§6.2）。

Update the stable artifact file and increment its internal Metadata Version instead of creating a versioned filename.

## Markdown Template

```markdown
# Test Feedback Report: <Requirement ID>

## Metadata

- Requirement ID:
- Requirement Name:
- Artifact Type: 测试反馈分类
- Version: 1.0.0
- Status: current / stale / actionable（manifest 冻结映射词表；`draft`/`active`/`replaced` 已废止——loop-artifact-revision.md）
- Reporter / Tester:
- Classifier / Skill:
- Created At:
- Updated At:
- Reviewed Artifact:
- Reviewed Artifact Version:
- Repository:
- Environment:
- Feedback Source:

## Conclusion

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

- Manifest Stable Path:
- Manifest Version:
- Manifest Status:

## Next Step

## 修订记录

| Version | Date | Reporter / Skill | Change Type | Summary | Re-Gate |
| --- | --- | --- | --- | --- | --- |
| 1.0.0 |  |  | initial | Initial test feedback report. | no |
```

## Manifest Update Recommendation

Recommend updates for:

- 分类结论由相应节点消费；requirement manifest 的 Artifact Index 由 publisher 维护（intake 经 init/entry-update 提交），不新增"测试验收"节点。
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
