# Stable Artifact Versioning

## Purpose

This standard defines how DocFlow artifacts, Gate reports, review reports, and
process reports express versions.

The stable model is:

```text
stable file path + internal Version + revision history + manifest pointer
```

Do not create a new file only to express a new artifact version.

## Stable File Paths

Each DocFlow stage owns one stable current artifact file for a requirement.

| Stage | Stable file |
| --- | --- |
| 00 需求资料 | `{requirement_id}__需求摘要.md` |
| 01 技术方案 | `{requirement_id}__技术方案.md` |
| 02 方案审核 | `{requirement_id}__方案审核.md` |
| 03 实现记录 | `{requirement_id}__实现记录.md` |
| 04 代码审核 | `{requirement_id}__代码审核.md` |
| 05 测试验收 | `{requirement_id}__测试验收.md` |
| 测试反馈同步建议 | `{requirement_id}__测试反馈同步建议.md` |

HTML, Lark, PDF, or other rendered outputs may use the same stable base name
with the appropriate extension.

Forbidden official path pattern:

```text
{requirement_id}__{artifact_type}__vN.md  # forbidden
```

That pattern is allowed only in documentation that explicitly labels it as a
forbidden or legacy example.

## Scope And Exceptions

This versioning model applies to DocFlow requirement artifacts under
`library/{requirement_id}/`, including stage artifacts, Gate reports, reviews,
implementation records, test acceptance artifacts, and manifest files.

Tool execution audit reports are different. Immutable audit history under
`.specify/reports/**` may use timestamped filenames when the report is about a
tool run rather than a requirement-stage artifact. Those reports must not be
used as the current DocFlow artifact for a requirement stage.

## Internal Version

Every stable artifact must contain a Metadata section with an internal semantic
version:

```markdown
## Metadata

- Requirement ID: REQ-001
- Artifact Type: 技术方案
- Version: 1.2.0
- Status: draft / active / passed / failed / stale / replaced
- Updated At: 2026-07-01
```

Use semantic versioning:

| Change | Example | Use when |
| --- | --- | --- |
| PATCH | `1.0.1` | Correct wording, formatting, links, or non-semantic notes. |
| MINOR | `1.1.0` | Add details, exceptions, tests, or compatibility notes without changing the approved direction. |
| MAJOR | `2.0.0` | Change scope, behavior, implementation boundary, or a Gate-relevant decision. |

## Revision History

Each stable artifact must end with a revision history section.

```markdown
## 修订记录

| Version | Date | Author / Skill | Change Type | Summary | Re-Gate |
| --- | --- | --- | --- | --- | --- |
| 1.0.0 | 2026-07-01 | Codex | initial | Initial current artifact. | no |
```

Revision history records what changed. It does not preserve obsolete body
content.

## Current Body Rule

The body must contain only the current valid conclusion and current valid
implementation facts.

Do not keep obsolete alternatives in the body as `v1`, `v2`, or "old/new"
parallel sections. If an old design is no longer valid, remove it from the body
and record the change in `## 修订记录` and Git history.

## Review Binding

Review, Gate, code review, and test acceptance artifacts must bind to the
internal version they reviewed.

Required metadata fields:

```markdown
- Reviewed Artifact: 01-技术方案/REQ-001__技术方案.md
- Reviewed Artifact Version: 1.2.0
```

The review result is stale when the reviewed artifact path or reviewed artifact
version no longer matches the manifest current version.

## Re-Gate Rules

When an upstream artifact changes version, downstream artifacts must be checked
for staleness.

| Version change | Required action |
| --- | --- |
| Technical specification PATCH | Downstream Gate may remain valid if the change is non-semantic and recorded. |
| Technical specification MINOR | Solution review must confirm whether the reviewed version is still valid. |
| Technical specification MAJOR | Solution review, implementation record, code review, and test acceptance must be re-evaluated. |
| Implementation record version changes | Code review must confirm it reviewed the current implementation record version. |
| Code review changes to FAIL | Test acceptance and later sync/reconcile cannot mark the flow complete. |

Record every required re-Gate in `manifest.md`.

## Manifest Pointer

`manifest.md` records the current artifact pointer. It must not model multiple
current files for one stage.

Artifact Index fields:

```text
Node | Required | Directory | Path | Version | Status | Result | Updated At
```

`Path` is stable. `Version` is the internal document version. `Status` and
`Result` describe the current workflow state.

Historical changes belong in:

- `Activity Log`
- `Change History`
- `Re-Gate Records`
- Git history

Do not use replaced-path records for normal version increments of the same
stable file. Use `Replaced Artifact Paths` only when a path is replaced, an
artifact is split, or a legacy versioned file is migrated to the stable path
model.

## Agent-Neutral Production

No artifact type is bound to a specific Agent.

Any Agent or human may create, update, review, or publish an artifact when they
follow:

- stable file path rules
- internal Version rules
- revision history rules
- manifest path + version + status records
- Re-Gate rules

## Git History And Revision History

Git history stores the full file diff. Revision history stores the reader-facing
reason and workflow impact.

Use both:

- Git answers what exact text changed.
- `## 修订记录` answers why the artifact version changed and whether Re-Gate is
  required.
