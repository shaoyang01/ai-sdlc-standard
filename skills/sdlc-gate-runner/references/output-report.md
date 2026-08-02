# Gate Runner Output Report

## Canonical Output Structure

`templates/gate-result-template.md` 是唯一 canonical output structure。本文件不维护第二份完整 Gate Template，也不得在 output-report.md 中维护第二份 canonical template；本文件只说明输出如何使用、何时持久化、稳定路径和 Manifest recommendation。不得从 canonical template 删除字段。

## Artifact Versioning Requirements

When this reference produces or updates a DocFlow requirement artifact under
`library/{requirement_id}/`, it must use a stable path and update the same file.
Do not create `_vN.md` or other filename-versioned artifacts.

The artifact must include:

```markdown
## Metadata

- Requirement ID:
- Artifact Type:
- Version: 1.0.0
- Status: draft / active / passed / failed / stale / replaced
- Author / Skill:
- Created At:
- Updated At:
- Reviewed Artifact:
- Reviewed Artifact Version:
- Gate Artifact Version:

## 修订记录

| Version | Date | Author / Skill | Change Type | Summary | Re-Gate |
| --- | --- | --- | --- | --- | --- |
| 1.0.0 |  |  | initial | Initial current artifact. | no |
```

For non-Gate artifacts, `Reviewed Artifact`, `Reviewed Artifact Version`, and
`Gate Artifact Version` may be omitted when there is no reviewed upstream
artifact. For Gate, review, sync, and reconcile artifacts, they are required.

The body must contain only the current effective content. Historical changes
belong in `## 修订记录`, manifest `Change History`, and Git history.

## Gate Type Resolution

Resolve the Gate Type before producing the report:

- `generic`
- `development_path_entry`
- `documentation_governance_tail_completion`

- `development_path_entry` 必须填写 `## Development Path Check`。
- `documentation_governance_tail_completion` 必须填写 `## Documentation Governance Tail Evidence Check` 和 `## Tail Completion Decision`。
- 其他 Gate 可以将特殊区段整体标记 `not_applicable`，但不得从 canonical template 删除字段。

## Default Output

By default, return the Gate report in the response.

When writing a local artifact, use the Gate-related node directory:

```text
library/{requirement_id}/{node_directory}/{requirement_id}_门禁检查.md
```

Stable paths for the two special Gates (no filename-based versioning; the two Gates must not share the same stable file):

```text
library/{requirement_id}/02-方案审核/{requirement_id}_开发路径准入门禁.md
library/{requirement_id}/05-测试验收/{requirement_id}_治理尾段完成门禁.md
```

Update the stable Gate report file and increment its internal Metadata Version.

## Response-Only Preview Boundary

Response-only 输出只能是 preview：

- 不得声称已存在 current persisted Gate artifact。
- 不得虚构 artifact path。
- 不得虚构 Version。
- 不得将 Manifest Tail 标为 completed。
- 不得成为 completion_decision_source。
- 不得输出正式 Tail completion PASS claim。

当用户未授权持久化 Gate report：

- 将 persistence absence 记录为 blocking item。
- Tail Completion Eligible=no。
- Manifest status 不变。
- 仅返回 preview。

## Persisted Formal Gate Boundary

当用户明确要求持久化 Gate report：

- 只写 Gate report。
- 推荐 Manifest 更新。
- 不静默编辑 Manifest。

Persisted `PASS` 或有效 `PASS_WITH_RISK` 可以输出 Tail Completion Eligible=yes。

Manifest 只有记录以下内容后才能标记 completed：

- current Gate artifact path。
- current Gate Artifact Version。
- Gate result。
- completion_evidence。
- completion_decision_source。

Gate report 不能声称 Manifest 已完成未实际执行的更新。

## Result Rules

Use `PASS` when:

- Required evidence exists.
- No Critical issue exists.
- No unaccepted High issue exists.
- No required Re-Gate is missing.
- No current evidence is stale.

Use `PASS_WITH_RISK` when:

- No Critical issue exists.
- High issues exist.
- Complete risk acceptance exists.
- Re-Gate and stale checks are valid.
- No always-FAIL item from `references/risk-and-regate.md` is present.

Use `FAIL` when:

- Any Critical issue exists.
- Any unaccepted High issue exists.
- Required input is missing.
- Current evidence is stale.
- Required Re-Gate is missing.
- Existing required Gate result is `FAIL`.
- Any always-FAIL item from `references/risk-and-regate.md` is present.

Current / stale rules:

- Gate evidence must be current and non-stale.
- The reviewed artifact path and Version must match the Manifest current record.
- Upstream version changes make dependent conclusions stale; Re-Gate from the earliest affected node.
- `completion_decision_source` must point to a current Gate artifact path and current Gate Artifact Version.

## Manifest Update Recommendation

Recommend updates for:

- Artifact Index: current Gate report path and result.
- Gate Decisions: current Gate result and continuation decision.
- Activity Log: `sdlc-gate-runner` action.
- Blocking Issues: unresolved Critical and High issues.
- Missing Artifacts: missing manifest or node artifacts.
- Re-Gate Records: required or completed Re-Gate.
- Next Step: exact next action.
- Tail completion records: current Gate artifact path, current Gate Artifact Version, Gate result, `completion_evidence`, and `completion_decision_source`, only after the Gate report is actually persisted.

Do not silently edit `manifest.md` unless the user explicitly requests it.
