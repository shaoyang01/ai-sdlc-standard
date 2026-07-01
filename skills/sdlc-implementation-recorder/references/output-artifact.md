# Implementation Record Output Artifact

## Artifact Versioning Requirements

When this reference produces or updates a DocFlow requirement artifact under
`library/{requirement_id}/`, it must use a stable path and update the same file.
Do not create `__vN.md` or other filename-versioned artifacts.

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

## Default Path

When writing a local artifact, use:

```text
library/{requirement_id}/03-实现记录/{requirement_id}__实现记录.md
```

Update the stable artifact file and increment its internal Metadata Version instead of creating a versioned filename.

## Markdown Template

```markdown
# 实现记录: <Requirement ID>

## Metadata

- Requirement ID:
- Requirement Name:
- Artifact Type: 实现记录
- Version: 1.0.0
- Status: draft / active / stale / replaced
- Repository:
- Branch:
- Commit Range:
- Author / Skill:
- Created At:
- Updated At:
- Specification Artifact:
- Specification Artifact Version:
- Solution Review Artifact:
- Solution Review Artifact Version:
- Ready for Code Review: yes/no

## 实现范围

## 规格依据

| Artifact | Path / Reference | Version | Gate Result |
| --- | --- | --- | --- |

## 变更文件

| File | Symbol / Area | Change Summary | Specification Basis |
| --- | --- | --- | --- |

## 关键实现点

## 行为一致性检查

| Check | Result | Evidence | Notes |
| --- | --- | --- | --- |
| Scope aligned | yes/no |  |  |
| Original flow preserved | yes/no/not applicable |  |  |
| Failure strategy followed | yes/no/not applicable |  |  |
| Idempotency / retry / transaction followed | yes/no/not applicable |  |  |

## 方案偏离与分类

| Item | Classification | Impact | Required Action |
| --- | --- | --- | --- |

## 影响面

- API:
- DB:
- Cache:
- MQ:
- Schedule / Listener:
- Config:
- Log / Monitoring:
- Frontend:
- External dependency:

## 验证命令与结果

| Command / Check | Scope | Result | Evidence / Output Summary | Follow-up |
| --- | --- | --- | --- | --- |

## 未完成项

## 残余风险

## 回滚与兼容说明

## Manifest 更新建议

- Manifest Stable Path:
- Manifest Version:
- Manifest Status:

## 建议下一步

## 修订记录

| Version | Date | Author / Skill | Change Type | Summary | Re-Gate |
| --- | --- | --- | --- | --- | --- |
| 1.0.0 |  |  | initial | Initial implementation record. | no |
```

## Manifest Update Recommendation

Recommend these manifest updates when an artifact is written:

- Artifact Index: add or update `03 实现记录`.
- Activity Log: record implementation recording.
- Change History: record Specification Missing, Requirement Change, or Implementation Bug if discovered.
- Blocking Issues: record unresolved blockers.
- Missing Artifacts: record missing diff, specification, or verification evidence.
- Next Step: `Run sdlc-code-review-normalizer`, `Fix implementation bug`, or `Apply change-control and re-Gate`.

Do not silently edit `manifest.md` unless the user explicitly asks for file updates or output routing through `sdlc-docflow-writer`.

## Response Summary

When returning the result to the user, include:

- Requirement ID
- Whether a file was written
- Evidence sources used
- Verification result
- Ready for Code Review
- Blocking issues
- Recommended next step
