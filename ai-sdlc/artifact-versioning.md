# Stable Artifact Versioning

> 状态：Draft（2026-08-22，C02-WP3.5 合同重基线，Decision-044/045；收口后升 Accepted）
> 关联：[Lifecycle](lifecycle.md) · [Artifact Flow](artifact-flow.md) · [Artifact Storage](artifact-storage.md) · [Phase Gates](phase-gates.md)

## Purpose

This standard defines how DocFlow artifacts, Gate reports, review reports, and
process reports express versions.

The stable model is:

```text
stable file path + internal Version + revision history + manifest pointer
```

Do not create a new file only to express a new artifact version.

The versioning model applies to the v2 single-rail seven-node chain
(`requirement-intake → solution-design → solution-gate → task-planning →
implementation → code-review → knowledge-sync`, Decision-044) plus the C03
Delivery Tail artifact. There is no separate Development Path / dual-rail
version semantics.

## Stable File Paths

Each DocFlow node owns one stable current artifact file for a requirement.

| Node | Stable file |
| --- | --- |
| 00 需求资料 (requirement-intake) | `{requirement_id}_需求摘要.md` |
| 01 技术方案 (solution-design) | `{requirement_id}_技术方案.md` |
| 02 方案审核 (solution-gate) | `{requirement_id}_方案审核.md` |
| 03 任务规划 (task-planning) | `{requirement_id}_任务计划.md` |
| 04 实现记录 (implementation) | `{requirement_id}_实现记录.md` |
| 05 代码审核 (code-review) | `{requirement_id}_代码审核.md` |
| 06 知识同步 (knowledge-sync) | `{requirement_id}_知识同步结果.md` |
| 07 交付总结 (C03 Delivery Tail) | `{requirement_id}_交付总结.md` |

The `07 交付总结` row is a Delivery Tail artifact, not a node artifact: it is
registered separately in the manifest and does not map to a node capability.

HTML, Lark, PDF, or other rendered outputs may use the same stable base name
with the appropriate extension.

Forbidden official path pattern:

```text
{requirement_id}_{artifact_type}_vN.md  # forbidden
```

That pattern is allowed only in documentation that explicitly labels it as a
forbidden or legacy example.

## Scope And Exceptions

This versioning model applies to DocFlow requirement artifacts under
`library/{requirement_id}/`, including stage artifacts, the solution-gate
report (Finding Ledger + formal verdict with Design Depth Decision), reviews,
implementation records, knowledge-sync results, Delivery Tail summaries, and
manifest files.

Tool execution audit reports are different. Immutable audit history for a tool
run is not a requirement-stage artifact and must not be used as the current
DocFlow artifact for a requirement node; such reports live outside the
stable-path model (for example, in the content-addressed evidence store).

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

A Design Depth Decision change (depth or decision_status) is a Gate-relevant
decision: it must be expressed through a new solution-gate verdict version, not
through an inline note.

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

Review, Gate, code review, and knowledge-sync artifacts must bind to the
internal version they reviewed.

Required metadata fields:

```markdown
- Reviewed Artifact: 01-技术方案/REQ-001_技术方案.md
- Reviewed Artifact Version: 1.2.0
```

The solution-gate report additionally binds:

```markdown
- Design Depth Decision: LIGHT / STANDARD / DEEP
- Depth Decision Status: DECIDED / BLOCKED_UNKNOWN
- Finding Ledger Reference: 02-方案审核/<path> (adversarial_scan 产出，正式裁决消费)
```

The review result is stale when the reviewed artifact path or reviewed artifact
version no longer matches the manifest current version, or when the bound
Design Depth Decision is stale.

## Re-Gate Rules

When an upstream artifact changes version, downstream artifacts must be checked
for staleness.

| Version change | Required action |
| --- | --- |
| 00 需求资料 MINOR/MAJOR（含反馈驱动变更开启新 generation） | 下游全部重新评估；重新生成或修订技术方案并重新过 solution-gate。 |
| Technical specification PATCH | Downstream Gate may remain valid if the change is non-semantic and recorded. |
| Technical specification MINOR | solution-gate formal_verdict must confirm whether the reviewed version is still valid. |
| Technical specification MAJOR | solution-gate（重新正式裁决与深度裁决）、task-planning、implementation record、code review、knowledge-sync must be re-evaluated. |
| Design Depth Decision 变化（depth 或 decision_status） | 必须重新正式裁决；`BLOCKED_UNKNOWN` 不进入实现。 |
| Implementation record version changes | Code review must confirm it reviewed the current implementation record version. |
| Code review changes to FAIL | knowledge-sync and Delivery Tail cannot mark the flow complete. |
| Knowledge-sync result version changes | Target knowledge updates must be cross-bound to the new revision and residual risks re-recorded. |

Record every required re-Gate in `manifest.md`.

## Manifest Pointer

`manifest.md` records the current artifact pointer. It must not model multiple
current files for one node.

Artifact Index fields:

```text
Node | Required | Directory | Path | Version | Status | Result | Updated At
```

`Path` is stable. `Version` is the internal document version. `Status` and
`Result` describe the current workflow state. Only v2 capability execution
produces revisions that can become current; the v1 `00/01/02` artifacts may be
referenced as historical input, and the v1 `03/04/05` artifacts stay
read-only history without automatic rename or promotion.

The Design Depth Decision is bound to the current `02-方案审核` version; a
stale depth decision does not admit downstream nodes.

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

The `solution-gate` role separation (adversarial_scan vs formal_verdict must be
executed by different Agent bindings) is a binding-layer constraint; it does
not change the versioning rules of the artifacts themselves.

## Git History And Revision History

Git history stores the full file diff. Revision history stores the reader-facing
reason and workflow impact.

Use both:

- Git answers what exact text changed.
- `## 修订记录` answers why the artifact version changed and whether Re-Gate is
  required.

## Revision Record

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 2.0.0 | 2026-08-22 | Draft | C02-WP3.5 重基线（Decision-044/045）：稳定路径表切换为 v2 七节点（00-06）+ C03 Delivery Tail（07）；删除测试反馈同步建议产物行与 Development Path/双轨版本语义；Re-Gate 表对齐设计深度裁决、反馈驱动变更入口与 knowledge-sync 版本绑定；solution-gate 报告增加深度裁决与 Finding Ledger 版本绑定字段。 |
