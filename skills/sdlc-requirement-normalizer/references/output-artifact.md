# Output Artifact

## Default Path

When writing a local artifact, use:

```text
library/{requirement_id}/00-需求资料/{requirement_id}__需求摘要.md
```

Update the stable artifact file and increment its internal Metadata Version instead of creating a versioned filename.

## Markdown Template

```markdown
# 需求摘要: <Requirement ID>

## 元信息

- Requirement ID:
- Requirement Name:
- Intake Classification: New Requirement / Requirement Supplement / Requirement Change / Rework / Feedback-Driven Change / Documentation Correction
- Created At:
- Updated At:
- Parsed By:
- Ready for sdlc-specification-writer: yes/no

## 原始来源

| Source ID | Type | Location / Reference | Captured At | Priority | Confidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| S1 |  |  |  |  | high / medium / low |  |

## 业务目标

## 用户意图

## 当前问题

## 初步 In Scope

## 初步 Out of Scope

## 成功标准草案

## 约束与非目标

## 不确定点

| Item | Impact | Required Confirmation |
| --- | --- | --- |

## 来源冲突

| Conflict | Sources | Impact | Required Decision |
| --- | --- | --- | --- |

## 待确认事项

## 变更/返工判断

- Classification:
- Existing Requirement ID:
- Earliest Affected Node:
- Re-Gate Required:
- Reason:

## 建议下一步
```

## Manifest Update Recommendation

Recommend these manifest updates when an artifact is written:

- Metadata: Requirement ID, Requirement Name, Created At, Current Stage.
- Artifact Index: add or update `00 需求资料`.
- Activity Log: record `Requirement Normalization`.
- Change History: record the change if classification is not `New Requirement`.
- Missing Artifacts: list missing inputs or downstream artifacts.
- Blocking Issues: record blocking conflicts or missing context.
- Next Step: `Run sdlc-specification-writer`, `Clarify requirement source`, or `Apply change-control and re-Gate`.

Do not silently edit `manifest.md` unless the user explicitly asks for file updates or output routing through `sdlc-docflow-writer`.

## Readiness Values

Use `Ready for sdlc-specification-writer: yes` only when no core-blocking uncertainty remains.

Use `Ready for sdlc-specification-writer: no` when:

- Business goal is unclear.
- Scope is unresolved.
- Source priority is unresolved.
- Required source is missing.
- A change requires upstream Re-Gate before a new specification can be written.

## Response Summary

When returning the result to the user, include:

- Requirement ID
- Intake classification
- Whether a file was written
- Ready for `sdlc-specification-writer`
- Blocking conflicts or missing context
- Recommended next step
