# Specification Writer Output Artifact

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

## Local Path

When writing a local artifact, use:

```text
library/{requirement_id}/01-技术方案/{requirement_id}__技术方案.md
```

Update the stable artifact file and increment its internal Metadata Version; preserve history in 修订记录 and Git history.

## Required Artifact Structure

Use `templates/technical-specification-template.md` as the minimum structure.
Every written specification artifact must include:

```markdown
## Metadata

- Requirement ID:
- Artifact Type: 技术方案
- Version: 1.0.0
- Status: draft / active / stale / replaced
- Author / Skill:
- Created At:
- Updated At:

## 修订记录

| Version | Date | Author / Skill | Change Type | Summary | Re-Gate |
| --- | --- | --- | --- | --- | --- |
| 1.0.0 |  |  | initial | Initial current artifact. | no |
```

The body must contain only the current effective specification. Do not create
`__vN.md` files for revisions.

## HTML or Lark/Feishu

When the requested output is HTML or Lark/Feishu:

1. Generate the specification content.
2. Use `sdlc-docflow-writer` for output routing, rendering, and publishing.
3. Keep semantic content unchanged during rendering.

## Manifest Update Recommendation

Recommend:

```text
Artifact Index:
  Node: 01 技术方案
  Path: library/{requirement_id}/01-技术方案/{requirement_id}__技术方案.md
  Version: <semantic-version>
  Result: draft / ready-for-review

Activity Log:
  Actor / Skill: sdlc-specification-writer
  Action: generate technical specification
  Node: 01-技术方案
  Result: ready-for-solution-review

Next Step:
  Run sdlc-solution-reviewer
```

## Ready-for-Review Criteria

A specification is ready for `sdlc-solution-reviewer` when:

- ESS required sections exist.
- Core Scope is clear.
- Original-flow compatibility is explicitly described.
- Failure and exception behavior are not hidden.
- Tests can validate the core requirement.
- Pending questions are listed honestly.

If these criteria are not met, either stop or mark the artifact as not ready for review.
