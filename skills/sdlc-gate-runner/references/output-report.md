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

## Two-Stage Lifecycle

The Tail Completion Gate uses a two-stage lifecycle inside one call. Provisional and formal are execution concepts only; no new schema enum and no second result field are introduced, and `templates/gate-result-template.md` remains the only canonical output structure.

### Evidence Evaluation (Stage A)

Stage A evaluates all external completion evidence: Manifest Tail section, `03-实现记录`/`04-代码审核`/`05-测试验收` when actual implementation, Sync and Reconcile decisions, required conditional execution, applicable Entry Coverage, required Re-Gate, risk acceptance, and non-stale upstream evidence. The Gate report this call will generate is not an input of Stage A, and a persisted Gate artifact is not a required input of Stage A. First-run absence of the stable artifact is not a pre-evaluation failure.

### Provisional Evidence Result

Stage A outputs an internal provisional evidence result: `PASS`, `PASS_WITH_RISK`, or `FAIL`. The provisional result is not a formal Gate result, does not mark the Manifest Tail as completed, does not become `completion_decision_source`, and must not be presented as a persisted fact.

### Persist And Confirm (Stage B)

A formal `PASS` or valid `PASS_WITH_RISK` is formed only when the user explicitly authorized persistence, the provisional evidence result is `PASS` or valid `PASS_WITH_RISK`, the stable path and the next internal Version can be determined, the report content can be generated completely, the write succeeds, and the read back succeeds. The first formal run may create its own Gate artifact: the first stable path does not have to exist before the call starts; when it does not exist, this call creates and confirms it in the same run. Do not require a first `FAIL` run followed by a second `PASS` run, a manually pre-created empty Gate artifact, or a pre-filled fake completion source in the Manifest.

### Read Back And Verify

After writing, the report must be read back and verified: the file exists at the exact stable path; the content is readable; the Requirement ID, Gate Type, internal Version, Gate Artifact Version, Status, Reviewed Artifact path, Reviewed Artifact Version, Result, and `completion_evidence` are correct and consistent; `completion_decision_source` points exactly to the just-written stable path and the current Gate Artifact Version; the file is not stale or replaced; and no filename-versioned companion path exists.

### Formal Gate Result

Only read-back success establishes `completion_decision_source`: only after the read-back verification succeeds does the provisional `PASS` or valid `PASS_WITH_RISK` become the formal result, with Tail Completion Eligible=yes and Can Continue=yes, and the just-persisted, read-back-verified artifact becomes the formal completion source. An authorized persistence failure or a read-back failure is a formal FAIL: Result=FAIL, Can Continue=no, Tail Completion Eligible=no; the unverified file is not the current Gate artifact, and no Manifest completed recommendation is made.

## Response-Only Preview Boundary

Response-only 输出只能是 preview：

- 不得声称已存在 current persisted Gate artifact。
- 不得虚构 artifact path。
- 不得虚构 Version。
- 不得将 Manifest Tail 标为 completed。
- 不得成为 completion_decision_source。
- 不得输出正式 Tail completion PASS claim。

当用户未授权持久化 Gate report：

- response-only 的 canonical Result=FAIL。
- 将 persistence absence 记录为 blocking item。
- Can Continue=no。
- Tail Completion Eligible=no。
- Manifest status 不变。
- 仅返回 preview。

Response-only 不构成正式完成；不得建议 Manifest 直接标记 completed。不得新增 `PREVIEW` 作为 Result enum，不得新增第二个结果状态字段；provisional evidence result 是执行过程概念，不是新的 schema enum。

## Persisted Formal Gate Boundary

当用户明确要求持久化 Gate report：

- 只写 Gate report。
- 推荐 Manifest 更新。
- 不静默编辑 Manifest。

Formal `PASS` 或有效 `PASS_WITH_RISK` 只有在写入并回读验证成功后才能建立。写入后必须回读并验证：stable path 精确存在、内容可读、Requirement ID 正确、Gate Type 为 `documentation_governance_tail_completion`、internal Version 与 Gate Artifact Version 等于本次确定值、Status 与 Result 一致、Reviewed Artifact path/Version 正确、Result 等于 provisional evidence result、completion_evidence 存在、completion_decision_source 精确指向刚写入的 stable path 与当前 Gate Artifact Version、文件非 stale/replaced、无 filename-versioned companion path。

首次正式运行不要求调用开始时 stable path 已存在：只要用户已授权持久化、provisional result 可放行、stable path 与初始 Version 可确定、写入与回读成功，本次调用即可创建并确认自己的 Gate artifact 并形成正式结果。不得要求先运行一次 FAIL 再运行第二次 PASS，不得预先手工创建空 Gate artifact，不得预先在 Manifest 填写虚假 completion source。

Write/read-back failure 必须正式 FAIL：Result=FAIL、Can Continue=no、Tail Completion Eligible=no；未验证文件不得作为 current Gate artifact；不得建议 Manifest completed；必须报告 persistence/read-back blocker。

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
- Tail completion records: current Gate artifact path, current Gate Artifact Version, Gate result, `completion_evidence`, and `completion_decision_source`, only after the Gate report is persisted and read-back verified, and only after the formal Gate result is established.

Do not silently edit `manifest.md` unless the user explicitly requests it.
