# Output Targets

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
- Status: current / stale / actionable（manifest 冻结映射词表；`draft`/`active`/`replaced` 已废止——loop-artifact-revision.md）
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

## Default Speckit Target

Write or recommend writing requirement-specific checklists under:

```text
specs/{feature}/checklists/{stage}-checklist.md
```

Use lowercase stage names such as:

- `specification-checklist.md`
- `plan-checklist.md`
- `task-checklist.md`
- `analyze-readiness-checklist.md`
- `implementation-readiness-checklist.md`
- `sync-readiness-checklist.md`
- `reconcile-readiness-checklist.md`

## DocFlow Target

Use DocFlow only when the checklist is a human handoff artifact:

```text
library/{requirement_id}/02-方案审核/
library/{requirement_id}/03-实现记录/
library/{requirement_id}/05-测试验收/
```

Do not create a new top-level `library/{requirement_id}/知识沉淀` directory.

## Write Authorization

Allowed without extra authorization:

- Produce checklist content in the assistant response.
- Recommend target path.
- Recommend manifest updates.

Require explicit user request to write:

- `specs/{feature}/checklists/**`.
- `library/{requirement_id}/**`.
- Any shared checklist under `checklists/**`.

## Shared Checklist Updates

Do not update `checklists/*.md` directly from one requirement.

Route reusable improvements through:

- `sdlc-test-feedback-sync` for test-derived gaps.
- `sdlc-speckit-sync` for verified reusable implementation facts.
- Standard governance review when the change affects all future requirements.
