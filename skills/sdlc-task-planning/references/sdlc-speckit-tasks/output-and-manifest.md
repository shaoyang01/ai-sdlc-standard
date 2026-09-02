> ⚠️ **已废弃（v2，Decision-084）**：本迁移参考件的目标 `specs/{feature}/tasks.md`
> 为 v1 事实源路径，v2 单轨链下 specs/** 不再承担事实源职责（artifact-flow
> 「历史产物的引用边界」）。canonical 模板 =
> `templates/task-plan-template.md`（library/{requirement_id}/03-任务规划/）。
> 本文件仅作迁移历史参考保留，禁止作为产出格式依据。

# Output And Manifest

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

## Tasks Output

Default target:

```text
specs/{feature}/tasks.md
```

Do not write production code.

Do not update `specs/{feature}/plan.md` in this skill.

## Tasks Template

```markdown
# Tasks: <Feature>

## Source Artifacts

- SpecKit Spec:
- SpecKit Plan:
- Technical Specification:
- Solution Review:
- Plan Gate:
- Manifest:

## Task List

- [ ] T001 <imperative action> | Scope: <file/module/artifact> | Source: <spec/plan/docflow section> | Depends on: <task id or none> | Verify: <check>

## Implementation Coverage

## Verification Coverage

## Dependency Order

## Task Gate
```

## Result Template

```markdown
# Speckit Tasks Result: <Requirement ID>

## Source Artifacts

- SpecKit Spec:
- SpecKit Plan:
- Technical Specification:
- Solution Review:
- Plan Gate:
- Manifest:

## Target

- Tasks:

## Task Coverage Summary

| Category | Status | Evidence | Action |
| --- | --- | --- | --- |

## Task Gate Result

## Blocking Items

## Re-Gate Recommendation

## Manifest Update Recommendation

## Next Step
```

## Manifest Recommendation

Recommend updates for:

- Activity Log: `sdlc-speckit-tasks`
- Related Specs Directory
- Artifact Index note linking `specs/{feature}/tasks.md`
- Re-Gate Records, if blocked
- Blocking Issues, if any
- Next Step: `sdlc-speckit-analyze` or upstream Re-Gate

Do not silently edit manifest unless explicitly requested.
